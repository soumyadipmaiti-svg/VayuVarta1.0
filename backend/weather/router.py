"""
Vayu Varta — Weather Router
Routes: /api/v1/weather/*
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from auth.router import get_current_user
from database import get_supabase
from weather.service import (
    get_current_weather,
    get_forecast,
    get_stale_forecast,
    get_historical_averages,
    normalize_current,
    normalize_daily_forecast,
    normalize_hourly_forecast,
    geocode_location,
)

router = APIRouter(prefix="/weather", tags=["weather"])


def _get_location(location_id: str) -> dict:
    """Fetch a location row by ID or raise 404."""
    db = get_supabase()
    result = (
        db.table("locations")
        .select("id, name, latitude, longitude")
        .eq("id", location_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Location not found")
    return result.data


def _stale_fetched_at(location_id: str, forecast_type: str) -> str:
    """Timestamp of the newest cached forecast row (for the stale badge)."""
    db = get_supabase()
    row = (
        db.table("forecasts")
        .select("fetched_at")
        .eq("location_id", location_id)
        .eq("forecast_type", forecast_type)
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    if row.data:
        return str(row.data[0]["fetched_at"]).replace("T", " ").split(".")[0] + " UTC"
    return "earlier"


# ── GET /weather/geocode ──────────────────────────────────────────────────────
@router.get("/geocode")
async def search_locations(
    q: str = Query(..., min_length=2, description="City name to search"),
    count: int = Query(8, ge=1, le=20, description="Max results"),
    user: dict = Depends(get_current_user),
):
    """
    Search for locations by city name using Open-Meteo Geocoding.
    Returns a list of matching places with coordinates.
    """
    results = await geocode_location(q, count=count)
    return {"results": results}


# ── GET /weather/current ──────────────────────────────────────────────────────
@router.get("/current")
async def current_weather(
    location_id: str = Query(..., description="UUID of the location"),
    user: dict = Depends(get_current_user),
):
    """
    Return current weather conditions for a saved location.
    Data is served from a 10-minute cache; falls back to stale cache on API failure.
    """
    location = _get_location(location_id)
    raw = await get_current_weather(location)

    if raw is None:
        # Try serving stale cached data with a warning
        db = get_supabase()
        stale = (
            db.table("weather_data")
            .select("raw_json, fetched_at")
            .eq("location_id", location_id)
            .order("fetched_at", desc=True)
            .limit(1)
            .execute()
        )
        if stale.data:
            normalized = normalize_current(stale.data[0]["raw_json"])
            normalized["data_warning"] = (
                f"Weather API is temporarily unavailable. "
                f"Showing cached data from {stale.data[0]['fetched_at']}."
            )
            return normalized
        raise HTTPException(
            status_code=502,
            detail="Weather data is currently unavailable. Please try again shortly.",
        )

    return normalize_current(raw)


# ── GET /weather/forecast ─────────────────────────────────────────────────────
@router.get("/forecast")
async def forecast(
    location_id: str = Query(..., description="UUID of the location"),
    type: str = Query("daily", description="hourly | daily | extended"),
    user: dict = Depends(get_current_user),
):
    """
    Return weather forecast for a location.
    type=hourly  → next ~48 hours
    type=daily   → 7-day forecast
    type=extended→ 16-day outlook (lower confidence — labelled accordingly)
    """
    if type not in ("hourly", "daily", "extended"):
        raise HTTPException(
            status_code=400, detail="type must be one of: hourly, daily, extended"
        )

    location = _get_location(location_id)
    raw = await get_forecast(location, forecast_type=type)

    if raw is None:
        # Open-Meteo unreachable (rate limit / outage) — serve the last good
        # forecast from cache so users never see a hard error.
        stale = get_stale_forecast(location_id, type)
        if stale is not None:
            fetched_at = _stale_fetched_at(location_id, type)
            if type == "hourly":
                hours = normalize_hourly_forecast(stale)
                return {
                    "type": "hourly",
                    "hours": hours,
                    "source": "Open-Meteo (cached)",
                    "data_warning": (
                        f"Live forecast is temporarily unavailable — showing the "
                        f"last good forecast from {fetched_at}."
                    ),
                }
            days = normalize_daily_forecast(stale)
            response = {
                "type": type,
                "days": days,
                "source": "Open-Meteo (cached)",
                "data_warning": (
                    f"Live forecast is temporarily unavailable — showing the "
                    f"last good forecast from {fetched_at}."
                ),
            }
            if type == "extended":
                response["confidence_note"] = (
                    "Extended Outlook — lower confidence. "
                    "Accuracy decreases significantly beyond 7 days."
                )
            return response

        raise HTTPException(
            status_code=502,
            detail="Forecast data is currently unavailable. Please try again shortly.",
        )

    if type == "hourly":
        hours = normalize_hourly_forecast(raw)
        return {"type": "hourly", "hours": hours, "source": "Open-Meteo"}

    days = normalize_daily_forecast(raw)
    response = {"type": type, "days": days, "source": "Open-Meteo"}

    if type == "extended":
        response["confidence_note"] = (
            "Extended Outlook — lower confidence. "
            "Accuracy decreases significantly beyond 7 days."
        )

    return response


# ── GET /weather/historical ───────────────────────────────────────────────────
@router.get("/historical")
async def historical(
    location_id: str = Query(..., description="UUID of the location"),
    month: int = Query(..., ge=1, le=12, description="Month number (1-12)"),
    user: dict = Depends(get_current_user),
):
    """
    Return historical climate averages for a location and month.
    Data comes from the pre-seeded climate_data table.
    Clearly labelled as 'Climate Averages', separate from forecast data.
    """
    data = get_historical_averages(location_id, month)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No historical climate data available for this location and month. "
                "Run seed_climate.py to seed sample data."
            ),
        )
    return {
        **data,
        "data_type": "Climate Averages",
        "note": "Historical monthly averages — not a forecast.",
    }
