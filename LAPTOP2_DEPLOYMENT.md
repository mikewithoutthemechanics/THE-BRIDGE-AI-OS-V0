# LAPTOP 2: HANDS-FREE DEPLOYMENT

Deploy Laptop 2 completely unattended using either method.

---

## Method 1: OpenClaw / Remote Automation (Recommended if you have it)

If you use OpenClaw or similar automation platform:

```bash
# From your automation platform, deploy:
openclaw deploy /c/aoe-unified-final/LAPTOP2_OPENCLAW_CONFIG.yaml
```

**What it does:**
- ✅ Pre-flight checks (Node, npm, git, directories)
- ✅ Waits for L1 to bootstrap (polls port 9000)
- ✅ Launches L2 orchestrator automatically
- ✅ Sets up auto-pull (every 5 min)
- ✅ Sets up health checks (every 60 sec)
- ✅ Auto-restart on failure
- ✅ Daily standups at 09:00 UTC
- ✅ Conflict escalation to L1
- ✅ Zero manual intervention

**Status file created:**
```
/c/aoe-unified-final/AGENTS/LAPTOP2_BOOTSTRAP_STATUS.json
```

---

## Method 2: SSH Direct Deploy (Universal - works without OpenClaw)

From **Laptop 1**, after you run bootstrap:

```bash
# Deploy setup script to Laptop 2
ssh laptop2 "bash -s" < /c/aoe-unified-final/setup-laptop2-unattended.sh
```

**What it does:**
- ✅ All pre-flight checks
- ✅ Waits for L1 bootstrap (30-min timeout)
- ✅ Syncs code from L1
- ✅ Launches L2 orchestrator
- ✅ Verifies all 7 agents initialized
- ✅ Sets up auto-pull daemon
- ✅ Sets up health check daemon
- ✅ Keeps connection alive (run as background SSH session)

**Example - Run this on L1:**
```bash
# In one terminal, start the bootstrap
./agents/bootstrap-day1.sh

# In another terminal, deploy L2 (immediately, it will wait for L1)
ssh laptop2 "bash -s" < /c/aoe-unified-final/setup-laptop2-unattended.sh &
```

Both run in parallel, L2 waits for L1 to be ready.

---

## Method 3: Manual SSH Session (If you want to watch)

From **Laptop 1**:

```bash
ssh laptop2
cd /c/aoe-unified-final
bash setup-laptop2-unattended.sh
```

Screen shows real-time progress. Keep terminal open (it stays active after bootstrap).

---

## Configuration Reference

### OpenClaw Config Location
```
LAPTOP2_OPENCLAW_CONFIG.yaml
```

**Key Parameters:**
```yaml
environment:
  L2_PORT: 9001
  L1_HOST: localhost  # Change if L1 is on different network
  L1_PORT: 9000

operations:
  git_sync:
    interval: 300  # Every 5 minutes
  health_check_interval: 300  # Every 5 minutes
```

### Unattended Script Location
```
setup-laptop2-unattended.sh
```

**Key Timeouts:**
- Wait for L1: 30 minutes (max)
- Orchestrator start: 2 minutes (max)
- Health check: Every 60 seconds
- Auto-pull: Every 5 minutes

---

## Deployment Checklist

Before deploying L2:

### On Laptop 2 (Pre-work):
- [ ] Node.js v18+ installed
- [ ] npm installed
- [ ] `/c/aoe-unified-final` directory exists
- [ ] Git repository cloned
- [ ] SSH key from L1 configured (if using SSH method)

### On Laptop 1:
- [ ] Run `./agents/bootstrap-day1.sh` first
- [ ] Wait 20-30 seconds for L1 to be ready
- [ ] Then deploy L2 (L2 will wait for L1)

### Verification (from L1):
```bash
# Check L2 is ready
curl http://laptop2:9001/api/status | jq

# Check L2 agents
curl http://laptop2:9001/api/agents | jq '.total'
# Should show: 7
```

---

## Auto-Operations (Run Automatically)

Once deployed, L2 does this without any manual work:

### Every 5 Minutes:
- Pull latest code from L1
- Push any status changes
- Check for new contracts

### Every 60 Seconds:
- Check orchestrator health
- Restart if needed (max 3 restarts)

### Every 24 Hours (09:00 UTC):
- Generate daily standup report
- Collect agent status
- Save to git

### Continuously (24/7):
- Agent 6B runs load test
- Agent 1B monitors for conflicts
- Agents 2B-5B optimize & verify L1's work

---

## Monitoring L2 (From L1)

### Quick Status Check:
```bash
curl http://laptop2:9001/api/status | jq '.agents'
```

### Detailed Status:
```bash
curl http://laptop2:9001/api/agents | jq '.'
```

### Check for Conflicts:
```bash
curl http://laptop2:9001/api/conflicts | jq '.'
```

### View Logs (SSH to L2):
```bash
ssh laptop2 "tail -50 /c/aoe-unified-final/LOGS/LAPTOP_2.log"
ssh laptop2 "tail -50 /c/aoe-unified-final/LOGS/LAPTOP_2_ORCHESTRATOR.log"
```

### View Bootstrap Status:
```bash
ssh laptop2 "cat /c/aoe-unified-final/AGENTS/LAPTOP2_BOOTSTRAP_STATUS.json"
```

---

## Troubleshooting

### L2 Deployment Hangs
```bash
# Check if L1 is running
curl http://localhost:9000/health

# If L1 not running, start it first:
./agents/bootstrap-day1.sh
```

### L2 Orchestrator Crashed
```bash
# SSH to L2
ssh laptop2

# Check logs
tail -100 /c/aoe-unified-final/LOGS/LAPTOP_2_ORCHESTRATOR.log

# Restart manually
cd /c/aoe-unified-final
node agents/laptop2-streaming-orchestrator.js --port 9001
```

### L2 Auto-Pull Failing
```bash
# Check git connectivity from L2
ssh laptop2 "cd /c/aoe-unified-final && git status"

# If branch missing, recreate it
ssh laptop2 "cd /c/aoe-unified-final && git checkout feature/supadash-consolidation"
```

### Network Issues (L2 Can't Reach L1)
```bash
# From L2, test connectivity to L1
ssh laptop2 "curl http://localhost:9000/health"

# If fails, check L1 hostname in config
# Edit LAPTOP2_OPENCLAW_CONFIG.yaml:
# L1_HOST: localhost  # Change if needed
```

---

## Deployment Timeline

| Time | L1 | L2 |
|------|----|----|
| **Hour 0** | `./bootstrap-day1.sh` | Deploy script (or SSH) - waits for L1 |
| **Hour 0 + 30s** | Orchestrator starts, agents initialized | Waiting for L1... |
| **Hour 0 + 2m** | L1 ready on port 9000 | Detects L1, launches orchestrator |
| **Hour 0 + 3m** | 6 agents running | 7 agents running, synced with L1 |
| **Hour 4** | `./publish-contracts-day1.sh` | Auto-pulls contracts, agents start work |
| **Hours 4-8** | Parallel development | Validation + optimization in parallel |

---

## Success Indicators

### L2 Successfully Deployed When You See:

```
✓ BOOTSTRAP COMPLETE
✓ L2 orchestrator is ready (http://localhost:9001)
✓ L2 has 7 specialist agents initialized
✓ Connected to L1: localhost:9000 ✓
✓ Auto-pull daemon started (every 5 min)
✓ Health check daemon started (every 60 sec)
```

### Verify with:
```bash
curl http://laptop2:9001/api/agents | jq '.total'
# Should return: 7
```

---

## Quick Deploy Commands

### All-In-One (L1 → Bootstrap + Deploy L2):
```bash
# Terminal 1 (L1):
cd /c/aoe-unified-final && ./agents/bootstrap-day1.sh

# Terminal 2 (L1, after 30 seconds):
ssh laptop2 "bash -s" < /c/aoe-unified-final/setup-laptop2-unattended.sh &

# Wait 5-10 minutes for both to complete
```

### With OpenClaw:
```bash
# After L1 bootstrap starts
openclaw deploy LAPTOP2_OPENCLAW_CONFIG.yaml

# L2 will wait for L1, then start automatically
```

---

## TL;DR

**Option 1 (OpenClaw):**
```bash
openclaw deploy LAPTOP2_OPENCLAW_CONFIG.yaml
```

**Option 2 (SSH):**
```bash
ssh laptop2 "bash -s" < setup-laptop2-unattended.sh &
```

Both are completely hands-free. Pick one, deploy it, and walk away.

