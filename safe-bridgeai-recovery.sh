#!/bin/bash
# SAFE BRIDGEAI RECOVERY SCRIPT
# Run on VPS: go.ai-os.co.za
# This script is IDEMPOTENT and SAFE - can be run multiple times

set -e

echo "=== SAFE BRIDGEAI RECOVERY ==="
echo "Started at: $(date)"
echo ""

cd /var/www/bridgeai

# ===== PHASE 1: DIAGNOSTICS (NO CHANGES) =====
echo "=== PHASE 1: DIAGNOSTICS ==="

# Check current service status
echo "1. Service status:"
sudo systemctl status bridgeai --no-pager -l 2>/dev/null || echo "Service not running or not found"

# Check systemd unit configuration
echo ""
echo "2. Systemd unit configuration:"
sudo systemctl cat bridgeai.service 2>/dev/null || echo "No bridgeai.service unit found"

# Check environment variables
echo ""
echo "3. Environment configuration:"
if [ -f ".env" ]; then
    echo ".env file exists"
    if grep -q "GITHUB_CLIENT_ID=" .env 2>/dev/null; then
        echo "✓ GITHUB_CLIENT_ID found in .env"
    else
        echo "❌ GITHUB_CLIENT_ID missing from .env"
    fi
    if grep -q "GITHUB_CLIENT_SECRET=" .env 2>/dev/null; then
        echo "✓ GITHUB_CLIENT_SECRET found in .env"
    else
        echo "❌ GITHUB_CLIENT_SECRET missing from .env"
    fi
else
    echo "❌ .env file not found"
fi

# Check database status
echo ""
echo "4. Database status:"
if [ -f "users.db" ]; then
    echo "Database file exists: $(ls -lh users.db)"
    if command -v sqlite3 >/dev/null 2>&1; then
        INTEGRITY=$(sqlite3 users.db "PRAGMA integrity_check;" 2>/dev/null || echo "integrity_check_failed")
        if [ "$INTEGRITY" = "ok" ]; then
            echo "✓ Database integrity: OK"
        else
            echo "❌ Database integrity: FAILED ($INTEGRITY)"
        fi
    else
        echo "! sqlite3 not available for integrity check"
    fi
else
    echo "❌ Database file not found"
fi

# Check recent logs
echo ""
echo "5. Recent service logs (last 20 lines):"
sudo journalctl -u bridgeai -n 20 --no-pager 2>/dev/null || echo "No journal logs available"

echo ""
echo "=== DIAGNOSTICS COMPLETE ==="
echo "Review above output before proceeding with fixes."
echo ""
read -p "Proceed with safe fixes? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# ===== PHASE 2: SAFE FIXES =====
echo ""
echo "=== PHASE 2: SAFE FIXES ==="

# Fix 1: Ensure systemd loads environment
echo "1. Fixing systemd environment loading..."
UNIT_FILE="/etc/systemd/system/bridgeai.service"
if [ -f "$UNIT_FILE" ]; then
    # Backup unit file
    sudo cp "$UNIT_FILE" "${UNIT_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

    # Check if EnvironmentFile is already set
    if ! sudo grep -q "EnvironmentFile=/var/www/bridgeai/.env" "$UNIT_FILE"; then
        echo "Adding EnvironmentFile to systemd unit..."
        # Insert EnvironmentFile after [Service] section
        sudo sed -i '/^\[Service\]/a EnvironmentFile=/var/www/bridgeai/.env' "$UNIT_FILE"
        echo "✓ Added EnvironmentFile to systemd unit"
    else
        echo "✓ EnvironmentFile already configured"
    fi
else
    echo "❌ Systemd unit file not found at $UNIT_FILE"
    echo "Manual systemd setup required. Expected content:"
    echo "[Unit]"
    echo "Description=BridgeAI Application"
    echo "After=network.target"
    echo ""
    echo "[Service]"
    echo "Type=simple"
    echo "User=www-data"
    echo "WorkingDirectory=/var/www/bridgeai"
    echo "EnvironmentFile=/var/www/bridgeai/.env"
    echo "ExecStart=/usr/bin/node /var/www/bridgeai/server.js"
    echo "Restart=always"
    echo ""
    echo "[Install]"
    echo "WantedBy=multi-user.target"
fi

# Fix 2: Validate startup configuration (code)
echo ""
echo "2. Adding safe startup validation..."
VALIDATION_FILE="startup-validation.js"
if [ ! -f "$VALIDATION_FILE" ]; then
    cat > "$VALIDATION_FILE" << 'EOF'
#!/usr/bin/env node
// SAFE STARTUP VALIDATION
// This file validates critical environment variables before app starts

const required = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables:');
  missing.forEach(key => console.error(`   - ${key}`));
  console.error('');
  console.error('Add these to your .env file and restart the service:');
  console.error('GITHUB_CLIENT_ID=your_github_oauth_client_id');
  console.error('GITHUB_CLIENT_SECRET=your_github_oauth_client_secret');
  process.exit(1);
}

console.log('✓ Environment validation passed');
EOF
    chmod +x "$VALIDATION_FILE"
    echo "✓ Created startup validation script"
else
    echo "✓ Startup validation script already exists"
fi

# Update main server.js to include validation (only if not already present)
if [ -f "server.js" ]; then
    if ! grep -q "startup-validation.js" server.js; then
        # Add validation at the top of server.js
        sed -i '1i // STARTUP VALIDATION\nrequire("./startup-validation.js");\n' server.js
        echo "✓ Added validation to server.js"
    else
        echo "✓ Validation already included in server.js"
    fi
else
    echo "❌ server.js not found - manual validation required"
fi

# Fix 3: Safe database recovery (only if corrupted)
echo ""
echo "3. Database integrity check and recovery..."
if [ -f "users.db" ] && command -v sqlite3 >/dev/null 2>&1; then
    INTEGRITY=$(sqlite3 users.db "PRAGMA integrity_check;" 2>/dev/null || echo "failed")
    if [ "$INTEGRITY" != "ok" ]; then
        echo "❌ Database corrupted. Attempting safe recovery..."

        # Create backup
        BACKUP_NAME="users.db.corrupted.$(date +%Y%m%d_%H%M%S)"
        cp users.db "$BACKUP_NAME"
        echo "✓ Created backup: $BACKUP_NAME"

        # Attempt recovery
        if sqlite3 users.db ".recover" > recovered.sql 2>/dev/null; then
            sqlite3 recovered.db < recovered.sql 2>/dev/null
            if [ -f "recovered.db" ]; then
                RECOVERY_INTEGRITY=$(sqlite3 recovered.db "PRAGMA integrity_check;" 2>/dev/null || echo "failed")
                if [ "$RECOVERY_INTEGRITY" = "ok" ]; then
                    mv users.db "${BACKUP_NAME}.original"
                    mv recovered.db users.db
                    echo "✓ Database recovered successfully"
                else
                    echo "❌ Recovery failed - database still corrupted"
                    echo "Manual intervention required. Check $BACKUP_NAME"
                fi
            else
                echo "❌ Recovery failed - no recovered database created"
            fi
        else
            echo "❌ Recovery command failed"
        fi

        # Clean up temp files
        rm -f recovered.sql
    else
        echo "✓ Database integrity OK - no recovery needed"
    fi
else
    echo "! Database check skipped (sqlite3 not available or no database)"
fi

# Fix 4: Safe platform detection fix
echo ""
echo "4. Fixing platform detection bug..."
if [ -f "data-service.js" ]; then
    # Create backup
    cp data-service.js "data-service.js.backup.$(date +%Y%m%d_%H%M%S)"

    # Safe replacement - only change the specific pattern
    if grep -q "if (os.platform() === 'win32') {" data-service.js; then
        sed -i "s/if (os.platform() === 'win32') {/if (os.platform() === 'win32' \&\& !process.env.CI) {/" data-service.js
        echo "✓ Fixed platform detection in data-service.js"
    else
        echo "✓ Platform detection pattern not found or already fixed"
    fi
else
    echo "! data-service.js not found - platform fix skipped"
fi

# ===== PHASE 3: SAFE RESTART =====
echo ""
echo "=== PHASE 3: SAFE RESTART ==="

# Reload systemd and restart
echo "1. Reloading systemd configuration..."
sudo systemctl daemon-reload

echo "2. Restarting service..."
sudo systemctl restart bridgeai 2>/dev/null || echo "Service restart failed"

# Wait for startup
echo "3. Waiting for service to start..."
sleep 5

# Check status
echo "4. Service status after restart:"
sudo systemctl status bridgeai --no-pager -l 2>/dev/null || echo "Service status check failed"

# ===== PHASE 4: VERIFICATION =====
echo ""
echo "=== PHASE 4: VERIFICATION ==="

# Check recent logs for errors
echo "1. Checking logs for errors..."
if sudo journalctl -u bridgeai --since "10 minutes ago" 2>/dev/null | grep -qE "transporter|database disk image|GITHUB_CLIENT_ID|GITHUB_CLIENT_SECRET"; then
    echo "❌ ERRORS FOUND IN LOGS:"
    sudo journalctl -u bridgeai --since "10 minutes ago" | grep -E "transporter|database disk image|GITHUB_CLIENT_ID|GITHUB_CLIENT_SECRET" | head -10
else
    echo "✓ No critical errors found in recent logs"
fi

# Test health endpoints (if they exist)
echo ""
echo "2. Testing health endpoints..."
HEALTH_ENDPOINTS=("http://localhost:3000/health" "http://localhost:5001/health")
for endpoint in "${HEALTH_ENDPOINTS[@]}"; do
    if curl -f -s --max-time 5 "$endpoint" > /dev/null 2>&1; then
        echo "✓ $endpoint - OK"
    else
        echo "! $endpoint - Not responding or not configured"
    fi
done

echo ""
echo "=== RECOVERY COMPLETE ==="
echo "Time: $(date)"
echo ""
echo "NEXT STEPS:"
echo "1. Check OAuth: Visit https://go.ai-os.co.za/auth/github"
echo "2. Monitor logs: sudo journalctl -u bridgeai -f"
echo "3. Verify GitHub OAuth callback URL matches: https://go.ai-os.co.za/auth/github/callback"
echo ""
echo "If issues persist, share the output of this script for further diagnosis."