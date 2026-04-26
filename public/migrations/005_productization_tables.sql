-- Bridge AI OS — Productization Layer Tables
-- Migration 005: Projects, Project Runs, Outputs, Profile Feedback, Wizard Profiles
-- Applied after 004_leadgen_crm_osint.sql

-- ============================================================
-- PROJECTS (persistent execution containers)
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         text NOT NULL REFERENCES users(id),
  name            text NOT NULL DEFAULT 'Untitled Project',
  tool_id         text,
  intent          text,
  integration_targets jsonb DEFAULT '[]',
  scaffold        jsonb,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived', 'paused')),
  run_count       integer DEFAULT 0,
  output_count    integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_tool ON projects(tool_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

-- ============================================================
-- PROJECT RUNS (individual agent execution records)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_runs (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id      text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tool_id         text,
  agent_ids       jsonb DEFAULT '[]',
  inputs          jsonb DEFAULT '{}',
  trigger         text DEFAULT 'manual'
                    CHECK (trigger IN ('manual', 'scheduled', 'webhook', 'integration', 'retry')),
  status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  result          jsonb,
  error           text,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  latency_ms      integer,
  tokens_used     integer DEFAULT 0,
  brdg_cost       double precision DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_project_runs_project ON project_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_runs_status ON project_runs(status);
CREATE INDEX IF NOT EXISTS idx_project_runs_started ON project_runs(started_at DESC);

-- ============================================================
-- OUTPUTS (tracked, deterministic deliverables)
-- ============================================================
CREATE TABLE IF NOT EXISTS outputs (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id      text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id          text REFERENCES project_runs(id) ON DELETE SET NULL,
  user_id         text NOT NULL REFERENCES users(id),
  title           text DEFAULT 'Output',
  type            text NOT NULL DEFAULT 'export'
                    CHECK (type IN ('export', 'integration', 'hybrid')),
  format          text NOT NULL DEFAULT 'json'
                    CHECK (format IN ('json', 'markdown', 'zip', 'repo', 'api', 'webhook', 'bundle', 'report')),
  destination     text,
  payload         jsonb,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'generating', 'ready', 'exported', 'integrated', 'delivered', 'retry', 'failed')),
  delivery_attempts integer DEFAULT 0,
  last_attempt_at timestamptz,
  delivered_at    timestamptz,
  error           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outputs_project ON outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_outputs_user ON outputs(user_id);
CREATE INDEX IF NOT EXISTS idx_outputs_status ON outputs(status);
CREATE INDEX IF NOT EXISTS idx_outputs_type ON outputs(type);
CREATE INDEX IF NOT EXISTS idx_outputs_created ON outputs(created_at DESC);

-- ============================================================
-- PROFILE FEEDBACK (closed-loop execution metrics)
-- ============================================================
CREATE TABLE IF NOT EXISTS profile_feedback (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         text NOT NULL REFERENCES users(id),
  project_id      text REFERENCES projects(id) ON DELETE SET NULL,
  output_id       text REFERENCES outputs(id) ON DELETE SET NULL,
  success         boolean DEFAULT true,
  latency_ms      integer,
  tokens_used     integer,
  brdg_cost       double precision,
  usage_data      jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_fb_user ON profile_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_fb_project ON profile_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_profile_fb_created ON profile_feedback(created_at DESC);

-- ============================================================
-- WIZARD PROFILES (onboarding intent capture + funnel tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS wizard_profiles (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         text NOT NULL REFERENCES users(id) UNIQUE,
  intent          text,
  industry        text,
  integrations    jsonb DEFAULT '[]',
  selected_plan   text DEFAULT 'free',
  default_project_id text REFERENCES projects(id) ON DELETE SET NULL,
  completed_at    timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wizard_profiles_user ON wizard_profiles(user_id);

-- ============================================================
-- INTEGRATION RUNS (stateless dispatch audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS integration_runs (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         text NOT NULL REFERENCES users(id),
  project_id      text REFERENCES projects(id) ON DELETE SET NULL,
  output_id       text NOT NULL REFERENCES outputs(id),
  target          text NOT NULL,
  config          jsonb DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  result          jsonb,
  error           text,
  attempt         integer DEFAULT 1,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_runs_user ON integration_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_runs_output ON integration_runs(output_id);
CREATE INDEX IF NOT EXISTS idx_integration_runs_target ON integration_runs(target);

-- ============================================================
-- RPC HELPERS (atomic counters for projects)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_project_runs(p_id text)
RETURNS void AS $$
BEGIN
  UPDATE projects
  SET run_count = run_count + 1,
      updated_at = now()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_project_outputs(p_id text)
RETURNS void AS $$
BEGIN
  UPDATE projects
  SET output_count = output_count + 1,
      updated_at = now()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE wizard_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_runs ENABLE ROW LEVEL SECURITY;

-- Users read their own rows
CREATE POLICY projects_select_own ON projects
  FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY projects_service ON projects
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY project_runs_select_own ON project_runs
  FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text));
CREATE POLICY project_runs_service ON project_runs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY outputs_select_own ON outputs
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY outputs_service ON outputs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY profile_feedback_select_own ON profile_feedback
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY profile_feedback_service ON profile_feedback
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY wizard_profiles_select_own ON wizard_profiles
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY wizard_profiles_service ON wizard_profiles
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY integration_runs_select_own ON integration_runs
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY integration_runs_service ON integration_runs
  FOR ALL USING (auth.role() = 'service_role');
