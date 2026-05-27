"""
PlateGuardian — Database
Async SQLite via SQLAlchemy 2.x + aiosqlite.

Tables
──────
users          — health profile & current macro target
meal_logs      — each scan result
checkin_history — bi-weekly weight check-ins
"""

from __future__ import annotations
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Float, Integer, DateTime, ForeignKey, JSON, Text
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship

DATABASE_URL = "sqlite+aiosqlite:///./plateguardian.db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# ── ORM Models ─────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at     = Column(DateTime, default=datetime.utcnow)

    # Onboarding fields
    gender         = Column(String, nullable=False)
    age            = Column(Integer, nullable=False)
    weight_kg      = Column(Float, nullable=False)
    height_cm      = Column(Float, nullable=False)
    goal           = Column(String, nullable=False)   # lose | gain | maintain
    activity       = Column(String, default="moderate")

    # Calculated targets (stored for quick access)
    bmr            = Column(Integer)
    tdee           = Column(Integer)
    target_calories = Column(Integer)
    target_protein_g = Column(Integer)
    target_carbs_g  = Column(Integer)
    target_fat_g    = Column(Integer)

    # Relationships
    meal_logs       = relationship("MealLog",      back_populates="user")
    checkins        = relationship("CheckIn",      back_populates="user")


class MealLog(Base):
    """One row per food-scan session."""
    __tablename__ = "meal_logs"

    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id        = Column(String, ForeignKey("users.id"), nullable=False)
    logged_at      = Column(DateTime, default=datetime.utcnow)

    # Raw YOLO output stored for debugging / re-analysis
    detections_json = Column(JSON)          # list of BoundingBox dicts
    chip_answers_json = Column(JSON)        # list of {chip_question, answer}

    # Computed nutrition
    meal_calories  = Column(Integer)
    meal_protein_g = Column(Float)
    meal_carbs_g   = Column(Float)
    meal_fat_g     = Column(Float)

    # Llama output
    suggestion     = Column(Text)
    plate_score    = Column(Float)

    user           = relationship("User", back_populates="meal_logs")


class CheckIn(Base):
    """Bi-weekly weight check-in record."""
    __tablename__ = "checkin_history"

    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id        = Column(String, ForeignKey("users.id"), nullable=False)
    checked_at     = Column(DateTime, default=datetime.utcnow)

    weight_kg      = Column(Float, nullable=False)
    delta_kg       = Column(Float)          # weight change since last check-in
    message        = Column(Text)

    # New targets after adaptive recalc
    new_calories   = Column(Integer)
    new_protein_g  = Column(Integer)
    new_carbs_g    = Column(Integer)
    new_fat_g      = Column(Integer)

    user           = relationship("User", back_populates="checkins")


# ── Helpers ────────────────────────────────────────────────────────────────────

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅  Database tables ready.")


async def get_session() -> AsyncSession:  # type: ignore[return]
    async with AsyncSessionLocal() as session:
        yield session
