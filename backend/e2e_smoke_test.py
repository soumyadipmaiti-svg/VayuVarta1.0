"""
E2E smoke test — runs the REAL app through ASGI (no server needed).
Covers: register → login → me → forgot-password (REAL SMTP email) →
        reset-password → login with new password.
Safe to run repeatedly. Does NOT print secrets.
"""
import asyncio
import hashlib
import os
import secrets
import sys
import time
import uuid

import httpx

from database import get_supabase
from main import app

BASE = "http://test/api/v1"
EMAIL = os.getenv("TEST_EMAIL", "vayuvarta2.0@gmail.com")  # app's own mailbox


def db():
    return get_supabase()


def hash_token(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


async def main() -> None:
    results = []
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:

        async def step(name: str, coro, expect=(200, 201)):
            """Run a step; PASS if status is in `expect` (default success)."""
            try:
                r = await coro
                ok = r.status_code in expect
                results.append((name, "PASS" if ok else "FAIL", r.status_code, r.text[:160]))
                return r
            except Exception as e:  # noqa: BLE001
                results.append((name, "ERROR", "-", str(e)[:160]))
                return None

        # ── 0. health ────────────────────────────────────────────────────────
        r = await step("GET /health", c.get("http://test/health"))
        if r is not None:
            j = r.json()
            print(f"  health: email_configured={j.get('email_configured')} frontend_url={j.get('frontend_url')}")

        ts = str(int(time.time()))
        uniq = f"e2e-{ts[:8]}-{secrets.token_hex(3)}"

        # ── 1. register a fresh user ─────────────────────────────────────────
        r = await step("POST /auth/register (new user)", c.post(f"{BASE}/auth/register",
            json={"name": "E2E Tester", "email": f"{uniq}@example.com", "password": "TestPass123"}))
        if r is None or r.status_code != 201:
            print("\nREGISTER FAILED — aborting flow (email may already exist).")
            for n, s, code, body in results:
                print(f"  [{s}] {n} -> {code} {body}")
            sys.exit(1)
        user_id = r.json().get("id")
        print(f"  registered user id={user_id[:8]}...")

        # ── 2. login with new password ───────────────────────────────────────
        await step("POST /auth/login (new user)", c.post(f"{BASE}/auth/login",
            json={"email": f"{uniq}@example.com", "password": "TestPass123"}))

        # ── 3. login with WRONG password (must 401) ──────────────────────────
        await step("POST /auth/login wrong pw (expect 401)", c.post(f"{BASE}/auth/login",
            json={"email": f"{uniq}@example.com", "password": "WrongPass999"}), expect=(401,))

        # ── 4. forgot-password for the app's own mailbox (REAL EMAIL) ────────
        #    (registered below so the flow sends a real message to the inbox)
        db().table("users").upsert(
            {"name": "Vayu App Mailbox", "email": EMAIL,
             "password_hash": "$2b$12$" + "x" * 53, "role": "user"},
            on_conflict="email").execute()
        r = await step("POST /auth/forgot-password (REAL EMAIL)", c.post(f"{BASE}/auth/forgot-password",
            json={"email": EMAIL}))
        if r is not None:
            print(f"  forgot-password response: {r.json().get('message','')[:80]}")
            print("  → Check the Gmail inbox now — a real reset email should arrive.")

        # ── 5. forgot-password for a non-registered email (anti-enumeration) ──
        await step("POST /auth/forgot-password unknown (expect 200 too)",
                   c.post(f"{BASE}/auth/forgot-password",
                          json={"email": f"ghost-{ts}@example.com"}))

        # ── 6. reset-password with a forged/unknown token (must 400) ─────────
        await step("POST /auth/reset-password bad token (expect 400)",
                   c.post(f"{BASE}/auth/reset-password",
                          json={"token": "definitely-not-a-real-token", "new_password": "NewPass456"}),
                   expect=(400,))

        # ── 7. reset-password with a REAL token created directly ─────────────
        raw = secrets.token_urlsafe(48)
        db().table("password_reset_tokens").insert({
            "user_id": user_id,
            "token_hash": hash_token(raw),
            "expires_at": (__import__("datetime").datetime.now(__import__("datetime").timezone.utc)
                           + __import__("datetime").timedelta(minutes=5)).isoformat(),
            "used": False,
        }).execute()
        r = await step("POST /auth/reset-password valid token", c.post(f"{BASE}/auth/reset-password",
            json={"token": raw, "new_password": "BrandNewPass789"}))
        if r is not None:
            print(f"  reset-password response: {r.json().get('message','')[:80]}")

        # ── 8. token reuse must fail (single-use) ────────────────────────────
        await step("POST /auth/reset-password token reuse (expect 400)",
                   c.post(f"{BASE}/auth/reset-password",
                          json={"token": raw, "new_password": "AnotherPass111"}),
                   expect=(400,))

        # ── 9. login with the NEW password (must succeed) ────────────────────
        await step("POST /auth/login with NEW password", c.post(f"{BASE}/auth/login",
            json={"email": f"{uniq}@example.com", "password": "BrandNewPass789"}))

        # ── 10. login with the OLD password (must fail) ──────────────────────
        await step("POST /auth/login with OLD password (expect 401)", c.post(f"{BASE}/auth/login",
            json={"email": f"{uniq}@example.com", "password": "TestPass123"}), expect=(401,))

    print("\n" + "=" * 60)
    failed = 0
    for name, status, code, body in results:
        mark = "✅" if status == "PASS" else "❌"
        if status != "PASS":
            failed += 1
        print(f"  {mark} {name}  [{code}]")
        if status != "PASS":
            print(f"      {body}")
    print("=" * 60)
    print(f"RESULT: {len(results) - failed}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    asyncio.run(main())