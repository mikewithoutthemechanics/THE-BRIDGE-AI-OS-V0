-- AEOS Lifecycle + CRM Ownership Migration v1
-- Run in: Supabase Dashboard → SQL Editor → New Query

-- Lifecycle columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT uninitialized;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_id UUID;

-- CRM ownership
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT ryanpcowan@gmail.com;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to UUID;

-- Activate paid users
UPDATE users SET lifecycle_status = active WHERE plan IN (pro,business,enterprise,platform,sovereign) AND (lifecycle_status IS NULL OR lifecycle_status = uninitialized);

-- Activate Ryan
UPDATE users SET lifecycle_status = active WHERE email = ryanpcowan@gmail.com;

-- Bypass free-plan users: set profile_complete so they just need plan selection
UPDATE users SET lifecycle_status = profile_complete WHERE plan = free AND name IS NOT NULL AND lifecycle_status = uninitialized;

-- Lead ownership trigger (DB-level, unbypassable)
CREATE OR REPLACE FUNCTION enforce_lead_owner() RETURNS trigger AS $$
BEGIN NEW.owner := ryanpcowan@gmail.com; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS lead_owner_trigger ON leads;
CREATE TRIGGER lead_owner_trigger BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION enforce_lead_owner();

-- Lifecycle status constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_lifecycle_status;
ALTER TABLE users ADD CONSTRAINT valid_lifecycle_status CHECK (lifecycle_status IN (uninitialized,profile_complete,tier_selected,active));
