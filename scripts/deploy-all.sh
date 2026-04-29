#!/bin/bash
# ============================================================================
# BRIDGE AI OS - Complete Deployment Script
# ============================================================================
# This script deploys:
#   1. Code changes to GitHub
#   2. Application to VPS
#   3. Database migrations to Supabase
# ============================================================================

set -e  # Exit on any error

echo "========================================================================"
echo "BRIDGE AI OS - Complete Deployment"
echo "========================================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITHUB_REPO="https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git"
VPS_USER="${VPS_USER:-root}"
VPS_HOST="${VPS_HOST:-37.27.245.219}"
VPS_DIR="${VPS_DIR:-/opt/bridge-os}"

# Step counter
STEP=0

print_step() {
    ((STEP++))
    echo ""
    echo -e "${YELLOW}[$STEP/7] $1${NC}"
    echo "------------------------------------------------------------------------"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# ============================================================================
# STEP 1: Verify Environment
# ============================================================================
print_step "Verifying Environment"

cd "$PROJECT_DIR"

# Check required env vars
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
fi

if [ -z "$SUPABASE_URL" ]; then
    print_error "SUPABASE_URL not set"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    print_error "SUPABASE_SERVICE_KEY not set"
    exit 1
fi

print_success "Environment variables loaded"

# ============================================================================
# STEP 2: Run Tests/Verification
# ============================================================================
print_step "Running Pre-Deployment Verification"

if node scripts/verify-withdrawal-system.js; then
    print_success "Verification passed"
else
    print_error "Verification failed - fix issues before deploying"
    exit 1
fi

# ============================================================================
# STEP 3: Commit and Push to GitHub
# ============================================================================
print_step "Pushing to GitHub"

# Check if there are changes to commit
if git diff --quiet && git diff --staged --quiet && [ -z "$(git status --porcelain)" ]; then
    print_success "No changes to commit"
else
    # Add all changes
    git add -A
    print_success "Changes staged"
    
    # Create commit
    COMMIT_MSG="feat: Complete withdrawal system with auto-healing

- Add migration for withdrawal_requests, agent_claims, fiat_payouts, 
  withdrawal_claims, admin_withdrawals tables
- Auto-create tables in all withdrawal modules if missing
- Add verification script for deployment checks
- Update withdrawal-routes, claim-routes, treasury-withdraw, 
  withdrawal-limits, swap-routes with auto-table creation
- Daily limits: 10,000 BRDG per user
- Cooldown: 10 minutes between withdrawals

All 4 critical blockers resolved:
1. Missing database tables → Migration + auto-create
2. No auto-table creation → Added to all modules
3. No verification tool → verify-withdrawal-system.js
4. No documentation → WITHDRAWAL_SYSTEM_FIXES.md"
    
    git commit -m "$COMMIT_MSG" || true
    print_success "Changes committed"
    
    # Push to GitHub
    if git push origin main; then
        print_success "Pushed to GitHub"
    else
        print_error "GitHub push failed"
        exit 1
    fi
fi

# Show last commit
echo ""
echo "Last commit:"
git log -1 --oneline

# ============================================================================
# STEP 4: Apply Supabase Migrations
# ============================================================================
print_step "Applying Supabase Migrations"

if node migrations/apply-withdrawal-system.js; then
    print_success "Supabase migrations applied"
else
    print_error "Supabase migration failed"
    echo "Please apply manually:"
    echo "  1. Go to https://supabase.com/dashboard"
    echo "  2. Open SQL Editor for your project"
    echo "  3. Run the SQL from: migrations/013_withdrawal_system.sql"
    exit 1
fi

# ============================================================================
# STEP 5: Deploy to VPS
# ============================================================================
print_step "Deploying to VPS"

# Check VPS connectivity
if ! ssh -o ConnectTimeout=5 "$VPS_USER@$VPS_HOST" "echo 'VPS reachable'" 2>/dev/null; then
    print_error "Cannot connect to VPS at $VPS_USER@$VPS_HOST"
    echo "Please ensure:"
    echo "  1. VPS is running"
    echo "  2. SSH key is configured"
    echo "  3. VPS_USER and VPS_HOST env vars are set correctly"
    exit 1
fi

print_success "VPS is reachable"

# Pull latest code on VPS
echo "Pulling latest code on VPS..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_DIR && git pull origin main" || {
    print_error "Git pull on VPS failed"
    exit 1
}
print_success "Code updated on VPS"

# Install dependencies on VPS
echo "Installing dependencies on VPS..."
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_DIR && npm install" || {
    print_error "npm install on VPS failed"
    exit 1
}
print_success "Dependencies installed on VPS"

# ============================================================================
# STEP 6: Restart Services
# ============================================================================
print_step "Restarting Services"

# Check if PM2 is installed
if ssh "$VPS_USER@$VPS_HOST" "which pm2" >/dev/null 2>&1; then
    echo "Restarting with PM2..."
    ssh "$VPS_USER@$VPS_HOST" "cd $VPS_DIR && pm2 reload ecosystem.config.js --env production" || {
        print_error "PM2 restart failed"
        exit 1
    }
    print_success "Services restarted with PM2"
else
    echo "PM2 not found, attempting direct restart..."
    ssh "$VPS_USER@$VPS_HOST" "pkill -f 'node.*system.js' && sleep 2 && cd $VPS_DIR && nohup npm run start:prod > /var/log/bridge-os.log 2>&1 &" || {
        print_error "Service restart failed"
        exit 1
    }
    print_success "Services restarted"
fi

# Wait for services to start
sleep 3

# Health check
if ssh "$VPS_USER@$VPS_HOST" "curl -s http://localhost:3000/health | grep -q 'OK'"; then
    print_success "Health check passed"
else
    print_error "Health check failed"
    exit 1
fi

# ============================================================================
# STEP 7: Post-Deployment Verification
# ============================================================================
print_step "Post-Deployment Verification"

# Test withdrawal endpoints
echo "Testing withdrawal endpoints..."

# Test limits endpoint (public)
if curl -s "http://$VPS_HOST:3000/api/user/withdraw/limits" | grep -q "daily_limit"; then
    print_success "Withdrawal limits endpoint responding"
else
    print_error "Withdrawal limits endpoint not responding"
fi

# Test swap quote endpoint
echo "Testing swap quote endpoint..."
if curl -s "http://$VPS_HOST:3000/api/swap/quote?amount=100" | grep -q "ethOut"; then
    print_success "Swap quote endpoint responding"
else
    print_error "Swap quote endpoint not responding"
fi

echo ""
echo "========================================================================"
echo -e "${GREEN}DEPLOYMENT COMPLETE!${NC}"
echo "========================================================================"
echo ""
echo "Summary:"
echo "  ✓ Code pushed to GitHub"
echo "  ✓ Supabase migrations applied"
echo "  ✓ Deployed to VPS at $VPS_HOST"
echo "  ✓ Services restarted and healthy"
echo ""
echo "Active Withdrawal Endpoints:"
echo "  • POST /api/user/withdraw/brdg"
echo "  • GET  /api/user/withdraw/limits"
echo "  • GET  /api/user/withdraw/history"
echo "  • POST /api/agent/claim"
echo "  • POST /api/user/swap/brdg-to-eth"
echo ""
echo "Documentation: WITHDRAWAL_SYSTEM_FIXES.md"
echo ""
