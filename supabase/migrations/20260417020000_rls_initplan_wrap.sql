-- =============================================================================
-- RLS initplan wrap — per-query evaluation of auth.uid() / auth.role()
--
-- Why : Supabase's performance advisor flags policies that call auth.uid()
--       or auth.role() directly because Postgres treats those functions as
--       volatile and re-executes them per row. Wrapping them in (SELECT …)
--       promotes the call to an InitPlan evaluated once per query, cached
--       for the duration.
--
-- What: For every policy currently referencing auth.uid() / auth.role(),
--       drop and recreate with the wrapped form. Pattern is identical to
--       the existing qual — only the auth call is wrapped.
-- =============================================================================

-- ── Category A: Per-user (owner_id = auth.uid()) ───────────────────────────
DROP POLICY IF EXISTS "Users see own company" ON public.companies;
CREATE POLICY "Users see own company" ON public.companies
  FOR ALL USING (owner_id = (SELECT auth.uid()));

-- ── Category B: Company-scoped via IN(SELECT …) ────────────────────────────
DROP POLICY IF EXISTS "Users see own company campaigns" ON public.campaigns;
CREATE POLICY "Users see own company campaigns" ON public.campaigns
  FOR ALL USING (
    company_id IN (
      SELECT companies.id FROM companies WHERE companies.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users see own company contacts" ON public.contacts;
CREATE POLICY "Users see own company contacts" ON public.contacts
  FOR ALL USING (
    company_id IN (
      SELECT companies.id FROM companies WHERE companies.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users see own company marketplace_tasks" ON public.marketplace_tasks;
CREATE POLICY "Users see own company marketplace_tasks" ON public.marketplace_tasks
  FOR ALL USING (
    company_id IN (
      SELECT companies.id FROM companies WHERE companies.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users see own company payment_configs" ON public.payment_configs;
CREATE POLICY "Users see own company payment_configs" ON public.payment_configs
  FOR ALL USING (
    company_id IN (
      SELECT companies.id FROM companies WHERE companies.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users see own company quotes" ON public.quotes;
CREATE POLICY "Users see own company quotes" ON public.quotes
  FOR ALL USING (
    company_id IN (
      SELECT companies.id FROM companies WHERE companies.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users see own company tickets" ON public.tickets;
CREATE POLICY "Users see own company tickets" ON public.tickets
  FOR ALL USING (
    company_id IN (
      SELECT companies.id FROM companies WHERE companies.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users see own company vendors" ON public.vendors;
CREATE POLICY "Users see own company vendors" ON public.vendors
  FOR ALL USING (
    company_id IN (
      SELECT companies.id FROM companies WHERE companies.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users see own company workforce" ON public.workforce;
CREATE POLICY "Users see own company workforce" ON public.workforce
  FOR ALL USING (
    company_id IN (
      SELECT companies.id FROM companies WHERE companies.owner_id = (SELECT auth.uid())
    )
  );

-- ── Category C: ((auth.uid())::text = user_id) ─────────────────────────────
DROP POLICY IF EXISTS "Users read own invoices" ON public.invoices;
CREATE POLICY "Users read own invoices" ON public.invoices
  FOR SELECT USING (((SELECT auth.uid())::text) = user_id);

DROP POLICY IF EXISTS "Users read own lifecycle events" ON public.lifecycle_events;
CREATE POLICY "Users read own lifecycle events" ON public.lifecycle_events
  FOR SELECT USING (((SELECT auth.uid())::text) = user_id);

DROP POLICY IF EXISTS "Users read own modules" ON public.user_modules;
CREATE POLICY "Users read own modules" ON public.user_modules
  FOR SELECT USING (((SELECT auth.uid())::text) = user_id);

DROP POLICY IF EXISTS "Users read own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users read own subscriptions" ON public.user_subscriptions
  FOR SELECT USING (((SELECT auth.uid())::text) = user_id);

DROP POLICY IF EXISTS "Users read own wallet" ON public.wallet_balances;
CREATE POLICY "Users read own wallet" ON public.wallet_balances
  FOR SELECT USING (((SELECT auth.uid())::text) = user_id);

-- ── Category D: service_role gates (auth.role() = 'service_role') ──────────
DROP POLICY IF EXISTS "integration_runs_service" ON public.integration_runs;
CREATE POLICY "integration_runs_service" ON public.integration_runs
  FOR ALL USING ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "outputs_service" ON public.outputs;
CREATE POLICY "outputs_service" ON public.outputs
  FOR ALL USING ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "profile_feedback_service" ON public.profile_feedback;
CREATE POLICY "profile_feedback_service" ON public.profile_feedback
  FOR ALL USING ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "project_runs_service" ON public.project_runs;
CREATE POLICY "project_runs_service" ON public.project_runs
  FOR ALL USING ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "projects_service" ON public.projects;
CREATE POLICY "projects_service" ON public.projects
  FOR ALL USING ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "wizard_profiles_service" ON public.wizard_profiles;
CREATE POLICY "wizard_profiles_service" ON public.wizard_profiles
  FOR ALL USING ((SELECT auth.role()) = 'service_role'::text);
