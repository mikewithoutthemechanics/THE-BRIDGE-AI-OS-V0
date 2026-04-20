-- ============================================================
-- 20260420 · Payment idempotency hardening
-- ============================================================
-- Context: Audit 2026-04-20 found that none of the five payment ingestion
-- paths had a database-level uniqueness guarantee. Application-level dedup
-- (`if paymentRow.status === 'paid' return`) had a read-then-update race
-- window; concurrent PayFast ITN retries could both see 'pending' and
-- both insert economy records. This migration makes idempotency enforceable
-- at the storage layer, so even a bad patch or racy deploy can't double-collect.
--
-- Safe to re-run: every constraint creation is guarded.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────
-- 1. Supabase `payments` — UNIQUE on reference (used by PayFast edge
--    path at server.js:297 to dedup by m_payment_id).
-- ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_reference_unique'
  ) THEN
    -- Drop rows with NULL reference first so the constraint can be added
    -- (NULL in reference means the row was never properly initialized).
    -- If any rows have duplicate reference values, this will fail — an
    -- operator must manually reconcile before re-running. That's intentional.
    ALTER TABLE payments
      ADD CONSTRAINT payments_reference_unique UNIQUE (reference);
  END IF;
END $$;

-- Optional hardening: also UNIQUE on pf_payment_id where present.
-- Partial index so NULL (unpaid rows) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS payments_pf_payment_id_unique
  ON payments (pf_payment_id)
  WHERE pf_payment_id IS NOT NULL;

-- Status must be one of a known set. Matches the application's expected
-- transitions: pending → paid (or pending → failed).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_status_check'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_status_check
      CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- 2. Hardened schema `payments` (separate table in hardened_treasury_schema)
--    — add UNIQUE on gateway_reference if table exists.
-- ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'gateway_reference'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_gateway_reference_unique'
  ) THEN
    -- Composite unique: same gateway_reference can appear once per gateway.
    -- (Two different gateways could theoretically generate the same ref string.)
    ALTER TABLE payments
      ADD CONSTRAINT payments_gateway_reference_unique
      UNIQUE (gateway, gateway_reference);
  END IF;
END $$;

COMMIT;
