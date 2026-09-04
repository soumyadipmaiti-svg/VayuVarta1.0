"""
WeatherGPT — Admin Router
Routes: /api/v1/admin/*
All endpoints require admin role (enforced via require_admin dependency).
"""

import httpx
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel

from auth.router import require_admin
from database import get_supabase
from config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


# ── GET /admin/users ──────────────────────────────────────────────────────────
@router.get("/users")
async def list_users(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    admin: dict = Depends(require_admin),
):
    """List all registered users with key stats (admin only)."""
    db = get_supabase()
    result = (
        db.table("users")
        .select(
            "id, name, email, role, phone_verified, whatsapp_consent, created_at",
            count="exact",
        )
        .order("created_at", desc=True)
        .limit(limit)
        .offset(offset)
        .execute()
    )
    return {
        "total": result.count,
        "users": result.data or [],
        "limit": limit,
        "offset": offset,
    }


# ── GET /admin/alerts ─────────────────────────────────────────────────────────
@router.get("/alerts")
async def list_all_alerts(
    severity: str | None = Query(None, pattern="^(INFO|WARNING|CRITICAL)$"),
    limit: int = Query(50, le=200),
    admin: dict = Depends(require_admin),
):
    """List all alerts across all users (admin only). Filter by severity."""
    db = get_supabase()
    query = (
        db.table("alerts")
        .select(
            "id, event_type, severity, message, created_at, expires_at, "
            "users(email), locations(name)",
            count="exact",
        )
        .order("created_at", desc=True)
        .limit(limit)
    )
    if severity:
        query = query.eq("severity", severity)
    result = query.execute()
    return {"total": result.count, "alerts": result.data or []}


# ── GET /admin/notifications/logs ─────────────────────────────────────────────
@router.get("/notifications/logs")
async def notification_logs(
    channel: str | None = Query(None, pattern="^(push|whatsapp|in_app)$"),
    status: str | None = None,
    limit: int = Query(100, le=500),
    admin: dict = Depends(require_admin),
):
    """
    View notification delivery logs (admin only).
    Filterable by channel (push/whatsapp/in_app) and status.
    """
    db = get_supabase()
    query = (
        db.table("notification_logs")
        .select(
            "id, channel, status, error_detail, created_at, "
            "users(email), alerts(event_type, severity)",
            count="exact",
        )
        .order("created_at", desc=True)
        .limit(limit)
    )
    if channel:
        query = query.eq("channel", channel)
    if status:
        query = query.eq("status", status)
    result = query.execute()
    return {"total": result.count, "logs": result.data or []}


# ── GET /admin/notifications/whatsapp ─────────────────────────────────────────
@router.get("/notifications/whatsapp")
async def whatsapp_message_logs(
    limit: int = Query(50, le=200),
    admin: dict = Depends(require_admin),
):
    """View WhatsApp message delivery status log (admin only)."""
    db = get_supabase()
    result = (
        db.table("whatsapp_messages")
        .select(
            "id, template_name, status, attempt_count, sent_at, updated_at, "
            "users(email, phone_number)"
        )
        .order("updated_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


# ── GET /admin/push/subscriptions ─────────────────────────────────────────────
@router.get("/push/subscriptions")
async def push_subscription_stats(admin: dict = Depends(require_admin)):
    """Count of push subscriptions per user (admin only)."""
    db = get_supabase()
    result = (
        db.table("push_subscriptions")
        .select("user_id, users(email)", count="exact")
        .execute()
    )
    return {
        "total_subscriptions": result.count,
        "subscriptions": result.data or [],
    }


# ── GET /admin/system/health ──────────────────────────────────────────────────
@router.get("/system/health")
async def system_health(admin: dict = Depends(require_admin)):
    """
    Check health of all external dependencies (admin only).
    Returns status for: Weather API, AI API, Database, WhatsApp API.
    """
    results = {}

    # 1. Database check
    try:
        db = get_supabase()
        db.table("users").select("id").limit(1).execute()
        results["database"] = "ok"
    except Exception:
        results["database"] = "error"

    # 2. Weather API check (Open-Meteo — free, no key)
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{settings.weather_api_base_url}/forecast",
                params={
                    "latitude": 51.5,
                    "longitude": -0.12,
                    "current": "temperature_2m",
                    "timezone": "auto",
                    "forecast_days": 1,
                },
            )
            results["weather_api"] = "ok" if resp.status_code == 200 else "error"
    except Exception:
        results["weather_api"] = "error"

    # 3. Gemini AI check
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        model.generate_content("Say 'ok'")
        results["ai_api"] = "ok"
    except Exception:
        results["ai_api"] = "error"

    # 4. WhatsApp config check (just verify credentials are set)
    results["whatsapp_api"] = (
        "configured" if settings.whatsapp_access_token else "not_configured"
    )

    # 5. Push notification check
    results["push_notifications"] = (
        "configured" if settings.vapid_private_key else "not_configured"
    )

    overall = "ok" if all(v in ("ok", "configured") for v in results.values()) else "degraded"
    return {"overall": overall, "components": results}


# ── GET /admin/stats ──────────────────────────────────────────────────────────
@router.get("/stats")
async def system_stats(admin: dict = Depends(require_admin)):
    """High-level platform statistics (admin only)."""
    db = get_supabase()

    def count(table: str, filters: dict | None = None) -> int:
        q = db.table(table).select("id", count="exact")
        for k, v in (filters or {}).items():
            q = q.eq(k, v)
        return q.execute().count or 0

    return {
        "users": {
            "total": count("users"),
            "admin": count("users", {"role": "admin"}),
            "phone_verified": count("users", {"phone_verified": True}),
            "whatsapp_consent": count("users", {"whatsapp_consent": True}),
        },
        "locations": {
            "total_global": count("locations"),
            "total_saved": count("user_locations"),
        },
        "alerts": {
            "total": count("alerts"),
            "subscriptions_active": count("alert_subscriptions", {"enabled": True}),
        },
        "notifications": {
            "push_subscriptions": count("push_subscriptions"),
            "logs_total": count("notification_logs"),
            "whatsapp_messages": count("whatsapp_messages"),
        },
        "ai_conversations": count("ai_conversations"),
    }
