"""
WeatherGPT — Locations Router
Routes: /api/v1/locations/*
Handles saving, listing, updating, and removing user locations.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from auth.router import get_current_user
from database import get_supabase

router = APIRouter(prefix="/locations", tags=["locations"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class AddLocationRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    label: str | None = Field(None, max_length=50, description="e.g. Home, College")


class UpdateLabelRequest(BaseModel):
    label: str | None = Field(None, max_length=50)


# ── Helper ────────────────────────────────────────────────────────────────────
def _get_user_location(db, user_id: str, location_id: str) -> dict:
    """Return the user_locations row or raise 404."""
    result = (
        db.table("user_locations")
        .select("id, user_id, location_id, label, is_default")
        .eq("user_id", user_id)
        .eq("location_id", location_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Location not found in your saved list")
    return result.data[0]


# ── GET /locations ────────────────────────────────────────────────────────────
@router.get("")
async def list_locations(user: dict = Depends(get_current_user)):
    """List all locations saved by the current user."""
    db = get_supabase()
    result = (
        db.table("user_locations")
        .select("id, label, is_default, locations(id, name, latitude, longitude)")
        .eq("user_id", user["id"])
        .execute()
    )
    return [
        {
            "user_location_id": row["id"],
            "label": row["label"],
            "is_default": row["is_default"],
            **row["locations"],
        }
        for row in (result.data or [])
    ]


# ── POST /locations ───────────────────────────────────────────────────────────
@router.post("", status_code=201)
async def add_location(
    body: AddLocationRequest, user: dict = Depends(get_current_user)
):
    """
    Add a location to the user's saved list.
    De-duplicates the global locations table by lat/lng.
    The first location saved automatically becomes the default.
    """
    db = get_supabase()
    user_id = user["id"]

    # 1. Upsert into global locations (de-duplicate by lat/lng)
    existing_loc = (
        db.table("locations")
        .select("id")
        .eq("latitude", body.latitude)
        .eq("longitude", body.longitude)
        .limit(1)
        .execute()
    )
    if existing_loc.data:
        location_id = existing_loc.data[0]["id"]
    else:
        new_loc = (
            db.table("locations")
            .insert({"name": body.name, "latitude": body.latitude, "longitude": body.longitude})
            .execute()
        )
        location_id = new_loc.data[0]["id"]

    # 2. Check if user already saved this location
    already = (
        db.table("user_locations")
        .select("id")
        .eq("user_id", user_id)
        .eq("location_id", location_id)
        .limit(1)
        .execute()
    )
    if already.data:
        raise HTTPException(status_code=409, detail="Location already in your saved list")

    # 3. If no existing saved locations → make this the default
    existing_saved = (
        db.table("user_locations")
        .select("id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    is_default = len(existing_saved.data or []) == 0

    # 4. Insert user_location
    row = (
        db.table("user_locations")
        .insert(
            {
                "user_id": user_id,
                "location_id": location_id,
                "label": body.label,
                "is_default": is_default,
            }
        )
        .execute()
    )
    ul = row.data[0]
    return {
        "user_location_id": ul["id"],
        "location_id": location_id,
        "name": body.name,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "label": body.label,
        "is_default": is_default,
    }


# ── DELETE /locations/{id} ────────────────────────────────────────────────────
@router.delete("/{location_id}", status_code=204)
async def remove_location(
    location_id: str, user: dict = Depends(get_current_user)
):
    """Remove a location from the user's saved list."""
    db = get_supabase()
    ul = _get_user_location(db, user["id"], location_id)
    db.table("user_locations").delete().eq("id", ul["id"]).execute()

    # If it was the default, promote the next saved location
    if ul["is_default"]:
        remaining = (
            db.table("user_locations")
            .select("id")
            .eq("user_id", user["id"])
            .limit(1)
            .execute()
        )
        if remaining.data:
            db.table("user_locations").update({"is_default": True}).eq(
                "id", remaining.data[0]["id"]
            ).execute()


# ── PATCH /locations/{id}/default ─────────────────────────────────────────────
@router.patch("/{location_id}/default")
async def set_default(location_id: str, user: dict = Depends(get_current_user)):
    """Set a saved location as the user's default."""
    db = get_supabase()
    user_id = user["id"]

    # Verify ownership
    _get_user_location(db, user_id, location_id)

    # Clear existing default
    db.table("user_locations").update({"is_default": False}).eq("user_id", user_id).execute()

    # Set new default
    db.table("user_locations").update({"is_default": True}).eq("user_id", user_id).eq(
        "location_id", location_id
    ).execute()

    return {"message": "Default location updated", "location_id": location_id}


# ── PATCH /locations/{id}/label ───────────────────────────────────────────────
@router.patch("/{location_id}/label")
async def update_label(
    location_id: str,
    body: UpdateLabelRequest,
    user: dict = Depends(get_current_user),
):
    """Rename the label for a saved location (e.g., 'Home', 'College')."""
    db = get_supabase()
    ul = _get_user_location(db, user["id"], location_id)
    db.table("user_locations").update({"label": body.label}).eq("id", ul["id"]).execute()
    return {"message": "Label updated", "label": body.label}
