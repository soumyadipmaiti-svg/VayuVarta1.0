# WeatherGPT — Backend Implementation Plan

## Overview

Build a complete **Python FastAPI** backend for the WeatherGPT platform (PRD v1.0). A skeleton already exists with `main.py`, `config.py`, `database.py`, and `auth/router.py`. Everything else needs to be created from scratch.

**Stack:** FastAPI + Supabase (PostgreSQL) + WeatherAPI.com + Google Gemini + Meta WhatsApp Cloud API + APScheduler

---

## What Already Exists

| File | Status |
|---|---|
| `backend/main.py` | ✅ Complete — mounts all routers, schedules alert engine |
| `backend/config.py` | ✅ Complete — all env vars via pydantic-settings |
| `backend/database.py` | ✅ Complete — Supabase singleton |
| `backend/auth/router.py` | ✅ Complete — register, login, logout, /me, JWT, role guards |
| Everything else | ❌ Missing — needs to be created |

---

## Open Questions

> [!IMPORTANT]
> **Weather API Provider**: The config uses `https://api.weatherapi.com/v1`. I'll implement against **WeatherAPI.com** (supports current, forecast, historical, AQI all in one key — good free tier).

> [!IMPORTANT]
> **LLM**: The config has `GEMINI_API_KEY` + `gemini-1.5-flash`. I'll use **Google Gemini** via `google-generativeai` SDK.

> [!NOTE]
> **WhatsApp OTP**: For MVP, OTP verification will be simulated (generate a 6-digit code, store it in DB, verify against it). Real SMS/WhatsApp OTP delivery requires a live approved WhatsApp Business account which is environment-dependent.

---

## Files to Create

### Database Schema

#### [NEW] `backend/schema.sql`
Full PostgreSQL DDL for all tables as specified in PRD §16, plus indexes and constraints.

---

### Weather Module

#### [NEW] `backend/weather/__init__.py`
#### [NEW] `backend/weather/router.py`
Routes:
- `GET /api/v1/weather/current?location_id=...`
- `GET /api/v1/weather/forecast?location_id=...&type=daily|hourly|extended`
- `GET /api/v1/weather/historical?location_id=...&month=6`

#### [NEW] `backend/weather/service.py`
- `fetch_current_weather(location)` — calls WeatherAPI.com, normalizes response, caches in `weather_data` table (TTL 10 min)
- `fetch_forecast(location, type)` — calls WeatherAPI.com forecast endpoint, caches in `forecasts` table
- `fetch_historical(location, month)` — reads from `climate_data` table (pre-seeded) or returns HTTP error

---

### Locations Module

#### [NEW] `backend/locations/__init__.py`
#### [NEW] `backend/locations/router.py`
Routes:
- `GET /api/v1/locations`
- `POST /api/v1/locations`
- `DELETE /api/v1/locations/{id}`
- `PATCH /api/v1/locations/{id}/default`

---

### AI Module

#### [NEW] `backend/ai/__init__.py`
#### [NEW] `backend/ai/router.py`
Routes:
- `POST /api/v1/ai/ask` — RAG-style: fetch weather → build prompt → call Gemini → store conversation
- `GET /api/v1/ai/conversations` — retrieve last N turns

#### [NEW] `backend/ai/service.py`
- `build_weather_prompt(weather_data, history, question)` — constructs grounded prompt
- `ask_gemini(prompt)` — calls Gemini API with error handling
- `get_conversation_history(user_id, location_id, n=10)` — fetches last N turns from DB

---

### Alerts Module

#### [NEW] `backend/alerts/__init__.py`
#### [NEW] `backend/alerts/router.py`
Routes:
- `GET /api/v1/alerts` — list active alerts for current user
- `POST /api/v1/alerts/subscriptions` — create alert subscription
- `PATCH /api/v1/alerts/subscriptions/{id}` — update subscription
- `GET /api/v1/alerts/subscriptions` — list user's subscriptions
- `DELETE /api/v1/alerts/subscriptions/{id}` — remove subscription

#### [NEW] `backend/alerts/engine.py`
The scheduled background job (`run_alert_evaluation()`):
1. Fetch all active subscriptions grouped by location
2. For each location: call weather service (from cache if fresh)
3. Evaluate each subscription condition
4. If condition met and no active duplicate: create alert record
5. Dispatch to notification service
6. Expire old alerts

---

### WhatsApp Module

#### [NEW] `backend/whatsapp/__init__.py`
#### [NEW] `backend/whatsapp/router.py`
Routes:
- `POST /api/v1/whatsapp/register` — submit phone number, generate+store OTP
- `POST /api/v1/whatsapp/verify` — confirm OTP, mark phone_verified
- `POST /api/v1/whatsapp/subscribe` — opt-in, save notification preferences
- `POST /api/v1/whatsapp/unsubscribe` — opt-out
- `GET /api/v1/whatsapp/status` — recent message delivery statuses
- `POST /api/v1/whatsapp/webhook` — Meta webhook for delivery status callbacks
- `GET /api/v1/whatsapp/webhook` — Meta webhook verification challenge

#### [NEW] `backend/whatsapp/service.py`
- `send_whatsapp_template(phone, template_name, params)` — calls Meta Cloud API
- `process_webhook_status(payload)` — updates `whatsapp_messages` status
- `verify_webhook_signature(request)` — validates Meta webhook HMAC

---

### Notification Service

#### [NEW] `backend/notifications/__init__.py`
#### [NEW] `backend/notifications/service.py`
- `dispatch_alert(alert, user)` — routes alert to WhatsApp and/or in-app
- `send_in_app_notification(alert, user_id)` — writes to `notification_logs`
- `retry_failed_whatsapp(message_id)` — exponential backoff retry logic
- `send_daily_briefing(user, location)` — builds and sends morning briefing template

---

### Admin Module

#### [NEW] `backend/admin/__init__.py`
#### [NEW] `backend/admin/router.py`
Routes (all require admin role):
- `GET /api/v1/admin/users` — list all users with stats
- `GET /api/v1/admin/notifications/logs` — notification logs with filters
- `GET /api/v1/admin/system/health` — ping weather API, AI API, DB

---

### Supporting Files

#### [NEW] `backend/requirements.txt`
All Python dependencies with pinned versions.

#### [NEW] `backend/.env.example`
Template for all required environment variables.

#### [NEW] `backend/schema.sql`
Full DDL for all 11 tables from PRD §16 with proper constraints and indexes.

#### [NEW] `backend/seed_climate.py`
Script to seed sample climate data (monthly averages) for demo locations.

#### [NEW] `backend/README.md`
Setup guide: env vars, DB migration, running locally, running the alert engine.

---

## Implementation Order

1. `schema.sql` — DB first, everything depends on it
2. `requirements.txt` + `.env.example`
3. `weather/` module — foundation for alerts and AI
4. `locations/` module — needed by weather and AI
5. `ai/` module — depends on weather service
6. `alerts/engine.py` + `alerts/router.py` — depends on weather + notifications
7. `notifications/service.py` — depends on whatsapp service
8. `whatsapp/` module
9. `admin/` module
10. `seed_climate.py` + `README.md`

---

## Verification Plan

### Automated
- Run `uvicorn main:app --reload` and confirm all routers mount cleanly
- Hit `/docs` to verify all endpoints appear with correct schemas
- Test auth: register → login → use token on protected route

### Manual
- `POST /api/v1/weather/current` with a valid location returns weather data
- `POST /api/v1/ai/ask` returns a grounded Gemini response
- Alert engine evaluation creates an alert when threshold is exceeded
- WhatsApp webhook endpoint passes Meta's verification challenge
