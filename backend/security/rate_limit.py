"""
Vayu Varta — Rate Limiting Middleware
Per-IP rate limiting with configurable thresholds per route group.

Strategy:
  - Auth routes: 5 attempts / 15 min per IP (strict)
  - Public routes: 60 requests / min per IP (moderate)
  - Authenticated routes: 120 requests / min per user (loose)
  - AI chat: 20 requests / min per user (moderate — expensive)
  - TTS: 10 requests / min per user (expensive external API)

All thresholds configurable via env vars with sane defaults.
"""

import time
import logging
from collections import defaultdict
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from config import settings

logger = logging.getLogger("security.rate_limit")


class RateLimitEntry:
    """Sliding window counter for a single key."""
    __slots__ = ("timestamps",)

    def __init__(self):
        self.timestamps: list[float] = []

    def clean(self, window: float) -> None:
        """Remove timestamps older than `window` seconds."""
        cutoff = time.monotonic() - window
        self.timestamps = [t for t in self.timestamps if t > cutoff]

    def count(self, window: float) -> int:
        self.clean(window)
        return len(self.timestamps)

    def record(self) -> None:
        self.timestamps.append(time.monotonic())


# ── Global store ──────────────────────────────────────────────────────────────
_store: dict[str, RateLimitEntry] = defaultdict(RateLimitEntry)

# Periodic cleanup every 5 minutes to prevent memory leaks
_last_cleanup = time.monotonic()
_CLEANUP_INTERVAL = 300  # seconds


def _maybe_cleanup() -> None:
    global _last_cleanup
    now = time.monotonic()
    if now - _last_cleanup < _CLEANUP_INTERVAL:
        return
    _last_cleanup = now
    max_window = 900  # longest window we use (15 min)
    stale_keys = [
        key for key, entry in _store.items()
        if not entry.timestamps or (now - max(entry.timestamps)) > max_window
    ]
    for key in stale_keys:
        del _store[key]
    if stale_keys:
        logger.debug(f"Rate limit cleanup: removed {len(stale_keys)} stale entries")


# ── Route classification ──────────────────────────────────────────────────────

# Route prefixes mapped to (max_requests, window_seconds)
# Override via env vars if needed.
ROUTE_LIMITS: dict[str, tuple[int, float]] = {
    "/api/v1/auth/":    (int(settings.rate_limit_auth_max),     settings.rate_limit_auth_window),
    "/api/v1/ai/":      (int(settings.rate_limit_ai_max),      settings.rate_limit_ai_window),
    "/api/v1/tts":      (int(settings.rate_limit_tts_max),     settings.rate_limit_tts_window),
    "/api/v1/push/":    (int(settings.rate_limit_push_max),    settings.rate_limit_push_window),
}

# Default for authenticated routes
DEFAULT_AUTH_LIMIT = (int(settings.rate_limit_default_max), settings.rate_limit_default_window)


def _classify_route(path: str) -> tuple[int, float]:
    """Return (max_requests, window_seconds) for the given path."""
    for prefix, limits in ROUTE_LIMITS.items():
        if path.startswith(prefix):
            return limits
    return DEFAULT_AUTH_LIMIT


def _client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For behind a proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


# ── Middleware ─────────────────────────────────────────────────────────────────

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window rate limiter.
    Applies per-IP to all routes. Auth routes get stricter limits.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Only rate-limit API routes
        if not path.startswith("/api/"):
            return await call_next(request)

        # Skip health check and root
        if path in ("/api/v1/", "/health"):
            return await call_next(request)

        ip = _client_ip(request)
        max_requests, window = _classify_route(path)
        key = f"{ip}:{path.split('/')[3] if len(path.split('/')) > 3 else 'root'}"

        _maybe_cleanup()
        entry = _store[key]
        count = entry.count(window)

        if count >= max_requests:
            retry_after = int(window - (time.monotonic() - (entry.timestamps[0] if entry.timestamps else time.monotonic())))
            logger.warning(
                f"Rate limit exceeded: {ip} hit {count}/{max_requests} on {path}"
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please slow down.",
                    "retry_after_seconds": max(1, retry_after),
                },
                headers={"Retry-After": str(max(1, retry_after))},
            )

        entry.record()
        response = await call_next(request)

        # Add rate limit headers
        remaining = max(0, max_requests - count - 1)
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.monotonic() + window))

        return response
