-- 025_duo_mode.sql
-- Duo Mode: two users team up to meet another pair or singles
-- Open Night: a group broadcasts an open table invite at a venue
-- Openness: solo | duo_friendly | group | open_night on every live session

-- ─────────────────────────────────────────────
-- Duos (persistent friend-pairing)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS duos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'ended')),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Prevent duplicate or self-duos
CREATE UNIQUE INDEX IF NOT EXISTS uniq_duo_pair
  ON duos (LEAST(inviter_id, partner_id), GREATEST(inviter_id, partner_id));

-- ─────────────────────────────────────────────
-- Openness level on live_sessions
-- ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE openness_level AS ENUM ('solo', 'duo_friendly', 'group', 'open_night');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS openness openness_level NOT NULL DEFAULT 'solo',
  ADD COLUMN IF NOT EXISTS duo_id   UUID REFERENCES duos(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- Open Nights — public group invites at a venue
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS open_nights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duo_id        UUID REFERENCES duos(id) ON DELETE SET NULL,
  venue_name    VARCHAR(120) NOT NULL,
  venue_id      UUID REFERENCES venues(id) ON DELETE SET NULL,
  headline      VARCHAR(100) NOT NULL,          -- "We have 2 spots at our table"
  vibe          VARCHAR(40)  NOT NULL DEFAULT 'drinks',
  capacity      SMALLINT     NOT NULL DEFAULT 4 CHECK (capacity BETWEEN 2 AND 10),
  spots_taken   SMALLINT     NOT NULL DEFAULT 1,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  expires_at    TIMESTAMP    NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_open_nights_active ON open_nights (is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_open_nights_host ON open_nights (host_user_id);

-- ─────────────────────────────────────────────
-- Open Night join requests
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS open_night_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  open_night_id   UUID NOT NULL REFERENCES open_nights(id) ON DELETE CASCADE,
  requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duo_id          UUID REFERENCES duos(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'declined')),
  message         TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_night_request
  ON open_night_requests (open_night_id, requester_id);

-- ─────────────────────────────────────────────
-- Duo sparks — cross-pair matching
-- A duo-spark requires BOTH duo members to spark the target pair
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS duo_sparks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_duo_id       UUID NOT NULL REFERENCES duos(id) ON DELETE CASCADE,
  to_duo_id         UUID REFERENCES duos(id) ON DELETE CASCADE,        -- null = duo→solo
  to_user_id        UUID REFERENCES users(id) ON DELETE CASCADE,       -- null = duo→duo
  member1_sparked   BOOLEAN NOT NULL DEFAULT false,
  member2_sparked   BOOLEAN NOT NULL DEFAULT false,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'mutual', 'declined', 'expired')),
  match_id          UUID REFERENCES matches(id) ON DELETE SET NULL,
  expires_at        TIMESTAMP NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT duo_spark_target_check CHECK (
    (to_duo_id IS NOT NULL AND to_user_id IS NULL) OR
    (to_duo_id IS NULL AND to_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_duo_sparks_from ON duo_sparks (from_duo_id);
CREATE INDEX IF NOT EXISTS idx_duo_sparks_to_duo ON duo_sparks (to_duo_id);

-- ─────────────────────────────────────────────
-- Group matches (2-4 people in one chat)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duo_a_id    UUID REFERENCES duos(id) ON DELETE CASCADE,
  duo_b_id    UUID REFERENCES duos(id) ON DELETE CASCADE,
  open_night_id UUID REFERENCES open_nights(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL DEFAULT 'matched'
                CHECK (status IN ('matched', 'met', 'expired')),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_match_members (
  group_match_id UUID NOT NULL REFERENCES group_matches(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_match_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_match_id UUID NOT NULL REFERENCES group_matches(id) ON DELETE CASCADE,
  sender_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_match ON group_messages (group_match_id, created_at);
