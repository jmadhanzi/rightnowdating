-- 021_referral_rewards.sql
-- Boost-credit balance + a ledger so each referral tier reward is granted once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS boost_credits INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS referral_rewards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_count SMALLINT NOT NULL, -- referral-count threshold reached (1,2,3,5,10)
  reward     TEXT NOT NULL,
  granted_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uniq_user_tier UNIQUE (user_id, tier_count)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards (user_id);
