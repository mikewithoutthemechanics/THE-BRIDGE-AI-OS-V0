#!/bin/bash
# Stabilized System Deployment Script
# Validates all components before starting

set -e

echo "=== Bridge AI OS - Stabilized Deployment ==="
echo ""

# Check prerequisites
echo "[1/6] Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "ERROR: docker-compose not found"; exit 1; }
echo "    Docker: OK"

# Validate file structure
echo "[2/6] Validating file structure..."
required_files=(
  "backend/main.py"
  "backend/requirements.txt"
  "frontend/Dockerfile"
  "frontend/nginx.conf"
  "admin-dashboard.html"
  "public/js/admin-dashboard-stabilized.js"
  "frontend/sw.js"
  "docker-compose.yml"
)

for f in "${required_files[@]}"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: Missing required file: $f"
    exit 1
  fi
done
echo "    Structure: OK"

# Build services
echo "[3/6] Building Docker images..."
docker-compose build --no-cache
echo "    Build: OK"

# Validate Service Worker syntax
echo "[4/6] Validating Service Worker..."
if command -v node >/dev/null 2>&1; then
  node --check frontend/sw.js && echo "    Service Worker: OK" || echo "    WARNING: Service Worker syntax check failed (non-critical)"
else
  echo "    Skipping SW syntax check (node not installed)"
fi

# Start services
echo "[5/6] Starting services..."
docker-compose up -d
echo "    Services started"

# Wait for health
echo "[6/6] Waiting for health checks..."
sleep 5

# Verify edge health
echo ""
echo "=== Verification ==="
echo "Checking edge services..."

services=("control" "business" "treasury")
for svc in "${services[@]}"; do
  status=$(docker-compose ps --services --filter "status=running" | grep -c "$svc" || true)
  if [ "$status" -eq 1 ]; then
    echo "  ✓ $svc: RUNNING"
  else
    echo "  ✗ $svc: NOT RUNNING"
    docker-compose logs "$svc" --tail 20
    exit 1
  fi
done

echo ""
echo "=== Access Points ==="
echo "  Frontend:  http://localhost:8082/admin-dashboard.html"
echo "  Backend:   http://localhost:8080/admin/overview"
echo "  WS:        ws://localhost:8080/ws"
echo "  SSE:       http://localhost:8080/events/stream"
echo ""
echo "=== Stabilized System Ready ==="
echo ""
echo "Key fixes applied:"
echo "  1. Service Worker: throttled to 1 fetch/5s, no navigation intercept"
echo "  2. WebSocket: deterministic heartbeat (3s ping, 5s timeout)"
echo "  3. Treasury: isolated service, no redirects"
echo "  4. Execution channels: fully decoupled"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f backend"
echo "  docker-compose logs -f frontend"