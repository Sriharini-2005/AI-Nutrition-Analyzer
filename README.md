<div align="center">

<img src="https://img.shields.io/badge/PlateGuardian-AI%20Nutrition-00e5a0?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJMNCAyMGgxNkwxMiAyeiIvPjwvc3ZnPg==" alt="PlateGuardian"/>

# 🛡️ PlateGuardian

### AI-Powered Personalised Nutrition Analysis

**Scan your plate → Detect every ingredient → Get a plan that adapts to you**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React Native](https://img.shields.io/badge/React_Native-0.74-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev)
[![YOLOv11](https://img.shields.io/badge/YOLOv11-Nano-FF6B35?style=flat-square)](https://github.com/ultralytics/ultralytics)
[![Llama](https://img.shields.io/badge/Llama_3.2-Vision-7C3AED?style=flat-square)](https://ollama.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[Demo](#demo) · [Features](#features) · [Architecture](#architecture) · [Setup](#setup) · [API Reference](#api-reference)

</div>

---

## 📖 Overview

PlateGuardian is a full-stack AI nutrition app that combines **computer vision** and **multimodal LLM reasoning** to give you instant, accurate nutritional analysis from a single photo of your meal.

Point your camera at your plate. YOLOv11 Nano detects every food item in real time and draws bounding boxes around each one. Llama 3.2 Vision then asks you a few smart follow-up questions (oil level, cooking method, sauce type) to nail the calorie estimate. You get a full macro breakdown, a balanced-plate score, and a one-sentence actionable suggestion — all in under 5 seconds.

Every two weeks, PlateGuardian checks your weight progress and **automatically recalibrates** your calorie and macro targets so your plan always stays effective.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎯 **TDEE Onboarding** | Multi-step form calculates your BMR, TDEE, and personalised macro targets using Mifflin-St Jeor |
| 🔍 **Real-time Detection** | YOLOv11 Nano identifies every ingredient with bounding boxes and confidence scores |
| 🤔 **Verification Chips** | Llama 3.2 Vision generates smart clarifying questions rendered as one-tap chip buttons |
| 🧮 **Accurate Nutrition** | USDA FoodData Central API lookup with chip-answer calorie modifiers (cooking method, oil, sauces) |
| ⚖️ **Balanced Plate Score** | 0–100 score based on the 2:1:1 rule (½ veg · ¼ protein · ¼ carbs) |
| 💡 **AI Suggestions** | One-sentence, food-specific advice to improve your plate |
| 📊 **Daily Dashboard** | Animated donut rings tracking calories, protein, carbs, fat vs daily targets |
| 🔄 **Adaptive Recalibration** | Auto-adjusts your calorie target every 14 days based on real weight progress |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   CLIENT LAYER                          │
│  React Web (index.html)  ·  React Native (Expo)         │
│  Onboarding · Scan · Dashboard · 14-day Check-in        │
└────────────────────┬────────────────────────────────────┘
                     │  HTTP / multipart
┌────────────────────▼────────────────────────────────────┐
│                 FASTAPI BACKEND                         │
│  /onboarding  /vision/detect  /vision/suggest           │
│  /nutrition/fetch  /checkin/submit                      │
└───────┬──────────────────────────┬──────────────────────┘
        │                          │
┌───────▼──────────┐   ┌───────────▼──────────────────────┐
│  YOLOv11 Nano    │   │     Llama 3.2 Vision             │
│  (Ultralytics)   │   │     (Ollama REST API)            │
│                  │   │                                  │
│  BBoxes + labels │──▶│  Choice chips + Suggestion       │
│  OpenCV annot.   │   │  Plate score (2:1:1 rule)        │
└──────────────────┘   └──────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────┐
│                     DATA LAYER                           │
│  SQLite / PostgreSQL (SQLAlchemy async)                  │
│  users · meal_logs · checkin_history                     │
│                          +                               │
│  USDA FoodData Central API  (nutrition lookup)           │
└──────────────────────────────────────────────────────────┘
```

### Full Scan Flow

```
User uploads photo
       │
       ▼  POST /vision/detect
  YOLOv11 Nano ──────────────────► BoundingBox list {x,y,w,h,label,conf}
       │                                    +
       │                           Annotated PNG thumbnail (base64)
       │
       ▼  (labels + image → Ollama)
  Llama 3.2 Vision ──────────────► Choice Chip questions (JSON array)
       │
       ▼  User taps chip answers
       │
       ▼  POST /nutrition/fetch
  USDA FoodData API ─────────────► Per-item nutrition
       +  Chip modifiers                    │
       (oil ×1.28, fried ×1.22 …)          ▼
                                    Meal total macros
       │
       ▼  POST /vision/suggest
  Llama 3.2 Vision ──────────────► One-sentence suggestion
                                  + Plate score 0–100
       │
       ▼
  Persisted to meal_logs table
```

---

## 🗂️ Project Structure

```
plateguardian/
│
├── backend/                        # Python / FastAPI
│   ├── main.py                     # App entry point, lifespan, routers
│   ├── requirements.txt
│   │
│   ├── models/
│   │   └── schemas.py              # All Pydantic v2 request/response models
│   │
│   ├── routers/
│   │   ├── onboarding.py           # POST /register  GET /profile/:id
│   │   ├── vision.py               # POST /detect    POST /suggest
│   │   ├── nutrition.py            # POST /fetch     GET /logs/:id
│   │   ├── checkin.py              # POST /submit    GET /history/:id
│   │   └── extras.py               # Additional read endpoints
│   │
│   ├── services/
│   │   ├── yolo_service.py         # YOLOv11 Nano wrapper + OpenCV annotation
│   │   ├── llama_service.py        # Ollama REST client (chips + suggestion)
│   │   └── nutrition_calc.py       # BMR → TDEE → macros · adaptive recalc
│   │
│   ├── db/
│   │   └── database.py             # SQLAlchemy async ORM + table definitions
│   │
│   └── weights/                    # YOLO model weights (git-ignored)
│       └── yolo11n.pt              # Auto-downloaded on first run
│
├── frontend/                       # React Native (Expo)
│   ├── App.tsx                     # Root navigator + onboarding gate
│   ├── package.json
│   └── components/
│       ├── OnboardingScreen.tsx    # 5-step health profile form
│       ├── DashboardScreen.tsx     # Macro rings + meal log
│       ├── ScanScreen.tsx          # Camera + bbox SVG overlay + chips
│       └── CheckInScreen.tsx       # Weight trend chart + adaptive result
│
├── frontend-web/
│   └── index.html                  # Standalone React web app (no build tools)
│
├── docs/
│   └── database_schema.json        # Annotated schema with sample rows
│
├── .gitignore
└── README.md
```

---

## ⚙️ Setup

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | ≥ 3.11 | Backend runtime |
| Node.js | ≥ 20 | Frontend tooling |
| Ollama | latest | Local Llama inference |
| Expo CLI | latest | React Native dev server |

---

### 1 — Clone the repo

```bash
git clone https://github.com/your-username/plateguardian.git
cd plateguardian
```

---

### 2 — Pull the Llama 3.2 Vision model

```bash
# Install Ollama: https://ollama.com/download
ollama pull llama3.2-vision

# Verify
ollama run llama3.2-vision "Describe what you see." --image ./docs/sample_plate.jpg
```

> **Note:** The model is ~7 GB. Ollama automatically uses Metal (macOS) or CUDA (Linux/Windows) if available.

---

### 3 — Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate       # macOS / Linux
# .venv\Scripts\activate        # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment (copy and edit)
cp .env.example .env
# Set USDA_API_KEY (free at https://fdc.nal.usda.gov/api-key-signup)
```

**`.env` file:**
```env
USDA_API_KEY=your_key_here
OLLAMA_BASE_URL=http://localhost:11434
YOLO_MODEL_PATH=weights/yolo11n.pt
DATABASE_URL=sqlite+aiosqlite:///./plateguardian.db
```

```bash
# Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Visit **http://localhost:8000/docs** for the interactive Swagger UI.

> On first start, Ultralytics auto-downloads `yolo11n.pt` (~5 MB) into `weights/` if not present.

---

### 4 — React Native (Mobile)

```bash
cd frontend
npm install

# Edit API_BASE in each screen component:
# const API_BASE = 'http://YOUR_LAN_IP:8000/api/v1';
# (Use your machine's LAN IP — not localhost — for physical device testing)

npx expo start
# Press 'a' for Android emulator
# Press 'i' for iOS simulator
# Scan QR code with Expo Go on your phone
```

---

### 5 — React Web (Browser)

No build step needed — just open the file:

```bash
# Option A: direct open
open frontend-web/index.html

# Option B: serve locally
npx serve frontend-web
# → http://localhost:3000
```

To connect to your backend, edit line 4 of `index.html`:
```js
const API_BASE = 'http://localhost:8000/api/v1';
```

---

## 🗄️ Database Schema

Three tables managed by SQLAlchemy async + SQLite (swap to PostgreSQL for production):

```
users
 ├── id, created_at
 ├── gender, age, weight_kg, height_cm, goal, activity
 ├── bmr, tdee                          ← calculated on onboarding
 └── target_calories, target_protein_g, target_carbs_g, target_fat_g

meal_logs
 ├── id, user_id → users.id, logged_at
 ├── detections_json                    ← raw YOLO output
 ├── chip_answers_json                  ← user's verification answers
 ├── meal_calories, meal_protein_g, meal_carbs_g, meal_fat_g
 ├── suggestion                         ← Llama one-sentence output
 └── plate_score                        ← 0–100 balance score

checkin_history
 ├── id, user_id → users.id, checked_at
 ├── weight_kg, delta_kg
 ├── message                            ← adaptive recalibration message
 └── new_calories, new_protein_g, new_carbs_g, new_fat_g
```

See [`docs/database_schema.json`](docs/database_schema.json) for annotated field descriptions and sample rows.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/onboarding/register` | Create user, calculate TDEE + macros |
| `GET` | `/api/v1/onboarding/profile/{user_id}` | Fetch user health profile |
| `POST` | `/api/v1/vision/detect` | Run YOLOv11 + generate Llama choice chips |
| `POST` | `/api/v1/vision/suggest` | Llama plate suggestion + score |
| `POST` | `/api/v1/nutrition/fetch` | USDA nutrition lookup with chip modifiers |
| `GET` | `/api/v1/nutrition/logs/{user_id}` | Paginated meal history |
| `POST` | `/api/v1/checkin/submit` | Weight check-in + adaptive recalibration |
| `GET` | `/api/v1/checkin/history/{user_id}` | All past check-ins |

### Example: `/vision/detect`

**Request** (`multipart/form-data`)
```
image:   <JPEG/PNG file>
user_id: "a3f2e1d0-..."
```

**Response**
```json
{
  "detections": [
    { "label": "Grilled Chicken", "conf": 0.93, "x": 0.08, "y": 0.12, "w": 0.30, "h": 0.38 },
    { "label": "White Rice",      "conf": 0.88, "x": 0.44, "y": 0.08, "w": 0.28, "h": 0.45 }
  ],
  "choice_chips": [
    "Cooking method: Grilled / Fried / Steamed / Baked",
    "Oil level: None / Light / Medium / Heavy",
    "Sauce type: Tomato-based / Cream-based / No sauce"
  ],
  "image_b64_thumb": "iVBORw0KGgo..."
}
```

---

## 🔄 Adaptive Recalibration Logic

Every 14 days, PlateGuardian compares your actual weight change to the expected rate:

| Goal | Expected Δ / 2 weeks | No Progress → | Too Fast → |
|---|---|---|---|
| Lose | −1.0 kg | −150 kcal/day | +100 kcal/day |
| Gain | +0.5 kg | +150 kcal/day | −100 kcal/day |
| Maintain | 0 kg | No change | No change |

If you're on track (within ±0.3 kg of expected), targets stay the same.

---

## 🚀 Production Deployment

### Switch to PostgreSQL
```python
# backend/db/database.py
DATABASE_URL = "postgresql+asyncpg://user:password@host/plateguardian"
```

### Docker (backend)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### GPU acceleration
- **YOLO:** Ultralytics auto-detects CUDA — no code change needed
- **Llama:** Ollama uses Metal (macOS) or CUDA automatically

### Auth
Add JWT middleware to FastAPI and store `user_id` in a signed token instead of AsyncStorage. Recommended: `python-jose` + `passlib`.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, FastAPI, Uvicorn |
| **Vision Model** | YOLOv11 Nano (Ultralytics) |
| **LLM** | Llama 3.2 Vision via Ollama |
| **Image Processing** | OpenCV |
| **Database** | SQLite → PostgreSQL, SQLAlchemy 2 async |
| **Mobile Frontend** | React Native 0.74, Expo 51 |
| **Web Frontend** | React (vanilla HTML/CSS/JS, no build step) |
| **Nutrition Data** | USDA FoodData Central API |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Built with ❤️ using YOLOv11 · Llama 3.2 Vision · FastAPI · React Native

</div>
