-- 006_sparks.sql
-- A one-directional "spark" of interest. When reciprocated it becomes 'mutual'
-- and a match is created. Sparks auto-expire 7 minutes after creation.

CREATE TABLE IF NOT EXISTS sparks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_session_id   UUID REFERENCES live_sessions(id) ON DELETE SET NULL,
  receiver_session_id UUID REFERENCES live_sessions(id) ON DELETE SET NULL,
  status              VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'mutual', 'expired', 'declined')),
  expires_at          TIMESTAMP DEFAULT (NOW() + INTERVAL '7 minutes'),
  created_at          TIMESTAMP DEFAULT NOW(),
  -- One spark per sender→receiver within a single live session.
  CONSTRAINT uniq_spark UNIQUE (sender_id, receiver_id, sender_session_id)
);

CREATE INDEX IF NOT EXISTS idx_sparks_receiver ON sparks (receiver_id);
CREATE INDEX IF NOT EXISTS idx_sparks_status ON sparks (status);
CREATE INDEX IF NOT EXISTS idx_sparks_expires ON sparks (expires_at) WHERE status = 'pending';
