-- 006_affiliate_addons.sql
-- Additive migration: adds withdrawals table + tier column + updates metric function.
-- Safe to re-run (all idempotent). Requires 005 tables to already exist OR
-- affiliate_referrals table from the economy_db schema.

BEGIN;

-- Add tier column to affiliate_referrals if missing
ALTER TABLE affiliate_referrals
  ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'standard';

-- Withdrawals table (FK to affiliate_referrals)
CREATE TABLE IF NOT EXISTS affiliate_withdrawals (
  id              SERIAL PRIMARY KEY,
  referral_code   VARCHAR(255) REFERENCES affiliate_referrals(referral_code) ON DELETE CASCADE,
  amount          DECIMAL(10,2) NOT NULL,
  status          VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
  payout_method   VARCHAR(100) DEFAULT 'bank_transfer',
  payout_details  JSONB DEFAULT '{}',
  requested_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at    TIMESTAMP WITH TIME ZONE NULL,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_withdrawals_code   ON affiliate_withdrawals(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_withdrawals_status ON affiliate_withdrawals(status);

-- Update get_affiliate_metrics() to include total_withdrawn
CREATE OR REPLACE FUNCTION get_affiliate_metrics(referral_code_param VARCHAR(255))
RETURNS TABLE (
  total_clicks      BIGINT,
  total_signups     BIGINT,
  total_conversions BIGINT,
  total_commission  DECIMAL(10,2),
  available_balance DECIMAL(10,2),
  pending_balance   DECIMAL(10,2),
  total_withdrawn   DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT COUNT(*) FROM affiliate_clicks  WHERE referral_code = referral_code_param), 0),
    COALESCE((SELECT COUNT(*) FROM affiliate_events  WHERE referral_code = referral_code_param AND event_type = 'signup'), 0),
    COALESCE((SELECT COUNT(*) FROM affiliate_events  WHERE referral_code = referral_code_param AND event_type = 'conversion'), 0),
    COALESCE((SELECT SUM(amount) FROM affiliate_commissions WHERE referral_code = referral_code_param), 0),
    COALESCE((SELECT SUM(amount) FROM affiliate_commissions WHERE referral_code = referral_code_param AND status = 'approved'), 0),
    COALESCE((SELECT SUM(amount) FROM affiliate_commissions WHERE referral_code = referral_code_param AND status = 'pending'), 0),
    COALESCE((SELECT SUM(amount) FROM affiliate_withdrawals  WHERE referral_code = referral_code_param AND status = 'paid'), 0);
END;
$$ LANGUAGE plpgsql;

COMMIT;
