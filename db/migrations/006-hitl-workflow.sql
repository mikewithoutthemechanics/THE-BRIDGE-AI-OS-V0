-- =============================================================================
-- BRIDGE AI OS — HITL Workflow Engine
-- Migration 006: workflow_runs, workflow_steps, approval_queue
--
-- Idempotent: drops tables first. user_id / contact_id are TEXT (matches users.id).
-- =============================================================================

DROP TABLE IF EXISTS approval_queue  CASCADE;
DROP TABLE IF EXISTS workflow_steps  CASCADE;
DROP TABLE IF EXISTS workflow_runs   CASCADE;
DROP TABLE IF EXISTS email_sequences CASCADE;
DROP TABLE IF EXISTS crm_contacts    CASCADE;

-- ── CRM Contacts (real, persisted) ───────────────────────────────────────────
CREATE TABLE crm_contacts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT,                    -- links to users.id after conversion
  email         TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL DEFAULT '',
  company       TEXT        NOT NULL DEFAULT '',
  phone         TEXT,
  status        TEXT        NOT NULL DEFAULT 'lead',     -- lead | prospect | qualified | opportunity | customer | churned
  funnel_stage  TEXT        NOT NULL DEFAULT 'identified', -- identified | outreach | nurture | demo | proposal | negotiation | closed_won | closed_lost
  lead_score    INTEGER     NOT NULL DEFAULT 0,
  plan_interest TEXT        NOT NULL DEFAULT 'starter',  -- free | starter | pro | enterprise
  source        TEXT        NOT NULL DEFAULT 'manual',   -- manual | web | referral | import | api | ad
  assigned_to   TEXT,                    -- sales rep name
  tags          JSONB       NOT NULL DEFAULT '[]',
  notes         TEXT        NOT NULL DEFAULT '',
  last_contacted_at TIMESTAMPTZ,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_contacts_status ON crm_contacts(status);
CREATE INDEX idx_crm_contacts_stage  ON crm_contacts(funnel_stage);
CREATE INDEX idx_crm_contacts_score  ON crm_contacts(lead_score DESC);

-- ── Workflow Runs (durable state machine per contact) ─────────────────────────
CREATE TABLE workflow_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID        NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  workflow_type TEXT        NOT NULL DEFAULT 'lead_to_close',
  state         TEXT        NOT NULL DEFAULT 'lead_captured',
  status        TEXT        NOT NULL DEFAULT 'running', -- running | paused | completed | cancelled | failed
  context       JSONB       NOT NULL DEFAULT '{}',      -- accumulated data from all steps
  assigned_to   TEXT,
  priority      TEXT        NOT NULL DEFAULT 'normal',  -- low | normal | high | urgent
  paused_at     TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_workflow_runs_contact ON workflow_runs(contact_id);
CREATE INDEX idx_workflow_runs_state   ON workflow_runs(state, status);
CREATE INDEX idx_workflow_runs_status  ON workflow_runs(status) WHERE status IN ('running', 'paused');

-- ── Workflow Steps (audit trail of every step execution) ──────────────────────
CREATE TABLE workflow_steps (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID        NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_name    TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | skipped
  input        JSONB       NOT NULL DEFAULT '{}',
  output       JSONB       NOT NULL DEFAULT '{}',
  error        TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms  INTEGER
);

CREATE INDEX idx_workflow_steps_run    ON workflow_steps(run_id, started_at DESC);
CREATE INDEX idx_workflow_steps_status ON workflow_steps(status) WHERE status IN ('running', 'failed');

-- ── Approval Queue (HITL gates) ───────────────────────────────────────────────
CREATE TABLE approval_queue (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID        NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step            TEXT        NOT NULL,          -- workflow step that triggered this gate
  type            TEXT        NOT NULL,          -- qualify | send_pitch | send_quote | close_deal | send_invoice | approve_discount | approve_refund | custom
  title           TEXT        NOT NULL,
  description     TEXT        NOT NULL DEFAULT '',
  context         JSONB       NOT NULL DEFAULT '{}',   -- data relevant to decision (quote total, contact name, etc.)
  status          TEXT        NOT NULL DEFAULT 'pending', -- pending | approved | rejected | expired
  priority        TEXT        NOT NULL DEFAULT 'normal',
  assigned_to     TEXT,
  decided_by      TEXT,
  decision_notes  TEXT,
  auto_approve_at TIMESTAMPTZ,                   -- NULL = require manual decision always
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at      TIMESTAMPTZ
);

CREATE INDEX idx_approval_run    ON approval_queue(run_id);
CREATE INDEX idx_approval_status ON approval_queue(status, created_at DESC) WHERE status = 'pending';
CREATE INDEX idx_approval_type   ON approval_queue(type, status);

-- ── Email Sequences (nurture + outreach cadences) ─────────────────────────────
CREATE TABLE email_sequences (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID        NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  contact_id   UUID        NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  sequence_name TEXT       NOT NULL,   -- intro | follow_up_1 | demo_invite | follow_up_2 | close_offer | win_back
  email_index  INTEGER     NOT NULL DEFAULT 0,
  subject      TEXT        NOT NULL,
  body_html    TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'scheduled', -- scheduled | sent | failed | skipped
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ,
  opened_at    TIMESTAMPTZ,
  clicked_at   TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_seq_run       ON email_sequences(run_id);
CREATE INDEX idx_email_seq_scheduled ON email_sequences(scheduled_at) WHERE status = 'scheduled';

-- ── Triggers: updated_at ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hitl_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_crm_contacts_updated_at  BEFORE UPDATE ON crm_contacts   FOR EACH ROW EXECUTE FUNCTION hitl_set_updated_at();
CREATE TRIGGER trig_workflow_runs_updated_at BEFORE UPDATE ON workflow_runs   FOR EACH ROW EXECUTE FUNCTION hitl_set_updated_at();
CREATE TRIGGER trig_approval_updated_at      BEFORE UPDATE ON approval_queue FOR EACH ROW EXECUTE FUNCTION hitl_set_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE crm_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — app uses service_role key only
-- No user-facing RLS policies needed (admin-only tables)
