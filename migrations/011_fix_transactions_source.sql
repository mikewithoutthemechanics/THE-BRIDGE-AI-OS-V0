-- Add missing source column to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT;
