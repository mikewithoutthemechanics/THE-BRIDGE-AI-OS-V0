#!/bin/bash
# Bridge AI OS - 5-Tier Architecture Quick Deployment

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Bridge AI OS - 5-Tier Migration"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found${NC}"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose not found${NC}"
    exit 1
fi

# Create .env
if [ ! -f .env ]; then
    echo -e "${YELLOW}📝 Creating .env file${NC}"
    cat > .env << 'ENVEOF'
DB_USER=bridge
DB_PASS=changeme-prod-password
REDIS_PASS=changeme-redis-password
JWT_SECRET=your-jwt-secret-key-change-in-production
NEO4J_USER=neo4j
NEO4J_PASS=changeme-neo4j-password
SUPABASE_URL=
SUPABASE_KEY=
NODE_ENV=production
ENVEOF
    echo -e "${GREEN}✅ .env created${NC}"
fi

# Create certs
if [ ! -d certs ]; then
    echo -e "${YELLOW}🔐 Generating SSL certificates${NC}"
    mkdir -p certs
    openssl req -x509 -newkey rsa:4096 -keyout certs/server.key -out certs/server.crt \
        -days 365 -nodes -subj "/C=ZA/ST=GP/L=JNB/O=Bridge/CN=localhost" 2>/dev/null
    echo -e "${GREEN}✅ SSL certificates generated${NC}"
fi

# Create migrations dir
mkdir -p migrations

# Build
echo ""
echo -e "${YELLOW}🏗️  Building Docker images...${NC}"
docker compose -f docker-compose.prod.yml build --no-cache

# Start
echo ""
echo -e "${YELLOW}🚀 Starting services${NC}"
docker compose -f docker-compose.prod.yml up -d

sleep 5

# Status
echo ""
echo -e "${YELLOW}📊 Service Status:${NC}"
docker compose -f docker-compose.prod.yml ps

# Test connectivity
echo ""
echo -e "${YELLOW}🧪 Testing services...${NC}"

# Test each service
for service in gateway main-service brain svg-engine postgres redis; do
    if docker compose -f docker-compose.prod.yml exec -T "$service" curl -s http://localhost:$([[ "$service" == "gateway" ]] && echo 8080 || [[ "$service" == "main-service" ]] && echo 3000 || [[ "$service" == "brain" ]] && echo 8000 || [[ "$service" == "svg-engine" ]] && echo 7070 || echo 5432)/health >/dev/null 2>&1; then
        echo -e "  ${GREEN}✅ $service${NC}"
    else
        echo -e "  ${YELLOW}⏳ $service (starting)${NC}"
    fi
done

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo "===================================="
echo "📍 Access Points:"
echo "   Gateway:    http://localhost:8080"
echo "   Main:       http://localhost:3000"
echo "   Brain:      http://localhost:8000"
echo "   SVG:        http://localhost:7070"
echo ""
echo "📋 Next steps:"
echo "   - docker compose -f docker-compose.prod.yml logs -f"
echo "   - docker compose -f docker-compose.prod.yml exec -it postgres psql -U bridge"
echo ""
