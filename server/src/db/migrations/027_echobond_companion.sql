-- 027_echobond_companion.sql
-- EchoBond AI companion tables: profiles, relationship state, long-term memory,
-- episodic memory, and conversation history.

-- ─────────────────────────────────────────────
-- companion_profiles: per-user companion configuration
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companion_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  companion_name       TEXT NOT NULL DEFAULT 'Alex',
  companion_type       TEXT NOT NULL DEFAULT 'friend',  -- friend | mentor | support
  personality_base     JSONB NOT NULL DEFAULT '{"warmth":7,"humor":6,"curiosity":8,"directness":5}',
  life_threads         JSONB NOT NULL DEFAULT '[{"id":"lt1","title":"learning to paint watercolors","progress":10},{"id":"lt2","title":"training for a 5K run","progress":25}]',
  mood_today           TEXT NOT NULL DEFAULT 'content',
  mood_updated_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  relationship_stage   SMALLINT NOT NULL DEFAULT 1 CHECK (relationship_stage BETWEEN 1 AND 6),
  stage_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_count        INTEGER NOT NULL DEFAULT 0,
  first_session_at     TIMESTAMPTZ,
  last_session_at      TIMESTAMPTZ,
  attachment_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- companion_relationship_state: milestones, inside jokes, narrative arcs, preference memory
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companion_relationship_state (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  milestones          JSONB NOT NULL DEFAULT '[]',
  inside_jokes        JSONB NOT NULL DEFAULT '[]',
  narrative_threads   JSONB NOT NULL DEFAULT '[]',
  preference_memory   JSONB NOT NULL DEFAULT '{"topics_enjoy":[],"topics_avoid":[],"humor_style":"gentle","communication_style":"warm"}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- companion_long_term_memory: structured facts about the user
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companion_long_term_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_key    TEXT NOT NULL,
  memory_value  TEXT NOT NULL,
  memory_type   TEXT NOT NULL DEFAULT 'fact',  -- fact | preference | person | goal | event
  confidence    NUMERIC(3,2) NOT NULL DEFAULT 0.90,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, memory_key)
);

-- ─────────────────────────────────────────────
-- companion_episodic_memory: per-session summaries
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companion_episodic_memory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  summary          TEXT NOT NULL,
  emotional_tone   TEXT NOT NULL DEFAULT 'neutral',
  salience_score   NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  key_topics       TEXT[] NOT NULL DEFAULT '{}',
  is_consolidated  BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- companion_messages: full conversation history
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companion_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companion_messages_user_created ON companion_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companion_episodic_user_date ON companion_episodic_memory(user_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_companion_ltm_user ON companion_long_term_memory(user_id, memory_type);
