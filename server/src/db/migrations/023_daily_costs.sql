-- 023_daily_costs.sql
-- OpenAI token/cost tracking + a was_blocked flag on moderation logs.

CREATE TABLE IF NOT EXISTS daily_costs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  endpoint       VARCHAR(50) NOT NULL,
  tokens_used    INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_costs_date ON daily_costs (date);

ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS was_blocked BOOLEAN NOT NULL DEFAULT false;
