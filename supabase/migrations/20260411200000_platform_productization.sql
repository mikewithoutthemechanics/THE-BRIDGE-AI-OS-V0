-- =============================================================================
-- BRIDGE AI OS — Platform Productization Schema
-- Migration: 20260411200000_platform_productization
--
-- Tables added:
--   projects         — persistent execution containers per user
--   project_runs     — individual agent execution records
--   outputs          — deterministic output registry
--   profile_feedback — closed feedback loop: every run reports back to profile
-- =============================================================================

-- ── projects ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  name                 TEXT NOT NULL DEFAULT 'Untitled Project',
  tool_id              TEXT,
  intent               TEXT,
  integration_targets  JSONB NOT NULL DEFAULT '[]',
  scaffold             JSONB,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'paused', 'archived')),
  run_count            INTEGER NOT NULL DEFAULT 0,
  output_count         INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id    ON projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects (user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at  ON projects (updated_at DESC);

-- Row-level security: users only see their own projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_user_isolation ON projects;
CREATE POLICY projects_user_isolation ON projects
  USING (user_id = current_setting('app.current_user_id', TRUE));

-- Helper RPC to atomically increment run_count (avoids read-modify-write races)
CREATE OR REPLACE FUNCTION increment_project_runs(p_id TEXT)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE projects SET run_count = run_count + 1, updated_at = NOW() WHERE id = p_id;
$$;

-- Helper RPC for output_count
CREATE OR REPLACE FUNCTION increment_project_outputs(p_id TEXT)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE projects SET output_count = output_count + 1, updated_at = NOW() WHERE id = p_id;
$$;

-- ── project_runs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_runs (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  tool_id        TEXT,
  agent_ids      JSONB NOT NULL DEFAULT '[]',
  inputs         JSONB NOT NULL DEFAULT '{}',
  trigger        TEXT NOT NULL DEFAULT 'manual'
                   CHECK (trigger IN ('manual', 'scheduled', 'webhook', 'api', 'cron')),
  status         TEXT NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  result         JSONB,
  error          TEXT,
  latency_ms     INTEGER,
  tokens_used    INTEGER,
  brdg_cost      NUMERIC(18, 8)
);

CREATE INDEX IF NOT EXISTS idx_runs_project_id  ON project_runs (project_id);
CREATE INDEX IF NOT EXISTS idx_runs_started_at  ON project_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status      ON project_runs (status);

-- ── outputs ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outputs (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  run_id              TEXT REFERENCES project_runs (id) ON DELETE SET NULL,
  user_id             TEXT,
  title               TEXT,
  type                TEXT NOT NULL DEFAULT 'export'
                        CHECK (type IN ('export', 'integration', 'hybrid')),
  format              TEXT NOT NULL DEFAULT 'json'
                        CHECK (format IN ('json', 'markdown', 'zip', 'repo', 'api', 'webhook', 'bundle', 'report')),
  destination         TEXT,          -- URL, channel, repo, etc.
  payload             JSONB,         -- the actual output content
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'generating', 'ready', 'delivered', 'retry', 'failed')),
  delivery_attempts   INTEGER NOT NULL DEFAULT 0,
  last_attempt_at     TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outputs_project_id ON outputs (project_id);
CREATE INDEX IF NOT EXISTS idx_outputs_user_id    ON outputs (user_id);
CREATE INDEX IF NOT EXISTS idx_outputs_status     ON outputs (status);
CREATE INDEX IF NOT EXISTS idx_outputs_created_at ON outputs (created_at DESC);

-- Row-level security
ALTER TABLE outputs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outputs_user_isolation ON outputs;
CREATE POLICY outputs_user_isolation ON outputs
  USING (user_id = current_setting('app.current_user_id', TRUE));

-- ── profile_feedback ─────────────────────────────────────────────────────────
-- Closed feedback loop: every agent execution writes a row here.
-- Used for profile analytics, lead scoring, and lifecycle management.

CREATE TABLE IF NOT EXISTS profile_feedback (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  project_id     TEXT REFERENCES projects (id) ON DELETE SET NULL,
  output_id      TEXT REFERENCES outputs (id) ON DELETE SET NULL,
  success        BOOLEAN NOT NULL DEFAULT TRUE,
  latency_ms     INTEGER,
  tokens_used    INTEGER,
  brdg_cost      NUMERIC(18, 8),
  usage_data     JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id    ON profile_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON profile_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_project_id ON profile_feedback (project_id);

-- Analytics view: per-user execution summary (used by /api/platform/profile/analytics)
CREATE OR REPLACE VIEW profile_analytics AS
SELECT
  pf.user_id,
  COUNT(*)                                               AS total_executions,
  COUNT(*) FILTER (WHERE pf.success)                    AS successful,
  COUNT(*) FILTER (WHERE NOT pf.success)                AS failed,
  ROUND(AVG(pf.latency_ms)::NUMERIC, 0)                AS avg_latency_ms,
  SUM(pf.tokens_used)                                   AS total_tokens,
  SUM(pf.brdg_cost)                                     AS total_brdg_spent,
  MAX(pf.created_at)                                    AS last_execution_at
FROM profile_feedback pf
GROUP BY pf.user_id;

-- ── Ensure legacy schema tables exist (idempotent) ────────────────────────────
-- These may already exist from the original supabase-schema.sql migration.
-- Only create if missing.

CREATE TABLE IF NOT EXISTS twin_speech_log (
  id         BIGSERIAL PRIMARY KEY,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
