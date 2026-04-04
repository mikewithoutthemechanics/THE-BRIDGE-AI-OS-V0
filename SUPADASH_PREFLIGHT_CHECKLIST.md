# SUPADASH Streaming: Pre-Flight Checklist

## Must Complete BEFORE Day 1 Hour 0

### Network Setup (5 min)
- [ ] Both laptops on same WiFi
- [ ] L1 can ping L2: `ping laptop2` (should work)
- [ ] L2 can ping L1: `ping laptop1` (should work)
- [ ] SSH key from L1 to L2 works: `ssh laptop2 "echo OK"` (should print OK)

### Codebase Sync (10 min)
- [ ] L1: `cd /c/aoe-unified-final && git status` (should show clean repo)
- [ ] L2: `cd /c/aoe-unified-final && git status` (should show clean repo)
- [ ] Both on branch: `git branch | grep feature/supadash-consolidation` (should exist)
- [ ] Both synced: `git log -1 --oneline` (should show same commit on both)

### Node/Dependencies (5 min)
- [ ] L1: `node --version` (v18+)
- [ ] L2: `node --version` (v18+)
- [ ] L1: `npm list express` (should be installed)
- [ ] L2: `npm list express` (should be installed)

### Ports Available (5 min)
- [ ] L1: `lsof -i :9000` (should be empty, port free)
- [ ] L1: `lsof -i :8080` (should be empty, port free)
- [ ] L2: `lsof -i :9001` (should be empty, port free)

### Agent Files Ready (5 min)
- [ ] L1: `ls agents/laptop1-streaming-orchestrator.js` (should exist)
- [ ] L2: `ls agents/laptop2-streaming-orchestrator.js` (should exist)
- [ ] L1: `ls agents/agent-*.js` (all 6 agents present)
- [ ] L2: `ls agents/agent-*.js` (all 7 agents present)

### Final Verification (2 min)
- [ ] Create `/c/aoe-unified-final/shared/` directory (both laptops)
- [ ] Create `/c/aoe-unified-final/LOGS/` directory (both laptops)
- [ ] Create `/c/aoe-unified-final/STANDUPS/` directory (both laptops)
- [ ] L1 has space: `df -h /c | grep aoe` (min 5GB free)
- [ ] L2 has space: `df -h /c | grep aoe` (min 5GB free)

---

## Setup Commands (Run These First)

```bash
# On BOTH laptops:
cd /c/aoe-unified-final
mkdir -p shared LOGS STANDUPS AGENTS

# On L1 only:
git checkout -b feature/supadash-consolidation 2>/dev/null || git checkout feature/supadash-consolidation
npm install express cors body-parser

# Test network from L1:
ssh laptop2 "echo Network OK"
curl -s http://localhost:9000/health || echo "Port 9000 ready to use"

# You're ready when you see this on both laptops:
echo "✓ Pre-flight complete"
```

---

## GO/NO-GO Decision

If all checks pass: **GO FOR LAUNCH**

If any check fails: **STOP and fix before proceeding**

---

## Timeline Starts When...

Day 1 Hour 0 = When you run:
```bash
./agents/bootstrap-day1.sh
```

From that moment forward:
- All 13 agents launch simultaneously
- 8-day countdown begins
- Stream timeline in effect

**Do not launch until you've confirmed all checks above.**
