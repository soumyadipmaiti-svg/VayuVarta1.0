"""
WeatherGPT — Climate Data Seeder
Seeds sample historical monthly averages for demo locations.
Run after setting up the database.

Usage:
  python seed_climate.py

This seeds data for 3 Indian cities commonly used in demos:
  - Kolkata (West Bengal)
  - Mumbai (Maharashtra)
  - Delhi (NCT)
"""

import os
import sys

# Add backend dir to path
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("APP_ENV", "development")

from database import get_supabase


# Monthly climate data: [month, avg_temp_c, avg_rainfall_mm]
CLIMATE_DATA = {
    "Kolkata": {
        "lat": 22.5726, "lon": 88.3639,
        "monthly": [
            (1, 19.0, 10.2), (2, 22.0, 14.8), (3, 27.5, 28.4),
            (4, 30.0, 51.3), (5, 30.5, 131.3), (6, 30.0, 285.7),
            (7, 29.0, 321.5), (8, 29.0, 328.5), (9, 29.5, 252.7),
            (10, 28.0, 114.0), (11, 23.5, 20.2), (12, 19.5, 6.5),
        ]
    },
    "Mumbai": {
        "lat": 19.0760, "lon": 72.8777,
        "monthly": [
            (1, 24.5, 2.5),  (2, 25.0, 1.2),  (3, 27.0, 0.6),
            (4, 29.5, 0.8),  (5, 31.0, 18.0), (6, 29.5, 493.8),
            (7, 27.5, 840.8), (8, 27.0, 641.5), (9, 27.5, 348.8),
            (10, 28.5, 68.7), (11, 26.5, 13.6), (12, 25.0, 1.5),
        ]
    },
    "Delhi": {
        "lat": 28.6139, "lon": 77.2090,
        "monthly": [
            (1, 14.0, 19.1), (2, 16.5, 22.0), (3, 22.5, 13.6),
            (4, 28.5, 7.8),  (5, 33.0, 22.4), (6, 33.5, 64.8),
            (7, 30.0, 211.3), (8, 29.0, 233.4), (9, 28.5, 125.4),
            (10, 24.5, 13.7), (11, 18.5, 5.0), (12, 14.5, 9.7),
        ]
    },
}


def seed():
    db = get_supabase()
    print("WeatherGPT Climate Data Seeder")
    print("=" * 50)

    for city_name, data in CLIMATE_DATA.items():
        print(f"\n→ Seeding {city_name}...")

        # Upsert location
        existing = (
            db.table("locations")
            .select("id")
            .eq("latitude", data["lat"])
            .eq("longitude", data["lon"])
            .limit(1)
            .execute()
        )
        if existing.data:
            location_id = existing.data[0]["id"]
            print(f"  Location exists: {location_id}")
        else:
            result = (
                db.table("locations")
                .insert({"name": city_name, "latitude": data["lat"], "longitude": data["lon"]})
                .execute()
            )
            location_id = result.data[0]["id"]
            print(f"  Created location: {location_id}")

        # Seed monthly data
        for month, avg_temp, avg_rainfall in data["monthly"]:
            db.table("climate_data").upsert(
                {
                    "location_id": location_id,
                    "month": month,
                    "avg_temp": avg_temp,
                    "avg_rainfall": avg_rainfall,
                },
                on_conflict="location_id,month",
            ).execute()

        print(f"  ✅ Seeded 12 months of climate data for {city_name}")

    print("\n" + "=" * 50)
    print("✅ Climate data seeding complete!")
    print("You can now query GET /api/v1/weather/historical?location_id=...&month=6")


if __name__ == "__main__":
    seed()
