"""
WeatherGPT — Configuration
Loads all settings from environment variables / .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_service_key: str = Field(..., alias="SUPABASE_SERVICE_KEY")

    # ── JWT Auth ──────────────────────────────────────────────────────────────
    jwt_secret_key: str = Field(..., alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field("HS256", alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(10080, alias="JWT_EXPIRE_MINUTES")  # 7 days

    # ── Weather API (Open-Meteo — free, no key needed) ─────────────────────────
    weather_api_base_url: str = Field(
        "https://api.open-meteo.com/v1", alias="WEATHER_API_BASE_URL"
    )
    geocoding_api_base_url: str = Field(
        "https://geocoding-api.open-meteo.com/v1", alias="GEOCODING_API_BASE_URL"
    )
    weather_cache_ttl_seconds: int = 600  # 10 minutes

    # ── Google Gemini AI ──────────────────────────────────────────────────────
    gemini_api_key: str = Field(..., alias="GEMINI_API_KEY")
    # gemini-3.5-flash-lite: measured 1.3s to first token vs 10s for
    # gemini-3.5-flash — same quality tier, 8x faster responses.
    gemini_model: str = Field("gemini-3.5-flash-lite", alias="GEMINI_MODEL")
    ai_max_conversation_turns: int = 10

    # ── Web Push / VAPID Keys (Browser Push Notifications) ───────────────────
    vapid_private_key: str = Field("", alias="VAPID_PRIVATE_KEY")
    vapid_public_key: str = Field("", alias="VAPID_PUBLIC_KEY")
    vapid_email: str = Field("mailto:admin@weathergpt.app", alias="VAPID_EMAIL")

    # ── WhatsApp (Meta Cloud API) ─────────────────────────────────────────────
    whatsapp_phone_number_id: str = Field("", alias="WHATSAPP_PHONE_NUMBER_ID")
    whatsapp_access_token: str = Field("", alias="WHATSAPP_ACCESS_TOKEN")
    whatsapp_verify_token: str = Field(
        "weathergpt-verify", alias="WHATSAPP_VERIFY_TOKEN"
    )
    whatsapp_api_version: str = Field("v21.0", alias="WHATSAPP_API_VERSION")

    # ── Fish Audio TTS (Text-to-Speech) ──────────────────────────────────────
    fish_audio_api_key: str = Field("", alias="FISH_AUDIO_API_KEY")
    fish_audio_model: str = Field("s2.1-pro-free", alias="FISH_AUDIO_MODEL")
    fish_audio_voice_id: str = Field("b545c585f631496c914815291da4e893", alias="FISH_AUDIO_VOICE_ID")

    # ── Rate Limiting ────────────────────────────────────────────────────────
    rate_limit_auth_max: int = Field(50, alias="RATE_LIMIT_AUTH_MAX")      # 50 attempts per window (dev)
    rate_limit_auth_window: float = Field(900, alias="RATE_LIMIT_AUTH_WINDOW")  # 15 min
    rate_limit_ai_max: int = Field(20, alias="RATE_LIMIT_AI_MAX")         # 20 AI requests per min
    rate_limit_ai_window: float = Field(60, alias="RATE_LIMIT_AI_WINDOW")
    rate_limit_tts_max: int = Field(10, alias="RATE_LIMIT_TTS_MAX")       # 10 TTS per min
    rate_limit_tts_window: float = Field(60, alias="RATE_LIMIT_TTS_WINDOW")
    rate_limit_push_max: int = Field(10, alias="RATE_LIMIT_PUSH_MAX")     # 10 push per min
    rate_limit_push_window: float = Field(60, alias="RATE_LIMIT_PUSH_WINDOW")
    rate_limit_default_max: int = Field(500, alias="RATE_LIMIT_DEFAULT_MAX") # 500 per min (dev)
    rate_limit_default_window: float = Field(60, alias="RATE_LIMIT_DEFAULT_WINDOW")

    # ── Password Policy ───────────────────────────────────────────────────────
    password_min_length: int = Field(8, alias="PASSWORD_MIN_LENGTH")
    password_max_length: int = Field(128, alias="PASSWORD_MAX_LENGTH")

    # ── SMTP (Password Reset Emails) ────────────────────────────────────────
    smtp_host: str = Field("smtp.gmail.com", alias="SMTP_HOST")
    smtp_port: int = Field(587, alias="SMTP_PORT")
    smtp_user: str = Field("", alias="SMTP_USER")        # your Gmail address
    smtp_password: str = Field("", alias="SMTP_PASSWORD")  # Gmail App Password
    smtp_from_name: str = Field("Vayu Varta", alias="SMTP_FROM_NAME")
    password_reset_expire_minutes: int = Field(5, alias="PASSWORD_RESET_EXPIRE_MINUTES")

    # ── App ───────────────────────────────────────────────────────────────────
    # Default is the LIVE frontend so reset links never point at localhost,
    # even if FRONTEND_URL is missing from the deployed environment.
    frontend_url: str = Field("https://vayu-varta1-0.vercel.app", alias="FRONTEND_URL")
    backend_url: str = Field("http://localhost:8000", alias="BACKEND_URL")
    app_env: str = Field("development", alias="APP_ENV")


settings = Settings()
