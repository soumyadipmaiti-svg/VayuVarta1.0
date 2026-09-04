"""
Vayu Varta — Input Validation Schemas
Strict Pydantic schemas for all user-facing inputs.
Every field has type, length, and format constraints.
Invalid input is REJECTED — not sanitized or escaped.
"""

import re
from pydantic import BaseModel, Field, field_validator, EmailStr


# ── Common validators ─────────────────────────────────────────────────────────

def _strip_whitespace(v: str) -> str:
    return v.strip() if isinstance(v, str) else v


# ── Auth Schemas ──────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    """User registration — strict validation."""
    name: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="Full name",
    )
    email: EmailStr = Field(
        ...,
        max_length=254,
        description="Valid email address",
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password (8+ chars)",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = _strip_whitespace(v)
        if not v:
            raise ValueError("Name cannot be empty")
        # Only allow letters, spaces, hyphens, apostrophes, and common unicode
        if not re.match(r"^[\w\s\-'.]+$", v, re.UNICODE):
            raise ValueError("Name contains invalid characters")
        return v

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """
        Password policy:
        - Minimum 8 characters
        - At least 1 uppercase letter
        - At least 1 lowercase letter
        - At least 1 digit
        """
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if len(v) > 128:
            raise ValueError("Password must not exceed 128 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least 1 uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least 1 lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least 1 number")


        # Block common passwords
        common = [
            "password123", "qwerty1234", "12345678",
            "abcdefgh", "passwordpassword", "letmein123",
        ]
        if v.lower() in common:
            raise ValueError("This password is too common. Please choose a stronger one.")

        return v


class LoginRequest(BaseModel):
    """User login — email format + basic length check."""
    email: EmailStr = Field(..., max_length=254)
    password: str = Field(..., min_length=1, max_length=128)


# ── Weather / Location Schemas ────────────────────────────────────────────────

class AddLocationRequest(BaseModel):
    """Add a saved location."""
    name: str = Field(..., min_length=1, max_length=100)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    label: str | None = Field(None, max_length=50)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = _strip_whitespace(v)
        if not v:
            raise ValueError("Location name cannot be empty")
        return v


# ── AI Chat Schemas ───────────────────────────────────────────────────────────

class AIChatRequest(BaseModel):
    """AI chat message."""
    location_id: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=1, max_length=2000)

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        v = _strip_whitespace(v)
        if not v:
            raise ValueError("Message cannot be empty")
        # Block script injection attempts
        if re.search(r"<script|javascript:|on\w+\s*=", v, re.IGNORECASE):
            raise ValueError("Message contains disallowed content")
        return v


# ── TTS Schemas ───────────────────────────────────────────────────────────────

class TTSRequest(BaseModel):
    """Text-to-speech request."""
    text: str = Field(..., min_length=1, max_length=2000)
    voice_id: str | None = Field(None, max_length=100)
    speed: float = Field(1.0, ge=0.5, le=2.0)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        v = _strip_whitespace(v)
        if not v:
            raise ValueError("Text cannot be empty")
        return v


# ── Alert Schemas ─────────────────────────────────────────────────────────────

class AlertSubscriptionRequest(BaseModel):
    """Create alert subscription."""
    location_id: str = Field(..., min_length=1, max_length=100)
    event_type: str = Field(..., pattern=r"^(rain|heat|cold|storm|wind|uv|aqi)$")
    threshold_value: float | None = Field(None, ge=0, le=1000)


class AlertSubscriptionUpdateRequest(BaseModel):
    """Update alert subscription."""
    threshold_value: float | None = Field(None, ge=0, le=1000)
    enabled: bool | None = None


# ── Push Schemas ──────────────────────────────────────────────────────────────

class PushSubscribeRequest(BaseModel):
    """Register browser push subscription."""
    endpoint: str = Field(..., min_length=10, max_length=500)
    p256dh: str = Field(..., min_length=1, max_length=500)
    auth: str = Field(..., min_length=1, max_length=500)
    user_agent: str | None = Field(None, max_length=500)
