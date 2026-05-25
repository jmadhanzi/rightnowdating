-- 011_referrals.sql
-- Invite-friends growth loop. One referral record per referred user.

CREATE TABLE IF NOT EXISTS referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id       UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code     VARCHAR(20) NOT NULL,
  status            VARCHAR(20) DEFAULT 'clicked'
    CHECK (status IN ('clicked', 'registered', 'first_date')),
  reward_tier       SMALLINT DEFAULT 0,
  reward_granted_at TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals (referral_code);
