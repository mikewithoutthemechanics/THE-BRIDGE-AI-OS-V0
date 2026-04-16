# SUPADASH: Compact Execution Guide

## 13 Agents, 2 Laptops, 16 Days, Zero Feature Loss

### Laptop 1 (Claude Code - Port 9000)
| Agent | Model | Task |
|-------|-------|------|
| 1 | Opus 4.6 | Decisions + approvals |
| 2A | Sonnet 4.6 | Gateway code |
| 3A | Sonnet 4.6 | Dashboard merge (43→4) |
| 4A | Sonnet 4.6 | SQL migrations |
| 5A | Haiku 4.5 | Auth/referral services |
| 6A | Haiku 4.5 | Unit tests |

**Token budget:** 450,000 total

---

### Laptop 2 (Kimi Code - Port 9001)
| Agent | Model | Task |
|-------|-------|------|
| 1B | Kimi | Cross-laptop verification + conflict detection |
| 2B | Nemotron | Gateway stress test |
| 3B | Xiaomi x2 | UI optimization |
| 4B | Minimax x2 | SQL optimization |
| 5B | Minimax | Auth validation |
| 6B | Nemotron | 24/7 load testing |

**Token budget:** Unlimited

---

## Timeline

```
Days 1-2:   L1: Port reassignments (Agent 2A)
            L2: Waiting

Days 3-7:   L1: Gateway (2A) + Dashboard (3A) + Data (4A) + Auth (5A)
            L2: Verify + optimize all 4 (Agents 2B-5B in parallel)

Days 8-14:  L1: Integration tests (Agent 6A)
            L2: 168-hour load test (Agent 6B) + deep verification

Day 15:     Both: Cutover dry-run

Day 16:     L1: Production cutover
            L2: Monitor + failover ready

TOTAL: 16 days (vs 25 sequential)
```

---

## Git Sync (Single Source of Truth)

```
Every 15 min:
L1 → git push: code, status, logs
L2 → git push: verification results, optimizations
Both ← git pull: see each other's updates

Files:
- SUPADASH_FEATURE_MATRIX.md (source of truth)
- AGENTS/AGENT_*.json (status)
- LOGS/LAPTOP_*.log (progress)
- SHARED/*.json (contracts + specs)
```

---

## REST APIs (Inter-Laptop Communication)

**L1 (Port 9000):**
- `GET /api/agent/{id}/status` → agent status
- `POST /api/decision/{id}/approve` → approve decision
- `POST /api/blocker/{id}/escalate` → alert for issue

**L2 (Port 9001):**
- `GET /api/verification/{component}/results` → verification report
- `POST /api/conflict/detect` → conflict alert to L1

---

## Startup

### Laptop 1
```bash
cd /c/aoe-unified-final
git checkout -b feature/supadash-consolidation
node agents/laptop1-orchestrator.js --port 9000 &
# Launches Agents 1, 2A, 3A, 4A, 5A, 6A
```

### Laptop 2
```bash
cd /c/aoe-unified-final
git checkout -b feature/supadash-consolidation
node agents/laptop2-orchestrator.js --port 9001 &
# Launches Agents 1B, 2B, 3B, 4B, 5B, 6B
# Auto-connects to Laptop 1
```

---

## Phase Deliverables

| Phase | Days | L1 Outputs | L2 Verification |
|-------|------|-----------|-----------------|
| 1 | 1-2 | Port assignments | Collision check ✓ |
| 2 | 3-7 | unified-gateway.js | Stress test (1000 req/s) ✓ |
| 3 | 3-7 | supadash-*.html (4 dashboards) | UI/UX optimization ✓ |
| 4 | 3-7 | migrations/*.sql | Query optimization ✓ |
| 5 | 3-7 | unified-auth.js + referral.js | Load test (1000 users) ✓ |
| 6 | 8-14 | Integration tests | 24/7 soak test ✓ |

---

## Monitoring

**Both laptops:**
```bash
# L1 status
curl http://localhost:9000/api/status | jq

# L2 status
curl http://localhost:9001/api/status | jq

# Shared git status
git status
git log --oneline | head -10
```

---

## Key Rules

1. **Phase 1 (Days 1-2) is blocking** — everything else waits
2. **Parallel Days 3-7** — all 4 phases run simultaneously (L1 code, L2 verify)
3. **Zero feature loss** — all 43 features → 4 dashboards verified by L2
4. **No manual decisions** — L2 auto-detects conflicts, escalates to L1 Agent 1
5. **Daily standup 09:00 UTC** — 15 min, L1 Agent 1 chairs, L2 Agent 1B reports

---

## Conflict Resolution

**L2 detects conflict:**
```
L2 Agent 1B → REST API alert to L1 (port 9000)
             ↓
L1 Agent 1 (Opus) reviews (< 15 min)
             ↓
Decision → SUPADASH_CRITICAL_DECISIONS.md
             ↓
git push → All agents see decision
             ↓
Agents apply fix + report completion
```

---

## Failover

**L1 down:** L2 continues verification, manual team reviews decisions
**L2 down:** L1 continues (L2 is verification only, not blocking)
**Both down:** Last git state is source of truth, resume on restart

---

## Success Criteria

- ✅ All 120+ endpoints routed through port 8080
- ✅ All 43 features in 4 dashboards
- ✅ Zero data loss (migrations verified)
- ✅ 3 auth systems → 1 unified
- ✅ 3 referral systems → 1 unified
- ✅ Load test: p95 < 1s, zero errors
- ✅ Cutover downtime < 2 hours

---

## Commands Reference

```bash
# Check status
curl http://localhost:9000/api/status | jq '.phase'

# View logs
tail -f /c/aoe-unified-final/LOGS/LAPTOP_1.log
tail -f /c/aoe-unified-final/LOGS/LAPTOP_2.log

# Pull latest L2 findings
git pull origin feature/supadash-consolidation

# Check feature matrix
cat SUPADASH_FEATURE_MATRIX.md | grep "✓"

# View decisions
cat SUPADASH_CRITICAL_DECISIONS.md | tail -20

# Monitor token usage
curl http://localhost:9000/api/status | jq '.token_usage'
```

---

## File Structure

```
/c/aoe-unified-final/
├── SUPADASH_DISTRIBUTED_ORCHESTRATION.md (full spec)
├── SUPADASH_COMPACT_GUIDE.md (this file)
├── SUPADASH_FEATURE_MATRIX.md (master)
├── SUPADASH_CRITICAL_DECISIONS.md (decisions log)
├── agents/
│   ├── laptop1-orchestrator.js
│   ├── laptop2-orchestrator.js
│   ├── agent-1.js (Opus)
│   ├── agent-2a.js (Sonnet)
│   ├── agent-1b.js (Kimi)
│   └── ... (all 13 agents)
├── LOGS/
│   ├── LAPTOP_1.log
│   └── LAPTOP_2.log
├── AGENTS/
│   ├── AGENT_1_STATUS.json
│   ├── AGENT_1B_STATUS.json
│   └── ... (all 13 status files)
└── SHARED/
    ├── gateway-spec.json
    ├── database-schema.sql
    └── dashboard-spec.json
```

---

## TL;DR

**Start both laptops, agents run in parallel, L2 verifies L1's work while they code, conflicts auto-escalate, done in 16 days instead of 25.**

```bash
# Laptop 1
./SUPADASH_LAUNCH_LAPTOP1.sh

# Laptop 2 (different machine)
./SUPADASH_LAUNCH_LAPTOP2.sh

# Monitor both
watch -n 5 'git log --oneline | head -5'
```

✅ **16 days** | ✅ **13 agents** | ✅ **450K Claude tokens** | ✅ **0 features lost**
