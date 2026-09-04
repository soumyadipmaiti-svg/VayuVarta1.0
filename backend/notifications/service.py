"""
WeatherGPT — Notification Service (Central Dispatcher)
Receives an alert + user and routes it to all channels the user has enabled:
  - Web Push (browser push like Zomato/Swiggy) ← primary channel
  - In-App log (always recorded)

Called by the Alert Engine after every alert creation.
"""

import logging
from database import get_supabase

logger = logging.getLogger("notifications.service")

# ── Severity emoji mapping ────────────────────────────────────────────────────
SEVERITY_EMOJI = {"INFO": "ℹ️", "WARNING": "⚠️", "CRITICAL": "🚨"}
SEVERITY_ICON = {"INFO": "/icon-info.png", "WARNING": "/icon-warning.png", "CRITICAL": "/icon-critical.png"}


def _get_user_preferences(user_id: str) -> dict:
    """Fetch notification preferences for a user, or return safe defaults."""
    db = get_supabase()
    result = (
        db.table("notification_preferences")
        .select("push_enabled, in_app_enabled, min_severity")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]
    # Safe defaults
    return {
        "push_enabled": True,

        "in_app_enabled": True,
        "min_severity": "WARNING",
    }


def _severity_passes_filter(severity: str, min_severity: str) -> bool:
    """Return True if the alert severity meets or exceeds the user's minimum."""
    order = {"INFO": 1, "WARNING": 2, "CRITICAL": 3}
    return order.get(severity, 0) >= order.get(min_severity, 2)


def _log_notification(
    user_id: str,
    alert_id: str,
    channel: str,
    status: str,
    error_detail: str | None = None,
):
    """Write a record to notification_logs for audit/admin visibility."""
    db = get_supabase()
    try:
        db.table("notification_logs").insert(
            {
                "user_id": user_id,
                "alert_id": alert_id,
                "channel": channel,
                "status": status,
                "error_detail": error_detail,
            }
        ).execute()
    except Exception as exc:
        logger.warning(f"Failed to write notification log: {exc}")


# ── Main dispatch function ────────────────────────────────────────────────────

async def dispatch_alert(alert: dict, user: dict):
    """
    Dispatch an alert to all channels enabled for the user.
    This function is called by the alert engine after creating each alert.

    alert: dict with keys — id, user_id, event_type, severity, message, location_id
    user:  dict with keys — id, email, name, phone_number, phone_verified, whatsapp_consent
    """
    user_id = alert["user_id"]
    alert_id = alert["id"]
    severity = alert["severity"]
    message = alert["message"]
    event_type = alert["event_type"]
    emoji = SEVERITY_EMOJI.get(severity, "🌤️")
    icon = SEVERITY_ICON.get(severity, "/icon-192.png")

    # 1. Get user preferences
    prefs = _get_user_preferences(user_id)
    min_severity = prefs.get("min_severity", "WARNING")

    # 2. Severity filter
    if not _severity_passes_filter(severity, min_severity):
        logger.info(
            f"Notification suppressed: {severity} < {min_severity} for user {user['email']}"
        )
        return

    logger.info(
        f"Dispatching [{severity}] {event_type} alert to {user['email']} | "
        f"push={prefs['push_enabled']}"
    )

    # ── Channel 1: Web Push ───────────────────────────────────────────────────
    if prefs.get("push_enabled", True):
        try:
            from push.service import send_push_to_user
            count = send_push_to_user(
                user_id=user_id,
                title=f"{emoji} Weather Alert — {severity}",
                body=message,
                icon=icon,
                tag=f"weathergpt-{event_type}",
                url="/alerts",
                data={
                    "alert_id": alert_id,
                    "event_type": event_type,
                    "severity": severity,
                },
            )
            status = "sent" if count > 0 else "no_subscriptions"
            _log_notification(user_id, alert_id, "push", status)
        except Exception as exc:
            logger.error(f"Push dispatch failed: {exc}")
            _log_notification(user_id, alert_id, "push", "failed", str(exc))

    # ── Channel 2: In-App (always logged) ────────────────────────────────────
    if prefs.get("in_app_enabled", True):
        _log_notification(user_id, alert_id, "in_app", "delivered")


# ── Daily briefing dispatcher ─────────────────────────────────────────────────

async def send_daily_briefings():
    """
    Send morning weather briefings to users whose briefing_time matches the
    current hour (±0 minutes). Called by the scheduler every 30 minutes.
    """
    from datetime import datetime, timezone
    import asyncio

    now = datetime.now(timezone.utc)
    current_time_str = now.strftime("%H:%M")
    current_hour = now.strftime("%H")

    db = get_supabase()
    prefs_result = (
        db.table("notification_preferences")
        .select("user_id, push_enabled, daily_briefing_time")
        .not_.is_("daily_briefing_time", "null")
        .execute()
    )

    for pref in (prefs_result.data or []):
        briefing_time = pref.get("daily_briefing_time", "")
        if not briefing_time:
            continue
        # Match on hour only (runs every 30 min, so we check within the same hour)
        if not briefing_time.startswith(current_hour):
            continue

        user_id = pref["user_id"]
        try:
            # Get user's default location
            ul = (
                db.table("user_locations")
                .select("location_id, locations(name)")
                .eq("user_id", user_id)
                .eq("is_default", True)
                .limit(1)
                .execute()
            )
            if not ul.data:
                continue
            loc_name = ul.data[0].get("locations", {}).get("name", "your location")

            if pref.get("push_enabled"):
                from push.service import send_daily_briefing_push
                send_daily_briefing_push(
                    user_id=user_id,
                    location_name=loc_name,
                    summary=f"Good morning! Check today's forecast for {loc_name} on WeatherGPT.",
                )
                logger.info(f"Daily briefing push sent to user {user_id}")
        except Exception as exc:
            logger.error(f"Daily briefing failed for user {user_id}: {exc}")
