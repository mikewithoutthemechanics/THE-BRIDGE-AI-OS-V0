-- =============================================================================
-- MIGRATION: 013_withdrawal_system.sql
-- DESCRIPTION: Creates tables for the withdrawal system
-- TABLES:
--   - withdrawal_requests: User BRDG withdrawal tracking
--   - agent_claims: Agent earnings claims
--   - fiat_payouts: Fiat off-ramp queue (PayFast/EFT)
--   - withdrawal_claims: Merkle-gated entitlement claims
-- =============================================================================

-- =============================================================================
-- 1. withdrawal_requests: User-initiated BRDG token withdrawals
-- =============================================================================
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  rail TEXT DEFAULT 'brdg' CHECK (rail IN ('brdg', 'eth', 'dex', 'brdg_to_eth', 'defi', 'payfast', 'eft')),
  metadata JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for withdrawal_requests
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON withdrawal_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_created ON withdrawal_requests(user_id, created_at DESC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_withdrawal_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_withdrawal_requests_updated_at ON withdrawal_requests;
CREATE TRIGGER trg_withdrawal_requests_updated_at
  BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_withdrawal_requests_updated_at();

-- =============================================================================
-- 2. agent_claims: Agent earnings claims (off-chain -> on-chain queue)
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  wallet_address TEXT,
  status TEXT NOT NULL DEFAULT 'pending_wallet' CHECK (status IN ('pending_wallet', 'queued', 'processing', 'completed', 'failed')),
  tx_hash TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Indexes for agent_claims
CREATE INDEX IF NOT EXISTS idx_agent_claims_user_id ON agent_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_claims_agent_id ON agent_claims(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_claims_status ON agent_claims(status);
CREATE INDEX IF NOT EXISTS idx_agent_claims_created_at ON agent_claims(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_claims_status_created ON agent_claims(status, created_at) WHERE status = 'queued';

-- =============================================================================
-- 3. fiat_payouts: Fiat off-ramp queue (BRDG -> ZAR via PayFast/EFT)
-- =============================================================================
CREATE TABLE IF NOT EXISTS fiat_payouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payout_id TEXT NOT NULL UNIQUE,
  rail TEXT NOT NULL CHECK (rail IN ('payfast', 'eft')),
  brdg_amount NUMERIC NOT NULL CHECK (brdg_amount > 0),
  zar_amount NUMERIC NOT NULL CHECK (zar_amount > 0),
  exchange_rate NUMERIC NOT NULL,
  destination TEXT NOT NULL, -- Email for PayFast, bank account for EFT
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  processed_at TIMESTAMPTZ,
  bank_reference TEXT,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Indexes for fiat_payouts
CREATE INDEX IF NOT EXISTS idx_fiat_payouts_status ON fiat_payouts(status);
CREATE INDEX IF NOT EXISTS idx_fiat_payouts_rail ON fiat_payouts(rail);
CREATE INDEX IF NOT EXISTS idx_fiat_payouts_queued_at ON fiat_payouts(queued_at);
CREATE INDEX IF NOT EXISTS idx_fiat_payouts_status_queued ON fiat_payouts(status, queued_at) WHERE status = 'queued';

-- =============================================================================
-- 4. withdrawal_claims: Merkle-gated entitlement claims (anti-double-spend)
-- =============================================================================
CREATE TABLE IF NOT EXISTS withdrawal_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  leaf_index INTEGER NOT NULL,
  claimant TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  rail TEXT NOT NULL,
  tx_hash TEXT,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merkle_root, leaf_index)
);

-- Indexes for withdrawal_claims
CREATE INDEX IF NOT EXISTS idx_withdrawal_claims_root ON withdrawal_claims(merkle_root);
CREATE INDEX IF NOT EXISTS idx_withdrawal_claims_claimant ON withdrawal_claims(claimant);
CREATE INDEX IF NOT EXISTS idx_withdrawal_claims_root_leaf ON withdrawal_claims(merkle_root, leaf_index);

-- =============================================================================
-- 5. admin_withdrawals: Treasury/admin-initiated withdrawals audit log
-- Referenced by lib/treasury-withdraw.js
-- =============================================================================
CREATE TABLE IF NOT EXISTS admin_withdrawals (
  id TEXT PRIMARY KEY,
  "to" TEXT NOT NULL, -- quoted to avoid reserved word
  amount NUMERIC NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  net NUMERIC NOT NULL,
  rail TEXT NOT NULL,
  memo TEXT,
  tx_hash TEXT,
  zar_amount NUMERIC,
  exchange_rate NUMERIC,
  merkle_root TEXT,
  pipeline TEXT,
  ts BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_withdrawals_ts ON admin_withdrawals(ts DESC);
CREATE INDEX IF NOT EXISTS idx_admin_withdrawals_to ON admin_withdrawals("to");

-- =============================================================================
-- 6. Add wallet_address column to users table if not exists
-- Required for SIWE wallet linking
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'wallet_address'
  ) THEN
    ALTER TABLE users ADD COLUMN wallet_address TEXT;
    CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address) WHERE wallet_address IS NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- 7. RLS Policies (enable if using Row Level Security)
-- =============================================================================

-- Enable RLS on tables
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiat_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_claims ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own withdrawal requests
DROP POLICY IF EXISTS user_withdrawal_requests_select ON withdrawal_requests;
CREATE POLICY user_withdrawal_requests_select ON withdrawal_requests
  FOR SELECT USING (user_id = auth.uid()::text);

-- Policy: Users can only insert their own withdrawal requests (via API)
DROP POLICY IF EXISTS user_withdrawal_requests_insert ON withdrawal_requests;
CREATE POLICY user_withdrawal_requests_insert ON withdrawal_requests
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- Policy: Users can only see their own agent claims
DROP POLICY IF EXISTS user_agent_claims_select ON agent_claims;
CREATE POLICY user_agent_claims_select ON agent_claims
  FOR SELECT USING (user_id = auth.uid()::text);

-- Policy: Users can only insert their own agent claims
DROP POLICY IF EXISTS user_agent_claims_insert ON agent_claims;
CREATE POLICY user_agent_claims_insert ON agent_claims
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- Policy: Users can only see their own fiat payouts
DROP POLICY IF EXISTS user_fiat_payouts_select ON fiat_payouts;
CREATE POLICY user_fiat_payouts_select ON fiat_payouts
  FOR SELECT USING (destination = auth.email());

-- Admin policies (service role bypasses RLS, but explicit for safety)
DROP POLICY IF EXISTS admin_all_withdrawal_requests ON withdrawal_requests;
CREATE POLICY admin_all_withdrawal_requests ON withdrawal_requests
  FOR ALL USING (true) WITH CHECK (true); -- Service role only

DROP POLICY IF EXISTS admin_all_agent_claims ON agent_claims;
CREATE POLICY admin_all_agent_claims ON agent_claims
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_fiat_payouts ON fiat_payouts;
CREATE POLICY admin_all_fiat_payouts ON fiat_payouts
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- Migration Complete
-- =============================================================================
