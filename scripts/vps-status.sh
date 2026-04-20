#!/bin/bash
# Quick VPS Status Check — One-liner to see what's deployed
# Usage: bash scripts/vps-status.sh [VPS_IP] [VPS_USER]

VPS_IP="${1:-102.208.231.53}"
VPS_USER="${2:-root}"
SSH_OPTS="-o ConnectTimeout=5 -o StrictHostKeyChecking=no"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       BRIDGE AI OS — VPS QUICK STATUS CHECK             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 1. Git commit comparison
echo "📦 Git Commit:"
LOCAL_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "Not a git repo")
echo "   Local:  $LOCAL_COMMIT"

if ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "test -d /opt/ai-os/.git && cd /opt/ai-os && git rev-parse --short HEAD" 2>/dev/null; then
  VPS_COMMIT=$(ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "cd /opt/ai-os && git rev-parse --short HEAD")
  echo "   VPS:    $VPS_COMMIT"
  if [ "$LOCAL_COMMIT" = "$VPS_COMMIT" ]; then
    echo "   Status: ✅ In sync"
  else
    echo "   Status: ❌ Out of sync (local ahead)"
  fi
else
  echo "   VPS:    (no git repo at /opt/ai-os)"
fi

echo ""

# 2. PM2 processes
echo "🚀 PM2 Processes:"
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "pm2 list --no-color 2>/dev/null | grep -E 'bridge|unified|brain|auth|terminal|system|ban|svg' | awk '{printf \"   %-20s %s\\n\", \$1, \$5}'" || echo "   ⚠ PM2 not accessible"
echo ""

# 3. Port listening
echo "🔌 Ports Listening:"
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "ss -tlnp 2>/dev/null | grep -E ':3000|:8000|:8080|:5001|:5002|:3001|:7070|:8001' | awk '{printf \"   %-10s → %-20s\\n\", \$5, \$6}'" || echo "   Cannot check ports"
echo ""

# 4. Health endpoints
echo "🏥 Health Checks:"
for port in 3000 8000 8080 5001 5002 3001 7070; do
  CODE=$(ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "curl -s -o /dev/null -w '%{http_code}' http://localhost:$port/health 2>/dev/null || echo '000'")
  if [ "$CODE" -ge 200 ] && [ "$CODE" -lt 400 ]; then
    echo "   ✓ Port $port → $CODE"
  else
    echo "   ✗ Port $port → $CODE"
  fi
done

echo ""

# 5. Disk & memory
echo "💾 Resources:"
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "free -h 2>/dev/null | awk '/^Mem:/ {printf \"   Memory: %s used / %s total\\n\", \$3, \$2}'"
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "df -h $VPS_RUNTIME_DIR 2>/dev/null | awk 'NR==2 {printf \"   Disk:   %s used / %s total\\n\", \$3, \$2}'"
echo ""

# 6. Recent errors
echo "❗ Recent Errors (last 20 from PM2 logs):"
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "pm2 logs --lines 30 2>/dev/null | grep -i 'error\\|fatal\\|uncaught' | tail -20" || echo "   No errors found"
echo ""

# 7. Quick actions
echo "═".repeat(60)
echo "Quick Commands:"
echo "  Full compare:   bash scripts/compare-vps.sh $VPS_IP $VPS_USER"
echo "  SSH to VPS:     ssh $VPS_USER@$VPS_IP"
echo "  View all logs:  ssh $VPS_USER@$VPS_IP 'pm2 logs'"
echo "  Restart all:    ssh $VPS_USER@$VPS_IP 'pm2 restart all'"
echo "  Deploy fresh:   bash deploy-vps.sh $VPS_IP $VPS_USER"
echo ""
