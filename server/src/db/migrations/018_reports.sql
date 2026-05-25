-- 018_reports.sql
-- User reports. Feed trust-score deductions and the auto-suspension rule.

CREATE TABLE IF NOT EXISTS reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id         UUID REFERENCES matches(id) ON DELETE SET NULL,
  reason           VARCHAR(20) NOT NULL
    CHECK (reason IN ('harassment', 'no_show', 'fake_profile', 'inappropriate', 'felt_unsafe', 'other')),
  description      TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports (reported_user_id, created_at);
