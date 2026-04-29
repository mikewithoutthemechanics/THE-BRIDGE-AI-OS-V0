#!/usr/bin/env bash
#
# deploy-affiliate-system.sh
#
# Applies the affiliate reconciliation + kiosk/marketplace migrations,
# verifies schema state, and optionally runs the seeder.
#
# Subcommands (run in this order for a fresh deploy):
#   check     — verify env vars + psql + migration files; no writes
#   backup    — snapshot `affiliates` table into affiliates_backup_YYYYMMDD
#   migrate   — apply both migrations (idempotent; BEGIN/COMMIT guarded)
#   verify    — confirm tables/columns/functions landed
#   seed      — run scripts/seed-affiliates.js (requires --safe or --full)
#   status    — read-only summary of current state
#   all       — check → backup → migrate → verify   (never seed; always manual)
#
# Flags:
#   --safe    (with `seed`) — omit CLAUDE/ANTHROPIC/GOOGLE/NINJA rows
#   --full    (with `seed`) — include all 40 rows (public-leaderboard exposure)
#   --dry     (with `seed`) — print what would be written
#   --force   (with `migrate`) — re-run even if migrations appear applied
#
# Required env:
#   DATABASE_URL         postgres connection string (from Supabase Settings → DB)
#   SUPABASE_URL         for seed script
#   SUPABASE_SERVICE_KEY for seed script
#
# Recommended env (warnings only):
#   JWT_SECRET           brain.js auth middleware (required at runtime)
#   ADMIN_TOKEN          /api/orders/:id/pay settlement (required at runtime)
#
# Usage:
#   chmod +x scripts/deploy-affiliate-system.sh
#   ./scripts/deploy-affiliate-system.sh check
#   ./scripts/deploy-affiliate-system.sh all
#   ./scripts/deploy-affiliate-system.sh seed --safe
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MIGRATION_RECON="$REPO_ROOT/supabase/migrations/20260420100000_affiliate_program_reconciliation.sql"
MIGRATION_KIOSK="$REPO_ROOT/supabase/migrations/20260420110000_affiliate_kiosk_marketplace.sql"
SEED_SCRIPT="$REPO_ROOT/scripts/seed-affiliates.js"
DEFAULT_COMPANY="00000000-0000-0000-0000-000000000001"
BACKUP_SUFFIX="$(date +%Y%m%d)"

# ── Colors (gracefully disabled when not a TTY) ─────────────────────────────
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_GRN=$'\033[32m'; C_CYA=$'\033[36m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
else
  C_RED=""; C_YEL=""; C_GRN=""; C_CYA=""; C_DIM=""; C_RST=""
fi

log()   { printf '%s[%s]%s %s\n' "$C_CYA" "$(date +%H:%M:%S)" "$C_RST" "$*"; }
ok()    { printf '%s[ OK ]%s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn()  { printf '%s[WARN]%s %s\n' "$C_YEL" "$C_RST" "$*" >&2; }
fail()  { printf '%s[FAIL]%s %s\n' "$C_RED" "$C_RST" "$*" >&2; exit 1; }
dim()   { printf '%s%s%s\n' "$C_DIM" "$*" "$C_RST"; }

# ── Helpers ──────────────────────────────────────────────────────────────────

require_psql() {
  command -v psql >/dev/null 2>&1 || fail "psql not found in PATH. Install postgresql-client or run via Supabase Dashboard SQL Editor manually."
}

require_database_url() {
  [ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set. Get it from Supabase Dashboard → Settings → Database → Connection string (URI)."
}

psql_q() {
  # Run a query and return only the value(s) — no headers, no padding.
  psql "$DATABASE_URL" --no-align --tuples-only --quiet --command "$1"
}

file_exists() {
  [ -f "$1" ] || fail "Missing file: $1"
}

# ── Subcommand: check ────────────────────────────────────────────────────────
cmd_check() {
  log "Pre-flight checks"

  require_psql
  ok "psql found: $(psql --version | head -1)"

  require_database_url
  ok "DATABASE_URL set (ending …${DATABASE_URL: -16})"

  file_exists "$MIGRATION_RECON"; ok "Migration file present: 20260420100000_affiliate_program_reconciliation.sql"
  file_exists "$MIGRATION_KIOSK"; ok "Migration file present: 20260420110000_affiliate_kiosk_marketplace.sql"
  file_exists "$SEED_SCRIPT";     ok "Seed script present: scripts/seed-affiliates.js"

  log "Testing DB connection"
  psql_q "SELECT 1" >/dev/null || fail "Could not connect to database"
  ok "DB connection OK"

  # Runtime env vars — warn but don't fail (not needed for the migration itself)
  [ -n "${SUPABASE_URL:-}" ]         || warn "SUPABASE_URL not set — required for seed step"
  [ -n "${SUPABASE_SERVICE_KEY:-}" ] || warn "SUPABASE_SERVICE_KEY not set — required for seed step"
  [ -n "${JWT_SECRET:-}" ]           || warn "JWT_SECRET not set — brain.js will reject all authenticated /api/affiliate/* calls at runtime"
  [ -n "${ADMIN_TOKEN:-}" ]          || warn "ADMIN_TOKEN not set — /api/orders/:id/pay settlement will 401 every call"

  ok "Pre-flight complete"
}

# ── Subcommand: backup ───────────────────────────────────────────────────────
cmd_backup() {
  require_psql; require_database_url
  log "Checking if affiliates table exists"

  local has_table
  has_table=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='affiliates');")

  if [ "$has_table" != "t" ]; then
    warn "affiliates table does not exist yet — nothing to back up. Skipping."
    return 0
  fi

  local backup_table="affiliates_backup_${BACKUP_SUFFIX}"
  local exists
  exists=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='${backup_table}');")

  if [ "$exists" = "t" ]; then
    warn "Backup table ${backup_table} already exists — leaving it alone"
    return 0
  fi

  log "Creating backup table ${backup_table}"
  psql "$DATABASE_URL" --quiet --command \
    "CREATE TABLE ${backup_table} AS SELECT * FROM affiliates;"

  local row_count
  row_count=$(psql_q "SELECT COUNT(*) FROM ${backup_table};")
  ok "Backed up ${row_count} affiliate rows into ${backup_table}"
  dim "To drop once stable: psql \"\$DATABASE_URL\" -c 'DROP TABLE ${backup_table};'"
}

# ── Subcommand: migrate ──────────────────────────────────────────────────────
cmd_migrate() {
  require_psql; require_database_url

  local force="${1:-}"

  # Idempotence guard — detect if both migrations already landed
  local has_recon has_kiosk
  has_recon=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='bridge_user_id');")
  has_kiosk=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='affiliate_kiosks');")

  if [ "$has_recon" = "t" ] && [ "$has_kiosk" = "t" ] && [ "$force" != "--force" ]; then
    warn "Both migrations appear already applied (affiliates.bridge_user_id + affiliate_kiosks exist)."
    dim "Re-run with --force to execute them again anyway (safe: both are idempotent)."
    return 0
  fi

  log "Applying reconciliation migration"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --file "$MIGRATION_RECON" \
    || fail "Reconciliation migration failed — check the psql output above. DB is unchanged (BEGIN/COMMIT guarded)."
  ok "20260420100000_affiliate_program_reconciliation.sql applied"

  log "Applying kiosk/marketplace migration"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --file "$MIGRATION_KIOSK" \
    || fail "Kiosk/marketplace migration failed — check the psql output above."
  ok "20260420110000_affiliate_kiosk_marketplace.sql applied"
}

# ── Subcommand: verify ───────────────────────────────────────────────────────
cmd_verify() {
  require_psql; require_database_url
  log "Verifying schema state"

  local expected_tables="affiliates affiliate_clicks affiliate_conversions affiliate_payouts affiliate_payout_requests affiliate_creatives affiliate_creative_downloads affiliate_kiosks affiliate_listings affiliate_orders affiliate_kiosk_views"
  local missing=""
  for t in $expected_tables; do
    local e
    e=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='${t}');")
    if [ "$e" != "t" ]; then missing="${missing} ${t}"; fi
  done
  if [ -n "$missing" ]; then
    fail "Missing tables:${missing}"
  fi
  ok "All 11 affiliate tables present"

  # Key columns on affiliates
  local cols
  cols=$(psql_q "SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name='affiliates' AND column_name IN ('bridge_user_id','payout_rail','payout_destination','parent_affiliate_id','referral_code');")
  [[ "$cols" == *bridge_user_id* ]]        || fail "affiliates.bridge_user_id missing"
  [[ "$cols" == *payout_rail* ]]           || fail "affiliates.payout_rail missing"
  [[ "$cols" == *parent_affiliate_id* ]]   || fail "affiliates.parent_affiliate_id missing"
  ok "affiliates extension columns present: ${cols}"

  # Default company row
  local dc
  dc=$(psql_q "SELECT COUNT(*) FROM companies WHERE id='${DEFAULT_COMPANY}';")
  [ "$dc" = "1" ] || fail "DEFAULT_COMPANY row (${DEFAULT_COMPANY}) missing in companies table"
  ok "DEFAULT_COMPANY anchor row present"

  # Trigger function
  local fn
  fn=$(psql_q "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='set_affiliate_updated_at');")
  [ "$fn" = "t" ] || fail "set_affiliate_updated_at() trigger function missing"
  ok "Trigger function set_affiliate_updated_at() installed"

  # FK-fix columns
  local click_col conv_col
  click_col=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliate_clicks' AND column_name='affiliate_uuid');")
  conv_col=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliate_conversions' AND column_name='affiliate_uuid');")
  [ "$click_col" = "t" ] && [ "$conv_col" = "t" ] || fail "FK-fix columns missing (affiliate_clicks/conversions.affiliate_uuid)"
  ok "FK reconciliation columns present"

  ok "Schema verification passed"
}

# ── Subcommand: seed ─────────────────────────────────────────────────────────
cmd_seed() {
  local mode="${1:-}"

  case "$mode" in
    --safe|--full|--dry) ;;
    *)
      fail "seed requires an explicit mode flag: --safe, --full, or --dry
  --safe  omits CLAUDE, ANTHROPIC, GOOGLE, NINJA PROSTITUTES (public leaderboard safety)
  --full  includes all 40 rows (operator accepts public exposure risk)
  --dry   prints what would be written; does not touch the DB"
      ;;
  esac

  require_psql; require_database_url
  [ -n "${SUPABASE_URL:-}" ]         || fail "SUPABASE_URL is required for the seed step"
  [ -n "${SUPABASE_SERVICE_KEY:-}" ] || fail "SUPABASE_SERVICE_KEY is required for the seed step"

  # Schema must be in place
  local has_recon
  has_recon=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='bridge_user_id');")
  [ "$has_recon" = "t" ] || fail "Schema not migrated yet — run 'migrate' first"

  command -v node >/dev/null 2>&1 || fail "node not found in PATH"
  file_exists "$SEED_SCRIPT"

  case "$mode" in
    --safe)
      log "Running seed in SAFE mode (4 sensitive rows omitted)"
      node "$SEED_SCRIPT" --safe
      ;;
    --full)
      warn "Running seed in FULL mode — CLAUDE/ANTHROPIC/GOOGLE/NINJA will land in the public leaderboard."
      warn "Press Ctrl-C within 5 seconds to abort."
      sleep 5
      node "$SEED_SCRIPT"
      ;;
    --dry)
      log "Running seed in DRY mode (no writes)"
      node "$SEED_SCRIPT" --dry
      ;;
  esac

  ok "Seed step complete"
}

# ── Subcommand: status ───────────────────────────────────────────────────────
cmd_status() {
  require_psql; require_database_url
  log "Affiliate system status"

  local affiliates kiosks listings orders published_kiosks
  affiliates=$(psql_q "SELECT COUNT(*) FROM affiliates WHERE company_id='${DEFAULT_COMPANY}';" 2>/dev/null || echo "n/a")
  kiosks=$(psql_q "SELECT COUNT(*) FROM affiliate_kiosks WHERE company_id='${DEFAULT_COMPANY}';" 2>/dev/null || echo "n/a")
  published_kiosks=$(psql_q "SELECT COUNT(*) FROM affiliate_kiosks WHERE company_id='${DEFAULT_COMPANY}' AND is_published=true;" 2>/dev/null || echo "n/a")
  listings=$(psql_q "SELECT COUNT(*) FROM affiliate_listings WHERE company_id='${DEFAULT_COMPANY}' AND status='active';" 2>/dev/null || echo "n/a")
  orders=$(psql_q "SELECT COUNT(*) FROM affiliate_orders WHERE company_id='${DEFAULT_COMPANY}';" 2>/dev/null || echo "n/a")

  printf "  affiliates       %s\n" "$affiliates"
  printf "  kiosks           %s (published: %s)\n" "$kiosks" "$published_kiosks"
  printf "  active listings  %s\n" "$listings"
  printf "  orders           %s\n" "$orders"

  local has_recon has_kiosk
  has_recon=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='affiliates' AND column_name='bridge_user_id');")
  has_kiosk=$(psql_q "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='affiliate_kiosks');")
  printf "  schema: reconciliation=%s kiosk_marketplace=%s\n" "$has_recon" "$has_kiosk"
}

# ── Subcommand: all ──────────────────────────────────────────────────────────
cmd_all() {
  cmd_check
  echo
  cmd_backup
  echo
  cmd_migrate "${1:-}"
  echo
  cmd_verify
  echo
  cmd_status
  echo
  ok "Deploy prep complete. Next steps (manual):"
  printf "  1. %s./scripts/deploy-affiliate-system.sh seed --safe%s\n" "$C_CYA" "$C_RST"
  printf "  2. restart brain.js (pm2 / systemd — your environment)\n"
  printf "  3. smoke test:\n"
  printf "     curl -s \"\$BASE_URL/api/affiliate/dashboard?id=ryan\"   # expect 401, not Ryan's data\n"
  printf "     curl -s \"\$BASE_URL/api/shop/listings\" | jq .count    # expect 0 until listings are added\n"
}

# ── Entrypoint ───────────────────────────────────────────────────────────────

CMD="${1:-}"
[ $# -gt 0 ] && shift || true

case "$CMD" in
  check)   cmd_check ;;
  backup)  cmd_backup ;;
  migrate) cmd_migrate "$@" ;;
  verify)  cmd_verify ;;
  seed)    cmd_seed "$@" ;;
  status)  cmd_status ;;
  all)     cmd_all "$@" ;;
  ""|help|-h|--help)
    sed -n '2,45p' "$0"
    ;;
  *)
    fail "Unknown subcommand: ${CMD}. Run with no args for help."
    ;;
esac
