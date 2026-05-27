"""
PlateGuardian — LlamaService (Text-Optimized)
Calls Llama 3.2 (Text) running locally via Ollama's REST API.
This version removes image-bytes to prevent '400 Bad Request' on text-only models.
"""

from __future__ import annotations
import json
import httpx
from typing import Any

from ..models.schemas import BoundingBox, MacroTarget, NutritionResponse

_OLLAMA_CHAT_URL = "/api/chat"
# CHANGED: Using the standard text model to save RAM and prevent crashes
_MODEL = "llama3.2" 

class LlamaService:
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url.rstrip("/")
        # Increased timeout for slower laptop CPUs
        self._client = httpx.AsyncClient(timeout=120.0)

    # ── Internal (REMOVED IMAGE LOGIC) ────────────────────────────────────────
    async def _chat(
        self,
        prompt: str,
        system: str = "",
    ) -> str:
        """Send a text-only prompt to Ollama."""
        payload: dict[str, Any] = {
            "model":  _MODEL,
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user",   "content": prompt},
            ],
        }

        try:
            resp = await self._client.post(
                f"{self.base_url}{_OLLAMA_CHAT_URL}",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"]
        except Exception as e:
            print(f"Llama Service Error: {e}")
            return "ERROR"

    # ── Public: Choice Chips (BASED ON LABELS) ────────────────────────────────
    async def generate_choice_chips(
        self,
        detections: list[BoundingBox],
    ) -> list[str]:
        """
        Generates clarifying questions based on text labels identified by YOLO.
        """
        label_summary = ", ".join(
            f"{d.label}" for d in detections
        )

        system = (
            "You are a nutrition assistant. Generate 2-4 SHORT clarifying questions "
            "based on the food labels provided. Each question must have "
            "2–3 answer options separated by ' / '. "
            "Return ONLY a valid JSON array of strings. No prose."
        )

        prompt = (
            f"The camera detected: {label_summary}. "
            "What specific details (sauce, oil level, cooking style) are missing "
            "to calculate calories accurately? Return JSON array only."
        )

        raw = await self._chat(prompt, system)

        try:
            start = raw.index("[")
            end   = raw.rindex("]") + 1
            chips: list[str] = json.loads(raw[start:end])
        except (ValueError, json.JSONDecodeError):
            chips = [
                "Cooking method: Grilled / Fried / Steamed",
                "Portion Size: Small / Medium / Large",
                "Oil level: Low / Medium / High"
            ]

        return chips[:4]

    # ── Public: Plate Suggestion ──────────────────────────────────────────────
    async def generate_suggestion(
        self,
        meal_nutrition: NutritionResponse,
        target:         MacroTarget,
        goal:           str,
    ) -> tuple[str, float]:
        """
        Provides advice by comparing meal text-data against user goals.
        """
        meal = meal_nutrition.meal_total
        remaining_cal = target.calories - meal.calories
        remaining_pro = target.protein_g - meal.protein_g

        system = (
            "You are a certified nutritionist. Give ONE concise, encouraging, "
            "and specific dietary suggestion. Never exceed two sentences. "
            "Always mention a concrete food and quantity."
        )

        prompt = f"""
        User Goal: {goal}
        Meal Data: {meal.calories}kcal, {meal.protein_g}g Protein, {meal.carbs_g}g Carbs.
        Daily Targets: {target.calories}kcal, {target.protein_g}g Protein.
        
        Analyze these numbers. Give ONE sentence of specific advice.
        Then on a NEW line write ONLY: SCORE:<number 0-100>
        """

        raw = await self._chat(prompt, system)

        lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
        suggestion = lines[0] if lines else "Great choice! Keep monitoring your portions."
        score = 70.0 # Default

        for line in lines:
            if "SCORE:" in line.upper():
                try:
                    score = float(line.split(":")[1].strip())
                except: pass
                break

        return suggestion, min(max(score, 0.0), 100.0)