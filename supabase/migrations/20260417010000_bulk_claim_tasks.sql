-- =============================================================================
-- bulk_claim_tasks(assignments jsonb)
--
-- Replaces the N+1 pattern in lib/task-market.js::autoMatchTasks() which ran
-- one SELECT + one UPDATE per candidate task. With 50 posted tasks that's
-- ~100 round-trips. This RPC accepts the full assignment array and applies
-- every claim in a single UPDATE ... FROM (VALUES …) statement, guarded by
-- `status = 'POSTED'` so a task already claimed by a concurrent worker is
-- skipped silently (claim lost — the caller sees it in the returned rows).
--
-- Input  : jsonb array like [{"task_id":"task_abc","claimer_agent":"agent-1"}]
-- Output : rows of (task_id, claimer_agent, claimed) — claimed=false means
--          another worker beat us to it (task no longer POSTED).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.bulk_claim_tasks(assignments jsonb)
RETURNS TABLE (
  task_id         text,
  claimer_agent   text,
  claimed         boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ts timestamptz := NOW();
BEGIN
  RETURN QUERY
  WITH input AS (
    SELECT
      (elem ->> 'task_id')::text       AS task_id,
      (elem ->> 'claimer_agent')::text AS claimer_agent
    FROM jsonb_array_elements(assignments) AS elem
  ),
  updated AS (
    UPDATE public.tasks_market t
       SET claimer_agent = i.claimer_agent,
           status        = 'CLAIMED',
           claimed_at    = ts
      FROM input i
     WHERE t.id = i.task_id
       AND t.status = 'POSTED'
       AND (t.poster_agent IS DISTINCT FROM i.claimer_agent)
    RETURNING t.id AS task_id, t.claimer_agent
  )
  SELECT
    i.task_id,
    i.claimer_agent,
    (u.task_id IS NOT NULL) AS claimed
  FROM input i
  LEFT JOIN updated u USING (task_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_claim_tasks(jsonb) TO anon, authenticated, service_role;
