-- DATABASE SCHEMA: Agent Revenue System (PostgreSQL for Supabase)
-- Run this in Supabase SQL Editor

-- 1. Agent Wallets
CREATE TABLE IF NOT EXISTS agent_wallets (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL UNIQUE,
  balance DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agent Wallet Transactions
CREATE TABLE IF NOT EXISTS agent_wallet_transactions (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('credit','debit')),
  source VARCHAR(255),
  reason VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_awt_agent ON agent_wallet_transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_awt_created ON agent_wallet_transactions(created_at);

-- 3. A2A Services (Marketplace)
CREATE TABLE IF NOT EXISTS a2a_services (
  service_id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price_per_unit DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50) DEFAULT 'task',
  category VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','paused')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_agent ON a2a_services(agent_id);
CREATE INDEX IF NOT EXISTS idx_a2a_cat ON a2a_services(category);
CREATE INDEX IF NOT EXISTS idx_a2a_status ON a2a_services(status);

-- 4. A2A Transactions
CREATE TABLE IF NOT EXISTS a2a_transactions (
  id SERIAL PRIMARY KEY,
  service_id INT NOT NULL,
  buyer_agent_id VARCHAR(255) NOT NULL,
  seller_agent_id VARCHAR(255) NOT NULL,
  units INT DEFAULT 1,
  total_price DECIMAL(15,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending','completed','refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2at_service ON a2a_transactions(service_id);
CREATE INDEX IF NOT EXISTS idx_a2at_buyer ON a2a_transactions(buyer_agent_id);
CREATE INDEX IF NOT EXISTS idx_a2at_seller ON a2a_transactions(seller_agent_id);

-- 5. Revenue Triggers
CREATE TABLE IF NOT EXISTS revenue_triggers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  rate_per_event DECIMAL(10,2) NOT NULL,
  target_user_id VARCHAR(255),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rt_event ON revenue_triggers(event_type);
CREATE INDEX IF NOT EXISTS idx_rt_agent ON revenue_triggers(agent_id);

-- 6. Revenue Transactions
CREATE TABLE IF NOT EXISTS revenue_transactions (
  id SERIAL PRIMARY KEY,
  trigger_id INT NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  event_context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rev_user ON revenue_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_rev_agent ON revenue_transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_rev_created ON revenue_transactions(created_at);