#!/bin/bash
# BridgeAI Configuration Verification Script
# Run this after applying the PM2 configuration

echo "=== BridgeAI Configuration Verification ==="
echo

# Check if orchestra-core is running
echo "1. Process Status:"
pm2 status orchestra-core
echo

# Check recent logs for configuration messages
echo "2. Recent Logs:"
pm2 logs orchestra-core --lines 10
echo

# Check environment variables in the process
echo "3. Environment Variables Check:"
if pgrep -f "orchestra-core" > /dev/null; then
    echo "Process environment variables:"
    cat /proc/$(pgrep -f 'orchestra-core')/environ | tr '\0' '\n' | grep -E "SUPABASE|SMTP|NOTION" | head -10

    # Check for placeholder values
    PLACEHOLDER_COUNT=$(cat /proc/$(pgrep -f 'orchestra-core')/environ | tr '\0' '\n' | grep -c "PLACEHOLDER\|your-.*-here\|KEEP_EXISTING")

    if [ $PLACEHOLDER_COUNT -gt 0 ]; then
        echo
        echo "⚠️  WARNING: Found $PLACEHOLDER_COUNT placeholder values in environment"
        echo "   Replace with real credentials for full functionality"
    else
        echo
        echo "✅ No placeholder values detected - configuration looks complete"
    fi
else
    echo "❌ orchestra-core process not found"
fi

echo
echo "4. API Health Check:"
curl -s http://localhost:7777/healthz || echo "Health check failed"

echo
echo "=== Verification Complete ==="