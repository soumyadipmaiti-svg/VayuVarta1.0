"""
Vayu Varta — Weather Service
Fetches current conditions and forecasts from Open-Meteo (free, no API key) with DB caching.
"""

import httpx
import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta

from config import settings
from database import get_supabase

logger = logging.getLogger("weather.service")

# ── WMO Weather Code → Human-readable description + icon ─────────────────────
WMO_CODES = {
    0: ("Clear sky", "☀️"),
    1: ("Mainly clear", "🌤️"),
    2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Foggy", "🌫️"),
    48: ("Rime fog", "🌫️"),
    51: ("Light drizzle", "🌦️"),
    53: ("Moderate drizzle", "🌦️"),
    55: ("Dense drizzle", "🌧️"),
    56: ("Freezing drizzle", "🌧️"),
    57: ("Heavy freezing drizzle", "🌧️"),
    61: ("Slight rain", "🌦️"),
    63: ("Moderate rain", "🌧️"),
    65: ("Heavy rain", "🌧️"),
    66: ("Freezing rain", "🌧️"),
    67: ("Heavy freezing rain", "🌧️"),
    71: ("Slight snow", "🌨️"),
    73: ("Moderate snow", "🌨️"),
    75: ("Heavy snow", "❄️"),
    77: ("Snow grains", "❄️"),
    80: ("Slight showers", "🌦️"),
    81: ("Moderate showers", "🌧️"),
    82: ("Violent showers", "⛈️"),
    85: ("Slight snow showers", "🌨️"),
    86: ("Heavy snow showers", "❄️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm with hail", "⛈️"),
    99: ("Thunderstorm with heavy hail", "⛈️"),
}


def _describe_wmo(code: int | None) -> tuple[str, str]:
    """Convert WMO weather code to (description, emoji)."""
    if code is None:
        return ("Unknown", "❓")
    return WMO_CODES.get(code, ("Unknown", "❓"))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cache_cutoff() -> str:
    """ISO timestamp for the cache freshness boundary."""
    return (
        datetime.now(timezone.utc)
        - timedelta(seconds=settings.weather_cache_ttl_seconds)
    ).isoformat()


# ── Open-Meteo fetch with retry + backoff + in-memory dedupe/cache ──────────

# In-memory cache: {(lat, lon, sorted params) -> (timestamp, payload)}
# Lets Dashboard + Forecast + VayuGPT + the alarm engine share ONE fetch per
# location per minute instead of hammering Open-Meteo 4x in the same second
# (the #1 cause of the 429 Too Many Requests → 502 "can't fetch weather").
_mem_cache: dict[str, tuple[float, dict]] = {}
MEM_CACHE_TTL_SECONDS = 60
# In-flight dedupe: {(lat, lon, sorted params) -> asyncio.Task}
_inflight: dict[str, asyncio.Task] = {}


def _cache_key(params: dict) -> str:
    """Stable cache key from the request params (dict order-independent)."""
    return "|".join(
        f"{k}={sorted(v) if isinstance(v, (list, tuple)) else v}"
        for k, v in sorted(params.items())
    )


async def _fetch_open_meteo_forecast(
    params: dict, timeout: float = 15.0, max_attempts: int = 6
) -> dict | None:
    """
    GET /forecast from Open-Meteo with retry + exponential backoff.

    Render's free-tier shares its egress IP with thousands of other services,
    so Open-Meteo intermittently answers 429 Too Many Requests. Waiting a
    moment and retrying usually gets through — and if every attempt fails,
    the caller falls back to stale cache instead of erroring at the user.

    Every call is also deduped in-process: if the exact same request is
    already in flight, we await that task instead of firing a second
    Open-Meteo request; successful results are memoized for 60s so the
    Dashboard + Forecast + VayuGPT + alarm engine share one fetch.
    """
    key = _cache_key(params)

    # 1. Serve from the 60s in-memory cache (fast path — no network at all).
    hit = _mem_cache.get(key)
    if hit and (time.monotonic() - hit[0]) < MEM_CACHE_TTL_SECONDS:
        return hit[1]

    # 2. Reuse an in-flight request for the same params (thundering herd).
    existing = _inflight.get(key)
    if existing and not existing.done():
        try:
            return await existing
        except Exception:
            pass

    delays = [0.0, 1.0, 2.0, 4.0, 8.0, 12.0]  # pause before retry 1..5
    last_error: Exception | None = None

    async def _do_fetch():
        nonlocal last_error
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(max_attempts):
                if delays[attempt]:
                    await asyncio.sleep(delays[attempt])
                try:
                    resp = await client.get(
                        f"{settings.weather_api_base_url}/forecast", params=params
                    )
                    if resp.status_code == 429:
                        last_error = httpx.HTTPStatusError(
                            "429 Too Many Requests",
                            request=resp.request,
                            response=resp,
                        )
                        logger.warning(
                            f"Open-Meteo 429 (attempt {attempt + 1}/{max_attempts}) — backing off"
                        )
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    # Memoize the successful payload for 60s.
                    _mem_cache[key] = (time.monotonic(), data)
                    return data
                except httpx.HTTPStatusError as exc:
                    last_error = exc
                    if exc.response.status_code >= 500:
                        logger.warning(
                            f"Open-Meteo {exc.response.status_code} (attempt {attempt + 1}/{max_attempts}) — retrying"
                        )
                        continue
                    logger.error(f"Open-Meteo fetch failed: {exc}")
                    return None
                except httpx.HTTPError as exc:
                    last_error = exc
                    logger.warning(
                        f"Open-Meteo network error (attempt {attempt + 1}/{max_attempts}): {exc}"
                    )
                    continue
                except Exception as exc:
                    logger.error(f"Unexpected error fetching Open-Meteo: {exc}")
                    return None

        logger.error(f"Open-Meteo failed after {max_attempts} attempts: {last_error}")
        return None

    task = asyncio.ensure_future(_do_fetch())
    _inflight[key] = task
    try:
        return await task
    finally:
        _inflight.pop(key, None)


def get_stale_forecast(location_id: str, forecast_type: str) -> dict | None:
    """
    Return the most recent cached forecast for a location, ignoring TTL.
    Used when Open-Meteo is unreachable (rate limit / outage) so users still
    see the last good forecast instead of an error.
    """
    db = get_supabase()
    stale = (
        db.table("forecasts")
        .select("raw_json, fetched_at")
        .eq("location_id", location_id)
        .eq("forecast_type", forecast_type)
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    return stale.data[0]["raw_json"] if stale.data else None


# ── Current Weather ───────────────────────────────────────────────────────────

async def get_current_weather(location: dict) -> dict | None:
    """
    Return current weather for a location using Open-Meteo.
    Reads from DB cache if fresh; otherwise calls Open-Meteo and caches.
    Returns the raw Open-Meteo JSON (or None on failure).
    """
    db = get_supabase()
    location_id = location["id"]

    # 1. Check cache
    cached = (
        db.table("weather_data")
        .select("raw_json, fetched_at")
        .eq("location_id", location_id)
        .gte("fetched_at", _cache_cutoff())
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    if cached.data:
        logger.debug(f"Cache hit for current weather: {location['name']}")
        return cached.data[0]["raw_json"]

    # 2. Fetch from Open-Meteo (with retry/backoff for 429s)
    data = await _fetch_open_meteo_forecast(
        {
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "current": ",".join([
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "precipitation",
                "weather_code",
                "cloud_cover",
                "wind_speed_10m",
                "wind_direction_10m",
                "pressure_msl",
                "is_day",
            ]),
            "daily": ",".join([
                "temperature_2m_max",
                "temperature_2m_min",
                "sunrise",
                "sunset",
            ]),
            "timezone": "auto",
            "forecast_days": 1,
        },
        timeout=10,
    )
    if data is None:
        return None

    # Attach location metadata
    data["_location_name"] = location["name"]
    data["_latitude"] = location["latitude"]
    data["_longitude"] = location["longitude"]

    # 3. Store in cache
    try:
        db.table("weather_data").insert(
            {"location_id": location_id, "raw_json": data}
        ).execute()
    except Exception as exc:
        logger.warning(f"Failed to cache weather data: {exc}")

    return data


# ── Forecast ──────────────────────────────────────────────────────────────────

async def get_forecast(location: dict, forecast_type: str = "daily") -> dict | None:
    """
    Return forecast data for a location using Open-Meteo.
    forecast_type: 'hourly' | 'daily' | 'extended'
    Cached in the forecasts table.
    """
    db = get_supabase()
    location_id = location["id"]

    # 1. Check cache
    cached = (
        db.table("forecasts")
        .select("raw_json, fetched_at")
        .eq("location_id", location_id)
        .eq("forecast_type", forecast_type)
        .gte("fetched_at", _cache_cutoff())
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    if cached.data:
        logger.debug(f"Cache hit for forecast [{forecast_type}]: {location['name']}")
        return cached.data[0]["raw_json"]

    # 2. Determine forecast days
    days = {"hourly": 7, "daily": 7, "extended": 16}.get(forecast_type, 7)

    # 3. Fetch from Open-Meteo
    params = {
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "daily": ",".join([
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "apparent_temperature_max",
            "apparent_temperature_min",
            "precipitation_sum",
            "precipitation_probability_max",
            "wind_speed_10m_max",
            "uv_index_max",
            "sunrise",
            "sunset",
        ]),
        "timezone": "auto",
        "forecast_days": days,
    }

    if forecast_type == "hourly":
        params["hourly"] = ",".join([
            "temperature_2m",
            "relative_humidity_2m",
            "apparent_temperature",
            "precipitation_probability",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
            "is_day",
        ])

    # 3. Fetch from Open-Meteo (with retry/backoff for 429s)
    data = await _fetch_open_meteo_forecast(params, timeout=15)
    if data is None:
        return None

    # Attach metadata
    data["_location_name"] = location["name"]
    data["_forecast_type"] = forecast_type

    # 4. Cache result
    try:
        db.table("forecasts").insert(
            {
                "location_id": location_id,
                "forecast_type": forecast_type,
                "raw_json": data,
            }
        ).execute()
    except Exception as exc:
        logger.warning(f"Failed to cache forecast: {exc}")

    return data


# ── Historical / Climate ──────────────────────────────────────────────────────
def get_historical_averages(location_id: str, month: int) -> dict | None:
    """
    Return pre-seeded monthly climate averages for a location from DB.
    Returns None if no data is found (not an error — just no data).
    """
    db = get_supabase()
    result = (
        db.table("climate_data")
        .select("month, avg_temp, avg_rainfall")
        .eq("location_id", location_id)
        .eq("month", month)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


# ── Normalize helpers (for Open-Meteo responses) ─────────────────────────────

def normalize_current(raw: dict) -> dict:
    """Extract key fields from an Open-Meteo current weather response."""
    cur = raw.get("current", {})
    daily = raw.get("daily", {})
    weather_code = cur.get("weather_code")
    description, icon = _describe_wmo(weather_code)

    return {
        "location": raw.get("_location_name", ""),
        "region": "",
        "country": "",
        "localtime": cur.get("time", ""),
        "temp_c": cur.get("temperature_2m"),
        "feels_like_c": cur.get("apparent_temperature"),
        "humidity": cur.get("relative_humidity_2m"),
        "wind_kph": cur.get("wind_speed_10m"),
        "wind_dir": _degrees_to_compass(cur.get("wind_direction_10m")),
        "pressure_mb": cur.get("pressure_msl"),
        "visibility_km": 10,  # Open-Meteo doesn't provide visibility; default good
        "uv_index": daily.get("uv_index_max", [None])[0],
        "cloud_coverage": cur.get("cloud_cover"),
        "rain_mm": cur.get("precipitation"),
        "condition": description,
        "condition_text": description,
        "condition_icon": icon,
        "is_day": bool(cur.get("is_day", 1)),
        "sunrise": _safe_list_first(daily.get("sunrise")),
        "sunset": _safe_list_first(daily.get("sunset")),
        "aqi_us_epa": None,
        "aqi_gb_defra": None,
        "source": "Open-Meteo (Free)",
    }


def normalize_daily_forecast(raw: dict) -> list[dict]:
    """Extract daily forecast rows from an Open-Meteo response."""
    daily = raw.get("daily", {})
    dates = daily.get("time", [])
    days = []
    for i, date in enumerate(dates):
        weather_code = _safe_list_get(daily.get("weather_code"), i)
        description, icon = _describe_wmo(weather_code)
        days.append(
            {
                "date": date,
                "max_temp_c": _safe_list_get(daily.get("temperature_2m_max"), i),
                "min_temp_c": _safe_list_get(daily.get("temperature_2m_min"), i),
                "avg_temp_c": (
                    (_safe_list_get(daily.get("temperature_2m_max"), i) or 0)
                    + (_safe_list_get(daily.get("temperature_2m_min"), i) or 0)
                ) / 2,
                "rain_probability": _safe_list_get(daily.get("precipitation_probability_max"), i),
                "total_precip_mm": _safe_list_get(daily.get("precipitation_sum"), i),
                "avg_humidity": None,  # Not available in daily Open-Meteo
                "max_wind_kph": _safe_list_get(daily.get("wind_speed_10m_max"), i),
                "uv_index": _safe_list_get(daily.get("uv_index_max"), i),
                "condition": description,
                "condition_text": description,
                "condition_icon": icon,
                "sunrise": _safe_list_get(daily.get("sunrise"), i),
                "sunset": _safe_list_get(daily.get("sunset"), i),
                "source": "Open-Meteo",
            }
        )
    return days


def normalize_hourly_forecast(raw: dict) -> list[dict]:
    """Extract hourly forecast rows from an Open-Meteo response."""
    hourly = raw.get("hourly", {})
    times = hourly.get("time", [])
    hours = []
    for i, time_str in enumerate(times):
        weather_code = _safe_list_get(hourly.get("weather_code"), i)
        description, icon = _describe_wmo(weather_code)
        hours.append(
            {
                "time": time_str,
                "temp_c": _safe_list_get(hourly.get("temperature_2m"), i),
                "feels_like_c": _safe_list_get(hourly.get("apparent_temperature"), i),
                "humidity": _safe_list_get(hourly.get("relative_humidity_2m"), i),
                "wind_kph": _safe_list_get(hourly.get("wind_speed_10m"), i),
                "rain_probability": _safe_list_get(hourly.get("precipitation_probability"), i),
                "precip_mm": _safe_list_get(hourly.get("precipitation"), i),
                "condition": description,
                "condition_text": description,
                "condition_icon": icon,
                "is_day": bool(_safe_list_get(hourly.get("is_day"), i)),
                "source": "Open-Meteo",
            }
        )
    return hours


# ── Geocoding ────────────────────────────────────────────────────────────────

async def geocode_location(query: str, count: int = 8) -> list[dict]:
    """
    Search for locations by name using Open-Meteo Geocoding API.
    Returns a list of {name, latitude, longitude, country, admin1}.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{settings.geocoding_api_base_url}/search",
                params={
                    "name": query,
                    "count": count,
                    "language": "en",
                    "format": "json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error(f"Geocoding failed for '{query}': {exc}")
        return []

    results = []
    for place in data.get("results", []):
        results.append({
            "name": place.get("name", ""),
            "latitude": place.get("latitude"),
            "longitude": place.get("longitude"),
            "country": place.get("country", ""),
            "admin1": place.get("admin1", ""),  # State/province
            "timezone": place.get("timezone", ""),
            "display": _format_place(place),
        })
    return results


# ── Private helpers ───────────────────────────────────────────────────────────

def _safe_list_first(lst):
    """Get first element of a list or None."""
    if isinstance(lst, list) and len(lst) > 0:
        return lst[0]
    return None


def _safe_list_get(lst, index):
    """Get element at index from a list, or None."""
    if isinstance(lst, list) and len(lst) > index:
        return lst[index]
    return None


def _degrees_to_compass(degrees):
    """Convert wind direction in degrees to compass direction."""
    if degrees is None:
        return ""
    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    idx = round(degrees / 22.5) % 16
    return directions[idx]


def _format_place(place: dict) -> str:
    """Format a geocoding result for display."""
    parts = [place.get("name", "")]
    if place.get("admin1"):
        parts.append(place["admin1"])
    if place.get("country"):
        parts.append(place["country"])
    return ", ".join(parts)
