#!/bin/bash
# Bridge AI OS — VPS Comparison Tool
# Compares your local GitHub repo with the deployed VPS
# Usage: bash scripts/compare-vps.sh [VPS_IP] [VPS_USER]
#
# This script does NOT modify anything — it's read-only.

set -e

VPS_IP="${1:-102.208.231.53}"
VPS_USER="${2:-root}"
VPS_RUNTIME_DIR="/var/www/bridgeai"
VPS_GIT_DIR="/opt/ai-os"  # used by GitHub Actions
SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=no"

echo "═".repeat(70)
echo "BRIDGE AI OS — VPS COMPARISON"
echo "  Local repo:  $(pwd)"
echo "  VPS:         ${VPS_USER}@${VPS_IP}"
echo "═".repeat(70)
echo ""

# ── Check local git status ─────────────────────────────────────────────────────
echo "=== LOCAL GIT STATUS ==="
if [ -d ".git" ]; then
  LOCAL_BRANCH=$(git branch --show-current)
  LOCAL_COMMIT=$(git rev-parse --short HEAD)
  LOCAL_COMMIT_FULL=$(git rev-parse HEAD)
  echo "  Branch:  $LOCAL_BRANCH"
  echo "  Commit:  $LOCAL_COMMIT"
  echo "  Date:    $(git show -s --format=%ci $LOCAL_COMMIT_FULL)"
  echo ""
  
  # Check if there are uncommitted changes
  if git diff --quiet && git diff --cached --quiet; then
    echo "  ✓ Working tree clean"
  else
    echo "  ⚠ Uncommitted changes:"
    git status -s | head -20
  fi
else
  echo "  ✗ Not a git repository!"
  exit 1
fi

echo ""

# ── Check VPS connectivity ─────────────────────────────────────────────────────
echo "=== VPS CONNECTIVITY ==="
if ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "echo 'SSH OK'" 2>/dev/null; then
  echo "  ✓ SSH connection successful"
else
  echo "  ✗ Cannot connect to VPS via SSH"
  echo "  Check:"
  echo "    - VPS is running (ping $VPS_IP)"
  echo "    - Port 22 open"
  echo "    - Credentials correct"
  exit 1
fi

echo ""

# ── Check VPS git repo (if exists) ─────────────────────────────────────────────
echo "=== VPS GIT REPOSITORY ==="

# Check /opt/ai-os (GitHub Actions location)
if ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "test -d $VPS_GIT_DIR/.git && echo 'EXISTS'"; then
  echo "  Git repo found at $VPS_GIT_DIR"
  VPS_GIT_COMMIT=$(ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "cd $VPS_GIT_DIR && git rev-parse --short HEAD")
  VPS_GIT_BRANCH=$(ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "cd $VPS_GIT_DIR && git branch --show-current")
  echo "    Branch: $VPS_GIT_BRANCH"
  echo "    Commit: $VPS_GIT_COMMIT"
  echo ""
  
  # Compare commits
  if [ "$LOCAL_COMMIT_FULL" = "$(ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "cd $VPS_GIT_DIR && git rev-parse HEAD")" ]; then
    echo "  ✓ Git repo is in sync with local"
  else
    echo "  ✗ Git repo differs from local"
    echo ""
    echo "  Commits on VPS not in local:"
    ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "cd $VPS_GIT_DIR && git log --oneline $LOCAL_COMMIT_FULL..HEAD || echo '  (none — local ahead)'"
    echo ""
    echo "  Commits on local not in VPS:"
    git log --oneline $VPS_GIT_COMMIT..$LOCAL_COMMIT_FULL 2>/dev/null || echo '  (none — VPS ahead)'
  fi
else
  echo "  ⚠ No git repo at $VPS_GIT_DIR (runtime-only deployment)"
fi

echo ""

# ── Check VPS runtime directory ────────────────────────────────────────────────
echo "=== VPS RUNTIME DIRECTORY ($VPS_RUNTIME_DIR) ==="
if ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "test -d $VPS_RUNTIME_DIR && echo 'EXISTS'"; then
  echo "  ✓ Runtime directory exists"
  
  # Get directory listing with sizes
  echo ""
  echo "  Directory structure (top-level):"
  ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "ls -la $VPS_RUNTIME_DIR | head -30"
  
  # Count files
  VPS_FILE_COUNT=$(ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "find $VPS_RUNTIME_DIR -type f \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' \
    -not -name '.env' \
    -not -name '*.db*' \
    -not -path '*/logs/*' \
    | wc -l")
  echo ""
  echo "  Files in VPS runtime (code only): $VPS_FILE_COUNT"
  
  # Compare package.json versions
  echo ""
  echo "  package.json comparison:"
  if ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "test -f $VPS_RUNTIME_DIR/package.json"; then
    VPS_PKG_VERSION=$(ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "cat $VPS_RUNTIME_DIR/package.json | grep '\"version\"' | head -1")
    LOCAL_PKG_VERSION=$(grep '"version"' package.json | head -1)
    echo "    VPS:  $VPS_PKG_VERSION"
    echo "    Local: $LOCAL_PKG_VERSION"
    if [ "$VPS_PKG_VERSION" = "$LOCAL_PKG_VERSION" ]; then
      echo "    ✓ Versions match"
    else
      echo "    ⚠ Versions differ"
    fi
  fi
else
  echo "  ✗ Runtime directory not found at $VPS_RUNTIME_DIR"
fi

echo ""

# ── Detailed file comparison (rsync dry-run) ────────────────────────────────────
echo "=== FILE SYNC DIFF (Local → VPS Runtime) ==="
echo "  (Excludes: node_modules, .git, .env, *.db, logs)"
echo ""

# Create temp file list for rsync output
TMP_DIFF=$(mktemp)

# Run rsync in dry-run mode, capture output
rsync -navz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='*.db' \
  --exclude='*.db-shm' \
  --exclude='*.db-wal' \
  --exclude='logs' \
  ./ "$VPS_USER@$VPS_IP:$VPS_RUNTIME_DIR/" 2>&1 | tee "$TMP_DIFF"

echo ""

# Categorize changes
NEW_FILES=$(grep -c '^>f' "$TMP_DIFF" || echo 0)
UPDATED_FILES=$(grep -c '^>f' "$TMP_DIFF" || echo 0)  # rsync doesn't distinguish new vs updated easily
DELETED_FILES=$(grep -c '^\*deleting' "$TMP_DIFF" || echo 0)

echo "  Summary:"
echo "    Files to add/update: $NEW_FILES"
echo "    Files to delete:     $DELETED_FILES"

rm -f "$TMP_DIFF"

echo ""

# ── PM2 process comparison ─────────────────────────────────────────────────────
echo "=== PM2 PROCESSES (VPS) ==="
echo "  (shows what's actually running)"
echo ""

ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "pm2 list --no-color 2>/dev/null || echo 'PM2 not installed or no processes'" | head -30

echo ""

# ── Service health check ───────────────────────────────────────────────────────
echo "=== SERVICE HEALTH (VPS) ==="
echo ""

# Test key endpoints
ENDPOINTS=(
  "http://localhost:3000/health"
  "http://localhost:8000/api/health"
  "http://localhost:8080/health"
  "http://localhost:7070/health"
)

for ep in "${ENDPOINTS[@]}"; do
  CODE=$(ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "curl -s -o /dev/null -w '%{http_code}' $ep" 2>/dev/null || echo "000")
  if [ "$CODE" -ge 200 ] && [ "$CODE" -lt 400 ]; then
    echo "  ✓ $ep → $CODE"
  else
    echo "  ✗ $ep → $CODE"
  fi
done

echo ""

# ── Disk usage comparison ──────────────────────────────────────────────────────
echo "=== DISK USAGE (VPS) ==="
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "df -h $VPS_RUNTIME_DIR 2>/dev/null || df -h /"
echo ""

# ── Recent logs (last 20 lines) ────────────────────────────────────────────────
echo "=== RECENT PM2 LOGS (VPS, last 50 lines) ==="
echo "  (showing errors/warnings only)"
echo ""
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "pm2 logs --lines 50 2>/dev/null | tail -50" | grep -i 'error\|warn\|fatal\|uncought' | tail -20 || echo "  No errors found in recent logs"

echo ""

# ── Summary & recommendations ─────────────────────────────────────────────────
echo "═".repeat(70)
echo "SUMMARY & NEXT STEPS"
echo "═".repeat(70)
echo ""

if [ "$DELETED_FILES" -gt 0 ] || [ "$NEW_FILES" -gt 0 ]; then
  echo "⚠  File changes detected:"
  echo "   - Run deploy to sync: bash deploy-vps.sh $VPS_IP $VPS_USER"
  echo "   - Or manual sync: rsync -avz --delete ./ ${VPS_USER}@${VPS_IP}:${VPS_RUNTIME_DIR}/"
  echo ""
fi

if ! ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "pm2 list --no-color 2>/dev/null | grep -q 'online'"; then
  echo "⚠  Services not running or unhealthy:"
  echo "   - SSH to VPS and run: pm2 status"
  echo "   - Restart: pm2 restart all"
  echo "   - View logs: pm2 logs"
  echo ""
fi

echo "To deploy changes:"
echo "  1. bash deploy-vps.sh $VPS_IP $VPS_USER"
echo ""
echo "To SSH directly:"
echo "  ssh $VPS_USER@$VPS_IP"
echo ""
echo "To view live logs:"
echo "  ssh $VPS_USER@$VPS_IP 'pm2 logs --lines 100'"
echo ""
