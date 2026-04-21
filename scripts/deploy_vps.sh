#!/usr/bin/env bash
# One-shot VPS deploy helper for the Orchestra Layer 1+2 stack.
# REQUIRES explicit confirmation. Never runs without CONFIRM=yes.
#
# Usage:
#   VPS_HOST=bridge-ai-os.com VPS_USER=root VPS_PATH=/opt/aoe-unified CONFIRM=yes \
#     scripts/deploy_vps.sh
#
# Cross-platform: falls back to `git archive | ssh tar -x` when rsync is
# unavailable (e.g. Windows git-bash). Set FORCE_GIT_ARCHIVE=1 to skip
# the rsync attempt even when it's installed.
#
# What it does:
#   1. sync project root (minus node_modules, .git, logs/*, bak files) to $VPS_USER@$VPS_HOST:$VPS_PATH
#   2. ssh in and run: npm i --production (if package.json) + pm2 reload ecosystem.config.js
#   3. curl /healthz on the VPS to confirm Layer 1 binary signal
#
# Does NOT enable any cron -- Phase 2A scheduling stays a manual decision.

set -euo pipefail

[ "${CONFIRM:-}" = "yes" ] || {
  echo "refusing: set CONFIRM=yes to deploy to shared VPS"
  echo "dry-run view:"
  echo "  host=${VPS_HOST:-UNSET} user=${VPS_USER:-UNSET} path=${VPS_PATH:-UNSET}"
  exit 2
}
: "${VPS_HOST:?set VPS_HOST}"
: "${VPS_USER:?set VPS_USER}"
: "${VPS_PATH:?set VPS_PATH}"

REMOTE="$VPS_USER@$VPS_HOST"
SYNC_METHOD=""

if [ "${FORCE_GIT_ARCHIVE:-0}" != "1" ] && command -v rsync >/dev/null 2>&1; then
  SYNC_METHOD="rsync"
  echo "[deploy] rsync -> $REMOTE:$VPS_PATH"
  rsync -az --delete \
    --exclude node_modules --exclude .git --exclude 'logs/*' \
    --exclude '*.bak' --exclude '*.original-*' \
    ./ "$REMOTE:$VPS_PATH/"
else
  SYNC_METHOD="git-archive"
  echo "[deploy] rsync unavailable -> git archive | ssh tar -x"
  # Ensure remote path exists and is empty of previous deploy artefacts we track
  ssh "$REMOTE" "mkdir -p '$VPS_PATH'"
  # git archive includes tracked files only, so node_modules and .git naturally excluded.
  # Include uncommitted-but-tracked edits via HEAD + working tree overlay (tar).
  git archive --format=tar HEAD | ssh "$REMOTE" "tar -x -C '$VPS_PATH'"
  # Overlay untracked (but not gitignored) files too, so local uncommitted work ships.
  # Uses git ls-files to enumerate, excludes the usual suspects.
  mapfile -t UNTRACKED < <(git ls-files --others --exclude-standard \
    | grep -v -E '^(node_modules/|\.git/|logs/.*|.*\.bak|.*\.original-)' || true)
  if [ "${#UNTRACKED[@]}" -gt 0 ]; then
    echo "[deploy] overlay ${#UNTRACKED[@]} untracked-but-tracked files"
    tar -cf - "${UNTRACKED[@]}" | ssh "$REMOTE" "tar -x -C '$VPS_PATH'"
  fi
fi

echo "[deploy] sync method: $SYNC_METHOD"
echo "[deploy] remote: pm2 reload + healthz"
ssh "$REMOTE" bash -s <<REMOTE_SH
  set -e
  export PM2_HOME=/root/.pm2
  cd "$VPS_PATH"
  [ -f package.json ] && npm i --production --no-audit --no-fund || true
  pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
  pm2 reload ecosystem.admin-api.config.js --update-env || pm2 start ecosystem.admin-api.config.js
  pm2 save
  sleep 2
  CODE=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7777/healthz)
  echo "[deploy] remote /healthz = \$CODE"
  [ "\$CODE" = "200" ] || { echo "[deploy] FAIL"; exit 1; }
REMOTE_SH

echo "[deploy] OK"
