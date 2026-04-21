#!/usr/bin/env bash
# env-vps-merge.sh — safely merge a LOCAL .env into the live VPS .env
#
# PURPOSE
#   You have a local .env with new/updated values that should land on the VPS
#   without overwriting unrelated keys that are already there (Paystack/PayPal/
#   Supabase/etc). This script diffs + merges + backs up + restarts only the
#   apps that actually depend on the changed keys.
#
# SAFETY
#   - Never transmits secret values through chat, logs, or stdout in --apply mode.
#   - Creates timestamped backup BEFORE writing: /var/www/bridgeai/.env.backup-<ts>
#   - --dry-run shows only key NAMES that will be added/changed, never values.
#   - Refuses to run if SSH_HOST unset (you must set it explicitly).
#   - Runs `env-matrix-validate.js` against the proposed merged file BEFORE applying.
#
# USAGE
#   export SSH_HOST=user@102.208.228.44            # required
#   export SSH_KEY=~/.ssh/bridgeai_vps             # optional (default: ~/.ssh/id_ed25519)
#   export VPS_ENV_PATH=/var/www/bridgeai/.env     # optional (default shown)
#   export LOCAL_ENV=/c/aoe-unified-final-main/bridgeaios/THE-BRIDGE-AI-OS-V0/.env
#
#   bash scripts/env-vps-merge.sh --dry-run   # preview the merge
#   bash scripts/env-vps-merge.sh --apply     # commit changes + pm2 reload

set -euo pipefail

MODE="${1:---dry-run}"
SSH_HOST="${SSH_HOST:-}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
VPS_ENV_PATH="${VPS_ENV_PATH:-/var/www/bridgeai/.env}"
LOCAL_ENV="${LOCAL_ENV:-./.env.to-push}"

if [[ -z "$SSH_HOST" ]]; then
  echo "ERROR: SSH_HOST not set. Example: export SSH_HOST=root@102.208.228.44" >&2
  exit 1
fi

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "ERROR: local env file not found: $LOCAL_ENV" >&2
  echo "       Set LOCAL_ENV=/path/to/.env or create ./.env.to-push" >&2
  exit 1
fi

if [[ ! -f scripts/env-matrix-validate.js ]]; then
  echo "ERROR: must run from repo root (scripts/env-matrix-validate.js not found)" >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo ""
echo "=== ENV VPS MERGE ($MODE) ==="
echo "  SSH_HOST    : $SSH_HOST"
echo "  LOCAL_ENV   : $LOCAL_ENV ($(grep -cE "^[A-Z]" "$LOCAL_ENV") keys)"
echo "  VPS_ENV_PATH: $VPS_ENV_PATH"
echo ""

# 1) Pull a copy of the VPS .env (requires SSH access)
echo "[1/5] Fetching current VPS env..."
ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" "cat $VPS_ENV_PATH" > "$WORK/vps.env" 2>/dev/null || {
  echo "ERROR: could not fetch $VPS_ENV_PATH from $SSH_HOST" >&2
  exit 2
}
echo "      -> $(grep -cE "^[A-Z]" "$WORK/vps.env") keys on VPS"

# 2) Compute merge (LOCAL wins for overlapping keys, VPS keeps its own for non-overlapping)
echo "[2/5] Computing merge..."
# Build: VPS keys that local doesn't override + all local keys
awk -F= 'NF>1 && /^[A-Z]/ { print $1 }' "$LOCAL_ENV" | sort -u > "$WORK/local_keys.txt"
awk -F= 'NF>1 && /^[A-Z]/ { print $1 }' "$WORK/vps.env" | sort -u > "$WORK/vps_keys.txt"

comm -23 "$WORK/vps_keys.txt" "$WORK/local_keys.txt" > "$WORK/vps_only.txt"  # keep from VPS
comm -12 "$WORK/vps_keys.txt" "$WORK/local_keys.txt" > "$WORK/changed.txt"   # local overrides
comm -13 "$WORK/vps_keys.txt" "$WORK/local_keys.txt" > "$WORK/new.txt"       # local adds

# Compose merged env
{
  echo "# Auto-merged by env-vps-merge.sh on $TS"
  echo "# Source: LOCAL=$LOCAL_ENV + VPS=$VPS_ENV_PATH"
  echo ""
  # Preserve VPS-only keys verbatim
  while IFS= read -r k; do
    grep -E "^$k=" "$WORK/vps.env" | head -1
  done < "$WORK/vps_only.txt"
  echo ""
  # LOCAL-originated keys (new + overrides)
  while IFS= read -r k; do
    grep -E "^$k=" "$LOCAL_ENV" | head -1
  done < "$WORK/local_keys.txt"
} > "$WORK/merged.env"

# 3) Validate merged result against matrix
echo "[3/5] Validating merged env against matrix..."
if ! node scripts/env-matrix-validate.js "$WORK/merged.env" > "$WORK/validation.txt" 2>&1; then
  EC=$?
  echo "      -> validator exit=$EC (1=missing required, 2=weak secrets)"
  tail -20 "$WORK/validation.txt"
  if [[ "$MODE" == "--apply" ]]; then
    echo "ABORTING: validation failed and mode=--apply" >&2
    exit 3
  fi
else
  echo "      -> clean"
fi

# 4) Report (NEVER echo values)
echo ""
echo "=== MERGE SUMMARY ==="
echo "Keys kept from VPS (unchanged) : $(wc -l < "$WORK/vps_only.txt")"
echo "Keys overridden by local       : $(wc -l < "$WORK/changed.txt")"
echo "Keys newly added by local      : $(wc -l < "$WORK/new.txt")"
echo ""
if [[ -s "$WORK/new.txt" ]]; then
  echo "NEW (added):"
  sed 's/^/  + /' "$WORK/new.txt"
fi
if [[ -s "$WORK/changed.txt" ]]; then
  echo "CHANGED (values different between local and VPS):"
  while IFS= read -r k; do
    LV=$(grep -E "^$k=" "$LOCAL_ENV"    | head -1 | cut -d= -f2-)
    VV=$(grep -E "^$k=" "$WORK/vps.env" | head -1 | cut -d= -f2-)
    if [[ "$LV" != "$VV" ]]; then
      echo "  ~ $k    (was ${#VV} chars, now ${#LV} chars)"
    fi
  done < "$WORK/changed.txt"
fi
echo ""

if [[ "$MODE" == "--dry-run" ]]; then
  echo "[DRY-RUN] No changes applied. Re-run with --apply to commit."
  exit 0
fi

# 5) APPLY — backup + upload + reload PM2
echo "[4/5] Creating remote backup + uploading merged env..."
ssh -i "$SSH_KEY" "$SSH_HOST" "cp $VPS_ENV_PATH ${VPS_ENV_PATH}.backup-$TS"
scp -i "$SSH_KEY" "$WORK/merged.env" "$SSH_HOST:$VPS_ENV_PATH.new"
ssh -i "$SSH_KEY" "$SSH_HOST" "mv $VPS_ENV_PATH.new $VPS_ENV_PATH && chmod 600 $VPS_ENV_PATH"
echo "      -> written. Backup at ${VPS_ENV_PATH}.backup-$TS"

echo "[5/5] Reloading PM2 apps that depend on changed env..."
# Conservative: reload all. If you know only orchestra/advisor changed, narrow this.
ssh -i "$SSH_KEY" "$SSH_HOST" "pm2 reload all --update-env && pm2 save"
echo ""
echo "DONE. Verify with:"
echo "  curl -s https://bridge-ai-os.com/api/health | jq"
echo "  ssh $SSH_HOST 'pm2 status'"
echo ""
echo "Rollback if needed:"
echo "  ssh $SSH_HOST 'cp ${VPS_ENV_PATH}.backup-$TS $VPS_ENV_PATH && pm2 reload all --update-env'"
