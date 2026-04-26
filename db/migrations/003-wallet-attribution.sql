/**
 * Migration: Wallet Identity + Attribution Events
 * Adds identity linking (user → crypto wallets) and event attribution layer
 *
 * Run in Supabase SQL editor
 */

-- ── WALLET IDENTITIES ─────────────────────────────────────────────────────────
-- Links users to blockchain addresses (ethereum, linea, solana, etc)
-- One user can own multiple wallets across different chains

CREATE TABLE IF NOT EXISTS wallet_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL, -- 'ethereum', 'linea', 'solana', 'polygon', etc
  verified_at TIMESTAMP,
  verification_signature TEXT, -- store how it was verified (for audit)
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, wallet_address, chain)
);

CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_address ON wallet_identities(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_chain ON wallet_identities(chain);

-- ── ATTRIBUTION EVENTS ────────────────────────────────────────────────────────
-- Every significant action (model output, idea submission, etc) is logged here
-- This creates an auditable trail and economic trigger point

CREATE TABLE IF NOT EXISTS attribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'neurolink_output', 'idea_submitted', 'model_inference', etc
  reference_id TEXT, -- link to object ID (output ID, idea ID, etc)

  -- Extracted columns for performance (also kept in metadata for flexibility)
  tokens_used INT,
  quality_score FLOAT,

  -- Metadata JSONB for extension
  metadata JSONB DEFAULT '{}',

  -- Economic tracking
  rewarded_at TIMESTAMP, -- when/if this event triggered a payout
  reward_amount NUMERIC, -- amount paid out (if applicable)

  -- Idempotency (prevent double-rewards)
  idempotency_key TEXT UNIQUE,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attribution_user ON attribution_events(user_id);
CREATE INDEX IF NOT EXISTS idx_attribution_type ON attribution_events(event_type);
CREATE INDEX IF NOT EXISTS idx_attribution_created ON attribution_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_unrewarded
  ON attribution_events(rewarded_at)
  WHERE rewarded_at IS NULL;

-- For finding recent unrewarded events by type
CREATE INDEX IF NOT EXISTS idx_attribution_unrewarded_type_time
  ON attribution_events(event_type, created_at DESC)
  WHERE rewarded_at IS NULL;

-- ── RLS Policies (optional, if using row-level security) ─────────────────────
-- ALTER TABLE wallet_identities ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY wallet_own ON wallet_identities
--   FOR SELECT USING (auth.uid()::uuid = user_id);

-- ── Helper Functions ──────────────────────────────────────────────────────────

-- Get user's unrewarded events (for reward processing)
CREATE OR REPLACE FUNCTION get_unrewarded_events(
  p_event_type TEXT DEFAULT NULL,
  p_since TIMESTAMP DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  event_type TEXT,
  reference_id TEXT,
  tokens_used INT,
  quality_score FLOAT,
  metadata JSONB,
  created_at TIMESTAMP
) AS $$
  SELECT
    ae.id,
    ae.user_id,
    ae.event_type,
    ae.reference_id,
    ae.tokens_used,
    ae.quality_score,
    ae.metadata,
    ae.created_at
  FROM attribution_events ae
  WHERE ae.rewarded_at IS NULL
    AND (p_event_type IS NULL OR ae.event_type = p_event_type)
    AND (p_since IS NULL OR ae.created_at >= p_since)
  ORDER BY ae.created_at DESC;
$$ LANGUAGE SQL;

-- Get event stats by user
CREATE OR REPLACE FUNCTION get_user_event_stats(p_user_id UUID)
RETURNS TABLE (
  total_events INT,
  total_tokens INT,
  avg_quality FLOAT,
  unrewarded_count INT,
  last_event_at TIMESTAMP
) AS $$
  SELECT
    COUNT(*)::INT as total_events,
    COALESCE(SUM(ae.tokens_used), 0)::INT as total_tokens,
    ROUND(AVG(ae.quality_score)::NUMERIC, 2)::FLOAT as avg_quality,
    COUNT(*) FILTER (WHERE ae.rewarded_at IS NULL)::INT as unrewarded_count,
    MAX(ae.created_at) as last_event_at
  FROM attribution_events ae
  WHERE ae.user_id = p_user_id;
$$ LANGUAGE SQL;
