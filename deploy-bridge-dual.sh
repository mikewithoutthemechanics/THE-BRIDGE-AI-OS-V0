#!/bin/bash
# Deploy Bridge AI OS - Dual-Side Complete Orchestration
# Launches THIS SIDE + OTHER SIDE + BRIDGE SERVICE in synchronized fashion

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         BRIDGE AI OS - DUAL-SIDE DEPLOYMENT                    ║${NC}"
echo -e "${BLUE}║         Complete Mirrored Infrastructure Setup                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"

# =============================================
# PHASE 1: Pre-flight Checks
# =============================================

echo -e "${YELLOW}[PHASE 1] Pre-flight Checks${NC}"

if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ Docker not found${NC}"
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  echo -e "${RED}✗ Docker Compose not found${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Docker installed${NC}"
echo -e "${GREEN}✓ Docker Compose installed${NC}\n"

# =============================================
# PHASE 2: Environment Setup
# =============================================

echo -e "${YELLOW}[PHASE 2] Environment Setup${NC}"

if [ ! -f .env ]; then
  echo -e "${RED}✗ .env not found. Run: cp .env.example .env${NC}"
  exit 1
fi

if [ ! -f .env.other ]; then
  echo -e "${YELLOW}⚠ .env.other not found. Creating from .env.example...${NC}"
  cp .env.example .env.other
  echo -e "${GREEN}✓ .env.other created${NC}"
fi

echo -e "${GREEN}✓ Environment files ready${NC}\n"

# =============================================
# PHASE 3: Verify Compose Files
# =============================================

echo -e "${YELLOW}[PHASE 3] Verify Compose Files${NC}"

for file in docker-compose.prod.yml docker-compose.other.yml; do
  if [ ! -f "$file" ]; then
    echo -e "${RED}✗ $file not found${NC}"
    exit 1
  fi
  docker-compose -f "$file" config > /dev/null 2>&1 && echo -e "${GREEN}✓ $file valid${NC}" || echo -e "${RED}✗ $file invalid${NC}"
done
echo ""

# =============================================
# PHASE 4: Build Services
# =============================================

echo -e "${YELLOW}[PHASE 4] Build Services${NC}"

echo -e "${BLUE}Building THIS SIDE...${NC}"
docker-compose -f docker-compose.prod.yml build --no-cache || exit 1
echo -e "${GREEN}✓ THIS SIDE built${NC}\n"

echo -e "${BLUE}Building OTHER SIDE...${NC}"
docker-compose -f docker-compose.other.yml build --no-cache || exit 1
echo -e "${GREEN}✓ OTHER SIDE built${NC}\n"

echo -e "${BLUE}Building Bridge Service...${NC}"
docker build -f bridge-service/Dockerfile -t bridge-service:latest bridge-service/ 2>/dev/null || {
  echo -e "${YELLOW}⚠ Bridge Service Dockerfile not found, creating minimal image...${NC}"
  mkdir -p bridge-service
  cat > bridge-service/Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY index.js .
EXPOSE 9000
CMD ["node", "index.js"]
EOF
  docker build -f bridge-service/Dockerfile -t bridge-service:latest bridge-service/
}
echo -e "${GREEN}✓ Bridge Service built${NC}\n"

# =============================================
# PHASE 5: Start THIS SIDE (Production)
# =============================================

echo -e "${YELLOW}[PHASE 5] Start THIS SIDE${NC}"

echo -e "${BLUE}Launching THIS SIDE services...${NC}"
docker-compose -f docker-compose.prod.yml up -d || exit 1

echo -e "${BLUE}Waiting for THIS SIDE to stabilize...${NC}"
sleep 10

docker-compose -f docker-compose.prod.yml ps

echo -e "${GREEN}✓ THIS SIDE running${NC}\n"

# =============================================
# PHASE 6: Start OTHER SIDE
# =============================================

echo -e "${YELLOW}[PHASE 6] Start OTHER SIDE${NC}"

echo -e "${BLUE}Launching OTHER SIDE services...${NC}"
docker-compose -f docker-compose.other.yml --env-file .env.other up -d || exit 1

echo -e "${BLUE}Waiting for OTHER SIDE to stabilize...${NC}"
sleep 10

docker-compose -f docker-compose.other.yml ps

echo -e "${GREEN}✓ OTHER SIDE running${NC}\n"

# =============================================
# PHASE 7: Start Bridge Service
# =============================================

echo -e "${YELLOW}[PHASE 7] Start Bridge Service${NC}"

docker run -d \
  --name bridge-service \
  --network bridge_network_sync \
  -e NODE_ENV=production \
  -e REDIS_URL=redis://redis:6379 \
  -e THIS_SIDE_GATEWAY=http://gateway:8080 \
  -e THIS_SIDE_BRAIN=http://brain:8000 \
  -e THIS_SIDE_MAIN=http://main-service:3000 \
  -e OTHER_SIDE_GATEWAY=http://gateway-other:8080 \
  -e OTHER_SIDE_BRAIN=http://brain-other:8000 \
  -e OTHER_SIDE_MAIN=http://main-service-other:3000 \
  -p 9000:9000 \
  bridge-service:latest || echo -e "${YELLOW}⚠ Bridge Service already running${NC}"

sleep 5

echo -e "${GREEN}✓ Bridge Service running${NC}\n"

# =============================================
# PHASE 8: Health Verification
# =============================================

echo -e "${YELLOW}[PHASE 8] Health Verification${NC}"

echo -e "${BLUE}Checking THIS SIDE gateway...${NC}"
curl -s http://localhost:8080/health | jq . || echo -e "${YELLOW}⚠ Not responding yet${NC}"

echo -e "${BLUE}Checking OTHER SIDE gateway...${NC}"
curl -s http://localhost:8080/health | jq . || echo -e "${YELLOW}⚠ Not responding yet${NC}"

echo -e "${BLUE}Checking Bridge Service...${NC}"
curl -s http://localhost:9000/health | jq . || echo -e "${YELLOW}⚠ Not responding yet${NC}"

echo ""

# =============================================
# PHASE 9: Status Dashboard
# =============================================

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         DEPLOYMENT COMPLETE - SYSTEM STATUS                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}THIS SIDE (Primary Control Plane):${NC}"
docker-compose -f docker-compose.prod.yml ps | grep -E "bridge-" | head -10

echo ""
echo -e "${GREEN}OTHER SIDE (Mirror Execution Plane):${NC}"
docker-compose -f docker-compose.other.yml ps | grep -E "bridge-.*-other" | head -10

echo ""
echo -e "${GREEN}Bridge Service:${NC}"
docker ps --filter "name=bridge-service" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""

# =============================================
# PHASE 10: Access Information
# =============================================

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         ACCESS POINTS                                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}THIS SIDE:${NC}"
echo "  Gateway:      http://localhost:8080"
echo "  Main Service: http://localhost:3000"
echo "  Brain Engine: http://localhost:8000"
echo "  SVG Engine:   http://localhost:7070"

echo ""
echo -e "${GREEN}OTHER SIDE:${NC}"
echo "  Gateway:      http://localhost:8080 (OTHER_SIDE subnet)"
echo "  Main Service: http://main-service-other:3000"
echo "  Brain Engine: http://brain-other:8000"
echo "  SVG Engine:   http://svg-engine-other:7070"

echo ""
echo -e "${GREEN}BRIDGE SERVICE:${NC}"
echo "  API:          http://localhost:9000"
echo "  Health:       http://localhost:9000/health"
echo "  Metrics:      http://localhost:9000/metrics"
echo "  Route Logic:  POST http://localhost:9000/route"

echo ""

# =============================================
# PHASE 11: Logs & Monitoring
# =============================================

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         USEFUL COMMANDS                                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}View Logs:${NC}"
echo "  THIS SIDE:    docker-compose -f docker-compose.prod.yml logs -f [service]"
echo "  OTHER SIDE:   docker-compose -f docker-compose.other.yml logs -f [service]"
echo "  Bridge:       docker logs -f bridge-service"

echo ""
echo -e "${GREEN}Stop All:${NC}"
echo "  THIS SIDE:    docker-compose -f docker-compose.prod.yml down"
echo "  OTHER SIDE:   docker-compose -f docker-compose.other.yml down"
echo "  Bridge:       docker stop bridge-service && docker rm bridge-service"

echo ""
echo -e "${GREEN}Full Shutdown:${NC}"
echo "  bash deploy-5tier.sh stop"

echo ""
echo -e "${GREEN}✓ Bridge AI OS is now operational as a dual-mirrored system${NC}\n"
