-- ConsentVault OSINT Stack - Database Schema
-- PostgreSQL migrations for Consent Ledger

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Subject table
CREATE TABLE IF NOT EXISTS subject (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) UNIQUE NOT NULL,
    legal_name_token VARCHAR(512),
    email_token VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_demo BOOLEAN DEFAULT true
);

-- Consent record table
CREATE TABLE IF NOT EXISTS consent_record (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id UUID NOT NULL REFERENCES subject(id),
    consent_type VARCHAR(100) NOT NULL,
    purpose VARCHAR(500) NOT NULL,
    consent_scope JSONB NOT NULL DEFAULT '{}',
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    consent_receipt VARCHAR(512),
    is_demo BOOLEAN DEFAULT true
);

-- Source table for OSINT tools
CREATE TABLE IF NOT EXISTS source (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    base_url VARCHAR(500),
    is_demo BOOLEAN DEFAULT true,
    scraping_config JSONB DEFAULT '{}'
);

-- Data record table
CREATE TABLE IF NOT EXISTS data_record (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id UUID NOT NULL REFERENCES subject(id),
    source_id UUID REFERENCES source(id),
    record_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    collection_method VARCHAR(50) DEFAULT 'demo',
    consent_id UUID REFERENCES consent_record(id),
    is_demo BOOLEAN DEFAULT true
);

-- Data use agreement table
CREATE TABLE IF NOT EXISTS data_use_agreement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consent_id UUID NOT NULL REFERENCES consent_record(id),
    buyer_id VARCHAR(255) NOT NULL,
    permitted_uses TEXT NOT NULL,
    agreed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    can_reidentify BOOLEAN DEFAULT false,
    dp_parameters JSONB DEFAULT '{}'
);

-- Data product table
CREATE TABLE IF NOT EXISTS data_product (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    aggregation_level VARCHAR(50) NOT NULL,
    k_anonymity_min INTEGER DEFAULT 5,
    dp_epsilon FLOAT DEFAULT 1.0,
    included_sources JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active'
);

-- Purchase event table
CREATE TABLE IF NOT EXISTS purchase_event (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES data_product(id),
    buyer_id VARCHAR(255) NOT NULL,
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'pending',
    transaction_details JSONB DEFAULT '{}'
);

-- Audit log table
CREATE TABLE IF NOT EXISTS consent_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    subject_id UUID REFERENCES subject(id),
    performed_by VARCHAR(255),
    ip_address INET,
    event_details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subject_external_id ON subject(external_id);
CREATE INDEX IF NOT EXISTS idx_subject_is_demo ON subject(is_demo);

CREATE INDEX IF NOT EXISTS idx_consent_subject ON consent_record(subject_id);
CREATE INDEX IF NOT EXISTS idx_consent_status ON consent_record(status);
CREATE INDEX IF NOT EXISTS idx_consent_granted ON consent_record(granted_at);

CREATE INDEX IF NOT EXISTS idx_data_subject ON data_record(subject_id);
CREATE INDEX IF NOT EXISTS idx_data_source ON data_record(source_id);
CREATE INDEX IF NOT EXISTS idx_data_type ON data_record(record_type);

CREATE INDEX IF NOT EXISTS idx_audit_subject ON consent_audit_log(subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON consent_audit_log(created_at);

-- Insert demo data
INSERT INTO subject (id, external_id, is_demo) 
VALUES 
  (uuid_generate_v4(), 'demo-subject-001', true),
  (uuid_generate_v4(), 'demo-subject-002', true),
  (uuid_generate_v4(), 'demo-subject-003', true)
ON CONFLICT (external_id) DO NOTHING;

-- Insert demo consent records
INSERT INTO consent_record (subject_id, consent_type, purpose, status, is_demo)
SELECT id, 'osint_collection', 'Demo digital footprint mapping', 'active', true
FROM subject WHERE is_demo = true
ON CONFLICT DO NOTHING;

-- Insert demo sources
INSERT INTO source (name, type, is_demo) VALUES
  ('Sherlock', 'consented', true),
  ('Maigret', 'consented', true),
  ('SpiderFoot', 'consented', true),
  ('Holehe', 'consented', true),
  ('GHunt', 'consented', true)
ON CONFLICT DO NOTHING;

-- Insert demo data product
INSERT INTO data_product (name, aggregation_level, status) VALUES
  ('Demo Aggregate Dataset', 'aggregate', 'active')
ON CONFLICT DO NOTHING;
