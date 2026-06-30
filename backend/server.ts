import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Ensure the Gemini API key is available
const apiKey = process.env.GEMINI_API_KEY;

// Initialize Gemini client (server-side only)
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON body parser with comfortable size limit for base64 images
  app.use(express.json({ limit: "15mb" }));

  // API Route: Stage 1 - Detect food ingredients & generate questions
  app.post("/api/detect-food", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not configured. Please add it in settings.",
        });
      }

      const { image, mimeType } = req.body;
      if (!image || !mimeType) {
        return res.status(400).json({ error: "Missing image or mimeType in request body." });
      }

      // Remove prefix (e.g. data:image/png;base64,) if present
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

      const prompt = `Analyze this meal photo. Detect the major food components/items on the plate. For each item, estimate its location on the image as a normalized bounding box (x, y, w, h, as numbers between 0.0 and 1.0 representing top-left coordinates, width, and height. Make sure the boxes represent the food item's layout reasonably). Also, generate 3-4 quick multiple-choice questions to help refine the cooking method, oil level, sauce type, or portion sizes for more accurate nutritional estimation. Ensure you return valid JSON following the schema.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    conf: { type: Type.NUMBER },
                    x: { type: Type.NUMBER, description: "Left coordinate (0-1) of bounding box" },
                    y: { type: Type.NUMBER, description: "Top coordinate (0-1) of bounding box" },
                    w: { type: Type.NUMBER, description: "Width (0-1) of bounding box" },
                    h: { type: Type.NUMBER, description: "Height (0-1) of bounding box" },
                    color: { type: Type.STRING, description: "Suggested hex color for this bounding box" }
                  },
                  required: ["label", "conf", "x", "y", "w", "h", "color"]
                }
              },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    q: { type: Type.STRING, description: "Question text, e.g. 'How was the chicken prepared?'" },
                    opts: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["q", "opts"]
                }
              }
            },
            required: ["detections", "questions"]
          }
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response received from Gemini.");
      }

      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (error: any) {
      console.error("Error in /api/detect-food:", error);
      res.status(500).json({ error: error.message || "An error occurred during food detection." });
    }
  });

  // API Route: Stage 2 - Calculate accurate nutrition details
  app.post("/api/calculate-nutrition", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not configured. Please add it in settings.",
        });
      }

      const { image, mimeType, detections, answers, profile } = req.body;
      if (!image || !mimeType) {
        return res.status(400).json({ error: "Missing image or mimeType." });
      }

      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

      const prompt = `Calculate the nutritional breakdown for this meal image.
      The detected food items are: ${JSON.stringify(detections)}.
      The user answered the following preparation questions: ${JSON.stringify(answers)}.
      The user profile and goals are: ${JSON.stringify(profile)}.
      Calculate the weight in grams (g), calories (kcal), protein (g), carbs (g), and fat (g) for each ingredient item. Ensure they are calculated accurately based on typical values and the user's details.
      Compute a balanced plate score (0 to 100) based on the 2:1:1 rule (half vegetables/fruits, quarter lean protein, quarter complex carbohydrates).
      Generate a customized, highly specific and actionable positive AI suggestion on how to improve this plate's nutrition or keep it optimal based on their profile, active goal, and daily target of ${profile?.targets?.calories || 2000} kcal/day. 
      Ensure you return valid JSON matching the schema.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Name of the ingredient item" },
                    g: { type: Type.NUMBER, description: "Estimated portion weight in grams" },
                    cal: { type: Type.NUMBER, description: "Calories in kcal" },
                    p: { type: Type.NUMBER, description: "Protein in grams" },
                    c: { type: Type.NUMBER, description: "Carbohydrates in grams" },
                    f: { type: Type.NUMBER, description: "Fat in grams" },
                    color: { type: Type.STRING, description: "Matches the bounding box color hex code" }
                  },
                  required: ["name", "g", "cal", "p", "c", "f", "color"]
                }
              },
              plateScore: { type: Type.INTEGER, description: "Plate score from 0 to 100" },
              suggestion: { type: Type.STRING, description: "Personalized actionable feedback or suggestion" }
            },
            required: ["items", "plateScore", "suggestion"]
          }
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response received from Gemini.");
      }

      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (error: any) {
      console.error("Error in /api/calculate-nutrition:", error);
      res.status(500).json({ error: error.message || "An error occurred during nutrition calculation." });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
