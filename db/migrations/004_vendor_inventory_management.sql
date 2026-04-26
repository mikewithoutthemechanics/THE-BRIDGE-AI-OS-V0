-- 004_vendor_inventory_management.sql
-- Vendor and Inventory management for Bridge AI OS
-- Supports Linea on-chain registry integration with ERC-721/ERC-1155 hybrid

-- =============================================================================
-- VENDORS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- hosting, ai-provider, payment-processor, wallet-provider, blockchain, etc.
  contact TEXT,
  wallet_address TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  currency TEXT NOT NULL DEFAULT 'ZAR',
  spend_mtd DECIMAL(12,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for vendors
CREATE INDEX IF NOT EXISTS idx_vendors_type ON vendors(type);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_wallet ON vendors(wallet_address);

-- =============================================================================
-- INVENTORY TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- infrastructure, services, crypto, domain, software, telephony, compute, database, ai
  sku TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  cost DECIMAL(12,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  location TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for inventory
CREATE INDEX IF NOT EXISTS idx_inventory_vendor ON inventory(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);

-- =============================================================================
-- VENDOR ONCHAIN REGISTRY (Linea Blockchain Binding)
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendor_onchain_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  chain TEXT NOT NULL DEFAULT 'linea',
  standard TEXT NOT NULL CHECK (standard IN ('erc721', 'erc1155')), -- token standard
  token_id TEXT NOT NULL, -- on-chain token ID (string for flexibility)
  token_address TEXT NOT NULL, -- contract address on Linea
  wallet_address TEXT NOT NULL, -- owning wallet
  mint_status TEXT NOT NULL DEFAULT 'pending' CHECK (mint_status IN ('pending', 'minted', 'failed', 'retrying')),
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  tx_hash TEXT, -- transaction hash from mint
  metadata_uri TEXT, -- IPFS or HTTPS metadata endpoint
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, chain, standard),
  UNIQUE(token_id, chain)
);

-- Indexes for onchain registry
CREATE INDEX IF NOT EXISTS idx_onchain_vendor ON vendor_onchain_registry(vendor_id);
CREATE INDEX IF NOT EXISTS idx_onchain_token ON vendor_onchain_registry(token_id, chain);
CREATE INDEX IF NOT EXISTS idx_onchain_wallet ON vendor_onchain_registry(wallet_address);
CREATE INDEX IF NOT EXISTS idx_onchain_status ON vendor_onchain_registry(mint_status);

-- =============================================================================
-- MINT JOB QUEUE (Idempotent Worker Feed)
-- =============================================================================
CREATE TABLE IF NOT EXISTS mint_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('vendor_identity', 'inventory_asset', 'batch_update')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed', 'retrying')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  worker_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, job_type)
);

-- Indexes for mint jobs
CREATE INDEX IF NOT EXISTS idx_mint_jobs_vendor ON mint_jobs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_mint_jobs_status ON mint_jobs(status);
CREATE INDEX IF NOT EXISTS idx_mint_jobs_created ON mint_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mint_jobs_type ON mint_jobs(job_type);

-- =============================================================================
-- SYNC LOG (Audit Trail for All Vendor/Inventory Changes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendor_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'mint', 'sync')),
  source TEXT NOT NULL, -- 'manual', 'api', 'auto-import', 'linea-sync'
  user_id TEXT, -- who triggered this (if manual)
  changes JSONB, -- before/after diff
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sync log
CREATE INDEX IF NOT EXISTS idx_sync_log_vendor ON vendor_sync_log(vendor_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_inventory ON vendor_sync_log(inventory_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON vendor_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_action ON vendor_sync_log(action);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Function: Auto-enqueue mint job when vendor is created
CREATE OR REPLACE FUNCTION enqueue_vendor_mint_job()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO mint_jobs (vendor_id, job_type, payload)
  VALUES (
    NEW.id,
    'vendor_identity',
    jsonb_build_object(
      'vendor_id', NEW.id,
      'name', NEW.name,
      'type', NEW.type,
      'wallet_address', NEW.wallet_address,
      'currency', NEW.currency
    )
  )
  ON CONFLICT (vendor_id, job_type) DO NOTHING;

  -- Log the creation
  INSERT INTO vendor_sync_log (vendor_id, action, source, metadata)
  VALUES (NEW.id, 'create', 'api', jsonb_build_object('table', 'vendors'));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-enqueue inventory mint job when inventory item is created
CREATE OR REPLACE FUNCTION enqueue_inventory_mint_job()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO mint_jobs (vendor_id, job_type, payload)
  VALUES (
    NEW.vendor_id,
    'inventory_asset',
    jsonb_build_object(
      'vendor_id', NEW.vendor_id,
      'inventory_id', NEW.id,
      'name', NEW.name,
      'category', NEW.category,
      'sku', NEW.sku,
      'cost', NEW.cost,
      'currency', NEW.currency
    )
  )
  ON CONFLICT (vendor_id, job_type) DO NOTHING;

  -- Log the creation
  INSERT INTO vendor_sync_log (inventory_id, action, source, metadata)
  VALUES (NEW.id, 'create', 'api', jsonb_build_object('table', 'inventory'));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Vendors: auto-enqueue mint + update timestamp
DROP TRIGGER IF EXISTS trg_vendor_mint ON vendors;
CREATE TRIGGER trg_vendor_mint
  AFTER INSERT ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_vendor_mint_job();

DROP TRIGGER IF EXISTS trg_vendor_updated ON vendors;
CREATE TRIGGER trg_vendor_updated
  BEFORE UPDATE ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Inventory: auto-enqueue mint + update timestamp
DROP TRIGGER IF EXISTS trg_inventory_mint ON inventory;
CREATE TRIGGER trg_inventory_mint
  AFTER INSERT ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_inventory_mint_job();

DROP TRIGGER IF EXISTS trg_inventory_updated ON inventory;
CREATE TRIGGER trg_inventory_updated
  BEFORE UPDATE ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Vendor Onchain Registry: update timestamp
DROP TRIGGER IF EXISTS trg_onchain_updated ON vendor_onchain_registry;
CREATE TRIGGER trg_onchain_updated
  BEFORE UPDATE ON vendor_onchain_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Mint Jobs: update timestamp
DROP TRIGGER IF EXISTS trg_mint_jobs_updated ON mint_jobs;
CREATE TRIGGER trg_mint_jobs_updated
  BEFORE UPDATE ON mint_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (Optional - enable if needed)
-- =============================================================================

-- Enable RLS on vendors
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_onchain_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE mint_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_sync_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see vendors/inventory they own (via user_id in future)
-- For now, superadmin only - can be expanded later

-- =============================================================================
-- VIEWS FOR ADMIN DASHBOARD
-- =============================================================================

-- Vendor summary with inventory count and mint status
CREATE OR REPLACE VIEW vendor_dashboard_summary AS
SELECT 
  v.id,
  v.name,
  v.type,
  v.status,
  v.currency,
  v.spend_mtd,
  v.wallet_address,
  COUNT(i.id) as inventory_count,
  COUNT(DISTINCT vor.id) as onchain_identities,
  MAX(vor.mint_status) as mint_status,
  v.created_at,
  v.updated_at
FROM vendors v
LEFT JOIN inventory i ON i.vendor_id = v.id
LEFT JOIN vendor_onchain_registry vor ON vor.vendor_id = v.id
GROUP BY v.id;

-- Inventory summary with vendor info
CREATE OR REPLACE VIEW inventory_dashboard_summary AS
SELECT 
  i.id,
  i.name,
  i.category,
  i.sku,
  i.status,
  i.cost,
  i.currency,
  i.location,
  v.name as vendor_name,
  v.type as vendor_type,
  vor.mint_status,
  i.created_at,
  i.updated_at
FROM inventory i
JOIN vendors v ON v.id = i.vendor_id
LEFT JOIN vendor_onchain_registry vor ON vor.vendor_id = v.id
ORDER BY i.created_at DESC;

-- Pending mint jobs for worker queue
CREATE OR REPLACE VIEW pending_mint_jobs AS
SELECT 
  mj.id,
  mj.vendor_id,
  mj.job_type,
  mj.payload,
  mj.status,
  mj.attempts,
  mj.created_at,
  v.name as vendor_name,
  v.wallet_address
FROM mint_jobs mj
JOIN vendors v ON v.id = mj.vendor_id
WHERE mj.status IN ('queued', 'retrying')
ORDER BY mj.created_at ASC;

-- =============================================================================
-- SAMPLE DATA (for testing - comment out in production)
-- =============================================================================

-- Uncomment to seed test data:
-- INSERT INTO vendors (name, type, contact, status, currency) VALUES
--   ('WebWay Hosting', 'hosting', 'support@webway.host', 'active', 'ZAR'),
--   ('Anthropic', 'ai-provider', 'api@anthropic.com', 'active', 'USD'),
--   ('OpenAI', 'ai-provider', 'api@openai.com', 'active', 'USD'),
--   ('PayFast', 'payment-processor', 'support@payfast.co.za', 'active', 'ZAR'),
--   ('Paystack', 'payment-processor', 'support@paystack.com', 'active', 'ZAR'),
--   ('MetaMask', 'wallet-provider', 'support@metamask.io', 'active', 'USD'),
--   ('Linea', 'blockchain', 'support@linea.build', 'active', 'ETH');

-- INSERT INTO inventory (vendor_id, name, category, sku, cost, currency, status) 
-- SELECT v.id, 
--        CASE v.type
--          WHEN 'hosting' THEN 'VPS 4-Core Server'
--          WHEN 'ai-provider' THEN 'AI API Credits Bundle'
--          WHEN 'payment-processor' THEN 'Payment Processing Credits'
--          WHEN 'wallet-provider' THEN 'Wallet Service Credits'
--          WHEN 'blockchain' THEN 'Gas Fee Credits'
--          ELSE 'Service Credit'
--        END,
--        CASE v.type
--          WHEN 'hosting' THEN 'infrastructure'
--          WHEN 'ai-provider' THEN 'services'
--          WHEN 'payment-processor' THEN 'services'
--          WHEN 'wallet-provider' THEN 'services'
--          WHEN 'blockchain' THEN 'crypto'
--          ELSE 'services'
--        END,
--        'SKU-' || UPPER(SUBSTRING(v.name, 1, 3)) || '-' || v.id::text[1:8],
--        0, v.currency, 'active'
-- FROM vendors v;
