-- 017_user_safety_flags.sql
-- Moderation flags used by the safety system (SOS, auto-suspension).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at       TIMESTAMP;
