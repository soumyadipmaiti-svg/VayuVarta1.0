"""
Vayu Varta — TTS Router
Routes: /api/v1/tts/*
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth.router import get_current_user
from tts.service import text_to_speech

router = APIRouter(prefix="/tts", tags=["tts"])


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    voice_id: str | None = None
    speed: float = Field(1.0, ge=0.5, le=2.0)


@router.post("")
async def synthesize_speech(
    body: TTSRequest,
    user: dict = Depends(get_current_user),
):
    """
    Convert text to speech using Fish Audio TTS.
    Fish Audio auto-detects language from text content.
    Returns MP3 audio bytes.
    """
    audio = await text_to_speech(
        text=body.text,
        voice_id=body.voice_id,
        speed=body.speed,
    )

    if audio is None:
        raise HTTPException(
            status_code=503,
            detail="TTS service unavailable. Please try again.",
        )

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=\"vayugpt-speech.mp3\"",
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/voices")
async def list_voices(user: dict = Depends(get_current_user)):
    """Return available voice configurations."""
    return {
        "default_voice_id": "b545c585f631496c914815291da4e893",
        "voices": [
            {"id": "b545c585f631496c914815291da4e893", "name": "Friendly Women", "lang": "Multi"},
            {"id": "a71f0b05f92b4b749b477f5b1001c95f", "name": "Friendly Teen Voice", "lang": "Multi"},
            {"id": "dfbc7fb5fafa44eab3648600a52bf2d8", "name": "Friendly Young Voice", "lang": "Multi"},
        ],
    }
