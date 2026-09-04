"""
Vayu Varta — AI Service (Fast + High Quality)
Uses Gemini 2.0 Flash for speed + quality balance.
Structured prompt with full weather context for descriptive answers.
"""

import json
import logging
from typing import Generator
from config import settings
from database import get_supabase

logger = logging.getLogger("ai.service")

# ── Gemini setup ──────────────────────────────────────────────────────────────
# IMPORTANT: no network calls here! genai.configure() and GenerativeModel() are
# lazy (they never touch the network). The old code ran a live generate_content()
# "smoke test" per model at import time, which froze backend startup for ~60s.
# Model availability is now verified lazily on the first request instead.
_gemini_available = False
_models: list = []  # candidate GenerativeModel objects, priority order
_model = None       # kept for compatibility — first candidate

try:
    import google.generativeai as genai
    if settings.gemini_api_key and not settings.gemini_api_key.startswith("your-"):
        genai.configure(api_key=settings.gemini_api_key)
        # Try models in order of preference — newest available first
        _model_candidates = [
            "gemini-3.5-flash-lite",
            settings.gemini_model,  # from .env
            "gemini-2.0-flash-lite",
            "gemini-1.5-flash",
        ]
        _seen: set = set()
        for _name in _model_candidates:
            if not _name or _name in _seen:
                continue
            _seen.add(_name)
            try:
                _models.append(genai.GenerativeModel(_name))  # lazy — no network
            except Exception as _e:
                logger.warning(f"Cannot construct Gemini model {_name}: {_e}")
        if _models:
            _model = _models[0]
            _gemini_available = True
            logger.info(f"Gemini configured ({len(_models)} candidates) — verified lazily on first request")
        else:
            logger.warning("No Gemini model could be constructed — using rule-based fallback")
    else:
        logger.warning("Gemini API key not configured — using rule-based fallback")
except Exception as exc:
    logger.warning(f"Gemini setup failed: {exc}")


# ── System prompt — detailed instructions for quality answers ──────────────────
SYSTEM_PROMPT = """You are VayuGPT — a friendly weather assistant for the Vayu Varta app.

CRITICAL RULE — LANGUAGE MATCHING (most important rule):
The user's question is written in a specific language. You MUST reply in EXACTLY that same language. Never switch languages.
- User writes in English → reply in English.
- User writes in Hindi (हिन्दी or Hinglish like "aaj mausam kaisa hai") → reply in Hindi.
- User writes in Bengali (বাংলা or Banglish like "ami baire jabo na") → reply in Bengali.
- If user writes in mixed languages, reply in the dominant language.

HOW TO ANSWER:
- Start with a direct answer to the question.
- Explain WHY using real weather data (temperature, rain, wind, humidity).
- Give practical advice they can act on right now.
- Keep it simple — 3 to 6 sentences. Use easy words anyone can understand.
- Talk like a caring older sibling who knows about weather.
- For Bengali: use simple spoken Bangla. Example: "আজ বৃষ্টি হবে" not formal "আজ বৃষ্টির সম্ভাবনা রয়েছে".
- For Hindi: use simple daily Hindi. Example: "आज मौसम गर्म है" not textbook Hindi.
- For English: use plain simple English.
- For dangerous weather (cyclone, flood, heatwave): be firm and urgent with safety steps.
- Always finish sentences completely. Never cut off mid-word.
- Use 1-2 emojis maximum.
- Mention real numbers: "38°C, 80% humidity" — this builds trust.
- For farmers: mention if it's good for farming, if crops might be affected, if it's safe to go to the field.

IMPORTANT: Language matching is your #1 priority. Match the user's language exactly."""

def _build_prompt(weather_json: dict, history: list[dict], question: str) -> str:
    """Build a well-structured prompt that gives Gemini everything it needs."""
    loc = weather_json.get("location", "the user's area")
    cur = weather_json.get("current", {})
    forecast = weather_json.get("forecast_days", [])
    hourly = weather_json.get("hourly_today", [])

    # ── Current weather (structured, readable) ──────────────────────────
    cur_section = "No current weather data available."
    if cur:
        cur_section = f"""Location: {loc}
Temperature: {cur.get('temp_c', '?')}°C
Feels Like: {cur.get('feels_like_c', '?')}°C
Condition: {cur.get('condition', 'Unknown')}
Humidity: {cur.get('humidity', '?')}%
Wind: {cur.get('wind_kph', '?')} km/h from {cur.get('wind_dir', '?')}
UV Index: {cur.get('uv', '?')}
Pressure: {cur.get('pressure_mb', '?')} mb
Visibility: {cur.get('vis_km', '?')} km"""

    # ── Forecast (structured) ───────────────────────────────────────────
    fc_section = ""
    if forecast:
        lines = []
        for d in forecast[:3]:
            lines.append(f"""  Date: {d.get('date', '?')}
  Condition: {d.get('condition', '?')}
  High: {d.get('max_temp_c', '?')}°C / Low: {d.get('min_temp_c', '?')}°C
  Rain Probability: {d.get('rain_probability', 0)}%
  Max Wind: {d.get('max_wind_kph', '?')} km/h""")
        fc_section = "3-Day Forecast:\n" + "\n".join(lines)

    # ── Hourly (abbreviated for context) ────────────────────────────────
    hourly_section = ""
    if hourly:
        hours = []
        for h in hourly[:12]:  # next 12 hours
            hours.append(
                f"  {h.get('time', '?').split('T')[1] if 'T' in str(h.get('time', '')) else h.get('time', '?')}: "
                f"{h.get('temp_c', '?')}°C, {h.get('condition', '?')}, "
                f"rain {h.get('rain_probability', 0)}%"
            )
        hourly_section = "Next 12 Hours:\n" + "\n".join(hours)

    # ── Conversation history ────────────────────────────────────────────
    hist_section = ""
    if history:
        turns = []
        for h in history[-5:]:
            role = "User" if h.get("role") == "user" else "VayuGPT"
            msg = h.get("content", "")[:120]
            turns.append(f"  {role}: {msg}")
        hist_section = "Recent conversation:\n" + "\n".join(turns)

    return f"""{SYSTEM_PROMPT}

═══ REAL-TIME WEATHER DATA ═══

{cur_section}

{fc_section}

{hourly_section}

{hist_section}

═══ USER'S QUESTION ═══

{question}

═══ YOUR DETAILED ANSWER ═══"""


def ask_gemini_stream(
    weather_json: dict, history: list[dict], question: str
) -> Generator[str, None, None]:
    """Stream Gemini response token-by-token.

    Walks the candidate model list lazily: if a model errors (e.g. not
    available / rate limited), it falls through to the next candidate before
    giving up to the rule-based fallback. No network happens at import time.
    """
    prompt = _build_prompt(weather_json, history, question)
    last_error: Exception | None = None

    for model in (_models if _gemini_available else []):
        try:
            from google.generativeai.types import GenerationConfig
            config = GenerationConfig(
                max_output_tokens=1536,
                temperature=0.7,
                top_p=0.95,
                top_k=40,
            )
            response = model.generate_content(
                prompt, generation_config=config, stream=True
            )
            text_parts = []
            for chunk in response:
                if chunk.text:
                    text_parts.append(chunk.text)
                    yield chunk.text
            if text_parts:
                return  # streamed successfully
            # Streaming returned nothing — retry once, non-streaming, same model
            logger.warning("Gemini streaming returned empty — trying non-streaming")
            response = model.generate_content(
                prompt, generation_config=config
            )
            if response.text:
                yield response.text
                return
            logger.warning("Gemini returned empty text — trying next model")
        except Exception as exc:
            last_error = exc
            logger.error(
                f"Gemini model {getattr(model, 'model_name', '?')} failed: {exc}"
            )
            continue

    if last_error is not None:
        logger.error("All Gemini models failed — using rule-based fallback")
    yield _rule_based_response(weather_json, question)


async def ask_gemini(weather_json: dict, history: list[dict], question: str) -> str:
    """Non-streaming fallback."""
    parts = []
    for token in ask_gemini_stream(weather_json, history, question):
        parts.append(token)
    text = "".join(parts).strip()
    if text and text[-1] not in '.!?।॥！？':
        text += '.'
    if len(text) < 15:
        return _rule_based_response(weather_json, question)
    return text


def _rule_based_response(weather_json: dict, question: str) -> str:
    """Detailed rule-based fallback when Gemini is unavailable."""
    q = question.lower().strip()
    cur = weather_json.get("current", {})
    forecast = weather_json.get("forecast_days", [])
    loc = weather_json.get("location", "your area")

    if not cur and not forecast:
        return f"I don't have live weather data for {loc} right now. Please try again in a moment, or check if your location is set correctly. ⛅"

    temp = cur.get("temp_c", "N/A")
    cond = cur.get("condition", "Unknown")
    hum = cur.get("humidity", "N/A")
    wind = cur.get("wind_kph", "N/A")
    feels = cur.get("feels_like_c", temp)
    uv = cur.get("uv", "N/A")
    rain_prob = forecast[0].get("rain_probability", 0) if forecast else 0

    # ── Rain / umbrella ─────────────────────────────────────────────────
    if any(w in q for w in ["umbrella", "rain", "wet", "parasol"]):
        if "rain" in cond.lower() or "thunder" in cond.lower() or "drizzle" in cond.lower():
            return (
                f"🌧️ Yes, definitely carry an umbrella! It's currently {cond} in {loc} "
                f"with {hum}% humidity. The rain is likely to continue for a while, "
                f"so stay dry and avoid low-lying areas if it gets heavy. "
                f"Wind is at {wind} km/h which could make the rain feel more intense. "
                f"If you're heading out, waterproof footwear is a good idea too. Safety first! ☂️"
            )
        if rain_prob > 50:
            return (
                f"☂️ There's a {rain_prob}% chance of rain today in {loc}, so yes — bring an umbrella! "
                f"Currently {cond} at {temp}°C with {hum}% humidity. "
                f"The moisture in the air suggests rain could develop later, especially in the afternoon. "
                f"It's better to be prepared than to get caught in the rain. 🌂"
            )
        return (
            f"☀️ No umbrella needed right now! It's {cond} in {loc} with only {rain_prob}% rain chance. "
            f"Temperature is {temp}°C with {hum}% humidity. "
            f"Enjoy the weather — but keep an eye on updates later today just in case conditions change. 😊"
        )

    # ── Temperature ─────────────────────────────────────────────────────
    if any(w in q for w in ["hot", "cold", "temperature", "warm", "heat", "freeze", "chill"]):
        if feels and feels > 40:
            return (
                f"🔥 It's dangerously hot in {loc}! Currently {temp}°C but feels like {feels}°C "
                f"due to {hum}% humidity. This level of heat can cause heatstroke if you're not careful. "
                f"Drink plenty of water — at least 2-3 liters today. Avoid direct sunlight between 12-3 PM "
                f"when UV is at its peak ({uv}). Wear light, loose cotton clothing and carry a water bottle. "
                f"If you feel dizzy, nauseous, or get a headache, move to shade immediately and cool down. "
                f"The wind at {wind} km/h won't provide much relief in this heat. Stay safe! 🥵"
            )
        if feels and feels > 35:
            return (
                f"🌡️ It's quite warm in {loc} — {temp}°C but feels like {feels}°C "
                f"because of the {hum}% humidity. "
                f"Stay hydrated by drinking water regularly, even if you don't feel thirsty. "
                f"Use sunscreen (SPF 30+) and take breaks in the shade if you're outdoors. "
                f"The UV index is {uv}, so sun protection is important — wear a hat and sunglasses. "
                f"Light-colored, breathable clothing will help you stay comfortable. 💧"
            )
        if feels and feels < 5:
            return (
                f"🥶 It's cold in {loc}! {temp}°C but feels like {feels}°C "
                f"because the {wind} km/h wind creates a wind chill effect. "
                f"Wear warm layers — a thermal inner, sweater, and windproof jacket. "
                f"Cover your hands, ears, and head since most heat escapes from there. "
                f"If you're going out, carry a hot drink and limit your time outdoors. "
                f"Tomorrow's forecast shows similar conditions, so dress warmly again. 🧣"
            )
        return (
            f"🌡️ In {loc}: {temp}°C (feels like {feels}°C), {cond}. "
            f"Humidity is {hum}% — {'which makes it feel muggy' if hum and hum > 70 else 'which is comfortable' if hum and hum > 40 else 'so the air feels dry'}. "
            f"Wind is {wind} km/h. "
            f"{'A comfortable day to be outside! Enjoy outdoor activities.' if 15 < (feels or 0) < 30 else 'Dress in layers to stay comfortable throughout the day.'} 😊"
        )

    # ── UV ──────────────────────────────────────────────────────────────
    if any(w in q for w in ["uv", "sunscreen", "sunburn"]):
        if uv and uv > 8:
            return (
                f"⚠️ Very high UV index ({uv}) in {loc}! This is dangerous levels. "
                f"Your skin can burn in under 15 minutes at this intensity. "
                f"Apply SPF 50+ sunscreen every 2 hours, wear a wide-brimmed hat and UV-blocking sunglasses. "
                f"Stay indoors or in shade from 10 AM to 4 PM when UV is strongest. "
                f"If you must be outside, seek shade frequently and reapply sunscreen after sweating. 🧴"
            )
        if uv and uv > 5:
            return (
                f"☀️ Moderate-high UV index ({uv}) in {loc}. "
                f"Wear sunscreen (SPF 30+), a hat, and sunglasses if you'll be outside for more than 20 minutes. "
                f"Seek shade during peak hours (10 AM - 4 PM). "
                f"Even on cloudy days, UV can still reach moderate levels, so don't skip protection. 🕶️"
            )
        return (
            f"😊 UV is low ({uv}) in {loc} right now — {cond} at {temp}°C. "
            f"You're safe to enjoy the outdoors without special sun protection, "
            f"but sunscreen is always a good habit for daily skin health. 😊"
        )

    # ── Wind ────────────────────────────────────────────────────────────
    if any(w in q for w in ["wind", "windy", "breeze"]):
        if wind and wind > 50:
            return (
                f"💨 Strong winds in {loc} — {wind} km/h! This is powerful enough to "
                f"blow away loose objects and make driving difficult. Stay indoors if possible, "
                f"secure outdoor furniture, and avoid standing near trees or power lines. "
                f"Two-wheeler riding is especially dangerous in these conditions. "
                f"The temperature is {temp}°C with {hum}% humidity. ⚠️"
            )
        if wind and wind > 30:
            return (
                f"🌬️ Moderate wind in {loc} at {wind} km/h. It's noticeable but manageable. "
                f"If you're on a two-wheeler, ride carefully and maintain extra distance from other vehicles. "
                f"Hold onto hats and light objects. The {temp}°C temperature with {hum}% humidity "
                f"means the wind provides some relief from the heat. 🌬️"
            )
        return (
            f"🍃 Light breeze in {loc} at {wind} km/h — pleasant weather! "
            f"Great conditions to be outdoors. Temperature is {temp}°C with {hum}% humidity. "
            f"The gentle wind keeps things comfortable. Enjoy your day! 😊"
        )

    # ── Today / plan ────────────────────────────────────────────────────
    if any(w in q for w in ["today", "plan", "outside", "outdoor", "go out"]):
        advice = (
            f"Rain is likely ({rain_prob}% chance), so plan indoor activities or carry an umbrella." if rain_prob > 60
            else f"It's very hot ({temp}°C) — best to stay indoors during afternoon and go out in the evening." if temp and temp > 38
            else f"Windy conditions ({wind} km/h) — be cautious with two-wheelers and loose items." if wind and wind > 40
            else f"Great weather to be outside! Stay hydrated and enjoy your day."
        )
        return (
            f"📍 {loc} Today: {cond}, {temp}°C (feels {feels}°C), "
            f"{rain_prob}% rain chance, wind {wind} km/h, humidity {hum}%.\n"
            f"💡 {advice}\n"
            f"UV index is {uv} — {'wear sunscreen if going out' if uv and uv > 5 else 'enjoy the outdoors freely'}. "
            f"Have a wonderful day! 😊"
        )

    # ── Forecast ────────────────────────────────────────────────────────
    if any(w in q for w in ["tomorrow", "forecast", "week"]):
        if forecast:
            lines = [
                f"📅 {d.get('date','?')}: {d.get('condition','?')}, "
                f"{d.get('max_temp_c','?')}°C / {d.get('min_temp_c','?')}°C, "
                f"Rain {d.get('rain_probability',0)}%, Wind {d.get('max_wind_kph','?')} km/h"
                for d in forecast[:3]
            ]
            return (
                "📊 Forecast for " + loc + ":\n" + "\n".join(lines) + "\n\n"
                + ('Pack an umbrella — rain expected!' if any('rain' in str(d.get('condition', '')).lower() for d in forecast[:3])
                   else 'Looks good for outdoor plans! Enjoy the weather!')
                + " 😊"
            )

    # ── Default comprehensive answer ────────────────────────────────────
    return (
        f"🌤️ Here's what's happening in {loc} right now:\n\n"
        f"Currently it's {cond} at {temp}°C, but it feels like {feels}°C "
        f"because of the {hum}% humidity {'making it muggy' if hum and hum > 70 else 'keeping things comfortable' if hum and hum > 40 else 'making the air feel dry'}.\n\n"
        f"The wind is blowing at {wind} km/h, and the UV index is {uv} "
        f"{'— so protect yourself from the sun' if uv and uv > 5 else '— safe for outdoor activities'}.\n\n"
        f"{'💡 Stay hydrated and avoid direct sun during peak hours.' if temp and temp > 35 else '💡 Dress in layers if heading out.' if temp and temp < 10 else '💡 Great weather to enjoy the day!'}\n\n"
        f"Ask me about rain, UV, forecasts, or anything else — I'm here to help! 😊"
    )


def get_conversation_history(user_id: str, location_id: str, n: int = 5) -> list[dict]:
    """Get last N turns for context."""
    db = get_supabase()
    result = (
        db.table("ai_conversations")
        .select("role, message")
        .eq("user_id", user_id)
        .eq("location_id", location_id)
        .order("created_at", desc=True)
        .limit(n)
        .execute()
    )
    turns = list(reversed(result.data or []))
    return [{"role": t["role"], "content": t["message"]} for t in turns]


def store_turn(user_id: str, location_id: str, role: str, message: str):
    """Store a turn — fire and forget. Truncates long messages to protect DB."""
    db = get_supabase()
    # Truncate to 2000 chars to prevent DB bloat
    truncated = message[:2000] if message else ""
    try:
        db.table("ai_conversations").insert(
            {"user_id": user_id, "location_id": location_id, "role": role, "message": truncated}
        ).execute()
    except Exception as exc:
        logger.warning(f"Failed to store turn: {exc}")
