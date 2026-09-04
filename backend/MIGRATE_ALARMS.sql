
-- Weather Alarms
CREATE TABLE IF NOT EXISTS weather_alarms (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    pattern_key     TEXT NOT NULL,
    pattern_name    TEXT NOT NULL,
    pattern_icon    TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN ('WATCH', 'WARNING', 'CRITICAL')),
    risk_score      INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    confidence      INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    factors         JSONB DEFAULT '[]',
    message         TEXT NOT NULL,
    safety_guidance TEXT NOT NULL,
    countdown_minutes INTEGER DEFAULT 0,
    onset_time      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weather_alarms_location ON weather_alarms(location_id);
CREATE INDEX IF NOT EXISTS idx_weather_alarms_expires ON weather_alarms(expires_at);

-- User Alarms
CREATE TABLE IF NOT EXISTS user_alarms (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alarm_id        UUID NOT NULL REFERENCES weather_alarms(id) ON DELETE CASCADE,
    acknowledged    BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, alarm_id)
);

CREATE INDEX IF NOT EXISTS idx_user_alarms_user ON user_alarms(user_id);

-- Row Level Security
ALTER TABLE weather_alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_alarms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own alarms" ON user_alarms FOR SELECT USING (true);
CREATE POLICY "Users can ack own alarms" ON user_alarms FOR UPDATE USING (true);
CREATE POLICY "Service role can insert alarms" ON weather_alarms FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can insert user alarms" ON user_alarms FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can read linked weather alarms" ON weather_alarms FOR SELECT
    USING (id IN (SELECT alarm_id FROM user_alarms WHERE user_id = auth.uid()));
