-- 013_boosts.sql
-- One-off paid visibility boost applied to a live session.

CREATE TABLE IF NOT EXISTS boosts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id               UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  stripe_payment_intent_id VARCHAR(100) UNIQUE,
  boost_start              TIMESTAMP,
  boost_end                TIMESTAMP,
  is_active                BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_boosts_user ON boosts (user_id);
CREATE INDEX IF NOT EXISTS idx_boosts_session ON boosts (session_id);
CREATE INDEX IF NOT EXISTS idx_boosts_active ON boosts (boost_end) WHERE is_active = true;
