# 01 — Glossary

_Last updated: 2026-04-17_

Terms appearing in at least two source documents. One-line definition per term.

| Term | Definition | Source |
|------|------------|--------|
| **AOE** | Agent Orchestration Engine — the backbone service name used for the unified dashboard. | src: `RUNNING.md:L8` |
| **AP2** | Agent Payment Protocol — offers / payments / receipts tables for agent-to-agent payments. | src: `supabase/migrations/20260413000000_complete_system_tables.sql:L181-L215` |
| **Attribution event** | Record of a user action that may earn rewards, stored unrewarded until processed. | src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql:L258` |
| **BAN** | Bridge Agent Network — Python FastAPI task engine running on port 8001. | src: `ecosystem.config.js:L113-L128` |
| **BoK** | Book of Knowledge — this index. | src: `.claude/agents/book-of-knowledge.md` |
| **BRDG** | Bridge token on Linea mainnet at `0x5f0541302bd4fC672018b07a35FA5f294A322947`. | src: `SESSION-HANDOFF.md:L34`, `public/VERIFICATION.md:L24` |
| **Bridge Gateway** | Public HTTP gateway process (`gateway.js`, port 8080). | src: `ecosystem.config.js:L30-L42` |
| **CRM** | Customer relationship tables (`crm_leads`, `crm_interactions`, `crm_deals`). | src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql:L301-L315` |
| **Double-entry ledger** | `ledger_entries` table enforced by `enforce_double_entry()` trigger. | src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql:L64` |
| **EHSA** | Environmental/Health/Safety/Access vertical platform. | src: `public/ehsa.html`, `public/PAGE_DOCUMENTATION.md` |
| **eSIM / PBX** | Communications vertical with `esim_accounts`, `pbx_extensions`, `pbx_cdr` tables. | src: `supabase/migrations/20260412100000_esim_pbx_schema.sql` |
| **GOD MODE** | Topology monitor dashboard (`system.js`, port 3001). | src: `ecosystem.config.js:L100-L110` |
| **HITL** | Human-in-the-loop queue for payment / task review. | src: `supabase/migrations/20260414100000_recovery_infrastructure.sql:L13` |
| **Kilo** | Free-tier LLM provider, first in the Kilo → Claude → OpenRouter → OpenAI fallback chain. | src: `.env.example:L58`, `SESSION-HANDOFF.md` |
| **PayFast** | ZAR payment processor used for IPN at `/payfast/notify`. | src: `.env.example:L43-L49`, `server.js:L307` |
| **Proof of Reserves** | Merkle-tree based attestation of treasury balances. | src: `BRIDGE_FINAL_FORM.md:L14-L30`, `public/VERIFICATION.md` |
| **RLS** | Row-Level Security — applied via `CREATE POLICY` in Supabase migrations. | src: `supabase/migrations/20260417020000_rls_initplan_wrap.sql` |
| **SIWE** | Sign-In With Ethereum — wallet auth using `BRIDGE_SIWE_*` env vars. | src: `.env.example:L84-L87` |
| **Supabase** | Managed PostgreSQL + auth, source of truth for persistent state. | src: `.env.example:L9-L11`, `lib/supabase.js` |
| **SUPADASH** | Super-admin dashboard project thread, multiple planning docs. | src: `SUPADASH_MASTER_CONSOLIDATION_PLAN.md` |
| **SVG engine** | Skill execution + graph visualization service on port 7070. | src: `ecosystem.config.js:L131-L143` |
| **Tasks market** | `tasks_market` table backing the agent job board. | src: `supabase/migrations/20260413000000_complete_system_tables.sql:L65` |
| **Treasury** | Set of tables + routes for balance, payouts, withdrawals, reconciliation. | src: `supabase/migrations/20260411000000_hardened_treasury_schema.sql` |
| **TVM** | Topic Vector Matrix — BoK routing index; also product-surface `/api/tvm/*`. | src: `.claude/agents/book-of-knowledge.md`, `server.js:L1661-L1672` |
| **Twin** | Digital agent twin — `agent_twins`, `/api/twins`, `/api/twin/env-keys`. | src: `supabase/migrations/20260413000000_complete_system_tables.sql:L347`, `server.js:L2017` |
| **UBI** | Universal Basic Income vertical — `/api/ubi/claim`. | src: `server.js:L1944`, `vercel.json:L85-L86` |

## Sources

- `.env.example`
- `ecosystem.config.js`
- `server.js`
- `supabase/migrations/*.sql`
- `SESSION-HANDOFF.md`
- `public/PAGE_DOCUMENTATION.md`, `public/VERIFICATION.md`
- `BRIDGE_FINAL_FORM.md`
- `RUNNING.md`
