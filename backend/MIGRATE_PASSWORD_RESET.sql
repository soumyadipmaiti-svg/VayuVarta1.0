-- ============================================================
-- Password Reset Tokens Table  (safe to re-run)
-- Run this in Supabase SQL Editor -> phzvhawsjmjxjlfbrqcw project
-- ============================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,          -- SHA-256 hash of the token (never store raw)
    expires_at  TIMESTAMPTZ NOT NULL,          -- Token expires after N minutes
    used        BOOLEAN DEFAULT FALSE,         -- Prevent token reuse
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by token hash
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
    ON password_reset_tokens(token_hash);

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
    ON password_reset_tokens(expires_at);

-- Row Level Security
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Recreate policy safely (Postgres has no IF NOT EXISTS for policies)
DROP POLICY IF EXISTS "Service role only" ON password_reset_tokens;
CREATE POLICY "Service role only" ON password_reset_tokens
    USING (true)
    WITH CHECK (true);
