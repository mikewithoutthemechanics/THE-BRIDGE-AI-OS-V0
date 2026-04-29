#!/usr/bin/env bash
# diagnose-admin-api.sh — SSH to the VPS and verify PM2 / admin-api context alignment.
#
# Usage:
#   bash scripts/diagnose-admin-api.sh              # default host root@102.208.228.44
#   bash scripts/diagnose-admin-api.sh user@host
#
# What it does:
#   1. Checks pm2 daemon is up (pm2 ping)
#   2. Lists pm2 processes (pm2 jlist)
#   3. Hits local admin-api /admin/overview
#   4. Hits public go.ai-os.co.za/admin/overview
#   5. Checks which user runs admin-api (pm2 env admin-api)
#   6. Reports PM2_HOME for each context so mismatches are visible
#
# Exits non-zero if any critical check fails.

set -uo pipefail

TARGET="${1:-root@102.208.228.44}"
PORT_ADMIN="${ADMIN_PORT:-4011}"

echo "=== diagnose-admin-api on ${TARGET} ==="
echo ""

run() {
  local label="$1"; shift
  echo "--- ${label}"
  ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$TARGET" "$@" 2>&1 || echo "(exit $?)"
  echo ""
}

run "pm2 ping (as logged-in user)" 'pm2 ping'
run "pm2 list (as logged-in user)" 'pm2 list --no-color'
run "pm2 jlist count (as logged-in user)" 'pm2 jlist 2>/dev/null | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{try{console.log(JSON.parse(s).length,\"processes\")}catch(e){console.log(\"parse failed:\",e.message)}})"'
run "admin-api process info" 'pm2 env admin-api 2>/dev/null | grep -E "^(USER|HOME|PM2_HOME|PATH)=" || echo "admin-api not registered"'
run "PM2_HOME for current shell" 'echo "PM2_HOME=${PM2_HOME:-(unset)} HOME=$HOME USER=$USER"'
run "admin-api systemd/pm2 owner" 'ps -eo user,pid,command | grep -E "admin-api|pm2 God" | grep -v grep'
run "local /admin/overview (loopback)" "curl -sS --max-time 5 http://127.0.0.1:${PORT_ADMIN}/admin/overview | head -c 800; echo"
run "public /admin/overview (via nginx)" 'curl -sS --max-time 5 https://go.ai-os.co.za/admin/overview | head -c 800; echo'
run "nginx error log tail (last 20 lines)" 'tail -n 20 /var/log/nginx/error.log 2>/dev/null || echo "no nginx error log readable"'
run "admin-api pm2 log tail" 'pm2 logs admin-api --nostream --lines 30 --no-color 2>/dev/null || echo "no logs"'

echo "=== diagnosis complete ==="
echo ""
echo "Read the output for these markers:"
echo "  * 'pm2 jlist count: 0 processes' + 'admin-api not registered' → PM2 never had processes"
echo "  * USER/PM2_HOME differ between 'admin-api process info' and 'PM2_HOME for current shell' → CONTEXT MISMATCH"
echo "  * local /admin/overview returns {services:[]} but pm2 list shows processes → admin-api runs under wrong user"
echo "  * local returns services, public returns empty → nginx proxy misconfigured"
echo "  * pm2_error field present in /admin/overview response → see its stderr for root cause"
