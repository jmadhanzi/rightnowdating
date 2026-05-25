-- 015_sos_events.sql
-- Safety SOS triggers raised during/around a date.

CREATE TABLE IF NOT EXISTS sos_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id               UUID REFERENCES matches(id) ON DELETE SET NULL,
  location               GEOMETRY(POINT, 4326),
  triggered_at           TIMESTAMP DEFAULT NOW(),
  resolved_at            TIMESTAMP,
  escalated_to_emergency BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_sos_events_user ON sos_events (user_id);
CREATE INDEX IF NOT EXISTS idx_sos_events_unresolved
  ON sos_events (triggered_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sos_events_location ON sos_events USING GIST (location);
