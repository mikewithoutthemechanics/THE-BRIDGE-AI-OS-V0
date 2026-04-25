#!/usr/bin/env bash
# env-usage-audit.sh — produce a live reference-count matrix for process.env.* across BridgeAI workspaces.
#
# Usage:
#   bash scripts/env-usage-audit.sh                    # default roots + stdout
#   bash scripts/env-usage-audit.sh --out audit.tsv    # write TSV to file
#   bash scripts/env-usage-audit.sh --root /path/a,/path/b
#
# Output columns (TSV):
#   VAR   TIER   TOTAL_FILES   TOTAL_REFS   TOP_FILES
#
# Algorithm: single-pass grep per root emits file:var pairs, awk aggregates.
# This is O(N_files) vs the naive O(N_vars × N_files) inner-loop.

set -euo pipefail

DEFAULT_ROOTS="c:/aoe-unified-final-main,C:/aoe-unified-final,E:/BridgeAI"
ROOTS="$DEFAULT_ROOTS"
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOTS="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    -h|--help) sed -n '2,15p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

# collect `file\tvar` pairs with one grep per root
tmp_pairs=$(mktemp)
trap 'rm -f "$tmp_pairs"' EXIT

IFS=',' read -ra ROOT_ARR <<< "$ROOTS"
for root in "${ROOT_ARR[@]}"; do
  [[ -d "$root" ]] || { echo "skip (missing): $root" >&2; continue; }
  # -H forces filename; -o one-match-per-line; strip the process.env. prefix via sed
  grep -rHoE 'process\.env\.[A-Z_][A-Z0-9_]+' "$root" \
    --include='*.js' --include='*.ts' --include='*.mjs' --include='*.cjs' \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.next \
    2>/dev/null | sed 's|:process\.env\.|\t|' >> "$tmp_pairs" || true
done

# aggregate with awk: var → {file set, ref count, top 3 files by ref count}
awk -F'\t' '
BEGIN {
  print "VAR\tTIER\tTOTAL_FILES\tTOTAL_REFS\tTOP_FILES"
}
function classify(v) {
  if (v ~ /(PRIVATE_KEY|MASTER_KEY)$/ || \
      v == "BRIDGE_INTERNAL_SECRET" || v == "JWT_SECRET" || v == "JWT_REFRESH_SECRET" || \
      v == "TVM_SECRET" || v == "AGENT_SALT" || v == "TOTP_ENCRYPTION_KEY" || \
      v == "SIWE_SECRET" || v == "BRIDGE_SIWE_JWT_SECRET" || v == "BRIDGE_VERIFY_SECRET" || \
      v ~ /(_ADMIN_SECRET|_SESSION_SECRET|_INTERNAL_SECRET|_PRIVATE_KEY)$/) return "t0"
  if (v ~ /(_API_KEY|_TOKEN|_SECRET_KEY|_CLIENT_SECRET|_PASSWORD|_APP_PASS|_WEBHOOK_SECRET|_HOOK_SECRET|_SMTP_KEY|_SMTP_PASS|_BACKUP_PASS|_SHARED_SECRET|_DB_URL|_SERVICE_KEY|_SERVICE_ROLE|_BOT_TOKEN|_PRIVATE_TOKEN)$/ || \
      v == "CRON_SECRET" || v == "WEBHOOK_SECRET" || v == "CFO_TOKEN" || v == "ADMIN_TOKEN" || \
      v == "DEV_LOGIN_SECRET" || v == "MCP_BEARER_TOKEN" || v == "DATABASE_URL" || v == "REDIS_URL") return "t1"
  if (v ~ /(_LIMIT|_LIMIT_MAX|_CAP|_CAP_USD|_INTERVAL_MS|_BUDGET|_DEBOUNCE_MS|_TIMEOUT_MS)$/ || \
      v == "ALLOWED_ORIGINS" || v == "PAYFAST_SANDBOX" || v == "PAYFAST_ENABLE_IP_ALLOWLIST" || \
      v == "KEYFORGE_EPOCH_SEC" || v ~ /^WITHDRAWAL_/) return "t2"
  return "t3"
}
{
  file = $1
  var  = $2
  refs[var]++
  key = var "\x1f" file
  if (!(key in seen)) {
    seen[key] = 1
    files[var]++
    # track per-var-file ref count for top-3 selection
  }
  per[var "\x1f" file]++
}
END {
  for (v in refs) {
    # build top-3 files by per-file ref count
    split("", list)
    n = 0
    for (k in per) {
      split(k, a, "\x1f")
      if (a[1] == v) {
        n++
        list[n] = per[k] "\t" a[2]
      }
    }
    # simple bubble by numeric desc, pick top 3
    for (i=1; i<=n; i++) for (j=i+1; j<=n; j++) {
      split(list[i], x, "\t"); split(list[j], y, "\t")
      if (y[1]+0 > x[1]+0) { t = list[i]; list[i] = list[j]; list[j] = t }
    }
    top = ""
    for (i=1; i<=n && i<=3; i++) {
      split(list[i], x, "\t")
      top = top (top?"|":"") x[2]
    }
    printf "%s\t%s\t%d\t%d\t%s\n", v, classify(v), files[v], refs[v], top
  }
}' "$tmp_pairs" | { read -r hdr; echo "$hdr"; sort; } > "${OUT:-/dev/stdout}"

if [[ -n "$OUT" ]]; then
  head -5 "$OUT"
  echo "..."
  echo "wrote $(wc -l < "$OUT") lines to $OUT"
fi
