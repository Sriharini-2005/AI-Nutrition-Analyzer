"""
PlateGuardian — Nutrition Router
POST /api/v1/nutrition/fetch  → Resolve detected labels + chip answers → macro values
"""

from __future__ import annotations
import os
import httpx
from fastapi import APIRouter, HTTPException

# --- FIXED RELATIVE IMPORT ---
from ..models.schemas import (
    NutritionRequest, NutritionResponse, FoodNutrition, MacroTarget
)

router = APIRouter()

# USDA FoodData Central (free API key from https://fdc.nal.usda.gov/api-key-signup)
_USDA_KEY  = os.getenv("USDA_API_KEY", "DEMO_KEY")
_USDA_BASE = "https://api.nal.usda.gov/fdc/v1"

# Hard-coded fallback table for offline / demo mode
_FALLBACK: dict[str, FoodNutrition] = {
    "rice":     FoodNutrition(food_name="White Rice",    serving_g=150, calories=195, protein_g=4,  carbs_g=43, fat_g=0.4),
    "chicken": FoodNutrition(food_name="Grilled Chicken", serving_g=100, calories=165, protein_g=31, carbs_g=0,  fat_g=3.6),
    "salad":    FoodNutrition(food_name="Mixed Salad",  serving_g=80,  calories=20,  protein_g=1,  carbs_g=3,  fat_g=0.2),
    "egg":      FoodNutrition(food_name="Boiled Egg",   serving_g=50,  calories=78,  protein_g=6,  carbs_g=0.6,fat_g=5.3),
    "bread":    FoodNutrition(food_name="Whole Wheat Bread", serving_g=30, calories=75, protein_g=3, carbs_g=14, fat_g=1.0),
    "banana":   FoodNutrition(food_name="Banana",       serving_g=118, calories=105, protein_g=1.3,carbs_g=27, fat_g=0.4),
}


async def _fetch_usda(query: str) -> FoodNutrition | None:
    """Call USDA FoodData Central search API and parse the top result."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{_USDA_BASE}/foods/search",
                params={"query": query, "pageSize": 1, "api_key": _USDA_KEY},
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("foods"):
                return None
            food = data["foods"][0]
            nutrients = {n["nutrientName"]: n["value"] for n in food.get("foodNutrients", [])}
            return FoodNutrition(
                food_name=food.get("description", query),
                serving_g=100,
                calories=int(nutrients.get("Energy", 0)),
                protein_g=round(nutrients.get("Protein", 0), 1),
                carbs_g=round(nutrients.get("Carbohydrate, by difference", 0), 1),
                fat_g=round(nutrients.get("Total lipid (fat)", 0), 1),
            )
    except Exception:
        return None


def _chip_modifier(item: FoodNutrition, chip_answers: list) -> FoodNutrition:
    """
    Apply simple multipliers based on chip answers
    (e.g. Heavy oil → +30 kcal, Fried → +40 kcal, etc.)
    """
    cal_mult = 1.0
    for ca in chip_answers:
        ans = ca.answer.lower()
        q   = ca.chip_question.lower()

        if "oil" in q:
            if "heavy" in ans:   cal_mult *= 1.25
            elif "medium" in ans: cal_mult *= 1.12
        if "frie" in ans:        cal_mult *= 1.20
        if "cream" in ans or "full-fat" in ans: cal_mult *= 1.15
        if "light" in ans:       cal_mult *= 0.92

    return FoodNutrition(
        food_name=item.food_name,
        serving_g=item.serving_g,
        calories=int(item.calories * cal_mult),
        protein_g=item.protein_g,
        carbs_g=item.carbs_g,
        fat_g=round(item.fat_g * cal_mult, 1),
    )


@router.post("/fetch", response_model=NutritionResponse)
async def fetch_nutrition(payload: NutritionRequest):
    """
    For each detected label:
    1. Try USDA FoodData API
    2. Fall back to local table
    3. Apply chip-answer modifiers
    Aggregate into meal totals.
    """
    items: list[FoodNutrition] = []

    for label in set(payload.detected_labels):
        food = await _fetch_usda(label)
        if food is None:
            food = _FALLBACK.get(label.lower())
        if food is None:
            # Last resort: generic 150 kcal placeholder
            food = FoodNutrition(
                food_name=label.capitalize(),
                serving_g=100, calories=150,
                protein_g=5, carbs_g=20, fat_g=4,
            )

        food = _chip_modifier(food, payload.chip_answers)
        items.append(food)

    total = MacroTarget(
        calories=sum(i.calories for i in items),
        protein_g=int(sum(i.protein_g for i in items)),
        carbs_g=int(sum(i.carbs_g for i in items)),
        fat_g=int(sum(i.fat_g for i in items)),
    )

    return NutritionResponse(items=items, meal_total=total)