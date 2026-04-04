# SUPADASH COMPLETE INVENTORY
**Generated:** 2026-03-25 | **Source:** 6-Agent Parallel Scan | **Status:** ALL 6 AGENTS COMPLETE

---

## EXECUTIVE SUMMARY

| Metric | Value |
|--------|-------|
| Total Servers | 10 |
| Total Ports Mapped | 14 distinct ports |
| **Port Conflicts** | **CRITICAL: 3000 (4-way), 8080 (4-way)** |
| Total Dashboards | 29 |
| Broken Dashboards | 5+ |
| Duplicate Dashboards | 3 pairs |
| Active Databases | 2 (SQLite + PostgreSQL) |
| Database in Consolidation Target | **NONE** |
| Total Data Flows | 28 |
| Broken Flows | 5 |
| Orphaned Server Endpoints | 8+ |
| Total Risks | 14 (4 CRITICAL, 4 HIGH, 5 MEDIUM, 1 LOW) |
| **Consolidation Readiness** | **NOT READY — 3 blockers must be resolved first** |

---

## TOP 3 BLOCKERS (Must Fix Before Consolidation)

**BLOCKER 1 — Port 3000 Collision**
`system.js` AND `Xcontainerx/server.js` BOTH bind to port 3000 with WebSocket `/terminal`. Only one can run. Choose which, reassign the other to port 3001/3002.

**BLOCKER 2 — No Database in Consolidation Target**
`aoe-unified-final` has no active database. Must establish unified PostgreSQL and migrate bridgeos SQLite data BEFORE moving payment/auth systems. Risk: data loss, user lockout.

**BLOCKER 3 — Unknown State File Source**
`nodes.json`, `mesh.json`, `kernel_state.json` etc. are polled every 2-5s by dashboards but NO server writes them. Must identify or implement write source — currently serving static/stale data.

---

## SECTION 1: DATABASES (Agent 1)

### Active Databases

| DATABASE_NAME | DB_TYPE | LOCATION | TABLES | USED_BY |
|--------------|---------|----------|--------|---------|
| bridgeos | SQLite | /c/bridgeos/bridgeos.db | users, referrals, commissions, payments, api_keys, sessions, modules | bridgeos/server/server.js |
| bridgedb | PostgreSQL (Docker) | bridge-postgres:5432 | interactions, audit_logs, tenants, subscription_plans, subscriptions, credit_purchases, usage_records, billing_history | BridgeAI/ainode/server.js, Xpayments/server.js |

### Notable Findings
- **aoe-unified-final has NO active database** — despite being the consolidation target
- BridgeOS has PostgreSQL configured in `.env` but uses SQLite instead — migration half-done
- Planned unified schema documented at `shared/database-schema.json` (namespaces: aoe_unified, bridgeos, bridge_ai_os)
- Both systems have **overlapping entities** (users, payments) with different schemas

---

## SECTION 2: SERVERS & PORTS (Agent 2)

| SERVER | PORT | FILE | FRAMEWORK | STATUS |
|--------|------|------|-----------|--------|
| Main Unified Server | 5000 | /c/aoe-unified-final/server.js | Express.js | OK |
| Bridge Gateway | 8080 | /c/aoe-unified-final/gateway.js | Express.js + SSE | ⚠️ PORT CONFLICT |
| GOD MODE System | 3000 | /c/aoe-unified-final/system.js | Node.js HTTP | ⚠️ PORT CONFLICT |
| Payment Core | 4000 | /c/aoe-unified-final/Xpayments/server.js | Express.js | OK |
| ContainerX Terminal | 3000 | /c/aoe-unified-final/Xcontainerx/server.js | Express.js + WS | 🔴 COLLISION w/ system.js |
| L1 Streaming Orchestrator | 9000 | /c/aoe-unified-final/agents/laptop1-*.js | Express.js | No dashboard |
| L2 Verification Orchestrator | 9001 | /c/aoe-unified-final/agents/laptop2-*.js | Express.js | No dashboard |
| L3 Minimax Orchestrator | 9002 | /c/aoe-unified-final/agents/laptop3-*.js | Express.js | No dashboard |
| BridgeAI AINode (LLM) | 3001 | /c/BridgeAI/ainode/server.js | Express.js | OK, orphaned endpoints |
| BRIDGE_AI_OS FastAPI | 8000 | /c/BRIDGE_AI_OS/core/app/main.py | FastAPI (Python) | Avatar WS mismatch |

**Port Conflicts:**
```
Port 3000: system.js (GOD MODE) ←→ Xcontainerx ←→ BRIDGE_AI_OS frontend ←→ bridgeos system.js
Port 8080: gateway.js ←→ BridgeAI mesh ←→ BRIDGE_AI_OS gateway ←→ bridgeos gateway.js
```

---

## SECTION 3: DATA FLOWS (Agent 3)

### Key Flow Chains
```
topology.html  ──fetch──▶  :3000/api/full, /api/audit, /api/economics  ──▶  in-memory/file state
               ──WS──────▶ :3000/terminal                               ──▶  PTY shell

Xcontainerx   ──WS──────▶ :3000/terminal  ──▶  PTY shell  (COLLISION ↑)

gateway:8080  ──forward──▶ ainode:3001/ask  ──▶  Ollama:11434 (LLM)
               └─ SILENT FALLBACK if ainode down (operators see no error) ─┘

Xpayments:4000 ──TCP──▶ bridge-postgres:5432  ──▶  payment/user records
ainode:3001    ──TCP──▶ bridge-postgres:5432  ──▶  audit, billing, usage
```

### Broken Flows
| Dashboard | Calls | Problem |
|-----------|-------|---------|
| immersive.html | localhost:4201/api/dci/ws | No server on port 4201 |
| immersive.html | localhost:4201/api/dash-face/twin-state | No server on port 4201 |
| api_graph.html | file:///C:/BridgeAI/api_graph/api_map.json | File not found |
| dash_view.html | file:///C:/BridgeAI/tasks.json | File not found |
| node_map_3d.html | file:///C:/BridgeAI/registry/nodes.json | No server writes this file |

### Orphaned Server Endpoints (never called by any UI)
`/revenue/plans`, `/revenue/stats`, `/revenue/subscribe`, `/revenue/credits/purchase` (ainode:3001)
`/api/agents` (L1:9000), `/api/conflicts` (L2:9001), `/api/optimization/*` (L3:9002)
`POST /api/webhooks/payfast` (Xpayments:4000) — passive webhook, no test UI

---

## SECTION 4: DASHBOARDS (Agent 4)

**29 total: 6 working cleanly, 9 file:// dependent, 5+ broken/duplicate**

| Dashboard | Libraries | Status |
|-----------|-----------|--------|
| Xpublic/topology.html | p5.js, xterm.js | ⚠️ Port 3000 conflict |
| Xcontainerx/public/index.html | xterm.js | ⚠️ Port 3000 conflict |
| Xpublic/onboarding.html | vanilla JS | ✅ OK |
| Xpublic/system-status-dashboard.html | vanilla JS | ✅ OK |
| BRIDGE_AI_OS/avatar/*.html | babylon.js, xterm.js | ⚠️ WS:8000 mismatch |
| BRIDGE_AI_OS/dashboard/index.html | React, Vite | ✅ OK |
| bridge/bridge_dashboard/index.html | React, Vite | ✅ OK |
| BridgeAI/public/index.html | qrcode.js | ✅ OK |
| BridgeAI/registry/dashboard.html | vanilla JS | ⚠️ file:// |
| BridgeAI/registry/network_dashboard.html | vanilla JS | ⚠️ file:// |
| BridgeAI/registry/jobs_dashboard.html | vanilla JS | ⚠️ file:// |
| BridgeAI/registry/node_map_3d.html | three.js | ⚠️ file:// |
| BridgeAI/registry/kernel_dashboard.html | vanilla JS | ⚠️ file:// |
| BridgeAI/registry/market_dashboard.html | vanilla JS | ⚠️ file:// |
| BridgeAI/registry/federation_dashboard.html | vanilla JS | ⚠️ file:// |
| BridgeAI/immersive.html | CSS animations | 🔴 BROKEN (port 4201) |
| bridgeos/client/index.html | vanilla JS | ✅ OK |
| BridgeAI/site/app/* | React (Next.js) | ✅ OK |
| bridgeos/unified/public/topology.html | p5.js, xterm.js | 🟡 DUPLICATE of Xpublic/topology.html |
| bridgeos/unified/public/system-status-dashboard.html | vanilla JS | 🟡 DUPLICATE |

---

## SECTION 5: BRIDGE SYSTEM RELATIONSHIPS (Agent 5)

| System | Purpose | Ports | DB | Conflicts |
|--------|---------|-------|-----|-----------|
| BRIDGE_AI_OS | Root OS: avatar + FastAPI | 80, 8000, 3000, 5173 | Redis | 3000, 8080 |
| bridgeos | Topology + PM2 | 3000, 4000, 8080 | SQLite + inactive PG | 3000, 8080 |
| BridgeAI | Mesh network + AI | 3001, 8080 | PostgreSQL | 8080 |
| bridge-ubi | Blockchain UBI | — | Blockchain | None |
| bridge | Legal app + React | — | None | None |

**No system shares a database with any other.** Data is completely siloed.

Existing consolidation plan: `/c/BRIDGE_AI_OS/CONSOLIDATED_AUDIT.md` (Traefik-based, partially complete)

---

## SECTION 6: CONSOLIDATION RISKS (Agent 6)

| Level | Count | Key Issues |
|-------|-------|-----------|
| 🔴 CRITICAL | 4 | Port 3000 collision; No DB in target; topology.html hard dependency; silent LLM fallback |
| 🟠 HIGH | 4 | Hardcoded Docker DB hostname; immersive.html broken; file:// dashboards; port 8080 4-way |
| 🟡 MEDIUM | 5 | Invisible orchestrators; orphaned revenue endpoints; auth mismatch; avatar WS; unknown state source |
| 🟢 LOW | 1 | PM2 vs Docker conflict |

### Critical Paths
```
Port 3000 dies  →  topology.html dead (4 endpoints + WS) + Xcontainerx dead
DB dies         →  auth dead + payments dead + sessions dead + billing dead
gateway:8080 dies → SSE dead + LLM silently returns stubs
Xpayments dies  →  payment webhooks dead + user activation dead
ainode dies     →  LLM silently returns stubs (NO operator alert)
```

---

## SECTION 7: CONSOLIDATION PHASES

| Phase | Name | Risk | Key Actions |
|-------|------|------|-------------|
| 1 | Port Conflict Resolution | HIGH | Choose terminal, reassign port, fix 8080 collision |
| 2 | Database Consolidation | CRITICAL | Backup, SQLite→PG migration, reconcile user IDs |
| 3 | File-Based State Migration | MEDIUM | Find JSON writer, implement HTTP API endpoints |
| 4 | Dashboard Cleanup | LOW | Archive broken/duplicate dashboards |
| 5 | Gateway & Failure Mode Fixes | MEDIUM | Replace silent fallback with 503 + circuit breaker |
| 6 | Orchestrator Visibility | MEDIUM | Dashboard UI for L1/L2/L3 or remove if unused |
| 7 | Validation & Smoke Tests | LOW | Port checks, DB connectivity, WebSocket tests |
| 8 | Cutover & Rollback Readiness | HIGH | Full backup, cutover, 48hr monitor, rollback plan |

**Phases 3-6 can run in parallel. Estimated: 25-35 work days (4-6 weeks).**

---

## SAFE TO REMOVE
- `/c/BridgeAI/immersive.html` (broken)
- BridgeAI file:// dashboards: `network_dashboard.html`, `live_dashboard.html`, `api_dashboard.html`
- `Xcontainerx/server.js` (if system.js terminal chosen)
- Duplicate `topology.html` and `system-status-dashboard.html` in `bridgeos/unified/`
- PM2 scripts (if Docker consolidation chosen)
- `/c/aoe-unified-final/ui.html` (9-line stub)

---

## AGENT RESULT FILES

All detailed JSON data in `/c/aoe-unified-final/SUPADASH_AGENT_RESULTS/`:
- `agent1_database_mapper_results.json`
- `agent2_server_port_mapper_results.json`
- `agent3_data_flow_results.json`
- `agent4_frontend_auditor_results.json`
- `agent5_bridge_relationships_results.json`
- `agent6_consolidation_risk_results.json`

---

## LEGACY CONTENT (pre-scan, preserved below)

---

### 1. aoe-unified-final (Current Working Dir)
**Servers:** system.js (3000) | gateway.js (8080) | server.js (5000) | Xcontainerx/server.js (3000)
**Dashboards (4):**
- topology.html (912 lines) — P5.js topology, terminal grid, economics
- system-status-dashboard.html (19 lines) — Status nav
- onboarding.html (28 lines) — Registration form
- ui.html (8 lines) — Gateway nav

**Key Features:**
- P5.js topology visualization
- 6-terminal responsive grid (xterm.js)
- Monitor/Swarm/AI/Workflow control panels
- Economics aggregator (SaaS/ARR/MRR)
- Live HUD with packet stats & clock

---

### 2. BridgeAI (c:\BridgeAI)
**Servers:** supernode.js (8080) | server.js (8080) | ainode.js (3001)
**Dashboards (13+ Registry Views):**
- kernel.html — Kernel health/diagnostics
- network.html — Network topology
- security.html — Security audit dashboard
- federation.html — Federation status
- jobs.html — Job queue management
- market.html — Marketplace metrics
- **node_map_3d.html** — 3D globe with three.js (node visualization)
- api_dashboard.html — API metrics
- **api_graph.html** — Network graph with vis.js
- wireframe.html — Architecture wireframe
- observability.html — JSON polling observability
- bridge_os.html — Bridge OS status
- shell.html — Interactive shell
- + 10 more registry dashboards

**Key Features:**
- **Three.js 3D Node Map** (globe visualization)
- **Vis.js API Graph** (network visualization)
- **WebSocket Chat** (/ws/chat)
- Registry system (13 dashboard categories)
- QR session auth
- Health aggregation
- Observability JSON polling

---

### 3. BRIDGE_AI_OS (c:\BRIDGE_AI_OS)
**Server:** gateway.js (port 80) — Dynamic routing, WebSocket support
**Dashboards (13+):**
- avatar.html — **Babylon.js 3D avatar** with skeleton animation
- mission_board.html — Mission/task management
- ubi.html — UBI claims interface
- revenue_engines.html — Revenue tracking
- task_marketplace.html — Task bidding system
- wallet.html — Crypto/token wallet
- auto_dex.html — Decentralized exchange
- skills_panel.html — Skills marketplace
- system_panel.html — System status
- terminal.html — Web terminal
- voice.html — Voice interaction
- emotion_engine.html — Emotion/state tracking
- muscle_inspector.html — System diagnostics
- + 3D face renderers (anatomical)

**Key Features:**
- **Babylon.js Avatar System** (skeletal animation, face rendering)
- **Emotion Engine** (state tracking)
- **UBI Claims System** (distributed payments)
- **Task Marketplace** (decentralized work)
- **Auto DEX** (token swaps)
- **Wallet Integration** (multi-asset)
- **Real-time Voice** (voice interaction UI)
- Gateway with dynamic routing (port 80)

---

### 4. bridgeos (c:\bridgeos)
**Servers:** server.js (5000) | api.js (4000)
**Dashboards (3):**
- system-status-dashboard.html — Status page
- onboarding.html — Registration
- topology.html — Unified system topology (p5.js + terminal grid)

**Key Features:**
- System status monitoring
- User onboarding
- Topology visualization (similar to aoe-unified-final)
- Terminal integration

---

### 5. bridge_local (c:\bridge_local)
**Server:** app.py (Flask, port 5000)
**Dashboards:** None (health check only)

---

### 6. bridge-ubi (c:\bridge-ubi)
**Server:** deploy.js
**Dashboards:** None (deployment script)

---

### 7. bridge (c:\bridge)
**Dashboards (1):**
- index.html — Legal app UI

---

## VISUALIZATION CAPABILITIES MATRIX

| Library | System | Dashboards | Use Case |
|---------|--------|-----------|----------|
| **Three.js** | BridgeAI | node_map_3d.html | 3D globe node visualization |
| **Babylon.js** | BRIDGE_AI_OS | avatar.html | 3D character avatar, skeleton animation |
| **Vis.js** | BridgeAI | api_graph.html | Network graph (API relationships) |
| **P5.js** | bridgeos + aoe-unified-final | topology.html | 2D topology canvas, packet animation |
| **xterm.js** | bridgeos + aoe-unified-final | topology.html | Terminal emulation |
| **WebSocket** | BridgeAI + BRIDGE_AI_OS | Multiple | Real-time chat, voice, animation |
| **Babylon Face** | BRIDGE_AI_OS | avatar.html | Face rendering (emotion expression) |

---

## DATA FLOW BY SYSTEM

### aoe-unified-final Flow
```
topology.html
├─ WS /terminal → Xcontainerx PTY
├─ GET /api/full → system.js engines scan
├─ GET /api/economics → treasury/revenue
├─ GET /api/audit → logs
└─ SSE /events/stream → live updates
```

### BridgeAI Flow
```
registry dashboards
├─ WebSocket /ws/chat → supernode messaging
├─ GET /api/health → system status
├─ GET /api/system/status → diagnostics
├─ GET /api/qr/session → auth
└─ GET /api/registry/* → dashboard data
```

### BRIDGE_AI_OS Flow
```
avatar.html + mission_board.html + ubi.html
├─ WebSocket /ws/* → real-time events
├─ GET /api/avatar → avatar state
├─ GET /api/missions → task data
├─ GET /api/ubi → UBI status
├─ GET /api/wallet → wallet state
├─ GET /api/dex → token prices
└─ GET /api/emotion → emotion state
```

### bridgeos Flow
```
topology.html
├─ WS /terminal → local PTY
├─ GET /api/system/status → system info
└─ POST /api/auth/register → onboarding
```

---

## PORT ALLOCATION SUMMARY

| Port | Services | Systems |
|------|----------|---------|
| **80** | BRIDGE_AI_OS Gateway (primary) | BRIDGE_AI_OS |
| **443** | HTTPS routing | All (if enabled) |
| **3000** | system.js, Xcontainerx/server.js | aoe-unified-final |
| **3001** | BridgeAI ainode | BridgeAI |
| **4000** | bridgeos api.js | bridgeos |
| **5000** | server.js (aoe/bridgeos), bridge_local (Flask) | aoe-unified-final, bridgeos, bridge_local |
| **8080** | gateway.js (aoe), supernode/server (BridgeAI) | aoe-unified-final, BridgeAI |

---

## CONSOLIDATION CHALLENGE: Multi-Level Integration

### Level 1: Single System (aoe-unified-final) ✓ EASY
- Merge 4 dashboards → 1 SUPADASH
- Connect 4 backends
- ~500 tokens

### Level 2: Multi-System (aoe + BridgeAI + BRIDGE_AI_OS) 🔴 COMPLEX
- Merge 30+ dashboards → unified MEGA-SUPADASH
- Route across 3 gateway architectures
- Resolve port conflicts (8080, 5000 used by multiple systems)
- Integrate incompatible visualization stacks:
  - **Three.js 3D node maps** + **P5.js 2D topology** + **Babylon.js avatars**
  - **xterm.js terminals** + **WebSocket chat** + **voice interface**
  - **Registry system** + **Economics panels** + **Avatar state**
- Handle auth differences (QR tokens vs email vs Babylon faces)
- ~5000+ tokens estimated

---

## STRATEGY OPTIONS

### Option A: SUPADASH-LITE (Conservative)
**Scope:** aoe-unified-final only
- Merge 4 dashboards → 1 page
- Preserve all features (P5.js topology, terminals, economics, control panels)
- **Effort:** Low (~500 tokens)
- **Result:** Single entry point for current system

### Option B: SUPADASH-BRIDGE (Moderate)
**Scope:** aoe-unified-final + bridgeos
- Merge topology + onboarding across both systems
- Use aoe-unified as primary, bridgeos as fallback
- **Effort:** Medium (~1000 tokens)
- **Result:** Two topology systems unified

### Option C: SUPADASH-MEGA (Aggressive)
**Scope:** ALL 6 systems (50+ dashboards)
- Create master dashboard with tabs:
  - **System Tab** (P5.js topology)
  - **AI Registry Tab** (BridgeAI dashboards)
  - **Avatar Tab** (Babylon.js avatar + mission board)
  - **UBI Tab** (UBI claims + wallet)
  - **Marketplace Tab** (Task DEX)
  - **Terminal Tab** (xterm.js + voice)
- Unified data routing layer
- Port/auth reconciliation
- **Effort:** Very High (~5000+ tokens)
- **Result:** True mega-dashboard (all visualizations accessible from one place)

### Option D: SUPADASH-HUB (Recommended)
**Scope:** Create aggregator layer + keep systems modular
- New file: `public/supadash-hub.html` (port 8000)
- Hub shows:
  - Quick links to each system's dashboard
  - Health status for all 6 systems
  - Unified search/navigation
  - Single sign-on gateway
  - Real-time event aggregator from all backends
- Keep original dashboards running (fully functional)
- **Effort:** Medium (~1500 tokens)
- **Result:** Single landing page, access all visualizations, no data loss, modular architecture

---

## RECOMMENDATION: Option D (Hub) + Option A (Lite Upgrade)

**Phase 1: Create SUPADASH-HUB** (NEW file on port 3000)
```
┌────────────────────────────────────┐
│     SUPADASH HUB                   │
│  (Navigation + Health + Real-time) │
├────────────────────────────────────┤
│                                    │
│ ◈ Status                          │
│   • aoe-unified: ✓ (3000,5000,8080)│
│   • BridgeAI: ✓ (8080,3001)        │
│   • BRIDGE_AI_OS: ✓ (80)           │
│   • bridgeos: ✓ (5000,4000)        │
│   • bridge_local: ✓ (5000)         │
│                                    │
│ ◈ Quick Access                    │
│   [Topology] [Avatar] [Registry]  │
│   [UBI] [Marketplace] [Terminal]  │
│                                    │
│ ◈ Live Feed (aggregated SSE)      │
│   Events from all systems...      │
│                                    │
└────────────────────────────────────┘
```

**Phase 2: Upgrade aoe-unified-final → SUPADASH-LITE**
```
Create: public/supadash.html
├─ All topology.html features (core)
├─ Real terminals (Xcontainerx)
├─ Onboarding modal (integrated)
└─ Economics + panels (full)
```

**Phase 3 (Optional): Bridge Individual Systems**
- Add SUPADASH-HUB link to each system (BridgeAI, BRIDGE_AI_OS, etc.)
- Each system keeps own dashboards functional
- Hub provides unified entry + health view

---

## DECISION NEEDED

**Which approach?**
1. **Lite** (aoe-unified only) — Fast, focused ✓
2. **Hub + Lite** (aggregator + upgrade aoe) — Balanced ✓✓
3. **Mega** (all 50+ dashboards unified) — Ambitious, complex ✓✓✓

**My recommendation: Hub + Lite (Option D + A)**
- Get quick wins (aoe-unified SUPADASH working)
- Create navigation hub (visibility of all systems)
- No features lost
- Modular (each system stays functional)
- Foundation for future mega-consolidation

---

## Files to Create/Modify

**For Hub + Lite approach:**
1. **NEW:** `public/supadash.html` (Lite upgrade - aoe system only)
2. **NEW:** `public/supadash-hub.html` (Hub aggregator)
3. **UPDATE:** system.js (expose health endpoints for hub)
4. **UPDATE:** gateway.js (CORS for hub access)
5. **UPDATE:** RUNNING.md (document hub entry point)
6. **DOCS:** SUPADASH_ARCHITECTURE.md (link all systems)

