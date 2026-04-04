# SUPADASH STREAMING: EXECUTION START HERE

## Timeline: 8 Days to Production

**Today is Day 0.** Complete these steps, then Day 1 Hour 0 begins when you run the bootstrap.

---

## Step 1: Pre-Flight Check (30 minutes)

Run this on **BOTH laptops**:

```bash
cd /c/aoe-unified-final

# Check network (from L1):
ping laptop2
ssh laptop2 "echo Network OK"

# Verify Node.js
node --version    # Should be v18+
npm list express  # Should be installed

# Create directories
mkdir -p shared LOGS STANDUPS AGENTS

# Verify git branch
git checkout feature/supadash-consolidation || git checkout -b feature/supadash-consolidation
git status        # Should be clean

# Verify agent files exist
ls agents/laptop*-streaming-orchestrator.js
ls agents/bootstrap-day1.sh
ls agents/publish-contracts-day1.sh
```

✅ **All checks pass?** Continue.

---

## Step 2: Review the Plan (10 minutes)

Read these files in order:

1. `SUPADASH_STREAMING_ARCHITECTURE.md` - The 8-day model (6 parallel streams)
2. `SUPADASH_DEPENDENCY_GRAPH.md` - Visual timelines and critical path
3. `SUPADASH_PREFLIGHT_CHECKLIST.md` - Final go/no-go checklist

✅ **Understand the model?** Continue.

---

## Step 3: Launch Day 1 (On L1, run this command)

### Day 1, Hour 0 - BOOTSTRAP

```bash
cd /c/aoe-unified-final
chmod +x agents/bootstrap-day1.sh
./agents/bootstrap-day1.sh
```

This launches:
- **L1:** 6 Claude agents (Opus, Sonnet x3, Haiku x2) on port 9000
- **L2:** 7 Specialist agents (Kimi, Nemotron x2, Xiaomi x2, Minimax x2) on port 9001

**Output should show:**
```
✓ BOOTSTRAP COMPLETE
✓ L1 (Port 9000): 6 Claude agents ready
✓ L2 (Port 9001): 7 Specialist agents ready

Next Action (in 4 hours - Day 1 Hour 4):
  ./agents/publish-contracts-day1.sh
```

✅ **Agents running?** Move to next step.

---

## Step 4: Monitor L1 & L2 Status

While waiting for Hour 4, open two terminals and watch:

### Terminal 1 (Watch L1):
```bash
watch -n 5 'curl http://localhost:9000/api/status | jq .agents'
```

### Terminal 2 (Watch git):
```bash
watch -n 5 'git log --oneline | head -10'
```

### Terminal 3 (Watch L2):
```bash
ssh laptop2 "watch -n 5 'curl http://localhost:9001/api/status | jq .agents'"
```

---

## Step 5: Publish Contracts (Day 1, Hour 4)

Exactly 4 hours after bootstrap, run:

```bash
cd /c/aoe-unified-final
chmod +x agents/publish-contracts-day1.sh
./agents/publish-contracts-day1.sh
```

This publishes 5 initial contracts:
- `gateway-api-spec.json` (Agent 2A)
- `dashboard-manifest.json` (Agent 3A)
- `database-schema.json` (Agent 4A)
- `auth-api-spec.json` (Agent 5A)
- `test-spec.json` (Agent 6A)

**Output should show:**
```
✓ CONTRACTS PUBLISHED
✓ 5 contracts now live

All dependent agents can NOW start real work.
```

✅ **Contracts published?** Streaming timeline is now active.

---

## Days 2-8: Automatic Streaming Execution

### What Happens Automatically:

**Days 2-5:**
- All 6 streams work in parallel (no blocking)
- L2 validates L1's work in real-time
- Tests run continuously (bugs found in hours, not days)
- Git syncs every 5 minutes
- Webhooks alert both laptops to changes < 1 second

**Day 5:**
- ✅ All 43 features verified
- ✅ All core systems stable
- ✅ Ready for hardening

**Days 6-7:**
- Edge case handling
- Performance tuning
- 7-day load test running cleanly

**Day 8:**
- Dry-run cutover (validate everything before production)
- Production cutover (if dry-run passes)
- L2 continues 24/7 monitoring

### What YOU Do:

**Daily (09:00 UTC):**
- Check status: `curl http://localhost:9000/api/status | jq`
- Review logs: `tail -20 LOGS/LAPTOP_1.log`
- Check for conflicts: `curl http://localhost:9001/api/conflicts | jq`

**If something breaks:**
1. Check logs: `cat LOGS/LAPTOP_1.log | tail -100`
2. Check conflicts: `cat shared/CONFLICTS_DETECTED.json`
3. Review git: `git log --oneline | head -20`

---

## Key Monitoring URLs

Save these:

```
L1 Status:       curl http://localhost:9000/api/status | jq
L2 Status:       curl http://localhost:9001/api/status | jq
L1 Agents:       curl http://localhost:9000/api/agents | jq
L2 Agents:       curl http://localhost:9001/api/agents | jq
Conflicts:       curl http://localhost:9001/api/conflicts | jq
Git Log:         git log --oneline | head -20
Feature Status:  cat SUPADASH_FEATURE_MATRIX.md | grep "✓"
```

---

## Critical Gates (Must All Pass)

| Gate | By Day | Requirement | Check |
|------|--------|-------------|-------|
| **Gateway Stable** | 2 | p95 < 100ms | `curl http://localhost:9000/api/status \| jq '.gateways'` |
| **Features Verified** | 5 | 43/43 ✓ | `grep "✓" SUPADASH_FEATURE_MATRIX.md \| wc -l` |
| **Data Integrity** | 4 | Zero loss | `curl http://localhost:9001/api/verification/data` |
| **Load Test Clean** | 8 | 7 days, zero errors | `tail LOGS/LAPTOP_2.log \| grep "load-test"` |

If any gate fails, streaming stops and you escalate to Agent-1 (Opus) for decision.

---

## Emergency: What If Something Breaks?

### L1 Crashes
```bash
# Check what happened
cat LOGS/LAPTOP_1.log | tail -50

# Restart L1
pkill -f "laptop1-streaming-orchestrator"
sleep 2
node agents/laptop1-streaming-orchestrator.js --port 9000 &
```

### L2 Crashes
```bash
# Check what happened (on L2)
tail -50 LOGS/LAPTOP_2.log

# Restart L2 (from L1)
ssh laptop2 "pkill -f 'laptop2-streaming' && sleep 2 && nohup node agents/laptop2-streaming-orchestrator.js --port 9001 > LOGS/LAPTOP_2_ORCHESTRATOR.log 2>&1 &"
```

### Git Sync Fails
```bash
# Check git status
cd /c/aoe-unified-final && git status

# Fix if needed
git pull origin feature/supadash-consolidation
git push origin feature/supadash-consolidation
```

### Conflict Detected
```bash
# Review conflict
cat shared/CONFLICTS_DETECTED.json

# This automatically escalates to Agent-1 (Opus)
# Check Agent-1's decision in:
cat SUPADASH_CRITICAL_DECISIONS.md | tail -5
```

---

## Success Indicators (Watch For These)

✅ **Day 1:**
- Both orchestrators running
- 13 agents initialized
- 5 contracts published at Hour 4

✅ **Day 2:**
- Gateway code generation started
- First tests running (against stubs)
- L2 stress test begun

✅ **Day 3:**
- Gateway working (p95 < 100ms)
- Dashboard merges 50% done
- Tests now run against real code
- No blockers

✅ **Day 4:**
- Data migrated (zero loss)
- Auth service working
- 30/43 features tested

✅ **Day 5:**
- **GATE:** All 43 features verified ✓
- Load test 4 days clean
- Cutover ready

✅ **Day 6-7:**
- Hardening only (no rework)
- 6+ days soak test clean

✅ **Day 8:**
- Dry-run successful
- Production cutover executed

---

## TL;DR - Next 3 Steps

### Now (Day 0):
```bash
./agents/bootstrap-day1.sh
```

### In 4 hours (Day 1, Hour 4):
```bash
./agents/publish-contracts-day1.sh
```

### Days 2-8:
Watch progress. Intervene only if gates fail.

---

## Questions?

Review the detailed docs:

- **Architecture:** `SUPADASH_STREAMING_ARCHITECTURE.md`
- **Dependency Graph:** `SUPADASH_DEPENDENCY_GRAPH.md`
- **Implementation:** `SUPADASH_STREAMING_IMPLEMENTATION.md`
- **Pre-Flight:** `SUPADASH_PREFLIGHT_CHECKLIST.md`

---

## Ready?

When you're ready to start:

```bash
cd /c/aoe-unified-final
chmod +x agents/bootstrap-day1.sh
./agents/bootstrap-day1.sh
```

**The 8-day countdown begins now.**

🚀
