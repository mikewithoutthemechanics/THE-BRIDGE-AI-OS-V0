# LAPTOP 3: MINIMAX OPTIMIZATION - HANDS-FREE DEPLOYMENT

Deploy Laptop 3 (Minimax M2.5 with parallel sub-agents) completely unattended.

---

## Deployment

From **Laptop 1**, after you run bootstrap:

```bash
# Deploy setup script to Laptop 3
ssh laptop3 "bash -s" < /c/aoe-unified-final/setup-laptop3-unattended.sh &
```

**What it does:**
- ✅ Pre-flight checks (Node, npm, git, directories)
- ✅ Waits for L1 to bootstrap (30-min timeout)
- ✅ Syncs code from L1
- ✅ Launches L3 Minimax orchestrator with N instances
- ✅ Each instance spawns 3 sub-agents (code consolidation, query optimization, perf tuning)
- ✅ Sets up auto-pull daemon (every 5 min)
- ✅ Sets up health check daemon (every 60 sec)
- ✅ Keeps connection alive

---

## Configuration

### Default: 4 Minimax Instances

```bash
# Default: 4 instances, 12 sub-agents total
ssh laptop3 "bash -s" < setup-laptop3-unattended.sh &
```

### Custom Instance Count

```bash
# Override with environment variable
MINIMAX_INSTANCES=6 ssh laptop3 "bash -s" < setup-laptop3-unattended.sh &
```

This launches 6 Minimax instances = 18 sub-agents total.

---

## What L3 Does Automatically

**Without any manual work:**
- ✅ Waits for L1 to be ready (polls every 10 sec)
- ✅ Launches N Minimax instances
- ✅ Each instance has 3 parallel sub-agents
- ✅ Syncs code every 5 minutes
- ✅ Health checks every 60 seconds
- ✅ Auto-restart if crash
- ✅ Consolidates L1's code
- ✅ Optimizes queries from L1
- ✅ Tunes performance in parallel with L1 development

---

## Minimax Specialization

Each Minimax instance has 3 sub-agents:

| Sub-Agent | Task | Input | Output |
|-----------|------|-------|--------|
| **SA1** | Code Consolidation | L1 code commits | Consolidated, optimized code |
| **SA2** | Query Optimization | L1 database queries | Optimized SQL, indexes |
| **SA3** | Performance Tuning | L1 implementations | Performance baseline, bottleneck analysis |

All run in parallel. Results pushed every 10 minutes.

---

## Monitoring L3 (From L1)

### Quick Status Check:
```bash
curl http://laptop3:9002/api/status | jq '.instances'
```

### Detailed Status:
```bash
curl http://laptop3:9002/api/agents | jq '.'
```

### View Optimization Results:
```bash
curl http://laptop3:9002/api/optimization/gateway | jq '.'
curl http://laptop3:9002/api/optimization/database | jq '.'
curl http://laptop3:9002/api/optimization/auth | jq '.'
```

### View Logs (SSH to L3):
```bash
ssh laptop3 "tail -50 /c/aoe-unified-final/LOGS/LAPTOP_3.log"
ssh laptop3 "tail -50 /c/aoe-unified-final/LOGS/LAPTOP_3_ORCHESTRATOR.log"
```

### View Bootstrap Status:
```bash
ssh laptop3 "cat /c/aoe-unified-final/AGENTS/LAPTOP3_BOOTSTRAP_STATUS.json"
```

---

## Deployment Timeline

| Time | L1 | L2 | L3 |
|------|----|----|-----|
| **Hour 0** | `./bootstrap-day1.sh` | Deploy (waits for L1) | Deploy (waits for L1) |
| **Hour 0 + 2m** | Ready on port 9000 | Waiting... | Waiting... |
| **Hour 0 + 3m** | 6 agents running | Detects L1, launches | Detects L1, launches |
| **Hour 0 + 4m** | L1 ready | 7 agents running | 4+ instances running |
| **Hour 4** | Publish contracts | Auto-pulls contracts | Auto-pulls contracts |
| **Hours 4-8** | Code generation | Verification + load testing | Code consolidation + optimization |

---

## Success Indicators

### L3 Successfully Deployed When You See:

```
✓ BOOTSTRAP COMPLETE
✓ L3 orchestrator is ready (http://localhost:9002)
✓ L3 has 4 Minimax instances + 12 sub-agents
✓ Connected to L1: localhost:9000 ✓
✓ Auto-pull daemon started (every 5 min)
✓ Health check daemon started (every 60 sec)
```

### Verify with:
```bash
curl http://laptop3:9002/api/agents | jq '.total_instances'
# Should return: 4 (or whatever you configured)
```

---

## Integration with L1 & L2

```
L1 (Claude Code)        L2 (Kimi + Specialists)      L3 (Minimax)
├─ Generate code        ├─ Verify code               ├─ Consolidate code
├─ Write migrations     ├─ Stress test               ├─ Optimize queries
└─ Build dashboards     ├─ Load test                 └─ Tune performance
                        └─ Detect conflicts               (in parallel)
```

All three run in parallel, no blocking.

---

## Troubleshooting

### L3 Deployment Hangs
```bash
# Check if L1 is running
curl http://localhost:9000/health

# If L1 not running, start it first:
./agents/bootstrap-day1.sh
```

### L3 Orchestrator Crashed
```bash
# SSH to L3
ssh laptop3

# Check logs
tail -100 /c/aoe-unified-final/LOGS/LAPTOP_3_ORCHESTRATOR.log

# Restart manually
cd /c/aoe-unified-final
MINIMAX_INSTANCES=4 node agents/laptop3-minimax-orchestrator.js --port 9002 --instances 4
```

### L3 Auto-Pull Failing
```bash
# Check git connectivity from L3
ssh laptop3 "cd /c/aoe-unified-final && git status"

# If branch missing, recreate it
ssh laptop3 "cd /c/aoe-unified-final && git checkout feature/supadash-consolidation"
```

### Optimization Results Not Showing
```bash
# Verify L3 is writing to shared/
ssh laptop3 "ls -la /c/aoe-unified-final/shared/ | grep optimization"

# Force a push
ssh laptop3 "cd /c/aoe-unified-final && git push origin feature/supadash-consolidation"
```

---

## Custom Instance Count

To run more or fewer Minimax instances:

```bash
# 6 instances (18 sub-agents)
MINIMAX_INSTANCES=6 ssh laptop3 "bash -s" < setup-laptop3-unattended.sh &

# 8 instances (24 sub-agents)
MINIMAX_INSTANCES=8 ssh laptop3 "bash -s" < setup-laptop3-unattended.sh &
```

Each instance = 3 sub-agents (code consolidation, query optimization, performance tuning).

---

## Performance Impact

With 4 Minimax instances (12 sub-agents):
- Laptop 3 CPU: ~80-90% during active optimization
- Memory: ~2-4GB for orchestrator + instances
- Network: ~1-2 Mbps (git syncs + optimization results)
- Impact on L1: None (L3 works independently)
- Impact on L2: None (L3 works independently)

---

## Daily Operations

### Every 5 Minutes:
- Auto-pull latest code from L1
- Check for optimization targets
- Push optimization results

### Every 10 Minutes:
- Commit optimization results to git
- Update shared/optimization-*.json

### Every 60 Seconds:
- Health check (auto-restart if needed)

### Continuously:
- Code consolidation (SA1 on each instance)
- Query optimization (SA2 on each instance)
- Performance tuning (SA3 on each instance)

---

## TL;DR

**One command to deploy L3:**
```bash
ssh laptop3 "bash -s" < setup-laptop3-unattended.sh &
```

**Custom instance count:**
```bash
MINIMAX_INSTANCES=6 ssh laptop3 "bash -s" < setup-laptop3-unattended.sh &
```

That's it. L3 waits for L1, then auto-starts with full parallel optimization.

