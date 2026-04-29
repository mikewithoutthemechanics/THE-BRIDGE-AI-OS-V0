# 04 — Schema

_Last updated: 2026-04-17_

Authoritative source: `supabase/migrations/*.sql` (11 migrations, ~74 tables, 2 RPCs backing hot paths, 3 trigger-backed invariants). Table descriptions below summarise one row of source; re-read the migration for full column lists.

## Migrations timeline

| File | Date | Scope | Source |
|------|------|-------|--------|
| `20260411000000_hardened_treasury_schema.sql` | 2026-04-11 | Treasury + CRM + LG core (18 tables). | src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql` |
| `20260411100000_business_suite_schema.sql` | 2026-04-11 | Business suite: companies, invoices, tickets, campaigns, affiliates, legal (20 tables). | src: `supabase/migrations/20260411100000_business_suite_schema.sql` |
| `20260411200000_platform_productization.sql` | 2026-04-11 | Projects, project_runs, outputs, profile_feedback, twin_speech_log (5 tables). | src: `supabase/migrations/20260411200000_platform_productization.sql` |
| `20260412000000_crm_invoicing_enhancements.sql` | 2026-04-12 | marketplace_bids, ticket_comments, user_settings, newsletter_subscriptions. | src: `supabase/migrations/20260412000000_crm_invoicing_enhancements.sql` |
| `20260412100000_esim_pbx_schema.sql` | 2026-04-12 | eSIM + PBX (7 tables). | src: `supabase/migrations/20260412100000_esim_pbx_schema.sql` |
| `20260413000000_complete_system_tables.sql` | 2026-04-13 | Agents, tasks_market, leads, AP2, SupaClaw, affiliates, twins (19 tables). | src: `supabase/migrations/20260413000000_complete_system_tables.sql` |
| `20260414000000_add_distribution_columns.sql` | 2026-04-14 | ALTER `transactions` + index. | src: `supabase/migrations/20260414000000_add_distribution_columns.sql` |
| `20260414100000_recovery_infrastructure.sql` | 2026-04-14 | `hitl_queue` + indexes. | src: `supabase/migrations/20260414100000_recovery_infrastructure.sql` |
| `20260417000000_tasks_market_perf.sql` | 2026-04-17 | Composite index + `market_stats()` RPC. | src: `supabase/migrations/20260417000000_tasks_market_perf.sql` |
| `20260417010000_bulk_claim_tasks.sql` | 2026-04-17 | `bulk_claim_tasks(jsonb)` RPC. | src: `supabase/migrations/20260417010000_bulk_claim_tasks.sql` |
| `20260417020000_rls_initplan_wrap.sql` | 2026-04-17 | Wrap `auth.uid()`/`auth.role()` in `(SELECT …)` for RLS perf. | src: `supabase/migrations/20260417020000_rls_initplan_wrap.sql` |

## Tables — treasury core (`20260411000000_hardened_treasury_schema.sql`)

| Table | Purpose | Line |
|-------|---------|------|
| `users` | User identities. | L15 |
| `wallet_identities` | On-chain wallets per user. | L25 |
| `accounts` | Chart of accounts (ops/growth/reserve/founder/claude_partner). | L40 |
| `ledger_entries` | Double-entry ledger lines. | L64 |
| `account_balances` | Materialised balance per account. | L112 |
| `fiat_payouts` | Fiat payout queue. | L143 |
| `withdrawals` | Generic withdrawal records. | L160 |
| `admin_withdrawals` | Admin-authorised withdrawals. | L168 |
| `audit_log` | Tamper-evident hash-chain. | L179 |
| `reconciliation_log` | Recon snapshots. | L218 |
| `payments` | Payment events. | L229 |
| `tasks` | Generic task records. | L245 |
| `attribution_events` | Unrewarded reward-triggers. | L258 |
| `lg_agents` / `lg_tasks` / `lg_telemetry` | Lead-gen runtime. | L277/L284/L292 |
| `crm_leads` / `crm_interactions` | CRM base. | L301/L308 |

## Tables — business suite (`20260411100000_business_suite_schema.sql`)

`companies`, `payment_configs`, `contacts`, `invoices`, `quotes`, `tickets`, `vendors`, `inventory`, `workforce`, `campaigns`, `affiliates`, `affiliate_payouts`, `proposals`, `legal_documents`, `compliance_status`, `debts`, `activity_log`, `orchestration_events`, `invoice_sequences`, `quote_sequences` (src: `supabase/migrations/20260411100000_business_suite_schema.sql`).

## Tables — platform productization

`projects`, `project_runs`, `outputs`, `profile_feedback`, `twin_speech_log` (src: `supabase/migrations/20260411200000_platform_productization.sql:L14-L151`).

## Tables — complete system

`agents`, `agent_balances`, `agent_transactions`, `tasks_market`, `leads`, `nurture_queue`, `payment_proof_chain`, `ap2_offers`, `ap2_payments`, `ap2_receipts`, `supaclaw_ledger`, `supaclaw_snapshots`, `supaclaw_state`, `affiliate_clicks`, `affiliate_conversions`, `agent_twins`, `agent_memory`, `crm_deals`, `pipeline_events` (src: `supabase/migrations/20260413000000_complete_system_tables.sql`).

## Tables — eSIM / PBX

`esim_accounts`, `pbx_extensions`, `pbx_numbers`, `pbx_cdr`, `esim_topups`, `esim_nurture`, `esim_plans` (src: `supabase/migrations/20260412100000_esim_pbx_schema.sql:L7-L135`).

## Tables — CRM / invoicing additions

`marketplace_bids`, `ticket_comments`, `user_settings`, `newsletter_subscriptions` (src: `supabase/migrations/20260412000000_crm_invoicing_enhancements.sql:L47-L83`).

## Tables — recovery

`hitl_queue` (status + payment_id indexed) (src: `supabase/migrations/20260414100000_recovery_infrastructure.sql:L13-L29`).

## ALTER operations

`ALTER TABLE transactions ADD distribution columns` + `idx_tx_distribution_status` (src: `supabase/migrations/20260414000000_add_distribution_columns.sql:L6-L14`). Additional `ALTER TABLE transactions` in `20260414100000_recovery_infrastructure.sql:L8`.

## Database functions (RPCs + triggers)

| Function | Kind | Purpose | Source |
|----------|------|---------|--------|
| `enforce_double_entry()` | trigger | Rejects ledger inserts that don't balance. | src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql:L81` |
| `update_balance()` | trigger | Keeps `account_balances` in sync with `ledger_entries`. | src: `…:L117` |
| `audit_hash_chain()` | trigger | Chains `audit_log` rows via SHA-256 prev/cur hashes. | src: `…:L190` |
| `next_invoice_number(p_company_id UUID)` | function | Atomic per-company invoice number. | src: `20260411100000_business_suite_schema.sql:L456` |
| `next_quote_number(p_company_id UUID)` | function | Atomic per-company quote number. | src: `…:L468` |
| `update_updated_at()` | trigger | Stamps `updated_at`. Two copies exist — see chapter 14. | src: `20260411100000_business_suite_schema.sql:L518`, `20260413000000_complete_system_tables.sql:L460` |
| `update_esim_updated_at()` | trigger | eSIM-specific updated_at. | src: `20260412100000_esim_pbx_schema.sql:L186` |
| `increment_project_runs(p_id TEXT)` | function | Counter bump. | src: `20260411200000_platform_productization.sql:L41` |
| `increment_project_outputs(p_id TEXT)` | function | Counter bump. | src: `…:L47` |
| `market_stats()` | RPC (STABLE) | Aggregated per-status stats for `tasks_market`. | src: `20260417000000_tasks_market_perf.sql:L24` |
| `bulk_claim_tasks(assignments jsonb)` | RPC (VOLATILE) | Single-statement bulk task claim with `status='POSTED'` guard. | src: `20260417010000_bulk_claim_tasks.sql:L16` |

## Row-Level Security policies

| Category | Policy examples | Source |
|----------|-----------------|--------|
| Service-role all-access | `service_role_all` on `users`, `fiat_payouts`, `audit_log`. | src: `20260411000000_hardened_treasury_schema.sql:L326-L328` |
| Per-user `owner_id = auth.uid()` | `companies`. | src: `20260417020000_rls_initplan_wrap.sql:L16-L19` |
| Company-scoped `IN (SELECT …)` | `campaigns`, `contacts`, `marketplace_tasks`, `payment_configs`, `quotes`, `tickets`, `vendors`, `workforce`. | src: `20260417020000_rls_initplan_wrap.sql:L22-L82` |
| Per-user reads | `invoices`, `lifecycle_events`, `user_modules`, `user_subscriptions`, `wallet_balances`. | src: `20260417020000_rls_initplan_wrap.sql:L86-L105` |
| Service-only | `integration_runs`, `outputs`, `profile_feedback`, `project_runs`, `projects`, `wizard_profiles`. | src: `20260417020000_rls_initplan_wrap.sql:L107-L130` |

Note: `auth.uid()` and `auth.role()` are wrapped in `(SELECT …)` so Postgres treats them as InitPlans (one evaluation per query, cached) — see the header comment in `20260417020000_rls_initplan_wrap.sql:L1-L14`.

## Indexes (beyond PK)

| Index | Table | Source |
|-------|-------|--------|
| `idx_wallet_user` | `wallet_identities(user_id)` | src: `20260411000000_hardened_treasury_schema.sql` |
| `idx_ledger_tx`, `idx_ledger_account` | `ledger_entries` | src: same |
| `idx_payout_status` | `fiat_payouts(status)` | src: same |
| `idx_attr_unrewarded` | `attribution_events` where unrewarded | src: same |
| `idx_marketplace_bids_task` | `marketplace_bids(task_id)` | src: `20260412000000_…` |
| `idx_ticket_comments_ticket` | `ticket_comments(ticket_id)` | src: same |
| `idx_tx_distribution_status` | `transactions(distribution_status)` | src: `20260414000000_…` |
| `idx_hitl_queue_status`, `idx_hitl_queue_payment_id` | `hitl_queue` | src: `20260414100000_…` |
| `idx_tasks_market_status_posted_at` | `tasks_market(status, posted_at DESC)` (replaces `idx_tasks_market_status`) | src: `20260417000000_…:L19` |

## Sources

- `supabase/migrations/*.sql` (all 11 files)
