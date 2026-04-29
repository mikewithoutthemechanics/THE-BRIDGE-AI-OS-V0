-- ══════════════════════════════════════════════════════════════════════════════
-- AEOS FULL SCHEMA MIGRATION v2
-- Run in Supabase Dashboard → SQL Editor
-- Project: sdkysuvmtqjqopmdpvoz (go.ai-os.co.za)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Add lifecycle columns to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'uninitialized';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_id UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free';

-- Add lifecycle check constraint (idempotent)
DO $$ BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_lifecycle_status_check
    CHECK (lifecycle_status IN ('uninitialized','profile_complete','tier_selected','active'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Update Ryan to active lifecycle
UPDATE public.users SET lifecycle_status = 'active', plan = 'enterprise', tier = 'enterprise'
  WHERE email = 'ryanpcowan@gmail.com';

-- 3. Apps table (AEOS user apps)
CREATE TABLE IF NOT EXISTS public.apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  type TEXT NOT NULL DEFAULT 'saas',
  category TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped','pending')),
  revenue_mtd NUMERIC(12,4) NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  brand_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apps_user_id ON public.apps(user_id);
CREATE INDEX IF NOT EXISTS idx_apps_status ON public.apps(status);
GRANT ALL ON public.apps TO service_role;

-- 4. Add AEOS columns to existing leads table (extend, don't replace)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES public.apps(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_notes TEXT;
-- status already exists in existing table, no change needed

-- 5. Brands table
CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 120),
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brands_owner_id ON public.brands(owner_id);
CREATE INDEX IF NOT EXISTS idx_brands_slug ON public.brands(slug);
GRANT ALL ON public.brands TO service_role;

-- 6. Add brand_id FK to apps and leads
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;

-- 7. Wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  balance_zar NUMERIC(12,4) NOT NULL DEFAULT 0,
  balance_brdg NUMERIC(12,4) NOT NULL DEFAULT 0,
  balance_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);
GRANT ALL ON public.wallets TO service_role;

-- 8. App Revenue Events
CREATE TABLE IF NOT EXISTS public.app_revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID REFERENCES public.apps(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_zar NUMERIC(12,4) NOT NULL DEFAULT 0,
  amount_brdg NUMERIC(12,4) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'lead_conversion',
  user_cut_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  affiliate_cut_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ryan_cut_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','failed','reversed')),
  routed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rev_events_user ON public.app_revenue_events(user_id);
CREATE INDEX IF NOT EXISTS idx_rev_events_status ON public.app_revenue_events(status);
GRANT ALL ON public.app_revenue_events TO service_role;

-- 9. AEOS Treasury (single row, id=1)
CREATE TABLE IF NOT EXISTS public.aeos_treasury (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance_zar NUMERIC(16,4) NOT NULL DEFAULT 0,
  balance_brdg NUMERIC(16,4) NOT NULL DEFAULT 0,
  total_revenue_zar NUMERIC(16,4) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.aeos_treasury (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT ALL ON public.aeos_treasury TO service_role;

-- 10. Affiliates table
CREATE TABLE IF NOT EXISTS public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'free',
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  total_earned_zar NUMERIC(12,4) NOT NULL DEFAULT 0,
  total_earned_brdg NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_affiliates_user ON public.affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON public.affiliates(code);
GRANT ALL ON public.affiliates TO service_role;

-- 11. Automations table (basic)
CREATE TABLE IF NOT EXISTS public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'trigger',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped')),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automations_user ON public.automations(user_id);
GRANT ALL ON public.automations TO service_role;

-- 12. Banking ledger (basic)
CREATE TABLE IF NOT EXISTS public.banking_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit','debit','transfer','withdrawal','deposit')),
  amount_zar NUMERIC(12,4) NOT NULL DEFAULT 0,
  amount_brdg NUMERIC(12,4) NOT NULL DEFAULT 0,
  description TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON public.banking_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON public.banking_ledger(user_id);
GRANT ALL ON public.banking_ledger TO service_role;

-- Verify
SELECT
  (SELECT COUNT(*) FROM public.apps) as apps,
  (SELECT COUNT(*) FROM public.brands) as brands,
  (SELECT COUNT(*) FROM public.wallets) as wallets,
  (SELECT COUNT(*) FROM public.app_revenue_events) as revenue_events,
  (SELECT COUNT(*) FROM public.affiliates) as affiliates,
  'Migration complete' as status;
