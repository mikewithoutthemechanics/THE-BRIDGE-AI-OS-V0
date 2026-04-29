-- ============================================================
-- 20260420 · economyDb — payments_received / revenue_splits schema
-- ============================================================
-- Context: server.js references `payments_received`, `revenue_splits`,
-- `treasury_buckets`, and `treasury_ledger` via the economyDb pool
-- (ECONOMY_DB_URL). No CREATE TABLE for these exists anywhere in the
-- repo — inserts at server.js:341 are wrapped in try/catch and fail
-- silently, explaining the "reporting data mismatch" finding from the
-- 2026-04-20 audit.
--
-- This migration defines the minimum schema required so those inserts
-- succeed AND are idempotent. Safe to re-run.
-- ============================================================

BEGIN;

-- Payments received from external gateways (PayFast, Paystack, PayPal)
CREATE TABLE IF NOT EXISTS payments_received (
  id            BIGSERIAL PRIMARY KEY,
  provider      TEXT NOT NULL,
  payment_id    TEXT,
  amount        NUMERIC(14, 2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'ZAR',
  payer_email   TEXT,
  item_name     TEXT,
  raw_payload   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency at the storage layer: same provider + payment_id can only
-- be inserted once, regardless of how many times the application retries.
-- Partial-unique because legacy rows may have NULL payment_id.
CREATE UNIQUE INDEX IF NOT EXISTS payments_received_provider_payment_id_unique
  ON payments_received (provider, payment_id)
  WHERE payment_id IS NOT NULL;

-- Per-payment revenue split rows (one per bucket).
CREATE TABLE IF NOT EXISTS revenue_splits (
  id          BIGSERIAL PRIMARY KEY,
  payment_id  BIGINT NOT NULL REFERENCES payments_received(id) ON DELETE CASCADE,
  bucket      TEXT NOT NULL,
  amount      NUMERIC(14, 2) NOT NULL,
  percentage  NUMERIC(5, 2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One bucket per payment — protects against retry-loop inserts.
CREATE UNIQUE INDEX IF NOT EXISTS revenue_splits_payment_bucket_unique
  ON revenue_splits (payment_id, bucket);

-- Per-bucket running balances.
CREATE TABLE IF NOT EXISTS treasury_buckets (
  name        TEXT PRIMARY KEY,
  balance     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the four canonical buckets if they don't yet exist.
INSERT INTO treasury_buckets (name, balance) VALUES
  ('ubi', 0), ('treasury', 0), ('ops', 0), ('founder', 0)
ON CONFLICT (name) DO NOTHING;

-- Append-only audit log of treasury events.
CREATE TABLE IF NOT EXISTS treasury_ledger (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  source      TEXT NOT NULL,
  amount      NUMERIC(14, 2) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'ZAR',
  bucket      TEXT,
  reference   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reference should be unique per source so retries don't double-log.
CREATE UNIQUE INDEX IF NOT EXISTS treasury_ledger_source_reference_unique
  ON treasury_ledger (source, reference)
  WHERE reference IS NOT NULL AND reference <> '';

COMMIT;
