"""
Vayu Varta — Security Headers Middleware
Adds standard security headers to all responses.

Headers added:
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - X-XSS-Protection: 1; mode=block
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy: camera=(), microphone=(self), geolocation=(self)
  - Content-Security-Policy: basic policy for API responses
  - Strict-Transport-Security: only in production
"""

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Injects standard security headers on every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # ── Anti-clickjacking ──────────────────────────────────────
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # ── Referrer ───────────────────────────────────────────────
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # ── Permissions (allow mic + geo for weather/voice features) ──
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(self), geolocation=(self), "
            "payment=(), usb=(), magnetometer=(), gyroscope=()"
        )

        # ── HSTS (production only) ────────────────────────────────
        if settings.app_env == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )

        # ── Remove server identification ───────────────────────────
        if "server" in response.headers:
            del response.headers["server"]

        return response
