#!/bin/bash
# CRITICAL FIXES FOR BRIDGEAI SYSTEM
# Run on VPS: go.ai-os.co.za
# Usage: bash fix-bridgeai.sh

set -e

echo "=== BRIDGEAI CRITICAL FIXES ==="
echo "Target: go.ai-os.co.za"
echo ""

cd /var/www/bridgeai

# 1. BACKUP CURRENT (CORRUPTED) DATABASE
echo "1. Backing up corrupted database..."
cp users.db users.db.corrupted.$(date +%Y%m%d_%H%M%S) 2>/dev/null || echo "No existing database to backup"

# 2. STOP SERVICES
echo "2. Stopping services..."
sudo systemctl stop bridgeai 2>/dev/null || echo "Service not running"

# 3. FORCE REMOVE CORRUPTED DATABASE
echo "3. Removing corrupted database files..."
rm -f users.db users.db-shm users.db-wal

# 4. RECREATE DATABASE WITH MIGRATIONS
echo "4. Recreating database with migrations..."
node migrations/run-migrations.js

# 5. VERIFY OAUTH CREDENTIALS ARE SET
echo "5. Checking OAuth configuration..."
if ! grep -q "GITHUB_CLIENT_ID=" .env 2>/dev/null; then
    echo "ERROR: GITHUB_CLIENT_ID not found in .env"
    echo "Add these lines to .env:"
    echo "GITHUB_CLIENT_ID=your_github_oauth_app_client_id"
    echo "GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret"
    exit 1
fi

if ! grep -q "GITHUB_CLIENT_SECRET=" .env 2>/dev/null; then
    echo "ERROR: GITHUB_CLIENT_SECRET not found in .env"
    exit 1
fi

echo "✓ OAuth credentials present"

# 6. FIX PLATFORM DETECTION BUG
echo "6. Fixing platform detection bug..."
sed -i 's/if (os.platform() === '\''win32'\'') {/if (os.platform() === '\''win32'\'' \&\& !process.env.CI) {/' data-service.js

# 7. ADD STARTUP VALIDATION
echo "7. Adding startup validation..."
cat >> server.js << 'EOF'

// CRITICAL CONFIG VALIDATION
const requiredEnv = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('❌ MISSING REQUIRED ENVIRONMENT VARIABLES:', missing.join(', '));
  console.error('Add them to .env file and restart services');
  process.exit(1);
}
console.log('✓ Critical environment variables validated');
EOF

# 8. RESTART SERVICES
echo "8. Restarting services..."
sudo systemctl daemon-reload
sudo systemctl start bridgeai

# 9. VERIFY SERVICES STARTED
echo "9. Verifying services..."
sleep 5
if sudo systemctl is-active --quiet bridgeai; then
    echo "✓ Service started successfully"
else
    echo "❌ Service failed to start"
    sudo systemctl status bridgeai --no-pager
    exit 1
fi

# 10. TEST HEALTH ENDPOINTS
echo "10. Testing health endpoints..."
if curl -f -s http://localhost:3000/health > /dev/null; then
    echo "✓ Main service health check passed"
else
    echo "❌ Main service health check failed"
fi

if curl -f -s http://localhost:5001/health > /dev/null; then
    echo "✓ Auth service health check passed"
else
    echo "❌ Auth service health check failed"
fi

# 11. CHECK LOGS FOR ERRORS
echo "11. Checking recent logs for errors..."
if sudo journalctl -u bridgeai --since "5 minutes ago" | grep -q "transporter\|database disk image\|GITHUB_CLIENT"; then
    echo "❌ Errors still present in logs:"
    sudo journalctl -u bridgeai --since "5 minutes ago" | grep -E "transporter|database disk image|GITHUB_CLIENT" | head -5
else
    echo "✓ No critical errors found in recent logs"
fi

echo ""
echo "=== FIX COMPLETE ==="
echo "Test OAuth: Visit https://go.ai-os.co.za/auth/github"
echo "Monitor logs: sudo journalctl -u bridgeai -f"
echo ""
echo "If OAuth still fails, verify your GitHub OAuth app callback URL:"
echo "Expected: https://go.ai-os.co.za/auth/github/callback"