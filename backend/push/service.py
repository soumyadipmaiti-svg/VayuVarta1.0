"""
WeatherGPT — Web Push Notification Service
Sends browser push notifications to users' devices (like Zomato/Swiggy alerts).

How it works:
  1. User opens the WeatherGPT website in their browser.
  2. Browser asks for notification permission (the user clicks "Allow").
  3. Browser creates a PushSubscription object (endpoint + encryption keys).
  4. Frontend POSTs this subscription to POST /api/v1/push/subscribe.
  5. Backend stores the subscription in push_subscriptions table.
  6. When an alert fires, backend calls send_push_to_user() → pywebpush sends
     an encrypted push message to the browser's push service (Google FCM for
     Chrome, Mozilla Push Service for Firefox, etc.).
  7. The browser's Service Worker receives the push event and displays the
     notification on the user's device — even if the tab is closed.

VAPID keys:
  Generate once with: python generate_vapid_keys.py
  Store in .env as VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_EMAIL.
"""

import json
import logging
from pywebpush import webpush, WebPushException

from config import settings
from database import get_supabase

logger = logging.getLogger("push.service")


# ── Core send function ────────────────────────────────────────────────────────

def send_push_notification(
    endpoint: str,
    p256dh: str,
    auth: str,
    title: str,
    body: str,
    icon: str = "/icon-192.png",
    badge: str = "/badge-72.png",
    tag: str = "weathergpt-alert",
    url: str = "/alerts",
    data: dict | None = None,
) -> bool:
    """
    Send a single web push notification to one device subscription.

    Returns True on success, False on failure.
    The notification payload follows the standard Web Notification spec:
    https://developer.mozilla.org/en-US/docs/Web/API/Notification
    """
    if not settings.vapid_private_key or not settings.vapid_public_key:
        logger.warning("VAPID keys not configured — skipping push notification")
        return False

    payload = {
        "title": title,
        "body": body,
        "icon": icon,
        "badge": badge,
        "tag": tag,       # Replaces any existing notification with the same tag
        "url": url,       # Where to navigate when notification is clicked
        "vibrate": [200, 100, 200],
        "requireInteraction": False,
        "data": data or {},
    }

    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={
                "sub": settings.vapid_email,
            },
        )
        logger.debug(f"Push sent successfully to endpoint: {endpoint[:60]}...")
        return True
    except WebPushException as exc:
        status_code = exc.response.status_code if exc.response else None
        logger.error(f"WebPushException (HTTP {status_code}): {exc}")
        # 410 Gone = subscription expired/unsubscribed — remove from DB
        if status_code == 410:
            _remove_dead_subscription(endpoint)
        return False
    except Exception as exc:
        logger.error(f"Unexpected push error: {exc}")
        return False


def _remove_dead_subscription(endpoint: str):
    """Remove a subscription that the browser's push service says is gone (HTTP 410)."""
    db = get_supabase()
    try:
        db.table("push_subscriptions").delete().eq("endpoint", endpoint).execute()
        logger.info(f"Removed dead push subscription: {endpoint[:60]}...")
    except Exception as exc:
        logger.warning(f"Could not remove dead subscription: {exc}")


# ── Batch send to a user ───────────────────────────────────────────────────────

def send_push_to_user(
    user_id: str,
    title: str,
    body: str,
    icon: str = "/icon-192.png",
    tag: str = "weathergpt-alert",
    url: str = "/alerts",
    data: dict | None = None,
) -> int:
    """
    Send a push notification to ALL devices a user has subscribed from.
    Returns the count of successful sends.
    This is the main function called by the notification service.
    """
    db = get_supabase()
    subs_result = (
        db.table("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", user_id)
        .execute()
    )
    subscriptions = subs_result.data or []

    if not subscriptions:
        logger.debug(f"No push subscriptions for user {user_id}")
        return 0

    success_count = 0
    for sub in subscriptions:
        ok = send_push_notification(
            endpoint=sub["endpoint"],
            p256dh=sub["p256dh"],
            auth=sub["auth"],
            title=title,
            body=body,
            icon=icon,
            tag=tag,
            url=url,
            data=data,
        )
        if ok:
            success_count += 1

    logger.info(f"Push: sent to {success_count}/{len(subscriptions)} devices for user {user_id}")
    return success_count


# ── Daily briefing push ────────────────────────────────────────────────────────

def send_daily_briefing_push(user_id: str, location_name: str, summary: str):
    """Send a 'Good morning' daily weather briefing push."""
    send_push_to_user(
        user_id=user_id,
        title=f"🌤️ Morning Weather — {location_name}",
        body=summary,
        tag="weathergpt-briefing",
        url="/dashboard",
        data={"type": "daily_briefing"},
    )
