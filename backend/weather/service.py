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


# ── MET Norway fallback provider (free, keyless, HTTPS) ──────────────────────
# When Open-Meteo is unreachable (sustained 429 against Render's shared egress
# IP), we fall back to MET Norway's Locationforecast 2.0 — free, no key, and
# reached over HTTPS like every other API that works from Render. Its response
# is reshaped into the exact Open-Meteo format the rest of the pipeline
# (normalizers, DB cache, frontend) already understands, so nothing downstream
# changes. MET's terms of service require an identifying User-Agent.
MET_BASE_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete"
MET_USER_AGENT = "VayuVarta/1.0 (github.com/soumyadipmaiti-svg/VayuVarta1.0)"

_met_cache: dict[str, tuple[float, dict]] = {}
_met_inflight: dict[str, asyncio.Task] = {}

# MET symbol_code (prefix before _day/_night) → WMO weather code.
_SYMBOL_TO_WMO: list[tuple[str, int]] = [
    ("heavyrainshowersandthunder", 82),
    ("rainshowersandthunder", 81),
    ("lightrainshowersandthunder", 80),
    ("heavysleetshowersandthunder", 82),
    ("sleetshowersandthunder", 81),
    ("lightsleetshowersandthunder", 80),
    ("heavysnowshowersandthunder", 86),
    ("snowshowersandthunder", 85),
    ("lightsnowshowersandthunder", 85),
    ("heavyrainshowers", 82),
    ("rainshowers", 81),
    ("lightrainshowers", 80),
    ("heavysleetshowers", 67),
    ("sleetshowers", 66),
    ("lightsleetshowers", 66),
    ("heavysnowshowers", 86),
    ("snowshowers", 85),
    ("lightsnowshowers", 85),
    ("heavyrainandthunder", 65),
    ("rainandthunder", 63),
    ("lightrainandthunder", 61),
    ("heavyrain", 65),
    ("rain", 63),
    ("lightrain", 51),
    ("heavysleet", 67),
    ("sleet", 66),
    ("lightsleet", 66),
    ("heavysnow", 75),
    ("snow", 73),
    ("lightsnow", 71),
    ("fog", 45),
    ("cloudy", 3),
    ("partlycloudy", 2),
    ("fair", 1),
    ("clearsky", 0),
]


def _symbol_to_wmo(symbol_code: str | None) -> int | None:
    """Map a MET Norway symbol_code to the WMO code the UI expects."""
    if not symbol_code:
        return None
    base = symbol_code.split("_")[0]
    for prefix, wmo in _SYMBOL_TO_WMO:
        if base.startswith(prefix):
            return wmo
    return None


def _apparent_temperature(t_c: float, rh: float, wind_ms: float) -> float:
    """Steadman/Australian AT approximation (same formula Open-Meteo uses)."""
    e = (rh / 100.0) * 6.105 * (2.718281828 ** (17.27 * t_c / (237.7 + t_c)))
    return t_c + 0.33 * e - 0.70 * wind_ms - 4.00


async def _fetch_met_complete(lat: float, lon: float) -> dict | None:
    """
    GET MET Norway Locationforecast 2.0 'complete' (hourly + 6-hourly data).
    Memoized for 60s and deduped in-flight, same pattern as Open-Meteo.
    Returns the raw MET JSON or None.
    """
    key = f"{round(lat, 2)},{round(lon, 2)}"

    hit = _met_cache.get(key)
    if hit and (time.monotonic() - hit[0]) < MEM_CACHE_TTL_SECONDS:
        return hit[1]

    existing = _met_inflight.get(key)
    if existing and not existing.done():
        try:
            return await existing
        except Exception:
            pass

    async def _do():
        try:
            async with httpx.AsyncClient(
                timeout=15,
                headers={"User-Agent": MET_USER_AGENT},
            ) as client:
                resp = await client.get(
                    MET_BASE_URL,
                    params={"lat": round(lat, 4), "lon": round(lon, 4)},
                )
                resp.raise_for_status()
                data = resp.json()
                _met_cache[key] = (time.monotonic(), data)
                return data
        except Exception as exc:
            logger.warning(f"MET Norway fallback fetch failed: {exc}")
            return None

    task = asyncio.ensure_future(_do())
    _met_inflight[key] = task
    try:
        return await task
    finally:
        _met_inflight.pop(key, None)


def _met_entries(met: dict) -> list[dict]:
    """Flatten MET timeseries entries sorted by time."""
    return sorted(
        met.get("properties", {}).get("timeseries", []),
        key=lambda e: e.get("time", ""),
    )


def _met_shape_current(met: dict, location: dict) -> dict | None:
    """Reshape MET data into the Open-Meteo 'current + daily' format."""
    entries = _met_entries(met)
    if not entries:
        return None

    now = datetime.now(timezone.utc)

    def _entry_time(e: dict) -> datetime:
        return datetime.fromisoformat(e["time"].replace("Z", "+00:00"))

    closest = min(entries, key=lambda e: abs((_entry_time(e) - now).total_seconds()))
    details = closest.get("data", {}).get("instant", {}).get("details", {})
    next_1h = closest.get("data", {}).get("next_1_hours", {}) or \
        closest.get("data", {}).get("next_6_hours", {}) or {}

    t = details.get("air_temperature")
    rh = details.get("relative_humidity")
    wind_ms = details.get("wind_speed")

    # Today's max/min from the hourly entries (UTC date boundary — close enough).
    today = now.strftime("%Y-%m-%d")
    day_temps = [
        e["data"]["instant"]["details"].get("air_temperature")
        for e in entries
        if e.get("time", "").startswith(today)
        and e.get("data", {}).get("instant", {}).get("details", {}).get("air_temperature") is not None
    ]

    return {
        "current": {
            "time": closest.get("time", ""),
            "temperature_2m": t,
            "relative_humidity_2m": rh,
            "apparent_temperature": (
                _apparent_temperature(t, rh or 50, wind_ms or 0)
                if t is not None else None
            ),
            "precipitation": next_1h.get("details", {}).get("precipitation_amount"),
            "weather_code": _symbol_to_wmo(
                next_1h.get("summary", {}).get("symbol_code")
            ),
            "cloud_cover": details.get("cloud_area_fraction"),
            "wind_speed_10m": (wind_ms * 3.6) if wind_ms is not None else None,
            "wind_direction_10m": details.get("wind_from_direction"),
            "pressure_msl": details.get("air_pressure_at_sea_level"),
            "is_day": 1,  # MET has no day flag on instants; UI treats 1 as day
        },
        "daily": {
            "temperature_2m_max": [max(day_temps)] if day_temps else [None],
            "temperature_2m_min": [min(day_temps)] if day_temps else [None],
            "uv_index_max": [None],
            "sunrise": [None],
            "sunset": [None],
        },
        "_location_name": location["name"],
        "_latitude": location["latitude"],
        "_longitude": location["longitude"],
        "_source": "MET Norway (fallback)",
    }


def _met_shape_daily(met: dict, max_days: int) -> dict | None:
    """Reshape MET data into the Open-Meteo 'daily' forecast format."""
    entries = _met_entries(met)
    if not entries:
        return None

    per_day: dict[str, list[dict]] = {}
    for e in entries:
        date = e.get("time", "")[:10]
        det = e.get("data", {}).get("instant", {}).get("details", {})
        n1 = e.get("data", {}).get("next_1_hours", {}) or {}
        per_day.setdefault(date, []).append({
            "details": det,
            "symbol": n1.get("summary", {}).get("symbol_code"),
            "precip": n1.get("details", {}).get("precipitation_amount"),
            "prob": n1.get("details", {}).get("probability_of_precipitation"),
        })

    dates = sorted(per_day)[:max_days]
    daily: dict[str, list] = {k: [] for k in (
        "time", "weather_code", "temperature_2m_max", "temperature_2m_min",
        "apparent_temperature_max", "apparent_temperature_min",
        "precipitation_sum", "precipitation_probability_max",
        "wind_speed_10m_max", "uv_index_max", "sunrise", "sunset",
    )}

    for date in dates:
        rows = per_day[date]
        temps = [r["details"].get("air_temperature") for r in rows]
        winds = [r["details"].get("wind_speed") for r in rows]
        probs = [r["prob"] for r in rows if r["prob"] is not None]
        symbols = [r["symbol"] for r in rows if r["symbol"]]
        # Midday symbol best represents the day's weather.
        day_symbol = symbols[len(symbols) // 2] if symbols else None

        ats = [
            _apparent_temperature(t, r["details"].get("relative_humidity") or 50,
                                  r["details"].get("wind_speed") or 0)
            for r, t in zip(rows, temps) if t is not None
        ]

        daily["time"].append(date)
        daily["weather_code"].append(_symbol_to_wmo(day_symbol))
        daily["temperature_2m_max"].append(max([t for t in temps if t is not None], default=None))
        daily["temperature_2m_min"].append(min([t for t in temps if t is not None], default=None))
        daily["apparent_temperature_max"].append(max(ats, default=None))
        daily["apparent_temperature_min"].append(min(ats, default=None))
        daily["precipitation_sum"].append(
            round(sum(r["precip"] or 0 for r in rows), 1)
        )
        daily["precipitation_probability_max"].append(max(probs) if probs else None)
        daily["wind_speed_10m_max"].append(
            (max(w for w in winds if w is not None) * 3.6)
            if any(w is not None for w in winds) else None
        )
        daily["uv_index_max"].append(None)
        daily["sunrise"].append(None)
        daily["sunset"].append(None)

    return {"daily": daily, "_source": "MET Norway (fallback)"}


def _met_shape_hourly(met: dict, max_hours: int) -> dict | None:
    """Reshape MET data into the Open-Meteo 'hourly' forecast format."""
    entries = _met_entries(met)
    times: list[str] = []
    cols: dict[str, list] = {
        "temperature_2m": [], "relative_humidity_2m": [],
        "apparent_temperature": [], "precipitation_probability": [],
        "precipitation": [], "weather_code": [], "wind_speed_10m": [],
        "is_day": [],
    }
    for e in entries:
        n1 = e.get("data", {}).get("next_1_hours")
        if not n1:
            continue  # only true hourly entries (first ~56 hours)
        det = e.get("data", {}).get("instant", {}).get("details", {})
        t = det.get("air_temperature")
        rh = det.get("relative_humidity")
        wind_ms = det.get("wind_speed")
        times.append(e["time"][:16].replace("Z", ""))
        cols["temperature_2m"].append(t)
        cols["relative_humidity_2m"].append(rh)
        cols["apparent_temperature"].append(
            _apparent_temperature(t, rh or 50, wind_ms or 0) if t is not None else None
        )
        cols["precipitation_probability"].append(
            n1.get("details", {}).get("probability_of_precipitation")
        )
        cols["precipitation"].append(n1.get("details", {}).get("precipitation_amount"))
        cols["weather_code"].append(_symbol_to_wmo(n1.get("summary", {}).get("symbol_code")))
        cols["wind_speed_10m"].append((wind_ms * 3.6) if wind_ms is not None else None)
        cols["is_day"].append(1)
        if len(times) >= max_hours:
            break

    if not times:
        return None
    return {"hourly": {"time": times, **cols}, "_source": "MET Norway (fallback)"}


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
        # Open-Meteo unreachable (rate limit / outage) — try MET Norway so
        # users still get LIVE weather instead of stale cache.
        met = await _fetch_met_complete(location["latitude"], location["longitude"])
        if met is not None:
            shaped = _met_shape_current(met, location)
            if shaped is not None:
                logger.info(
                    f"Serving current weather from MET Norway fallback: {location['name']}"
                )
                try:
                    db.table("weather_data").insert(
                        {"location_id": location_id, "raw_json": shaped}
                    ).execute()
                except Exception as exc:
                    logger.warning(f"Failed to cache MET weather data: {exc}")
                return shaped
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
        # Open-Meteo unreachable — try MET Norway so users get LIVE data,
        # not just the stale cache (fixes the "temporarily unavailable"
        # banner persisting all day during sustained rate-limit windows).
        met = await _fetch_met_complete(location["latitude"], location["longitude"])
        if met is not None:
            if forecast_type == "hourly":
                shaped = _met_shape_hourly(met, days * 24)
            else:
                shaped = _met_shape_daily(met, days)
            if shaped is not None:
                logger.info(
                    f"Serving forecast [{forecast_type}] from MET Norway fallback: {location['name']}"
                )
                try:
                    db.table("forecasts").insert(
                        {
                            "location_id": location_id,
                            "forecast_type": forecast_type,
                            "raw_json": shaped,
                        }
                    ).execute()
                except Exception as exc:
                    logger.warning(f"Failed to cache MET forecast: {exc}")
                return shaped
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
