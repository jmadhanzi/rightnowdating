-- 007_matches.sql
-- A confirmed connection between two users from a mutual spark.
-- NOTE: `venue_id` references venues(id), but the venues table is created in
-- migration 009. The FK constraint is therefore added at the end of 009.

CREATE TABLE IF NOT EXISTS matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spark_id        UUID REFERENCES sparks(id) ON DELETE SET NULL,
  user1_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id        UUID, -- FK added in 009_venues.sql
  meetup_time     TIMESTAMP,
  status          VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'met', 'cancelled', 'expired', 'no_show')),
  user1_confirmed BOOLEAN DEFAULT false,
  user2_confirmed BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches (user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches (user2_id);
CREATE INDEX IF NOT EXISTS idx_matches_spark ON matches (spark_id);
