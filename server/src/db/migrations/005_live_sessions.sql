-- 005_live_sessions.sql
-- A "Go Live" broadcast. `location` is exact; `fuzzy_location` is the
-- privacy-jittered point shown to others and used for proximity search.

CREATE TABLE IF NOT EXISTS live_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location       GEOMETRY(POINT, 4326) NOT NULL,
  fuzzy_location GEOMETRY(POINT, 4326),
  vibe           VARCHAR(20) NOT NULL
    CHECK (vibe IN ('coffee', 'drinks', 'walk', 'food', 'explore', 'late', 'spicy')),
  window_minutes SMALLINT CHECK (window_minutes IN (30, 60, 120)),
  expires_at     TIMESTAMP NOT NULL,
  is_active      BOOLEAN DEFAULT true,
  radius_miles   FLOAT DEFAULT 2.0,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- Proximity search ("who's live near me") runs against the fuzzy point.
CREATE INDEX IF NOT EXISTS idx_live_sessions_fuzzy_location
  ON live_sessions USING GIST (fuzzy_location);

-- Fast expiry sweeps over only the currently-active sessions.
CREATE INDEX IF NOT EXISTS idx_live_sessions_expires_active
  ON live_sessions (expires_at) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_live_sessions_user ON live_sessions (user_id);
