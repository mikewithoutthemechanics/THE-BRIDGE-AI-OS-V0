-- =============================================================================
-- Recovery Infrastructure
-- 1. distribution_attempts column on transactions (safe, idempotent)
-- 2. hitl_queue table for HITL escalation of ambiguous distributions
-- =============================================================================

-- ── 1. Attempt counter on transactions ───────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS distribution_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distribution_error    TEXT;        -- last error message

-- ── 2. HITL queue table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hitl_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT        NOT NULL,                          -- e.g. REVENUE_RECOVERY
  payment_id    TEXT        NOT NULL,
  email         TEXT,
  amount_brdg   NUMERIC,
  reason        TEXT        NOT NULL,                          -- classifyFailure() output
  status        TEXT        NOT NULL DEFAULT 'pending',        -- pending | approved | rejected
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  meta          JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hitl_queue_status     ON hitl_queue(status);
CREATE INDEX IF NOT EXISTS idx_hitl_queue_payment_id ON hitl_queue(payment_id);
-- Prevent the same payment from being queued twice while still pending
CREATE UNIQUE INDEX IF NOT EXISTS idx_hitl_queue_pending_payment
  ON hitl_queue(payment_id)
  WHERE status = 'pending';
