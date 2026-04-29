-- =============================================================================
-- tasks_market performance: composite index + aggregated stats RPC
--
-- 1. Replace single-column (status) index with a composite (status, posted_at DESC)
--    so the hot query — WHERE status=$1 ORDER BY posted_at DESC LIMIT N — is
--    served by an index range scan with no heap sort.
--
-- 2. Add market_stats() RPC that returns per-status aggregates in one round trip,
--    replacing the full-table SELECT * scan in getMarketStats().
-- =============================================================================

-- ── 1. Composite index ──────────────────────────────────────────────────────
-- CONCURRENTLY would avoid a write lock but CANNOT run inside a transaction,
-- and Supabase migrations wrap each file in one. If the table is big enough to
-- matter, run this statement manually from the SQL editor instead.
CREATE INDEX IF NOT EXISTS idx_tasks_market_status_posted_at
  ON public.tasks_market (status, posted_at DESC);

-- Redundant once composite exists (composite's leading column covers pure
-- status equality). Drop to save write/vacuum overhead.
DROP INDEX IF EXISTS public.idx_tasks_market_status;

-- ── 2. Aggregated stats RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_stats()
RETURNS TABLE (
  status         text,
  n              bigint,
  total_reward   double precision,
  escrowed       double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.status,
    COUNT(*)::bigint                                 AS n,
    COALESCE(SUM(t.reward_brdg), 0)::double precision AS total_reward,
    COALESCE(SUM(
      CASE WHEN t.status IN ('POSTED','CLAIMED','EXECUTING')
           THEN t.escrow_amount ELSE 0 END
    ), 0)::double precision                          AS escrowed
  FROM public.tasks_market t
  GROUP BY t.status;
$$;

-- Authenticated users (and anon if needed) can call the RPC via PostgREST.
GRANT EXECUTE ON FUNCTION public.market_stats() TO anon, authenticated, service_role;
