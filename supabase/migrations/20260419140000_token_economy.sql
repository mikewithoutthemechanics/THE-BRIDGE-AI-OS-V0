-- =============================================================================
-- Token Economy — referral closure, append-only ledger, tier net-flow caps
--
-- Why : stages the ground truth for the AI-OS token economy. All token flows
--       become immutable journal entries; per-user balances are a derived
--       projection maintained by trigger; referral commissions cascade via
--       a closure table for O(1) depth lookups (recursive walks over a
--       direct-edge referral table at commission time are too slow once
--       the tree gets wide).
--
-- Design notes :
--   • Uses the existing `public.users(id text)` table — does NOT create a
--     parallel auth store. All FKs reference users(id) as text.
--   • `token_ledger` is append-only; a trigger rejects UPDATE/DELETE.
--   • `token_balances` is materialised by an AFTER INSERT trigger on the
--     ledger — so reads are a single row lookup, not a SUM() scan.
--   • RLS is ON and permissive for service_role only (the bridge processor
--     holds service_role; end users read via RPCs or views gated by policies).
--   • `ai_os_events` is the durable queue — SELECT … FOR UPDATE SKIP LOCKED
--     gives competing-consumer semantics without Redis.
-- =============================================================================

BEGIN;

-- ── 1. user_relations — direct parent→child edges ──────────────────────────
CREATE TABLE IF NOT EXISTS public.user_relations (
  parent_id   text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  child_id    text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  kind        text NOT NULL DEFAULT 'referral'
              CHECK (kind IN ('referral','sponsor','delegate')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, child_id, kind),
  CHECK (parent_id <> child_id)
);
CREATE INDEX IF NOT EXISTS idx_rel_child ON public.user_relations(child_id);

ALTER TABLE public.user_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_relations service_role" ON public.user_relations;
CREATE POLICY "user_relations service_role" ON public.user_relations
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ── 2. user_closure — transitive ancestors/descendants w/ depth ────────────
CREATE TABLE IF NOT EXISTS public.user_closure (
  ancestor_id    text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  descendant_id  text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  depth          integer NOT NULL CHECK (depth >= 0),
  PRIMARY KEY (ancestor_id, descendant_id)
);
CREATE INDEX IF NOT EXISTS idx_closure_descendant
  ON public.user_closure(descendant_id, depth);

ALTER TABLE public.user_closure ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_closure service_role" ON public.user_closure;
CREATE POLICY "user_closure service_role" ON public.user_closure
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ── 3. token_ledger — append-only journal ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.token_ledger (
  id              bigserial PRIMARY KEY,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  event_type      text NOT NULL,
  source_user_id  text REFERENCES public.users(id),
  target_user_id  text REFERENCES public.users(id),
  amount          numeric(38,18) NOT NULL,
  currency        text NOT NULL DEFAULT 'AIOS',
  memo            text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_checksum   text,
  checksum        text NOT NULL,
  CHECK (amount <> 0)
);
CREATE INDEX IF NOT EXISTS idx_ledger_target
  ON public.token_ledger(target_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_source
  ON public.token_ledger(source_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_event
  ON public.token_ledger(event_type, occurred_at DESC);

ALTER TABLE public.token_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "token_ledger service_role" ON public.token_ledger;
CREATE POLICY "token_ledger service_role" ON public.token_ledger
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- Append-only guard.
CREATE OR REPLACE FUNCTION public.ledger_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'token_ledger is append-only (attempted %)', TG_OP;
END; $$;

DROP TRIGGER IF EXISTS trg_ledger_no_update ON public.token_ledger;
CREATE TRIGGER trg_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.token_ledger
  FOR EACH ROW EXECUTE FUNCTION public.ledger_reject_mutation();

-- ── 4. token_balances — materialised projection ────────────────────────────
CREATE TABLE IF NOT EXISTS public.token_balances (
  user_id     text PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  currency    text NOT NULL DEFAULT 'AIOS',
  balance     numeric(38,18) NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.token_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "token_balances service_role" ON public.token_balances;
CREATE POLICY "token_balances service_role" ON public.token_balances
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- Trigger: on ledger insert, adjust target (credit) and source (debit) balances.
CREATE OR REPLACE FUNCTION public.ledger_apply_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.target_user_id IS NOT NULL THEN
    INSERT INTO public.token_balances(user_id, currency, balance, updated_at)
    VALUES (NEW.target_user_id, NEW.currency, NEW.amount, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.token_balances.balance + EXCLUDED.balance,
          updated_at = now();
  END IF;
  IF NEW.source_user_id IS NOT NULL THEN
    INSERT INTO public.token_balances(user_id, currency, balance, updated_at)
    VALUES (NEW.source_user_id, NEW.currency, -NEW.amount, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.token_balances.balance - EXCLUDED.balance * -1,
          updated_at = now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ledger_balance ON public.token_ledger;
CREATE TRIGGER trg_ledger_balance
  AFTER INSERT ON public.token_ledger
  FOR EACH ROW EXECUTE FUNCTION public.ledger_apply_balance();

-- ── 5. Helper: net flow over a window (tier-cap enforcement) ───────────────
CREATE OR REPLACE FUNCTION public.net_flow(p_user text, p_since timestamptz)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(
           CASE WHEN target_user_id = p_user THEN amount
                WHEN source_user_id = p_user THEN -amount
                ELSE 0
           END
         ), 0)
  FROM public.token_ledger
  WHERE occurred_at >= p_since
    AND (target_user_id = p_user OR source_user_id = p_user);
$$;

-- ── 6. ai_os_events — durable queue (replaces Redis for shadow/early stage) ─
CREATE TABLE IF NOT EXISTS public.ai_os_events (
  id            bigserial PRIMARY KEY,
  received_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  processed_at  timestamptz,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','claimed','processed','failed')),
  event_type    text NOT NULL,
  source_user_id text REFERENCES public.users(id),
  target_user_id text REFERENCES public.users(id),
  amount        numeric(38,18),
  currency      text DEFAULT 'AIOS',
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error         text,
  retries       integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_pending
  ON public.ai_os_events(status, received_at) WHERE status = 'pending';

ALTER TABLE public.ai_os_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_os_events service_role" ON public.ai_os_events;
CREATE POLICY "ai_os_events service_role" ON public.ai_os_events
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ── 7. claim_events() — atomic claim for competing consumers ───────────────
-- Uses FOR UPDATE SKIP LOCKED so N processors can run in parallel without
-- fighting over the same row. Returns the claimed rows so the caller
-- processes them; on failure, mark them 'failed' + store error.
CREATE OR REPLACE FUNCTION public.claim_events(p_limit integer DEFAULT 10)
RETURNS SETOF public.ai_os_events LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.ai_os_events
    WHERE status = 'pending'
    ORDER BY received_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_os_events e
     SET status = 'claimed', claimed_at = now()
    FROM picked
   WHERE e.id = picked.id
   RETURNING e.*;
END; $$;

-- ── 8. event_dead_letter (archive of permanent failures) ───────────────────
CREATE TABLE IF NOT EXISTS public.event_dead_letter (
  id           bigserial PRIMARY KEY,
  received_at  timestamptz NOT NULL DEFAULT now(),
  source_event_id bigint,
  payload      jsonb NOT NULL,
  error        text NOT NULL,
  retries      integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dead_letter_recv
  ON public.event_dead_letter(received_at DESC);

ALTER TABLE public.event_dead_letter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_dead_letter service_role" ON public.event_dead_letter;
CREATE POLICY "event_dead_letter service_role" ON public.event_dead_letter
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

COMMIT;
