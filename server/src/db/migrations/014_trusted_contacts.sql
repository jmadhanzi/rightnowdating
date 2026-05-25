-- 014_trusted_contacts.sql
-- Emergency contacts notified on SOS / shared via "share my date".

CREATE TABLE IF NOT EXISTS trusted_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_name VARCHAR(50),
  contact_phone VARCHAR(20),
  is_primary   BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_trusted_contacts_user ON trusted_contacts (user_id);
