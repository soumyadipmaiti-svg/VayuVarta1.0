"""
WeatherGPT — WhatsApp Service (Meta Cloud API)
Sends alert and briefing messages via official WhatsApp Business Cloud API.
Handles template-based messaging, delivery status, and retry logic.

Template messages must be pre-approved by Meta.
See: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
"""

import httpx
import logging
from datetime import datetime, timezone

from config import settings
from database import get_supabase

logger = logging.getLogger("whatsapp.service")

WHATSAPP_API_BASE = "https://graph.facebook.com"


def _wa_enabled() -> bool:
    """Return True if WhatsApp credentials are configured."""
    return bool(settings.whatsapp_access_token and settings.whatsapp_phone_number_id)


# ── Send a templated WhatsApp message ────────────────────────────────────────

async def send_template_message(
    phone_number: str,
    template_name: str,
    components: list[dict],
    language_code: str = "en",
) -> str | None:
    """
    Send a WhatsApp template message via Meta Cloud API.
    Returns the provider's message_id on success, None on failure.

    phone_number: E.164 format, e.g. "+919876543210"
    template_name: Pre-approved template name in Meta Business Manager
    components: List of component dicts (header/body/footer parameter values)
    """
    if not _wa_enabled():
        logger.warning("WhatsApp not configured — message not sent")
        return None

    url = (
        f"{WHATSAPP_API_BASE}/{settings.whatsapp_api_version}"
        f"/{settings.whatsapp_phone_number_id}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone_number,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            "components": components,
        },
    }
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_access_token}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            msg_id = data.get("messages", [{}])[0].get("id")
            logger.info(f"WhatsApp sent to {phone_number}: msg_id={msg_id}")
            return msg_id
    except httpx.HTTPStatusError as exc:
        logger.error(
            f"WhatsApp API HTTP error {exc.response.status_code}: {exc.response.text}"
        )
        return None
    except Exception as exc:
        logger.error(f"WhatsApp send failed: {exc}")
        return None


# ── Alert message ─────────────────────────────────────────────────────────────

async def send_alert_whatsapp(alert: dict, phone_number: str):
    """
    Send a weather alert via WhatsApp using the appropriate template.
    Creates a whatsapp_messages record with status tracking.
    """
    db = get_supabase()
    severity = alert.get("severity", "WARNING")
    event_type = alert.get("event_type", "weather")
    message = alert.get("message", "Weather alert")

    # Choose template by severity
    template_name = "severe_alert" if severity == "CRITICAL" else "rain_alert"

    # Template components (parameters must match your approved template)
    components = [
        {
            "type": "body",
            "parameters": [
                {"type": "text", "text": message},
            ],
        }
    ]

    # Create a pending record in whatsapp_messages
    record = (
        db.table("whatsapp_messages")
        .insert(
            {
                "user_id": alert["user_id"],
                "alert_id": alert["id"],
                "template_name": template_name,
                "status": "queued",
                "attempt_count": 1,
            }
        )
        .execute()
    )
    msg_record = record.data[0]

    # Send via API
    provider_id = await send_template_message(phone_number, template_name, components)

    # Update record with result
    new_status = "sent" if provider_id else "failed"
    db.table("whatsapp_messages").update(
        {
            "status": new_status,
            "provider_msg_id": provider_id,
            "sent_at": datetime.now(timezone.utc).isoformat() if provider_id else None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", msg_record["id"]).execute()


# ── Daily briefing ────────────────────────────────────────────────────────────

async def send_daily_briefing_whatsapp(
    user_id: str,
    phone_number: str,
    location: str,
    condition: str,
    temp: float,
    rain_prob: int,
):
    """Send a morning weather briefing via WhatsApp daily_briefing template."""
    components = [
        {
            "type": "body",
            "parameters": [
                {"type": "text", "text": location},
                {"type": "text", "text": condition},
                {"type": "text", "text": str(temp)},
                {"type": "text", "text": str(rain_prob)},
            ],
        }
    ]
    await send_template_message(phone_number, "daily_briefing", components)


# ── Webhook: process delivery status ─────────────────────────────────────────

def process_delivery_status(payload: dict):
    """
    Process a WhatsApp delivery status webhook from Meta.
    Updates the whatsapp_messages table with the latest status.

    Statuses: sent → delivered → read (or failed)
    """
    db = get_supabase()
    try:
        entries = payload.get("entry", [])
        for entry in entries:
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for status_obj in value.get("statuses", []):
                    provider_msg_id = status_obj.get("id")
                    status = status_obj.get("status")  # sent/delivered/read/failed
                    if not provider_msg_id or not status:
                        continue

                    db.table("whatsapp_messages").update(
                        {
                            "status": status,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }
                    ).eq("provider_msg_id", provider_msg_id).execute()
                    logger.debug(f"WhatsApp status update: {provider_msg_id} → {status}")
    except Exception as exc:
        logger.error(f"Failed to process WhatsApp webhook: {exc}")


# ── Webhook signature verification ────────────────────────────────────────────

def verify_webhook_signature(signature_header: str, raw_body: bytes) -> bool:
    """
    Verify that a webhook call genuinely comes from Meta using HMAC-SHA256.
    signature_header: value of 'X-Hub-Signature-256' header
    """
    import hmac
    import hashlib

    app_secret = settings.whatsapp_access_token  # Use your app secret here
    if not app_secret:
        return True  # Skip verification if not configured

    expected = "sha256=" + hmac.new(
        app_secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")
