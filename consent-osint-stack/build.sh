#!/bin/bash
# =============================================================================
# ConsentVault OSINT Stack - Build Script (Demo Mode)
# =============================================================================
# This script builds the stack in demonstration mode with synthetic data.
# Live data collection is DISABLED by default.

set -e

echo "=============================================="
echo "  ConsentVault OSINT Stack - Build Script"
echo "=============================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check for required environment
check_env() {
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}Creating default .env file...${NC}"
        create_env
    fi
}

create_env() {
    cat > .env << 'EOF'
# =============================================================================
# ConsentVault Environment Configuration
# =============================================================================
# DEMO_MODE=true: Uses synthetic data only, no external network calls
# NETWORK_MODE=offline: Blocks all external data collection
# Set to production values ONLY after legal review and consent infrastructure

# Operating Mode
DEMO_MODE=true
NETWORK_MODE=offline

# Database Security
CONSENT_DB_PASSWORD=changeme-insecure-use-strong-password

# API Security
JWT_SECRET=changeme-insecure-use-strong-random-secret
DATABUNKER_TOKEN=changeme-insecure-use-strong-token
DATABUNKER_ENCRYPTION_KEY=changeme-insecure-use-strong-key

# OSINT Tools (Demo keys - not used in demo mode)
SHERLOCK_API_KEY=demo-mode-only
SPIDERFOOT_PASSWORD=changeme-insecure

# Monetization
PAYMENT_WEBHOOK_URL=disabled
EOF
    echo -e "${GREEN}Created .env with safe defaults${NC}"
}

# Build consent API
build_consent_api() {
    echo -e "${GREEN}Building Consent API...${NC}"
    cd consent-api
    docker build -t consentvault/consent-api:latest .
    cd ..
}

# Build Databunker API
build_databunker_api() {
    echo -e "${GREEN}Building Databunker API...${NC}"
    cd databunker-api
    docker build -t consentvault/databunker-api:latest .
    cd ..
}

# Build OSINT Orchestrator
build_osint_orchestrator() {
    echo -e "${GREEN}Building OSINT Orchestrator...${NC}"
    cd osint-orchestrator
    docker build -t consentvault/osint-orchestrator:latest .
    cd ..
}

# Build OSINT Tools
build_osint_tools() {
    echo -e "${GREEN}Building OSINT Tools (Demo Mode)...${NC}"
    
    cd osint-tools/sherlock
    docker build -t consentvault/sherlock-demo:latest .
    cd ../..
    
    cd osint-tools/maigret
    docker build -t consentvault/maigret-demo:latest .
    cd ../..
}

# Build Analytics Engine
build_analytics() {
    echo -e "${GREEN}Building Analytics Engine...${NC}"
    cd analytics-engine
    docker build -t consentvault/analytics:latest .
    cd ..
}

# Build Monetization API
build_monetization() {
    echo -e "${GREEN}Building Monetization API...${NC}"
    cd monetization-api
    docker build -t consentvault/monetization:latest .
    cd ..
}

# Build Dashboard
build_dashboard() {
    echo -e "${GREEN}Building Dashboard...${NC}"
    cd dashboard
    docker build -t consentvault/dashboard:latest .
    cd ..
}

# Generate synthetic datasets
generate_synthetic_data() {
    echo -e "${GREEN}Generating synthetic datasets...${NC}"
    mkdir -p synthetic-datasets
    mkdir -p synthetic-datasets/sherlock
    mkdir -p synthetic-datasets/maigret
    mkdir -p synthetic-datasets/spiderfoot
    
    # Generate synthetic OSINT results
    cat > synthetic-datasets/sherlock/synthetic_results.json << 'EOF'
{
  "query": "synthetic_user_demo",
  "found": [],
  "demo_mode": true,
  "message": "Synthetic data only - no real data collected"
}
EOF

    cat > synthetic-datasets/maigret/synthetic_results.json << 'EOF'
{
  "query": "synthetic_user_demo",
  "profiles": [],
  "demo_mode": true,
  "message": "Synthetic data only - no real data collected"
}
EOF
    
    echo -e "${GREEN}Synthetic datasets generated${NC}"
}

# Verify build
verify_build() {
    echo ""
    echo "=============================================="
    echo -e "  ${GREEN}Build Verification${NC}"
    echo "=============================================="
    
    local images=(
        "consentvault/consent-api:latest"
        "consentvault/databunker-api:latest"
        "consentvault/osint-orchestrator:latest"
        "consentvault/sherlock-demo:latest"
        "consentvault/maigret-demo:latest"
        "consentvault/analytics:latest"
        "consentvault/monetization:latest"
        "consentvault/dashboard:latest"
    )
    
    for img in "${images[@]}"; do
        if docker image inspect "$img" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $img"
        else
            echo -e "${RED}✗${NC} $img - NOT BUILT"
        fi
    done
}

# Main build flow
main() {
    check_env
    generate_synthetic_data
    
    echo ""
    echo "=============================================="
    echo "  Building Core Components"
    echo "=============================================="
    build_consent_api
    build_databunker_api
    build_osint_orchestrator
    
    echo ""
    echo "=============================================="
    echo "  Building OSINT Tools (Demo Configuration)"
    echo "=============================================="
    build_osint_tools
    
    echo ""
    echo "=============================================="
    echo "  Building Analytics & Monetization"
    echo "=============================================="
    build_analytics
    build_monetization
    build_dashboard
    
    verify_build
    
    echo ""
    echo "=============================================="
    echo -e "  ${GREEN}Build Complete${NC}"
    echo "=============================================="
    echo ""
    echo "Next steps:"
    echo "  1. Review .env configuration"
    echo "  2. Run: ./run.sh"
    echo "  3. Access dashboard at https://localhost:8443"
    echo ""
    echo -e "${YELLOW}SAFETY CHECK:${NC}"
    echo "  - DEMO_MODE=true (synthetic data only)"
    echo "  - NETWORK_MODE=offline (no external calls)"
    echo "  - All OSINT tools in read-only/demo mode"
    echo ""
}

main "$@"
