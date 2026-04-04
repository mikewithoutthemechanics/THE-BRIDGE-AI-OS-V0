# SUPADASH: Streaming Agent Architecture (8-Day Parallel Execution)

## Executive Summary

**Replace phase-based sequencing with overlapping agent streams.** Agents work on parallel tracks, sharing APIs via real-time contract publishing. No blocking. No waiting for "completion" — only for contract validation.

**Timeline reduction:** 16 days → 8 days (50% speedup, zero feature loss)

---

## Stream-Based Architecture Overview

Instead of:
```
Phase 1 (BLOCKS) → Phase 2 → Phase 3 → Phase 4 → ...
```

We execute:
```
Agent 2A (Gateway)    ┐
Agent 3A (Dashboard)  ├─ OVERLAPPING STREAMS
Agent 4A (Data)       ├─ Shared APIs via contracts
Agent 5A (Auth)       │  Real-time validation
Agent 6A (Tests)      ┘
```

Each agent **publishes contracts as they work**, not when they finish.

---

## 6 Independent Streams

### **Stream 1: Infrastructure (Gateway)**
**Owners:** L1 Agent 2A (Sonnet) + L2 Agent 2B (Nemotron)

#### Timeline
```
Day 1, Hour 0-4:   Agent 2A: Port mapping + gateway skeleton
Day 1, Hour 4:     📤 PUBLISH: unified-gateway-api-spec.json
Day 1, Hour 4+:    Agent 3A, 4A, 5A start work (against spec)
                   Agent 2B: Stress test harness (against skeleton)

Day 2-3:           Agent 2A: Gateway implementation (120+ endpoints)
                   Agent 2B: Continuous stress testing (1000 req/s target)

Day 4-5:           Agent 2A: Performance optimization + error handling
                   Agent 2B: Soak testing + bottleneck analysis

Day 5:             ✅ GATE: Gateway stable, p95 < 100ms
```

#### Deliverables
```
unified-gateway.js (core)
gateway-spec.json (contract - PUBLISHED EARLY)
stress-test-results.json (L2 validation)
```

#### Soft Dependencies
- Must define API contract by hour 4 of Day 1
- Can be skeleton + stubs (no implementation needed yet)
- Other agents build against contract, not implementation

#### Hard Gate (Before Cutover)
- ✅ All 120+ endpoints routable
- ✅ p95 latency < 100ms under 1000 req/s
- ✅ Zero 5xx errors in 24-hour soak

---

### **Stream 2: Dashboard Consolidation**
**Owners:** L1 Agent 3A (Sonnet) + L2 Agent 3B (Xiaomi)

#### Timeline
```
Day 1, Hour 0-2:   Agent 3A: Frontend audit (scan all 43 HTML files)
                   Output: dashboard-manifest.csv (which features in which file)

Day 1, Hour 2-4:   Agent 3B: UI test harness generation
                   Output: dashboard-test-spec.json

Day 1, Hour 4:     📤 PUBLISH: dashboard-manifest.json + feature-map.json
                   L2 can start validation testing immediately
                   Agent 3A can start merging TOPOLOGY (simplest)

Day 2-3:           Agent 3A: Parallel merge all 4 dashboards
                   - TOPOLOGY (HTML merge, p5.js + xterm.js integration)
                   - AVATAR (babylon.js consolidation + mode switching)
                   - REGISTRY (Tab interface + 3D globe)
                   - MARKETPLACE (Card grid + async refresh)

                   Agent 3B: UI/UX optimization (colors, responsive, accessibility)

Day 4:             Agent 3A: Final polish + feature verification
                   Agent 3B: Mobile-responsive validation

Day 5:             ✅ GATE: All 4 dashboards rendering, all 43 features accessible
```

#### Deliverables
```
supadash-topology.html (p5.js + xterm integration)
supadash-avatar.html (babylon.js 6-mode switching)
supadash-registry.html (Tab interface + vis.js graphs)
supadash-marketplace.html (Card grid)
index.html (entry point with navigation)
dashboard-feature-verification.csv (all 43 features ✓)
```

#### Soft Dependencies
- Needs gateway-api-spec by Day 1 hour 4 (to know API endpoints for data fetching)
- Can mock endpoints initially (real implementation comes from Agent 4A/5A)

#### Hard Gate (Before Cutover)
- ✅ All 4 dashboards load without errors
- ✅ All 43 features preserved + tested
- ✅ Mobile responsive (< 2s load on 4G)
- ✅ Zero console errors in Chrome/Firefox/Safari

---

### **Stream 3: Data Layer & Migrations**
**Owners:** L1 Agent 4A (Sonnet) + L2 Agent 4B (Minimax)

#### Timeline
```
Day 1, Hour 0-1:   Agent 4A: Database schema design (map 3 databases → 1)
                   Output: schema-evolution.sql

Day 1, Hour 1-4:   Agent 4A: Migration scaffolding + transaction safety
                   📤 PUBLISH: database-schema.json + migration-spec.json

Day 1, Hour 4+:    Agent 4B: Query optimization analysis
                   Agent 4A: Write migrations (Day 2-3)

Day 2-3:           Agent 4A: Implement migrations with rollback capability
                   Agent 4B: Index optimization + query plan analysis
                   (Both can test against dev DB simultaneously)

Day 4:             Agent 4A: Data integrity verification (0 rows lost)
                   Agent 4B: Performance baseline (p95 query time)

Day 5:             ✅ GATE: All data migrated, zero loss, queries < 50ms
```

#### Deliverables
```
migrations/001-initial-schema.sql
migrations/002-namespace-isolation.sql
migrations/003-index-optimization.sql
database-verification.json (row counts, checksums)
query-performance-baseline.json
```

#### Soft Dependencies
- Needs auth spec from Agent 5A (for user/role schema)
- Needs dashboard spec from Agent 3A (for data structure)
- Can build with placeholder schemas, refine later

#### Hard Gate (Before Cutover)
- ✅ Zero data loss (row counts verified)
- ✅ All 8 services can read their data
- ✅ Query p95 < 50ms (vs current baseline)
- ✅ Rollback tested (can revert in < 5 min)

---

### **Stream 4: Auth & Referral Services**
**Owners:** L1 Agent 5A (Haiku) + L2 Agent 5B (Minimax)

#### Timeline
```
Day 1, Hour 0-2:   Agent 5A: Auth specification (3 systems → 1 unified)
                   📤 PUBLISH: auth-api-spec.json + referral-spec.json

Day 1, Hour 2-4:   Agent 5B: Load test harness (1000 concurrent users)

Day 2-3:           Agent 5A: Implement unified-auth.js + unified-referral.js
                   Agent 5B: Continuous load testing (1000 users, measure latency)

Day 4:             Agent 5A: Credential migration (3 old → 1 new vault)
                   Agent 5B: Validate all user sessions work

Day 5:             ✅ GATE: All auth flows pass, 1000 user load < 200ms
```

#### Deliverables
```
unified-auth.js (single source of truth)
unified-referral.js (consolidated)
auth-api-spec.json (contract)
credential-migration.sql (3 systems → 1 vault)
load-test-results.json (1000 users)
```

#### Soft Dependencies
- Needs database schema from Agent 4A (for user tables)
- Needs gateway spec from Agent 2A (for endpoint routing)

#### Hard Gate (Before Cutover)
- ✅ All users can authenticate
- ✅ All referral records migrated
- ✅ Load test: 1000 users, p95 < 200ms
- ✅ Session hijacking tests pass (security baseline)

---

### **Stream 5: Continuous Testing & Validation**
**Owners:** L1 Agent 6A (Haiku) + L2 Agent 6B (Nemotron)

#### Timeline
```
Day 1, Hour 0+:    Agent 6A: Test framework setup
                   - Unit test harness (Jest)
                   - Integration test scaffold
                   - Feature verification template (43 features)
                   📤 PUBLISH: test-spec.json

Day 1, Hour 0+:    Agent 6B: Load test harness + monitoring dashboard
                   - Start collecting baseline metrics

Day 2:             As Agent 2A commits code → Agent 6A tests immediately
                   As Agents 3-5 commit → Tests run in CI/CD
                   Agent 6B: 24-hour soak test starts (will run 7 days)

Day 3-4:           Tests accumulate, failure detection in hours (not days)
                   Agent 6B: Continuous monitoring + bottleneck detection

Day 5+:            Agent 6A: Integration test suite (cross-service)
                   Agent 6B: 24/7 load test (→ Day 8)

Day 8, Hour 0:     ✅ GATE: 7 days of clean load test data
                   Feature matrix 100% verified
                   Zero regression vs baseline
```

#### Deliverables
```
test/unit/*.test.js (43 feature tests + 200 unit tests)
test/integration/*.test.js (cross-service flows)
test/load-test-results.json (7-day continuous data)
feature-verification-final.csv (all 43 ✓)
regression-analysis.json
```

#### Dependencies
- **Soft:** Can start writing tests from Day 1 (against mocks)
- **Hard:** Need real endpoints from Day 2+ to run integration tests

#### Hard Gate (Before Cutover)
- ✅ All 43 features tested and passing
- ✅ 7-day load test: zero errors, p95 < 500ms
- ✅ Zero regression vs baseline metrics
- ✅ Integration test suite 100% passing

---

### **Stream 6: Decisions & Governance**
**Owner:** L1 Agent 1 (Opus) + Decision Templates

#### Timeline
```
Day 1, Hour 0-1:   Agent 1: Define decision templates
                   - Port reassignment rules (auto-approve)
                   - API contract changes (auto-approve if backward-compatible)
                   - Feature removal (ESCALATE, never auto-approve)
                   📤 PUBLISH: decision-templates.json

Days 1-8:          All agents: Self-approve within templates
                   Agent 1: Escalation review only (< 5 decisions expected)

                   Daily standup (09:00 UTC, 5 min):
                   - Report blockers
                   - Highlight escalations
                   - Sync critical decisions

Day 8, Hour 23:    Final decision log → SUPADASH_CRITICAL_DECISIONS.md
```

#### Deliverables
```
SUPADASH_CRITICAL_DECISIONS.md (decision log)
decision-approvals.json (all agent decisions timestamped)
```

#### Impact
- **Before:** Agent 1 bottleneck, 15-min decision latency per decision
- **After:** < 2-min latency, Agent 1 only reviews exceptions

---

## Dependency Graph (Critical Path)

```
┌─────────────────────────────────────────────────────────────────┐
│ DAY 1 - Hour 0 (All streams start)                              │
└─────────────────────────────────────────────────────────────────┘

Stream 1: 2A Port Mapping (0-2h) → 2A Gateway Scaffold (2-4h) ───┐
                  ↓                         ↓                      │
Stream 2: 3A Frontend Audit (0-2h) ← 📤 gateway-api-spec (h4) ───┤
                  ↓                                                 │
Stream 3: 4A DB Schema (0-1h) → 4A Migration Scaffold (1-4h) ────┤
                  ↓                                                 │
Stream 4: 5A Auth Spec (0-2h) ────── 📤 auth-api-spec (h4) ───────┤
                  ↓                                                 │
Stream 5: 6A Test Scaffold (0-4h) ── 📤 test-spec (h4) ───────────┤
                  ↓                                                 │
Stream 6: 1 Decision Templates (0-1h) 📤 decision-templates (h1) ──┘

┌─────────────────────────────────────────────────────────────────┐
│ DAY 1-2 - Contract Publishing (No blocking)                     │
└─────────────────────────────────────────────────────────────────┘

           Hour 4         Day 2          Day 3         Day 4
            ↓              ↓              ↓             ↓
Gateway:   spec ────────────────────────────────────────✅
           ↑ (used by all others immediately)

Dashboard: spec ──→ merge-topology ──→ merge-avatar ──✅
           ↑                                            ↑
           └─ uses gateway-spec (ready at h4)          └─ validate all 43 features

Data:      schema ───────→ migrations ──→ verification ✅
           ↑                              ↑
           └─ auth from Auth Stream       └─ connect to real gateway

Auth:      spec ──────────────────────────────────────✅
           ↑ (used by Data + Gateway)

Tests:     scaffold ──────→ unit tests ──→ integration ✅
           ↑                (as code arrives from others)

Decisions: templates ✅ (applies to all 7 days)

┌─────────────────────────────────────────────────────────────────┐
│ CRITICAL PATH (Longest pole) = Dashboard Consolidation          │
│ Days 1-5: Topology → Avatar → Registry → Marketplace            │
│ Day 5: All 43 features must be ✓                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Real-Time Contract Publishing

### Contract Handoff Points (No Waiting)

```
Day 1, Hour 4:     Agent 2A publishes gateway-api-spec.json
                   ↓
                   Agents 3A, 4A, 5A can now build
                   (using stubs + mock endpoints)

Day 2, Hour 8:     Agent 2A publishes first working gateway
                   ↓
                   Agents 3-5 switch from mocks to real endpoints
                   (no code change, just re-target baseURL)

Day 3, Hour 12:    Agent 4A publishes migrated database
                   ↓
                   Agent 6B starts integration testing with real data

Day 5, Hour 0:     Agent 5A publishes unified auth
                   ↓
                   Full end-to-end tests can begin
                   (gateway → auth → data → dashboards)
```

### Contract Format (Minimal, Standardized)

```json
{
  "contract_id": "gateway-api-spec",
  "published_by": "Agent-2A",
  "published_at": "2026-03-25T04:00Z",
  "status": "skeleton",  // or "partial", "complete", "optimized"
  "endpoints": [
    {
      "path": "/api/topology",
      "method": "GET",
      "returns": "topology-object",
      "mock_response": { "nodes": [], "edges": [] }
    }
  ],
  "dependents": ["Agent-3A", "Agent-4A", "Agent-5A"],
  "gate_condition": "All endpoints working, p95 < 100ms"
}
```

---

## Communication Architecture (Real-Time)

### Between Agents on Same Laptop (L1)
```
Agent 2A → (publishes) → shared/gateway-spec.json
Agent 3A → (reads) → shared/gateway-spec.json
Agent 3A → (publishes) → shared/dashboard-manifest.json
Agent 6A → (reads) → shared/dashboard-manifest.json
```
**Latency:** < 1 second (file system)

### Between Laptops (L1 ↔ L2)
```
L1: Agent 2A publishes code
  ↓
L1: Git push (30 sec)
  ↓
L2: Git pull (30 sec)
  ↓
L2: Agent 2B stress tests immediately
  ↓
L2: Publishes results to git/stress-test-results.json
  ↓
L1: Git pull (30 sec)
  ↓
L1: Agent 2A sees results, adjusts if needed
```
**Latency:** < 2 min per feedback loop (vs 15 min polling)

### Real-Time Event Stream (Webhook)
```
L1 Agent commits code
  ↓
Git webhook fires
  ↓
L2 receives event (< 1 sec)
  ↓
L2 Agent 2B starts stress test immediately (not 15 min later)
  ↓
If failure detected, webhook fires to L1
  ↓
L1 notified in < 5 sec (not 15 min)
```

---

## Agent Work Schedule (8-Day Timeline)

### Day 1
```
L1:
  2A: Port mapping → Gateway scaffold (publish spec)
  3A: Frontend audit → Dashboard merge kickoff
  4A: DB schema design → Migration planning
  5A: Auth specification (publish spec)
  6A: Test framework (publish spec)
  1:  Decision templates

L2:
  2B: Stress test harness setup
  3B: UI test harness setup
  4B: Query analyzer ready
  5B: Load test harness ready
  6B: Monitoring dashboard live
  1B: Infrastructure ready (awaiting contracts)
```

### Days 2-3 (Parallel Development)
```
L1:
  2A: Implement gateway (120+ endpoints)
  3A: Merge TOPOLOGY + AVATAR dashboards
  4A: Implement migrations
  5A: Implement unified-auth + referral
  6A: Unit tests for above (as code arrives)

L2:
  2B: Continuous stress testing → finds bottlenecks
  3B: UI/UX optimization → feeds back to 3A
  4B: Query optimization → feeds back to 4A
  5B: Load testing → feeds back to 5A
  6B: 24/7 soak test begins
  1B: Conflict detection (none expected)
```

### Days 4-5 (Validation)
```
L1:
  2A: Performance tuning (p95 < 100ms)
  3A: Feature preservation (all 43 ✓)
  4A: Data integrity (0 rows lost)
  5A: Session management (1000 users)
  6A: Integration tests (cross-service)

L2:
  2B: Final stress test (peak load)
  3B: Mobile validation
  4B: Query regression (vs baseline)
  5B: Load test at peak concurrent users
  6B: Continuous soak (now 4 days running)
  1B: Prepare cutover checklist
```

### Days 6-7 (Hardening)
```
L1:
  2A: Error handling + edge cases
  3A: Polish + documentation
  4A: Backup/restore testing
  5A: Credential migration validation
  6A: Regression testing (full suite)

L2:
  2B: 24-hour stability window
  3B: Final accessibility check
  4B: Performance baseline finalized
  5B: Security test (1000 users, no hijacking)
  6B: Soak test 6 days running (← this is the gate)
  1B: Cutover dry-run planning
```

### Day 8 (Cutover)
```
Morning:  Dry-run cutover (L1 + L2 validate)
         ↓
Afternoon: Production cutover (if dry-run passes)
         ↓
L2 6B: 6B continues load test (now in production, monitoring)
```

---

## Gate Conditions (Hard Requirements Before Cutover)

Must ALL be ✅ before any code ships to production:

```
✅ Gateway
   - All 120+ endpoints routable
   - p95 latency < 100ms under 1000 req/s
   - Zero 5xx errors in 24-hour soak

✅ Dashboards
   - All 4 dashboards render without errors
   - All 43 features verified + tested
   - Mobile responsive (< 2s on 4G)

✅ Data
   - Zero rows lost in migration
   - All 8 services can read their data
   - p95 query time < 50ms
   - Rollback tested (< 5 min revert)

✅ Auth
   - All users can authenticate
   - All referrals migrated correctly
   - p95 auth latency < 200ms
   - Security tests passing (no hijacking)

✅ Testing
   - All 43 features tested
   - 7-day load test: zero errors
   - Zero regression vs baseline
   - Full integration test suite passing

✅ Decisions
   - All critical decisions logged
   - No outstanding escalations
   - Rollback plan approved
```

---

## Feature Loss Prevention (Streaming Context)

Because tests run continuously (not batch at end), feature loss is **detected in hours**, not days:

```
Day 2: Agent 3A merges TOPOLOGY dashboard
       ↓
Agent 6A: Runs feature test for TOPOLOGY features
       ↓
5 min: If a feature is missing, test fails
       ↓
Agent 3A notified immediately (not after 4-day merge batch)
       ↓
Agent 3A fixes in 1 hour
       ↓
L2 Agent 3B validates fix in next hour
       ↓
No cascading rework (vs finding bug on Day 5)
```

**Result:** All 43 features verified continuously, zero loss by Day 8.

---

## Comparison: Phases vs Streams

| Aspect | Phase-Based (16 days) | Streaming (8 days) |
|--------|----------------------|-------------------|
| **Start condition** | "Prev phase must finish" | "Contract published" |
| **Agent dependency** | Strict sequential | Overlapping with contracts |
| **Feedback latency** | End of phase (days) | Real-time (hours) |
| **Testing timing** | After all code (Days 8-14) | Continuous (Days 1-8) |
| **Bug discovery** | Late (Days 8+) | Early (Days 1-3) |
| **Rework impact** | Cascading (days lost) | Isolated (hours lost) |
| **Feature loss risk** | High (batch test at end) | Low (continuous test) |
| **Gateway bottleneck** | Yes (blocks phases 2-5) | No (others use stub spec) |
| **Decision latency** | 15 min per decision | < 2 min (templates) |
| **Cutover risk** | High (first full test) | Low (7 days tested) |

---

## Implementation Checklist

- [ ] **Day 1, Hour 0:** Launch all 6 streams simultaneously
  - [ ] Agent 2A: Port mapping script
  - [ ] Agent 3A: Frontend audit script
  - [ ] Agent 4A: DB schema design doc
  - [ ] Agent 5A: Auth spec template
  - [ ] Agent 6A: Test scaffold
  - [ ] Agent 1: Decision templates

- [ ] **Day 1, Hour 4:** Publish 5 contracts
  - [ ] gateway-api-spec.json
  - [ ] dashboard-manifest.json
  - [ ] database-schema.json
  - [ ] auth-api-spec.json
  - [ ] test-spec.json

- [ ] **Days 1-8:** Daily sync-up (5 min, Agent 1 + 1B)
  - [ ] Review contract changes
  - [ ] Escalate blockers
  - [ ] Update SUPADASH_CRITICAL_DECISIONS.md

- [ ] **Day 8, Morning:** Dry-run cutover
- [ ] **Day 8, Afternoon:** Production cutover
- [ ] **Days 8+:** L2 Agent 6B continues 24/7 monitoring

---

## TL;DR

**From phases to streams:**

```
OLD:   Phase 1 (wait) → Phase 2 (wait) → Phase 3 (wait) → ...
NEW:   Contract 1 (4h) ← Agent 2 / Agent 3 / Agent 4 / Agent 5
       Contract 2 (12h) ← All agents building, testing in parallel
       ...
       Day 8: All gates passed, cutover ready
```

**Result:** 8 days, zero feature loss, 50% faster, same quality.

