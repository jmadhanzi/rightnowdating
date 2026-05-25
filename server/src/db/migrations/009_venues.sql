-- 009_venues.sql
-- Real-world meetup locations. "Safe zones" are vetted public venues RIGHTNOW
-- recommends for first dates.

CREATE TABLE IF NOT EXISTS venues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  address       TEXT NOT NULL,
  city          VARCHAR(50) NOT NULL,
  location      GEOMETRY(POINT, 4326),
  place_id      VARCHAR(100),
  venue_type    VARCHAR(20)
    CHECK (venue_type IN ('coffee', 'bar', 'restaurant', 'park', 'mall', 'other')),
  is_safe_zone  BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,
  opening_hours JSONB,
  rating        FLOAT
);

CREATE INDEX IF NOT EXISTS idx_venues_location ON venues USING GIST (location);

-- De-dupe venues imported from Google Places.
CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_place_id
  ON venues (place_id) WHERE place_id IS NOT NULL;

-- Deferred foreign key: matches (007) was created before venues existed.
-- Guarded so the migration remains idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_matches_venue'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT fk_matches_venue
      FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
  END IF;
END$$;
