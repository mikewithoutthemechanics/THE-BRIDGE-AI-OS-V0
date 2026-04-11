-- 001_namespace_interactions.sql
-- Separate conflicting interactions tables in PostgreSQL bridgedb

-- Create namespaced tables from existing interactions
CREATE TABLE IF NOT EXISTS ainode_interactions AS
SELECT * FROM interactions WHERE service_id LIKE 'ainode%';

CREATE TABLE IF NOT EXISTS node0_interactions AS
SELECT * FROM interactions WHERE service_id LIKE 'node0%';

-- Add service-specific columns if needed
ALTER TABLE ainode_interactions ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'ainode';
ALTER TABLE node0_interactions ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'node0';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ainode_interactions_timestamp ON ainode_interactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_node0_interactions_timestamp ON node0_interactions(timestamp);

-- Update application code to query the correct table:
-- ainode server: SELECT * FROM ainode_interactions WHERE ...
-- node0 server: SELECT * FROM node0_interactions WHERE ...

-- Drop old table after verification (manual step)
-- DROP TABLE interactions;