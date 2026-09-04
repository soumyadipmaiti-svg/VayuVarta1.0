# ╔══════════════════════════════════════════════════════════════════╗
# ║           VAYU VARTA — WORKFLOW BLUEPRINT                      ║
# ║        AI-Powered Weather Intelligence Platform                 ║
# ║              Smart India Hackathon (SIH) 2026                   ║
# ╚══════════════════════════════════════════════════════════════════╝

## 1. PROJECT OVERVIEW

Vayu Varta is an AI-powered weather intelligence platform that provides
real-time weather data, voice-enabled AI assistant (VayuGPT), predictive
weather alarms, and multi-language support — built specifically for
rural and urban India.

### Key Innovation: "Before the Disaster" Alarm System
Instead of reacting to weather events, Vayu Varta PREDICTS them and
gives users a countdown before the disaster hits.


## 2. TECH STACK

```
┌─────────────────────────────────────────────────────────────────┐
│                      TECH STACK                                  │
├─────────────────┬───────────────────────────────────────────────┤
│  FRONTEND       │  React 18 + TypeScript + Vite                 │
│                 │  Tailwind CSS + Framer Motion                 │
│                 │  Lottie (Meteocons animated icons)            │
│                 │  Web Speech API (Speech Recognition + TTS)    │
│                 │  Spline 3D (Interactive robot model)          │
├─────────────────┼───────────────────────────────────────────────┤
│  BACKEND        │  Python 3.13 + FastAPI + Uvicorn              │
│                 │  APScheduler (Background jobs)                │
│                 │  JWT Authentication                           │
├─────────────────┼───────────────────────────────────────────────┤
│  DATABASE       │  Supabase (PostgreSQL + Auth)                 │
├─────────────────┼───────────────────────────────────────────────┤
│  AI ENGINE      │  Google Gemini 3.5 Flash Lite (Streaming)     │
├─────────────────┼───────────────────────────────────────────────┤
│  VOICE (TTS)    │  Fish Audio API (Bengali, Hindi, English)     │
├─────────────────┼───────────────────────────────────────────────┤
│  WEATHER DATA   │  Open-Meteo API (Free, no API key needed)     │
├─────────────────┼───────────────────────────────────────────────┤
│  PUSH           │  Web Push API (VAPID Keys — Zomato/Swiggy     │
│                 │  style browser notifications)                  │
├─────────────────┼───────────────────────────────────────────────┤
│  HOSTING        │  Supabase Cloud + Local Development           │
└─────────────────┴───────────────────────────────────────────────┘
```


## 3. SYSTEM ARCHITECTURE

```
                        ┌──────────────────────┐
                        │      USER DEVICE      │
                        │   (Mobile / Desktop)  │
                        └──────────┬───────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │      BROWSER / PWA           │
                    │  React + TypeScript + Vite   │
                    └──────────────┬──────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                       │
            ▼                      ▼                       ▼
   ┌────────────────┐   ┌─────────────────┐    ┌──────────────────┐
   │   GPS Location  │   │  Web Speech API  │    │   Web Push API   │
   │  (Browser GPS)  │   │ (Voice In/Out)   │    │ (Notifications)  │
   └────────┬───────┘   └────────┬────────┘    └────────┬─────────┘
            │                     │                       │
            └──────────┬──────────┘                       │
                       │                                  │
                       ▼                                  │
              ┌────────────────┐                          │
              │  BACKEND API   │◄─────────────────────────┘
              │  FastAPI :8000 │
              └───────┬────────┘
                      │
    ┌─────────────────┼─────────────────────────┐
    │                 │                          │
    ▼                 ▼                          ▼
┌────────┐   ┌──────────────┐          ┌──────────────┐
│Supabase│   │ Open-Meteo   │          │  Google      │
│  DB    │   │ Weather API  │          │  Gemini AI   │
│(Users, │   │(Free weather │          │(Conversational│
│ Locs,  │   │  data)       │          │  responses)  │
│ Alarms)│   └──────────────┘          └──────┬───────┘
└────────┘                                     │
                                               ▼
                                       ┌──────────────┐
                                       │  Fish Audio  │
                                       │  TTS API     │
                                       │(Voice output │
                                       │ Bengali/Hindi)│
                                       └──────────────┘
```


## 4. APPLICATION WORKFLOW

### 4A. User Onboarding Flow

```
                    ┌─────────────────────┐
                    │   User opens app     │
                    │  localhost:3000      │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   WELCOME PAGE      │
                    │   (3D Robot Model)   │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ Get Started Now │  │──► Guest/Explorer Mode
                    │  └────────────────┘  │    (No signup needed)
                    │  ┌────────────────┐  │
                    │  │    Sign In     │  │──► Login Page
                    │  └────────────────┘  │
                    └─────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼                               ▼
     ┌─────────────────┐             ┌─────────────────┐
     │  GUEST MODE     │             │  SIGNED UP      │
     │  (Explorer)     │             │  (Full Access)  │
     │                  │             │                  │
     │ ✅ Dashboard     │             │ ✅ Dashboard     │
     │ ✅ Forecast      │             │ ✅ Forecast      │
     │ ✅ Climate       │             │ ✅ Climate       │
     │ ✅ Locations     │             │ ✅ Locations     │
     │ ❌ VayuGPT       │             │ ✅ VayuGPT       │
     │ ❌ Vayu Alerts   │             │ ✅ Vayu Alerts   │
     │ ❌ Profile       │             │ ✅ Profile       │
     └─────────────────┘             └─────────────────┘
              │                               │
              │  Try VayuGPT?                 │
              ▼                               │
     ┌─────────────────┐                      │
     │  SIGNUP GATE    │                      │
     │  Modal appears:  │                      │
     │  "Sign up free   │                      │
     │   to unlock AI"  │                      │
     │                  │                      │
     │ [Sign Up Free]   │                      │
     │ [Maybe Later]    │                      │
     └─────────────────┘                      │
              │                               │
              ▼                               ▼
     ┌──────────────────────────────────────────┐
     │           MAIN APP (AppShell)            │
     │                                          │
     │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
     │  │Dashboard │  │Forecast  │  │VayuGPT │ │
     │  └──────────┘  └──────────┘  └────────┘ │
     │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
     │  │Alarms    │  │Alerts    │  │Profile │ │
     │  └──────────┘  └──────────┘  └────────┘ │
     └──────────────────────────────────────────┘
```

### 4B. Live GPS Auto-Detection Flow

```
  ┌──────────────────────────────────────────────────────────────┐
  │                    GPS AUTO-DETECTION                         │
  └──────────────────────────────────────────────────────────────┘

  User opens app
       │
       ▼
  Browser asks: "Allow location access?"
       │
  ┌────┴────┐
  │         │
  ▼         ▼
 ALLOW    DENY
  │         │
  ▼         ▼
 GPS       Use saved location
 coords    (or default city)
  │
  ▼
 Reverse Geocode (Open-Meteo)
  │
  ▼
 Get city name: "Kolkata, West Bengal"
  │
  ▼
 Save to DB (logged in) or localStorage (guest)
  │
  ▼
 Fetch current weather from Open-Meteo
  │
  ▼
 Display on Dashboard + Forecast
  │
  ▼
 Auto-refresh every 5 minutes
```

### 4C. VayuGPT AI Conversation Flow

```
  ┌──────────────────────────────────────────────────────────────┐
  │                   VAYUGPT CONVERSATION                        │
  └──────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────┐
  │  USER INPUT                        │
  │                                    │
  │  ┌──────────┐    ┌──────────┐     │
  │  │  TYPE    │    │   SPEAK  │     │
  │  │ (keyboard)│   │ (mic btn)│     │
  │  └────┬─────┘    └────┬─────┘     │
  │       │               │           │
  │       │  ┌────────────┘           │
  │       │  │                        │
  │       │  ▼                        │
  │       │  Speech Recognition       │
  │       │  (Web Speech API)         │
  │       │  Continuous listening     │
  │       │  + silence auto-send      │
  │       │  (2.5s silence = send)    │
  │       │  │                        │
  │       ▼  ▼                        │
  │  ┌────────────────────┐           │
  │  │ Detect Language     │           │
  │  │ English / Hindi /   │           │
  │  │ Bengali / Banglish  │           │
  │  └────────┬───────────┘           │
  │           │                        │
  └───────────┼────────────────────────┘
              │
              ▼
  ┌──────────────────────────────────────────────────┐
  │  BACKEND PROCESSING                              │
  │                                                  │
  │  1. Get user's active location                   │
  │  2. Fetch real-time weather from Open-Meteo      │
  │  3. Fetch 3-day forecast                         │
  │  4. Fetch 12-hour hourly forecast                │
  │  5. Get last 5 conversation turns                │
  │  6. Build context prompt with all data           │
  │  7. Send to Gemini 3.5 Flash Lite               │
  │                                                  │
  │  ┌──────────────────────────────────────────┐   │
  │  │          GEMINI 3.5 FLASH LITE           │   │
  │  │                                          │   │
  │  │  System: "You are VayuGPT..."            │   │
  │  │  Weather: 33°C, 78% humidity, etc.      │   │
  │  │  Forecast: Tomorrow thunderstorm 75%    │   │
  │  │  Hourly: 14:00-02:00 breakdown          │   │
  │  │  History: Last 5 messages                │   │
  │  │  User: "Should I carry umbrella?"        │   │
  │  │                                          │   │
  │  │  Response: STREAMING tokens →            │   │
  │  └──────────────────────────────────────────┘   │
  │           │                                     │
  │           ▼                                     │
  │  SSE Stream (Server-Sent Events)                │
  │  Token-by-token to frontend                    │
  └──────────────────┬─────────────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────────────┐
  │  FRONTEND DISPLAY                                │
  │                                                  │
  │  Text streams in real-time (ChatGPT-like)        │
  │  Blinking cursor while generating                │
  │                                                  │
  │  ┌──────────────────────────────────────────┐   │
  │  │ Yes, you should definitely carry an      │   │
  │  │ umbrella today! The current conditions   │   │
  │  │ show 33°C with 78% humidity. Tomorrow    │   │
  │  │ has a 75% chance of thunderstorm...▌     │   │
  │  └──────────────────────────────────────────┘   │
  │                                                  │
  │  IF input was VOICE:                             │
  │  └──► Fish Audio TTS speaks the response         │
  │       (Bengali voice for Bengali text)           │
  │                                                  │
  │  IF input was TYPED:                             │
  │  └──► Text only (no voice)                       │
  └──────────────────────────────────────────────────┘
```


## 5. ALARM SYSTEM — KEY INNOVATION

```
  ┌──────────────────────────────────────────────────────────────┐
  │              AI WEATHER ALARM PIPELINE                        │
  │              "Before the Disaster"                            │
  └──────────────────────────────────────────────────────────────┘

  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ Weather Data  │────►│ Risk Engine  │────►│ Severity     │
  │ (Open-Meteo)  │     │ (Every 15min)│     │ Classifier   │
  └──────────────┘     └──────────────┘     └──────┬───────┘
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                              ┌──────────┐   ┌──────────┐   ┌──────────┐
                              │  🟡 WATCH │   │ 🟠 WARNING│   │🔴CRITICAL│
                              │          │   │          │   │          │
                              │ Silent   │   │ Loud     │   │ Full     │
                              │ push     │   │ alert +  │   │ screen   │
                              │ notif    │   │ vibrate  │   │ alarm +  │
                              │          │   │          │   │ siren +  │
                              │          │   │          │   │ repeat   │
                              └──────────┘   └──────────┘   └──────────┘
                                    │               │               │
                                    └───────────────┼───────────────┘
                                                    ▼
                                            ┌──────────────┐
                                            │ SAFETY        │
                                            │ GUIDANCE      │
                                            │              │
                                            │ Step-by-step │
                                            │ actionable   │
                                            │ instructions │
                                            └──────────────┘

  ─────────────────────────────────────────────────────────────────

  DANGER TYPES DETECTED:
  ┌────────────────────────────────────────────────────────────┐
  │  🌀 Cyclone/Tropical Storm                                │
  │  🌊 Flash Flood Risk                                      │
  │  🌡️  Extreme Heatwave (>42°C)                             │
  │  ⛈️  Severe Thunderstorm                                  │
  │  🌪️  Tornado/Squall                                       │
  │  🌫️  Dense Fog (visibility <50m)                          │
  │  💨  Extreme Wind (>80 km/h)                              │
  │  ❄️  Blizzard/Hail                                         │
  └────────────────────────────────────────────────────────────┘

  ─────────────────────────────────────────────────────────────────

  COUNTDOWN FEATURE (Key Differentiator):
  ┌────────────────────────────────────────────────────────────┐
  │                                                            │
  │  🚨 45-MINUTE WEATHER ALERT                               │
  │                                                            │
  │  Strong thunderstorm expected near your location.          │
  │  Estimated onset: ~45 minutes                              │
  │  Risk Level: HIGH                                          │
  │                                                            │
  │  ✓ Move indoors immediately                                │
  │  ✓ Unplug electronics                                      │
  │  ✓ Stay away from windows                                  │
  │  ✓ Keep emergency kit ready                                │
  │  ✓ Check on neighbors and elderly family members           │
  │                                                            │
  │  [🔴 Acknowledge Alarm]                                    │
  │                                                            │
  └────────────────────────────────────────────────────────────┘
```


## 6. DATA FLOW DIAGRAM

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                     DATA FLOW OVERVIEW                            │
  └──────────────────────────────────────────────────────────────────┘

  EXTERNAL APIs                    BACKEND                      FRONTEND
  ═════════════                    ═══════                      ═════════

  ┌──────────┐                                                    ┌──────────┐
  │Open-Meteo│───HTTP GET──────────►│ /weather/current │──JSON──►│Dashboard │
  │ (Free)   │                      │ /weather/forecast│         │          │
  └──────────┘                      └─────────────────┘         └──────────┘
                                        │
  ┌──────────┐                         │                         ┌──────────┐
  │ Gemini   │───Streaming────────►│ /ai/chat        │──SSE───►│ VayuGPT  │
  │ AI API   │                      │  (stream=True)  │         │ Assistant│
  └──────────┘                      └─────────────────┘         └──────────┘
                                        │
  ┌──────────┐                         │                         ┌──────────┐
  │  Fish    │───HTTP POST────────►│ /tts/speak      │──Audio──►│ Voice    │
  │  Audio   │                      └─────────────────┘         │ Output   │
  └──────────┘                                                   └──────────┘
                                        │
  ┌──────────┐                         │                         ┌──────────┐
  │ Supabase │◄───CRUD──────────────►│ /auth/*          │◄─────►│ Login    │
  │ (Postgres│                       │ /locations/*     │       │ Signup   │
  │  + Auth) │                       │ /alarms/*        │       │ Profile  │
  └──────────┘                       └─────────────────┘       └──────────┘
                                        │
  ┌──────────┐                         │                         ┌──────────┐
  │  Web     │◄───Subscribe──────────│ /push/*          │──────►│ Browser  │
  │  Push    │     (VAPID keys)      └─────────────────┘       │ Notif.   │
  └──────────┘                                                   └──────────┘
```


## 7. FEATURE MAP

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                    VAYU VARTA — FEATURE MAP                       │
  └──────────────────────────────────────────────────────────────────┘

  ┌─ PUBLIC (No Login) ──────────────────────────────────────────┐
  │                                                               │
  │  🌤️  Dashboard        Real-time weather + metrics            │
  │  📅  Forecast         7-day + hourly breakdown               │
  │  🌡️  Climate          Historical averages                    │
  │  📍  Locations        Search & save cities                   │
  │  🧭  GPS Auto-Detect  Browser location → weather             │
  │  🌓  Dark/Light Mode  System-aware toggle                    │
  │  🎨  39 Icons         Meteocons animated Lottie icons        │
  │  🤖  3D Robot         Interactive Spline model                │
  │                                                               │
  └───────────────────────────────────────────────────────────────┘

  ┌─ SIGNUP REQUIRED ────────────────────────────────────────────┐
  │                                                               │
  │  🤖  VayuGPT          AI weather assistant (Gemini)          │
  │                       Streaming text responses                │
  │                       Bengali / Hindi / English               │
  │                                                               │
  │  🎤  Voice Chat       Speak → AI speaks back                 │
  │                       Auto-detect language                    │
  │                       Silence auto-send (2.5s)               │
  │                       Fish Audio TTS (natural voices)         │
  │                                                               │
  │  🚨  Vayu Alerts      AI-Prioritized Weather Alarms          │
  │                       Countdown before disaster              │
  │                       Full-screen alarm + siren              │
  │                       Safety guidance steps                   │
  │                       Watch / Warning / Critical tiers        │
  │                                                               │
  │  🔔  Push Notifs      Browser notifications (Zomato-style)   │
  │                       Daily weather briefings                 │
  │                                                               │
  │  👤  Profile          Account details + settings              │
  │                                                               │
  └───────────────────────────────────────────────────────────────┘
```


## 8. DATABASE SCHEMA

```
  ┌──────────────────────────────────────────────────────────────┐
  │                  SUPABASE DATABASE TABLES                     │
  └──────────────────────────────────────────────────────────────┘

  ┌──────────────┐       ┌──────────────────┐
  │    users      │       │   locations       │
  ├──────────────┤       ├──────────────────┤
  │ id (UUID)    │──┐    │ id (UUID)        │
  │ email        │  │    │ user_id (FK)     │◄──┐
  │ password     │  │    │ name             │   │
  │ created_at   │  ├───►│ lat / lon        │   │
  └──────────────┘  │    │ is_default       │   │
                    │    │ created_at       │   │
                    │    └──────────────────┘   │
                    │                            │
                    │    ┌──────────────────┐   │
                    │    │    alerts         │   │
                    │    ├──────────────────┤   │
                    │    │ id (UUID)        │   │
                    ├───►│ user_id (FK)     │   │
                    │    │ location_id (FK) │◄──┘
                    │    │ type             │
                    │    │ threshold        │
                    │    │ is_active        │
                    │    └──────────────────┘
                    │
                    │    ┌──────────────────┐
                    │    │    alarms         │
                    │    ├──────────────────┤
                    │    │ id (UUID)        │
                    ├───►│ user_id (FK)     │
                    │    │ location_id (FK) │
                    │    │ severity         │
                    │    │ status           │
                    │    │ message          │
                    │    │ countdown_sec    │
                    │    │ acknowledged_at  │
                    │    └──────────────────┘
                    │
                    │    ┌──────────────────┐
                    │    │ push_subscriptions│
                    │    ├──────────────────┤
                    │    │ id (UUID)        │
                    └───►│ user_id (FK)     │
                         │ endpoint         │
                         │ keys (p256dh)    │
                         └──────────────────┘
```


## 9. API ENDPOINTS MAP

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                    API ENDPOINTS (/api/v1)                        │
  └──────────────────────────────────────────────────────────────────┘

  AUTH
  ├── POST /auth/register      Create new account
  ├── POST /auth/login         Get JWT token
  └── GET  /auth/me            Get current user

  WEATHER
  ├── GET  /weather/current    Current weather for location
  └── GET  /weather/forecast   7-day + hourly forecast

  AI (VayuGPT)
  ├── POST /ai/chat            Chat with Gemini (streaming SSE)
  └── GET  /ai/history         Get conversation history

  TTS (Voice)
  └── POST /tts/speak          Generate voice audio (Fish Audio)

  LOCATIONS
  ├── GET  /locations          List saved locations
  ├── POST /locations          Add new location
  └── DELETE /locations/:id    Remove location

  ALERTS
  ├── GET  /alerts             List user alerts
  ├── POST /alerts             Create threshold alert
  └── DELETE /alerts/:id       Remove alert

  ALARMS (AI-Prioritized)
  ├── GET  /alarms             List active alarms
  ├── POST /alarms/:id/ack    Acknowledge alarm
  └── GET  /alarms/risk/:id   Get risk status

  PUSH NOTIFICATIONS
  ├── POST /push/subscribe     Subscribe to push
  ├── POST /push/unsubscribe   Unsubscribe
  └── POST /push/test          Send test notification

  SCHEDULER (Background)
  ├── Every 15 min: Alarm evaluation engine
  ├── Every 30 min: Alert evaluation engine
  └── Every 30 min: Daily briefing sender
```


## 10. VOICE SYSTEM WORKFLOW

```
  ┌──────────────────────────────────────────────────────────────┐
  │                  VOICE CHAT PIPELINE                          │
  └──────────────────────────────────────────────────────────────┘

  INPUT (Speech Recognition)
  ══════════════════════════

  User clicks 🎤 mic button
       │
       ▼
  Browser asks microphone permission
       │
       ▼
  Web Speech API starts listening
  (continuous mode — keeps recording)
       │
       ▼
  User speaks: "আজ বৃষ্টি হবে কি?"
       │
       ▼
  Live transcript shows in text box
  (interim + final results accumulated)
       │
       ▼
  User stops speaking
       │
       ▼
  Silence timer starts (2.5 seconds)
       │
  ┌────┴────────────────────────────┐
  │ Still silent?                    │
  │  YES → Auto-send to AI          │
  │  NO  → Reset timer, keep listen │
  └─────────────────────────────────┘
       │
       ▼
  Language detected: BENGALI
  (Unicode chars + Banglish words)
       │
       ▼
  Backend receives text → Gemini generates response in Bengali
       │
       ▼
  Fish Audio TTS converts Bengali text → Bengali voice audio
  (Voice ID: bc12f6ce... — warm Bengali female voice)
       │
       ▼
  User HEARS the answer in Bengali 🔊

  ─────────────────────────────────────────────────────────────

  OUTPUT (Speech Synthesis)
  ═════════════════════════

  ┌────────────────────────────────────────────────────────────┐
  │  Language Detection Priority:                               │
  │                                                            │
  │  Bengali Unicode (ক, খ, গ...)  →  Bengali Voice            │
  │  Banglish words (ami, ki, ache) → Bengali Voice            │
  │  Hindi words (hai, kya, bahut) → Hindi Voice               │
  │  English (default)              → English Voice            │
  │                                                            │
  │  Voice Speed:                                               │
  │  Bengali: 0.75x (slower for clarity in rural areas)        │
  │  Hindi:   0.85x                                            │
  │  English: 1.0x                                             │
  └────────────────────────────────────────────────────────────┘
```


## 11. GUEST vs LOGGED-IN USER

```
  ┌──────────────────────────────────────────────────────────────┐
  │              USER MODE COMPARISON                             │
  └──────────────────────────────────────────────────────────────┘

                    GUEST (Explorer)         LOGGED-IN USER
                    ════════════════         ══════════════

  GPS Location       ✅ Auto-detect          ✅ Auto-detect
  Storage            localStorage            Supabase DB
  Dashboard          ✅ Works                ✅ Works
  Forecast           ✅ 7-day + hourly       ✅ 7-day + hourly
  Climate            ✅ Historical data      ✅ Historical data
  Locations          ✅ Save up to 3         ✅ Save unlimited
  Weather Icons      ✅ 39 Lottie icons      ✅ 39 Lottie icons
  Dark/Light Mode    ✅ Toggle               ✅ Toggle
  ─────────────────────────────────────────────────────────────
  VayuGPT            ❌ Signup prompt        ✅ Full AI chat
  Voice Chat         ❌ Signup prompt        ✅ Speak + listen
  Vayu Alerts        ❌ Signup prompt        ✅ AI alarms
  Push Notifs        ❌ Signup prompt        ✅ Browser notifs
  Profile            ❌ Signup prompt        ✅ Account mgmt
```


## 12. DEPLOYMENT ARCHITECTURE

```
  ┌──────────────────────────────────────────────────────────────┐
  │                 DEPLOYMENT ARCHITECTURE                       │
  └──────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │                    CLOUD (Supabase)                       │
  │                                                          │
  │  ┌──────────────┐    ┌──────────────┐                   │
  │  │  PostgreSQL   │    │  Auth        │                   │
  │  │  Database     │    │  (JWT)       │                   │
  │  └──────────────┘    └──────────────┘                   │
  │                                                          │
  │  ┌──────────────┐    ┌──────────────┐                   │
  │  │  PostgREST    │    │  Storage     │                   │
  │  │  (API)        │    │  (Files)     │                   │
  │  └──────────────┘    └──────────────┘                   │
  └──────────────────────────────────────────────────────────┘
           ▲                              ▲
           │                              │
           │    ┌──────────────────────┐  │
           │    │   FASTAPI BACKEND     │  │
           │    │   (localhost:8000)    │──┘
           │    │                       │
           │    │  ├── Auth (JWT)       │
           │    │  ├── Weather API      │
           │    │  ├── Gemini AI        │
           │    │  ├── Fish Audio TTS   │
           │    │  ├── Alarm Engine     │
           │    │  ├── Push Notifs      │
           │    │  └── Scheduler        │
           │    └──────────┬───────────┘
           │               │
           │    ┌──────────▼───────────┐
           │    │   REACT FRONTEND      │
           │    │   (localhost:3000)    │
           │    │                       │
           │    │  ├── Dashboard        │
           │    │  ├── Forecast         │
           │    │  ├── VayuGPT (AI)     │
           │    │  ├── Alarms           │
           │    │  ├── Alerts           │
           │    │  ├── Voice Chat       │
           │    │  └── Profile          │
           │    └──────────────────────┘
           │
           │    ┌──────────────────────┐
           └───►│   EXTERNAL APIs       │
                │                       │
                │  ├── Open-Meteo (Free)│
                │  ├── Gemini AI       │
                │  └── Fish Audio TTS  │
                └──────────────────────┘
```


## 13. SCHEDULER JOBS

```
  ┌──────────────────────────────────────────────────────────────┐
  │              BACKGROUND SCHEDULER JOBS                        │
  └──────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────┐
  │  JOB 1: Alarm Evaluation Engine  (every 15 minutes)     │
  │                                                         │
  │  For each user location:                                │
  │    → Fetch current weather                              │
  │    → Check for dangerous conditions                     │
  │    → Classify severity (Watch/Warning/Critical)         │
  │    → Create alarm record in DB                          │
  │    → Calculate countdown (minutes until impact)         │
  │    → Trigger push notification                          │
  │    → Play alarm sound (Critical)                        │
  └─────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────┐
  │  JOB 2: Alert Evaluation Engine  (every 30 minutes)     │
  │                                                         │
  │  For each user alert:                                   │
  │    → Check if threshold exceeded                        │
  │    → (temp > X, wind > Y, rain > Z%)                   │
  │    → If yes → send notification                         │
  └─────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────┐
  │  JOB 3: Daily Briefing Sender    (every 30 minutes)     │
  │                                                         │
  │  Check each user's preferred briefing time:             │
  │    → If current time matches → send briefing            │
  │    → "Good morning! Today: 32°C, rain 40%..."          │
  │    → Delivered as push notification                      │
  └─────────────────────────────────────────────────────────┘
```


## 14. SIH JUDGES — KEY HIGHLIGHTS

```
  ╔══════════════════════════════════════════════════════════════╗
  ║            WHY VAYU VARTA WINS SIH 2026                     ║
  ╠══════════════════════════════════════════════════════════════╣
  ║                                                              ║
  ║  1. "BEFORE THE DISASTER" — Predictive alarms with          ║
  ║     countdown timers. Not reactive — PROACTIVE.             ║
  ║                                                              ║
  ║  2. AI-PRIORITIZED ALERTS — No notification fatigue.        ║
  ║     Only alerts that actually matter to YOUR location.       ║
  ║                                                              ║
  ║  3. MULTILINGUAL VOICE — Bengali + Hindi + English.         ║
  ║     Rural users who can't type can SPEAK to the AI.          ║
  ║                                                              ║
  ║  4. FREE & OPEN — Open-Meteo (no API cost),                ║
  ║     Supabase free tier, Gemini free tier.                   ║
  ║     Runs on any phone/browser.                              ║
  ║                                                              ║
  ║  5. RURAL-FIRST DESIGN — Simple language, large icons,      ║
  ║     voice-first UX, low bandwidth needs.                    ║
  ║                                                              ║
  ║  6. FULL-STACK PROOF — React + FastAPI + Supabase +        ║
  ║     AI + Voice + Real-time streaming. Complete product.     ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝
```


## 15. QUICK START (for mentors/judges)

```bash
# Step 1: Start Backend
cd /d D:\NEW BACKEND\backend
uvicorn main:app --reload --port 8000

# Step 2: Start Frontend (new terminal)
cd /d D:\NEW BACKEND\frontend
npm run dev

# Step 3: Open browser
# http://localhost:3000

# Step 4: Click "Get Started Now" (no signup needed)
# OR login: test@example.com / TestPass123!
```

---

  Generated for Smart India Hackathon (SIH) 2026
  Project: Vayu Varta — AI Weather Intelligence Platform
  Team: [Your Team Name]
