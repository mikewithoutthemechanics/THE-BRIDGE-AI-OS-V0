# SUPADASH Parallel Execution Strategy
**Optimized for 4 parallel subagent teams** | **Total duration: 16 days instead of 25**

---

## Executive: Why Parallel > Sequential

**Sequential (original plan):** 25 days (strict dependencies)
```
Phase 1 (3d) → Phase 2 (4d) → Phase 3 (3d) → Phase 4 (5d) → Phase 5 (5d) → Phase 6 (5d)
```

**Parallel (optimized):** 16 days (smart dependency management)
```
Phase 1 (2d) ─┬→ Phase 2 (4d) ──┐
             ├→ Phase 3 (3d) ──┼→ Phase 6 (4d) = 16 days total
             ├→ Phase 4 (5d) ──┤
             └→ Phase 5 (4d) ──┘
```

**Key insight:** Phase 1 is the ONLY true blocker. Everything else can run in parallel once Phase 1 completes.

---

## Subagent Team Structure

### Team A: Infrastructure (Phase 1 + Phase 2)
**Lead:** Infrastructure/DevOps agent
**Duration:** Days 1-7 (2d Phase 1, 5d Phase 2)
**Deliverables:**
- Port reassignments complete
- Database schema migrations
- Unified gateway (8080) functional
- Service registry in Redis

### Team B: Frontend (Phase 4)
**Lead:** Frontend consolidation agent
**Duration:** Days 1-7 (starts immediately, works in parallel)
**Deliverables:**
- 4 consolidated SUPADASH dashboards
- All 43 HTML files merged
- All visualization libraries preserved
- Component library extracted

### Team C: Authentication (Phase 3)
**Lead:** Auth/Identity agent
**Duration:** Days 3-7 (starts after Phase 1, 3 days total → parallel with team B)
**Deliverables:**
- Unified auth service (port 3031)
- Unified referral service (port 3032)
- 3 auth systems consolidated

### Team D: Data Layer (Phase 5)
**Lead:** Database/Data agent
**Duration:** Days 3-7 (starts after Phase 1, 4 days total → parallel with others)
**Deliverables:**
- PostgreSQL schema finalized
- Data migrations written
- Redis cache layer standardized
- Qdrant integration verified

### Team E: Testing & Integration (Phase 6)
**Lead:** QA/Testing agent
**Duration:** Days 8-14 (can start day 6, but intensive days 8-14)
**Deliverables:**
- Integration test suite
- Load testing results
- Data migration validation
- Rollback procedures

---

## Detailed Parallel Timeline

### Week 1: Parallel Setup & Build

#### **Day 1 (Monday)**

**Team A (Infrastructure):**
- [ ] Git branch: `feature/supadash-consolidation`
- [ ] Port reassignment map created and documented
- [ ] Database backup scripts written
- [ ] Identify which server.js files need port changes

**Team B (Frontend):**
- [ ] Audit all 43 HTML files (already done by Agent 3, now catalog them)
- [ ] Group by type: topology (3), avatar (12), registry (8), marketplace (6), onboarding (5), utility (9)
- [ ] Identify visualization library usage (p5.js, babylon.js, three.js, vis.js, xterm.js)
- [ ] Create feature matrix: which HTML has which features

**Team C (Auth):**
- [ ] Analyze 3 auth systems (node2, bridgeos, aoe-unified)
- [ ] Compare schemas: users, sessions, tokens, credentials
- [ ] Plan consolidation: which is source of truth?

**Team D (Data):**
- [ ] Analyze 5 databases (bridgeos.db, bridgedb, postgres, redis, qdrant)
- [ ] Check for data conflicts, overlaps
- [ ] Plan migration order

**Team E (Testing):**
- [ ] Set up test infrastructure
- [ ] Create integration test templates
- [ ] Define success criteria for each phase

---

#### **Day 2 (Tuesday)**

**Team A (Infrastructure) - PHASE 1 EXECUTION:**
```bash
# Subtasks:
1. Edit /c/aoe-unified-final/server.js → keep port 5000
2. Edit /c/bridgeos/unified/server.js → change 5000 → 5001
3. Edit /c/aoe-unified-final/Xcontainerx/server.js → change 3000 → 5002
4. Edit /c/aoe-unified-final/Xpayments/server.js → keep port 4000
5. Edit /c/bridgeos/unified/payments/server.js → change 4000 → 4001
6. Edit /c/BRIDGE_AI_OS/gateway.js → change 80 → 8081
7. Verify all .env files use process.env for DB credentials
8. Test no port collisions: netstat + npm start all servers
```
- [ ] All port reassignments complete (end of day)
- [ ] No collisions verified

**Team B (Frontend) - START DASHBOARD CONSOLIDATION:**
```javascript
// Create consolidated dashboard templates
/c/aoe-unified-final/public/
  ├── supadash-topology.html (consolidate 3 topology.html files)
  ├── supadash-avatar.html (consolidate 12 avatar/face files)
  ├── supadash-registry.html (consolidate 8 registry/dashboard files)
  ├── supadash-marketplace.html (consolidate 6 marketplace files)
  └── index.html (SUPADASH entry point with nav)
```
- [ ] Topology template created with all p5.js + xterm.js features
- [ ] Avatar template created with all babylon.js face renderers merged
- [ ] Dashboard consolidation strategy documented

**Team C (Auth):**
- [ ] Decision: which auth system is authoritative?
- [ ] Schema comparison document
- [ ] Migration plan from 3 systems → 1

**Team D (Data):**
- [ ] Database consolidation strategy document
- [ ] SQL migration scripts outlined
- [ ] Table namespace plan finalized

**Team E (Testing):**
- [ ] Test suite structure created
- [ ] CI/CD pipeline configured

---

#### **Days 3-4 (Wednesday-Thursday) - Phase 1 Complete, Parallel Teams Go Full Speed**

**Team A (Phase 2 - Unified Gateway - STARTS NOW):**
```javascript
// /c/BridgeAI/server.js becomes SUPADASH gateway (port 8080)
Refactor to proxy all routes:
- /api/auth/* → 3031 (unified auth)
- /api/referral/* → 3032 (unified referral)
- /api/treasury/* → 3000 (node0)
- /api/marketplace/* → 3030 (marketplace)
- /api/revenue/* → 3001 (ainode)
- /api/audit/* → 3001 (ainode)
- /api/execute/* → 3000 (executor)
- /terminal → 5002 (Xcontainerx PTY)
- /ws/* → proxy WebSocket
- /pay/* → 4000 (payments)
- /health → aggregate from all services
- /events/stream → SSE aggregator
```
- [ ] Gateway refactored and tested against mock services
- [ ] Service discovery registry in Redis
- [ ] Health aggregation endpoint functional

**Team B (Phase 4 - Dashboard Consolidation - FULL BUILD):**

**Strategy for Dashboard Consolidation:**

**TOPOLOGY DASHBOARD (Merge 3 files → 1):**
```html
<!-- Sources:
  1. /c/aoe-unified-final/Xpublic/topology.html (400 LOC)
  2. /c/bridgeos/unified/public/topology.html (400 LOC)
  3. /c/BridgeAI/registry/topology.html (not found, using bridge_os.html variant)
-->

<!-- Architecture: -->
<html>
  <head>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm@4.18.0/lib/xterm.min.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@4.18.0/css/xterm.css" />
  </head>
  <body>
    <!-- P5.js Canvas Container -->
    <div id="p5-canvas-container" style="width: 60%; height: 100%; float: left;"></div>

    <!-- Left Control Panels -->
    <div id="left-panels" style="width: 20%; float: left;">
      <div id="monitor-panel"><!-- CPU, Memory, Uptime --></div>
      <div id="swarm-panel"><!-- Agent status --></div>
      <div id="ai-panel"><!-- AI engine --></div>
      <div id="workflow-panel"><!-- Deployments --></div>
    </div>

    <!-- Right Control Panels -->
    <div id="right-panels" style="width: 20%; float: right;">
      <div id="control-panel"><!-- File browser, git, npm --></div>
      <div id="economics-panel"><!-- Revenue, MRR, ARR --></div>
    </div>

    <!-- Terminal Grid (bottom 40%) -->
    <div id="terminals" style="position: fixed; bottom: 0; width: 100%; height: 40%;">
      <!-- 6 resizable terminals with xterm.js -->
      <div class="term-slot" id="term-1"></div>
      <div class="term-slot" id="term-2"></div>
      <!-- ... up to 6 -->
    </div>

    <!-- HUD Overlay (top) -->
    <div id="hud" style="position: absolute; top: 0; right: 0;">
      Live stats, packet count, clock, economics ticker
    </div>

    <!-- AI Overlay (bottom canvas) -->
    <div id="ai-overlay">Agent balances, status</div>
  </body>
</html>

<script>
// Merge all p5.js functions from 3 files
const sketch = (p) => {
  p.setup = () => { /* merged */ };
  p.draw = () => { /* merged topology + packets */ };
  p.mousePressed = () => { /* merged click handlers */ };
  // ... all 3 files' functions merged
};
new p5(sketch, 'p5-canvas-container');

// Merge all xterm.js terminal initialization from 3 files
const terminals = [];
for (let i = 1; i <= 6; i++) {
  const term = new Terminal();
  const socket = new WebSocket('ws://localhost:8080/ws/terminal/' + i);
  socket.onmessage = (e) => term.write(e.data);
  terminals.push(term);
}

// Merge all panel data fetching logic
fetch('http://localhost:8080/api/system/monitor').then(...); // CPU/mem
fetch('http://localhost:8080/api/orchestrator/status').then(...); // Agents
fetch('http://localhost:8080/api/economics').then(...); // Revenue
// ... all fetch calls merged
</script>
```

**AVATAR DASHBOARD (Merge 12 babylon.js files → 1):**
```html
<!-- Sources:
  /c/BRIDGE_AI_OS/avatar/public/anatomical_face*.html (12 variants)
  Each is 100-200 LOC, all render babylon.js 3D face
-->

<html>
  <head>
    <script src="https://cdn.babylonjs.com/babylon.min.js"></script>
    <script src="https://cdn.babylonjs.com/materialsLibrary/babylonjs.materials.min.js"></script>
  </head>
  <body>
    <div id="renderCanvas" style="width: 100%; height: 100%;"></div>

    <div id="avatar-controls">
      <button id="render-mode">Render Mode</button>
      <select id="expression-select">
        <option>Neutral</option>
        <option>Happy (FACS)</option>
        <option>Angry (FACS)</option>
        <option>Sad (FACS)</option>
        <option>Muscle Deformation</option>
        <option>Tension Balanced</option>
        <option>Constrained</option>
        <option>Embodied (Stress)</option>
      </select>
    </div>

    <div id="mission-board">Mission tasks</div>
    <div id="ubi-panel">UBI claims</div>
    <div id="voice-panel">Voice controls</div>
    <div id="emotion-panel">Emotion display</div>
  </body>
</html>

<script>
// Babylon.js scene setup (merge all 12 files' scene creation)
const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas);
const scene = new BABYLON.Scene(engine);

// Merge all face model variants into single switchable mesh
class AvatarFace {
  constructor() {
    this.baseGeometry = createAnatomicalFace(); // Base from anatomical_face.html
  }

  applyFACSmorphs() { /* from anatomical_face_facs.html */ }
  applyMuscleTensors() { /* from anatomical_face_vector_muscle.html */ }
  applyVolumePreservation() { /* from anatomical_face_tension_balanced.html */ }
  applyConstraints() { /* from anatomical_face_constrained_system.html */ }
  applyStressMemory() { /* from anatomical_face_embodied.html */ }
}

const avatar = new AvatarFace();

// Merge all control logic (emotion, voice, mission board, UBI)
document.getElementById('expression-select').addEventListener('change', (e) => {
  switch(e.target.value) {
    case 'Happy (FACS)': avatar.applyFACSmorphs(); break;
    case 'Muscle Deformation': avatar.applyMuscleTensors(); break;
    // ... all cases
  }
});

// Merge all data fetching (mission board, UBI, emotion state)
fetch('http://localhost:8080/api/avatar/state').then(...);
fetch('http://localhost:8080/api/mission/board').then(...);
fetch('http://localhost:8080/api/ubi/balance').then(...);
</script>
```

**REGISTRY DASHBOARD (Merge 8 files → 1):**
```html
<!-- Sources:
  /c/BridgeAI/registry/kernel_dashboard.html
  /c/BridgeAI/registry/network_dashboard.html
  /c/BridgeAI/registry/security_dashboard.html
  /c/BridgeAI/registry/federation_dashboard.html
  /c/BridgeAI/registry/jobs_dashboard.html
  /c/BridgeAI/registry/market_dashboard.html
  /c/BridgeAI/registry/node_map_3d.html (three.js)
  /c/BridgeAI/registry/bridge_os.html
-->

<html>
  <head>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/vis-network@9.1.0/dist/vis-network.min.js"></script>
  </head>
  <body>
    <div id="tabs">
      <button class="tab" data-tab="kernel">Kernel</button>
      <button class="tab" data-tab="network">Network</button>
      <button class="tab" data-tab="security">Security</button>
      <button class="tab" data-tab="federation">Federation</button>
      <button class="tab" data-tab="jobs">Jobs</button>
      <button class="tab" data-tab="market">Market</button>
      <button class="tab" data-tab="3d-map">Node Map 3D</button>
    </div>

    <div id="tab-content">
      <!-- Each tab loads content -->
      <div id="kernel" class="tab-content"><pre id="kernel-data"></pre></div>
      <div id="network" class="tab-content">
        <div id="network-graph" style="width: 100%; height: 500px;"></div>
      </div>
      <div id="3d-map" class="tab-content">
        <div id="three-canvas" style="width: 100%; height: 600px;"></div>
      </div>
      <!-- ... other tabs -->
    </div>
  </body>
</html>

<script>
// Merge all three.js code from node_map_3d.html
const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
const mesh = createGlobeMesh(); // Node map 3D globe

// Merge all vis.js code from api_graph.html
const graphData = { nodes: [...], edges: [...] };
const graphOptions = { /* merged */ };
const network = new vis.Network(document.getElementById('network-graph'), graphData, graphOptions);

// Merge all panel refresh logic
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', async (e) => {
    const tabName = e.target.dataset.tab;
    const data = await fetch(`http://localhost:8080/api/registry/${tabName}`);
    document.getElementById(tabName).innerHTML = formatData(data);
  });
});
</script>
```

**MARKETPLACE DASHBOARD (Merge 6 files → 1):**
```html
<!-- Sources: Various marketplace HTML files, task boards, DEX, wallet -->

<html>
  <body>
    <div id="marketplace-grid">
      <div class="market-card" id="task-board">Tasks</div>
      <div class="market-card" id="auto-dex">Auto DEX</div>
      <div class="market-card" id="wallet">Wallet</div>
      <div class="market-card" id="skills">Skills</div>
      <div class="market-card" id="portfolio">Portfolio</div>
      <div class="market-card" id="stats">Stats</div>
    </div>
  </body>
</html>

<script>
// Merge all marketplace API calls
const marketplace = {
  async loadTasks() { return fetch('http://localhost:8080/api/marketplace/tasks'); },
  async loadDEX() { return fetch('http://localhost:8080/api/dex/rates'); },
  async loadWallet() { return fetch('http://localhost:8080/api/wallet/balance'); },
  // ... all merged
};

// Merge all UI refresh logic
setInterval(() => marketplace.refresh(), 5000);
</script>
```

- [ ] All 4 consolidated dashboards HTML created
- [ ] All visualization libraries integrated (p5.js, babylon.js, three.js, vis.js, xterm.js)
- [ ] Feature parity verified against original 43 HTML files
- [ ] Single entry point (index.html) with navigation created

**Team C (Auth - Phase 3):**
- [ ] Unified auth service code written (port 3031)
- [ ] Unified referral service code written (port 3032)
- [ ] Database schema for users/referrals finalized
- [ ] Migration scripts for 3→1 consolidation written

**Team D (Data - Phase 5):**
- [ ] PostgreSQL schema namespace SQL written
- [ ] Redis cache structure standardized
- [ ] Qdrant configuration verified
- [ ] All migration scripts written (dry-run tested)

**Team E (Testing):**
- [ ] Unit tests written for each new service
- [ ] Integration test templates prepared
- [ ] Load test scenarios defined

---

#### **Days 5-7 (Friday-Sunday)**

**Team A (Gateway):**
- [ ] Service discovery Redis integration complete
- [ ] All 120+ endpoint routes tested and verified
- [ ] Health aggregation endpoint functional
- [ ] Failover to secondary gateway (8081) working

**Team B (Dashboards):**
- [ ] All 4 SUPADASH dashboards fully functional
- [ ] All features from 43 original files present
- [ ] Navigation/switching between dashboards smooth
- [ ] WebSocket connections to unified gateway working
- [ ] Performance optimizations (lazy load, code split)

**Team C (Auth):**
- [ ] Unified auth service running on 3031
- [ ] Unified referral service running on 3032
- [ ] Login/registration tested against unified gateway
- [ ] Token validation working

**Team D (Data):**
- [ ] All migrations tested in staging environment
- [ ] Data consistency verified
- [ ] Backup/restore procedures documented

**Team E (Testing):**
- [ ] Integration tests running
- [ ] No breaking changes detected
- [ ] Load test baseline established

---

### **Days 8-14 (Week 2) - Integration & Refinement**

**All teams working together:**
- [ ] End-to-end tests: Login → Dashboard → Terminal → Feature usage
- [ ] Cross-team integration issues resolved
- [ ] Performance tuning complete
- [ ] Documentation finalized
- [ ] Rollback procedures tested

---

### **Days 15-16 (Days 15-16) - Cutover**

**Day 15 (Friday):**
- [ ] Final backup taken
- [ ] All systems running on new unified ports
- [ ] Health checks passing
- [ ] Team on standby

**Day 16 (Saturday - low traffic window):**
- [ ] 00:00 - Begin cutover
- [ ] 02:00 - All services migrated
- [ ] 04:00 - Full 2-hour smoke test
- [ ] 06:00 - Declare success OR activate rollback
- [ ] 08:00 - Team monitoring complete

---

## Parallel Subagent Commands

When ready to execute, launch 5 agents in parallel:

```bash
# Agent A: Infrastructure
claude --agent infrastructure \
  "Execute Phase 1 (port reassignments, DB schema) Days 1-2, then Phase 2 (Gateway) Days 3-7"

# Agent B: Frontend
claude --agent frontend \
  "Consolidate 43 HTML dashboards into 4 SUPADASH views (Topology, Avatar, Registry, Marketplace), preserve all features"

# Agent C: Auth
claude --agent auth \
  "Consolidate 3 auth systems + 3 referral systems → unified services on ports 3031-3032"

# Agent D: Data
claude --agent data \
  "Migrate to unified PostgreSQL + Redis + Qdrant, write all migration scripts, test in staging"

# Agent E: Testing
claude --agent testing \
  "Build integration test suite, load tests, validate data integrity, rollback procedures"
```

---

## Critical Path (What MUST complete on schedule)

1. **Phase 1 completion (end of Day 2)** — Everything else blocked without this
2. **Gateway routing (end of Day 7)** — Dashboards need APIs to call
3. **Dashboard consolidation (end of Day 7)** — Needed for day 8 integration
4. **Cutover (Days 15-16)** — All phases must complete by Day 14

---

## Risk Mitigation in Parallel Execution

| Risk | Mitigation |
|------|-----------|
| Teams create conflicting code | Daily standup, shared git branch, code review |
| Phase 1 delays cascade | Team A is critical path; backups available |
| Gateway breaks dashboards | Team E integration testing catch issues early |
| Data migration fails | Team D tests migrations in staging first |
| Dashboard features missing | Team B tracks feature matrix against originals |

---

## Success Criteria (End of Day 16)

- [x] All 120+ endpoints routed through unified gateway (8080)
- [x] All 43 dashboards accessible from 4 SUPADASH views
- [x] Zero features lost in consolidation
- [x] 3 auth systems → 1 unified
- [x] 3 referral systems → 1 unified
- [x] All databases migrated to unified schema
- [x] All tests passing (integration + load)
- [x] System downtime < 2 hours during cutover
- [x] Rollback procedure tested and available

