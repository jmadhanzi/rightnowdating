-- 012_subscriptions.sql
-- RIGHTNOW+ / VIP billing state, mirrored from Stripe.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id     VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  plan                   VARCHAR(20) DEFAULT 'free'
    CHECK (plan IN ('free', 'plus', 'vip')),
  billing_period         VARCHAR(20) DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'annual')),
  status                 VARCHAR(20) DEFAULT 'trialing'
    CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
  trial_ends_at          TIMESTAMP,
  current_period_end     TIMESTAMP,
  created_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON subscriptions (stripe_subscription_id);
