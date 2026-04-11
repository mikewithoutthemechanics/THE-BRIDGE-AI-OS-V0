-- ============================================================
-- Bridge AI OS — Missing Tables Migration
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Generated 2026-04-11
--
-- These tables are NOT in supabase-schema.sql and are required
-- by: proof-store, treasury-withdraw, auth-merkle, digital twin
-- console, wallet attribution, and admin withdrawal system.
-- ============================================================

-- ── ZERO-TRUST: Payment Proofs (append-only hash chain) ─────
CREATE TABLE IF NOT EXISTS payment_proofs (
  transaction_id TEXT PRIMARY KEY,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  source TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  previous_hash TEXT NOT NULL,
  proof_signature TEXT NOT NULL,
  webhook_id TEXT,
  webhook_signature JSONB,
  raw_meta JSONB,
  merkle_anchor_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proofs_created ON payment_proofs(created_at);
CREATE INDEX IF NOT EXISTS idx_proofs_source ON payment_proofs(source);
CREATE INDEX IF NOT EXISTS idx_proofs_anchor ON payment_proofs(merkle_anchor_id);

-- ── ZERO-TRUST: Merkle Anchors (batched roots) ─────────────
CREATE TABLE IF NOT EXISTS merkle_anchors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  leaf_count INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  first_tx TEXT NOT NULL,
  last_tx TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  anchored_on_chain BOOLEAN DEFAULT FALSE,
  chain_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── TREASURY: Admin Withdrawals (audit trail) ──────────────
CREATE TABLE IF NOT EXISTS admin_withdrawals (
  id TEXT PRIMARY KEY,
  "to" TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  fee NUMERIC DEFAULT 0,
  net NUMERIC DEFAULT 0,
  rail TEXT NOT NULL DEFAULT 'brdg',
  memo TEXT DEFAULT '',
  tx_hash TEXT,
  zar_amount NUMERIC,
  exchange_rate NUMERIC,
  merkle_root TEXT,
  pipeline TEXT,
  admin TEXT DEFAULT 'admin',
  status TEXT DEFAULT 'completed',
  ts BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_wd_ts ON admin_withdrawals(ts);
CREATE INDEX IF NOT EXISTS idx_admin_wd_rail ON admin_withdrawals(rail);

-- ── TREASURY: Withdrawal Claims (Merkle double-spend prevention) ──
CREATE TABLE IF NOT EXISTS withdrawal_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  leaf_index INTEGER NOT NULL,
  claimant TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  rail TEXT NOT NULL,
  tx_hash TEXT,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merkle_root, leaf_index)
);

CREATE INDEX IF NOT EXISTS idx_claims_root ON withdrawal_claims(merkle_root);
CREATE INDEX IF NOT EXISTS idx_claims_claimant ON withdrawal_claims(claimant);

-- ── TREASURY: Fiat Payout Queue (EFT/PayFast off-ramp) ────
CREATE TABLE IF NOT EXISTS fiat_payouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payout_id TEXT NOT NULL UNIQUE,
  rail TEXT NOT NULL,
  brdg_amount NUMERIC NOT NULL,
  zar_amount NUMERIC NOT NULL,
  exchange_rate NUMERIC NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  processed_at TIMESTAMPTZ,
  bank_reference TEXT,
  queued_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_status ON fiat_payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_rail ON fiat_payouts(rail);

-- ── WALLET IDENTITIES (user → crypto wallet linking) ───────
CREATE TABLE IF NOT EXISTS wallet_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  verification_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, wallet_address, chain)
);

CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_address ON wallet_identities(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_chain ON wallet_identities(chain);

-- ── ATTRIBUTION EVENTS (economic trigger points) ───────────
CREATE TABLE IF NOT EXISTS attribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  event_type TEXT NOT NULL,
  reference_id TEXT,
  tokens_used INTEGER,
  quality_score DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  rewarded_at TIMESTAMPTZ,
  reward_amount NUMERIC,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attribution_user ON attribution_events(user_id);
CREATE INDEX IF NOT EXISTS idx_attribution_type ON attribution_events(event_type);
CREATE INDEX IF NOT EXISTS idx_attribution_created ON attribution_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_unrewarded ON attribution_events(rewarded_at) WHERE rewarded_at IS NULL;

-- ── DIGITAL TWIN: Missions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_to TEXT,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);

-- ── DIGITAL TWIN: SDG Goals ────────────────────────────────
CREATE TABLE IF NOT EXISTS sdg_goals (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  progress DOUBLE PRECISION DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed SDG goals
INSERT INTO sdg_goals (id, name, progress) VALUES
  (1,  'No Poverty', 0.12),
  (4,  'Quality Education', 0.08),
  (8,  'Decent Work', 0.15),
  (9,  'Industry Innovation', 0.22),
  (10, 'Reduced Inequalities', 0.05),
  (17, 'Partnerships', 0.10)
ON CONFLICT (id) DO NOTHING;

-- ── DIGITAL TWIN: Command Queue ────────────────────────────
CREATE TABLE IF NOT EXISTS command_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  command TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cmdq_status ON command_queue(status);

-- ── DIGITAL TWIN: Speech Log ───────────────────────────────
CREATE TABLE IF NOT EXISTS twin_speech_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── AUTH: Audit Log (Merkle-backed) ────────────────────────
CREATE TABLE IF NOT EXISTS auth_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leaf_hash TEXT NOT NULL,
  leaf_data JSONB NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  ip TEXT,
  metadata JSONB,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_action ON auth_audit(action);

CREATE TABLE IF NOT EXISTS auth_merkle_root (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  root_hash TEXT NOT NULL,
  leaf_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── HELPER FUNCTIONS ───────────────────────────────────────

-- Get unrewarded attribution events
CREATE OR REPLACE FUNCTION get_unrewarded_events(
  p_event_type TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID, user_id TEXT, event_type TEXT, reference_id TEXT,
  tokens_used INTEGER, quality_score DOUBLE PRECISION,
  metadata JSONB, created_at TIMESTAMPTZ
) AS $$
  SELECT ae.id, ae.user_id, ae.event_type, ae.reference_id,
         ae.tokens_used, ae.quality_score, ae.metadata, ae.created_at
  FROM attribution_events ae
  WHERE ae.rewarded_at IS NULL
    AND (p_event_type IS NULL OR ae.event_type = p_event_type)
    AND (p_since IS NULL OR ae.created_at >= p_since)
  ORDER BY ae.created_at DESC;
$$ LANGUAGE SQL;

-- Get user event stats
CREATE OR REPLACE FUNCTION get_user_event_stats(p_user_id TEXT)
RETURNS TABLE (
  total_events INTEGER, total_tokens INTEGER,
  avg_quality DOUBLE PRECISION, unrewarded_count INTEGER,
  last_event_at TIMESTAMPTZ
) AS $$
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(ae.tokens_used), 0)::INTEGER,
    ROUND(AVG(ae.quality_score)::NUMERIC, 2)::DOUBLE PRECISION,
    COUNT(*) FILTER (WHERE ae.rewarded_at IS NULL)::INTEGER,
    MAX(ae.created_at)
  FROM attribution_events ae
  WHERE ae.user_id = p_user_id;
$$ LANGUAGE SQL;

-- ============================================================
-- DONE — All missing tables created.
-- Total new tables: 13
-- Total new indexes: 20+
-- Total new functions: 2
-- ============================================================
