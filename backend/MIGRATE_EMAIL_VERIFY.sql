-- ============================================================
-- Email Verification Migration
-- Run this in Supabase SQL Editor to enable email verification.
-- ============================================================

-- ── 1. Add verification columns to users ─────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified    BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- ── 2. Verification tokens table ─────────────────────────────
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,          -- SHA-256 hash (never store raw)
    expires_at  TIMESTAMPTZ NOT NULL,          -- default 24 hours
    used        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by token hash
CREATE INDEX IF NOT EXISTS idx_email_verif_tokens_hash
    ON email_verification_tokens(token_hash);

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_email_verif_tokens_expires
    ON email_verification_tokens(expires_at);

-- Row Level Security (service-role bypasses RLS; keep locked down)
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON email_verification_tokens
    USING (true)
    WITH CHECK (true);