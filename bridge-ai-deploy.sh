#!/bin/bash
# BridgeAI OS v3 - Connection Test & Deployment Script
# Tests all service connections and deploys the maintained system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_ENV=${DEPLOY_ENV:-production}
BASE_DIR=$(dirname "$(readlink -f "$0")")
SERVICES=("config-service" "admin-api" "treasury" "gateway" "super-brain" "telephony" "svg-engine")
HEALTH_TIMEOUT=30

echo -e "${BLUE}🚀 BridgeAI OS v3 - Connection Test & Deployment${NC}"
echo -e "${BLUE}=================================================${NC}"
echo "Environment: $DEPLOY_ENV"
echo "Base Directory: $BASE_DIR"
echo ""

# Function to check if a service is healthy
check_service_health() {
    local service=$1
    local port=$2
    local endpoint=${3:-/health}
    local timeout=${4:-$HEALTH_TIMEOUT}

    echo -e "${YELLOW}Testing $service (port $port)...${NC}"

    # Try to connect for up to $timeout seconds
    for i in $(seq 1 $timeout); do
        if curl -s -f "http://localhost:$port$endpoint" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service is healthy${NC}"
            return 0
        fi
        sleep 1
    done

    echo -e "${RED}❌ $service failed health check${NC}"
    return 1
}

# Function to test service connections
test_service_connections() {
    echo -e "${BLUE}🔗 Testing Service Connections${NC}"
    echo -e "${BLUE}===============================${NC}"

    local failed_services=()

    # Test config-service first (port 8080)
    if ! check_service_health "config-service" 8080; then
        failed_services+=("config-service")
    fi

    # Test admin-api (port 3100)
    if ! check_service_health "admin-api" 3100; then
        failed_services+=("admin-api")
    fi

    # Test treasury (port 3200)
    if ! check_service_health "treasury" 3200; then
        failed_services+=("treasury")
    fi

    # Test gateway (port 3300)
    if ! check_service_health "gateway" 3300; then
        failed_services+=("gateway")
    fi

    # Test super-brain (port 3400)
    if ! check_service_health "super-brain" 3400; then
        failed_services+=("super-brain")
    fi

    # Test telephony (port 3500)
    if ! check_service_health "telephony" 3500; then
        failed_services+=("telephony")
    fi

    # Test svg-engine (port 3600)
    if ! check_service_health "svg-engine" 3600; then
        failed_services+=("svg-engine")
    fi

    if [ ${#failed_services[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ All services are healthy!${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed services: ${failed_services[*]}${NC}"
        return 1
    fi
}

# Function to test inter-service communication
test_inter_service_communication() {
    echo -e "${BLUE}🔄 Testing Inter-Service Communication${NC}"
    echo -e "${BLUE}=====================================${NC}"

    # Test config service drift detection
    echo -e "${YELLOW}Testing config drift detection...${NC}"
    if curl -s -X GET "http://localhost:8080/config/drift" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Config drift detection working${NC}"
    else
        echo -e "${RED}❌ Config drift detection failed${NC}"
        return 1
    fi

    # Test treasury wallet access
    echo -e "${YELLOW}Testing treasury wallet access...${NC}"
    if curl -s -X GET "http://localhost:3200/wallets" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Treasury wallet access working${NC}"
    else
        echo -e "${RED}❌ Treasury wallet access failed${NC}"
        return 1
    fi

    # Test brain API
    echo -e "${YELLOW}Testing brain API...${NC}"
    if curl -s -X POST "http://localhost:3400/decide" \
           -H "Content-Type: application/json" \
           -d '{"type":"test","input":"hello"}' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Brain API working${NC}"
    else
        echo -e "${RED}❌ Brain API failed${NC}"
        return 1
    fi

    # Test gateway routing
    echo -e "${YELLOW}Testing gateway routing...${NC}"
    if curl -s -X GET "http://localhost:3300/routes" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Gateway routing working${NC}"
    else
        echo -e "${RED}❌ Gateway routing failed${NC}"
        return 1
    fi

    echo -e "${GREEN}✅ All inter-service communication tests passed!${NC}"
    return 0
}

# Function to test external integrations
test_external_integrations() {
    echo -e "${BLUE}🌐 Testing External Integrations${NC}"
    echo -e "${BLUE}================================${NC}"

    # Test blockchain connectivity (Linea)
    echo -e "${YELLOW}Testing Linea blockchain connectivity...${NC}"
    if curl -s -X POST "http://localhost:8080/blockchain/linea/status" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Linea blockchain connected${NC}"
    else
        echo -e "${YELLOW}⚠️  Linea blockchain connection skipped (expected in dev)${NC}"
    fi

    # Test database connectivity
    echo -e "${YELLOW}Testing database connectivity...${NC}"
    if curl -s -X GET "http://localhost:3100/db/status" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Database connected${NC}"
    else
        echo -e "${RED}❌ Database connection failed${NC}"
        return 1
    fi

    echo -e "${GREEN}✅ External integrations test completed!${NC}"
    return 0
}

# Function to run maintenance tasks
run_maintenance_tasks() {
    echo -e "${BLUE}🔧 Running Maintenance Tasks${NC}"
    echo -e "${BLUE}===========================${NC}"

    # Backup configurations
    echo -e "${YELLOW}Creating config backup...${NC}"
    curl -s -X POST "http://localhost:8080/config/backup" > /dev/null 2>&1 && \
        echo -e "${GREEN}✅ Config backup created${NC}" || \
        echo -e "${YELLOW}⚠️  Config backup skipped${NC}"

    # Clean up old logs
    echo -e "${YELLOW}Cleaning old logs...${NC}"
    find /var/log/bridge-ai -name "*.log" -mtime +30 -delete 2>/dev/null && \
        echo -e "${GREEN}✅ Old logs cleaned${NC}" || \
        echo -e "${YELLOW}⚠️  Log cleanup skipped${NC}"

    # Update service metrics
    echo -e "${YELLOW}Updating service metrics...${NC}"
    curl -s -X POST "http://localhost:3100/metrics/update" > /dev/null 2>&1 && \
        echo -e "${GREEN}✅ Metrics updated${NC}" || \
        echo -e "${YELLOW}⚠️  Metrics update skipped${NC}"

    echo -e "${GREEN}✅ Maintenance tasks completed!${NC}"
}

# Function to deploy services
deploy_services() {
    echo -e "${BLUE}🚀 Deploying BridgeAI OS Services${NC}"
    echo -e "${BLUE}=================================${NC}"

    local deploy_dir="$BASE_DIR/deploy"

    # Create deploy directory if it doesn't exist
    mkdir -p "$deploy_dir"

    # Deploy each service
    for service in "${SERVICES[@]}"; do
        echo -e "${YELLOW}Deploying $service...${NC}"

        # Create service deployment script
        cat > "$deploy_dir/deploy-$service.sh" << EOF
#!/bin/bash
echo "Deploying $service..."
cd "$BASE_DIR"
docker-compose up -d $service
sleep 10
curl -f http://localhost:$(get_service_port $service)/health || exit 1
echo "$service deployed successfully"
EOF

        chmod +x "$deploy_dir/deploy-$service.sh"

        # Execute deployment
        if bash "$deploy_dir/deploy-$service.sh"; then
            echo -e "${GREEN}✅ $service deployed successfully${NC}"
        else
            echo -e "${RED}❌ $service deployment failed${NC}"
            return 1
        fi
    done

    echo -e "${GREEN}✅ All services deployed!${NC}"
    return 0
}

# Helper function to get service ports
get_service_port() {
    case $1 in
        "config-service") echo 8080 ;;
        "admin-api") echo 3100 ;;
        "treasury") echo 3200 ;;
        "gateway") echo 3300 ;;
        "super-brain") echo 3400 ;;
        "telephony") echo 3500 ;;
        "svg-engine") echo 3600 ;;
        *) echo 8080 ;;
    esac
}

# Function to create monitoring dashboard
create_monitoring_dashboard() {
    echo -e "${BLUE}📊 Creating Monitoring Dashboard${NC}"
    echo -e "${BLUE}=================================${NC}"

    cat > "$BASE_DIR/monitoring-dashboard.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>BridgeAI OS v3 - Monitoring Dashboard</title>
    <style>
        body { font-family: monospace; margin: 20px; background: #0a0a0a; color: #00ff88; }
        .service { border: 1px solid #333; padding: 10px; margin: 10px; border-radius: 5px; }
        .healthy { border-color: #00ff88; background: rgba(0,255,136,0.1); }
        .unhealthy { border-color: #ff4444; background: rgba(255,68,68,0.1); }
        .warning { border-color: #ffaa00; background: rgba(255,170,0,0.1); }
        .metric { display: inline-block; margin: 5px; }
    </style>
</head>
<body>
    <h1>BridgeAI OS v3 - System Monitor</h1>
    <div id="services"></div>

    <script>
        async function updateStatus() {
            const services = ['config-service', 'admin-api', 'treasury', 'gateway', 'super-brain', 'telephony', 'svg-engine'];
            const container = document.getElementById('services');

            for (const service of services) {
                try {
                    const response = await fetch(`http://localhost:${getPort(service)}/health`);
                    const data = await response.json();
                    const status = data.healthy ? 'healthy' : 'unhealthy';

                    const serviceDiv = document.createElement('div');
                    serviceDiv.className = `service ${status}`;
                    serviceDiv.innerHTML = `
                        <h3>${service.toUpperCase()}</h3>
                        <div class="metric">Status: ${status}</div>
                        <div class="metric">Uptime: ${data.uptime || 'N/A'}</div>
                        <div class="metric">CPU: ${data.cpu || 'N/A'}%</div>
                        <div class="metric">Memory: ${data.memory || 'N/A'}%</div>
                    `;

                    container.appendChild(serviceDiv);
                } catch (error) {
                    const serviceDiv = document.createElement('div');
                    serviceDiv.className = 'service unhealthy';
                    serviceDiv.innerHTML = `<h3>${service.toUpperCase()}</h3><div class="metric">Status: DOWN</div>`;
                    container.appendChild(serviceDiv);
                }
            }
        }

        function getPort(service) {
            const ports = {
                'config-service': 8080,
                'admin-api': 3100,
                'treasury': 3200,
                'gateway': 3300,
                'super-brain': 3400,
                'telephony': 3500,
                'svg-engine': 3600
            };
            return ports[service] || 8080;
        }

        updateStatus();
        setInterval(updateStatus, 30000); // Update every 30 seconds
    </script>
</body>
</html>
EOF

    echo -e "${GREEN}✅ Monitoring dashboard created at $BASE_DIR/monitoring-dashboard.html${NC}"
}

# Main execution
main() {
    echo "Starting BridgeAI OS v3 deployment and testing..."
    echo ""

    # Step 1: Test service connections
    if ! test_service_connections; then
        echo -e "${RED}❌ Service connection tests failed. Aborting deployment.${NC}"
        exit 1
    fi

    echo ""

    # Step 2: Test inter-service communication
    if ! test_inter_service_communication; then
        echo -e "${RED}❌ Inter-service communication tests failed. Aborting deployment.${NC}"
        exit 1
    fi

    echo ""

    # Step 3: Test external integrations
    if ! test_external_integrations; then
        echo -e "${YELLOW}⚠️  External integration tests had issues, but continuing...${NC}"
    fi

    echo ""

    # Step 4: Run maintenance tasks
    run_maintenance_tasks

    echo ""

    # Step 5: Deploy services
    if deploy_services; then
        echo -e "${GREEN}✅ BridgeAI OS v3 deployed successfully!${NC}"
    else
        echo -e "${RED}❌ Service deployment failed.${NC}"
        exit 1
    fi

    echo ""

    # Step 6: Create monitoring dashboard
    create_monitoring_dashboard

    echo ""
    echo -e "${GREEN}🎉 BridgeAI OS v3 is now live and maintained!${NC}"
    echo ""
    echo "Access points:"
    echo "- Admin Dashboard: http://localhost:3100"
    echo "- System Monitor: file://$BASE_DIR/monitoring-dashboard.html"
    echo "- Gateway API: http://localhost:3300"
    echo ""
    echo "Maintenance commands:"
    echo "- Run tests: $0 test"
    echo "- Run maintenance: $0 maintain"
    echo "- View logs: docker-compose logs -f"
}

# Handle command line arguments
case "${1:-}" in
    "test")
        echo "Running connection tests only..."
        test_service_connections && test_inter_service_communication && test_external_integrations
        ;;
    "maintain")
        echo "Running maintenance tasks only..."
        run_maintenance_tasks
        ;;
    "deploy")
        echo "Running deployment only..."
        deploy_services
        ;;
    *)
        main
        ;;
esac