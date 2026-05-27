"""
PlateGuardian — Check-in Router
POST /api/v1/checkin/submit  → Adaptive calorie recalculation every 2 weeks
GET  /api/v1/checkin/history → Return all check-ins for a user
"""

from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta

# --- FIXED RELATIVE IMPORTS ---
from ..db.database import get_session, User, CheckIn
from ..models.schemas import CheckInPayload, CheckInResponse, MacroTarget
from ..services.nutrition_calc import recalculate_after_checkin

router = APIRouter()

_TWO_WEEKS = timedelta(weeks=2)


@router.post("/submit", response_model=CheckInResponse)
async def submit_checkin(
    payload: CheckInPayload,
    db:      AsyncSession = Depends(get_session),
):
    """
    1. Fetch user + last check-in weight
    2. Calculate delta_kg
    3. Adaptive macro recalculation
    4. Persist CheckIn row + update User targets
    """
    result = await db.execute(select(User).where(User.id == payload.user_id))
    user: User | None = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Enforce 2-week minimum between check-ins
    last_ci_result = await db.execute(
        select(CheckIn)
        .where(CheckIn.user_id == payload.user_id)
        .order_by(CheckIn.checked_at.desc())
        .limit(1)
    )
    last_ci: CheckIn | None = last_ci_result.scalar_one_or_none()

    # Using datetime.now() for better local compatibility
    now = datetime.utcnow()

    if last_ci and (now - last_ci.checked_at) < _TWO_WEEKS:
        days_left = (_TWO_WEEKS - (now - last_ci.checked_at)).days
        raise HTTPException(
            status_code=429,
            detail=f"Check-in available in {days_left} day(s). Stay consistent! 💪"
        )

    # Weight delta from either last check-in or onboarding weight
    baseline = last_ci.weight_kg if last_ci else user.weight_kg
    delta_kg = round(payload.weight_kg - baseline, 2)

    current_target = MacroTarget(
        calories=user.target_calories,
        protein_g=user.target_protein_g,
        carbs_g=user.target_carbs_g,
        fat_g=user.target_fat_g,
    )

    new_target, message = recalculate_after_checkin(
        current_target=current_target,
        delta_kg=delta_kg,
        goal=user.goal,
    )

    # Persist check-in
    checkin = CheckIn(
        user_id=payload.user_id,
        weight_kg=payload.weight_kg,
        delta_kg=delta_kg,
        message=message,
        new_calories=new_target.calories,
        new_protein_g=new_target.protein_g,
        new_carbs_g=new_target.carbs_g,
        new_fat_g=new_target.fat_g,
    )
    db.add(checkin)

    # Update user targets
    user.weight_kg        = payload.weight_kg
    user.target_calories  = new_target.calories
    user.target_protein_g = new_target.protein_g
    user.target_carbs_g   = new_target.carbs_g
    user.target_fat_g     = new_target.fat_g

    await db.commit()

    return CheckInResponse(
        new_target=new_target,
        delta_kg=delta_kg,
        message=message,
    )


@router.get("/history/{user_id}")
async def checkin_history(user_id: str, db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(CheckIn)
        .where(CheckIn.user_id == user_id)
        .order_by(CheckIn.checked_at.asc())
    )
    return result.scalars().all()