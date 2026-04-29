# 00 — Overview

_Last updated: 2026-04-17_

## What this is

Bridge AI OS / aoe-unified-final is a modular operating system for orchestrating AI workflows, agents, payments, CRM, and treasury on a single Node.js + Supabase stack with a static HTML public surface (src: `README.md:L12-L14`, `docs/COMPLETE_DOCUMENTATION.md:L1-L33`).

## Runtime shape at a glance

| Tier | Component | Port / Host | Source |
|------|-----------|-------------|--------|
| Edge | Vercel (static `public/` + `api/index.js` function) | `go.ai-os.co.za` | src: `vercel.json` |
| Edge | Nginx on VPS (split HTTP/HTTPS blocks) | `102.208.228.44:80/443` | src: user memory `reference_bridgeai_vps.md` |
| Gateway | `bridge-gateway` (gateway.js) | 8080 (prod) / 3000 (legacy) | src: `ecosystem.config.js:L30-L42`, `gateway.js:L35` |
| Core API | `unified-server` (server.js) | 3000 | src: `ecosystem.config.js:L45-L56` |
| Control | `super-brain` (brain.js) | 8000 | src: `ecosystem.config.js:L59-L69` |
| Auth | `auth-service` (auth.js) | 5001 | src: `ecosystem.config.js:L72-L82` |
| Terminal | `terminal-proxy.js` | 5002 | src: `ecosystem.config.js:L85-L97` |
| Monitor | `god-mode-system` (system.js) | 3001 | src: `ecosystem.config.js:L100-L110` |
| Tasks | `ban-engine` (Python FastAPI) | 8001 | src: `ecosystem.config.js:L113-L128` |
| Skills | `svg-engine` (api/server.js) | 7070 | src: `ecosystem.config.js:L131-L143` |

## Start here map

1. **What does it do?** → `README.md`, `BRIDGE_SYSTEM_SPEC.md`, `docs/COMPLETE_DOCUMENTATION.md`.
2. **How do I run it?** → `RUNNING.md`, `ecosystem.config.js`, chapter `08-procedures.md`.
3. **What is the schema?** → `supabase/migrations/*.sql`, chapter `04-schema.md`.
4. **What routes exist?** → `server.js`, `public/ROUTE_MAP.md`, chapter `05-routes-and-navigation.md`.
5. **What env / config?** → `.env.example`, chapter `02-variables-and-parameters.md` + `06-configs.md`.
6. **What broke / what is drifting?** → chapter `14-gaps-and-conflicts.md`.

## Canonical domains

| Domain | Role | Source |
|--------|------|--------|
| `bridge-ai-os.com` | Primary WordPress | src: `.env.example:L66` |
| `go.ai-os.co.za` | Vercel frontend + serverless API | src: `SESSION-HANDOFF.md:L4` |
| `gateway.ai-os.co.za` | Secondary gateway | src: `.env.example:L69` |
| `admin.bridge-ai-os.com` | Admin subdomain | src: git log `9ac2fd4` |

## Sources

- `README.md`
- `docs/COMPLETE_DOCUMENTATION.md`
- `BRIDGE_SYSTEM_SPEC.md`
- `RUNNING.md`
- `ecosystem.config.js`
- `vercel.json`
- `SESSION-HANDOFF.md`
- User memory: `reference_bridgeai_vps.md`, `reference_bridgeai_pm2_paths.md`
