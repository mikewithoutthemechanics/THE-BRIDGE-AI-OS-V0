-- Zero-Trust Verification Layer: payment proofs + Merkle anchors
-- Run via: npx supabase db query --project-ref sdkysuvmtqjqopmdpvoz < this_file.sql

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
