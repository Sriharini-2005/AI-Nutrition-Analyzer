"""
PlateGuardian — Onboarding Router
POST /api/v1/onboarding/register  → Create user + calculate TDEE/macros
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

# --- FIXED RELATIVE IMPORTS ---
from ..db.database import get_session, User
from ..models.schemas import OnboardingPayload, OnboardingResponse
# Added .. here because services is a sibling of db and models
from ..services.nutrition_calc import calculate_tdee, calculate_targets

router = APIRouter()

@router.post("/register", response_model=OnboardingResponse)
async def register(
    payload: OnboardingPayload,
    db:      AsyncSession = Depends(get_session),
):
    """
    Multi-step onboarding:
    1. Receive gender, age, weight, height, goal, activity
    2. Calculate BMR (Mifflin–St Jeor) → TDEE → macro targets
    3. Persist User row
    4. Return user_id + targets
    """
    bmr, tdee = calculate_tdee(payload)
    target    = calculate_targets(tdee, payload.goal)

    user = User(
        gender=payload.gender,
        age=payload.age,
        weight_kg=payload.weight_kg,
        height_cm=payload.height_cm,
        goal=payload.goal,
        activity=payload.activity,
        bmr=bmr,
        tdee=tdee,
        target_calories=target.calories,
        target_protein_g=target.protein_g,
        target_carbs_g=target.carbs_g,
        target_fat_g=target.fat_g,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return OnboardingResponse(
        user_id=user.id,
        tdee=tdee,
        bmr=bmr,
        target=target,
    )