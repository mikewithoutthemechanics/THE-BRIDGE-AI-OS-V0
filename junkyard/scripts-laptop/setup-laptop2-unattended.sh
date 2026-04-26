#!/bin/bash

##############################################################################
# SUPADASH LAPTOP 2 - UNATTENDED SETUP
#
# This script completely sets up and runs Laptop 2 hands-free
# Designed to be deployed via SSH from Laptop 1
#
# Usage from L1:
#   ssh laptop2 "bash -s" < /c/aoe-unified-final/setup-laptop2-unattended.sh
#
# Or directly on L2:
#   bash /c/aoe-unified-final/setup-laptop2-unattended.sh
#
##############################################################################

set -e

REPO="/c/aoe-unified-final"
L1_HOST="${L1_HOST:-localhost}"
L1_PORT="${L1_PORT:-9000}"
L2_PORT="9001"
HOSTNAME=$(hostname)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() {
  echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

##############################################################################
# PHASE 1: PRE-FLIGHT CHECKS
##############################################################################

log "═══════════════════════════════════════════════════════════"
log "SUPADASH LAPTOP 2 - UNATTENDED SETUP"
log "═══════════════════════════════════════════════════════════"
log ""

log "Phase 1: Pre-flight checks..."

# Check Node.js
if ! command -v node &> /dev/null; then
  error "Node.js not found. Install Node.js v18+ first."
fi
success "Node.js: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
  error "npm not found."
fi
success "npm: $(npm --version)"

# Check git
if ! command -v git &> /dev/null; then
  error "git not found."
fi
success "git: $(git --version | head -1)"

# Create repo directory if needed
if [ ! -d "$REPO" ]; then
  error "Repo not found at $REPO. Clone it first."
fi
success "Repository: $REPO"

# Create directories
log "Creating directories..."
mkdir -p "$REPO"/{shared,LOGS,STANDUPS,AGENTS}
success "Directories created"

# Change to repo
cd "$REPO"

# Check git
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  error "$REPO is not a git repository"
fi
success "Git repository verified"

# Get or create feature branch
log "Setting up git branch..."
if ! git branch | grep -q "feature/supadash-consolidation"; then
  log "  Creating feature/supadash-consolidation..."
  git checkout -b feature/supadash-consolidation 2>/dev/null || git checkout feature/supadash-consolidation
else
  log "  Using existing feature/supadash-consolidation..."
  git checkout feature/supadash-consolidation
fi
success "Git branch: feature/supadash-consolidation"

# Verify orchestrator script
if [ ! -f "agents/laptop2-streaming-orchestrator.js" ]; then
  error "laptop2-streaming-orchestrator.js not found"
fi
success "Orchestrator script found"

# Make scripts executable
chmod +x agents/*.sh agents/*orchestrator.js 2>/dev/null || true
success "Scripts executable"

# Check npm dependencies
log "Checking npm dependencies..."
if ! npm list express > /dev/null 2>&1; then
  log "  Installing express..."
  npm install express cors body-parser
fi
success "Dependencies ready"

# Set up logging
touch LOGS/LAPTOP_2.log
success "Log file ready: LOGS/LAPTOP_2.log"

##############################################################################
# PHASE 2: WAIT FOR L1 BOOTSTRAP
##############################################################################

log ""
log "Phase 2: Waiting for L1 to bootstrap..."

# Function to check L1 readiness
check_l1() {
  curl -s http://$L1_HOST:$L1_PORT/health > /dev/null 2>&1
  return $?
}

TIMEOUT=1800  # 30 minutes
ELAPSED=0
INTERVAL=10

while [ $ELAPSED -lt $TIMEOUT ]; do
  if check_l1; then
    success "L1 is ready (http://$L1_HOST:$L1_PORT)"
    break
  fi

  REMAINING=$((TIMEOUT - ELAPSED))
  log "  Waiting for L1... ($REMAINING seconds remaining)"
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if ! check_l1; then
  error "L1 did not respond within 30 minutes. Is L1 running?"
fi

# Verify L1 has agents
log "Verifying L1 agents..."
L1_AGENT_COUNT=$(curl -s http://$L1_HOST:$L1_PORT/api/agents | jq '.total' 2>/dev/null || echo "0")
if [ "$L1_AGENT_COUNT" = "6" ]; then
  success "L1 has 6 agents initialized"
else
  error "L1 agents not ready (expected 6, got $L1_AGENT_COUNT)"
fi

##############################################################################
# PHASE 3: SYNC WITH L1
##############################################################################

log ""
log "Phase 3: Syncing with L1..."

log "  Pulling latest code and contracts..."
git pull origin feature/supadash-consolidation
success "Repository synced"

# List contracts
CONTRACTS=$(ls -1 shared/*-spec.json shared/*-manifest.json 2>/dev/null | wc -l)
if [ "$CONTRACTS" -gt 0 ]; then
  success "Found $CONTRACTS contracts in shared/"
else
  log "  No contracts yet (normal, L1 will publish at Hour 4)"
fi

##############################################################################
# PHASE 4: LAUNCH L2 ORCHESTRATOR
##############################################################################

log ""
log "Phase 4: Launching L2 orchestrator..."

# Kill any existing processes
pkill -f "laptop2-streaming-orchestrator" 2>/dev/null || true
sleep 2

# Start orchestrator
log "  Starting orchestrator process..."
nohup node agents/laptop2-streaming-orchestrator.js --port $L2_PORT \
  > LOGS/LAPTOP_2_ORCHESTRATOR.log 2>&1 &

ORCHESTRATOR_PID=$!
echo $ORCHESTRATOR_PID > /tmp/laptop2-orchestrator.pid

log "  Orchestrator PID: $ORCHESTRATOR_PID"
log "  Waiting for orchestrator to be ready..."

# Wait for orchestrator
TIMEOUT=120
ELAPSED=0
INTERVAL=2

while [ $ELAPSED -lt $TIMEOUT ]; do
  if curl -s http://localhost:$L2_PORT/health > /dev/null 2>&1; then
    success "L2 orchestrator is ready (http://localhost:$L2_PORT)"
    break
  fi

  REMAINING=$((TIMEOUT - ELAPSED))
  echo -n "."
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if ! curl -s http://localhost:$L2_PORT/health > /dev/null 2>&1; then
  error "L2 orchestrator did not start within 2 minutes"
fi

echo ""

# Verify agents
log "Verifying L2 agents..."
L2_AGENT_COUNT=$(curl -s http://localhost:$L2_PORT/api/agents | jq '.total' 2>/dev/null || echo "0")
if [ "$L2_AGENT_COUNT" = "7" ]; then
  success "L2 has 7 specialist agents initialized"
else
  error "L2 agents not ready (expected 7, got $L2_AGENT_COUNT)"
fi

##############################################################################
# PHASE 5: SAVE BOOTSTRAP STATUS
##############################################################################

log ""
log "Phase 5: Saving bootstrap status..."

cat > AGENTS/LAPTOP2_BOOTSTRAP_STATUS.json << EOF
{
  "bootstrap_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "l2_port": $L2_PORT,
  "l2_hostname": "$HOSTNAME",
  "l2_status": "running",
  "orchestrator_pid": $ORCHESTRATOR_PID,
  "agents_count": 7,
  "l1_connected": true,
  "l1_host": "$L1_HOST",
  "l1_port": $L1_PORT,
  "timeline_days": 8,
  "mode": "streaming"
}
EOF

success "Bootstrap status saved"

# Create startup log
cat >> LOGS/LAPTOP_2.log << EOF
═══════════════════════════════════════════════════════════
LAPTOP 2 BOOTSTRAP COMPLETE
═══════════════════════════════════════════════════════════
Timestamp: $(date)
Hostname: $HOSTNAME
L2 Port: $L2_PORT
Orchestrator PID: $ORCHESTRATOR_PID
L1 Connected: $L1_HOST:$L1_PORT
Agents: 7 (Kimi, Nemotron x2, Xiaomi x2, Minimax x2)
Timeline: 8-day streaming execution
═══════════════════════════════════════════════════════════
EOF

##############################################################################
# PHASE 6: AUTO-OPERATIONS
##############################################################################

log ""
log "Phase 6: Setting up continuous operations..."

# Create auto-pull script
cat > /tmp/l2-auto-pull.sh << 'EOF'
#!/bin/bash
# Auto-pull every 5 minutes
while true; do
  cd /c/aoe-unified-final
  git pull origin feature/supadash-consolidation 2>/dev/null || true
  git push origin feature/supadash-consolidation 2>/dev/null || true
  sleep 300
done
EOF

chmod +x /tmp/l2-auto-pull.sh

# Start auto-pull in background
nohup /tmp/l2-auto-pull.sh > /dev/null 2>&1 &
success "Auto-pull daemon started (every 5 min)"

# Create health check script
cat > /tmp/l2-health-check.sh << 'EOF'
#!/bin/bash
# Monitor orchestrator health
while true; do
  if ! curl -s http://localhost:9001/health > /dev/null 2>&1; then
    echo "[$(date)] L2 health check failed, attempting restart..."
    pkill -f "laptop2-streaming-orchestrator" || true
    sleep 2
    cd /c/aoe-unified-final
    nohup node agents/laptop2-streaming-orchestrator.js --port 9001 \
      >> LOGS/LAPTOP_2_ORCHESTRATOR.log 2>&1 &
  fi
  sleep 60
done
EOF

chmod +x /tmp/l2-health-check.sh

# Start health check in background
nohup /tmp/l2-health-check.sh > /dev/null 2>&1 &
success "Health check daemon started (every 60 sec)"

##############################################################################
# COMPLETION
##############################################################################

log ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ L2 BOOTSTRAP COMPLETE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${BLUE}Status:${NC}"
echo "  L2 Orchestrator: http://localhost:$L2_PORT (running)"
echo "  Agents: 7 specialist models (Kimi, Nemotron, Xiaomi, Minimax)"
echo "  Connected to L1: $L1_HOST:$L1_PORT ✓"
echo "  Auto-pull: Every 5 minutes ✓"
echo "  Health check: Every 60 seconds ✓"
echo ""

echo -e "${YELLOW}Next:${NC}"
echo "  - Return to L1"
echo "  - Wait 4 hours"
echo "  - Run: ./agents/publish-contracts-day1.sh"
echo ""

echo -e "${BLUE}Monitor from L1:${NC}"
echo "  curl http://$HOSTNAME:$L2_PORT/api/status | jq"
echo "  curl http://$HOSTNAME:$L2_PORT/api/conflicts | jq"
echo ""

echo -e "${YELLOW}Logs on L2:${NC}"
echo "  tail -f LOGS/LAPTOP_2.log"
echo "  tail -f LOGS/LAPTOP_2_ORCHESTRATOR.log"
echo ""

# Keep script running (prevents SSH session from closing)
log "Setup complete. Keeping connection alive..."
while true; do
  sleep 3600
done
