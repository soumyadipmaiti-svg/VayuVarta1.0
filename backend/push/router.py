"""
WeatherGPT — Push Notification Router
Routes: /api/v1/push/*

Handles browser push subscription management (register/unregister devices)
and serves the VAPID public key needed by the frontend to create subscriptions.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from auth.router import get_current_user
from database import get_supabase
from config import settings

router = APIRouter(prefix="/push", tags=["push"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str | None = None


# ── GET /push/vapid-public-key ─────────────────────────────────────────────────
@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """
    Return the VAPID public key for the frontend to use when creating
    a PushSubscription via navigator.serviceWorker.pushManager.subscribe().
    This endpoint is public — no auth required.
    """
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=503,
            detail="Push notifications are not configured on this server.",
        )
    return {"public_key": settings.vapid_public_key}


# ── POST /push/subscribe ───────────────────────────────────────────────────────
@router.post("/subscribe", status_code=201)
async def subscribe(
    body: PushSubscribeRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """
    Register a browser push subscription for the current user.
    Called by the frontend after the user grants notification permission.
    One user can have multiple subscriptions (different devices/browsers).

    Frontend flow:
      1. const reg = await navigator.serviceWorker.register('/sw.js')
      2. const sub = await reg.pushManager.subscribe({
             userVisibleOnly: true,
             applicationServerKey: vapidPublicKey  // from GET /push/vapid-public-key
         })
      3. POST /api/v1/push/subscribe with sub.toJSON()
    """
    db = get_supabase()
    user_agent = body.user_agent or request.headers.get("user-agent", "")

    # Upsert — update auth/p256dh if endpoint already exists (re-subscription)
    existing = (
        db.table("push_subscriptions")
        .select("id, user_id")
        .eq("endpoint", body.endpoint)
        .limit(1)
        .execute()
    )
    if existing.data:
        # Update existing subscription
        db.table("push_subscriptions").update(
            {"p256dh": body.p256dh, "auth": body.auth, "user_agent": user_agent}
        ).eq("endpoint", body.endpoint).execute()
        return {"message": "Push subscription updated", "status": "updated"}

    # New subscription
    db.table("push_subscriptions").insert(
        {
            "user_id": user["id"],
            "endpoint": body.endpoint,
            "p256dh": body.p256dh,
            "auth": body.auth,
            "user_agent": user_agent,
        }
    ).execute()

    # Update user preferences: mark push as enabled
    db.table("notification_preferences").update({"push_enabled": True}).eq(
        "user_id", user["id"]
    ).execute()

    return {"message": "Push subscription registered", "status": "created"}


# ── DELETE /push/unsubscribe ───────────────────────────────────────────────────
@router.delete("/unsubscribe")
async def unsubscribe(
    endpoint: str,
    user: dict = Depends(get_current_user),
):
    """
    Unregister a specific push subscription (when user disables notifications
    on a particular device or browser).
    """
    db = get_supabase()
    result = (
        db.table("push_subscriptions")
        .select("id, user_id")
        .eq("endpoint", endpoint)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Subscription not found")

    db.table("push_subscriptions").delete().eq("id", result.data[0]["id"]).execute()

    # If no subscriptions left, disable push in preferences
    remaining = (
        db.table("push_subscriptions")
        .select("id")
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
    )
    if not remaining.data:
        db.table("notification_preferences").update({"push_enabled": False}).eq(
            "user_id", user["id"]
        ).execute()

    return {"message": "Push subscription removed"}


# ── GET /push/subscriptions ────────────────────────────────────────────────────
@router.get("/subscriptions")
async def list_subscriptions(user: dict = Depends(get_current_user)):
    """List all push subscriptions for the current user (for device management UI)."""
    db = get_supabase()
    result = (
        db.table("push_subscriptions")
        .select("id, endpoint, user_agent, created_at")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    # Truncate endpoint for display (privacy)
    return [
        {
            "id": row["id"],
            "endpoint_preview": row["endpoint"][:60] + "...",
            "user_agent": row["user_agent"],
            "created_at": row["created_at"],
        }
        for row in (result.data or [])
    ]


# ── POST /push/test ────────────────────────────────────────────────────────────
@router.post("/test")
async def test_push(user: dict = Depends(get_current_user)):
    """
    Send a test push notification to all of the current user's devices.
    Useful for verifying the setup works during development.
    """
    from push.service import send_push_to_user
    count = send_push_to_user(
        user_id=user["id"],
        title="✅ WeatherGPT Push Working!",
        body="You'll now receive weather alerts directly on this device.",
        tag="weathergpt-test",
        url="/settings",
        data={"type": "test"},
    )
    if count == 0:
        raise HTTPException(
            status_code=400,
            detail="No push subscriptions found. Make sure you have allowed notifications in your browser.",
        )
    return {"message": f"Test notification sent to {count} device(s)"}
