#!/bin/bash
# bridge-autosave.sh — hourly local snapshot of /var/www/bridgeai/public
# Install path on VPS: /usr/local/bin/bridge-autosave.sh
# Cron: 0 * * * * /usr/local/bin/bridge-autosave.sh >> /var/log/bridge-autosave.log 2>&1
#
# Safety: local-only. No git. No remote push. Snapshots compress to tar.gz,
# retain last 24, auto-prune older. Survives the uncommitted-emergency-hardening
# problem in /var/www/bridgeai/ because it never touches the parent git tree.

set -euo pipefail

SRC="/var/www/bridgeai/public"
DST_BASE="/root/bridge-backups/public-autosave"
TS="$(date +'%Y-%m-%d_%H-%M-%S')"
STAGE="$DST_BASE/$TS"

mkdir -p "$DST_BASE"

rsync -a --delete "$SRC/" "$STAGE/"

tar -czf "$DST_BASE/$TS.tar.gz" -C "$DST_BASE" "$TS"
rm -rf "$STAGE"

# retain last 24 snapshots (hourly = 24h coverage)
ls -1t "$DST_BASE"/*.tar.gz 2>/dev/null | tail -n +25 | xargs -r rm -f --

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] snapshot $TS.tar.gz retained $(ls -1 "$DST_BASE"/*.tar.gz 2>/dev/null | wc -l)"
