"""
Vayu Varta — AI Weather Alarm Engine

The core intelligence behind Vayu Alert:
  1. Risk Detection — Identifies hazardous patterns from weather data
  2. Severity Classification — Watch / Warning / Critical
  3. AI Prioritization — Only alarms when truly relevant to the user
  4. Countdown Estimation — "Before the Disaster" early warnings
  5. Safety Guidance — Actionable next steps, not just warnings

Runs every 15 minutes via APScheduler (configured in main.py).
"""

import asyncio
import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Optional

from database import get_supabase
from weather.service import get_current_weather, get_forecast

logger = logging.getLogger("alarms.engine")


# ═══════════════════════════════════════════════════════════════════════════════
# SEVERITY LEVELS
# ═══════════════════════════════════════════════════════════════════════════════

SEVERITY_WATCH = "WATCH"        # 🟡 Standard silent notification
SEVERITY_WARNING = "WARNING"    # 🟠 Loud alert + vibration
SEVERITY_CRITICAL = "CRITICAL"  # 🔴 Full-screen alarm + repeated notification


# ═══════════════════════════════════════════════════════════════════════════════
# RISK PATTERNS — What the AI detects
# ═══════════════════════════════════════════════════════════════════════════════

RISK_PATTERNS = {
    "cyclone": {
        "name": "Cyclone / Tropical Storm",
        "icon": "🌀",
        "detect": "_detect_cyclone_risk",
        "safety": [
            "Stay indoors away from windows",
            "Stock emergency supplies (water, food, flashlight)",
            "Follow local disaster management authority",
            "Avoid coastal areas and low-lying regions",
            "Keep phone charged for emergency communications",
        ],
    },
    "flash_flood": {
        "name": "Flash Flood Risk",
        "icon": "🌊",
        "detect": "_detect_flash_flood_risk",
        "safety": [
            "Move to higher ground immediately if in flood-prone area",
            "Do NOT walk or drive through flood water",
            "Disconnect electrical appliances if safe",
            "Keep emergency kit ready",
            "Monitor local flood warnings",
        ],
    },
    "heatwave": {
        "name": "Extreme Heat / Heatwave",
        "icon": "🔥",
        "detect": "_detect_heatwave_risk",
        "safety": [
            "Stay hydrated — drink water frequently",
            "Avoid outdoor activity during peak hours (11am–4pm)",
            "Use sunscreen and wear light clothing",
            "Check on elderly and vulnerable neighbors",
            "Know signs of heatstroke: dizziness, nausea, rapid heartbeat",
        ],
    },
    "cold_wave": {
        "name": "Extreme Cold / Cold Wave",
        "icon": "🥶",
        "detect": "_detect_cold_wave_risk",
        "safety": [
            "Layer clothing and keep extremities covered",
            "Use heating safely — avoid open flames indoors",
            "Watch for hypothermia signs: shivering, confusion",
            "Keep pipes from freezing",
            "Stock warm blankets and hot liquids",
        ],
    },
    "severe_storm": {
        "name": "Severe Thunderstorm",
        "icon": "⛈️",
        "detect": "_detect_severe_storm_risk",
        "safety": [
            "Stay indoors away from windows",
            "Unplug electronics to prevent surge damage",
            "Avoid using landline phones during lightning",
            "Do NOT shelter under trees",
            "Move vehicles away from trees if possible",
        ],
    },
    "high_wind": {
        "name": "Dangerous Wind Conditions",
        "icon": "💨",
        "detect": "_detect_high_wind_risk",
        "safety": [
            "Secure loose outdoor objects",
            "Avoid driving high-profile vehicles",
            "Stay away from damaged buildings",
            "If driving, reduce speed and increase following distance",
            "Watch for flying debris",
        ],
    },
    "heavy_rain": {
        "name": "Heavy / Prolonged Rainfall",
        "icon": "🌧️",
        "detect": "_detect_heavy_rain_risk",
        "safety": [
            "Avoid low-lying areas prone to waterlogging",
            "Do not drive through waterlogged roads",
            "Keep drains clear near your home",
            "Monitor water levels if near rivers",
            "Carry umbrella and waterproof gear",
        ],
    },
    "uv_danger": {
        "name": "Dangerous UV Exposure",
        "icon": "☀️",
        "detect": "_detect_uv_risk",
        "safety": [
            "Apply SPF 50+ sunscreen every 2 hours",
            "Wear protective clothing and sunglasses",
            "Stay in shade during 10am–4pm",
            "Drink extra water to prevent dehydration",
            "Seek medical help if sunburn is severe",
        ],
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# RISK DETECTION FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def _detect_cyclone_risk(current: dict, forecast: dict) -> Optional[dict]:
    """
    Detect cyclone risk based on:
    - Very high wind speed (>90 km/h)
    - Rapidly dropping pressure (<990 hPa)
    - Thunderstorm weather codes (95, 96, 99)
    """
    wind = current.get("wind_kph", 0) or 0
    pressure = current.get("pressure_msl", 1013) or 1013
    weather_code = current.get("weather_code", 0) or 0

    risk_score = 0
    factors = []

    # Wind speed analysis
    if wind > 120:
        risk_score += 50
        factors.append(f"Extreme wind: {wind:.0f} km/h")
    elif wind > 90:
        risk_score += 35
        factors.append(f"Very high wind: {wind:.0f} km/h")
    elif wind > 60:
        risk_score += 15
        factors.append(f"Strong wind: {wind:.0f} km/h")

    # Pressure analysis (low pressure = cyclone indicator)
    if pressure < 980:
        risk_score += 40
        factors.append(f"Very low pressure: {pressure:.0f} hPa")
    elif pressure < 990:
        risk_score += 25
        factors.append(f"Low pressure: {pressure:.0f} hPa")
    elif pressure < 1000:
        risk_score += 10
        factors.append(f"Below-normal pressure: {pressure:.0f} hPa")

    # Thunderstorm codes
    if weather_code in (95, 96, 99):
        risk_score += 20
        factors.append("Active thunderstorm conditions")

    if risk_score < 30:
        return None

    severity = _score_to_severity(risk_score)
    countdown = _estimate_onset_wind(wind, pressure)

    return {
        "risk_score": min(risk_score, 100),
        "severity": severity,
        "factors": factors,
        "countdown_minutes": countdown,
        "confidence": min(70 + risk_score // 5, 95),
    }


def _detect_flash_flood_risk(current: dict, forecast: dict) -> Optional[dict]:
    """
    Detect flash flood risk based on:
    - High precipitation
    - Heavy rain in forecast
    - Low-lying area indicators
    """
    rain_mm = current.get("rain_mm", 0) or 0
    weather_code = current.get("weather_code", 0) or 0
    humidity = current.get("humidity", 50) or 50

    # Check forecast for heavy rain
    forecast_days = forecast.get("forecast_days", [])
    max_rain_next_24h = 0
    for day in forecast_days[:2]:
        daily = day.get("daily", {})
        precip = daily.get("precipitation_sum", [0])
        if isinstance(precip, list) and precip:
            max_rain_next_24h = max(max_rain_next_24h, precip[0] or 0)

    risk_score = 0
    factors = []

    # Current rainfall
    if rain_mm > 50:
        risk_score += 45
        factors.append(f"Extreme rainfall: {rain_mm:.1f}mm")
    elif rain_mm > 20:
        risk_score += 30
        factors.append(f"Heavy rainfall: {rain_mm:.1f}mm")
    elif rain_mm > 10:
        risk_score += 15
        factors.append(f"Moderate rainfall: {rain_mm:.1f}mm")

    # Forecast rain
    if max_rain_next_24h > 60:
        risk_score += 35
        factors.append(f"Forecast extreme rain: {max_rain_next_24h:.0f}mm in 24h")
    elif max_rain_next_24h > 30:
        risk_score += 20
        factors.append(f"Forecast heavy rain: {max_rain_next_24h:.0f}mm in 24h")

    # Heavy rain weather codes
    if weather_code in (65, 67, 82):
        risk_score += 25
        factors.append("Heavy/violent rain weather code active")
    elif weather_code in (63, 81):
        risk_score += 10
        factors.append("Moderate rain weather code active")

    if risk_score < 25:
        return None

    severity = _score_to_severity(risk_score)
    countdown = _estimate_onset_rain(max_rain_next_24h)

    return {
        "risk_score": min(risk_score, 100),
        "severity": severity,
        "factors": factors,
        "countdown_minutes": countdown,
        "confidence": min(60 + risk_score // 4, 90),
    }


def _detect_heatwave_risk(current: dict, forecast: dict) -> Optional[dict]:
    """Detect heatwave: temp > 42°C or feels-like > 48°C."""
    temp = current.get("temp_c", 25) or 25
    feels_like = current.get("feels_like_c", temp) or temp

    risk_score = 0
    factors = []

    if feels_like >= 50:
        risk_score += 50
        factors.append(f"Extreme heat index: {feels_like:.0f}°C")
    elif feels_like >= 45:
        risk_score += 35
        factors.append(f"Very high heat index: {feels_like:.0f}°C")
    elif temp >= 42:
        risk_score += 30
        factors.append(f"Extreme temperature: {temp:.0f}°C")
    elif temp >= 38:
        risk_score += 15
        factors.append(f"High temperature: {temp:.0f}°C")

    if risk_score < 15:
        return None

    severity = _score_to_severity(risk_score)
    return {
        "risk_score": min(risk_score, 100),
        "severity": severity,
        "factors": factors,
        "countdown_minutes": 0,  # Heatwave is ongoing
        "confidence": min(75 + risk_score // 5, 95),
    }


def _detect_cold_wave_risk(current: dict, forecast: dict) -> Optional[dict]:
    """Detect cold wave: temp < 2°C or feels-like < -5°C."""
    temp = current.get("temp_c", 25) or 25
    feels_like = current.get("feels_like_c", temp) or temp

    risk_score = 0
    factors = []

    if feels_like <= -5:
        risk_score += 45
        factors.append(f"Extreme cold: feels like {feels_like:.0f}°C")
    elif temp <= 2:
        risk_score += 30
        factors.append(f"Near-freezing: {temp:.0f}°C")
    elif temp <= 5:
        risk_score += 15
        factors.append(f"Cold conditions: {temp:.0f}°C")

    if risk_score < 15:
        return None

    severity = _score_to_severity(risk_score)
    return {
        "risk_score": min(risk_score, 100),
        "severity": severity,
        "factors": factors,
        "countdown_minutes": 0,
        "confidence": min(70 + risk_score // 5, 90),
    }


def _detect_severe_storm_risk(current: dict, forecast: dict) -> Optional[dict]:
    """Detect severe thunderstorm: code 95/96/99 + high wind."""
    weather_code = current.get("weather_code", 0) or 0
    wind = current.get("wind_kph", 0) or 0

    risk_score = 0
    factors = []

    if weather_code == 99:
        risk_score += 50
        factors.append("Extreme thunderstorm with heavy hail")
    elif weather_code == 96:
        risk_score += 35
        factors.append("Thunderstorm with hail")
    elif weather_code == 95:
        risk_score += 25
        factors.append("Active thunderstorm")

    if wind > 80:
        risk_score += 25
        factors.append(f"Dangerous wind: {wind:.0f} km/h")
    elif wind > 50:
        risk_score += 10
        factors.append(f"Strong wind: {wind:.0f} km/h")

    if risk_score < 25:
        return None

    severity = _score_to_severity(risk_score)
    countdown = _estimate_onset_storm(wind)
    return {
        "risk_score": min(risk_score, 100),
        "severity": severity,
        "factors": factors,
        "countdown_minutes": countdown,
        "confidence": min(65 + risk_score // 4, 90),
    }


def _detect_high_wind_risk(current: dict, forecast: dict) -> Optional[dict]:
    """Detect dangerous wind: > 60 km/h sustained."""
    wind = current.get("wind_kph", 0) or 0

    risk_score = 0
    factors = []

    if wind > 100:
        risk_score += 50
        factors.append(f"Hurricane-force wind: {wind:.0f} km/h")
    elif wind > 80:
        risk_score += 35
        factors.append(f"Very dangerous wind: {wind:.0f} km/h")
    elif wind > 60:
        risk_score += 20
        factors.append(f"Strong wind: {wind:.0f} km/h")

    if risk_score < 20:
        return None

    severity = _score_to_severity(risk_score)
    return {
        "risk_score": min(risk_score, 100),
        "severity": severity,
        "factors": factors,
        "countdown_minutes": 0,
        "confidence": min(70 + risk_score // 5, 95),
    }


def _detect_heavy_rain_risk(current: dict, forecast: dict) -> Optional[dict]:
    """Detect heavy/prolonged rain: > 20mm in current or forecast."""
    rain_mm = current.get("rain_mm", 0) or 0
    weather_code = current.get("weather_code", 0) or 0

    forecast_days = forecast.get("forecast_days", [])
    max_rain = 0
    for day in forecast_days[:3]:
        daily = day.get("daily", {})
        precip = daily.get("precipitation_sum", [0])
        if isinstance(precip, list) and precip:
            max_rain = max(max_rain, precip[0] or 0)

    risk_score = 0
    factors = []

    if rain_mm > 30:
        risk_score += 40
        factors.append(f"Very heavy rain: {rain_mm:.1f}mm")
    elif rain_mm > 15:
        risk_score += 20
        factors.append(f"Heavy rain: {rain_mm:.1f}mm")

    if max_rain > 50:
        risk_score += 30
        factors.append(f"Forecast extreme rain: {max_rain:.0f}mm in 3 days")
    elif max_rain > 25:
        risk_score += 15
        factors.append(f"Forecast heavy rain: {max_rain:.0f}mm in 3 days")

    if weather_code in (65, 67, 82):
        risk_score += 15
        factors.append("Heavy rain weather code active")

    if risk_score < 20:
        return None

    severity = _score_to_severity(risk_score)
    countdown = _estimate_onset_rain(max_rain)
    return {
        "risk_score": min(risk_score, 100),
        "severity": severity,
        "factors": factors,
        "countdown_minutes": countdown,
        "confidence": min(60 + risk_score // 4, 90),
    }


def _detect_uv_risk(current: dict, forecast: dict) -> Optional[dict]:
    """Detect dangerous UV: index > 8."""
    uv = current.get("uv_index", 0) or 0

    if uv < 8:
        return None

    risk_score = 0
    factors = []

    if uv >= 11:
        risk_score = 50
        factors.append(f"Extreme UV index: {uv:.0f}")
    elif uv >= 9:
        risk_score = 35
        factors.append(f"Very high UV index: {uv:.0f}")
    elif uv >= 8:
        risk_score = 20
        factors.append(f"High UV index: {uv:.0f}")

    severity = _score_to_severity(risk_score)
    return {
        "risk_score": min(risk_score, 100),
        "severity": severity,
        "factors": factors,
        "countdown_minutes": 0,
        "confidence": 85,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def _score_to_severity(score: int) -> str:
    """Convert a risk score (0-100) to a severity level."""
    if score >= 60:
        return SEVERITY_CRITICAL
    if score >= 35:
        return SEVERITY_WARNING
    return SEVERITY_WATCH


def _estimate_onset_wind(wind: float, pressure: float) -> int:
    """
    Estimate minutes until peak wind conditions.
    Based on pressure drop rate — lower pressure = faster onset.
    """
    if pressure < 980:
        return 15  # Imminent
    if pressure < 990:
        return 30
    if pressure < 1000:
        return 45
    return 60


def _estimate_onset_rain(forecast_mm: float) -> int:
    """Estimate minutes until heaviest rain based on forecast."""
    if forecast_mm > 60:
        return 20
    if forecast_mm > 30:
        return 45
    return 90


def _estimate_onset_storm(wind: float) -> int:
    """Estimate minutes until storm peak."""
    if wind > 80:
        return 15
    if wind > 50:
        return 30
    return 45


def _build_alarm_message(pattern_key: str, risk: dict, location_name: str) -> str:
    """Build a human-readable alarm message."""
    pattern = RISK_PATTERNS[pattern_key]
    severity = risk["severity"]
    factors = ", ".join(risk["factors"][:3])
    countdown = risk.get("countdown_minutes", 0)

    severity_label = {
        SEVERITY_WATCH: "🟡 WEATHER WATCH",
        SEVERITY_WARNING: "🟠 WEATHER WARNING",
        SEVERITY_CRITICAL: "🔴 SEVERE WEATHER ALERT",
    }.get(severity, "⚠️ WEATHER ALERT")

    msg = f"{severity_label}\n"
    msg += f"{pattern['icon']} {pattern['name']} detected near {location_name}\n"
    msg += f"Risk factors: {factors}\n"

    if countdown > 0:
        msg += f"Estimated onset: ~{countdown} minutes\n"

    msg += f"Risk level: {risk['risk_score']}/100 | Confidence: {risk['confidence']}%\n"
    msg += f"Alarm Severity: {severity}"

    return msg


def _build_safety_message(pattern_key: str) -> str:
    """Build the safety guidance message."""
    pattern = RISK_PATTERNS[pattern_key]
    steps = pattern["safety"]
    msg = f"{'='*40}\n"
    msg += f"🛡️ SAFETY GUIDANCE — {pattern['name']}\n"
    msg += f"{'='*40}\n\n"
    for i, step in enumerate(steps, 1):
        msg += f"{i}. {step}\n"
    msg += f"\n📞 Emergency: 112 (India) | 108 (Ambulance)\n"
    msg += f"📱 Follow local authorities for latest updates"
    return msg


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ALARM EVALUATION
# ═══════════════════════════════════════════════════════════════════════════════

async def run_alarm_evaluation():
    """
    Main entry point called by APScheduler every 15 minutes.

    Pipeline:
    1. Fetch weather for all user locations
    2. Run all risk detection patterns
    3. Filter by severity (only alarm for WARNING+)
    4. Check dedup (no duplicate alarms within 6 hours)
    5. Create alarm records in DB
    6. Dispatch notifications
    """
    logger.info("🚨 Alarm engine: starting evaluation cycle")
    db = get_supabase()

    # 1. Get all unique user locations
    ul_result = (
        db.table("user_locations")
        .select("user_id, location_id, locations(id, name, latitude, longitude)")
        .execute()
    )
    user_locations = ul_result.data or []

    if not user_locations:
        logger.info("🚨 Alarm engine: no user locations — nothing to evaluate")
        return

    # Group by location
    locations_map = {}
    for ul in user_locations:
        loc = ul.get("locations")
        if loc and loc["id"] not in locations_map:
            locations_map[loc["id"]] = {
                "location": loc,
                "user_ids": [],
            }
        if loc:
            locations_map[loc["id"]]["user_ids"].append(ul["user_id"])

    # 2. Fetch weather for each location
    weather_cache = {}
    for loc_id, info in locations_map.items():
        raw = await get_current_weather(info["location"])
        if raw is None:
            logger.warning(f"🚨 Alarm engine: no weather data for {info['location']['name']}")
            weather_cache[loc_id] = None
            continue

        # Normalize
        from weather.service import normalize_current
        current = normalize_current(raw)

        # Also get forecast
        raw_forecast = await get_forecast(info["location"], "daily")
        weather_cache[loc_id] = {
            "current": current,
            "forecast": raw_forecast or {},
            "raw_current": raw,
        }

    # 3. Run risk detection for each location
    alarms_fired = 0

    for loc_id, info in locations_map.items():
        weather = weather_cache.get(loc_id)
        if weather is None:
            continue

        current = weather["current"]
        forecast = weather["forecast"]
        location_name = info["location"]["name"]

        # Run all risk patterns
        for pattern_key, pattern in RISK_PATTERNS.items():
            detect_fn = globals().get(pattern["detect"])
            if detect_fn is None:
                continue

            risk = detect_fn(current, forecast)
            if risk is None:
                continue  # No risk detected

            # Only alarm for WARNING+ severity
            if risk["severity"] == SEVERITY_WATCH:
                logger.debug(
                    f"🚨 Watch-level [{pattern_key}] in {location_name} — "
                    f"score {risk['risk_score']} — skipping alarm (too low)"
                )
                continue

            # 4. Dedup check
            if _has_active_alarm(db, loc_id, pattern_key):
                logger.debug(
                    f"🚨 Dedup skip [{pattern_key}] for {location_name}"
                )
                continue

            # 5. Create alarm record
            message = _build_alarm_message(pattern_key, risk, location_name)
            safety = _build_safety_message(pattern_key)
            expires = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
            countdown = risk.get("countdown_minutes", 0)
            onset_time = (
                datetime.now(timezone.utc) + timedelta(minutes=countdown)
            ).isoformat() if countdown > 0 else None

            alarm_result = (
                db.table("weather_alarms")
                .insert({
                    "location_id": loc_id,
                    "pattern_key": pattern_key,
                    "pattern_name": pattern["name"],
                    "pattern_icon": pattern["icon"],
                    "severity": risk["severity"],
                    "risk_score": risk["risk_score"],
                    "confidence": risk["confidence"],
                    "factors": risk["factors"],
                    "message": message,
                    "safety_guidance": safety,
                    "countdown_minutes": countdown,
                    "onset_time": onset_time,
                    "expires_at": expires,
                })
                .execute()
            )

            # 6. Notify all users for this location
            alarm = alarm_result.data[0]
            for user_id in info["user_ids"]:
                # Create user-specific alarm reference
                db.table("user_alarms").insert({
                    "user_id": user_id,
                    "alarm_id": alarm["id"],
                    "acknowledged": False,
                }).execute()

            alarms_fired += 1
            logger.info(
                f"🚨 ALARM [{risk['severity']}] {pattern['name']} "
                f"in {location_name} — score {risk['risk_score']} "
                f"— notifying {len(info['user_ids'])} user(s)"
            )

    # 7. Expire old alarms
    _expire_old_alarms(db)

    logger.info(
        f"🚨 Alarm engine: cycle complete — {alarms_fired} alarm(s) fired "
        f"from {len(locations_map)} location(s)"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# DB HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _has_active_alarm(db, location_id: str, pattern_key: str) -> bool:
    """Check if an unexpired alarm of the same pattern exists for this location."""
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("weather_alarms")
        .select("id")
        .eq("location_id", location_id)
        .eq("pattern_key", pattern_key)
        .gte("expires_at", now)
        .limit(1)
        .execute()
    )
    return bool(result.data)


def _expire_old_alarms(db):
    """Log expired alarm count."""
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("weather_alarms")
        .select("id", count="exact")
        .lt("expires_at", now)
        .execute()
    )
    count = result.count or 0
    if count:
        logger.info(f"🚨 Alarm engine: {count} expired alarms in DB")


# ═══════════════════════════════════════════════════════════════════════════════
# MANUAL EVALUATION (for testing / on-demand)
# ═══════════════════════════════════════════════════════════════════════════════

async def evaluate_location(location_id: str) -> list[dict]:
    """
    Evaluate alarm risk for a single location on-demand.
    Returns a list of detected risks (even WATCH level).
    """
    db = get_supabase()
    loc_result = (
        db.table("locations")
        .select("id, name, latitude, longitude")
        .eq("id", location_id)
        .single()
        .execute()
    )
    if not loc_result.data:
        return []

    location = loc_result.data
    raw = await get_current_weather(location)
    if raw is None:
        return []

    from weather.service import normalize_current
    current = normalize_current(raw)
    raw_forecast = await get_forecast(location, "daily")
    forecast = raw_forecast or {}

    results = []
    for pattern_key, pattern in RISK_PATTERNS.items():
        detect_fn = globals().get(pattern["detect"])
        if detect_fn is None:
            continue

        risk = detect_fn(current, forecast)
        if risk is None:
            continue

        results.append({
            "pattern_key": pattern_key,
            "pattern_name": pattern["name"],
            "pattern_icon": pattern["icon"],
            "severity": risk["severity"],
            "risk_score": risk["risk_score"],
            "confidence": risk["confidence"],
            "factors": risk["factors"],
            "countdown_minutes": risk.get("countdown_minutes", 0),
            "safety": pattern["safety"],
        })

    # Sort by risk score descending
    results.sort(key=lambda x: x["risk_score"], reverse=True)
    return results
