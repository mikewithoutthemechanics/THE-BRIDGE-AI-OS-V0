#!/bin/bash
# Comprehensive Service Crash Analysis Script
# Run this on your VPS to diagnose potential service crashes

echo "=== BRIDGE AI OS - Service Crash Analysis ==="
echo "Timestamp: $(date)"
echo "Server: $(hostname)"
echo

# 1. Check if required files exist
echo "1. FILE DEPENDENCY CHECK:"
echo "Checking critical files..."

files=(
    "orchestra-server.js"
    "ecosystem.config.js"
    "orchestra.html"
    "lib/session.js"
    "routes/settings.js"
    "services/config-advisor.js"
)

missing_files=()
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file MISSING"
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
    echo "🚨 CRITICAL: Missing files that will cause startup failure!"
    exit 1
fi

echo

# 2. Check Node.js and PM2 installation
echo "2. RUNTIME ENVIRONMENT CHECK:"
if command -v node &> /dev/null; then
    echo "✅ Node.js installed: $(node --version)"
else
    echo "❌ Node.js NOT installed - will cause startup failure"
fi

if command -v pm2 &> /dev/null; then
    echo "✅ PM2 installed: $(pm2 --version)"
else
    echo "❌ PM2 NOT installed - will prevent service management"
fi

echo

# 3. Check environment variables
echo "3. ENVIRONMENT VARIABLES CHECK:"
echo "Critical environment variables:"

env_vars=(
    "PORT"
    "ORCHESTRA_ADMIN_TOKEN"
    "ADVISOR_SHARED_SECRET"
    "ADVISOR_PORT"
)

for var in "${env_vars[@]}"; do
    if [ -n "${!var:-}" ]; then
        echo "✅ $var is set"
    else
        echo "⚠️  $var is NOT set (may cause issues)"
    fi
done

echo

# 4. Check PM2 process status
echo "4. PM2 PROCESS STATUS:"
if command -v pm2 &> /dev/null; then
    pm2 jlist 2>/dev/null | jq -r '.[] | "📊 \(.name): \(.pm2_env.status) (\(.pm2_env.restart_time // 0) restarts)"' 2>/dev/null || echo "❌ PM2 not responding or no processes"
else
    echo "❌ PM2 not available"
fi

echo

# 5. Check recent error logs
echo "5. RECENT ERROR LOGS:"
echo "Last 10 error lines from orchestra-core:"
pm2 logs orchestra-core --err --lines 10 2>/dev/null | head -15 || echo "No orchestra-core logs available"

echo
echo "Last 10 error lines from config-advisor:"
pm2 logs config-advisor --err --lines 10 2>/dev/null | head -15 || echo "No config-advisor logs available"

echo

# 6. Health check
echo "6. HEALTH CHECK:"
health_response=$(curl -s --max-time 5 http://localhost:7777/healthz 2>/dev/null)
if [ $? -eq 0 ] && [ -n "$health_response" ]; then
    status=$(echo "$health_response" | jq -r '.status // "unknown"' 2>/dev/null)
    uptime=$(echo "$health_response" | jq -r '.uptime_s // 0' 2>/dev/null)
    echo "✅ Health check: $status (uptime: ${uptime}s)"

    # Check if HTML file exists (required for health check)
    html_present=$(echo "$health_response" | jq -r '.html_present // false' 2>/dev/null)
    if [ "$html_present" = "true" ]; then
        echo "✅ orchestra.html file present"
    else
        echo "❌ orchestra.html file MISSING - health check fails"
    fi
else
    echo "❌ Health check FAILED - service unreachable"
fi

echo

# 7. Port availability
echo "7. PORT AVAILABILITY:"
echo "Checking if services are listening on expected ports..."

# Check if ports are in use
if command -v netstat &> /dev/null; then
    orchestra_port=$(netstat -tlnp 2>/dev/null | grep ":7777 " | wc -l)
    advisor_port=$(netstat -tlnp 2>/dev/null | grep ":4721 " | wc -l)
elif command -v ss &> /dev/null; then
    orchestra_port=$(ss -tlnp 2>/dev/null | grep ":7777 " | wc -l)
    advisor_port=$(ss -tlnp 2>/dev/null | grep ":4721 " | wc -l)
else
    orchestra_port=0
    advisor_port=0
fi

if [ "$orchestra_port" -gt 0 ]; then
    echo "✅ Port 7777 (orchestra-core) is listening"
else
    echo "❌ Port 7777 (orchestra-core) NOT listening"
fi

if [ "$advisor_port" -gt 0 ]; then
    echo "✅ Port 4721 (config-advisor) is listening"
else
    echo "❌ Port 4721 (config-advisor) NOT listening"
fi

echo

# 8. System resources
echo "8. SYSTEM RESOURCE CHECK:"
if command -v free &> /dev/null; then
    echo "Memory usage:"
    free -h | head -2
fi

if command -v df &> /dev/null; then
    echo "Disk usage:"
    df -h / | tail -1
fi

echo

# 9. Process analysis
echo "9. PROCESS ANALYSIS:"
echo "Node.js processes running:"
ps aux --no-headers -o pid,ppid,cmd,%mem,%cpu,etime | grep -E "(node|pm2)" | head -10 || echo "No Node.js/PM2 processes found"

echo

# 10. Crash analysis summary
echo "10. CRASH ANALYSIS SUMMARY:"
echo "Potential crash causes checked:"

issues_found=0

# Check for missing files
if [ ${#missing_files[@]} -gt 0 ]; then
    echo "❌ Missing critical files"
    issues_found=$((issues_found + 1))
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not installed"
    issues_found=$((issues_found + 1))
fi

# Check PM2
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 not installed"
    issues_found=$((issues_found + 1))
fi

# Check if services are running
running_services=$(pm2 jlist 2>/dev/null | jq '.[] | select(.pm2_env.status == "online") | .name' 2>/dev/null | wc -l)
if [ "$running_services" -lt 2 ]; then
    echo "❌ Not all services are online"
    issues_found=$((issues_found + 1))
fi

# Check health status
if [ "$status" != "ok" ]; then
    echo "❌ Health check not passing"
    issues_found=$((issues_found + 1))
fi

if [ $issues_found -eq 0 ]; then
    echo "✅ No obvious crash causes detected"
    echo "💡 If services are still crashing, check application logs for runtime errors"
else
    echo "🚨 Found $issues_found potential issues - review above for details"
fi

echo
echo "=== Analysis Complete ==="
echo "If services are crashing despite this check passing,"
echo "check application logs and consider memory/CPU limits."