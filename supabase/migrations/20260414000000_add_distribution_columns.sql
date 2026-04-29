-- =============================================================================
-- Add BRDG distribution audit columns to transactions table
-- Safe: ADD COLUMN IF NOT EXISTS — idempotent, no data loss
-- =============================================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS distribution_status  TEXT,        -- pending | confirmed | failed | skipped
  ADD COLUMN IF NOT EXISTS distribution_tx_hash TEXT,        -- on-chain tx hash when confirmed
  ADD COLUMN IF NOT EXISTS distribution_brdg    NUMERIC,     -- BRDG amount actually sent
  ADD COLUMN IF NOT EXISTS distribution_wallet  TEXT,        -- destination wallet address
  ADD COLUMN IF NOT EXISTS distribution_at      TIMESTAMPTZ; -- when distribution was attempted

-- Index for reconciliation queries (find untracked + failed)
CREATE INDEX IF NOT EXISTS idx_tx_distribution_status
  ON transactions(distribution_status)
  WHERE status = 'success';
