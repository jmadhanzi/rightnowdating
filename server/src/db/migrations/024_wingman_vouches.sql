-- 024_wingman_vouches.sql
-- Friend-vouching system. A friend clicks a user's wingman link and
-- writes a 2-line endorsement + 3 personality tags. These appear as
-- "Verified Friend Review" badges on the user's profile.

CREATE TABLE IF NOT EXISTS wingman_vouches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voucher_name   VARCHAR(50) NOT NULL,
  tags           TEXT[]     NOT NULL DEFAULT '{}',
  endorsement    TEXT,
  is_visible     BOOLEAN    NOT NULL DEFAULT true,
  created_at     TIMESTAMP  NOT NULL DEFAULT NOW()
);

-- One vouch per voucher name per user (prevents spam).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wingman_voucher
  ON wingman_vouches (user_id, LOWER(voucher_name));

CREATE INDEX IF NOT EXISTS idx_wingman_vouches_user ON wingman_vouches (user_id);

-- Add new-user priority flag to live_sessions (used for first-24h visibility boost).
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS is_new_user_boost BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_live_sessions_new_user_boost
  ON live_sessions (is_new_user_boost) WHERE is_new_user_boost = true;
