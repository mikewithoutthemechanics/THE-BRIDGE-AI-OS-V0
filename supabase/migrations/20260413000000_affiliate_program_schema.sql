-- ============================================================================
-- BRIDGE AI OS — Affiliate Program Schema
-- 10% commission, 30-day cookie, ZAR payouts, multi-tenant
-- ============================================================================

-- Affiliate profiles
CREATE TABLE IF NOT EXISTS affiliates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  code        TEXT NOT NULL UNIQUE,           -- referral code (e.g., "BRIDGE20")
  tier        TEXT DEFAULT 'bronze',          -- bronze, silver, gold, platinum
  commission_pct NUMERIC DEFAULT 10,          -- commission percentage
  cookie_days INTEGER DEFAULT 30,             -- attribution window
  total_clicks INTEGER DEFAULT 0,
  total_signups INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  total_paid   NUMERIC DEFAULT 0,
  pending_payout NUMERIC DEFAULT 0,
  status      TEXT DEFAULT 'active',          -- active, suspended, terminated
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_company ON affiliates(company_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(code);
CREATE INDEX IF NOT EXISTS idx_affiliates_email ON affiliates(email);

-- Affiliate clicks (for attribution)
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ip_address  INET,
  user_agent  TEXT,
  referrer    TEXT,
  landing_page TEXT,
  click_id    TEXT UNIQUE,                    -- unique identifier for deduplication
  converted  BOOLEAN DEFAULT false,
  converted_at TIMESTAMPTZ,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate ON affiliate_clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_company ON affiliate_clicks(company_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_click_id ON affiliate_clicks(click_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created ON affiliate_clicks(created_at);

-- Affiliate commissions (earnings tracking)
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount      NUMERIC NOT NULL,               -- commission amount in ZAR
  source      TEXT NOT NULL,                  -- subscription, upgrade, referral, etc.
  reference_id TEXT,                          -- transaction ID or invoice number
  status      TEXT DEFAULT 'pending',         -- pending, approved, paid, cancelled
  paid_at     TIMESTAMPTZ,
  payout_id   UUID,                           -- FK to affiliate_payouts if batched
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate ON affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_company ON affiliate_commissions(company_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON affiliate_commissions(status);

-- Affiliate payouts (batch payments)
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount      NUMERIC NOT NULL,
  currency    TEXT DEFAULT 'ZAR',
  method      TEXT DEFAULT 'eft',             -- eft, paypal, crypto, etc.
  reference   TEXT,                           -- bank reference or tx hash
  status      TEXT DEFAULT 'pending',         -- pending, processing, completed, failed
  processed_at TIMESTAMPTZ,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate ON affiliate_payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_company ON affiliate_payouts(company_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status ON affiliate_payouts(status);

-- Creative assets for affiliates
CREATE TABLE IF NOT EXISTS affiliate_creatives (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,                  -- banner, text, email, landing_page
  format      TEXT,                           -- 728x90, 300x250, etc.
  content     TEXT NOT NULL,                  -- URL, HTML, or text content
  clicks      INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active',
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_creatives_company ON affiliate_creatives(company_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_creatives_type ON affiliate_creatives(type);

-- RLS Policies (multi-tenant security)
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_creatives ENABLE ROW LEVEL SECURITY;

-- Affiliates can see their own data
CREATE POLICY "affiliates_own_data" ON affiliates
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "affiliate_clicks_own_data" ON affiliate_clicks
  FOR SELECT USING (
    affiliate_id IN (
      SELECT id FROM affiliates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "affiliate_commissions_own_data" ON affiliate_commissions
  FOR SELECT USING (
    affiliate_id IN (
      SELECT id FROM affiliates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "affiliate_payouts_own_data" ON affiliate_payouts
  FOR SELECT USING (
    affiliate_id IN (
      SELECT id FROM affiliates WHERE user_id = auth.uid()
    )
  );

-- Company admins can see all data for their company
CREATE POLICY "company_affiliate_data" ON affiliates
  FOR ALL USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "company_click_data" ON affiliate_clicks
  FOR ALL USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "company_commission_data" ON affiliate_commissions
  FOR ALL USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "company_payout_data" ON affiliate_payouts
  FOR ALL USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "company_creative_data" ON affiliate_creatives
  FOR ALL USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

-- Functions for affiliate tracking
CREATE OR REPLACE FUNCTION track_affiliate_click(
  p_affiliate_code TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_referrer TEXT DEFAULT NULL,
  p_landing_page TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_affiliate_id UUID;
  v_company_id UUID;
  v_click_id TEXT;
BEGIN
  -- Find affiliate by code
  SELECT id, company_id INTO v_affiliate_id, v_company_id
  FROM affiliates
  WHERE code = p_affiliate_code AND status = 'active';

  IF v_affiliate_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'affiliate_not_found');
  END IF;

  -- Generate unique click ID
  v_click_id := 'click_' || encode(gen_random_bytes(16), 'hex');

  -- Insert click
  INSERT INTO affiliate_clicks (
    affiliate_id, company_id, ip_address, user_agent,
    referrer, landing_page, click_id
  ) VALUES (
    v_affiliate_id, v_company_id, p_ip_address, p_user_agent,
    p_referrer, p_landing_page, v_click_id
  );

  -- Update affiliate stats
  UPDATE affiliates
  SET total_clicks = total_clicks + 1, updated_at = now()
  WHERE id = v_affiliate_id;

  RETURN jsonb_build_object('success', true, 'click_id', v_click_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record commission
CREATE OR REPLACE FUNCTION record_affiliate_commission(
  p_affiliate_id UUID,
  p_amount NUMERIC,
  p_source TEXT,
  p_reference_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_company_id UUID;
  v_commission_id UUID;
BEGIN
  -- Get company ID
  SELECT company_id INTO v_company_id
  FROM affiliates
  WHERE id = p_affiliate_id;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'affiliate_not_found');
  END IF;

  -- Insert commission
  INSERT INTO affiliate_commissions (
    affiliate_id, company_id, amount, source, reference_id
  ) VALUES (
    p_affiliate_id, v_company_id, p_amount, p_source, p_reference_id
  ) RETURNING id INTO v_commission_id;

  -- Update affiliate pending payout
  UPDATE affiliates
  SET pending_payout = pending_payout + p_amount, updated_at = now()
  WHERE id = p_affiliate_id;

  RETURN jsonb_build_object('success', true, 'commission_id', v_commission_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark click as converted
CREATE OR REPLACE FUNCTION convert_affiliate_click(
  p_click_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_affiliate_id UUID;
BEGIN
  -- Update click
  UPDATE affiliate_clicks
  SET converted = true, converted_at = now()
  WHERE click_id = p_click_id
  RETURNING affiliate_id INTO v_affiliate_id;

  IF v_affiliate_id IS NULL THEN
    RETURN false;
  END IF;

  -- Update affiliate signup count
  UPDATE affiliates
  SET total_signups = total_signups + 1, updated_at = now()
  WHERE id = v_affiliate_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;