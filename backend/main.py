import os
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Relative imports - these work when running with 'python -m backend.main'
from .routers import vision
from .services.yolo_service import YOLOService
from .services.llama_service import LlamaService

# ─── LIFESPAN HANDLER ────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initializes AI models (YOLOv11 & Llama 3.2 Vision) at startup.
    This replaces the deprecated @app.on_event("startup").
    """
    print("🛡️  Starting PlateGuardian AI Services...")
    
    # Path logic: looks inside backend/weights/
    # Using absolute path logic to ensure Windows finds the file
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    yolo_path = os.path.join(base_dir, "backend", "weights", "yolo11n.pt")
    
    if not os.path.exists(yolo_path):
        print(f"❌ CRITICAL ERROR: Weights file NOT found at: {yolo_path}")
        app.state.yolo = None 
    else:
        try:
            app.state.yolo = YOLOService(model_path=yolo_path)
            print("✅ YOLOv11 Nano loaded successfully.")
        except Exception as e:
            print(f"❌ YOLO Load Error: {e}")
            app.state.yolo = None

    # Initialize Llama 3.2 Vision for Nutrition Analysis
    try:
        app.state.llama = LlamaService()
        print("✅ Llama 3.2 Vision service ready.")
    except Exception as e:
        print(f"❌ Llama Load Error: {e}")
        app.state.llama = None

    print("🚀 PlateGuardian Backend is LIVE and ready for requests.")
    
    yield  # --- Server remains active here ---
    
    print("🛑 Shutting down AI Services...")

# ─── APP CONFIGURATION ───────────────────────────────────────

app = FastAPI(
    title="PlateGuardian API", 
    description="Backend for AI-powered Nutrition Analyzer",
    lifespan=lifespan
)

# CORS Middleware: Essential for your Website (index.html) to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows your Live Server to connect
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the Vision Router
app.include_router(vision.router, prefix="/api/v1/vision", tags=["Vision"])

@app.get("/")
async def root():
    return {
        "project": "PlateGuardian",
        "status": "online",
        "version": "1.0.0"
    }

# ─── THE RUNNER (This keeps your terminal open) ────────────────
if __name__ == "__main__":
    # This keeps the terminal active and waits for your website to connect
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)