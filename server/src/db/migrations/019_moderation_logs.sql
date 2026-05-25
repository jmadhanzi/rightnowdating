-- 019_moderation_logs.sql
-- Flagged/blocked chat messages retained for human moderation review.

CREATE TABLE IF NOT EXISTS moderation_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID REFERENCES matches(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  action     VARCHAR(20) NOT NULL CHECK (action IN ('flagged', 'blocked')),
  score      FLOAT,
  concern    TEXT,
  source     VARCHAR(20) CHECK (source IN ('moderation', 'gpt')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_sender ON moderation_logs (sender_id, created_at);
