"""
WeatherGPT — Database
Singleton Supabase client for PostgreSQL access.
"""

from supabase import create_client, Client
from config import settings

_client: Client | None = None


def get_supabase() -> Client:
    """Return a singleton Supabase client using the service-role key."""
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client
