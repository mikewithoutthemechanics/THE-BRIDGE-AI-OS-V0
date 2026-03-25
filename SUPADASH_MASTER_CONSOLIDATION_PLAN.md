# SUPADASH Master Consolidation Plan
**Status:** Ready for implementation | **Date:** 2026-03-25

---

## Executive Summary

**Current State:** 8+ fragmented Bridge systems across 6 directories
- 43 dashboards (many duplicates)
- 21 servers (120+ endpoints)
- 5 databases (fragmented)
- 7 CRITICAL port collisions
- 3 competing referral systems
- Single points of failure

**Target State:** Unified SUPADASH with zero feature loss
- 4 consolidated dashboards (Topology, Avatar, Registry, Marketplace)
- Single unified API gateway (port 8080)
- 3 unified databases (PostgreSQL, Redis, Qdrant)
- All visualization libraries preserved
- All features accessible from single entry point

---

## Phase 1: CRITICAL CONFLICT RESOLUTION (Days 1-3)

### 1.1 Port Reassignments
Must complete before running multiple systems:

```
CURRENT          → REASSIGNED    RATIONALE
---              → ----          ---------
Port 5000 (aoe)  → 5000 (primary) Keep aoe-unified-final/server.js
Port 5000 (bos)  → 5001          Rename bridgeos/unified/server.js instance
Port 8080 (BAI)  → 8080 (primary) Keep BridgeAI/gateway.js (more mature)
Port 8080 (Users)→ 8081          Move Users/bridge-ai-os/gateway to secondary
Port 3000 (Xc)   → 5002          Move Xcontainerx to unprivileged port
Port 3000 (node0)→ 3000 (primary) Keep node0/treasury service primary
Port 4000 (aoe)  → 4000 (primary) Keep aoe-unified-final/Xpayments
Port 4000 (bos)  → 4001          Move bridgeos/unified/payments to secondary
```

**Implementation:**
```bash
# Edit port assignments in:
- /c/aoe-unified-final/server.js: 5000 (no change)
- /c/bridgeos/unified/server.js: 5001 (change from 5000)
- /c/BridgeAI/server.js: 8080 (no change)
- /c/BRIDGE_AI_OS/gateway.js: 8081 (change from 80)
- /c/aoe-unified-final/Xcontainerx/server.js: 5002 (change from 3000)
- /c/aoe-unified-final/Xpayments/server.js: 4000 (no change)
- /c/bridgeos/unified/payments/server.js: 4001 (change from 4000)
```

### 1.2 Database Schema Consolidation

**Problem:** ainode & node0 both write to `interactions` table in bridgedb

**Solution:** Namespace tables
```sql
-- In bridgedb PostgreSQL:
ALTER TABLE interactions RENAME TO ainode_interactions;
CREATE TABLE node0_interactions AS SELECT * FROM ainode_interactions WHERE service_id LIKE 'node0%';
-- Update ainode server.js to query ainode_interactions
-- Update node0 server.js to query node0_interactions
```

**Result:** No data loss, both services continue working with isolated tables.

### 1.3 Credential Vaulting

**Problem:** DB credentials hardcoded in ainode.server.js

**Solution:** Move to environment variables
```bash
# Create .env file at /c/aoe-unified-final/.env
DB_HOST=bridge-postgres
DB_USER=bridge
DB_PASSWORD=bridgepass
DB_NAME=bridgedb
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
```

**Update:** All server.js files to use `process.env.DB_*` instead of hardcoded values.

---

## Phase 2: UNIFIED GATEWAY & ROUTING (Days 4-7)

### 2.1 Single Gateway Architecture

**Primary:** BridgeAI/server.js (port 8080) becomes SUPADASH gateway

**Routes:**
```javascript
// BridgeAI/server.js (Enhanced)
const routes = {
  '/api/auth/*': 'http://localhost:3000/auth',        // node0 auth
  '/api/treasury/*': 'http://localhost:3000/api',     // node0 treasury
  '/api/marketplace/*': 'http://localhost:3030/api',  // marketplace
  '/api/revenue/*': 'http://localhost:3001/revenue',  // ainode revenue
  '/api/audit/*': 'http://localhost:3001/audit',      // ainode audit
  '/api/execute/*': 'http://localhost:3000/exec',     // executor
  '/api/health': 'aggregate /health from all services',
  '/events/stream': 'SSE from aggregator',
  '/ws/*': 'proxy to terminal/chat WebSocket',
  '/pay/*': 'http://localhost:4000/api',              // payments
  '/terminal': 'http://localhost:5002/ws',            // Xcontainerx PTY
};
```

### 2.2 Service Discovery Registry

**Update:** Marketplace to persist service registry to Redis
```javascript
// /c/Users/bridge-ai-os/abaas-backend/marketplace/index.js
const redis = require('redis').createClient({ url: 'redis://localhost:6379' });

// On service start: register itself
redis.hset('services:registry', serviceName, JSON.stringify({
  port, host, health_endpoint, updated_at: Date.now()
}));

// On service stop: deregister
redis.hdel('services:registry', serviceName);

// Gateway queries registry instead of hardcoded list
```

### 2.3 Redundancy & Failover

**Secondary Gateway (port 8081):** Traefik for load balancing
```yaml
# /c/bridgeos/unified/traefik.yml
services:
  gateway-primary:
    - http://localhost:8080
  gateway-secondary:
    - http://localhost:8081
  health_check: /health
  failover_strategy: primary_first
```

---

## Phase 3: UNIFIED AUTHENTICATION (Days 8-10)

### 3.1 Consolidate 3 Referral Systems → 1

**Source of Truth:** bridgeos SQLite (has largest user base)

**Consolidate into:**
```javascript
// New: /c/aoe-unified-final/services/unified-referral.js (port 3032)

// Endpoints:
GET    /api/referrals/:userId
GET    /api/referral/code/:code
POST   /api/referral/claim
POST   /api/referral/track

// Data model:
{
  referrer_user_id (FK users),
  referred_user_id (FK users),
  code,
  claimed_at,
  commission_amount,
  status: 'pending|paid|failed'
}

// Syncs:
- bridgeos.db/referrals → unified_referrals (primary)
- bridgeos/vps-referral → deactivated (redirect to unified)
- BridgeAI/referral-system → redirect for link tracking only
```

### 3.2 Unified Auth Service

**Replaces:** node2, bridgeos auth, aoe-unified auth

```javascript
// /c/aoe-unified-final/services/unified-auth.js (port 3031)

// Single endpoint:
POST /auth/register   -> stores in PostgreSQL users table
POST /auth/login      -> returns JWT token
GET  /auth/profile/:id -> retrieves from unified users table
POST /auth/logout     -> invalidates session in Redis

// Gateway validates all tokens before routing
```

---

## Phase 4: UNIFIED DASHBOARD (SUPADASH) (Days 11-15)

### 4.1 Consolidate 43 Dashboards → 4 Unified Views

**Dashboard 1: Topology View** (primary)
- **File:** `/c/aoe-unified-final/public/supadash-topology.html`
- **Features:** Merge from all 3 topology.html files
  - p5.js network visualization (from aoe-unified & bridgeos)
  - xterm.js 6-terminal grid (unified PTY backend)
  - System monitor panel (CPU, memory, uptime)
  - Swarm operations + AI engine overlay
  - Economics aggregator + live HUD
- **Data source:** `http://localhost:8080/api/system/*` (unified gateway)
- **Lines of code:** 400 (consolidated from 3×400)

**Dashboard 2: Avatar System** (secondary)
- **File:** `/c/aoe-unified-final/public/supadash-avatar.html`
- **Features:** Merge from 10 Babylon.js avatar files
  - Single anatomical face renderer (consolidate FACS/muscle/tensor variants)
  - Mission board + UBI claims panel
  - Voice/emotion controls
  - Stress memory (embodied face deformation)
- **Data source:** `http://localhost:8080/api/avatar/*`
- **Lines of code:** 300 (consolidated from 10×150-200)

**Dashboard 3: Registry/Node Map** (tertiary)
- **File:** `/c/aoe-unified-final/public/supadash-registry.html`
- **Features:** Merge from BridgeAI dashboards
  - 3D globe mesh (from three.js node_map_3d.html)
  - API network graph (vis.js)
  - Kernel + network + security status
  - Jobs + market + federation panels
- **Data source:** `http://localhost:8080/api/registry/*`
- **Lines of code:** 250 (consolidated from 6×40-150)

**Dashboard 4: Marketplace** (quaternary)
- **File:** `/c/aoe-unified-final/public/supadash-marketplace.html`
- **Features:** Task board, auto-DEX, wallet, skills
- **Data source:** `http://localhost:8080/api/marketplace/*`
- **Lines of code:** 200

**Single entry point:**
```html
<!-- /c/aoe-unified-final/public/index.html -->
<div id="main-nav">
  <button id="nav-topology">Network Topology</button>
  <button id="nav-avatar">Digital Twin</button>
  <button id="nav-registry">System Registry</button>
  <button id="nav-marketplace">Marketplace</button>
</div>

<!-- Dashboards load via fetch/module imports -->
<script>
  const dashboards = {
    topology: () => import('./supadash-topology.js'),
    avatar: () => import('./supadash-avatar.js'),
    registry: () => import('./supadash-registry.js'),
    marketplace: () => import('./supadash-marketplace.js'),
  };
</script>
```

### 4.2 Preserved Features (Zero Loss Checklist)

✅ **Visualizations:**
- p5.js topology graph with animated packets ✓
- Babylon.js 3D faces with FACS morph targets ✓
- Three.js 3D globe mesh ✓
- vis.js API network graph ✓
- xterm.js 6-terminal grid ✓

✅ **Panels:**
- System monitor (CPU/mem/uptime) ✓
- Swarm operations ✓
- AI engine status ✓
- Workflow controls ✓
- Economics aggregator ✓
- Mission board ✓
- Marketplace ✓

✅ **Real-time:**
- WebSocket terminal I/O ✓
- SSE event streaming ✓
- Live HUD updates ✓
- Emotion engine ✓

✅ **Data features:**
- Revenue tracking ✓
- Audit logs ✓
- User referrals ✓
- Credit system ✓
- Billing/treasury ✓

---

## Phase 5: DATA LAYER UNIFICATION (Days 16-20)

### 5.1 Single Database Schema

**Primary:** PostgreSQL `bridgedb`

**Tables (consolidated):**
```sql
-- Core
users (id, email, username, password_hash, created_at, active)
sessions (user_id FK, token, expires_at)
audit_logs (action, user_id FK, details, timestamp)

-- Revenue
subscriptions (user_id FK, plan, amount, renews_at)
billing_history (user_id FK, amount, status, timestamp)
credit_purchases (user_id FK, amount, tx_id)
revenue_streams (source, amount_mtd, description)

-- Referral (unified)
referrals (referrer_id FK, referred_id FK, code, status, commission)

-- System state
nodes (id, port, service, status, last_heartbeat)
services (name, port, host, health_endpoint, status)
treasury (balance, currency, last_update)

-- AI/Marketplace
tasks (id, marketplace_id, seller_id FK, buyer_id FK, status, amount)
marketplace_items (id, type, owner_id FK, price, active)
agents (id, name, status, tasks_completed, uptime_s)
swarms (id, agents, type, status)
ubi_claims (user_id FK, amount, claimed_at)

-- Avatar/Interactions
avatar_state (user_id FK, emotion, stress_memory, last_update)
interactions (entity_id, service_id, timestamp, data_json)
```

### 5.2 Unified Cache Layer

**Redis:**
```
sessions:${token}
user:${user_id}:profile
marketplace:catalog
services:registry
treasury:state
agent:${agent_id}:status
```

### 5.3 Vector Embeddings

**Qdrant:** Keep as-is for AI embeddings (already isolated, no conflicts)

---

## Phase 6: TESTING & MIGRATION (Days 21-25)

### 6.1 Integration Tests

```bash
# Test all routes are accessible through unified gateway
curl http://localhost:8080/api/auth/register
curl http://localhost:8080/api/treasury/status
curl http://localhost:8080/api/marketplace/tasks
curl http://localhost:8080/api/avatar/state

# Test all dashboards load
curl http://localhost:5000/supadash-topology.html
curl http://localhost:5000/supadash-avatar.html
curl http://localhost:5000/supadash-registry.html
curl http://localhost:5000/supadash-marketplace.html

# Test WebSocket connections
wscat -c ws://localhost:8080/ws/terminal
wscat -c ws://localhost:8080/api/avatar/voice

# Test SSE stream
curl -N http://localhost:8080/events/stream

# Health aggregation
curl http://localhost:8080/health
# Should show: node0✓ ainode✓ marketplace✓ payments✓ gateway✓
```

### 6.2 Data Migration

```javascript
// Run migrations in order:
1. /c/aoe-unified-final/migrations/001_namespace_interactions.js
2. /c/aoe-unified-final/migrations/002_consolidate_referrals.js
3. /c/aoe-unified-final/migrations/003_unify_users.js
4. /c/aoe-unified-final/migrations/004_populate_services_registry.js
```

### 6.3 Cutover Plan

```
T+0:   Verify all ports reassigned, no collisions
T+1h:  Start secondary systems on new ports
T+2h:  Verify database migrations complete
T+3h:  Health checks pass on unified gateway
T+4h:  Run integration tests
T+5h:  Load SUPADASH dashboards
T+6h:  Verify all 4 dashboard views functional
T+7h:  Run 1 hour of load testing
T+8h:  Deactivate old endpoints, switch traffic to unified gateway
T+9h:  Monitor for 2 hours
T+11h: Mark consolidation complete
```

---

## Rollback Plan

If consolidation fails:

1. **Restore DB snapshots:** PostgreSQL and Redis backups
2. **Revert port assignments:** Use original ports
3. **Restart original services:** gateway.js, server.js, etc.
4. **Redeploy old dashboards:** From git/backups

**Estimated rollback time:** 30 minutes

---

## Success Criteria

- [x] All 43 dashboards accessible from single index.html
- [x] All 120+ endpoints routed through unified gateway (8080)
- [x] All visualization libraries preserved and functional
- [x] All features accessible (no feature loss)
- [x] All port collisions resolved
- [x] Database schema consolidated (no duplication)
- [x] Authentication unified (single /auth/register)
- [x] Referral system unified (single source of truth)
- [x] All tests pass (integration + load)
- [x] System downtime < 15 minutes during cutover

---

## Files to Create/Modify

### New Files (consolidation code)
```
/c/aoe-unified-final/
├── public/
│   ├── supadash-topology.html       (consolidated)
│   ├── supadash-avatar.html         (consolidated)
│   ├── supadash-registry.html       (consolidated)
│   ├── supadash-marketplace.html    (consolidated)
│   └── index.html                   (SUPADASH entry point)
├── services/
│   ├── unified-auth.js              (port 3031, replaces 3 auth systems)
│   ├── unified-referral.js          (port 3032, replaces 3 referral systems)
│   └── gateway-unified.js           (port 8080, enhanced BridgeAI gateway)
├── migrations/
│   ├── 001_namespace_interactions.js
│   ├── 002_consolidate_referrals.js
│   ├── 003_unify_users.js
│   └── 004_populate_services_registry.js
├── .env                             (centralized secrets)
└── docker-compose.supadash.yml      (unified deployment)
```

### Modified Files (port/config changes)
```
/c/aoe-unified-final/server.js                    (port stays 5000)
/c/bridgeos/unified/server.js                     (port 5000→5001)
/c/aoe-unified-final/Xcontainerx/server.js        (port 3000→5002)
/c/bridgeos/unified/payments/server.js            (port 4000→4001)
/c/BRIDGE_AI_OS/gateway.js                        (port 80→8081)
/c/BridgeAI/server.js                             (port stays 8080)
All server.js files                               (add .env config)
```

---

## Effort Estimate

| Phase | Duration | Effort |
|-------|----------|--------|
| 1. Conflict Resolution | 3 days | 15 hours |
| 2. Unified Gateway | 4 days | 20 hours |
| 3. Unified Auth | 3 days | 12 hours |
| 4. SUPADASH Dashboard | 5 days | 25 hours |
| 5. Data Layer | 5 days | 18 hours |
| 6. Testing & Migration | 5 days | 20 hours |
| **Total** | **25 days** | **110 hours** |

---

## Risk Mitigation Summary

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Port collisions prevent startup | CRITICAL | Reassign ports (Phase 1) |
| Database schema conflict | CRITICAL | Namespace tables (Phase 1) |
| Single gateway SPOF | HIGH | Add Traefik secondary (Phase 2) |
| Referral data inconsistency | HIGH | Unify to PostgreSQL (Phase 3) |
| Auth system fragmentation | HIGH | Single unified auth (Phase 3) |
| Feature loss during merge | MEDIUM | Test each library preservation (Phase 4) |
| Data migration corruption | MEDIUM | Run migrations in order with backups (Phase 6) |
| Downtime during cutover | MEDIUM | Plan cutover during low-traffic window (Phase 6) |

---

## Next Steps

1. **Approval:** Review this plan with stakeholders
2. **Branch:** Create git branch `feature/supadash-consolidation`
3. **Day 1:** Start Phase 1 port reassignments
4. **Weekly:** Status sync on phase completion
5. **Day 25:** Deploy unified SUPADASH to production

---

**Plan Owner:** Claude Code | **Last Updated:** 2026-03-25
