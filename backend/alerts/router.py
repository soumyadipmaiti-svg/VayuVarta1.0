"""
WeatherGPT — Alerts Router
Routes: /api/v1/alerts/*
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Literal

from auth.router import get_current_user
from database import get_supabase

router = APIRouter(prefix="/alerts", tags=["alerts"])

EventType = Literal["rain", "heat", "cold", "storm", "wind", "uv", "aqi"]

# ── Schemas ───────────────────────────────────────────────────────────────────
class SubscriptionRequest(BaseModel):
    location_id: str
    event_type: EventType
    threshold_value: float | None = Field(
        None, description="e.g. 70 for rain probability %, 40 for temp °C"
    )


class SubscriptionUpdateRequest(BaseModel):
    threshold_value: float | None = None
    enabled: bool | None = None


# ── GET /alerts ────────────────────────────────────────────────────────────────
@router.get("")
async def list_alerts(
    active_only: bool = True,
    user: dict = Depends(get_current_user),
):
    """List alerts for the current user. Filters to non-expired by default."""
    db = get_supabase()
    query = (
        db.table("alerts")
        .select("id, event_type, severity, message, created_at, expires_at, location_id, locations(name)")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(50)
    )
    if active_only:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        query = query.gte("expires_at", now)

    result = query.execute()
    return [
        {
            **{k: v for k, v in row.items() if k != "locations"},
            "location_name": row.get("locations", {}).get("name") if row.get("locations") else None,
        }
        for row in (result.data or [])
    ]


# ── GET /alerts/subscriptions ─────────────────────────────────────────────────
@router.get("/subscriptions")
async def list_subscriptions(user: dict = Depends(get_current_user)):
    """List all alert subscriptions for the current user."""
    db = get_supabase()
    result = (
        db.table("alert_subscriptions")
        .select("id, location_id, event_type, threshold_value, enabled, created_at, locations(name)")
        .eq("user_id", user["id"])
        .execute()
    )
    return [
        {
            **{k: v for k, v in row.items() if k != "locations"},
            "location_name": row.get("locations", {}).get("name") if row.get("locations") else None,
        }
        for row in (result.data or [])
    ]


# ── POST /alerts/subscriptions ────────────────────────────────────────────────
@router.post("/subscriptions", status_code=201)
async def create_subscription(
    body: SubscriptionRequest, user: dict = Depends(get_current_user)
):
    """Subscribe to an alert type for a location."""
    db = get_supabase()

    # Verify the location belongs to the user
    ul = (
        db.table("user_locations")
        .select("id")
        .eq("user_id", user["id"])
        .eq("location_id", body.location_id)
        .limit(1)
        .execute()
    )
    if not ul.data:
        raise HTTPException(
            status_code=404, detail="Location not in your saved list"
        )

    # Check for duplicate subscription
    existing = (
        db.table("alert_subscriptions")
        .select("id")
        .eq("user_id", user["id"])
        .eq("location_id", body.location_id)
        .eq("event_type", body.event_type)
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409, detail="Subscription already exists for this location and event type"
        )

    result = (
        db.table("alert_subscriptions")
        .insert(
            {
                "user_id": user["id"],
                "location_id": body.location_id,
                "event_type": body.event_type,
                "threshold_value": body.threshold_value,
            }
        )
        .execute()
    )
    return result.data[0]


# ── PATCH /alerts/subscriptions/{id} ─────────────────────────────────────────
@router.patch("/subscriptions/{subscription_id}")
async def update_subscription(
    subscription_id: str,
    body: SubscriptionUpdateRequest,
    user: dict = Depends(get_current_user),
):
    """Update threshold or enabled state for a subscription."""
    db = get_supabase()

    # Verify ownership
    existing = (
        db.table("alert_subscriptions")
        .select("id, user_id")
        .eq("id", subscription_id)
        .single()
        .execute()
    )
    if not existing.data or existing.data["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Subscription not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        db.table("alert_subscriptions")
        .update(updates)
        .eq("id", subscription_id)
        .execute()
    )
    return result.data[0]


# ── DELETE /alerts/subscriptions/{id} ────────────────────────────────────────
@router.delete("/subscriptions/{subscription_id}", status_code=204)
async def delete_subscription(
    subscription_id: str, user: dict = Depends(get_current_user)
):
    """Remove an alert subscription."""
    db = get_supabase()
    existing = (
        db.table("alert_subscriptions")
        .select("id, user_id")
        .eq("id", subscription_id)
        .single()
        .execute()
    )
    if not existing.data or existing.data["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Subscription not found")
    db.table("alert_subscriptions").delete().eq("id", subscription_id).execute()
