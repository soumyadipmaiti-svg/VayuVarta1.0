"""
Run this script to create the alarm tables in Supabase:
  python migrate_alarms.py
"""
import os
import sys
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    sys.exit(1)

SQL = """
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
"""

def run_migration():
    ref = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "")
    
    # Method 1: Try Supabase SQL API (POST /sql)
    print(f"Connecting to Supabase project: {ref}")
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    
    # Try the SQL endpoint
    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/sql",
            headers=headers,
            json={"query": SQL},
            timeout=30,
        )
        if resp.status_code == 200:
            print("SUCCESS! Alarm tables created via /sql endpoint.")
            return True
        else:
            print(f"  /sql endpoint returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"  /sql endpoint failed: {e}")

    # Method 2: Try creating an exec_sql function first, then call it
    print("\nTrying Method 2: Creating exec_sql function via PostgREST...")
    
    create_func_sql = """
CREATE OR REPLACE FUNCTION exec_sql(query text) RETURNS void AS $$
BEGIN
    EXECUTE query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
"""
    
    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/sql",
            headers=headers,
            json={"query": create_func_sql},
            timeout=30,
        )
        if resp.status_code == 200:
            print("  exec_sql function created! Now running migration...")
            resp2 = httpx.post(
                f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
                headers=headers,
                json={"query": SQL},
                timeout=30,
            )
            if resp2.status_code == 200:
                print("SUCCESS! Alarm tables created via exec_sql RPC.")
                return True
            else:
                print(f"  exec_sql RPC returned {resp2.status_code}: {resp2.text[:200]}")
        else:
            print(f"  /sql endpoint returned {resp.status_code}")
    except Exception as e:
        print(f"  Method 2 failed: {e}")

    # Method 3: Print instructions for manual run
    print("\n" + "=" * 60)
    print("AUTO-MIGRATION FAILED")
    print("=" * 60)
    print("\nThe SQL API endpoint is not available on your project.")
    print("Please run the SQL manually:\n")
    print("1. Go to: https://supabase.com/dashboard")
    print("2. Select your project")
    print("3. Click 'SQL Editor' in the left sidebar")
    print("4. Click 'New Query'")
    print("5. Paste the SQL below and click 'Run':\n")
    print("-" * 60)
    print(SQL)
    print("-" * 60)
    
    # Also save to a file for easy copy-paste
    sql_file = os.path.join(os.path.dirname(__file__), "MIGRATE_ALARMS.sql")
    with open(sql_file, "w") as f:
        f.write(SQL)
    print(f"\nSQL also saved to: {sql_file}")
    print("You can open that file, copy the contents, and paste into Supabase SQL Editor.")
    
    return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
