#!/bin/bash
# Quick Service Status Check
# Run this frequently to monitor service health

echo "=== QUICK SERVICE STATUS ==="
echo "$(date)"
echo

# PM2 Status
echo "PM2 Processes:"
pm2 jlist 2>/dev/null | jq -r '.[] | "\(.name): \(.pm2_env.status) (\(.pm2_env.restart_time // 0) restarts)"' 2>/dev/null || echo "PM2 unavailable"

echo

# Health Check
echo "Health Status:"
health=$(curl -s --max-time 3 http://localhost:7777/healthz 2>/dev/null)
if [ $? -eq 0 ]; then
    status=$(echo "$health" | jq -r '.status' 2>/dev/null)
    uptime=$(echo "$health" | jq -r '.uptime_s' 2>/dev/null)
    echo "✅ Service: $status (${uptime}s uptime)"
else
    echo "❌ Service: UNREACHABLE"
fi

echo

# Recent Errors
echo "Recent Errors (last 3 lines):"
pm2 logs --err --lines 3 2>/dev/null | tail -6 || echo "No recent errors"

echo

# System Load
echo "System Load:"
uptime | awk '{print "Load:", $NF}' 2>/dev/null || echo "Load info unavailable"

echo "=== END STATUS ==="