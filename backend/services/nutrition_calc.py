"""
PlateGuardian — NutritionCalcService
Pure-Python calorie math: BMR → TDEE → macro targets → check-in adjustment.
"""

from __future__ import annotations
import math
from ..models.schemas import MacroTarget, OnboardingPayload


# Activity multipliers (Mifflin–St Jeor activity factors)
_ACTIVITY = {
    "sedentary":   1.2,
    "light":       1.375,
    "moderate":    1.55,
    "active":      1.725,
    "very_active": 1.9,
}

# Goal calorie adjustments
_GOAL_DELTA = {
    "lose":     -500,
    "gain":     +300,
    "maintain":    0,
}

# Macro split (protein / fat / carbs as % of target calories)
_MACRO_SPLIT = {
    "lose":     (0.35, 0.30, 0.35),
    "gain":     (0.30, 0.25, 0.45),
    "maintain": (0.30, 0.30, 0.40),
}


def calculate_tdee(payload: OnboardingPayload) -> tuple[int, int]:
    """
    Returns (bmr, tdee) in kcal using Mifflin–St Jeor.
    """
    w, h, a = payload.weight_kg, payload.height_cm, payload.age

    if payload.gender == "male":
        bmr = 10 * w + 6.25 * h - 5 * a + 5
    else:
        bmr = 10 * w + 6.25 * h - 5 * a - 161

    tdee = bmr * _ACTIVITY.get(payload.activity, 1.55)
    return int(round(bmr)), int(round(tdee))


def calculate_targets(tdee: int, goal: str) -> MacroTarget:
    """
    Apply goal delta to TDEE, then split into macros.
    """
    target_kcal = max(1200, tdee + _GOAL_DELTA.get(goal, 0))

    p_pct, f_pct, c_pct = _MACRO_SPLIT.get(goal, (0.30, 0.30, 0.40))

    # 1 g protein = 4 kcal, 1 g fat = 9 kcal, 1 g carb = 4 kcal
    protein_g = math.ceil(target_kcal * p_pct / 4)
    fat_g     = math.ceil(target_kcal * f_pct / 9)
    carbs_g   = math.ceil(target_kcal * c_pct / 4)

    return MacroTarget(
        calories=target_kcal,
        protein_g=protein_g,
        carbs_g=carbs_g,
        fat_g=fat_g,
    )


def recalculate_after_checkin(
    current_target: MacroTarget,
    delta_kg: float,
    goal: str,
    weeks: int = 2,
) -> tuple[MacroTarget, str]:
    """
    Adaptive re-targeting logic.
    Called every 2-week check-in.

    - No progress toward goal  → adjust ±100 kcal
    - Overshooting             → ease back
    - On track                 → keep same
    """
    expected_delta = {"lose": -0.5 * weeks, "gain": 0.25 * weeks, "maintain": 0.0}[goal]
    actual         = delta_kg

    diff = actual - expected_delta

    if abs(diff) < 0.2:
        # On track — no change
        message = "You're right on track! Keep up the great work. 🎯"
        new_calories = current_target.calories
    elif (goal == "lose" and diff > 0.2) or (goal == "gain" and diff < -0.2):
        # Not enough progress
        adjust  = -150 if goal == "lose" else +150
        message = (
            f"Progress is a bit slow. Adjusting your target by {adjust:+d} kcal. "
            "Small consistent steps add up!"
        )
        new_calories = max(1200, current_target.calories + adjust)
    else:
        # Too fast / overshooting
        adjust  = +100 if goal == "lose" else -100
        message = (
            f"Excellent progress! Easing your target slightly ({adjust:+d} kcal) "
            "to keep things sustainable."
        )
        new_calories = current_target.calories + adjust

    # Re-derive macros from new calorie target
    new_target = calculate_targets(new_calories, goal)
    return new_target, message
