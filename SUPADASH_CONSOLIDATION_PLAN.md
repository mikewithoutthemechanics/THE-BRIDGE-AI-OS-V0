# SUPADASH — Unified Dashboard Consolidation Plan

## Current State: 5 Separate Dashboards + 4 Backend Servers

### DASHBOARDS (Must Consolidate)
| File | Lines | Purpose | Data Source |
|------|-------|---------|-------------|
| **topology.html** | 912 | **PRIMARY** - GOD MODE system intelligence | WS /terminal, GET /api/full, /api/economics, /api/audit |
| system-status-dashboard.html | 19 | Basic status nav | GET /health, /api/status |
| onboarding.html | 28 | User registration | POST /api/auth/register |
| Xcontainerx/public/index.html | 23 | Web terminal | WS /ws (Xcontainerx token auth) |
| ui.html (gateway) | 8 | Gateway nav | SSE /events/stream, GET endpoints |

### VISUALIZATION FEATURES TO PRESERVE

**topology.html Features** (912 lines = CORE):
- ✅ P5.js circular topology canvas (nodes, edges, packets, animations)
- ✅ 6-slot responsive terminal grid (bottom 40%)
- ✅ Left control panels: Monitor (CPU/MEM), Swarm Ops, AI Engine, Workflows
- ✅ Right control panel: System commands (FILES, DIR, PROCESSES, DOCKER, GIT, PORTS, SCAN)
- ✅ Economics panel (right side, collapsible): SaaS MRR, ARR, platform breakdown, VAT
- ✅ Live HUD (top): packet count, node/edge stats, clock, economics ticker, live pulse
- ✅ Status bar (bottom): WS status, session count, active session
- ✅ Command execution with audit logging
- ✅ Node-aware PTY terminal creation (click → new terminal)
- ✅ Finance client-side ledger (revenue/cost sim)

**Xcontainerx Terminal** (23 lines):
- ✅ XTerm.js WebSocket PTY
- ✅ Token-based auth
- ✅ Binary shell I/O, resize events

**system-status-dashboard.html Features** (19 lines):
- Links to: /health, /api/status, /go/save.php, /go/r.php

**onboarding.html Features** (28 lines):
- Email registration form → /api/auth/register

**gateway ui.html** (8 lines):
- Links to: /health, /health, /api/status, /go, /go/save.php, /go/r.php, /onboarding.html

---

## CONSOLIDATION STRATEGY: Create SUPADASH

### Phase 1: Create Unified Entry Point (SUPADASH)
**New File:** `public/supadash.html` (replaces topology.html as primary)

**Structure:**
```
┌─────────────────────────────────────────────┐
│ SUPADASH — Unified Intelligence Dashboard  │
├─────────────────────────────────────────────┤
│                                             │
│ • All topology.html features (core)        │
│ • Embedded terminal grid (from Xcontainerx)│
│ • Integrated onboarding widget             │
│ • Economics + billing panel                │
│ • Status + health indicators               │
│ • Navigation tabs (System / Onboarding)    │
│                                             │
└─────────────────────────────────────────────┘
```

### Phase 2: Architecture
1. **Keep topology.html as-is** (minimal changes) - use it as foundation
2. **Integrate onboarding** as modal/tab (show on first visit)
3. **Integrate Xcontainerx terminal** seamlessly (replace stub terminals with real PTY)
4. **Route all data** through unified endpoints
5. **Deprecate old dashboards** (redirect to supadash)

### Phase 3: Data Flow (Unified)
```
SUPADASH.html (single entry point)
    ├─ WS /terminal → Xcontainerx PTY shells
    ├─ GET /api/full → topology nodes
    ├─ GET /api/economics → billing data
    ├─ GET /api/audit → logs
    ├─ GET /health → system status
    ├─ POST /api/auth/register → user onboarding
    └─ GET /api/agents, /swarms → orchestrator status
```

### Phase 4: Features NOT to Lose

**Topology Rendering:**
- P5.js canvas initialization, node creation, edge drawing
- Packet animation loop
- Click handlers on nodes → new terminal

**Terminal Grid:**
- 6-terminal responsive layout
- Window rebalancing
- XTerm.js instances + WebSocket binding
- Session management
- Command execution

**Panels & Controls:**
- Monitor panel (CPU/MEM/UPTIME/LOAD)
- Swarm ops (distributed commands)
- AI engine (PM2 status, memory, audit view)
- Workflows (deploy, restart, migrate)
- Control panel (FILES, DIR, PROCESSES, MONITOR, DISK, DOCKER, GIT PULL/STATUS, HEALTH, NODE INFO, PORTS, SCAN)

**Economics:**
- Treasury balance tracking
- MRR/ARR calculations
- Platform breakdown (SaaS, affiliate, API)
- Pricing plans display
- Live ticker (revenue/cost updates every 5s)

**HUD & Status:**
- Live pulse dot (cyan)
- Stats ticker (NODES, EDGES, PKT count)
- Clock display
- WebSocket status
- Session counter
- Active terminal indicator

**Audit & Logging:**
- Audit log viewer
- Command history
- Finance ledger display

---

## IMPLEMENTATION CHECKLIST

### Step 1: Consolidate Terminal Layer
- [ ] Remove stub terminal initialization in topology.html
- [ ] Replace with real Xcontainerx WebSocket binding
- [ ] Ensure token auth works (CONTAINERX_TOKEN env)
- [ ] Test 6-terminal grid with real PTY

### Step 2: Integrate Onboarding
- [ ] Create modal/overlay from onboarding.html
- [ ] Trigger on first visit (check localStorage `user_registered`)
- [ ] After registration, show SUPADASH main UI
- [ ] POST endpoint mapped correctly

### Step 3: Consolidate APIs
- [ ] Verify all endpoints reachable:
  - system.js:3000 → /api/full, /api/economics, /api/audit, /api/agents, /swarms
  - gateway.js:8080 → /health, /billing, /events/stream
  - Xcontainerx:3000 → WS /terminal
  - server.js:5000 → /api/auth/register, /health
- [ ] Add fallbacks/stubs if servers offline
- [ ] Ensure CORS allows supadash origin

### Step 4: Test Feature Preservation
- [ ] Topology visualization renders ✓
- [ ] Economics panel shows live data ✓
- [ ] Terminal grid responsive & functional ✓
- [ ] All control panel buttons work ✓
- [ ] HUD updates in real-time ✓
- [ ] Status bar accurate ✓
- [ ] Onboarding flow completes ✓
- [ ] Audit log displays correctly ✓

### Step 5: Deprecation
- [ ] Redirect /system-status-dashboard.html → /supadash.html
- [ ] Redirect /onboarding.html → /supadash.html
- [ ] Redirect gateway ui.html → /supadash.html on port 8080
- [ ] Mark Xcontainerx/index.html as deprecated (integrated)
- [ ] Keep old files but document as legacy

---

## Files to Touch
1. **NEW:** `public/supadash.html` - Consolidated main dashboard
2. **UPDATE:** `system.js` - Ensure all APIs accessible, add CORS if needed
3. **UPDATE:** `gateway.js` - Route root `/` to supadash, keep SSE
4. **UPDATE:** `Xcontainerx/server.js` - Ensure WS works with supadash origin
5. **REDIRECT:** `public/onboarding.html` → supadash modal
6. **REDIRECT:** `public/system-status-dashboard.html` → supadash
7. **DOCS:** Update RUNNING.md → Single entry point: http://localhost:3000/supadash.html

---

## Success Criteria
✅ All visualizations rendering
✅ All terminals functional (real PTY)
✅ All data flowing live
✅ Onboarding integrated
✅ No feature loss
✅ Single entry point (supadash.html)
✅ Navigation between modes smooth

---

## Token Cost Estimate
- Copy topology.html → supadash.html: ~50 tokens
- Integrate onboarding modal: ~100 tokens
- Add XTerm real PTY binding: ~150 tokens
- API consolidation + CORS: ~80 tokens
- Testing + redirects: ~100 tokens
**Total: ~480 tokens for full consolidation**

---

## Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Terminal grid breaks on integration | Test with live Xcontainerx before committing |
| API endpoints unreachable | Add health checks, graceful fallbacks |
| CORS blocks cross-origin requests | Update server CORS headers |
| Token auth mismatch | Verify CONTAINERX_TOKEN matches between systems |
| onboarding form breaks | Keep original form logic, just embed in modal |

