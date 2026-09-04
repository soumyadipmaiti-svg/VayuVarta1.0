-- ═══════════════════════════════════════════════════════════════════════════════
-- Vayu Varta — AI Weather Alarm System Tables
-- Run this migration to add alarm support to your Supabase database.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Weather Alarms ─────────────────────────────────────────────────────────────
-- Stores alarm records created by the AI alarm engine.

CREATE TABLE IF NOT EXISTS weather_alarms (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    pattern_key     TEXT NOT NULL,           -- cyclone, flash_flood, heatwave, etc.
    pattern_name    TEXT NOT NULL,           -- Human-readable: "Cyclone / Tropical Storm"
    pattern_icon    TEXT NOT NULL,           -- Emoji: 🌀
    severity        TEXT NOT NULL CHECK (severity IN ('WATCH', 'WARNING', 'CRITICAL')),
    risk_score      INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    confidence      INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    factors         JSONB DEFAULT '[]',     -- ["Extreme wind: 120 km/h", ...]
    message         TEXT NOT NULL,           -- Full alarm message
    safety_guidance TEXT NOT NULL,           -- Actionable safety steps
    countdown_minutes INTEGER DEFAULT 0,    -- Minutes until onset (0 = ongoing)
    onset_time      TIMESTAMPTZ,            -- Estimated onset time
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,   -- Auto-expires after 6 hours
    CONSTRAINT valid_pattern CHECK (
        pattern_key IN (
            'cyclone', 'flash_flood', 'heatwave', 'cold_wave',
            'severe_storm', 'high_wind', 'heavy_rain', 'uv_danger'
        )
    )
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_weather_alarms_location ON weather_alarms(location_id);
CREATE INDEX IF NOT EXISTS idx_weather_alarms_severity ON weather_alarms(severity);
CREATE INDEX IF NOT EXISTS idx_weather_alarms_expires ON weather_alarms(expires_at);
CREATE INDEX IF NOT EXISTS idx_weather_alarms_pattern ON weather_alarms(pattern_key);

-- ── User Alarms (junction) ─────────────────────────────────────────────────────
-- Links users to alarms with acknowledgment tracking.

CREATE TABLE IF NOT EXISTS user_alarms (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alarm_id        UUID NOT NULL REFERENCES weather_alarms(id) ON DELETE CASCADE,
    acknowledged    BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, alarm_id)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_alarms_user ON user_alarms(user_id);
CREATE INDEX IF NOT EXISTS idx_user_alarms_unack ON user_alarms(user_id, acknowledged)
    WHERE acknowledged = FALSE;

-- ── Row Level Security ─────────────────────────────────────────────────────────
-- Users can only see their own alarms.

ALTER TABLE weather_alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_alarms ENABLE ROW LEVEL SECURITY;

-- Users can read alarms linked to them
CREATE POLICY "Users can read own alarms"
    ON user_alarms FOR SELECT
    USING (auth.uid() = user_id);

-- Users can update their own alarm acknowledgments
CREATE POLICY "Users can ack own alarms"
    ON user_alarms FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role can insert alarms (alarm engine)
CREATE POLICY "Service role can insert alarms"
    ON weather_alarms FOR INSERT
    WITH CHECK (true);

-- Service role can insert user_alarms
CREATE POLICY "Service role can insert user alarms"
    ON user_alarms FOR INSERT
    WITH CHECK (true);

-- Users can read weather_alarms linked to them via user_alarms
CREATE POLICY "Users can read linked weather alarms"
    ON weather_alarms FOR SELECT
    USING (
        id IN (
            SELECT alarm_id FROM user_alarms
            WHERE user_id = auth.uid()
        )
    );
