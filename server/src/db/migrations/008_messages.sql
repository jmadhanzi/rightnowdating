-- 008_messages.sql
-- In-match chat. `ai_safety_score` / `is_flagged` are populated by the AI
-- safety pipeline; `deleted_at` enables soft deletes.

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  is_flagged      BOOLEAN DEFAULT false,
  ai_safety_score FLOAT,
  deleted_at      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_match ON messages (match_id, created_at);
