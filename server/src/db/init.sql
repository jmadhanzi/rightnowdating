-- =============================================================================
-- RIGHTNOW — initial database schema
-- Runs automatically on first container boot via docker-entrypoint-initdb.d.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone        TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  age          INTEGER NOT NULL CHECK (age >= 18),
  gender       TEXT NOT NULL,
  bio          TEXT,
  photo_url    TEXT,
  trust_score  INTEGER NOT NULL DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
  is_plus      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Live sessions ("Go Live")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS live_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vibe        TEXT NOT NULL,
  time_window TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'live',
  -- GEOGRAPHY(POINT) for accurate metre-based distance queries
  location    GEOGRAPHY(POINT, 4326) NOT NULL,
  boosted     BOOLEAN NOT NULL DEFAULT FALSE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Spatial index powers "who is live near me" lookups.
CREATE INDEX IF NOT EXISTS idx_live_sessions_location ON live_sessions USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON live_sessions (status);

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  CONSTRAINT uniq_match_pair UNIQUE (user_a, user_b)
);

-- ---------------------------------------------------------------------------
-- Chat messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_match ON messages (match_id, created_at);
