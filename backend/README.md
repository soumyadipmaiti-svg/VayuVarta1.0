# WeatherGPT Backend

> Python FastAPI backend for the WeatherGPT AI-Powered Weather Platform.

---

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
# Edit .env with your API keys
```

Required keys:
| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase project → Settings → API → service_role key |
| `JWT_SECRET_KEY` | Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `WEATHER_API_KEY` | [weatherapi.com](https://www.weatherapi.com/) — free tier |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `VAPID_PRIVATE_KEY` | Run: `python generate_vapid_keys.py` |
| `VAPID_PUBLIC_KEY` | Same as above |

### 3. Set Up the Database

Run `schema.sql` in your Supabase SQL Editor:
1. Open Supabase → SQL Editor
2. Paste contents of `schema.sql`
3. Click **Run**

Also run **`MIGRATE_PASSWORD_RESET.sql`** (required for the forgot-password / reset-link feature). Use this exact project URL so it doesn't land on the wrong project:
https://supabase.com/dashboard/project/phzvhawsjmjxjlfbrqcw/sql/new

### 4. Seed Climate Data (for demo)

```bash
python seed_climate.py
```

Seeds historical monthly averages for **Kolkata, Mumbai, Delhi**.

### 5. Generate VAPID Keys (for Web Push)

```bash
python generate_vapid_keys.py
```

Copy the output into your `.env` file. Also give `VAPID_PUBLIC_KEY` to your frontend.

### 6. Run the Server

```bash
uvicorn main:app --reload --port 8000
```

API docs: **http://localhost:8000/docs**

---

## Project Structure

```
backend/
├── main.py                  # FastAPI app + APScheduler startup
├── config.py                # All env vars via pydantic-settings
├── database.py              # Supabase singleton client
├── schema.sql               # Full DB DDL — run in Supabase SQL Editor
├── requirements.txt         # Python dependencies
├── .env.example             # Env var template
├── generate_vapid_keys.py   # One-time VAPID key generator
├── seed_climate.py          # Seed historical climate data for demo cities
│
├── auth/                    # JWT auth (register, login, logout, /me)
├── weather/                 # WeatherAPI.com integration + caching
├── locations/               # User saved locations (CRUD)
├── ai/                      # Gemini AI conversational assistant
├── alerts/                  # Alert subscriptions + Alert Engine (APScheduler)
├── push/                    # 🔔 Web Push Notifications (like Zomato/Swiggy)
├── whatsapp/                # WhatsApp Business Cloud API integration
├── notifications/           # Central dispatcher (push + WhatsApp + in-app)
└── admin/                   # Admin-only: users, logs, health, stats
```

---

## API Endpoints

All routes prefixed `/api/v1`. Auth routes are public; all others require `Authorization: Bearer <token>`.

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login → JWT token |
| GET | `/auth/me` | Get current user |
| GET | `/weather/current` | Current conditions (cached 10 min) |
| GET | `/weather/forecast` | Hourly/daily/extended forecast |
| GET | `/weather/historical` | Historical monthly averages |
| GET | `/locations` | List saved locations |
| POST | `/locations` | Add location |
| PATCH | `/locations/{id}/default` | Set default location |
| DELETE | `/locations/{id}` | Remove location |
| POST | `/ai/ask` | Ask WeatherGPT (Gemini grounded) |
| GET | `/ai/conversations` | Chat history |
| GET | `/alerts` | Active alerts |
| POST | `/alerts/subscriptions` | Subscribe to alert type |
| PATCH | `/alerts/subscriptions/{id}` | Update threshold |
| **GET** | **`/push/vapid-public-key`** | **VAPID key for frontend** |
| **POST** | **`/push/subscribe`** | **Register browser push subscription** |
| **DELETE** | **`/push/unsubscribe`** | **Remove push subscription** |
| **POST** | **`/push/test`** | **Send test push notification** |
| POST | `/whatsapp/register` | Submit phone for verification |
| POST | `/whatsapp/verify` | Confirm OTP |
| POST | `/whatsapp/subscribe` | Opt into WhatsApp alerts |
| GET/POST | `/whatsapp/webhook` | Meta webhook verification + status |
| GET | `/admin/users` | List all users (admin) |
| GET | `/admin/notifications/logs` | Notification audit log (admin) |
| GET | `/admin/system/health` | System health check (admin) |
| GET | `/admin/stats` | Platform statistics (admin) |

---

## Web Push Flow (Browser Notifications)

This is how alerts reach users on their phone/desktop — exactly like Zomato/Swiggy:

```
1. User opens WeatherGPT in browser
2. Browser asks: "Allow notifications?" → User clicks Allow
3. Browser generates a PushSubscription { endpoint, p256dh, auth }
4. Frontend calls: POST /api/v1/push/subscribe  ← stores in DB
5. User sets an alert threshold (e.g., rain > 70%)
6. Alert Engine runs every 30 min → checks weather data
7. Threshold crossed → alert created → dispatch_alert() called
8. push/service.py calls pywebpush → sends encrypted push to browser's push service
9. Browser Service Worker receives push → shows native notification
10. User taps notification → opens /alerts page
```

**Frontend needs:**
1. Register a Service Worker (`/sw.js`) that handles `push` events
2. Call `pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC_KEY })`
3. POST the subscription to `/api/v1/push/subscribe`

---

## Alert Engine

- Runs every **30 minutes** via APScheduler
- Evaluates all enabled `alert_subscriptions` against fresh weather data
- Default thresholds: rain ≥ 70%, heat ≥ 40°C, cold ≤ 5°C, wind ≥ 60 km/h, UV ≥ 8
- **Deduplication**: no duplicate alerts within a 6-hour window for the same (user, location, event)
- **Severity**: INFO / WARNING / CRITICAL based on how far metric exceeds threshold

---

## Security Notes

- Passwords hashed with **bcrypt** (never stored plaintext)
- All secrets in `.env` — never committed to git (add `.env` to `.gitignore`)
- JWT tokens expire in 7 days (configurable via `JWT_EXPIRE_MINUTES`)
- Admin endpoints enforce role check — regular users get HTTP 403
- WhatsApp webhook calls verified via HMAC-SHA256
- VAPID private key stays server-side only

---

## Create an Admin User

After registering a normal user, update their role in Supabase:
```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```
