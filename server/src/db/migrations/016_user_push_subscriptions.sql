-- 016_user_push_subscriptions.sql
-- Web Push (PushSubscription JSON) endpoints per user/device.

CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON user_push_subscriptions (user_id);
