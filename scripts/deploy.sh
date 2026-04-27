#!/bin/bash
# Bridge AI OS — Production Deploy + Rollback Script
# Usage:
#   bash deploy.sh              # full deploy
#   bash deploy.sh rollback     # rollback to last snapshot
#   bash deploy.sh health       # health check only
#   bash deploy.sh status       # service status

set -e
cd /var/www/bridgeai

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/var/www/bridgeai-snapshots"
LOG="/var/log/bridge-deploy.log"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

log() { echo -e "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"; }
ok()  { log "${GREEN}✓ $1${NC}"; }
warn(){ log "${YELLOW}⚠ $1${NC}"; }
fail(){ log "${RED}✗ $1${NC}"; exit 1; }

# ── Health check ────────────────────────────────────────────────────────────
health_check() {
  local failures=0
  log "Running health checks..."

  local services=("8080:/health" "5001:/health" "8000:/health")
  for svc in "${services[@]}"; do
    local port="${svc%%:*}"
    local path="${svc##*:}"
    local code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${port}${path}" 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then
      ok "Port ${port} → ${code}"
    else
      warn "Port ${port} → ${code} (non-200)"
      ((failures++)) || true
    fi
  done

  # Critical endpoints
  local endpoints=("/api/tiers" "/api/lifecycle/status")
  for ep in "${endpoints[@]}"; do
    local code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:8080${ep}" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^(200|401|403)$ ]]; then
      ok "Endpoint ${ep} → ${code}"
    else
      warn "Endpoint ${ep} → ${code}"
      ((failures++)) || true
    fi
  done

  # PM2 processes
  local offline=$(pm2 list --no-color 2>/dev/null | grep -c "stopped\|errored" || true)
  if [[ "$offline" -gt 0 ]]; then
    warn "$offline PM2 process(es) not running"
    ((failures++)) || true
  else
    ok "All PM2 processes online"
  fi

  if [[ "$failures" -eq 0 ]]; then
    ok "All health checks passed"
    return 0
  else
    warn "$failures health check(s) failed"
    return 1
  fi
}

# ── Status ─────────────────────────────────────────────────────────────────
if [[ "$1" == "status" ]]; then
  pm2 list
  exit 0
fi

# ── Health only ────────────────────────────────────────────────────────────
if [[ "$1" == "health" ]]; then
  health_check
  exit $?
fi

# ── Rollback ────────────────────────────────────────────────────────────────
if [[ "$1" == "rollback" ]]; then
  log "Starting rollback..."
  LATEST=$(ls -t "$BACKUP_DIR"/snapshot-*.tar.gz 2>/dev/null | head -1)
  if [[ -z "$LATEST" ]]; then
    fail "No snapshots found in $BACKUP_DIR"
  fi
  log "Rolling back to: $LATEST"
  tar -xzf "$LATEST" -C /var/www/bridgeai --strip-components=1
  pm2 restart all --update-env
  sleep 4
  if health_check; then
    ok "Rollback complete — system healthy"
  else
    fail "Rollback complete but health checks failed — investigate logs"
  fi
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════
# FULL DEPLOY
# ═══════════════════════════════════════════════════════════════════════════

log "━━━ Bridge AI OS Deploy — $TIMESTAMP ━━━"

# Step 1: Pre-deploy snapshot
log "Step 1/7: Creating pre-deploy snapshot..."
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/snapshot-${TIMESTAMP}.tar.gz" \
  --exclude='node_modules' --exclude='logs' --exclude='.git' \
  --exclude='*.db' --exclude='*.db-wal' --exclude='*.db-shm' \
  -C /var/www bridgeai 2>/dev/null || warn "Snapshot creation had warnings (non-fatal)"
ok "Snapshot saved: snapshot-${TIMESTAMP}.tar.gz"

# Keep only last 5 snapshots
ls -t "$BACKUP_DIR"/snapshot-*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
ok "Old snapshots pruned (keeping last 5)"

# Step 2: Syntax checks
log "Step 2/7: Syntax validation..."
node --check gateway.js   || fail "gateway.js has syntax errors"
node --check auth.js      || fail "auth.js has syntax errors"
node --check server.js    || fail "server.js has syntax errors"
node --check brain.js     || fail "brain.js has syntax errors"
ok "All JS files pass syntax check"

# Step 3: Dependency check
log "Step 3/7: Dependency check..."
if ! node -e "require('./lib/supabase'); require('./lib/user-identity'); require('./middleware/auth')" 2>/dev/null; then
  warn "Module load check had warnings (non-fatal)"
else
  ok "Core modules load correctly"
fi

# Step 4: Rolling restart (zero-downtime via PM2 cluster)
log "Step 4/7: Rolling restart..."
pm2 reload bridge-gateway --update-env 2>/dev/null || pm2 restart bridge-gateway --update-env
sleep 3
pm2 reload unified-server --update-env 2>/dev/null || pm2 restart unified-server --update-env
sleep 2
pm2 reload auth-service   --update-env 2>/dev/null || pm2 restart auth-service --update-env
sleep 2
ok "Services reloaded"

# Step 5: Health checks
log "Step 5/7: Post-deploy health checks..."
sleep 3
if ! health_check; then
  warn "Health checks failed — initiating automatic rollback..."
  LATEST=$(ls -t "$BACKUP_DIR"/snapshot-*.tar.gz 2>/dev/null | head -1)
  if [[ -n "$LATEST" ]]; then
    tar -xzf "$LATEST" -C /var/www/bridgeai --strip-components=1 2>/dev/null
    pm2 restart all --update-env
    sleep 5
    fail "Deploy failed — rolled back to $LATEST. Check $LOG for details."
  else
    fail "Deploy failed and no rollback snapshot available."
  fi
fi

# Step 6: Save PM2 state
log "Step 6/7: Saving PM2 state..."
pm2 save --force 2>/dev/null
ok "PM2 state saved"

# Step 7: Rate limiting update (nginx)
log "Step 7/7: Nginx config check..."
nginx -t 2>/dev/null && ok "Nginx config valid" || warn "Nginx config has issues (not reloading)"

# Write deploy record
echo "$TIMESTAMP OK" >> "$LOG"
log "━━━ Deploy complete — $TIMESTAMP ━━━"
ok "System is live and healthy"
