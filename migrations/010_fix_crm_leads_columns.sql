-- Add missing columns to crm_leads table
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS plan TEXT;
