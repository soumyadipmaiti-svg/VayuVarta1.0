"""
WeatherGPT — FastAPI Backend Entry Point
AI-Powered Weather Forecasting, Alerts & Climate Intelligence Platform
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from contextlib import asynccontextmanager
import logging

from config import settings
from security.rate_limit import RateLimitMiddleware
from security.headers import SecurityHeadersMiddleware
from security.errors import register_error_handlers
from auth.router import router as auth_router, email_send_status
from weather.router import router as weather_router
from locations.router import router as locations_router
from ai.router import router as ai_router
from alerts.router import router as alerts_router
from alerts.engine import run_alert_evaluation
from alarms.router import router as alarms_router
from alarms.engine import run_alarm_evaluation
from push.router import router as push_router
from admin.router import router as admin_router
from tts.router import router as tts_router
from notifications.service import send_daily_briefings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("main")

# ── Scheduler ─────────────────────────────────────────────────────────────────
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("WeatherGPT starting — scheduling background jobs")

    # Alert engine — runs every 30 minutes
    scheduler.add_job(
        run_alert_evaluation,
        "interval",
        minutes=30,
        id="alert_engine",
        max_instances=1,
    )

    # 🚨 AI Alarm engine — runs every 15 minutes
    scheduler.add_job(
        run_alarm_evaluation,
        "interval",
        minutes=15,
        id="alarm_engine",
        max_instances=1,
    )

    # Daily briefing sender — runs every 30 minutes, checks user briefing times
    scheduler.add_job(
        send_daily_briefings,
        "interval",
        minutes=30,
        id="daily_briefings",
        max_instances=1,
    )

    scheduler.start()
    logger.info("🚨 Alarm engine scheduled (every 15 min)")
    logger.info("Alert engine scheduled (every 30 min)")
    logger.info("Daily briefing scheduler started (every 30 min)")

    yield

    scheduler.shutdown()
    logger.info("WeatherGPT shutdown complete")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="VayuVarta API",
    docs_url="/docs",
    redoc_url="/redoc",
    description=(
        "AI-Powered Weather Forecasting, Alerts & Climate Intelligence Platform. "
        "Features: Real-time weather, Gemini AI chat, threshold alerts, "
        "browser push notifications (like Zomato/Swiggy)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ── Security middleware (order matters — last added = first executed) ────────

# 1. Global error handler (catches all unhandled exceptions)
register_error_handlers(app)

# 2. Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

# 3. Rate limiting (before CORS so 429s are returned fast)
app.add_middleware(RateLimitMiddleware)

# 4. CORS — restrict to known origins in production
if settings.app_env == "production":
    allowed_origins = [settings.frontend_url]
else:
    allowed_origins = [settings.frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    max_age=600,
)

# ── Mount all routers under /api/v1 ──────────────────────────────────────────
PREFIX = "/api/v1"
app.include_router(auth_router,      prefix=PREFIX)
app.include_router(weather_router,   prefix=PREFIX)
app.include_router(locations_router, prefix=PREFIX)
app.include_router(ai_router,        prefix=PREFIX)
app.include_router(alerts_router,    prefix=PREFIX)
app.include_router(alarms_router,    prefix=PREFIX)   # 🚨 AI Weather Alarm System
app.include_router(push_router,      prefix=PREFIX)   # 🔔 Web Push (Zomato/Swiggy style)
app.include_router(admin_router,     prefix=PREFIX)
app.include_router(tts_router,        prefix=PREFIX)   # 🎤 Fish Audio TTS (voice responses)


@app.get("/")
async def root():
    return {
        "service": "WeatherGPT API",
        "version": "1.0.0",
        "docs": "/docs",
        "status": "running",
        "features": [
            "Real-time weather + 7-day forecast",
            "Gemini AI conversational assistant",
            "🚨 AI-Prioritized Weather Alarms",
            "Threshold-based weather alerts",
            "Browser push notifications (Web Push API)",
            "Climate historical averages",
            "Admin dashboard",
        ],
    }


@app.get("/health")
async def health():
    """Health check — also reports email config state + the outcome of the
    most recent SMTP send (no secrets) so a silently-failing forgot-password
    deployment is instantly diagnosable."""
    return {
        "status": "ok",
        "email_configured": bool(settings.smtp_user and settings.smtp_password),
        "email_host": settings.smtp_host,
        "email_last_send": email_send_status(),
        "frontend_url": settings.frontend_url,
        "app_env": settings.app_env,
    }
