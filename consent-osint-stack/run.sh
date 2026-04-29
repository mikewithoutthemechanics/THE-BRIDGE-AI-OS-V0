#!/bin/bash
# =============================================================================
# ConsentVault OSINT Stack - Run Script
# =============================================================================
# Orchestrates the stack with privacy safeguards enabled.
# Demo mode is default - no live data collection.

set -e

echo "=============================================="
echo "  ConsentVault OSINT Stack - Runtime"
echo "=============================================="

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load environment
load_env() {
    if [ -f ".env" ]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
    
    # Force safe defaults if not set
    DEMO_MODE=${DEMO_MODE:-true}
    NETWORK_MODE=${NETWORK_MODE:-offline}
}

# Safety checks before startup
safety_check() {
    echo ""
    echo "=============================================="
    echo -e "  ${YELLOW}SAFETY VERIFICATION${NC}"
    echo "=============================================="
    echo ""
    
    # Check demo mode
    if [ "$DEMO_MODE" = "true" ]; then
        echo -e "${GREEN}✓${NC} DEMO_MODE enabled - Using synthetic data only"
    else
        echo -e "${YELLOW}⚠${NC} DEMO_MODE disabled - LIVE DATA COLLECTION MODE"
        echo "  This requires:"
        echo "    - Verified explicit consent for all data subjects"
        echo "    - Legal review completed"
        echo "    - GDPR/CCPA compliance verified"
    fi
    
    # Check network mode
    if [ "$NETWORK_MODE" = "offline" ]; then
        echo -e "${GREEN}✓${NC} NETWORK_MODE=offline - No external network calls"
    else
        echo -e "${YELLOW}⚠${NC} NETWORK_MODE=online - External calls allowed"
        echo "  Requires consent verification before enabling"
    fi
    
    echo ""
    
    # Warning banner
    if [ "$DEMO_MODE" != "true" ]; then
        echo -e "${RED}=============================================="
        echo "  WARNING: LIVE DATA COLLECTION MODE"
        echo -e "==============================================${NC}"
        echo -e "${RED}This configuration requires:${NC}"
        echo "  1. Explicit informed consent from all data subjects"
        echo "  2. Legal compliance review (GDPR/CCPA)"
        echo "  3. Data Processing Agreement in place"
        echo "  4. Consent ledger populated before any collection"
        echo ""
        read -p "Type 'CONSENT' to continue with live mode: " confirm
        if [ "$confirm" != "CONSENT" ]; then
            echo "Aborting - returning to demo mode"
            DEMO_MODE=true
            NETWORK_MODE=offline
        fi
    fi
}

# Pre-flight checks
preflight() {
    echo -e "${GREEN}Running pre-flight checks...${NC}"
    
    # Check Docker is running
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}Error: Docker is not running${NC}"
        exit 1
    fi
    
    # Check required ports
    local ports=(8443 3000)
    for port in "${ports[@]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo -e "${YELLOW}Warning: Port $port may be in use${NC}"
        fi
    done
    
    echo -e "${GREEN}Pre-flight complete${NC}"
}

# Start the stack
start_stack() {
    echo ""
    echo "=============================================="
    echo "  Starting ConsentVault Stack"
    echo "=============================================="
    
    docker-compose up -d
    
    echo ""
    echo "=============================================="
    echo -e "  ${GREEN}Stack Started${NC}"
    echo "=============================================="
    echo ""
    echo "Services:"
    echo "  - Dashboard:        https://localhost:8443"
    echo "  - Consent API:      http://localhost:8080"
    echo "  - Analytics:        http://localhost:8081"
    echo "  - Monetization:     http://localhost:8082"
    echo "  - SpiderFoot UI:    http://localhost:5001"
    echo ""
    echo "Current Configuration:"
    echo "  - DEMO_MODE:       $DEMO_MODE"
    echo "  - NETWORK_MODE:    $NETWORK_MODE"
    echo ""
}

# Health check
health_check() {
    echo "Running health checks..."
    
    local services=(
        "consentvault-consent-ledger"
        "consentvault-databunker"
        "consentvault-consent-api"
        "consentvault-dashboard"
    )
    
    for svc in "${services[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${svc}$"; then
            local status=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "none")
            if [ "$status" = "healthy" ] || [ "$status" = "none" ]; then
                echo -e "${GREEN}✓${NC} $svc"
            else
                echo -e "${YELLOW}⚠${NC} $svc (status: $status)"
            fi
        else
            echo -e "${RED}✗${NC} $svc not running"
        fi
    done
}

# Show logs
show_logs() {
    echo ""
    echo "=============================================="
    echo "  Recent Logs (last 50 lines)"
    echo "=============================================="
    docker-compose logs --tail=50
}

# Stop the stack
stop_stack() {
    echo "Stopping ConsentVault Stack..."
    docker-compose down
}

# Main menu
main() {
    load_env
    
    case "${1:-start}" in
        start)
            safety_check
            preflight
            start_stack
            health_check
            ;;
        stop)
            stop_stack
            ;;
        restart)
            stop_stack
            sleep 2
            safety_check
            start_stack
            health_check
            ;;
        logs)
            show_logs
            ;;
        health)
            health_check
            ;;
        *)
            echo "Usage: $0 {start|stop|restart|logs|health}"
            exit 1
            ;;
    esac
}

main "$@"
