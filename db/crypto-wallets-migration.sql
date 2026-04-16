-- =============================================================================
-- Agent Crypto Wallet Registry
-- Stores public wallet addresses for every registered agent.
-- Private keys are NEVER stored — they are derived on demand from the master secret.
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_crypto_wallets (
  agent_id    TEXT        PRIMARY KEY,          -- matches agents.id in the agent registry
  agent_name  TEXT        NOT NULL DEFAULT '',  -- display name (denormalised for convenience)
  eth_address TEXT,                             -- Linea/ETH address (also used for BRDG ERC-20)
  btc_address TEXT,                             -- Bitcoin mainnet P2PKH address
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast address lookups
CREATE INDEX IF NOT EXISTS idx_acw_eth_address ON agent_crypto_wallets (eth_address);
CREATE INDEX IF NOT EXISTS idx_acw_btc_address ON agent_crypto_wallets (btc_address);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION acw_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acw_updated_at ON agent_crypto_wallets;
CREATE TRIGGER trg_acw_updated_at
  BEFORE UPDATE ON agent_crypto_wallets
  FOR EACH ROW EXECUTE FUNCTION acw_set_updated_at();

-- RLS: service role has full access; authenticated role can only read
ALTER TABLE agent_crypto_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full_access" ON agent_crypto_wallets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON agent_crypto_wallets
  FOR SELECT TO authenticated USING (true);
