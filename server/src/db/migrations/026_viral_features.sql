-- 026_viral_features.sql
-- Night Streaks, Photo Verification, Profile Completion Score,
-- Wrapped/Recap stats materialised table, and smart notification prefs.

-- ─────────────────────────────────────────────
-- Night Streaks (consecutive weekend go-live sessions)
-- A "night" counts if the user goes live Thu/Fri/Sat/Sun between 6pm-2am.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS night_streaks (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak       SMALLINT NOT NULL DEFAULT 0,
  longest_streak       SMALLINT NOT NULL DEFAULT 0,
  last_live_night      DATE,               -- last calendar date they went live on a "night"
  total_live_nights    INTEGER NOT NULL DEFAULT 0,
  streak_shield_used   BOOLEAN NOT NULL DEFAULT false, -- VIP perk: one free missed night per month
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Photo Verification (selfie liveness check)
-- We use Veriff/AWS Rekognition via webhook — store status here
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photo_verifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id     TEXT UNIQUE,             -- 3rd-party verification session ID
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
  provider       VARCHAR(20) DEFAULT 'internal',
  verified_at    TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_ver_user ON photo_verifications (user_id);

-- Add photo_verified flag to trust_scores
ALTER TABLE trust_scores
  ADD COLUMN IF NOT EXISTS photo_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS face_check_at  TIMESTAMP;

-- ─────────────────────────────────────────────
-- Profile Completion Score (0–100, cached)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_completion (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  score         SMALLINT NOT NULL DEFAULT 0,
  has_photo     BOOLEAN NOT NULL DEFAULT false,
  has_bio       BOOLEAN NOT NULL DEFAULT false,
  has_voice     BOOLEAN NOT NULL DEFAULT false,
  has_vibes     BOOLEAN NOT NULL DEFAULT false,
  has_verified  BOOLEAN NOT NULL DEFAULT false,
  has_wingman   BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Wrapped / Recap stats (materialised per user per period)
-- Refreshed weekly by a cron job
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_stats_weekly (
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start           DATE NOT NULL,
  nights_live          SMALLINT NOT NULL DEFAULT 0,
  sparks_sent          SMALLINT NOT NULL DEFAULT 0,
  sparks_received      SMALLINT NOT NULL DEFAULT 0,
  matches_made         SMALLINT NOT NULL DEFAULT 0,
  dates_confirmed      SMALLINT NOT NULL DEFAULT 0,
  avg_match_time_mins  FLOAT,            -- avg time from go-live to first match
  top_vibe             VARCHAR(20),
  top_city_area        VARCHAR(60),
  PRIMARY KEY (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS user_stats_monthly (
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_start          DATE NOT NULL,
  nights_live          SMALLINT NOT NULL DEFAULT 0,
  sparks_sent          INTEGER NOT NULL DEFAULT 0,
  sparks_received      INTEGER NOT NULL DEFAULT 0,
  matches_made         SMALLINT NOT NULL DEFAULT 0,
  dates_confirmed      SMALLINT NOT NULL DEFAULT 0,
  total_distance_miles FLOAT DEFAULT 0,  -- sum of travel distances to dates
  streak_peak          SMALLINT NOT NULL DEFAULT 0,
  top_vibe             VARCHAR(20),
  personality_type     VARCHAR(40),      -- AI-assigned: "Night Owl", "Weekend Warrior" etc
  PRIMARY KEY (user_id, month_start)
);

-- ─────────────────────────────────────────────
-- Smart Notification Preferences
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  peak_hour_alerts       BOOLEAN NOT NULL DEFAULT true,
  streak_reminders       BOOLEAN NOT NULL DEFAULT true,
  weekly_wrapped         BOOLEAN NOT NULL DEFAULT true,
  idle_match_nudge       BOOLEAN NOT NULL DEFAULT true,
  city_heating_up        BOOLEAN NOT NULL DEFAULT true,
  preferred_alert_hour   SMALLINT DEFAULT 19  -- 7pm local default
                           CHECK (preferred_alert_hour BETWEEN 0 AND 23)
);

-- ─────────────────────────────────────────────
-- Voice note on profiles (already in schema via voice_note_url)
-- Add voice_verified flag
-- ─────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS voice_note_url_verified BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────
-- City Leaderboard (top weekly users per city — for social proof)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_leaderboard_weekly (
  city           VARCHAR(50) NOT NULL,
  week_start     DATE NOT NULL,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank           SMALLINT NOT NULL,
  nights_live    SMALLINT NOT NULL DEFAULT 0,
  matches_made   SMALLINT NOT NULL DEFAULT 0,
  display_name   VARCHAR(30) NOT NULL,
  avatar_emoji   VARCHAR(10) NOT NULL,
  PRIMARY KEY (city, week_start, rank)
);

-- Add weekly billing period to subscriptions
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_period_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_billing_period_check
  CHECK (billing_period IN ('weekly', 'monthly', 'annual'));
