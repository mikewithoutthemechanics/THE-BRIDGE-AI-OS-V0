# 12 — Referrals

_Last updated: 2026-04-17_

External system pointers — the things this repo touches but does not own.

## Hosting / infrastructure

| System | Locator | Purpose | Source |
|--------|---------|---------|--------|
| VPS (root) | `102.208.228.44` (SSH `root@`) | Runs PM2 stack under `/var/www/bridgeai/`. | user memory `reference_bridgeai_vps.md` |
| Vercel | `go.ai-os.co.za` | Static + serverless edge. | `SESSION-HANDOFF.md:L5`, `vercel.json` |
| nginx | Split blocks `bridgeai` (HTTP) + `bridgeai-ssl` (HTTPS). | Edge at 80/443, managed by `scripts/update-nginx.sh`. | user memory |
| Cloudflare | `CF_API_TOKEN`, `CF_ZONE_ID` (optional). | DNS + CDN (optional). | `.env.example:L99-L100` |
| DirectAdmin | `DA_BASE_URL` (`:2222`). | Control panel. | `.env.example:L104-L105` |

## Data / auth

| System | Locator | Purpose | Source |
|--------|---------|---------|--------|
| Supabase | `SUPABASE_URL` (project TBD from dashboard). | Postgres + auth + service-role. | `.env.example:L9-L13`, `lib/supabase.js` |
| Clerk | `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`. | Auth provider (optional). | `.env.example:L95-L96` |

## Payments

| System | Locator | Purpose | Source |
|--------|---------|---------|--------|
| PayFast (ZAR) | Merchant ID `PAYFAST_MERCHANT_ID`, notify URL `/payfast/notify`. | Card + EFT for ZAR. | `.env.example:L42-L49`, `server.js:L307` |

## LLMs

| Provider | Env | Role |
|----------|-----|------|
| Kilo | `KILO_API_KEY` | First in fallback chain (free tier). |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | Primary paid — partnered. |
| OpenRouter | `OPENROUTER_API_KEY` | Fallback. |
| OpenAI | `OPENAI_API_KEY` | Last-resort fallback. |

Order: `kilo,anthropic,openrouter,openai` (src: `.env.example:L52-L56`).

## Blockchain

| System | Locator | Purpose | Source |
|--------|---------|---------|--------|
| Linea mainnet RPC | `https://rpc.linea.build` | BRDG token + contracts. | `.env.example:L85` |
| Linea chain ID | 59144 | EIP-155. | `.env.example:L86` |
| BRDG token | `0x5f0541302bd4fC672018b07a35FA5f294A322947` | ERC-20. | `SESSION-HANDOFF.md`, `public/VERIFICATION.md:L24` |
| Lineascan | `https://lineascan.build/token/0x5f05…` | Explorer for read-only `totalSupply()` verification. | `public/VERIFICATION.md:L23-L26` |

## Email / SMTP

| System | Env prefix | Purpose | Source |
|--------|-----------|---------|--------|
| Primary SMTP | `SMTP_*` | Transactional. | `.env.example:L18-L26` |
| Brevo | `BREVO_*` | Backup relay. | `.env.example:L29-L32` |
| Gmail app-pass | `GMAIL_*` | Tertiary backup. | `.env.example:L35-L36` |

## WordPress sites (multi-domain sync)

| Site | URL env | Creds env | Purpose |
|------|---------|-----------|---------|
| Primary | `WP_BRIDGE_AI_OS_URL` = `https://bridge-ai-os.com` | `WP_BRIDGE_AI_OS_USER`, `WP_BRIDGE_AI_OS_APP_PASS` | Primary site. |
| Gateway | `WP_GATEWAY_URL` = `https://gateway.ai-os.co.za` | `WP_GATEWAY_USER`, `WP_GATEWAY_APP_PASS` | Secondary gateway. |
| WordPress.com | `WP_URL` = `https://bridgeaios.wordpress.com` | `WP_USERNAME`, `WP_APP_PASSWORD` | WP.com mirror. |
| WP.com REST | `WP_COM_URL` = `https://public-api.wordpress.com/wp/v2/sites/bridgeaios.wordpress.com` | `WP_COM_USER`, `WP_COM_APP_PASS` | REST API. |

Source: `.env.example:L72-L86`. Shared secret: `WP_HOOK_SECRET`.

## GitHub

- Repo: `https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git` (src: `SESSION-HANDOFF.md:L4`).

## Agents (internal referrals inside `.claude/`)

| Agent | Role | Source |
|-------|------|--------|
| `book-of-knowledge` | Indexes documentation into this BoK. | `.claude/agents/book-of-knowledge.md` |
| `librarian` | Queries TVM.json to route questions. | `.claude/agents/librarian.md` |

## Sources

- `.env.example`
- `SESSION-HANDOFF.md`
- `vercel.json`
- `public/VERIFICATION.md`
- `.claude/agents/*.md`
- User memory: `reference_bridgeai_vps.md`
