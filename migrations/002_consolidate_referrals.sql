-- 002_consolidate_referrals.sql
-- Unify all referral systems into single PostgreSQL table

-- Create unified referrals table
CREATE TABLE IF NOT EXISTS unified_referrals (
  id SERIAL PRIMARY KEY,
  referrer_user_id INTEGER REFERENCES users(id),
  referred_user_id INTEGER REFERENCES users(id),
  referral_code VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'paid', 'failed')),
  commission_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  claimed_at TIMESTAMP WITH TIME ZONE NULL,
  paid_at TIMESTAMP WITH TIME ZONE NULL,
  metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_code ON unified_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrer_user ON unified_referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referred_user ON unified_referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_status ON unified_referrals(status);
CREATE INDEX IF NOT EXISTS idx_referral_created ON unified_referrals(created_at);

-- Insert trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_unified_referrals_updated_at
    BEFORE UPDATE ON unified_referrals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration queries (execute after users table is populated):
-- INSERT INTO unified_referrals (referrer_user_id, referred_user_id, referral_code, status, commission_amount, created_at)
-- SELECT ... FROM bridgeos_referrals_data ...
-- INSERT INTO unified_referrals ... FROM vps_referral_data ...
-- INSERT INTO unified_referrals ... FROM bridgeai_referral_data ...