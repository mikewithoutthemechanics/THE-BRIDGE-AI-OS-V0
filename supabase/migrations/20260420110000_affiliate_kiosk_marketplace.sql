-- =============================================================================
-- BRIDGE AI OS — Affiliate Kiosks + Marketplace
-- =============================================================================
-- Adds per-affiliate storefronts ("kiosks") and a cross-cutting marketplace
-- view. Distinct from the EXISTING AI-task marketplace in lib/task-market.js
-- and public/marketplace.html — that one pairs agents to work. THIS one
-- pairs affiliates to buyers.
--
-- Tables:
--   affiliate_kiosks       — one optional storefront per affiliate
--   affiliate_listings     — products/services/links an affiliate offers
--   affiliate_orders       — buyer purchases against a listing
--   affiliate_kiosk_views  — light analytics (hits per kiosk per day)
--
-- Settlement: on order status='paid', the payment flow credits
--   `affiliate_{uuid}` via lib/agent-ledger.js. This migration just
--   persists the record — wiring to the ledger happens in brain.js routes.
--
-- Depends on: 20260420100000_affiliate_program_reconciliation.sql
-- =============================================================================

BEGIN;

-- ── 1. affiliate_kiosks ────────────────────────────────────────────────────
-- One kiosk per affiliate. Slug is the public URL handle:
--   https://bridge-ai-os.com/k/{slug}
-- Auto-provisioned (one row per affiliate) by the brain.js join handler, or
-- manually by the seed script. An affiliate can customize, publish, or
-- hide their kiosk — unpublished kiosks 404 for non-owners.
CREATE TABLE IF NOT EXISTS affiliate_kiosks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Public handle. Lowercase, URL-safe. Derived from referral_code by default.
  slug            TEXT NOT NULL,

  -- Presentation
  title           TEXT NOT NULL,
  tagline         TEXT,
  about_html      TEXT,
  theme           TEXT DEFAULT 'default'
                    CHECK (theme IN ('default','dark','light','neon','minimal','hospital','rooted')),
  cover_image_url TEXT,
  avatar_url      TEXT,
  accent_color    TEXT,

  -- Contact / social
  contact_email   TEXT,
  social          JSONB DEFAULT '{}'::jsonb,   -- { twitter, instagram, linkedin, tiktok, ... }

  -- Commerce settings
  accepts_brdg    BOOLEAN NOT NULL DEFAULT true,
  accepts_zar     BOOLEAN NOT NULL DEFAULT true,
  accepts_crypto  BOOLEAN NOT NULL DEFAULT false,
  default_currency TEXT NOT NULL DEFAULT 'ZAR'
                    CHECK (default_currency IN ('ZAR','USD','BRDG','BTC','ETH')),

  -- Status
  is_published    BOOLEAN NOT NULL DEFAULT false,
  published_at    TIMESTAMPTZ,
  view_count      INTEGER NOT NULL DEFAULT 0,

  -- Extensibility
  metadata        JSONB DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE (affiliate_id),                        -- one kiosk per affiliate
  UNIQUE (company_id, slug)                     -- slug unique per tenant
);

CREATE INDEX IF NOT EXISTS idx_kiosks_company_published
  ON affiliate_kiosks(company_id, is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_kiosks_slug
  ON affiliate_kiosks(slug);

-- ── 2. affiliate_listings ──────────────────────────────────────────────────
-- Items offered on an affiliate's kiosk. Five types cover the common cases:
--   product       — physical / digital goods the affiliate fulfills directly
--   service       — a booking / consultation / time-based offering
--   subscription  — recurring membership
--   digital       — download / content unlock (auto-fulfilled)
--   referral_link — affiliate forwards to a 3rd-party product (earns partner commission,
--                   no inventory on our side). Ties into lib/affiliate-engine.js NETWORKS.
CREATE TABLE IF NOT EXISTS affiliate_listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id        UUID NOT NULL REFERENCES affiliate_kiosks(id) ON DELETE CASCADE,
  affiliate_id    UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  type            TEXT NOT NULL
                    CHECK (type IN ('product','service','subscription','digital','referral_link')),
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT,
  description_md  TEXT,

  -- Media
  image_url       TEXT,
  gallery         JSONB DEFAULT '[]'::jsonb,    -- array of urls

  -- Pricing — nullable columns let a listing price in one or multiple currencies.
  price_zar       NUMERIC CHECK (price_zar IS NULL OR price_zar >= 0),
  price_usd       NUMERIC CHECK (price_usd IS NULL OR price_usd >= 0),
  price_brdg      NUMERIC CHECK (price_brdg IS NULL OR price_brdg >= 0),

  -- Inventory. NULL = unlimited (services, digital downloads, referral links).
  inventory       INTEGER,
  sold_count      INTEGER NOT NULL DEFAULT 0,

  -- For type='referral_link': where to forward, and which partner network
  -- (resolves against lib/affiliate-engine.js NETWORKS for commission tracking).
  external_url    TEXT,
  partner_network TEXT,                         -- webway|luno|elevenlabs|cloudflare|digitalocean|other

  -- For type='digital': where the asset lives post-purchase.
  fulfillment_url TEXT,

  -- Subscription details (for type='subscription')
  billing_period  TEXT CHECK (billing_period IN ('monthly','quarterly','annual') OR billing_period IS NULL),

  tags            TEXT[] DEFAULT '{}',
  category        TEXT,                         -- free-form grouping on the marketplace

  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','active','paused','sold_out','archived')),
  featured        BOOLEAN NOT NULL DEFAULT false,

  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE (kiosk_id, slug)                       -- slug unique per kiosk
);

CREATE INDEX IF NOT EXISTS idx_listings_kiosk_status
  ON affiliate_listings(kiosk_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_affiliate
  ON affiliate_listings(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_listings_company_active
  ON affiliate_listings(company_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_featured
  ON affiliate_listings(featured) WHERE featured = true AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_category
  ON affiliate_listings(category) WHERE category IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_type
  ON affiliate_listings(type) WHERE status = 'active';

-- ── 3. affiliate_orders ────────────────────────────────────────────────────
-- One row per buyer action. Status machine:
--   pending_payment → paid → fulfilling → fulfilled
--                  ↘ cancelled / refunded / failed
-- On status → 'paid' the brain.js handler credits the affiliate wallet
-- via ledger.credit('affiliate_{uuid}', commission_brdg, 'kiosk_sale', memo).
CREATE TABLE IF NOT EXISTS affiliate_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT UNIQUE NOT NULL DEFAULT 'ORD-' || upper(substr(gen_random_uuid()::text, 1, 8)),
  listing_id      UUID NOT NULL REFERENCES affiliate_listings(id) ON DELETE RESTRICT,
  kiosk_id        UUID NOT NULL REFERENCES affiliate_kiosks(id) ON DELETE RESTRICT,
  affiliate_id    UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Buyer identity. NULL buyer_user_id = anonymous / guest checkout.
  -- users.id is TEXT (not UUID) per the actual deployed schema.
  buyer_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  buyer_email     TEXT,
  buyer_name      TEXT,

  -- Snapshot of listing at purchase time (immutable post-sale)
  listing_title_snapshot TEXT NOT NULL,
  listing_type_snapshot  TEXT NOT NULL,

  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

  -- Totals in the buyer's chosen currency
  currency        TEXT NOT NULL,
  unit_price      NUMERIC NOT NULL,
  total           NUMERIC NOT NULL,

  -- Commission split (frozen at purchase)
  commission_pct  NUMERIC NOT NULL,
  commission_amount NUMERIC NOT NULL,
  commission_brdg NUMERIC,                      -- BRDG credited to affiliate wallet on settlement

  -- Payment
  payment_method  TEXT
                    CHECK (payment_method IN ('payfast','paystack','stripe','paypal','crypto','iban','brdg','free') OR payment_method IS NULL),
  payment_ref     TEXT,
  paid_at         TIMESTAMPTZ,

  -- Fulfillment
  fulfillment_status TEXT DEFAULT 'not_started'
                    CHECK (fulfillment_status IN ('not_started','in_progress','fulfilled','failed','refunded')),
  fulfillment_url TEXT,                         -- for digital: download link
  fulfilled_at    TIMESTAMPTZ,

  status          TEXT NOT NULL DEFAULT 'pending_payment'
                    CHECK (status IN ('pending_payment','paid','fulfilling','fulfilled','cancelled','refunded','failed')),

  settlement_tx_id TEXT,                        -- agent_transactions.id once commission credited

  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_created
  ON affiliate_orders(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_kiosk
  ON affiliate_orders(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer
  ON affiliate_orders(buyer_user_id) WHERE buyer_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON affiliate_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_ref
  ON affiliate_orders(payment_ref) WHERE payment_ref IS NOT NULL;

-- ── 4. affiliate_kiosk_views ───────────────────────────────────────────────
-- Per-day hit counter for kiosk landing pages. Incremented by the brain.js
-- view handler. Keeping rollup granularity at day-level keeps the table
-- small even for popular kiosks.
CREATE TABLE IF NOT EXISTS affiliate_kiosk_views (
  kiosk_id        UUID NOT NULL REFERENCES affiliate_kiosks(id) ON DELETE CASCADE,
  view_date       DATE NOT NULL,
  view_count      INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kiosk_id, view_date)
);

CREATE INDEX IF NOT EXISTS idx_kiosk_views_date
  ON affiliate_kiosk_views(view_date DESC);

-- ── 5. Triggers ────────────────────────────────────────────────────────────
-- Re-use the set_affiliate_updated_at() function from 20260420100000.
DROP TRIGGER IF EXISTS trg_kiosks_updated_at ON affiliate_kiosks;
CREATE TRIGGER trg_kiosks_updated_at
  BEFORE UPDATE ON affiliate_kiosks
  FOR EACH ROW EXECUTE FUNCTION set_affiliate_updated_at();

DROP TRIGGER IF EXISTS trg_listings_updated_at ON affiliate_listings;
CREATE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON affiliate_listings
  FOR EACH ROW EXECUTE FUNCTION set_affiliate_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON affiliate_orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON affiliate_orders
  FOR EACH ROW EXECUTE FUNCTION set_affiliate_updated_at();

-- Keep listings.sold_count consistent with fulfilled orders.
-- Only counts fulfilled sales so refunds decrement the number.
CREATE OR REPLACE FUNCTION update_listing_sold_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'fulfilled' AND OLD.status <> 'fulfilled' THEN
    UPDATE affiliate_listings
       SET sold_count = sold_count + NEW.quantity
     WHERE id = NEW.listing_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('cancelled','refunded') AND OLD.status = 'fulfilled' THEN
    UPDATE affiliate_listings
       SET sold_count = GREATEST(0, sold_count - NEW.quantity)
     WHERE id = NEW.listing_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_sold_count ON affiliate_orders;
CREATE TRIGGER trg_orders_sold_count
  AFTER UPDATE OF status ON affiliate_orders
  FOR EACH ROW EXECUTE FUNCTION update_listing_sold_count();

-- ── 6. RLS ─────────────────────────────────────────────────────────────────
-- Same strategy as the reconciliation migration: API-enforced (service-role
-- bypass) with a public-read policy for actively-published content. Real
-- per-user policies come later when the portal queries Supabase directly.
ALTER TABLE affiliate_kiosks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_listings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_kiosk_views  ENABLE ROW LEVEL SECURITY;

-- Published kiosks + active listings are public-readable (marketplace view).
DROP POLICY IF EXISTS kiosks_public_read ON affiliate_kiosks;
CREATE POLICY kiosks_public_read ON affiliate_kiosks
  FOR SELECT TO public USING (is_published = true);

DROP POLICY IF EXISTS listings_public_read ON affiliate_listings;
CREATE POLICY listings_public_read ON affiliate_listings
  FOR SELECT TO public USING (status = 'active');

-- Orders and per-day stats: service-role only until per-user policies added.
DROP POLICY IF EXISTS orders_service_only ON affiliate_orders;
CREATE POLICY orders_service_only ON affiliate_orders
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS kiosk_views_service_only ON affiliate_kiosk_views;
CREATE POLICY kiosk_views_service_only ON affiliate_kiosk_views
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMIT;

-- =============================================================================
-- Follow-ups (NOT in this migration):
--   • brain.js routes: GET /api/kiosk/:slug, POST /api/kiosk/:id/listings,
--     POST /api/orders, POST /api/orders/:id/pay (ties to payment-webhooks)
--   • Auto-provision one kiosk row per affiliate on POST /api/affiliate/join
--   • Public marketplace page at /public/affiliate-marketplace.html (or
--     /public/affiliate-portal/marketplace.html as a SPA tab)
--   • Kiosk landing pages at /k/:slug (rendered by gateway.js or server.js)
--   • Wire order settlement → ledger.credit('affiliate_{uuid}', commission_brdg)
--     in the payment webhook handlers (see project_payment_architecture.md).
-- =============================================================================
