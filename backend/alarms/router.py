"""
Vayu Varta — Alarm Router
Routes: /api/v1/alarms/*

Endpoints:
  GET  /alarms              — List user's alarms
  POST /alarms/{id}/ack    — Acknowledge an alarm
  GET  /alarms/risk/{loc}  — Evaluate risk for a location on-demand
  GET  /alarms/stats       — Alarm statistics
"""

import logging
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from datetime import datetime, timezone, timedelta

from auth.router import get_current_user
from database import get_supabase
from alarms.engine import evaluate_location

logger = logging.getLogger("alarms.router")

router = APIRouter(prefix="/alarms", tags=["alarms"])


# ── GET /alarms ────────────────────────────────────────────────────────────────

@router.get("")
async def list_alarms(
    active_only: bool = True,
    user: dict = Depends(get_current_user),
):
    """
    List weather alarms for the current user.
    Returns alarms with severity, countdown, safety guidance.
    """
    try:
        db = get_supabase()

        # Get user's alarm IDs
        ua_result = (
            db.table("user_alarms")
            .select("alarm_id, acknowledged, acknowledged_at")
            .eq("user_id", user["id"])
            .execute()
        )
    except Exception as e:
        logger.warning(f"Alarm tables may not exist: {e}")
        return []

    user_alarms = ua_result.data or []

    if not user_alarms:
        return []

    alarm_ids = [ua["alarm_id"] for ua in user_alarms]
    ack_map = {ua["alarm_id"]: ua for ua in user_alarms}

    # Fetch alarm details
    query = (
        db.table("weather_alarms")
        .select(
            "id, location_id, pattern_key, pattern_name, pattern_icon, "
            "severity, risk_score, confidence, factors, message, "
            "safety_guidance, countdown_minutes, onset_time, "
            "created_at, expires_at, locations(name)"
        )
        .in_("id", alarm_ids)
        .order("created_at", desc=True)
        .limit(50)
    )

    if active_only:
        now = datetime.now(timezone.utc).isoformat()
        query = query.gte("expires_at", now)

    result = query.execute()

    alarms = []
    for row in (result.data or []):
        loc_name = row.get("locations", {}).get("name") if row.get("locations") else None
        ack_info = ack_map.get(row["id"], {})

        # Calculate live countdown
        countdown = row.get("countdown_minutes", 0) or 0
        onset = row.get("onset_time")
        if onset and countdown > 0:
            try:
                onset_dt = datetime.fromisoformat(onset.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                remaining = (onset_dt - now).total_seconds() / 60
                countdown = max(0, int(remaining))
            except:
                pass

        alarms.append({
            "id": row["id"],
            "location_id": row["location_id"],
            "location_name": loc_name,
            "pattern_key": row["pattern_key"],
            "pattern_name": row["pattern_name"],
            "pattern_icon": row["pattern_icon"],
            "severity": row["severity"],
            "risk_score": row["risk_score"],
            "confidence": row["confidence"],
            "factors": row.get("factors", []),
            "message": row["message"],
            "safety_guidance": row["safety_guidance"],
            "countdown_minutes": countdown,
            "onset_time": onset,
            "acknowledged": ack_info.get("acknowledged", False),
            "acknowledged_at": ack_info.get("acknowledged_at"),
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
        })

    return alarms


# ── POST /alarms/{id}/ack ─────────────────────────────────────────────────────

@router.post("/{alarm_id}/ack")
async def acknowledge_alarm(
    alarm_id: str,
    user: dict = Depends(get_current_user),
):
    """Acknowledge an alarm — marks it as seen by the user."""
    db = get_supabase()

    result = (
        db.table("user_alarms")
        .update({
            "acknowledged": True,
            "acknowledged_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("alarm_id", alarm_id)
        .eq("user_id", user["id"])
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Alarm not found")

    return {"status": "acknowledged", "alarm_id": alarm_id}


# ── GET /alarms/risk/{location_id} ────────────────────────────────────────────

@router.get("/risk/{location_id}")
async def get_risk_status(
    location_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Evaluate alarm risk for a specific location on-demand.
    Returns all detected risk patterns (even WATCH level).
    """
    db = get_supabase()

    # Verify location belongs to user
    ul = (
        db.table("user_locations")
        .select("id")
        .eq("user_id", user["id"])
        .eq("location_id", location_id)
        .limit(1)
        .execute()
    )
    if not ul.data:
        raise HTTPException(status_code=404, detail="Location not found")

    risks = await evaluate_location(location_id)
    return {
        "location_id": location_id,
        "risks": risks,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── POST /alarms/test ─────────────────────────────────────────────────────────

@router.post("/test")
async def trigger_test_alarm(
    user: dict = Depends(get_current_user),
):
    """
    Create a fake test alarm for the user's first location.
    Use this to test the alarm UI without waiting for the scheduler.
    """
    try:
        db = get_supabase()

        # Find user's first location
        ul_result = (
            db.table("user_locations")
            .select("location_id, locations(id, name, latitude, longitude)")
            .eq("user_id", user["id"])
            .limit(1)
            .execute()
        )
        user_locations = ul_result.data or []

        if not user_locations:
            return JSONResponse(
                status_code=400,
                content={"detail": "No locations found. Add a location first from the Locations page."}
            )

        loc = user_locations[0].get("locations")
        if not loc:
            return JSONResponse(
                status_code=400,
                content={"detail": "Location data not found."}
            )

        loc_id = loc["id"]
        loc_name = loc["name"]

        # Create a fake CRITICAL cyclone alarm
        import random
        test_patterns = [
            {
                "pattern_key": "cyclone",
                "pattern_name": "Cyclone / Tropical Storm",
                "pattern_icon": "🌀",
                "risk_score": 85,
                "factors": ["Extreme wind: 130 km/h", "Very low pressure: 975 hPa", "Active thunderstorm conditions"],
                "countdown_minutes": 30,
            },
            {
                "pattern_key": "flash_flood",
                "pattern_name": "Flash Flood Risk",
                "pattern_icon": "🌊",
                "risk_score": 72,
                "factors": ["Extreme rainfall: 55.2mm", "Heavy rain weather code active", "Forecast extreme rain: 80mm in 24h"],
                "countdown_minutes": 20,
            },
            {
                "pattern_key": "severe_storm",
                "pattern_name": "Severe Thunderstorm",
                "pattern_icon": "⛈️",
                "risk_score": 68,
                "factors": ["Extreme thunderstorm with heavy hail", "Dangerous wind: 95 km/h"],
                "countdown_minutes": 15,
            },
            {
                "pattern_key": "heatwave",
                "pattern_name": "Extreme Heat / Heatwave",
                "pattern_icon": "🔥",
                "risk_score": 65,
                "factors": ["Extreme heat index: 52°C", "Extreme temperature: 44°C"],
                "countdown_minutes": 0,
            },
        ]

        pattern = random.choice(test_patterns)
        severity = "CRITICAL" if pattern["risk_score"] >= 60 else "WARNING"

        # Safety guidance
        from alarms.engine import RISK_PATTERNS, _build_safety_message, _build_alarm_message
        safety = _build_safety_message(pattern["pattern_key"])

        # Build message
        risk_data = {
            "severity": severity,
            "risk_score": pattern["risk_score"],
            "confidence": 92,
            "factors": pattern["factors"],
            "countdown_minutes": pattern["countdown_minutes"],
        }
        message = _build_alarm_message(pattern["pattern_key"], risk_data, loc_name)

        # Onset time
        onset = None
        if pattern["countdown_minutes"] > 0:
            onset = (datetime.now(timezone.utc) + timedelta(minutes=pattern["countdown_minutes"])).isoformat()

        expires = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()

        # Insert alarm
        alarm_result = (
            db.table("weather_alarms")
            .insert({
                "location_id": loc_id,
                "pattern_key": pattern["pattern_key"],
                "pattern_name": pattern["pattern_name"],
                "pattern_icon": pattern["pattern_icon"],
                "severity": severity,
                "risk_score": pattern["risk_score"],
                "confidence": 92,
                "factors": pattern["factors"],
                "message": message,
                "safety_guidance": safety,
                "countdown_minutes": pattern["countdown_minutes"],
                "onset_time": onset,
                "expires_at": expires,
            })
            .execute()
        )

        alarm = alarm_result.data[0]

        # Link to user
        db.table("user_alarms").insert({
            "user_id": user["id"],
            "alarm_id": alarm["id"],
            "acknowledged": False,
        }).execute()

        return {
            "status": "test_alarm_created",
            "alarm_id": alarm["id"],
            "severity": severity,
            "pattern": pattern["pattern_name"],
            "location": loc_name,
            "message": "Go to Vayu Alert page to see it!",
        }

    except Exception as e:
        error_msg = str(e)
        # Log full error server-side only — never expose to client
        logger.error(f"Test alarm creation failed: {error_msg}", exc_info=True)

        # Check if tables don't exist (safe to tell user)
        if "does not exist" in error_msg or "relation" in error_msg or "table" in error_msg.lower():
            return JSONResponse(
                status_code=400,
                content={
                    "detail": "Alarm database tables not found. Please run the SQL migration in Supabase first."
                }
            )

        # Generic error — never expose internal details
        return JSONResponse(
            status_code=500,
            content={"detail": "Failed to create test alarm. Please try again."}
        )


# ── GET /alarms/stats ─────────────────────────────────────────────────────────

@router.get("/stats")
async def get_alarm_stats(user: dict = Depends(get_current_user)):
    """Get alarm statistics for the current user."""
    db = get_supabase()

    # Get user's alarms
    ua_result = (
        db.table("user_alarms")
        .select("alarm_id, acknowledged")
        .eq("user_id", user["id"])
        .execute()
    )
    user_alarms = ua_result.data or []

    if not user_alarms:
        return {
            "total": 0,
            "unacknowledged": 0,
            "critical": 0,
            "warning": 0,
            "by_type": {},
        }

    alarm_ids = [ua["alarm_id"] for ua in user_alarms]
    ack_count = sum(1 for ua in user_alarms if ua.get("acknowledged"))

    # Get severity counts
    alarms_result = (
        db.table("weather_alarms")
        .select("id, severity, pattern_key")
        .in_("id", alarm_ids)
        .execute()
    )
    alarms = alarms_result.data or []

    severity_counts = {}
    type_counts = {}
    for a in alarms:
        sev = a.get("severity", "UNKNOWN")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
        pat = a.get("pattern_key", "unknown")
        type_counts[pat] = type_counts.get(pat, 0) + 1

    return {
        "total": len(alarms),
        "unacknowledged": len(alarms) - ack_count,
        "critical": severity_counts.get("CRITICAL", 0),
        "warning": severity_counts.get("WARNING", 0),
        "watch": severity_counts.get("WATCH", 0),
        "by_type": type_counts,
    }
