#!/bin/bash
# BridgeAI OS v3 - Quick Connection Test
# Tests basic connectivity without full timeouts

echo "🔗 BridgeAI OS v3 - Quick Connection Test"
echo "========================================="

SERVICES=("config-service:8080" "admin-api:3100" "treasury:3200" "gateway:3300" "super-brain:3400" "telephony:3500" "svg-engine:3600")

for service in "${SERVICES[@]}"; do
    name=$(echo $service | cut -d: -f1)
    port=$(echo $service | cut -d: -f2)

    echo -n "Testing $name ($port): "
    if nc -z localhost $port 2>/dev/null; then
        echo "✅ PORT OPEN"
    else
        echo "❌ PORT CLOSED"
    fi
done

echo ""
echo "📊 Infrastructure Services:"
echo -n "PostgreSQL (5432): "
if nc -z localhost 5432 2>/dev/null; then echo "✅ RUNNING"; else echo "❌ NOT RUNNING"; fi

echo -n "Redis (6379): "
if nc -z localhost 6379 2>/dev/null; then echo "✅ RUNNING"; else echo "❌ NOT RUNNING"; fi

echo ""
echo "🎯 Test Results:"
echo "- Services that should be running: Check docker-compose.v3.yml"
echo "- Use './bridge-ai-deploy.sh' for full deployment"
echo "- Use './bridge-ai-deploy.sh maintain' for maintenance tasks"