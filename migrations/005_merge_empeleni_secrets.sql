-- Migration 005: Merge empeleni.db tables into unified users.db + add secrets_vault
-- payments table already exists from 003 — add missing empeleni columns

-- ===== EMPELENI CLIENTS TABLE =====
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  service TEXT,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== ADD EMPELENI COLUMNS TO EXISTING PAYMENTS =====
-- reference and pf_payment_id are used by PayFast integration
ALTER TABLE payments ADD COLUMN reference TEXT;
ALTER TABLE payments ADD COLUMN pf_payment_id TEXT;
ALTER TABLE payments ADD COLUMN client TEXT;

-- ===== SECRETS VAULT (replaces Supabase secrets_vault) =====
CREATE TABLE IF NOT EXISTS secrets_vault (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_name TEXT UNIQUE NOT NULL,
  key_value TEXT NOT NULL,
  service TEXT DEFAULT 'API',
  status TEXT DEFAULT 'active',
  updated_by TEXT DEFAULT 'system',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== NOTION SYNC TRACKING =====
CREATE TABLE IF NOT EXISTS notion_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  notion_page_id TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(table_name, record_id)
);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_secrets_vault_key ON secrets_vault(key_name);
CREATE INDEX IF NOT EXISTS idx_notion_sync ON notion_sync_log(table_name, record_id);
