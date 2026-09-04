"""
Vayu Varta — Global Error Handler
Catches all unhandled exceptions and returns generic messages to the client.
Full error details are logged server-side only — never leaked to users.

Fixes:
  - Stack traces no longer returned in API responses
  - Internal file paths no longer exposed
  - Database errors show generic "Service temporarily unavailable"
"""

import logging
import traceback
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("security.errors")


def register_error_handlers(app: FastAPI) -> None:
    """Attach global error handlers to the FastAPI app."""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        """Known HTTP errors — return the detail message (already safe)."""
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        """
        Catch-all for unexpected errors.
        Returns a generic message to the client.
        Logs the full traceback server-side.
        """
        # Log full error with traceback for debugging
        logger.error(
            f"Unhandled error on {request.method} {request.url.path}: {exc}",
            exc_info=True,
        )

        # Classify the error for a slightly more helpful (but still safe) message
        error_str = str(exc).lower()

        if "database" in error_str or "supabase" in error_str or "connection" in error_str:
            detail = "Service temporarily unavailable. Please try again shortly."
        elif "timeout" in error_str:
            detail = "Request timed out. Please try again."
        elif "validation" in error_str:
            detail = "Invalid request. Please check your input."
        else:
            detail = "An unexpected error occurred. Please try again."

        return JSONResponse(
            status_code=500,
            content={"detail": detail},
        )

    @app.exception_handler(500)
    async def internal_error_handler(request: Request, exc):
        """Direct 500 errors."""
        logger.error(f"500 error on {request.method} {request.url.path}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "An unexpected error occurred. Please try again."},
        )
