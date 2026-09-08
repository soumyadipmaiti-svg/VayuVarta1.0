"""
Vayu Varta — AI Router (Streaming + Fast)
ChatGPT-like: tokens stream to the client in real-time.
"""

import asyncio
import json
import time
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth.router import get_current_user
from database import get_supabase
from weather.service import get_current_weather, get_forecast
from ai.service import (
    ask_gemini_stream,
    get_conversation_history,
    store_turn,
)

router = APIRouter(prefix="/ai", tags=["ai"])


class AskRequest(BaseModel):
    location_id: str
    message: str = Field(..., min_length=1, max_length=2000)


@router.post("/ask")
async def ask(body: AskRequest, user: dict = Depends(get_current_user)):
    """Non-streaming fallback — returns complete reply."""
    db = get_supabase()

    loc_result = (
        db.table("locations")
        .select("id, name, latitude, longitude")
        .eq("id", body.location_id)
        .single()
        .execute()
    )
    if not loc_result.data:
        raise HTTPException(status_code=404, detail="Location not found")
    location = loc_result.data

    (current_raw, daily_raw, hourly_raw), history = await asyncio.gather(
        asyncio.gather(
            get_current_weather(location),
            get_forecast(location, forecast_type="daily"),
            get_forecast(location, forecast_type="hourly"),
            return_exceptions=True,
        ),
        asyncio.to_thread(get_conversation_history, user["id"], body.location_id),
    )

    current_raw = current_raw if not isinstance(current_raw, Exception) else None
    daily_raw = daily_raw if not isinstance(daily_raw, Exception) else None
    hourly_raw = hourly_raw if not isinstance(hourly_raw, Exception) else None

    weather_ctx = {"location": location["name"]}
    if current_raw:
        try:
            from weather.service import normalize_current
            weather_ctx["current"] = normalize_current(current_raw)
        except Exception:
            weather_ctx["current"] = current_raw
    if daily_raw:
        try:
            from weather.service import normalize_daily_forecast
            weather_ctx["forecast_days"] = normalize_daily_forecast(daily_raw)[:3]
        except Exception:
            weather_ctx["forecast_days"] = daily_raw

    asyncio.create_task(asyncio.to_thread(
        store_turn, user["id"], body.location_id, "user", body.message
    ))

    from ai.service import ask_gemini
    reply = await ask_gemini(weather_ctx, history, body.message)

    asyncio.create_task(asyncio.to_thread(
        store_turn, user["id"], body.location_id, "assistant", reply
    ))

    return {"reply": reply, "data_available": bool(current_raw or daily_raw)}


@router.post("/ask-stream")
async def ask_stream(body: AskRequest, user: dict = Depends(get_current_user)):
    """Streaming endpoint — SSE tokens for ChatGPT-like real-time display.

    Key optimization: Gemini runs in a thread pool so it never blocks the
    FastAPI event loop, keeping the server responsive for other requests.
    """
    db = get_supabase()

    # 1. Fetch location
    loc_result = (
        db.table("locations")
        .select("id, name, latitude, longitude")
        .eq("id", body.location_id)
        .single()
        .execute()
    )
    if not loc_result.data:
        raise HTTPException(status_code=404, detail="Location not found")
    location = loc_result.data

    # 2. Fetch weather + history IN PARALLEL (max speed)
    (current_raw, daily_raw, hourly_raw), history = await asyncio.gather(
        asyncio.gather(
            get_current_weather(location),
            get_forecast(location, forecast_type="daily"),
            get_forecast(location, forecast_type="hourly"),
            return_exceptions=True,
        ),
        asyncio.to_thread(get_conversation_history, user["id"], body.location_id),
    )

    current_raw = current_raw if not isinstance(current_raw, Exception) else None
    daily_raw = daily_raw if not isinstance(daily_raw, Exception) else None
    hourly_raw = hourly_raw if not isinstance(hourly_raw, Exception) else None

    # 3. Build weather context
    weather_ctx = {"location": location["name"]}
    if current_raw:
        try:
            from weather.service import normalize_current
            weather_ctx["current"] = normalize_current(current_raw)
        except Exception:
            weather_ctx["current"] = current_raw
    if daily_raw:
        try:
            from weather.service import normalize_daily_forecast
            weather_ctx["forecast_days"] = normalize_daily_forecast(daily_raw)[:3]
        except Exception:
            weather_ctx["forecast_days"] = daily_raw
    if hourly_raw:
        try:
            from weather.service import normalize_hourly_forecast
            weather_ctx["hourly_today"] = normalize_hourly_forecast(hourly_raw)[:24]
        except Exception:
            weather_ctx["hourly_today"] = hourly_raw[:24] if hourly_raw else []

    # 4. Store user message (fire-and-forget)
    asyncio.create_task(asyncio.to_thread(
        store_turn, user["id"], body.location_id, "user", body.message
    ))

    # 5. Stream response — run sync generator in thread pool
    #    This is critical: ask_gemini_stream is a sync generator that makes
    #    blocking network calls to Gemini. Without to_thread, it freezes the
    #    entire event loop, making ALL other requests wait.

    async def event_stream():
        full_reply = []
        start_time = time.monotonic()

        # Run the sync generator in a thread to avoid blocking the event loop
        # Use a queue to bridge sync generator → async generator
        queue = asyncio.Queue()
        sentinel = object()

        async def drain_sync_gen():
            """Run the sync generator in a thread, forwarding tokens as they
            arrive (real streaming). CRITICAL: never collect the whole reply
            first — that turns "streaming" into a 30s silent wait."""
            import functools
            import logging

            loop = asyncio.get_event_loop()
            iterator = iter(ask_gemini_stream(weather_ctx, history, body.message))
            _STOP = object()

            def _next_token():
                # Catch StopIteration INSIDE the thread — raising it through
                # run_in_executor corrupts the Future machinery.
                try:
                    return next(iterator)
                except StopIteration:
                    return _STOP

            try:
                while True:
                    # Each next() runs in the thread pool: Gemini's blocking
                    # I/O stays off the event loop, but every token is pushed
                    # the moment it is produced.
                    token = await loop.run_in_executor(None, _next_token)
                    if token is _STOP:
                        break
                    await queue.put(token)
            except Exception as e:
                logging.getLogger("ai.router").error(f"Streaming error: {e}")
            finally:
                await queue.put(sentinel)

        # Start draining in background
        drain_task = asyncio.create_task(drain_sync_gen())

        try:
            while True:
                try:
                    token = await asyncio.wait_for(queue.get(), timeout=120.0)
                except asyncio.TimeoutError:
                    # 120s timeout — don't let a hung Gemini call block forever
                    yield f"data: {json.dumps({'done': True, 'reply': ''.join(full_reply), 'error': 'timeout'})}\n\n"
                    return

                if token is sentinel:
                    break

                full_reply.append(token)
                yield f"data: {json.dumps({'token': token})}\n\n"
        finally:
            if not drain_task.done():
                drain_task.cancel()

        elapsed = time.monotonic() - start_time
        reply_text = "".join(full_reply)

        # Send done signal with full reply for DB storage
        yield f"data: {json.dumps({'done': True, 'reply': reply_text, 'elapsed_ms': round(elapsed * 1000)})}\n\n"

        # Store assistant reply (fire-and-forget)
        asyncio.create_task(asyncio.to_thread(
            store_turn, user["id"], body.location_id, "assistant", reply_text
        ))

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations")
async def conversations(
    location_id: str,
    limit: int = 20,
    user: dict = Depends(get_current_user),
):
    db = get_supabase()
    result = (
        db.table("ai_conversations")
        .select("id, role, message, created_at")
        .eq("user_id", user["id"])
        .eq("location_id", location_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(result.data or []))


@router.delete("/conversations")
async def clear_conversations(
    location_id: str,
    user: dict = Depends(get_current_user),
):
    db = get_supabase()
    db.table("ai_conversations").delete().eq("user_id", user["id"]).eq(
        "location_id", location_id
    ).execute()
    return {"message": "Conversation history cleared"}
