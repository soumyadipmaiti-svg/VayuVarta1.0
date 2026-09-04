"""
WeatherGPT — Alert Engine
Scheduled background job that:
  1. Fetches all active alert subscriptions grouped by location.
  2. Fetches/refreshes weather data for each active location.
  3. Evaluates each subscription's threshold condition.
  4. Creates alert records for crossed thresholds (with dedup check).
  5. Dispatches alerts to the Notification Service (push + WhatsApp + in-app).
  6. Expires stale alerts.

Runs every 30 minutes via APScheduler (configured in main.py).
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta

from database import get_supabase
from weather.service import get_current_weather, get_forecast

logger = logging.getLogger("alerts.engine")

# ── Threshold evaluation ──────────────────────────────────────────────────────

def _get_metric(weather: dict, event_type: str) -> float | None:
    """
    Extract the relevant metric from weather data for a given event type.
    Returns None if the metric is unavailable.
    """
    cur = weather.get("current", {})
    # For rain we look at the first forecast day's rain probability
    forecast_days = weather.get("forecast_days", [])
    first_day = forecast_days[0] if forecast_days else {}

    metrics = {
        "rain":  first_day.get("day", {}).get("daily_chance_of_rain"),
        "heat":  cur.get("temp_c"),
        "cold":  cur.get("temp_c"),
        "wind":  cur.get("wind_kph"),
        "uv":    cur.get("uv"),
        "aqi":   cur.get("air_quality", {}).get("us-epa-index"),
        "storm": cur.get("wind_kph"),  # simple proxy: high wind = storm risk
    }
    return metrics.get(event_type)


def _condition_met(event_type: str, metric: float, threshold: float | None) -> bool:
    """Return True if the threshold condition is satisfied."""
    if metric is None:
        return False
    if threshold is None:
        # Default thresholds when the user didn't set one
        defaults = {
            "rain": 70,   # % chance
            "heat": 40,   # °C
            "cold": 5,    # °C
            "wind": 60,   # km/h
            "uv": 8,      # UV index
            "aqi": 4,     # US EPA category (4 = Unhealthy for Sensitive Groups)
            "storm": 80,  # km/h wind
        }
        threshold = defaults.get(event_type, 0)

    if event_type == "cold":
        return metric <= threshold  # Cold alert: temp AT OR BELOW threshold
    return metric >= threshold       # All others: metric AT OR ABOVE threshold


def _severity(event_type: str, metric: float, threshold: float | None) -> str:
    """Determine alert severity based on how far the metric exceeds the threshold."""
    if threshold is None:
        threshold = 0
    diff = abs(metric - threshold)
    if diff >= 20:
        return "CRITICAL"
    if diff >= 10:
        return "WARNING"
    return "INFO"


def _alert_message(event_type: str, metric: float, location_name: str) -> str:
    """Generate a human-readable alert message."""
    templates = {
        "rain":  f"🌧️ Heavy rain expected in {location_name}. Rain probability: {metric:.0f}%.",
        "heat":  f"🌡️ High temperature alert in {location_name}! Current temp: {metric:.1f}°C.",
        "cold":  f"🥶 Cold weather alert in {location_name}. Temperature: {metric:.1f}°C.",
        "wind":  f"💨 Strong winds in {location_name}. Wind speed: {metric:.0f} km/h.",
        "uv":    f"☀️ Very high UV index in {location_name}. UV Index: {metric:.0f}. Use sunscreen!",
        "aqi":   f"😷 Poor air quality in {location_name}. AQI Level: {metric:.0f}. Limit outdoor activity.",
        "storm": f"⚠️ Storm conditions in {location_name}! Wind: {metric:.0f} km/h. Stay indoors.",
    }
    return templates.get(event_type, f"Weather alert for {location_name}: {event_type} = {metric}")


def _expires_at() -> str:
    """Alerts expire 6 hours after creation."""
    return (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()


# ── Duplicate check ────────────────────────────────────────────────────────────

def _has_active_alert(db, user_id: str, location_id: str, event_type: str) -> bool:
    """Return True if an unexpired alert of the same (user, location, event_type) exists."""
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("alerts")
        .select("id")
        .eq("user_id", user_id)
        .eq("location_id", location_id)
        .eq("event_type", event_type)
        .gte("expires_at", now)
        .limit(1)
        .execute()
    )
    return bool(result.data)


# ── Expiry cleanup ─────────────────────────────────────────────────────────────

def _expire_old_alerts(db):
    """No hard delete — alerts auto-expire via expires_at. Just log count."""
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("alerts")
        .select("id", count="exact")
        .lt("expires_at", now)
        .execute()
    )
    count = result.count or 0
    if count:
        logger.info(f"Alert engine: {count} expired alerts in DB (kept for history)")


# ── Main evaluation loop ──────────────────────────────────────────────────────

async def run_alert_evaluation():
    """
    Main entry point called by APScheduler every 30 minutes.
    Pseudocode from PRD §11.3 implemented here.
    """
    logger.info("Alert engine: starting evaluation cycle")
    db = get_supabase()

    # Import here to avoid circular imports
    from notifications.service import dispatch_alert

    # 1. Get all enabled subscriptions with their location + user info
    subs_result = (
        db.table("alert_subscriptions")
        .select(
            "id, user_id, location_id, event_type, threshold_value, "
            "locations(id, name, latitude, longitude), "
            "users(id, name, email)"
        )
        .eq("enabled", True)
        .execute()
    )
    subscriptions = subs_result.data or []

    if not subscriptions:
        logger.info("Alert engine: no active subscriptions — nothing to evaluate")
        return

    # 2. Group by location to minimize API calls
    locations_map: dict[str, dict] = {}
    for sub in subscriptions:
        loc = sub.get("locations")
        if loc:
            locations_map[loc["id"]] = loc

    # 3. Fetch weather for each unique location
    weather_cache: dict[str, dict | None] = {}
    for loc_id, location in locations_map.items():
        raw_current = await get_current_weather(location)
        raw_forecast = await get_forecast(location, forecast_type="daily")
        if raw_current is None:
            logger.warning(f"Alert engine: no weather data for {location['name']} — skipping")
            weather_cache[loc_id] = None
            continue
        weather_cache[loc_id] = {
            "current": raw_current.get("current", {}),
            "forecast_days": raw_forecast.get("forecast", {}).get("forecastday", [])
            if raw_forecast
            else [],
        }

    # 4. Evaluate each subscription
    alerts_fired = 0
    for sub in subscriptions:
        loc = sub.get("locations")
        user = sub.get("users")
        if not loc or not user:
            continue

        weather = weather_cache.get(loc["id"])
        if weather is None:
            continue  # No data — skip safely

        event_type = sub["event_type"]
        metric = _get_metric(weather, event_type)
        threshold = sub.get("threshold_value")

        if metric is None:
            continue  # Metric not available in data

        if not _condition_met(event_type, metric, threshold):
            continue  # Threshold not crossed

        # 5. Dedup check — don't fire same alert twice within expiry window
        if _has_active_alert(db, sub["user_id"], loc["id"], event_type):
            logger.debug(
                f"Alert engine: dedup skip [{event_type}] for {user['email']} in {loc['name']}"
            )
            continue

        # 6. Create alert record
        severity = _severity(event_type, metric, threshold)
        message = _alert_message(event_type, metric, loc["name"])

        alert_result = (
            db.table("alerts")
            .insert(
                {
                    "user_id": sub["user_id"],
                    "location_id": loc["id"],
                    "event_type": event_type,
                    "severity": severity,
                    "message": message,
                    "expires_at": _expires_at(),
                }
            )
            .execute()
        )
        alert = alert_result.data[0]
        alerts_fired += 1
        logger.info(
            f"Alert created: [{severity}] {event_type} for {user['email']} in {loc['name']}"
        )

        # 7. Dispatch to notification channels
        await dispatch_alert(alert, user)

    # 8. Log expired alerts count
    _expire_old_alerts(db)

    logger.info(
        f"Alert engine: cycle complete — {alerts_fired} alert(s) fired from {len(subscriptions)} subscription(s)"
    )
