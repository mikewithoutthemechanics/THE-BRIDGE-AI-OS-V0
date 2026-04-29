-- Add affiliate tracking tables to existing affiliate_referrals schema

-- Create affiliate click tracking table
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id SERIAL PRIMARY KEY,
  referral_code VARCHAR(255) REFERENCES affiliate_referrals(referral_code),
  click_id VARCHAR(255) UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  referrer_url TEXT,
  landing_page VARCHAR(500),
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_term VARCHAR(255),
  utm_content VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  converted_at TIMESTAMP WITH TIME ZONE NULL,
  conversion_value DECIMAL(10,2) DEFAULT 0
);

-- Create affiliate events table
CREATE TABLE IF NOT EXISTS affiliate_events (
  id SERIAL PRIMARY KEY,
  referral_code VARCHAR(255) REFERENCES affiliate_referrals(referral_code),
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('click', 'signup', 'conversion', 'commission')),
  event_data JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  referrer_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE NULL,
  commission_amount DECIMAL(10,2) DEFAULT 0
);

-- Create affiliate commissions table
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id SERIAL PRIMARY KEY,
  referral_code VARCHAR(255) REFERENCES affiliate_referrals(referral_code),
  event_id INTEGER REFERENCES affiliate_events(id),
  click_id VARCHAR(255) REFERENCES affiliate_clicks(click_id),
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  payout_date TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP WITH TIME ZONE NULL,
  notes TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_referral_code ON affiliate_clicks(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created ON affiliate_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_referral_code ON affiliate_events(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_type ON affiliate_events(event_type);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_created ON affiliate_events(created_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_referral_code ON affiliate_commissions(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON affiliate_commissions(status);

-- Function to calculate affiliate metrics for existing table
CREATE OR REPLACE FUNCTION get_affiliate_metrics(referral_code_param VARCHAR(255))
RETURNS TABLE (
  total_clicks BIGINT,
  total_signups BIGINT,
  total_conversions BIGINT,
  total_commission DECIMAL(10,2),
  available_balance DECIMAL(10,2),
  pending_balance DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(clicks.count, 0) as total_clicks,
    COALESCE(signups.count, 0) as total_signups,
    COALESCE(conversions.count, 0) as total_conversions,
    COALESCE(COALESCE(ar.total_earned, 0) + commissions.total, 0) as total_commission,
    COALESCE(commissions.approved, 0) as available_balance,
    COALESCE(commissions.pending, 0) as pending_balance
  FROM affiliate_referrals ar
  LEFT JOIN (SELECT referral_code, COUNT(*) as count FROM affiliate_clicks GROUP BY referral_code) clicks ON clicks.referral_code = ar.referral_code
  LEFT JOIN (SELECT referral_code, COUNT(*) as count FROM affiliate_events WHERE event_type = 'signup' GROUP BY referral_code) signups ON signups.referral_code = ar.referral_code
  LEFT JOIN (SELECT referral_code, COUNT(*) as count FROM affiliate_events WHERE event_type = 'conversion' GROUP BY referral_code) conversions ON conversions.referral_code = ar.referral_code
  LEFT JOIN (SELECT
               referral_code,
               SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as total,
               SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved,
               SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending
             FROM affiliate_commissions GROUP BY referral_code) commissions ON commissions.referral_code = ar.referral_code
  WHERE ar.referral_code = referral_code_param;
END;
$$ LANGUAGE plpgsql;

-- Function to process commission payments
CREATE OR REPLACE FUNCTION process_affiliate_commission(
  referral_code_param VARCHAR(255),
  amount_param DECIMAL(10,2),
  event_id_param INTEGER DEFAULT NULL,
  click_id_param VARCHAR(255) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  commission_id INTEGER;
BEGIN
  INSERT INTO affiliate_commissions (referral_code, event_id, click_id, amount, status)
  VALUES (referral_code_param, event_id_param, click_id_param, amount_param, 'pending')
  RETURNING id INTO commission_id;

  -- Update the affiliate_referrals total_earned
  UPDATE affiliate_referrals
  SET total_earned = COALESCE(total_earned, 0) + amount_param
  WHERE referral_code = referral_code_param;

  RETURN commission_id;
END;
$$ LANGUAGE plpgsql;