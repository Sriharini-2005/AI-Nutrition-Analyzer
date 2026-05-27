from __future__ import annotations
from fastapi import APIRouter, UploadFile, File, Form, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

# --- RELATIVE IMPORTS ---
from ..db.database import get_session, User
from ..models.schemas import (
    DetectResponse, SuggestRequest, SuggestResponse, MacroTarget
)

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
#  POST /detect - YOLO + Llama Chips
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/detect", response_model=DetectResponse)
async def detect(
    request: Request,
    image: UploadFile = File(...),
    user_id: str = Form("guest"),
    db: AsyncSession = Depends(get_session)
):
    # 1. Image Format Check
    if image.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=415, detail="Unsupported image format")

    image_bytes = await image.read()

    # 2. YOLO Detection
    # Access the model initialized in main.py
    yolo = getattr(request.app.state, 'yolo', None)
    if not yolo:
        raise HTTPException(status_code=503, detail="YOLO service is offline")
        
    detections, thumb_b64 = yolo.detect(image_bytes)

    # 3. Handle 'No Food Found' Gracefully
    if not detections:
        return DetectResponse(
            detections=[],
            choice_chips=[], # MUST be an empty list
            image_b64_thumb=""
        )

    # 4. Llama Choice Chips (The 'Quick Questions')
    llama = getattr(request.app.state, 'llama', None)
    validated_chips = []
    
    if llama:
        try:
            raw_chips = await llama.generate_choice_chips(detections)
            # Ensure raw_chips is a list so the website's map() works
            if isinstance(raw_chips, list):
                for chip in raw_chips:
                    if isinstance(chip, dict) and "q" in chip:
                        validated_chips.append({
                            "q": str(chip.get("q", "Question")),
                            "opts": list(chip.get("opts", []))
                        })
        except Exception as e:
            print(f"⚠️ Llama Processing Error: {e}")
            validated_chips = [] # Fallback to empty list

    return DetectResponse(
        detections=detections,
        choice_chips=validated_chips,
        image_b64_thumb=thumb_b64 or ""
    )

# ─────────────────────────────────────────────────────────────────────────────
#  POST /suggest - Final Nutrition Calculation
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/suggest", response_model=SuggestResponse)
async def suggest(
    request: Request,
    payload: SuggestRequest,
    db: AsyncSession = Depends(get_session)
):
    # Fetch user for personalized targets
    try:
        result = await db.execute(select(User).where(User.id == payload.user_id))
        user = result.scalar_one_or_none()
    except Exception:
        user = None

    # Default macros (2000 kcal standard)
    target = MacroTarget(calories=2000, protein_g=150, carbs_g=200, fat_g=67)
    goal = "maintain"

    if user:
        target = MacroTarget(
            calories=user.target_calories,
            protein_g=user.target_protein_g,
            carbs_g=user.target_carbs_g,
            fat_g=user.target_fat_g
        )
        goal = user.goal

    # Generate the AI suggestion using Llama 3.2 Vision
    llama = getattr(request.app.state, 'llama', None)
    if not llama:
         raise HTTPException(status_code=503, detail="Llama service offline")

    suggestion, plate_score = await llama.generate_suggestion(
        meal_nutrition=payload.meal_nutrition,
        target=target,
        goal=goal
    )

    # Calculate deficit/surplus
    meal_cals = payload.meal_nutrition.meal_total.calories
    diff = meal_cals - (target.calories // 3)

    return SuggestResponse(
        suggestion=suggestion,
        plate_score=plate_score,
        deficit_surplus_kcal=diff
    )