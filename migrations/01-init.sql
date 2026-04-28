-- Bridge AI OS - Database Initialization Script
-- Run this on first PostgreSQL boot to set up the schema

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS agents;
CREATE SCHEMA IF NOT EXISTS economy;
CREATE SCHEMA IF NOT EXISTS audit;

-- ============================================
-- AGENTS SCHEMA
-- ============================================
CREATE TABLE IF NOT EXISTS agents.registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'inactive',
    capabilities JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_agents_name ON agents.registry(name);
CREATE INDEX idx_agents_type ON agents.registry(type);
CREATE INDEX idx_agents_status ON agents.registry(status);

-- ============================================
-- ECONOMY SCHEMA
-- ============================================
CREATE TABLE IF NOT EXISTS economy.wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents.registry(id),
    address VARCHAR(255) NOT NULL UNIQUE,
    balance DECIMAL(20, 8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economy.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_agent UUID REFERENCES agents.registry(id),
    to_agent UUID REFERENCES agents.registry(id),
    amount DECIMAL(20, 8) NOT NULL,
    tx_hash VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transactions_from ON economy.transactions(from_agent);
CREATE INDEX idx_transactions_to ON economy.transactions(to_agent);
CREATE INDEX idx_transactions_status ON economy.transactions(status);

-- ============================================
-- AUDIT SCHEMA
-- ============================================
CREATE TABLE IF NOT EXISTS audit.logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents.registry(id),
    action VARCHAR(255) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_agent ON audit.logs(agent_id);
CREATE INDEX idx_audit_created ON audit.logs(created_at);

-- ============================================
-- TRIGGERS FOR auto-updated timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_update BEFORE UPDATE ON agents.registry
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER wallets_update BEFORE UPDATE ON economy.wallets
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER transactions_update BEFORE UPDATE ON economy.transactions
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================
-- INITIAL DATA (optional)
-- ============================================
INSERT INTO agents.registry (name, type, status, capabilities)
VALUES 
    ('SuperBrain', 'twin', 'active', '{"intelligence": true, "autonomy": true}'),
    ('OSINTAgent', 'osint', 'active', '{"research": true}'),
    ('BillingAgent', 'finance', 'active', '{"transactions": true, "accounting": true}')
ON CONFLICT DO NOTHING;
