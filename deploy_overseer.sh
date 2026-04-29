#!/usr/bin/env bash
#
# OVERSEER DEPLOYMENT SCRIPT
# Deploys the complete Overseer system with all dependencies
#

set -e

echo "╔══════════════════════════════════════════════╗"
echo "║   OVERSEER — Sovereign Authority Layer       ║"
echo "║   Constitutional Governor Deployment         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OVERSEER_COMPOSE="${SCRIPT_DIR}/docker-compose.overseer.yml"
DEPLOY_DIR="${SCRIPT_DIR}/deploy"
LOG_DIR="${SCRIPT_DIR}/logs"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    # Use docker compose (v2) if available
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    else
        DOCKER_COMPOSE="docker-compose"
    fi

    log_info "Prerequisites check passed"
}

create_directories() {
    log_info "Creating required directories..."

    mkdir -p "${LOG_DIR}"
    mkdir -p /var/lib/bridge 2>/dev/null || true
    mkdir -p /var/log/bridge 2>/dev/null || true

    log_info "Directories created"
}

build_images() {
    log_info "Building Overseer Docker images..."

    ${DOCKER_COMPOSE} -f "${OVERSEER_COMPOSE}" build overseer overseer-events

    if [ $? -eq 0 ]; then
        log_info "Images built successfully"
    else
        log_error "Image build failed"
        exit 1
    fi
}

start_services() {
    log_info "Starting Overseer services..."

    ${DOCKER_COMPOSE} -f "${OVERSEER_COMPOSE}" up -d overseer overseer-events

    if [ $? -eq 0 ]; then
        log_info "Services started"
    else
        log_error "Failed to start services"
        exit 1
    fi
}

wait_for_health() {
    log_info "Waiting for services to become healthy..."

    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        attempt=$((attempt + 1))

        # Check Overseer health
        if curl -sf http://localhost:9091/health > /dev/null 2>&1; then
            log_info "Overseer is healthy"
            break
        fi

        echo -n "."
        sleep 2

        if [ $attempt -eq $max_attempts ]; then
            log_error "Overseer did not become healthy within timeout"
            ${DOCKER_COMPOSE} -f "${OVERSEER_COMPOSE}" logs overseer
            exit 1
        fi
    done

    # Check Event Ingest health
    if curl -sf http://localhost:9092/overseer/status > /dev/null 2>&1; then
        log_info "Event Ingest is healthy"
    else
        log_warn "Event Ingest not healthy yet (may need more time)"
    fi
}

verify_deployment() {
    log_info "Verifying deployment..."

    echo ""
    echo "=== Deployment Summary ==="
    echo ""

    # Show Overseer health
    echo "Overseer Health:"
    curl -s http://localhost:9091/health | head -c 200
    echo ""
    echo ""

    # Show metrics endpoint
    echo "Metrics (first 10 lines):"
    curl -s http://localhost:9091/metrics | head -10
    echo ""

    # Show container status
    echo "Container Status:"
    ${DOCKER_COMPOSE} -f "${OVERSEER_COMPOSE}" ps
    echo ""

    # Show logs tail
    echo "Recent Overseer Logs (last 5 lines):"
    ${DOCKER_COMPOSE} -f "${OVERSEER_COMPOSE}" logs --tail=5 overseer
    echo ""
}

print_access_info() {
    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║       OVERSEER DEPLOYED SUCCESSFULLY         ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║  Access Points:                              ║"
    echo "║    Metrics:  http://localhost:9091/metrics    ║"
    echo "║    Health:   http://localhost:9091/health     ║"
    echo "║    State:    http://localhost:9091/state      ║"
    echo "║    Events:   http://localhost:9092/overseer/  ║"
    echo "║    Status:   http://localhost:9092/overseer/status ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║  Commands:                                   ║"
    echo "║    Logs:  ${DOCKER_COMPOSE} -f docker-compose.overseer.yml logs -f overseer"
    echo "║    Stop:  ${DOCKER_COMPOSE} -f docker-compose.overseer.yml down"
    echo "║    Restart: ${DOCKER_COMPOSE} -f docker-compose.overseer.yml restart overseer"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
}

# ============================================
# MAIN
# ============================================

main() {
    echo ""
    log_info "Starting Overseer deployment..."
    echo ""

    check_prerequisites
    create_directories
    build_images
    start_services
    wait_for_health
    verify_deployment
    print_access_info

    log_info "Deployment complete"
}

# Run main
main "$@"
