#!/bin/bash
# Purge .env / secret files from entire git history.
# Run from the REPO ROOT. This is DESTRUCTIVE and rewrites history.
#
# Prerequisites:
#   pip install git-filter-repo      (or: pip3 install git-filter-repo)
#   Notify all collaborators — they must re-clone after this runs.
#
# STEP 1: Run this script (rewrites local history)
# STEP 2: Force-push to remote (see bottom of script)
# STEP 3: Rotate ALL secrets found — history rewrite does not invalidate live keys
# STEP 4: All collaborators must: git clone <repo> (not git pull)

set -euo pipefail

echo "=== Git Secret Purge ==="
echo "WARNING: This rewrites git history. Make a backup first."
echo ""

# ── Verify git-filter-repo is installed ─────────────────────────────────────
if ! command -v git-filter-repo &>/dev/null; then
  echo "ERROR: git-filter-repo not found."
  echo "Install: pip install git-filter-repo"
  exit 1
fi

# ── Files to purge from history ─────────────────────────────────────────────
# Add any others you know were committed at any point
FILES_TO_PURGE=(
  ".env"
  ".env.local"
  ".env.production"
  ".env.unified"
  ".env.secure.json"
  ".env.json"
  "keys.json"
  "credentials.json"
  ".env.txt"
)

echo "Files to remove from history:"
for f in "${FILES_TO_PURGE[@]}"; do
  echo "  - $f"
done
echo ""

read -p "Confirm? Type YES to proceed: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Aborted."
  exit 0
fi

# ── Run git-filter-repo ──────────────────────────────────────────────────────
ARGS=""
for f in "${FILES_TO_PURGE[@]}"; do
  ARGS="$ARGS --path $f"
done

# shellcheck disable=SC2086
git filter-repo --invert-paths $ARGS --force

echo ""
echo "=== History rewrite complete ==="
echo ""
echo "NEXT STEPS (required):"
echo ""
echo "1. Force-push to remote (replace 'origin' and 'main' if different):"
echo "   git push origin --force --all"
echo "   git push origin --force --tags"
echo ""
echo "2. Rotate ALL credentials that were ever in .env files:"
echo "   - JWT_SECRET (generate new)"
echo "   - OPENAI_API_KEY"
echo "   - ANTHROPIC_API_KEY"
echo "   - PAYSTACK_SECRET_KEY"
echo "   - PAYPAL_CLIENT_SECRET"
echo "   - CLERK_SECRET_KEY"
echo "   - ELEVENLABS_API_KEY"
echo "   - OPENROUTER_API_KEY"
echo "   - BRIDGE_SIWE_JWT_SECRET"
echo "   - RESEND_API_KEY"
echo "   - DISCORD_BOT_TOKEN"
echo "   - TURNSTILE_SECRET_KEY"
echo "   - GRAFANA_ADMIN_PASSWORD"
echo "   - SMTP_PASS"
echo "   - NEO4J_PASSWORD (already rotated)"
echo ""
echo "3. All collaborators must re-clone (NOT git pull):"
echo "   git clone <repo-url>"
echo ""
echo "4. Add to .gitignore if not already present:"
cat <<'GITIGNORE'
.env
.env.*
!.env.example
*.secure.json
keys.json
credentials.json
GITIGNORE
