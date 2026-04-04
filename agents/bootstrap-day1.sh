#!/bin/bash

##############################################################################
# SUPADASH STREAMING BOOTSTRAP - Day 1, Hour 0
#
# This script launches the entire 8-day streaming execution:
# - Laptop 1: 6 Claude agents (Opus, Sonnet x3, Haiku x2)
# - Laptop 2: 7 Specialist agents (Kimi, Nemotron x2, Xiaomi x2, Minimax x2)
#
# Usage:
#   ./agents/bootstrap-day1.sh
#
##############################################################################

set -e

REPO="/c/aoe-unified-final"
L1_PORT="9000"
L2_PORT="9001"
HOSTNAME_L2="laptop2"  # Change if your L2 hostname is different

cd "$REPO"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "═══════════════════════════════════════════════════════════"
echo "  SUPADASH STREAMING BOOTSTRAP"
echo "  Day 1, Hour 0 - Launch all 13 agents"
echo "═══════════════════════════════════════════════════════════"
echo -e "${NC}"

# Pre-flight checks
echo -e "${YELLOW}► Pre-flight checks...${NC}"

if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found${NC}"
  exit 1
fi

if ! node -e "require('express')" 2>/dev/null; then
  echo -e "${RED}✗ Express not installed${NC}"
  echo "Run: npm install express cors body-parser"
  exit 1
fi

if [ ! -f "agents/laptop1-streaming-orchestrator.js" ]; then
  echo -e "${RED}✗ laptop1-streaming-orchestrator.js not found${NC}"
  exit 1
fi

if [ ! -f "agents/laptop2-streaming-orchestrator.js" ]; then
  echo -e "${RED}✗ laptop2-streaming-orchestrator.js not found${NC}"
  exit 1
fi

# Check if L2 is reachable
echo -e "${YELLOW}► Testing L2 connectivity (${HOSTNAME_L2})...${NC}"
if ! ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "${HOSTNAME_L2}" "echo OK" &>/dev/null; then
  echo -e "${YELLOW}⚠ Warning: Cannot reach ${HOSTNAME_L2}${NC}"
  echo "  Proceeding with L1 only (L2 must be started separately)"
  L2_REMOTE=0
else
  echo -e "${GREEN}✓ L2 reachable${NC}"
  L2_REMOTE=1
fi

# Create necessary directories
echo -e "${YELLOW}► Creating directories...${NC}"
mkdir -p shared LOGS STANDUPS AGENTS
echo -e "${GREEN}✓ Directories ready${NC}"

# Initialize git branch
echo -e "${YELLOW}► Checking git branch...${NC}"
if ! git branch | grep -q "feature/supadash-consolidation"; then
  echo "  Creating feature/supadash-consolidation branch..."
  git checkout -b feature/supadash-consolidation
else
  echo "  Switching to feature/supadash-consolidation..."
  git checkout feature/supadash-consolidation
fi
echo -e "${GREEN}✓ Git branch ready${NC}"

# Kill any existing agents
echo -e "${YELLOW}► Cleaning up old processes...${NC}"
pkill -f "laptop.-streaming-orchestrator" 2>/dev/null || true
sleep 2
echo -e "${GREEN}✓ Old processes stopped${NC}"

# Start L1 orchestrator
echo -e "${YELLOW}► Starting L1 orchestrator (Port ${L1_PORT})...${NC}"
node agents/laptop1-streaming-orchestrator.js --port $L1_PORT > LOGS/LAPTOP_1_ORCHESTRATOR.log 2>&1 &
L1_ORCHESTRATOR_PID=$!
echo -e "${GREEN}✓ L1 orchestrator started (PID: ${L1_ORCHESTRATOR_PID})${NC}"

# Wait for L1 to be ready
echo -e "${YELLOW}► Waiting for L1 to be ready...${NC}"
for i in {1..30}; do
  if curl -s http://localhost:$L1_PORT/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ L1 ready${NC}"
    break
  fi
  echo "  Waiting... ($i/30)"
  sleep 1
done

# Start L2 orchestrator (if reachable)
if [ $L2_REMOTE -eq 1 ]; then
  echo -e "${YELLOW}► Starting L2 orchestrator on ${HOSTNAME_L2} (Port ${L2_PORT})...${NC}"
  ssh -n "${HOSTNAME_L2}" "cd \"$REPO\" && nohup node agents/laptop2-streaming-orchestrator.js --port $L2_PORT > LOGS/LAPTOP_2_ORCHESTRATOR.log 2>&1 &" &
  sleep 3
  echo -e "${GREEN}✓ L2 orchestrator started${NC}"

  # Wait for L2 to be ready
  echo -e "${YELLOW}► Waiting for L2 to be ready...${NC}"
  for i in {1..30}; do
    if ssh -o ConnectTimeout=2 "${HOSTNAME_L2}" "curl -s http://localhost:$L2_PORT/health" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ L2 ready${NC}"
      break
    fi
    echo "  Waiting... ($i/30)"
    sleep 1
  done
else
  echo -e "${YELLOW}► L2 will be started manually on ${HOSTNAME_L2}${NC}"
  echo "   Run this on L2 when ready:"
  echo "   ${BLUE}cd ${REPO} && node agents/laptop2-streaming-orchestrator.js --port ${L2_PORT}${NC}"
fi

# Create initial status file
echo -e "${YELLOW}► Initializing status files...${NC}"
cat > "$REPO/AGENTS/BOOTSTRAP_STATUS.json" << EOF
{
  "bootstrap_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "l1_port": $L1_PORT,
  "l1_pid": $L1_ORCHESTRATOR_PID,
  "l2_port": $L2_PORT,
  "l2_status": "$([ $L2_REMOTE -eq 1 ] && echo 'starting' || echo 'manual')",
  "timeline_days": 8,
  "mode": "streaming"
}
EOF

cat > "$REPO/SUPADASH_BOOTSTRAP_START.md" << EOF
# SUPADASH Bootstrap: Day 1 Hour 0

**Timestamp:** $(date)

**L1 Status:** Running on Port $L1_PORT
- Process: laptop1-streaming-orchestrator.js
- PID: $L1_ORCHESTRATOR_PID
- Agents: 6 (Opus, Sonnet x3, Haiku x2)

**L2 Status:** $([ $L2_REMOTE -eq 1 ] && echo "Running on Port $L2_PORT" || echo "Manual start required")
- Process: laptop2-streaming-orchestrator.js
- Agents: 7 (Kimi, Nemotron x2, Xiaomi x2, Minimax x2)

**Git Branch:** feature/supadash-consolidation

**Timeline:** 8 days streaming execution

---

## Next Step: Day 1 Hour 4

At Day 1 Hour 4 (4 hours from now), run:

\`\`\`bash
./agents/publish-contracts-day1.sh
\`\`\`

This publishes the 5 initial contracts that all agents need.

---

## Monitor Progress

### L1 Status
\`\`\`bash
curl http://localhost:$L1_PORT/api/status | jq
\`\`\`

### L2 Status
\`\`\`bash
curl http://localhost:$(ssh $HOSTNAME_L2 'echo $((9001))'):$L2_PORT/api/status | jq
\`\`\`

### Git Log
\`\`\`bash
watch -n 5 'git log --oneline | head -10'
\`\`\`

### Logs
\`\`\`bash
tail -f LOGS/LAPTOP_1.log
tail -f LOGS/LAPTOP_2.log
\`\`\`

EOF

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ BOOTSTRAP COMPLETE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Streaming Timeline Active:${NC}"
echo "  L1 (Port $L1_PORT): 6 Claude agents ready"
[ $L2_REMOTE -eq 1 ] && echo "  L2 (Port $L2_PORT): 7 Specialist agents ready" || echo "  L2: Manual start required"
echo ""
echo -e "${YELLOW}Next Action (in 4 hours - Day 1 Hour 4):${NC}"
echo "  ${BLUE}./agents/publish-contracts-day1.sh${NC}"
echo ""
echo -e "${YELLOW}Monitor:${NC}"
echo "  ${BLUE}curl http://localhost:$L1_PORT/api/status | jq${NC}"
echo "  ${BLUE}watch -n 5 'git log --oneline | head -10'${NC}"
echo ""
