-- 004_trust_scores.sql
-- Reputation/safety signal per user. One row per user (PK == user_id).

CREATE TABLE IF NOT EXISTS trust_scores (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  score          SMALLINT DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  show_up_rate   FLOAT DEFAULT 1.0,
  total_dates    SMALLINT DEFAULT 0,
  average_rating FLOAT DEFAULT 0,
  total_ratings  SMALLINT DEFAULT 0,
  verified_phone BOOLEAN DEFAULT false,
  verified_id    BOOLEAN DEFAULT false,
  photo_matched  BOOLEAN DEFAULT false,
  updated_at     TIMESTAMP DEFAULT NOW()
);
