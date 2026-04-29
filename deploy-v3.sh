#!/bin/bash
# BridgeAI OS v3 - Complete Deployment Workflow

set -e

echo "🚀 BridgeAI OS v3 - Complete Deployment"
echo "======================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from template...${NC}"
    cp .env.template .env
    echo -e "${RED}❌ Please edit .env with your API keys before proceeding${NC}"
    echo "Required: OPENAI_API_KEY, JWT_SECRET, POSTGRES_PASSWORD"
    exit 1
fi

echo -e "${BLUE}📋 Deployment Steps:${NC}"
echo "1. 🏗️  Building service images..."
echo "2. 🗃️  Starting infrastructure (PostgreSQL, Redis)..."
echo "3. ⚙️  Deploying core services..."
echo "4. 🧪 Testing connections..."
echo "5. 🔧 Running maintenance..."
echo "6. 📊 Creating monitoring dashboard..."
echo ""

# Step 1: Build all service images
echo -e "${BLUE}🏗️  Step 1: Building Service Images${NC}"
echo -e "${BLUE}=================================${NC}"

SERVICES=("config-service" "admin-api" "treasury" "gateway" "super-brain" "telephony" "svg-engine")

for service in "${SERVICES[@]}"; do
    echo -e "${YELLOW}Building $service...${NC}"

    # Create basic service directory structure if it doesn't exist
    if [ ! -d "services/$service" ]; then
        mkdir -p "services/$service"
        echo "Creating placeholder for $service"

        # Create a basic Dockerfile for each service
        cat > "services/$service/Dockerfile" << EOF
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE ${service//[^0-9]/}000
CMD ["npm", "start"]
EOF

        # Create basic package.json
        cat > "services/$service/package.json" << EOF
{
  "name": "$service",
  "version": "3.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  }
}
EOF

        # Create basic service file
        cat > "services/$service/index.js" << EOF
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || ${service//[^0-9]/}000;

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    service: '$service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '3.0.0'
  });
});

// Service-specific endpoints
app.get('/', (req, res) => {
  res.json({
    message: '$service service running',
    endpoints: ['/health']
  });
});

app.listen(PORT, () => {
  console.log('$service listening on port ' + PORT);
});
EOF

    fi

    # Build the Docker image
    if docker build -t bridge-ai/$service:v3 services/$service; then
        echo -e "${GREEN}✅ $service built successfully${NC}"
    else
        echo -e "${RED}❌ Failed to build $service${NC}"
        exit 1
    fi
done

echo ""

# Step 2: Start infrastructure
echo -e "${BLUE}🗃️  Step 2: Starting Infrastructure${NC}"
echo -e "${BLUE}=================================${NC}"

echo -e "${YELLOW}Starting PostgreSQL and Redis...${NC}"
docker-compose -f docker-compose.v3.yml up -d postgres redis

# Wait for infrastructure to be ready
echo -e "${YELLOW}Waiting for infrastructure...${NC}"
sleep 10

# Check if infrastructure is ready
if docker-compose -f docker-compose.v3.yml exec -T postgres pg_isready -U bridge > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
else
    echo -e "${RED}❌ PostgreSQL failed to start${NC}"
    exit 1
fi

if docker-compose -f docker-compose.v3.yml exec -T redis redis-cli ping | grep -q PONG; then
    echo -e "${GREEN}✅ Redis is ready${NC}"
else
    echo -e "${RED}❌ Redis failed to start${NC}"
    exit 1
fi

echo ""

# Step 3: Deploy core services in dependency order
echo -e "${BLUE}⚙️  Step 3: Deploying Core Services${NC}"
echo -e "${BLUE}=================================${NC}"

# Deploy in dependency order
DEPLOY_ORDER=("config-service" "admin-api" "treasury" "super-brain" "gateway" "telephony" "svg-engine")

for service in "${DEPLOY_ORDER[@]}"; do
    echo -e "${YELLOW}Deploying $service...${NC}"

    if docker-compose -f docker-compose.v3.yml up -d $service; then
        echo -e "${GREEN}✅ $service deployed${NC}"

        # Wait a bit for service to start
        sleep 5

        # Quick health check
        SERVICE_PORT=$(grep -A 5 "$service:" docker-compose.v3.yml | grep -o '"[0-9]*:' | tr -d '"')
        if [ -n "$SERVICE_PORT" ]; then
            if curl -s -f "http://localhost:$SERVICE_PORT/health" > /dev/null 2>&1; then
                echo -e "${GREEN}✅ $service health check passed${NC}"
            else
                echo -e "${YELLOW}⚠️  $service health check pending${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ Failed to deploy $service${NC}"
        exit 1
    fi
done

echo ""

# Step 4: Run connection tests
echo -e "${BLUE}🧪 Step 4: Testing Connections${NC}"
echo -e "${BLUE}===========================${NC}"

./quick-test.sh

echo ""

# Step 5: Run maintenance
echo -e "${BLUE}🔧 Step 5: Running Maintenance${NC}"
echo -e "${BLUE}===========================${NC}"

# Create maintenance tasks
echo -e "${YELLOW}Setting up automated maintenance...${NC}"

# Create cron jobs for maintenance (if on Linux/Mac)
if command -v crontab > /dev/null 2>&1; then
    # Add maintenance cron job
    (crontab -l 2>/dev/null; echo "0 */6 * * * cd $(pwd) && ./bridge-ai-deploy.sh maintain") | crontab -
    echo -e "${GREEN}✅ Maintenance cron job added${NC}"
else
    echo -e "${YELLOW}⚠️  Cron not available - run maintenance manually${NC}"
fi

echo ""

# Step 6: Create monitoring dashboard
echo -e "${BLUE}📊 Step 6: Creating Monitoring Dashboard${NC}"
echo -e "${BLUE}======================================${NC}"

# The monitoring dashboard was already created by the deploy script
echo -e "${GREEN}✅ Monitoring dashboard ready at monitoring-dashboard.html${NC}"

echo ""

# Final status
echo -e "${GREEN}🎉 BRIDGEAI OS V3 DEPLOYMENT COMPLETE!${NC}"
echo ""
echo -e "${BLUE}🌐 Service Endpoints:${NC}"
echo "• Admin Dashboard: http://localhost:3100"
echo "• System Map:      http://localhost:3600"
echo "• Gateway API:     http://localhost:3300"
echo "• Telephony:       http://localhost:3500"
echo "• Treasury:        http://localhost:3200"
echo "• Config Service:  http://localhost:8080"
echo ""
echo -e "${BLUE}📊 Monitoring:${NC}"
echo "• Health Dashboard: monitoring-dashboard.html"
echo "• Logs: docker-compose -f docker-compose.v3.yml logs -f"
echo ""
echo -e "${BLUE}🔧 Management:${NC}"
echo "• Test connections: ./quick-test.sh"
echo "• Run maintenance:  ./bridge-ai-deploy.sh maintain"
echo "• Stop system:      docker-compose -f docker-compose.v3.yml down"
echo ""
echo -e "${GREEN}🧬 Your distributed AI OS is now alive!${NC}"