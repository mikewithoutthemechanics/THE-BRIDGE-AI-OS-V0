-- 005_affiliate_system.sql
-- Affiliate tracking tables: clicks, events, commissions, withdrawals
-- Requires: 002_consolidate_referrals.sql (unified_referrals must exist)

-- Per-referrer profile (one row per affiliate user, stores their code + payout prefs)
CREATE TABLE IF NOT EXISTS affiliate_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  referral_code VARCHAR(255) UNIQUE NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 25.00,
  tier VARCHAR(50) DEFAULT 'standard' CHECK (tier IN ('standard', 'gold', 'platinum')),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_profiles_user ON affiliate_profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_profiles_code ON affiliate_profiles(referral_code);

-- Click events (one row per unique referral link visit)
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id SERIAL PRIMARY KEY,
  referral_code VARCHAR(255) REFERENCES affiliate_profiles(referral_code) ON DELETE CASCADE,
  click_id VARCHAR(255) UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  referrer_url TEXT,
  landing_page VARCHAR(500),
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  converted_at TIMESTAMP WITH TIME ZONE NULL,
  conversion_value DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_code ON affiliate_clicks(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created ON affiliate_clicks(created_at);

-- Signup/conversion events tied to a click or referral code
CREATE TABLE IF NOT EXISTS affiliate_events (
  id SERIAL PRIMARY KEY,
  referral_code VARCHAR(255) REFERENCES affiliate_profiles(referral_code) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('click', 'signup', 'conversion', 'commission')),
  event_data JSONB DEFAULT '{}',
  click_id VARCHAR(255) REFERENCES affiliate_clicks(click_id) ON DELETE SET NULL,
  commission_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_affiliate_events_code ON affiliate_events(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_type ON affiliate_events(event_type);

-- Commission ledger (approved/paid/pending per referral)
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id SERIAL PRIMARY KEY,
  referral_code VARCHAR(255) REFERENCES affiliate_profiles(referral_code) ON DELETE CASCADE,
  event_id INTEGER REFERENCES affiliate_events(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP WITH TIME ZONE NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_code ON affiliate_commissions(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON affiliate_commissions(status);

-- Withdrawal requests
CREATE TABLE IF NOT EXISTS affiliate_withdrawals (
  id SERIAL PRIMARY KEY,
  referral_code VARCHAR(255) REFERENCES affiliate_profiles(referral_code) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  payout_method VARCHAR(100) DEFAULT 'bank_transfer',
  payout_details JSONB DEFAULT '{}',
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_withdrawals_code ON affiliate_withdrawals(referral_code);

-- Aggregate metrics function (used by /api/affiliate/me)
CREATE OR REPLACE FUNCTION get_affiliate_metrics(code VARCHAR(255))
RETURNS TABLE (
  total_clicks     BIGINT,
  total_signups    BIGINT,
  total_conversions BIGINT,
  total_commission DECIMAL(10,2),
  available_balance DECIMAL(10,2),
  pending_balance  DECIMAL(10,2),
  total_withdrawn  DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT COUNT(*) FROM affiliate_clicks WHERE referral_code = code), 0),
    COALESCE((SELECT COUNT(*) FROM affiliate_events WHERE referral_code = code AND event_type = 'signup'), 0),
    COALESCE((SELECT COUNT(*) FROM affiliate_events WHERE referral_code = code AND event_type = 'conversion'), 0),
    COALESCE((SELECT SUM(amount) FROM affiliate_commissions WHERE referral_code = code), 0),
    COALESCE((SELECT SUM(amount) FROM affiliate_commissions WHERE referral_code = code AND status = 'approved'), 0),
    COALESCE((SELECT SUM(amount) FROM affiliate_commissions WHERE referral_code = code AND status = 'pending'), 0),
    COALESCE((SELECT SUM(amount) FROM affiliate_withdrawals WHERE referral_code = code AND status = 'paid'), 0);
END;
$$ LANGUAGE plpgsql;

-- Trigger: auto-update updated_at on affiliate_profiles
CREATE TRIGGER update_affiliate_profiles_updated_at
  BEFORE UPDATE ON affiliate_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
