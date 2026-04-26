# 10 — Rules and States

_Last updated: 2026-04-17_

State machines, lifecycle rules, invariants.

## Invariants enforced by DB triggers

| Invariant | Where | Source |
|-----------|-------|--------|
| Every `ledger_entries` insert must balance debit ↔ credit. | `enforce_double_entry()` trigger. | src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql:L81` |
| `account_balances` stays in sync with `ledger_entries`. | `update_balance()` trigger. | src: same file L117 |
| Every `audit_log` row is chained via SHA-256 to prior row. | `audit_hash_chain()` trigger. | src: same file L190 |
| `updated_at` stamped on row update. | `update_updated_at()` / `update_esim_updated_at()`. | src: `20260411100000_business_suite_schema.sql:L518`; `20260412100000_esim_pbx_schema.sql:L186` |

## Tasks-market lifecycle

| State | Transition | Source |
|-------|------------|--------|
| `POSTED` | Initial on task insert. | src: `supabase/migrations/20260417010000_bulk_claim_tasks.sql:L41-L43` (UPDATE guard `status='POSTED'`) |
| `CLAIMED` | Set by `bulk_claim_tasks()` when `status='POSTED'`; loser rows stay POSTED or get `claimed=false` row in output. | src: same file L40-L46 |

Claim is idempotent at the row level — concurrent claims are silently skipped because the `status='POSTED'` predicate fails on already-claimed rows (src: same file L1-L14).

## Marketplace bids

`pending → accepted | rejected | completed` (src: `supabase/migrations/20260412000000_crm_invoicing_enhancements.sql:L52`).

## Invoice lifecycle

`draft → sent → paid | overdue | cancelled | refunded` (src: `supabase/migrations/20260411100000_business_suite_schema.sql:L105`).

## Quote lifecycle

`draft → sent → accepted | rejected | expired | converted` (src: `…:L141`).

## Ticket lifecycle

`open → in_progress → resolved → closed` (src: `…:L164`).

## CRM lead/contact status

`lead → prospect → qualified → customer → churned` (src: `…:L66`).

## Campaign lifecycle

`draft → active → paused → completed` (src: `…:L257`).

## Debt status

`outstanding → paid | overdue | partial` (src: `…:L391`).

## Compliance status

`in_progress → compliant | non_compliant` (src: `…:L372`).

## Orchestration events

`pending → processing → completed | failed` (src: `…:L432`).

## Proposal status

`draft → active → passed | failed | closed` (src: `…:L329`).

## Affiliate payouts

`pending → paid | failed` (src: `…:L315`).

## Projects

- `status`: `active | paused | archived` (src: `supabase/migrations/20260411200000_platform_productization.sql:L23`).

## Project runs

- `trigger`: `manual | scheduled | webhook | api | cron` (src: `…:L61`).
- `status`: `running → completed | failed | cancelled` (src: `…:L63`).

## Outputs (project outputs)

- `type`: `export | integration | hybrid` (src: `…:L86`).
- `format`: `json | markdown | zip | repo | api | webhook | bundle | report` (src: `…:L88`).
- `status`: `pending → generating → ready → delivered | retry | failed` (src: `…:L92`).

## eSIM / PBX states

| Entity | States | Source |
|--------|--------|--------|
| `esim_accounts.status` | `pending | active | suspended | cancelled | expired` | src: `20260412100000_esim_pbx_schema.sql:L20-L22` |
| `pbx_extensions.status` | `active | inactive | busy | dnd` | src: `…:L41-L42` |
| `pbx_numbers.type` | `local | toll_free | mobile | international` | src: `…:L59` |
| `pbx_numbers.status` | `available | assigned | porting | suspended` | src: `…:L62-L63` |
| `pbx_cdr.direction` | `inbound | outbound | internal` | src: `…:L77` |
| `pbx_cdr.status` | `answered | no_answer | busy | failed | voicemail` | src: `…:L80` |
| `esim_topups.type` | `data | voice | sms | wallet | plan_upgrade | plan_renewal` | src: `…:L96` |
| `esim_topups.status` | `pending → completed | failed | refunded` | src: `…:L102-L103` |
| `esim_nurture.stage` | `discovery → demo_scheduled → proposal_sent → onboarding → active | churned` | src: `…:L118` |

## Ledger direction

`debit | credit` (src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql:L69`).

## Treasury rails

`/api/treasury/rails` returns the configured rails list (src: `server.js:L1725`).

## HITL queue

Recovery queue with `status` + `payment_id` indices — acts as the human-review gate for failed / suspect payments (src: `supabase/migrations/20260414100000_recovery_infrastructure.sql:L13-L29`).

## TVM approval machine (product-surface)

`/api/tvm/:topic/propose → /api/tvm/:topic/approve | /api/tvm/:topic/reject` (src: `server.js:L1669-L1677`).

## LLM provider chain

`kilo → anthropic → openrouter → openai`, walked on failure (src: `.env.example:L56`).

## Restart policies (PM2)

Up to 50 restarts; crash loop detection <30s uptime triggers backoff 1→2→4→8→16s (src: `ecosystem.config.js:L13-L15`). Memory-guard restart at 512M (or 128M / 256M for lightweight processes) (src: `ecosystem.config.js:L20,L92,L125`).

## Sources

- `supabase/migrations/*.sql`
- `server.js`
- `ecosystem.config.js`
- `.env.example`
