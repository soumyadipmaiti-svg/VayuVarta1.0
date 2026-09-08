"""
User-journey smoke test — the real daily flow:
register → login → add location (Kolkata) → current weather → daily + hourly
forecast → VayuGPT streaming chat (real Gemini) → conversation history.
Runs against real Supabase + Open-Meteo + Gemini.
"""
import asyncio
import json
import secrets
import sys
import time

import httpx

from main import app

BASE = "http://test/api/v1"


async def main() -> None:
    ts = str(int(time.time()))
    uniq = f"journey-{ts[:8]}-{secrets.token_hex(3)}"
    results = []

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        async def step(name: str, coro, expect=(200, 201)):
            try:
                r = await coro
                ok = r.status_code in expect
                results.append((name, "PASS" if ok else "FAIL", r.status_code, r.text[:200]))
                return r
            except Exception as e:  # noqa: BLE001
                results.append((name, "ERROR", "-", str(e)[:200]))
                return None

        # 1. Register + login
        r = await step("register", c.post(f"{BASE}/auth/register",
            json={"name": "Journey Tester", "email": f"{uniq}@example.com", "password": "JourneyPass123"}))
        if r is None or r.status_code != 201:
            print("register failed — aborting")
            sys.exit(1)
        r = await step("login", c.post(f"{BASE}/auth/login",
            json={"email": f"{uniq}@example.com", "password": "JourneyPass123"}))
        token = r.json()["token"]
        H = {"Authorization": f"Bearer {token}"}

        # 2. Add a location (Kolkata)
        r = await step("add location (Kolkata)", c.post(f"{BASE}/locations",
            json={"name": "Kolkata", "latitude": 22.5726, "longitude": 88.3639, "label": "Home"},
            headers=H))
        loc_id = r.json()["location_id"] if r.status_code == 201 else None

        # 3. List locations
        await step("list locations", c.get(f"{BASE}/locations", headers=H))

        # 4. Current weather
        r = await step("current weather", c.get(f"{BASE}/weather/current",
            params={"location_id": loc_id}, headers=H), expect=(200, 502))
        if r is not None and r.status_code == 200:
            j = r.json()
            print(f"    current: {j.get('temp_c')}°C {j.get('condition')} wind {j.get('wind_kph')} km/h")

        # 5. Daily + hourly forecast
        r = await step("daily forecast", c.get(f"{BASE}/weather/forecast",
            params={"location_id": loc_id, "type": "daily"}, headers=H), expect=(200, 502))
        if r is not None and r.status_code == 200:
            days = r.json().get("days", [])
            print(f"    daily: {len(days)} days, first={days[0]['date']} {days[0]['max_temp_c']}°C {days[0]['condition']}")
        r = await step("hourly forecast", c.get(f"{BASE}/weather/forecast",
            params={"location_id": loc_id, "type": "hourly"}, headers=H), expect=(200, 502))
        if r is not None and r.status_code == 200:
            hours = r.json().get("hours", [])
            print(f"    hourly: {len(hours)} hours, first={hours[0]['time']} {hours[0]['temp_c']}°C")

        # 6. VayuGPT — streaming chat with REAL Gemini (time-to-first-token)
        t0 = time.monotonic()
        full = []
        try:
            async with c.stream("POST", f"{BASE}/ai/ask-stream",
                                json={"location_id": loc_id, "message": "What is the weather like in my location today? Answer in 3 sentences."},
                                headers=H) as sr:
                print(f"    ask-stream HTTP status: {sr.status_code}")
                async for line in sr.aiter_lines():
                    if line.startswith("data: "):
                        evt = json.loads(line[6:])
                        if "token" in evt:
                            full.append(evt["token"])
                            if len(full) == 1:
                                print(f"    first token after {time.monotonic() - t0:.2f}s")
                        elif evt.get("done"):
                            print(f"    done in {time.monotonic() - t0:.2f}s, reply {len(evt.get('reply',''))} chars, elapsed_ms={evt.get('elapsed_ms')}")
            ok = bool(full) and sr.status_code == 200
            results.append(("VayuGPT streaming (real Gemini)", "PASS" if ok else "FAIL",
                            sr.status_code, f"tokens={len(full)} first_line={' '.join(full)[:120]!r}"))
        except Exception as e:  # noqa: BLE001
            results.append(("VayuGPT streaming (real Gemini)", "ERROR", "-", str(e)[:200]))

        # 7. Conversation history
        await step("conversation history", c.get(f"{BASE}/ai/conversations",
            params={"location_id": loc_id, "limit": 5}, headers=H))

        # 8. Alarms/notifications read endpoints (user flow)
        await step("notifications list", c.get(f"{BASE}/notifications", headers=H), expect=(200, 404))
        await step("alarms list", c.get(f"{BASE}/alarms", headers=H), expect=(200, 404))

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