"""
PlateGuardian — Pydantic Models
All request/response schemas used across the API.
"""

from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


# ── Onboarding ────────────────────────────────────────────────────────────────

class OnboardingPayload(BaseModel):
    gender:      Literal["male", "female", "other"]
    age:         int    = Field(..., ge=10, le=120)
    weight_kg:   float  = Field(..., ge=20,  le=300)
    height_cm:   float  = Field(..., ge=100, le=250)
    goal:        Literal["lose", "gain", "maintain"]
    activity:    Literal["sedentary", "light", "moderate", "active", "very_active"] = "moderate"

class MacroTarget(BaseModel):
    calories:   int
    protein_g:  int
    carbs_g:    int
    fat_g:      int

class OnboardingResponse(BaseModel):
    user_id:     str
    tdee:        int
    target:      MacroTarget
    bmr:         int


# ── Vision / Detection ────────────────────────────────────────────────────────

class BoundingBox(BaseModel):
    x:     float   # top-left x (0–1 relative to image width)
    y:     float   # top-left y (0–1 relative to image height)
    w:     float   # width  (0–1)
    h:     float   # height (0–1)
    label: str
    conf:  float = Field(..., ge=0.0, le=1.0)

class ChoiceChip(BaseModel):
    q: str
    opts: list[str] = Field(default_factory=list)

class DetectResponse(BaseModel):
    detections:       list[BoundingBox]
    choice_chips:     list[ChoiceChip]    # Llama-generated clarifying questions
    image_b64_thumb:  Optional[str] = None  # annotated thumbnail (base64 PNG)


# ── Nutrition Fetch ───────────────────────────────────────────────────────────

class ChipAnswer(BaseModel):
    chip_question: str
    answer:        str

class NutritionRequest(BaseModel):
    user_id:      str
    detected_labels: list[str]
    chip_answers:    list[ChipAnswer]

class FoodNutrition(BaseModel):
    food_name:   str
    serving_g:   float
    calories:    int
    protein_g:   float
    carbs_g:     float
    fat_g:       float

class NutritionResponse(BaseModel):
    items:       list[FoodNutrition]
    meal_total:  MacroTarget


# ── Suggestion ────────────────────────────────────────────────────────────────

class SuggestRequest(BaseModel):
    user_id:        str
    meal_nutrition: NutritionResponse
    image_b64:      str      # full-resolution image for multimodal analysis

class SuggestResponse(BaseModel):
    suggestion:     str      # one-sentence from Llama
    plate_score:    float    # 0–100 balanced plate score
    deficit_surplus_kcal: int


# ── Check-in ──────────────────────────────────────────────────────────────────

class CheckInPayload(BaseModel):
    user_id:      str
    weight_kg:    float

class CheckInResponse(BaseModel):
    new_target:   MacroTarget
    delta_kg:     float
    message:      str
