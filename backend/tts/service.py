"""
Vayu Varta — Fish Audio TTS Service
Converts text to speech using Fish Audio's S2.1 Pro model.
Auto-detects language and selects the best voice:
  - Bengali text → Bengali voice (clear, warm, rural-friendly)
  - Hindi text → Hindi voice
  - English text → English voice
"""

import httpx
import logging
from config import settings

logger = logging.getLogger("tts.service")

FISH_TTS_URL = "https://api.fish.audio/v1/tts"

# ── Language-specific voice IDs ──────────────────────────────────────────────
# Bengali voices (primary target audience)
BENGALI_VOICE = "bc12f6ce4c8d4866a39ee2da70143a78"      # Bengali AI Voice (Female, warm)
BENGALI_CALM_VOICE = "8777ccf2fcd545c1a22e1a79494a46d4"  # Calm Bengali Voice (Male)
# Default multi-language voice
DEFAULT_VOICE = "b545c585f631496c914815291da4e893"        # Friendly Women (multi-lang)


def detect_language(text: str) -> str:
    """Detect language from text content using Unicode ranges."""
    if not text:
        return "en"
    # Bengali script: U+0980–U+09FF
    bengali_count = sum(1 for c in text if '\u0980' <= c <= '\u09FF')
    # Devanagari (Hindi): U+0900–U+097F
    hindi_count = sum(1 for c in text if '\u0900' <= c <= '\u097F')
    total = len(text.strip())
    if total == 0:
        return "en"
    # If significant Bengali characters → Bengali
    if bengali_count > total * 0.15:
        return "bn"
    # If significant Hindi characters → Hindi
    if hindi_count > total * 0.15:
        return "hi"
    # Check for Hinglish/Banglish (romanized)
    lower = text.lower()
    bengali_words = ["ami", "tumi", "kemon", "ache", "kothay", "jai", "khete", "pani", "bristi", "mausam", "gorom", "thanda", "bhalo", "kharap", "aschi", "jacchi", "korbo", "hobe", "na", "ki", "ei", "oi", "ekhane", "sekhane", "abar", "sampurno", "diner", "ratre", "dupur", "shokal", "bikel", "bolte", "parbo", "janina", "sundi", "bheeshon", "khub", "onek", "ektu", "baarish", "ghumiye", "phire", "aaste", "dharun", "bujhte", "laglo", "lagche", "hobena", "korchhi", "korchi", "jachhi", "khabo", "kheye", "jaoya", "nera"]
    hindi_words = ["mai", "tum", "kaisa", "hai", "kahan", "jana", "khana", "pani", "barish", "mausam", "garam", "thanda", "accha", "bura", "aa", "ja", "karunga", "hoga", "nahi", "kya", "yeh", "woh", "yahan", "wahan", "phir", "poora", "din", "raat", "dopur", "subah", "shaam"]
    words = lower.split()
    bn_matches = sum(1 for w in words if w in bengali_words)
    hi_matches = sum(1 for w in words if w in hindi_words)
    if bn_matches >= 2:
        return "bn"
    if hi_matches >= 2:
        return "hi"
    return "en"


def get_voice_for_language(lang: str) -> str:
    """Select the best voice ID for the detected language."""
    if lang == "bn":
        return BENGALI_VOICE
    if lang == "hi":
        return DEFAULT_VOICE  # Multi-lang voice handles Hindi well
    return DEFAULT_VOICE


async def text_to_speech(
    text: str,
    voice_id: str | None = None,
    speed: float = 0.8,
) -> bytes | None:
    """
    Convert text to speech using Fish Audio API.
    Returns raw MP3 audio bytes, or None on failure.

    Auto-detects language and picks the best voice:
    - Bengali text → Bengali voice (warm, clear)
    - Hindi text → Multi-lang voice
    - English text → Multi-lang voice
    """
    if not settings.fish_audio_api_key:
        logger.warning("Fish Audio API key not configured")
        return None

    if not text or not text.strip():
        return None

    # Truncate very long text to avoid API limits
    clean_text = text.strip()
    if len(clean_text) > 2000:
        clean_text = clean_text[:2000] + "..."

    # Auto-detect language and select voice
    detected_lang = detect_language(clean_text)
    selected_voice = voice_id or get_voice_for_language(detected_lang)
    logger.info(f"TTS: detected lang={detected_lang}, voice={selected_voice}")

    # Bengali gets slightly slower speed for clarity in rural areas
    adjusted_speed = speed
    if detected_lang == "bn":
        adjusted_speed = min(speed, 0.75)  # Slightly slower for Bengali clarity

    payload = {
        "text": clean_text,
        "reference_id": selected_voice,
        "temperature": 0.4,          # Lower = more consistent, clearer voice
        "top_p": 0.4,                # Lower = more focused pronunciation
        "prosody": {
            "speed": adjusted_speed,  # 0.75 for Bengali, 0.8 for others
            "volume": 0,
            "normalize_loudness": True,
        },
        "chunk_length": 300,
        "normalize": True,
        "format": "mp3",
        "sample_rate": 44100,
        "mp3_bitrate": 192,          # Higher bitrate = clearer audio
        "latency": "normal",         # Best quality (not fastest)
        "max_new_tokens": 1024,
        "repetition_penalty": 1.2,
        "condition_on_previous_chunks": True,  # Better voice consistency
    }

    headers = {
        "Authorization": f"Bearer {settings.fish_audio_api_key}",
        "Content-Type": "application/json",
        "model": settings.fish_audio_model,
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                FISH_TTS_URL,
                json=payload,
                headers=headers,
            )

            if response.status_code == 200:
                audio_data = response.content
                logger.info(f"TTS generated: {len(audio_data)} bytes for {len(clean_text)} chars")
                return audio_data
            else:
                logger.error(f"Fish Audio TTS failed: {response.status_code} — {response.text[:200]}")
                return None

    except httpx.TimeoutException:
        logger.error("Fish Audio TTS request timed out")
        return None
    except Exception as exc:
        logger.error(f"Fish Audio TTS error: {exc}")
        return None
