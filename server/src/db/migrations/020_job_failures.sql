-- 020_job_failures.sql
-- Persistent record of failed background jobs (Bull queues).

CREATE TABLE IF NOT EXISTS job_failures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name VARCHAR(50) NOT NULL,
  job_id     VARCHAR(100),
  job_name   VARCHAR(100),
  data       JSONB,
  error      TEXT,
  failed_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_failures_queue ON job_failures (queue_name, failed_at);
