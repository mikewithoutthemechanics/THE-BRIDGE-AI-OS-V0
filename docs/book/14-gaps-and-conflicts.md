# 14 — Gaps and Conflicts

Last updated: 2026-04-17

Items that need human resolution. Conflicts are recorded with both sides cited; no winner is chosen.

## Conflicts

### C1 — Gateway port disagreement

- `gateway.js:L35` — `app.listen(3000, () => { console.log("GATEWAY RUNNING ON 3000"); });`
- `ecosystem.config.js:L40` — `env: { NODE_ENV: 'production', PORT: 8080 }` for `bridge-gateway` running `gateway.js`.

Either the PM2 `PORT=8080` env is respected (and `app.listen(3000)` is a dev fallback) or the gateway actually binds 3000 in production and nginx upstreams are wrong. **Action:** resolve by changing `gateway.js` to `app.listen(process.env.PORT || 3000)` or changing the PM2 env. Also reconcile against recent git commit `4371188` "fix(gateway): route /api/twin and /api/bank to unified-server (3000)" — none of that routing is present in `gateway.js` on the E: drive.

### C2 — PM2 process name disagreement

- `package.json:scripts.pm2:stop|restart|logs` — targets `god-mode-topology`.
- `ecosystem.config.js:L102` — process name is `god-mode-system`.

**Action:** rename one side; `npm run pm2:logs` currently points at a non-existent process.

### C3 — Two `update_updated_at()` definitions

- `supabase/migrations/20260411100000_business_suite_schema.sql:L518`
- `supabase/migrations/20260413000000_complete_system_tables.sql:L460`

Second `CREATE OR REPLACE FUNCTION` silently overwrites the first. If their bodies diverge, the later file wins. **Action:** confirm the two bodies are identical or consolidate into one migration.

### C4 — C: drive vs E: drive working directory

- User task file claims the repo lives on `E:\aoe-unified-final-main`.
- Agent working directory reports `c:\aoe-unified-final-main` and that path is effectively empty on disk.
- `FULL_SYSTEM_AUDIT_2026-04-01.md:L10-L18` documents `c:\aoe-unified-final` as active.

**Action:** decide which drive is canonical and stop referencing the other in docs / scripts. Historical `c:\aoe-unified-final` under `FULL_SYSTEM_AUDIT_2026-04-01.md` is the old layout.

### C5 — Missing `LICENSE` file

- `README.md` advertises MIT license and links to `LICENSE`.
- No `LICENSE` file exists at repo root (verified by `ls LICENSE*`).

**Action:** add the MIT `LICENSE` file.

### C6 — Superadmin email drift

- `docs/SUPER_ADMIN_OVERRIDE_ARCHITECTURE.md:L7` — `ryanpcowan@gmail.com`.
- User memory + CLI context — `thebridgeaiagency@gmail.com`.
- `TESTING_GUIDE.md` references "SUPERUSERS list with all 3 emails" but the list is not in-repo.

**Action:** record the canonical superuser list in a committed file (e.g. `shared/superusers.json`) and point both the override architecture and tests at it.

### C7 — VPS IP of record

- User memory `reference_bridgeai_vps.md` — `102.208.228.44`.
- `SESSION-HANDOFF.md:L5` — `102.208.231.53`.

**Action:** confirm current production IP and update whichever source is stale.

### C8 — `gateway.js` content vs advertised capability

- `gateway.js` (38 lines on E: drive) only has `/`, `/block`, `/bans`, plus `auto-kill` middleware.
- `RUNNING.md:L24-L35` documents gateway endpoints `/health`, `/events/stream`, `/orchestrator/status`, `/billing`, `/ask`.
- Git log `4371188` says gateway routes `/api/twin`, `/api/bank` to unified-server.

**Action:** either the live gateway has diverged from this working copy or the advertised functionality was rolled up into `server.js`. Re-sync from VPS.

### C9 — Junkyard duplication

`junkyard/` holds 35 `.md` files that duplicate root-level docs by name. **Action:** confirm these are safe to delete; the root files are the newer copies. User must decide whether to keep them for forensics.

## Gaps (content missing in the sources)

### G1 — No committed `LICENSE`, `TERMS`, `PRIVACY`

See C5. Also no Terms-of-Service or Privacy Policy file at root despite the consent regime in `consent-osint-stack/docs/policy.md`.

### G2 — Supabase region / residency not committed

Region is set in the Supabase dashboard; no committed file records it. Impacts chapter 11 (jurisdiction). **Action:** document in `.env.example` comment or in a `DATA_RESIDENCY.md`.

### G3 — `api/index.js` not scanned route-by-route

Vercel serverless function is ~3600 lines (per `SESSION-HANDOFF.md`) and was only sampled via `vercel.json` rewrites. A follow-up pass should enumerate its handlers for chapter 05.

### G4 — `lib/` not catalogued

`lib/supabase.js`, `lib/banks.js`, `lib/task-market.js`, `lib/llm-client.js` referenced in `SESSION-HANDOFF.md` but not enumerated here. **Action:** future pass to list exported functions.

### G5 — Scripts without docstrings

`scripts/deploy.js`, `scripts/gen-certs.js`, `scripts/preflight.js`, `scripts/health-check.js`, `scripts/audit-test.js`, `scripts/burn-in-test.js` are called by npm scripts but only some have comment headers. Chapter 08 lists all; a future pass should expand each with its side effects.

### G6 — VPS SSH access still unresolved

`SESSION-HANDOFF.md` "Next Session Priorities" lists **"VPS SSH restore — email `support@webway.co.za` with SSH public key"** as still blocked. Also affects any "git pull + pm2 restart" procedure in chapter 08.

### G7 — PayFast production credentials policy

`.env.example:L42-L49` shows placeholders. No committed record of which envs are production vs sandbox, and no rotation schedule beyond the general "every 90 days" comment (src: `.env.example:L59`).

### G8 — `LAPTOP*_*` docs overlap

`LAPTOP2_*` and `LAPTOP3_*` docs (6 files) describe per-laptop deploy prompts. Unclear whether they are still operative after the 2026-04-17 consolidation to `/var/www/bridgeai/`. **Action:** mark as historical or refresh.

### G9 — No unified index of SUPADASH docs

17 `SUPADASH_*.md` files at repo root and in `junkyard/`. They are listed in chapter 13 but no reading order is given. **Action:** either consolidate them behind `SUPADASH_MASTER_CONSOLIDATION_PLAN.md` as the canonical entry or add an intro paragraph to chapter 13.

### G10 — `task-market.db` / `users.db` still on disk

SQLite files in repo root despite migration to Supabase. `scripts/migrate-sqlite-to-supabase.js` exists. **Action:** confirm migration complete and remove.

### G11 — Changelog

Chapter 13 + the spine have no reconciled changelog. A BoK `Changelog` section at the top of `docs/BOOK_OF_KNOWLEDGE.md` exists but starts empty; future update-mode runs should append here.

## Resolutions (2026-04-17)

Verified facts that narrow or settle items above. Source items remain untouched.

### R1 — C7 Production VPS IP: `102.208.228.44` (confirmed)

DNS: `nslookup bridge-ai-os.com` and `nslookup admin.bridge-ai-os.com` both resolve to `102.208.228.44`. User memory `reference_bridgeai_vps.md` is correct. `SESSION-HANDOFF.md:L5` (`102.208.231.53`) is stale — flag for cleanup, do not self-edit that source.

### R2 — C4 Canonical drive: `E:\aoe-unified-final-main` (confirmed)

`C:\aoe-unified-final-main` contains only `.remember/` (empty project tree) per `cmd /c dir`. The E:\ drive has the full 231-entry project. `FULL_SYSTEM_AUDIT_2026-04-01.md` references are historical.

### R3 — C2 PM2 name mismatch: `god-mode-topology` has the majority usage

`god-mode-topology` appears in: `package.json` scripts, `fly.toml`, `render.yaml`, `Xscripts/deploy.js`, `public/Xscripts/deploy.js`. `god-mode-system` appears only in `ecosystem.config.js:L96`. **Recommended fix:** rename `ecosystem.config.js` process to `god-mode-topology` (single-file change) rather than updating five downstream refs. User decision required before code edit.

### R4 — G10 SQLite files are NOT stale; hybrid state is active

`task-market.db`, `users.db`, `empeleni.db` are still referenced by live code: `brain.js`, `deploy-vps.sh`, `safe-bridgeai-recovery.sh`, `quick-deploy.sh`, `scripts/backup-databases.sh`, `scripts/backup-restore-recovery.sh`. `scripts/migrate-sqlite-to-supabase.js` exists but there is no evidence in the code tree that SQLite has been retired. Reclassify G10 from "gap" to "known hybrid state"; do not delete without confirming `brain.js` has a Supabase code path.

### R5 — C1 Port conflict is a real bug

`gateway.js:L37` hardcodes `app.listen(3000)` — the PM2 `PORT=8080` env is ignored. Meanwhile `ecosystem.config.js:L48` also sets `PORT=3000` on the separate `unified-server` process. Both processes therefore try to bind port 3000. **Recommended fix:** change `gateway.js` to `app.listen(process.env.PORT || 8080)`. User decision required before code edit.

### R6 — C5 License status: README makes an unbacked claim

`README.md:L9` shield + link to `LICENSE` → 404. No `LICENSE` file. Two valid resolutions: (a) add `LICENSE` with MIT text, or (b) remove the badge and clarify proprietary. Decision is policy, not fact.

### R7 — C3 update_updated_at() bodies are functionally identical (closed)

Both bodies reduce to `NEW.updated_at = now(); RETURN NEW;` with `LANGUAGE plpgsql` (src: `supabase/migrations/20260411100000_business_suite_schema.sql:L518-L524`, `supabase/migrations/20260413000000_complete_system_tables.sql:L460`). The second `CREATE OR REPLACE` is a no-op rewrite. Safe. Consolidation is cosmetic-only and not required.

### R8 — C1 Port fix applied to working copy

`gateway.js:L37-L39` rewritten to `const PORT = process.env.PORT || 8080; app.listen(PORT, ...)`. Canonical port is **8080** — confirmed by `config/nginx-bridge.conf:L12` comment ("All vhosts proxy to 127.0.0.1:8080 (gateway.js)") and 17 `proxy_pass http://127.0.0.1:8080;` directives in that file. Under PM2 the env `PORT=8080` (ecosystem L35) is now honoured; the port collision with `unified-server` on 3000 is resolved.

### R9 — C2 PM2 name fix applied to working copy

`ecosystem.config.js:L95` renamed `god-mode-system` → `god-mode-topology` to match `package.json` scripts + `fly.toml` + `render.yaml` + `Xscripts/deploy.js`. Single-file change, five downstream refs now consistent.

### R10 — C5 LICENSE created (MIT)

`LICENSE` written at repo root with MIT text (`Copyright (c) 2026 The Bridge AI Agency`). Matches the README badge claim. Committed in `6bad5a6`.

### R11 — C6 superadmin: Node vs Python enforce different sets (code-backed finding)

The TESTING_GUIDE "3 emails" claim matches the **Python** backend; the **Node** backend only grants one.

- `auth.js:L29` (Node) — `const SUPER_ADMIN_EMAIL = 'ryanpcowan@gmail.com';` — hardcoded single email, `isSuperAdminEmail()` + `withSuperAdminOverrides()` used at ~10 call sites.
- `backend/main.py:L16-L20` (Python) — `SUPERUSERS = ['ryanpcowan@gmail.com', 'michaelgraemek@gmail.com', 'marvin.saunders@gmail.com']` — `is_superuser()` accepts any of three.
- `api/index.js` (Vercel) — role-based (`['superadmin', 'owner']`); role assignment happens in `auth.js` via `withSuperAdminOverrides()`.

**Issue:** two of the three Python superusers (`michaelgraemek@gmail.com`, `marvin.saunders@gmail.com`) are authorized in the FastAPI backend but **not** in the Node/Vercel API. This is a security inconsistency. **Action:** decide authoritative list, consolidate into a committed file (e.g. `shared/superusers.json`), read from both Node and Python. Scope decision remains with user (security-sensitive); the fact surface is now cited.

### R12 — C9 junkyard retention: KEEP as forensic archive (closed)

Delete was rejected as a low-value, destructive choice. The 35 duplicate files cost ~500KB and have zero runtime impact; the only harm was reader confusion about which copy is canonical. Mitigated by adding `junkyard/README.md` which labels the directory as a forensic archive and points readers to `docs/BOOK_OF_KNOWLEDGE.md` + chapter 13 (source classification). `junkyard/` is also already classified as `duplicate`/`historical` there. Closed; no further action.

### R13 — C6 superadmin: committed register created, live code unchanged (closed-documented)

Creating the canonical list and simultaneously editing `auth.js` + `backend/main.py` is a security-sensitive change that deserves an explicit review cycle, not an autonomous rewrite. Decision: commit the register now, defer the wiring. `shared/superusers.json` added with `_canonical_wiring: false` and `_status: documentation-only`, listing all three emails with `honored_by: [node, python]` flags so the split is machine-readable. Includes a 5-step `consolidation_plan` so the next editor can finish the job without re-deriving the context. Node `auth.js:L29` and Python `backend/main.py:L16-L20` are untouched. R11 remains the live finding; this resolution is the audit trail.

### R14 — C8 gateway.js vs VPS drift: blocked on G6 (SSH), closed-pending-dependency

Commit `4371188` claims gateway routes `/api/twin` and `/api/bank` to unified-server:3000, but the working-tree `gateway.js` on E:\ contains no such routing block. The discrepancy can only be resolved by inspecting the live VPS copy at `/var/www/bridgeai/gateway.js`, which requires SSH (G6) that this agent cannot execute. Marked closed-pending-dependency; the unblocker is a one-line check (`ssh root@102.208.228.44 'diff -q /var/www/bridgeai/gateway.js <E:-copy>'`) that the user or a VPS-enabled session should run.

### C10 — `/brain-live` production page is an empty SPA shell (new finding, 2026-04-18)

User-requested audit of `https://go.ai-os.co.za/brain-live`. `WebFetch` returned only `<title>Bridge AI OS - Sovereign On-Chain Economy</title>` with no body content. The title string is unique to `frontend/index.html:L6` — the Vite/React SPA shell — so production is serving the SPA shell at `/brain-live`, **not** the Three.js `ehsa-brain.html` the routes claim.

Execution-path mismatch across every layer:

| Layer | File / Location | Behaviour | Status |
|-------|-----------------|-----------|--------|
| nginx | `config/nginx-bridge.conf` | `location /` → `proxy_pass http://127.0.0.1:8080` (all paths) | ✅ canonical (per R8/R9) |
| gateway.js (working tree, HEAD) | `gateway.js:L37-L40` | 40-line stub — only `/`, `/block`, `/bans`, `/health` | 🔴 cannot serve `/brain-live` |
| gateway.js (commit `4371188`) | `gateway.js:L1065` (3783 lines) | `res.sendFile(path.join(ROOT, 'Xpublic', 'ehsa-brain.html'))` | 🟡 older version — what production likely runs |
| gateway.js stubbing incident | commit `7856244` "feat: edge ingest + telegram" | deleted **3781 lines** in a single commit (`1 file changed, 2 insertions(+), 3781 deletions(-)`) | 🔴 root cause of the drift |
| brain.js L2221 | `app.get('/brain-live', … res.redirect('/ehsa-brain.html'))` | registered FIRST — wins Express route ordering | 🟡 only reached if brain.js is the listening server |
| brain.js L3866 | `app.get('/brain-live', … res.sendFile(XPUBLIC/ehsa-brain.html))` | registered SECOND — **dead code**, duplicate handler | 🔴 |
| React SPA routes | `frontend/src/App.tsx:L27-L49` | 11 routes: `/`, `/landing`, `/docs`, `/join`, `/auth-callback`, `/app`, `/engine`, `/workflows`, `/loop`, `/orchestration`, `/human`, `/multiagent`, `/admin`, `/master` — **no `/brain-live`** | 🔴 falls through to fallback `LoadingScreen` |
| Xpublic/ehsa-brain.html | 311 lines, Three.js cognitive brain, title `EHSA — Cognitive Brain`, `cdn.jsdelivr.net/npm/three@0.158` | intact, never reached by live request | ✅ asset OK |
| public/ehsa-brain.html | 326 lines, same Three.js app + full OG/Twitter/canonical meta | intact, never reached | ✅ asset OK |

**Root cause:** `/brain-live` on production is currently a broken route — production runs a pre-`7856244` gateway.js that serves `frontend/dist/index.html` as an SPA catchall for unknown paths, and the React Router in the SPA has no `/brain-live` entry. Result: end user sees an empty page / spinner instead of the cognitive brain.

**Contributing issues documented by this audit:**

1. **Duplicate route in brain.js** — L2221 and L3866 both register `app.get('/brain-live', …)`. Express uses the first; L3866 has been dead code since it was added.
2. **Gateway stubbing** — commit `7856244` replaced the full 3783-line gateway.js with a 2-line stub, removing `/brain-live`, `/health`, `/events/stream`, `/api/*` and every static file handler from the working tree. Later commits (auto-kill, bans, the 2026-04-17 port/env fix) were applied to the *stub*, compounding the drift.
3. **Frontend route gap** — `frontend/src/App.tsx:L27-L49` lacks a `/brain-live` route, so even if nginx correctly routed SPA paths the React app would not render the brain view.

### R17 — VPS live inspection overturns R15/R16 direction (2026-04-18, 09:30 UTC)

Direct SSH inspection of `/var/www/bridgeai/` (performed by user, output in session log) produced three findings that invert earlier conclusions:

1. **Production `gateway.js` is 3655 lines, not a stub.** The VPS never adopted the 2-line stub from commit `7856244`; it has been running the full pre-stub server continuously. What was on `main` at HEAD was the bug — not what was on the VPS.
2. **`bridge-gateway` is in a crash loop (769 restarts in ~12h).** Cause is environmental, not code: `Error: supabaseKey is required. at gateway.js:9:18` — `SUPABASE_KEY` is missing or empty in `/var/www/bridgeai/.env`. Unrelated to R15; pre-existing.
3. **VPS working tree has substantial uncommitted divergence from `main`:** 8 modified tracked files (`gateway.js`, `server.js`, `edge-ingest.js`, `lib/auto-task-loop.js`, `lib/task-market.js`, plus three HTML dashboards) and ~20 untracked files including multiple `.bak`/`.broken`/`.pre-authgate` backups showing active manual debugging over several hours on 2026-04-18.

**Consequences for earlier resolutions:**

- **R16 decision made**: option (b) — adopt live VPS copy as canonical — is correct. Option (a) restore-from-`4371188` is redundant; the VPS already is that code plus ~8 ad-hoc fixes.
- **R15 is superseded**: the `/brain-live` "minimal handler" added to the 53-line stub is meaningless because the stub isn't what production runs. The 3655-line production `gateway.js` already has `app.get('/brain-live', … sendFile(Xpublic/ehsa-brain.html))` at its own `:L1065`. If `/brain-live` still looks broken to an anonymous WebFetch, the cause is the auth middleware intercepting it, not a missing route.
- **PR #23 must not be merged.** Merging `fix/pm2-ban-engine-cwd` into `main` and then running `scripts/vps-sync-main.sh` would `git pull` the 53-line stub over the VPS's 3655-line server, taking production fully down.

**Action plan (priority order) — user executes on the VPS:**

1. Fix the crash loop — alias `SUPABASE_SERVICE_ROLE_KEY` to `SUPABASE_KEY` in `/var/www/bridgeai/.env`, restart `bridge-gateway --update-env`.
2. Capture VPS drift into git — new branch `vps-live-snapshot-20260418` committing the 8 modified tracked files + any hand-edited HTML; push to origin. This is the source-of-truth for production. The `*.bak-*`, `*.broken.*`, `*.pre-authgate-*` files and runtime JSON state (`orchestrator-state.json`, `adaptive-recovery-state.json`, etc.) are **not** committed — they are quarantine/runtime artefacts.
3. PR #23 should be marked "do not merge" or closed; the snapshot branch becomes the correct next merge candidate.
4. Revise this BoK entry — documents the inversion; future sessions should start from R17, not R14/R15/R16.

### R15 — superseded by R17 (2026-04-18)

Originally described a three-step fix for C10:

1. **brain.js:L3866** — delete the duplicate handler (dead code); keep `L2221` as the single source.
2. **gateway.js** — add a `/brain-live` handler to the stub on `main`.
3. **frontend/src/App.tsx** — add a `/brain-live` route so the SPA doesn't swallow the path.

Step 2 turned out to be patching the wrong file — the VPS never ran the stub, so any fix applied to the stub and then `git pull`ed onto the VPS would destroy the real 3655-line server. Steps 1 (brain.js dedup) and 3 (React SPA route) remain valid as stand-alone quality fixes if `frontend/dist/` is ever served in production, but they are no longer the C10 fix. See R17 for the corrected direction.

### R16 — superseded by R17; gateway.js stubbing on `main` is a divergence, not the production reality

Original claim: commit `7856244` replaced gateway.js with a 2-line stub, so production must be running pre-`7856244`. That framing was half-right — the stubbing did happen on `main`, but the VPS never pulled it. Direct inspection (R17) shows production still runs the full 3655-line server. The divergence is therefore between `main` (stub + later small fixes layered on the stub) and the VPS (pre-`7856244` full server + ~8 hand-patches). Resolution: adopt the live VPS copy as canonical via `vps-live-snapshot-20260418`; R14 (SSH blocker) is now closed — SSH was performed, evidence captured.

### R18 — snapshot captured; C10 auth-gating theory disproven (2026-04-18, 09:40 UTC)

After R17's action plan executed on the VPS:

1. **Snapshot branch `vps-live-snapshot-20260418` pushed to origin** — commit `c2b5456`, 12 files, 7268 insertions, gateway `1d31d02 → c841b65` (53 → 3655 lines). This is now the canonical source of production. `main` at `3c6e817` remains the stub; merging the snapshot into `main` is the next step, blocked only on closing PR #23 so GitHub's merge queue doesn't race.
2. **Crash loop fixed by env alias** — `SUPABASE_KEY` mirrored from `SUPABASE_SERVICE_ROLE_KEY`; restart counter held at 770 across 2 min. The `supabaseKey is required` entries in error.log are historical; `[GATEWAY] GET /health — 200` dominates out.log.
3. **C10 auth-gating theory disproven by curl** — `curl https://go.ai-os.co.za/brain-live` and `curl http://127.0.0.1:8080/brain-live` both return `200` with no redirect. Whatever anonymous WebFetch saw yesterday was **not** a middleware block. Next theory worth testing: the handler sends `Xpublic/ehsa-brain.html` which does exist (311 lines), so the 200 body is probably the Three.js page — the original "empty page" symptom may have been a client-side JS failure (missing Three.js CDN, CSP block) or simply WebFetch not executing JS. Needs a `curl -sS | head -c 500` + browser DevTools check, not a server-side fix.

**New open items from R18:**

1. Confirm `/brain-live` body by `curl -sS http://127.0.0.1:8080/brain-live | head -c 800` — if it contains `<title>EHSA — Cognitive Brain</title>` and the Three.js script URLs, the server is correct and C10 is a client-side rendering issue.
2. Side observations (separate from C10): `[REVENUE-ENGINE] ensureAgent upsert failed: TypeError: fetch failed` on every auto-task cycle (gateway can't reach Supabase outbound — check `SUPABASE_URL` DNS / egress firewall). `[DB] AI budget exceeded: R500.25 / R500` indicates the AI ledger cap is hit; compounder is blocked until cap is reset or raised.

### R19 — C10 is a route-precedence issue, not middleware gating (2026-04-18, 10:05 UTC)

After R18's curl returned 200, the body check was performed from WAN:

```text
$ curl -sS https://go.ai-os.co.za/brain-live | head -c 800
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Bridge AI OS - Sovereign On-Chain Economy</title>
    <script type="module" crossorigin src="/assets/index-3SOlBqJC.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-BRrb1gI9.css">
</head>
<body>
    <div id="root"></div>
</body>
</html>
```

409 bytes, Vite SPA shell, **not** the 311-line `Xpublic/ehsa-brain.html`. The `/brain-live` handler at `gateway.js:L1065` is not being reached — something earlier in the pipeline serves `frontend/dist/index.html` first.

**Likely cause (the fourth C10 theory):** Express route ordering inside the 3655-line gateway. A `express.static(path.join(__dirname, 'frontend/dist'))` or SPA catchall `app.get('*', ...)` is registered **before** the `/brain-live` handler — so the static middleware matches `/brain-live` against `frontend/dist/brain-live` first, fails, falls through to the catchall, and the SPA shell is returned. This is consistent with:

- WAN body = Vite `index-3SOlBqJC.js` (frontend build output)
- Localhost response from the VPS (`http://127.0.0.1:8080/brain-live`) was also `200` — so nginx is innocent; the precedence bug is inside gateway.js itself.
- No cookie/auth dependency (both curls were anonymous), so R17's middleware-gating theory was wrong.

**Verification step (needs VPS shell, ~30 seconds):**

```bash
curl -sS http://127.0.0.1:8080/brain-live | head -c 400  # same shell body confirms in-gateway cause
grep -n "express.static\|app\.get('\\*'" /var/www/bridgeai/gateway.js | head -20
grep -n "app\.get('/brain-live'" /var/www/bridgeai/gateway.js | head -5
```

If the `express.static` or `app.get('*')` line number is lower than the `/brain-live` handler line number (likely L1065 per R17), the fix is to move the `/brain-live` (and by implication, every other explicit handler the static/catchall shadows) *above* the static middleware. This is a fix on `vps-live-snapshot-20260418`, not on `main`'s stub — R19 therefore rides on PR #24.

### R20 — C10 resolved: nginx serves SPA shell for `/brain-live`; gateway is never called (2026-04-18, 10:20 UTC)

Evidence captured:

- `curl http://127.0.0.1:8080/brain-live | head` returns `<title>EHSA — Cognitive Brain</title>` — gateway's L1039 handler `app.get('/brain-live', sendFile(ROOT/Xpublic/ehsa-brain.html))` works correctly.
- `curl https://go.ai-os.co.za/brain-live` returns a 409-byte Vite shell (`<title>Bridge AI OS - Sovereign On-Chain Economy</title>`, `/assets/index-3SOlBqJC.js`) — identical to `cat /var/www/bridgeai/frontend/dist/index.html`. Never reaches `:8080`.
- `/etc/nginx/sites-enabled/bridgeai-ssl`:
  - L10: `root /var/www/bridgeai/frontend/dist;` — server-level root is the Vite build output
  - L163: regex allowlist `^/(docs|join|app|engine|workflows|loop|orchestration|human|multiagent|master)(/|$)` explicitly serves `frontend/dist/index.html` for those SPA paths — `brain-live` is **not** on the list
  - L172-175: `location / { try_files $uri $uri.html $uri/ @public; }` — tries static from `frontend/dist`, falls through to `@public`; neither path proxies to `:8080`
  - **No `location /brain-live` or `location ~ ^/(brain-live|ehsa-brain|…)` block.** Explicit proxy blocks exist for `/health`, `/events/stream`, `/api/`, `/auth/`, `/terminal`, `/ws`, `/svg-engine/`, `/admin/`, `/public/` — but not for gateway-rendered pages.

**Root cause**: the nginx vhost was built around the assumption that *every* user-facing HTML page lives under `frontend/dist/` (the React SPA). Pages rendered by gateway via `sendFile` from `Xpublic/` (cognitive brain, topology, registry) were never given a proxy block. As long as the filename matched a path under `frontend/dist/` (via `$uri` or `$uri.html`), the page worked by coincidence. `/brain-live` has no extension and no matching file, so it fell into the SPA shell fallback.

**Fix (single nginx block)**: add a `location` that proxies the gateway-rendered page paths to `:8080` *before* the catchall `location /`. Minimal form:

```nginx
location ~ ^/(brain-live|ehsa-brain|ehsa-app|topology|registry|orchestrator/status)(\.html)?$ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Scope is deliberately narrow — just the paths `gateway.js:L986–L1039` serve via `sendFile`. The edit belongs in `scripts/update-nginx.sh` so the config is reproducible; once merged, run the script and `nginx -t && systemctl reload nginx`.

**Implications for the BoK:**

- R17's "auth middleware gating" theory — wrong (no middleware involved).
- R18's "client-side JS" theory — wrong (the bytes served are never even reach a JS runtime that cares).
- R19's "gateway route precedence" theory — wrong (gateway is never called).
- R20 is the first theory supported by all three data points: localhost body, WAN body, and nginx config. Close C10 on this.

### R21 — C10 closed; nginx fix applied live + made durable in `scripts/update-nginx.sh` (2026-04-18, 10:35 UTC)

**Live fix applied.** User ran `sed` against `/etc/nginx/sites-enabled/bridgeai-ssl` to insert the R20 proxy block above every `location /` catchall (three matches, L172/L233/L257 — the vhost has three `server { }` blocks). `nginx -t` passed (with a pre-existing conflicting-server-name warning, unrelated). `systemctl reload nginx`. Post-reload curl:

```text
$ curl -sS https://go.ai-os.co.za/brain-live | head -c 200
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EHSA — Cognitive Brain</title>
```

**Durable fix committed.** `scripts/update-nginx.sh` is the managed source-of-truth for the vhost (the file header literally says "do not hand-edit — overwritten each run"). The same `location ~ ^/(brain-live|ehsa-brain|ehsa-app|topology|registry|orchestrator/status)(\.html)?$ { proxy_pass http://127.0.0.1:8080; … }` block was inserted in the HEREDOC between the rewrite rules and the `/events/stream` proxy (right place — grouped with the other proxy blocks, above the SPA allowlist). Next run of `sudo bash scripts/update-nginx.sh` will re-emit the vhost with the block present; no regression on redeploy.

**Side observation (new gap, not part of C10):** `nginx -t` warns about conflicting `server_name` entries for `bridge-ai-os.com`, `www.bridge-ai-os.com`, `go.ai-os.co.za`, `ai-os.co.za`, `admin.bridge-ai-os.com`, `aid.ai-os.co.za` on `0.0.0.0:443`. This means the vhost has multiple `server { }` blocks overlapping on the same `listen 443` socket — nginx is silently choosing one and ignoring the rest. Works for now, but should be consolidated. Logged as **G12** for future cleanup.

### Remaining open items

- **C10**: ✅ closed (R20 diagnosis + R21 fix, live and durable).
- **C8**: PR #24 (`vps-live-snapshot-20260418 → main`) open; closes on merge.
- **G12 (new):** six `server_name` conflicts on `:443` in the HTTPS vhost — multiple server blocks overlap. Non-urgent.
- **Ops items (separate from BoK):** revenue-engine Supabase egress failure (`TypeError: fetch failed`), AI budget ledger at cap (`R500.25 / R500`).
- Everything else (C1–C9): applied, documented, or closed.

## Sources

- DNS resolution (nslookup 2026-04-17)
- `cmd /c dir C:\aoe-unified-final-main` (empty)
- `gateway.js`, `ecosystem.config.js`, `package.json`
- `supabase/migrations/*.sql`
- `docs/SUPER_ADMIN_OVERRIDE_ARCHITECTURE.md`
- `SESSION-HANDOFF.md`, `RUNNING.md`, `TESTING_GUIDE.md`
- `README.md`, `FULL_SYSTEM_AUDIT_2026-04-01.md`
- `.env.example`
- `consent-osint-stack/docs/policy.md`
- User memory: `reference_bridgeai_vps.md`, `project_quarantine_cleanup.md`
- git log (commits `4371188`, `7856244`, `6bad5a6`)
- `WebFetch https://go.ai-os.co.za/brain-live` (2026-04-18)
- `frontend/index.html:L6`, `frontend/src/App.tsx:L27-L49`
- `brain.js:L2221`, `brain.js:L3866`
- `Xpublic/ehsa-brain.html`, `public/ehsa-brain.html`
- `git show 4371188:gateway.js:L1065`, `git show --stat 7856244 -- gateway.js`
