-- 022_subscription_cancelling.sql
-- Allow the 'cancelling' status (cancel scheduled at period end).

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'cancelling'));
