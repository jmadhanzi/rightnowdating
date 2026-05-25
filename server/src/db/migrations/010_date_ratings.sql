-- 010_date_ratings.sql
-- Post-date feedback. Feeds trust_scores (show-up rate, average rating, safety).
-- One rating per rater per match.

CREATE TABLE IF NOT EXISTS date_ratings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  rater_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score            SMALLINT CHECK (score >= 1 AND score <= 5),
  showed_up        BOOLEAN NOT NULL,
  would_meet_again BOOLEAN,
  safety_concern   BOOLEAN DEFAULT false,
  created_at       TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uniq_rating_per_match UNIQUE (match_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_date_ratings_ratee ON date_ratings (ratee_id);
CREATE INDEX IF NOT EXISTS idx_date_ratings_match ON date_ratings (match_id);
