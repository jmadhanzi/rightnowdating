-- 003_profiles.sql
-- One profile per user (PK == users.id). Cascades on account deletion.

CREATE TABLE IF NOT EXISTS profiles (
  id                     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name           VARCHAR(30) NOT NULL,
  age                    SMALLINT CHECK (age >= 18 AND age <= 99),
  avatar_emoji           VARCHAR(10) DEFAULT '🧑',
  photo_url              TEXT,
  video_url              TEXT,
  voice_note_url         TEXT,
  bio                    TEXT,
  city                   VARCHAR(50) DEFAULT 'Miami',
  preferred_vibes        TEXT[],
  preferred_age_min      SMALLINT DEFAULT 18,
  preferred_age_max      SMALLINT DEFAULT 45,
  preferred_radius_miles FLOAT DEFAULT 2.0
);
