"""
WeatherGPT — WhatsApp Router
Routes: /api/v1/whatsapp/*
Handles opt-in/opt-out, preferences, status queries, and webhook callbacks.
"""

import hashlib
import hmac
import random
import string
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel, Field

from auth.router import get_current_user
from database import get_supabase
from config import settings

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class RegisterPhoneRequest(BaseModel):
    phone_number: str = Field(
        ..., pattern=r"^\+[1-9]\d{6,14}$", description="E.164 format: +919876543210"
    )


class VerifyOTPRequest(BaseModel):
    otp: str = Field(..., min_length=6, max_length=6)


class SubscribeRequest(BaseModel):
    daily_briefing_time: str | None = Field(
        None, pattern=r"^\d{2}:\d{2}$", description="HH:MM format"
    )
    min_severity: str | None = Field(None, pattern=r"^(INFO|WARNING|CRITICAL)$")
    whatsapp_consent: bool = True


# ── OTP helpers ────────────────────────────────────────────────────────────────
def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def _store_otp(user_id: str, otp: str):
    db = get_supabase()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    # Invalidate previous OTPs
    db.table("otp_store").update({"used": True}).eq("user_id", user_id).execute()
    db.table("otp_store").insert(
        {"user_id": user_id, "otp_code": otp, "expires_at": expires}
    ).execute()


def _validate_otp(user_id: str, otp: str) -> bool:
    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("otp_store")
        .select("id, otp_code, expires_at, used")
        .eq("user_id", user_id)
        .eq("used", False)
        .gte("expires_at", now)
        .order("expires_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return False
    row = result.data[0]
    match = hmac.compare_digest(row["otp_code"], otp)
    if match:
        db.table("otp_store").update({"used": True}).eq("id", row["id"]).execute()
    return match


# ── POST /whatsapp/register ────────────────────────────────────────────────────
@router.post("/register")
async def register_phone(
    body: RegisterPhoneRequest, user: dict = Depends(get_current_user)
):
    """
    Submit a phone number for verification.
    Generates a 6-digit OTP and stores it.
    In production: send OTP via SMS/WhatsApp message template.
    In development: OTP is returned in the response (for testing).
    """
    db = get_supabase()
    otp = _generate_otp()
    _store_otp(user["id"], otp)

    # Update phone number (not yet verified)
    db.table("users").update(
        {"phone_number": body.phone_number, "phone_verified": False}
    ).eq("id", user["id"]).execute()

    # Production: integrate SMS/WhatsApp OTP send here
    # For now, return OTP in dev mode only
    response = {"message": "OTP generated. Check your phone."}
    if settings.app_env == "development":
        response["dev_otp"] = otp  # Remove this in production!

    return response


# ── POST /whatsapp/verify ─────────────────────────────────────────────────────
@router.post("/verify")
async def verify_otp(body: VerifyOTPRequest, user: dict = Depends(get_current_user)):
    """Confirm the OTP to verify the phone number."""
    if not _validate_otp(user["id"], body.otp):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    db = get_supabase()
    db.table("users").update({"phone_verified": True}).eq("id", user["id"]).execute()
    return {"verified": True, "message": "Phone number verified successfully"}


# ── POST /whatsapp/subscribe ──────────────────────────────────────────────────
@router.post("/subscribe")
async def subscribe(body: SubscribeRequest, user: dict = Depends(get_current_user)):
    """
    Opt into WhatsApp notifications and set preferences.
    Requires phone to be verified first.
    """
    db = get_supabase()

    # Confirm phone is verified
    user_row = (
        db.table("users")
        .select("phone_verified")
        .eq("id", user["id"])
        .single()
        .execute()
    )
    if not user_row.data or not user_row.data.get("phone_verified"):
        raise HTTPException(
            status_code=400,
            detail="Phone number must be verified before subscribing to WhatsApp alerts",
        )

    # Record WhatsApp consent
    db.table("users").update(
        {
            "whatsapp_consent": body.whatsapp_consent,
            "whatsapp_consent_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", user["id"]).execute()

    # Update notification preferences
    updates = {"whatsapp_enabled": body.whatsapp_consent}
    if body.daily_briefing_time:
        updates["daily_briefing_time"] = body.daily_briefing_time
    if body.min_severity:
        updates["min_severity"] = body.min_severity

    db.table("notification_preferences").update(updates).eq("user_id", user["id"]).execute()

    return {"message": "WhatsApp notifications enabled", "preferences": updates}


# ── POST /whatsapp/unsubscribe ────────────────────────────────────────────────
@router.post("/unsubscribe")
async def unsubscribe(user: dict = Depends(get_current_user)):
    """Opt out of WhatsApp notifications immediately."""
    db = get_supabase()
    db.table("users").update({"whatsapp_consent": False}).eq("id", user["id"]).execute()
    db.table("notification_preferences").update({"whatsapp_enabled": False}).eq(
        "user_id", user["id"]
    ).execute()
    return {"message": "Unsubscribed from WhatsApp notifications"}


# ── GET /whatsapp/status ──────────────────────────────────────────────────────
@router.get("/status")
async def message_status(
    limit: int = Query(20, le=100),
    user: dict = Depends(get_current_user),
):
    """Get delivery status of the user's recent WhatsApp messages."""
    db = get_supabase()
    result = (
        db.table("whatsapp_messages")
        .select("id, template_name, status, attempt_count, sent_at, updated_at")
        .eq("user_id", user["id"])
        .order("updated_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


# ── POST /whatsapp/webhook — Meta delivery status callback ────────────────────
@router.post("/webhook")
async def whatsapp_webhook(request: Request):
    """
    Receive delivery status updates from Meta WhatsApp Cloud API.
    Updates message records with 'sent', 'delivered', 'read', or 'failed' status.
    """
    raw_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    from whatsapp.service import process_delivery_status, verify_webhook_signature
    if not verify_webhook_signature(signature, raw_body):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    payload = await request.json()
    process_delivery_status(payload)
    return {"status": "ok"}


# ── GET /whatsapp/webhook — Meta verification challenge ───────────────────────
@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """
    Meta webhook verification endpoint.
    Called once by Meta when you register the webhook URL in the Developer Portal.
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Webhook verification failed")
