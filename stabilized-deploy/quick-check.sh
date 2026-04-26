#!/bin/bash
# Quick check - verify services are running and responding

echo "Checking stabilized system..."

# Check containers
echo "1. Container status:"
docker-compose ps --services | while read svc; do
  status=$(docker-compose ps -f "name=$svc" --format json | grep -o '"State":"[^"]*"' | cut -d'"' -f4)
  if [ "$status" = "running" ]; then
    echo "   ✓ $svc: RUNNING"
  else
    echo "   ✗ $svc: $status"
  fi
done

# Check ports
echo ""
echo "2. Port checks:"
for port in 8080 8082; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/ | grep -q "^2"; then
    echo "   ✓ Port $port: LISTENING"
  else
    echo "   ✗ Port $port: CLOSED or not HTTP"
  fi
done

echo ""
echo "3. API health:"
curl -s -o /dev/null -w "   Backend HTTP: %{http_code}\n" http://localhost:8080/admin/overview
curl -s -o /dev/null -w "   Frontend HTTP: %{http_code}\n" http://localhost:8082/
curl -s -o /dev/null -w "   Edge health: %{http_code}\n" http://localhost:8080/api/edge-health

echo ""
echo "4. Service Worker file:"
curl -s -o /dev/null -w "   sw.js: %{http_code}\n" http://localhost:8082/sw.js

echo ""
echo "Checks complete. Run 'python verify-stabilized.py' for full validation."