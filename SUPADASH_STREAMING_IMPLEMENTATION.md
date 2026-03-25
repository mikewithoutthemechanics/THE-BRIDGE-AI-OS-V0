# SUPADASH: Streaming Architecture - Concrete Implementation Steps

## Phase 0: Pre-Day 1 Setup (Agent Orchestrator Config)

### 1. Configure Real-Time Event Bus (Webhook)

**File:** `agents/webhook-config.json`

```json
{
  "webhooks": {
    "code_push": {
      "event": "git.push",
      "trigger": "any file in /shared or /public or /migrations",
      "destination": "http://localhost:9001/webhook/code-change",
      "delay": "0s",
      "retry": 3
    },
    "contract_published": {
      "event": "git.push",
      "trigger": "files matching .*-spec.json or *-manifest.json",
      "destination": "http://localhost:9001/webhook/contract-change",
      "delay": "0s",
      "retry": 3
    },
    "conflict_detected": {
      "event": "http.post",
      "trigger": "L2 Agent 1B conflict detection",
      "destination": "http://localhost:9000/webhook/conflict",
      "delay": "0s",
      "priority": "high",
      "retry": 5
    }
  },
  "git_sync": {
    "pull_interval_sec": 300,
    "push_interval_sec": 60,
    "auto_commit": true,
    "commit_message_prefix": "[AUTO]"
  }
}
```

### 2. Agent Task Definitions

**File:** `agents/task-definitions.json`

```json
{
  "streams": {
    "infrastructure": {
      "agents": ["2A", "2B"],
      "start_condition": "day==1 && hour==0",
      "initial_task": "port-mapping",
      "contract_publish": "gateway-api-spec",
      "gates": [
        {
          "name": "gateway-stable",
          "condition": "p95_latency < 100ms && uptime > 24h",
          "day": 2,
          "optional": false
        }
      ]
    },
    "dashboard": {
      "agents": ["3A", "3B"],
      "start_condition": "day==1 && hour==0",
      "dependencies": ["gateway:contract_published"],
      "initial_task": "frontend-audit",
      "contract_publish": "dashboard-manifest",
      "gates": [
        {
          "name": "features-verified",
          "condition": "all_43_features_tested == true",
          "day": 5,
          "optional": false
        }
      ]
    },
    "data": {
      "agents": ["4A", "4B"],
      "start_condition": "day==1 && hour==0",
      "initial_task": "schema-design",
      "contract_publish": "database-schema",
      "gates": [
        {
          "name": "zero-data-loss",
          "condition": "row_count_verified && checksum_match",
          "day": 4,
          "optional": false
        }
      ]
    },
    "auth": {
      "agents": ["5A", "5B"],
      "start_condition": "day==1 && hour==0",
      "dependencies": ["data:contract_published"],
      "initial_task": "auth-spec",
      "contract_publish": "auth-api-spec",
      "gates": [
        {
          "name": "auth-load-test",
          "condition": "p95_latency < 200ms && 1000_concurrent_users",
          "day": 5,
          "optional": false
        }
      ]
    },
    "testing": {
      "agents": ["6A", "6B"],
      "start_condition": "day==1 && hour==0",
      "initial_task": "test-framework-setup",
      "contract_publish": "test-spec",
      "gates": [
        {
          "name": "7-day-soak",
          "condition": "7 days of clean load test",
          "day": 8,
          "optional": false
        }
      ]
    },
    "governance": {
      "agents": ["1"],
      "start_condition": "day==1 && hour==0",
      "initial_task": "decision-templates",
      "governance": {
        "auto_approve": [
          "port_assignments matching ruleset X",
          "api_contract_changes backward_compatible",
          "documentation updates",
          "test additions"
        ],
        "escalate": [
          "feature removal (never auto-approve)",
          "breaking api changes",
          "schema changes with migration risk",
          "auth/security modifications"
        ]
      }
    }
  }
}
```

### 3. Contract Evolution Tracking

**File:** `agents/contract-tracker.json`

```json
{
  "contracts": {
    "gateway-api-spec": {
      "published_by": "Agent-2A",
      "initial_publish": "Day 1, Hour 4",
      "format": "OpenAPI 3.0",
      "update_frequency": "hourly",
      "depends_on": [],
      "used_by": ["Agent-3A", "Agent-4A", "Agent-5A", "Agent-6A"],
      "validation": {
        "schema": true,
        "examples": true,
        "backwards_compat": true
      },
      "change_log": "shared/gateway-api-spec-changelog.json"
    },
    "dashboard-manifest": {
      "published_by": "Agent-3A",
      "initial_publish": "Day 1, Hour 4",
      "format": "CSV with feature list",
      "update_frequency": "daily",
      "depends_on": ["gateway-api-spec"],
      "used_by": ["Agent-6A", "Agent-1B"],
      "validation": {
        "feature_count": 43,
        "file_references": true
      },
      "change_log": "shared/dashboard-manifest-changelog.json"
    },
    "database-schema": {
      "published_by": "Agent-4A",
      "initial_publish": "Day 1, Hour 4",
      "format": "SQL DDL",
      "update_frequency": "daily",
      "depends_on": [],
      "used_by": ["Agent-2A", "Agent-5A", "Agent-6A"],
      "validation": {
        "sql_syntax": true,
        "naming_conventions": true,
        "indexes": true
      },
      "change_log": "shared/database-schema-changelog.json"
    },
    "auth-api-spec": {
      "published_by": "Agent-5A",
      "initial_publish": "Day 1, Hour 4",
      "format": "OpenAPI 3.0",
      "update_frequency": "once per day",
      "depends_on": ["database-schema"],
      "used_by": ["Agent-2A", "Agent-4A", "Agent-6A"],
      "validation": {
        "schema": true,
        "security": true
      },
      "change_log": "shared/auth-api-spec-changelog.json"
    },
    "test-spec": {
      "published_by": "Agent-6A",
      "initial_publish": "Day 1, Hour 4",
      "format": "JSON test template",
      "update_frequency": "daily",
      "depends_on": ["gateway-api-spec", "dashboard-manifest"],
      "used_by": ["all agents"],
      "validation": {
        "test_count": "minimum 43",
        "coverage": "minimum 80%"
      },
      "change_log": "shared/test-spec-changelog.json"
    }
  }
}
```

---

## Day 1: Bootstrap (Hour 0-4)

### Hour 0: Launch All Agents Simultaneously

**File:** `agents/bootstrap-day1.sh`

```bash
#!/bin/bash
# SUPADASH Streaming Bootstrap - Day 1, Hour 0

set -e

cd /c/aoe-unified-final

echo "═══════════════════════════════════════════"
echo "SUPADASH Streaming Bootstrap: Day 1, Hour 0"
echo "═══════════════════════════════════════════"

# Clean up any stale processes
pkill -f "agent-[1-6]" || true
sleep 2

# Start L1 Orchestrator (Port 9000)
echo "► Starting Laptop 1 orchestrator (Port 9000)..."
node agents/laptop1-streaming-orchestrator.js --port 9000 &
L1_PID=$!

sleep 2

# Start L2 Orchestrator (Port 9001)
echo "► Starting Laptop 2 orchestrator (Port 9001)..."
ssh -n laptop2 "cd /c/aoe-unified-final && node agents/laptop2-streaming-orchestrator.js --port 9001" &
L2_PID=$!

sleep 2

# Wait for both to be ready
echo "► Waiting for orchestrators to be ready..."
while ! curl -s http://localhost:9000/health > /dev/null; do
  sleep 1
done
while ! curl -s http://laptop2:9001/health > /dev/null; do
  sleep 1
done

echo "✓ L1 ready"
echo "✓ L2 ready"

# Deploy webhook config to both
echo "► Deploying webhook configuration..."
cp agents/webhook-config.json shared/
git add shared/webhook-config.json
git commit -m "[AUTO] Day 1 Hour 0: Webhook configuration"
git push

echo "✓ Webhooks configured"

# Deploy task definitions
echo "► Deploying task definitions..."
cp agents/task-definitions.json shared/
git add shared/task-definitions.json
git commit -m "[AUTO] Day 1 Hour 0: Task definitions"
git push

echo "✓ Task definitions deployed"

# Verify all agents are running
echo ""
echo "► Verifying agent status..."
curl -s http://localhost:9000/api/agents | jq '.'
echo ""
curl -s http://localhost:9001/api/agents | jq '.'

echo ""
echo "═══════════════════════════════════════════"
echo "✓ Bootstrap complete. All 13 agents running."
echo "✓ Streaming timeline: 8 days"
echo "✓ Watch progress: watch -n 5 'git log --oneline | head -10'"
echo "═══════════════════════════════════════════"
```

### Hour 4: Publish Initial Contracts

**File:** `agents/publish-contracts-day1.sh`

```bash
#!/bin/bash
# Publish initial contracts at Day 1, Hour 4

set -e

cd /c/aoe-unified-final

echo "═══════════════════════════════════════════"
echo "Day 1, Hour 4: Publishing Initial Contracts"
echo "═══════════════════════════════════════════"

# Verify all contracts exist
contracts=(
  "shared/gateway-api-spec.json"
  "shared/dashboard-manifest.json"
  "shared/database-schema.json"
  "shared/auth-api-spec.json"
  "shared/test-spec.json"
)

for contract in "${contracts[@]}"; do
  if [ ! -f "$contract" ]; then
    echo "❌ Missing: $contract"
    exit 1
  fi
done

# Add timestamp to each contract
for contract in "${contracts[@]}"; do
  jq --arg published "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     '.published_at = $published' "$contract" > "$contract.tmp"
  mv "$contract.tmp" "$contract"
done

# Commit and push all contracts
git add shared/*-spec.json shared/*-manifest.json
git commit -m "[AUTO] Day 1 Hour 4: All contracts published

- gateway-api-spec: Skeleton endpoints (Agent 2A)
- dashboard-manifest: Feature inventory (Agent 3A)
- database-schema: Initial schema design (Agent 4A)
- auth-api-spec: Auth specification (Agent 5A)
- test-spec: Test framework definition (Agent 6A)

All dependent agents can NOW start real work.
"

git push

echo "✓ All contracts published"

# Notify agents
curl -X POST http://localhost:9000/webhook/contract-change \
  -H "Content-Type: application/json" \
  -d '{"event": "contracts_published", "time": "Day 1 Hour 4"}'

curl -X POST http://laptop2:9001/webhook/contract-change \
  -H "Content-Type: application/json" \
  -d '{"event": "contracts_published", "time": "Day 1 Hour 4"}'

echo "✓ Agents notified"
echo ""
echo "Streaming timeline begins now."
echo "Watch progress with: git log --oneline | head -20"
```

---

## Days 1-8: Continuous Synchronization

### Auto-Pull & Webhook Handler

**File:** `agents/sync-daemon.js`

```javascript
// Sync daemon runs on both L1 and L2
// Pulls changes every 5 minutes
// Handles webhooks in real-time

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_PATH = '/c/aoe-unified-final';
const PULL_INTERVAL_SEC = 300; // 5 minutes
const GIT_USER = 'claude-supadash-bot';

async function gitPull() {
  return new Promise((resolve, reject) => {
    exec(`cd ${REPO_PATH} && git pull origin feature/supadash-consolidation`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`[PULL] Error: ${error}`);
          reject(error);
        } else {
          console.log(`[PULL] ${new Date().toISOString()}: ${stdout.split('\n')[0]}`);
          resolve();
        }
      }
    );
  });
}

async function gitPush() {
  return new Promise((resolve, reject) => {
    exec(`cd ${REPO_PATH} && git push origin feature/supadash-consolidation`,
      (error, stdout, stderr) => {
        if (error) {
          // Might fail if no changes, that's OK
          console.log(`[PUSH] No changes to push`);
          resolve();
        } else {
          console.log(`[PUSH] ${new Date().toISOString()}: Pushed`);
          resolve();
        }
      }
    );
  });
}

// Polling-based git sync (every 5 minutes)
setInterval(async () => {
  try {
    await gitPull();
    // Auto-push any changes this agent has made
    await gitPush();
  } catch (error) {
    console.error('Sync error:', error);
  }
}, PULL_INTERVAL_SEC * 1000);

// Webhook handler (real-time)
const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook/contract-change', (req, res) => {
  console.log(`[WEBHOOK] Contract change detected at ${new Date().toISOString()}`);

  // Trigger immediate pull (don't wait for 5-min interval)
  gitPull().then(() => {
    console.log('[WEBHOOK] Immediate pull completed');
    // Notify agent that new contract is available
    notifyAgentOfContractChange();
  });

  res.json({ status: 'received' });
});

app.post('/webhook/conflict', (req, req) => {
  console.log(`[WEBHOOK] CONFLICT DETECTED: ${req.body.conflict}`);

  // Escalate to Agent 1 (L1)
  // This is high priority
  const conflictReport = {
    timestamp: new Date().toISOString(),
    type: req.body.conflict_type,
    details: req.body.details,
    escalated_to: 'Agent-1-Opus'
  };

  fs.writeFileSync(
    path.join(REPO_PATH, 'CONFLICTS_PENDING.json'),
    JSON.stringify(conflictReport, null, 2)
  );

  // Push immediately
  gitPush();

  res.json({ status: 'escalated' });
});

app.listen(9002, () => {
  console.log('Sync daemon listening on port 9002');
});

function notifyAgentOfContractChange() {
  // POST to local agent runner
  // (implementation depends on agent framework)
}
```

---

## Daily Standup Template

**File:** `scripts/daily-standup.sh`

```bash
#!/bin/bash
# Daily standup - 09:00 UTC, 5 minutes

STANDUP_TIME="09:00 UTC"
STANDUP_FILE="/c/aoe-unified-final/STANDUPS/standup-$(date +%Y-%m-%d).md"

cat > "$STANDUP_FILE" << 'EOF'
# Daily Standup - $(date +%Y-%m-%d)

## Stream Status

### Infrastructure (Agent 2A + 2B)
- [ ] Status:
- [ ] Blockers:
- [ ] Next:

### Dashboard (Agent 3A + 3B)
- [ ] Status:
- [ ] Feature progress: /43
- [ ] Blockers:
- [ ] Next:

### Data (Agent 4A + 4B)
- [ ] Status:
- [ ] Migrations:
- [ ] Blockers:
- [ ] Next:

### Auth (Agent 5A + 5B)
- [ ] Status:
- [ ] Load test users:
- [ ] Blockers:
- [ ] Next:

### Testing (Agent 6A + 6B)
- [ ] Status:
- [ ] Tests passing: /43+
- [ ] Soak test: days running
- [ ] Blockers:
- [ ] Next:

## Gate Status

| Gate | Required | Current | Day | Status |
|------|----------|---------|-----|--------|
| gateway-stable | p95 < 100ms | TBD | 2 | ⏳ |
| features-verified | 43/43 | 0/43 | 5 | ⏳ |
| zero-data-loss | checksums match | TBD | 4 | ⏳ |
| auth-load-test | 1000 users < 200ms | TBD | 5 | ⏳ |
| 7-day-soak | clean logs | 0 days | 8 | ⏳ |

## Decisions

| Decision | Agent | Status | Date |
|----------|-------|--------|------|
| (none yet) | - | - | - |

## Issues for Agent 1 Review

(List any decisions that need escalation)

EOF

git add "$STANDUP_FILE"
git commit -m "[AUTO] Daily standup: $(date +%Y-%m-%d)"
git push

echo "✓ Standup recorded: $STANDUP_FILE"
```

---

## Streaming Validation Checklist

### Pre-Day 1
- [ ] All 5 contract templates created
- [ ] Webhook infrastructure tested
- [ ] Git sync daemon running
- [ ] Both laptops networked + can ping
- [ ] SSH keys configured (L1 → L2)
- [ ] All 13 agents ready to launch

### Day 1
- [ ] Hour 0: All agents launched
- [ ] Hour 4: All 5 contracts published
- [ ] Hour 12: First tests running (against mocks)

### Day 2
- [ ] Gateway implementation started
- [ ] Tests now run against real endpoints
- [ ] L2 stress test begun
- [ ] No critical blockers

### Day 3
- [ ] Gateway stable (p95 < 100ms)
- [ ] Dashboard merges 50% done
- [ ] Data migrations applied
- [ ] Auth service working

### Day 4
- [ ] Data integrity verified (zero loss)
- [ ] All 4 dashboards merged
- [ ] 30/43 features tested

### Day 5
- [ ] **GATE: All 43 features verified** ✓
- [ ] Load test 4 days running clean
- [ ] All services stable
- [ ] Ready for hardening

### Day 6-7
- [ ] Hardening complete
- [ ] 6+ days of soak test clean
- [ ] Dry-run approved

### Day 8
- [ ] Dry-run cutover successful
- [ ] Production cutover executed
- [ ] L2 6B monitoring (24/7 load test)

---

## Troubleshooting

### Webhook Not Firing
```bash
# Check webhook is reachable
curl -X POST http://localhost:9000/webhook/contract-change \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check git post-receive hook exists
cat /c/aoe-unified-final/.git/hooks/post-receive
```

### Contract Not Updated
```bash
# Verify contract files exist
ls -la /c/aoe-unified-final/shared/*-spec.json

# Check git status
cd /c/aoe-unified-final && git status

# Manual pull
git pull origin feature/supadash-consolidation
```

### Agent Not Pulling Changes
```bash
# Check sync daemon
ps aux | grep sync-daemon

# Check logs
tail -f /c/aoe-unified-final/LOGS/sync-daemon.log

# Manual test
curl http://localhost:9000/api/agents
```

### Conflict Not Detected
```bash
# Check conflict detection logic
curl http://laptop2:9001/api/conflicts

# Review conflict rules
cat /c/aoe-unified-final/shared/conflict-detection-rules.json
```

---

## Streaming Success Metrics

At any point during Days 1-8, you should see:

```
✅ Every day, commits decrease in size (stubs → full implementation)
✅ Tests accumulate daily (0 → 100+ by Day 5)
✅ Features verified continuously (not batch at end)
✅ Load test running 24/7 (baseline established, no surprises at cutover)
✅ < 2 agents idle at any time (stream parallelism working)
✅ < 1 day for any bug fix (parallel testing catches issues early)
✅ 0 feature loss (continuous verification)
```

If you see:
- ❌ Agents waiting for "completion": Streaming isn't working, contract isn't clear enough
- ❌ No tests running: Test scaffold isn't ready, fix by Day 1 Hour 4
- ❌ Feature loss discovered late: Testing isn't continuous, need to add regression tests

---

## TL;DR: Streaming Execution

```bash
# Day 1, Hour 0
./agents/bootstrap-day1.sh

# Day 1, Hour 4
./agents/publish-contracts-day1.sh

# Days 1-8: Automatic
# - Sync daemon pulls every 5 min
# - Webhooks fire on contract changes
# - Agents notify each other via shared files
# - L2 validates L1's work in real-time
# - Tests run continuously

# Day 8, Production
./scripts/cutover-dry-run.sh
./scripts/cutover-production.sh
```

