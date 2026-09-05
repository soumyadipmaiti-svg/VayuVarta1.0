# 🚀 Vayu Varta — Free Deployment Guide

Step-by-step guide to put Vayu Varta live **for ₹0** (all free tiers), get the
forgot-password email working, and start ranking on Google.

---

## ⚠️ STEP 0 — FIX FORGOT-PASSWORD FIRST (do this before anything)

**Why you got no email:** your Supabase database is **missing the
`password_reset_tokens` table**. The reset flow needs that table to store the
5-minute link — when it's absent the backend fails silently (by design, to stop
spam bots probing emails) and you never see an email.

### 0.1 Run this SQL on the CORRECT project

1. Open **exactly this link** (your app's project):
   **https://supabase.com/dashboard/project/phzvhawsjmjxjlfbrqcw/sql/new**
   ⚠️ *Last time a migration ran on a DIFFERENT Supabase project you had open in
   another tab — always use the link above.*
2. Paste the entire contents of **`backend/MIGRATE_PASSWORD_RESET.sql`**
   (it is safe to re-run — won't error twice).
3. Click **Run** → expect `Success. No rows returned`.

### 0.2 Restart the backend (picks up code + config)

```powershell
Set-Location "D:\NEW BACKEND\backend"
uvicorn main:app --reload --port 8000
```

### 0.3 Test

1. http://localhost:3000 → Sign In → **Forgot password?**
2. Enter the email you registered with → click Send Reset Link.
3. Check the inbox (**and spam** — click "Not spam" if filtered).
4. Click the link (valid 5 minutes, one use only) → set new password → sign in.

> If you still get nothing, tell me — the backend now logs the real error to
> its terminal instead of hiding it.

---

## 🧭 THE BIG PICTURE — 4 free pieces

| Piece | What it is | Free host | Cost |
|---|---|---|---|
| Frontend | React app in `frontend/` | **Vercel** (or Netlify) | Free |
| Backend | FastAPI app in `backend/` | **Render** (or Fly.io) | Free |
| Database | Postgres (already live) | **Supabase** ✅ already done | Free |
| Email | Gmail SMTP (already working) | Your existing Gmail ✅ | Free |
| AI / Voice | Gemini + Fish Audio + Open-Meteo | Already configured ✅ | Free |

---

## 1️⃣ DEPLOY THE FRONTEND (Vercel — ~10 min)

1. Push this project to GitHub:
   ```bash
   cd /d "D:\NEW BACKEND"
   git init
   git add .
   git commit -m "Vayu Varta v1.0"
   ```
   *(create a free repo at github.com first if you don't have one, then
   `git remote add origin https://github.com/YOUR_USER/vayu-varta.git` and
   `git push -u origin main`)*
2. Go to **https://vercel.com** → sign up free with GitHub → **Add New Project**
   → pick the repo.
3. Vercel auto-detects Vite. Set these in **Settings → Environment Variables**:
   | Name | Value |
   |---|---|
   | `VITE_API_BASE` | `https://<your-backend-url>/api/v1` *(fill after Step 2️⃣, then redeploy)* |
4. Framework preset: **Vite** · Build: `npm run build` · Output: `dist`
5. Click **Deploy**. Your URL will look like `https://vayu-varta-xxxx.vercel.app`
   — you can rename it to `vayuvarta.vercel.app` in **Settings → Domains**.
6. The `vercel.json` file I added already handles SPA routes
   (`/dashboard`, `/forgot-password`… won't 404).

**Netlify alternative:** netlify.com → Add new site → repo → Build `npm run
build` → Publish `dist`. The `public/_redirects` file already fixes SPA routes.

---

## 2️⃣ DEPLOY THE BACKEND (Render — ~15 min)

1. Go to **https://render.com** → sign up free → **New + → Web Service** → link
   your GitHub repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. **Environment Variables** — copy each from your local `backend/.env`:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — same values as local
   - `JWT_SECRET_KEY` — same
   - `GEMINI_API_KEY`, `FISH_AUDIO_API_KEY`, `FISH_AUDIO_MODEL`, `FISH_AUDIO_VOICE_ID`
   - `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASSWORD`
     (the fixed Gmail app password), `SMTP_FROM_NAME=Vayu Varta`
   - `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_EMAIL`
   - **`FRONTEND_URL` = `https://vayu-varta1-0.vercel.app`**
     ← this makes CORS work **and** makes the reset-link in emails point to
     your live site
   - **`APP_ENV=production`** ← locks CORS to your frontend only
   - `PASSWORD_RESET_EXPIRE_MINUTES=5`
4. Deploy. Render gives you `https://vayuvarta-api.onrender.com`.
5. ⚠️ Free Render services **sleep after 15 min idle**. Fix with a free
   **UptimeRobot** ping: https://uptimerobot.com → monitor your
   `https://vayuvarta-api.onrender.com/health` every 5 min. (Your app's health
   endpoint exists — check `backend/main.py`.)
6. **Go back to Vercel → Settings → Environment Variables** and set
   `VITE_API_BASE=https://vayu-varta1-0.onrender.com/api/v1`, then **Redeploy**.

---

## 3️⃣ REPLACE THE PLACEHOLDER DOMAIN (for SEO links)

I added real SEO tags, but `og:image`, `canonical`, `sitemap.xml` and
`robots.txt` currently point at the placeholder `https://vayuvarta.example.com`.

**Search & replace** `vayuvarta.example.com` → your real domain in:
- `frontend/index.html` (canonical + og:image + og:url + JSON-LD)
- `frontend/public/robots.txt`
- `frontend/public/sitemap.xml`

Then redeploy the frontend once.

> Already done in this project — the domain is now `https://vayu-varta1-0.vercel.app`.

## 3b. Real-production note

If you later get a custom domain (e.g. `vayuvarta.com`), re-run the same search
and replace **everywhere**:
- `frontend/index.html` (canonical, og:image, og:url, JSON-LD)
- `frontend/public/robots.txt`
- `frontend/public/sitemap.xml`
- `DEPLOYMENT_GUIDE.md`
- `backend/.env` `FRONTEND_URL`
- Render env var `FRONTEND_URL`
- Vercel env var `VITE_API_BASE`

Then redeploy both frontend and backend once.

---

## 4️⃣ GET INDEXED ON GOOGLE (free, ~1 week to first results)

In this project the real domain is: **`https://vayu-varta1-0.vercel.app`**

1. **Google Search Console:** https://search.google.com/search-console →
   Add property → your Vercel URL → verify.
   Easiest verification for a free custom-less Vercel domain:
   - Vercel → your project → Settings → Domains → copy the DNS TXT record values,
     then in Search Console choose **DNS TXT record** verification → paste the
     record Vercel gives you.
   - If DNS verification fails on the free subdomain, use the **HTML file**
     method: paste the HTML file Google gives you into
     `frontend/public/google-site-verification-*.html`, then commit, push, and
     click "Verify" in Search Console once Vercel redeploys.
2. **Submit your sitemap:** Sitemaps → enter
   `https://vayu-varta1-0.vercel.app/sitemap.xml` → Submit.
3. Submit **robots.txt** check in the same console.
4. **Request indexing:** URL Inspection → paste
   `https://vayu-varta1-0.vercel.app/` → **Request indexing**
   (do this again after every big update).
5. Share the link on WhatsApp/Telegram groups, Facebook pages, and your SIH
   submission — backlinks help ranking a lot for a brand-new site.

### Real talk about "rank first on Google" 🎯
- A **brand-new site** cannot rank #1 for a competitive term like "weather app"
  overnight. Target what you CAN win: searches like
  **"Vayu Varta", "AI weather app India", "weather alert West Bengal",**
  "cyclone alert app" — your meta description/keywords already target these.
- Google must **render your JavaScript** to read the app, and most of the app
  sits behind sign-in. For serious ranking later, the #1 improvement is a
  **public landing page** (server-rendered HTML with screenshots and feature
  text) at the root — ask me and I'll build one.
- Consistency beats bursts: keep the site up, keep the sitemap submitted, add
  2–3 quality backlinks/month.

---

## ✅ LAUNCH CHECKLIST

- [ ] Supabase SQL from Step 0 ran on the **phzvhawsjmjxjlfbrqcw** project
- [ ] Forgot-password email arrives and the 5-minute link works
- [ ] Frontend live on Vercel; `/dashboard`, `/forgot-password` don't 404
- [ ] Backend live on Render; `/health` answers
- [ ] `FRONTEND_URL` (backend) = Vercel URL · `APP_ENV=production`
- [ ] `VITE_API_BASE` (Vercel) = Render URL `/api/v1` · redeployed
- [ ] Signup, login, weather, VayuGPT voice all work against the **live** backend
- [ ] Placeholder `vayuvarta.example.com` replaced everywhere
- [ ] Search Console property verified + sitemap submitted
- [ ] UptimeRobot pinging Render so it never sleeps

---

## 🔁 HOW TO UPDATE AFTER LAUNCH

```bash
# 1. change code
git add .
git commit -m "describe change"
git push          # Vercel + Render auto-deploy from main
```

Both platforms rebuild automatically on every `git push` — you never touch the
dashboards again.

---

## 🆘 LOCAL DEV QUICK REFERENCE (unchanged)

| Server | Command | URL |
|---|---|---|
| Backend | `Set-Location "D:\NEW BACKEND\backend"` → `uvicorn main:app --reload --port 8000` | http://localhost:8000 |
| Frontend | `Set-Location "D:\NEW BACKEND\frontend"` → `npm run dev` | http://localhost:3000 |
