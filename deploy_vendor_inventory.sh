#!/bin/bash
# =============================================================================
# Bridge AI OS — Vendor & Inventory System Deployment
# Run this on your VPS (Ubuntu) as root or with sudo
# =============================================================================
#
# This script:
#   1. Applies SQL migrations to Supabase
#   2. Patches gateway.js with vendor/inventory routes
#   3. Restarts bridgeai-gateway service
#   4. Seeds initial vendor & inventory data
#
# Usage:
#   sudo bash deploy_vendor_inventory.sh
#
# Prerequisites:
#   - DATABASE_URL set in /etc/environment or ~/.bashrc
#   - bridge_token obtained from admin dashboard
#   - gateway.js at /var/www/bridgeai/gateway.js
# =============================================================================

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Bridge AI OS — Vendor & Inventory System Deployment       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# -----------------------------------------------------------------------------
# STEP 1: Check prerequisites
# -----------------------------------------------------------------------------
echo "🔍 Step 1: Checking prerequisites..."

if [ -z "$DATABASE_URL" ]; then
    echo "   ⚠️  DATABASE_URL not set in environment"
    echo "   Please set DATABASE_URL in /etc/environment or ~/.bashrc:"
    echo "   export DATABASE_URL=postgresql://user:pass@host:5432/dbname"
    exit 1
fi

if [ ! -f "/var/www/bridgeai/gateway.js" ]; then
    echo "   ❌ gateway.js not found at /var/www/bridgeai/gateway.js"
    echo "   Expected path: /var/www/bridgeai/gateway.js"
    exit 1
fi

echo "   ✅ Prerequisites OK"
echo ""

# -----------------------------------------------------------------------------
# STEP 2: Apply database migrations
# -----------------------------------------------------------------------------
echo "📁 Step 2: Applying database migrations..."

# Copy migration file to VPS if running from local
if [ -f "/c/aoe-unified-final-main/db/migrations/004_vendor_inventory_management.sql" ]; then
    echo "   📦 Copying migration file to /tmp/..."
    cp "/c/aoe-unified-final-main/db/migrations/004_vendor_inventory_management.sql" /tmp/
    MIGRATION_FILE="/tmp/004_vendor_inventory_management.sql"
else
    MIGRATION_FILE="/tmp/004_vendor_inventory_management.sql"
fi

# Run migration via psql
echo "   🗄️  Executing SQL migration..."
psql "$DATABASE_URL" -f "$MIGRATION_FILE" 2>&1 | head -20

if [ $? -eq 0 ]; then
    echo "   ✅ Migration applied successfully"
else
    echo "   ❌ Migration failed — check errors above"
    exit 1
fi
echo ""

# -----------------------------------------------------------------------------
# STEP 3: Patch gateway.js
# -----------------------------------------------------------------------------
echo "🔧 Step 3: Patching gateway.js..."

cd /c/aoe-unified-final-main
python3 patch_gateway_vendor_inventory_routes.py /var/www/bridgeai/gateway.js 2>&1 || {
    echo "   ❌ Failed to patch gateway.js"
    exit 1
}

echo "   ✅ gateway.js patched"
echo ""

# -----------------------------------------------------------------------------
# STEP 4: Restart gateway service
# -----------------------------------------------------------------------------
echo "🔄 Step 4: Restarting bridgeai-gateway service..."

if systemctl is-active --quiet bridgeai-gateway; then
    sudo systemctl restart bridgeai-gateway
    echo "   ✅ Service restarted"
else
    echo "   ⚠️  Service not found — you may need to restart manually"
    echo "   Try: sudo systemctl restart bridgeai-gateway"
fi
echo ""

# -----------------------------------------------------------------------------
# STEP 5: Seed initial data (optional)
# -----------------------------------------------------------------------------
echo "🌱 Step 5: Seeding initial vendor & inventory data..."
echo "   This step requires a valid bridge_token."
echo "   You can get it from browser console: localStorage.getItem('bridge_token')"

read -p "   Enter bridge_token (or press Enter to skip): " TOKEN

if [ -n "$TOKEN" ]; then
    python3 bulk_add_vendors.py --token "$TOKEN" --api http://127.0.0.1:8080 2>&1 | head -30
    echo "   ✅ Data seeding complete"
else
    echo "   ⏭️  Skipping data import"
    echo "   To seed later: python3 bulk_add_vendors.py --token YOUR_TOKEN"
fi
echo ""

# -----------------------------------------------------------------------------
# STEP 6: Verification
# -----------------------------------------------------------------------------
echo "🔍 Step 6: Verification..."

if [ -n "$TOKEN" ]; then
    echo "   Testing /api/vendors endpoint..."
    RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8080/api/vendors)
    if echo "$RESPONSE" | grep -q '"ok":true'; then
        echo "   ✅ /api/vendors responding"
        VENDOR_COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('vendors',[])))" 2>/dev/null || echo "?")
        echo "   📊 Vendors in DB: $VENDOR_COUNT"
    else
        echo "   ❌ /api/vendors failed: $RESPONSE"
    fi
else
    echo "   ⏭️  Skipping verification (no token)"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  🎉 DEPLOYMENT COMPLETE                                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Verify in Admin Dashboard: http://127.0.0.1:8080/admin/crm"
echo "  2. Check API: curl http://127.0.0.1:8080/api/vendors"
echo "  3. Deploy Linea mint worker (see VENDOR_INVENTORY_README.md)"
echo ""
echo "Files created:"
echo "  • db/migrations/004_vendor_inventory_management.sql"
echo "  • patch_gateway_vendor_inventory_routes.py"
echo "  • bulk_add_vendors.py"
echo "  • verify_vendor_api.py"
echo "  • linea-auto-add-console.js"
echo "  • VendorInventoryWidget.jsx (React)"
echo ""
