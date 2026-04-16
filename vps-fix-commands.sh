#!/bin/bash
# Bridge AI OS - VPS Fix Commands
# Run these on the server at 102.208.231.53

echo "=== Bridge AI OS VPS Fix Script ==="

# 1. Navigate to correct directory
cd /var/www/bridgeai || cd /opt/bridge-ai-os
echo "Working directory: $(pwd)"

# 2. Install missing dependencies
echo "Installing npm dependencies..."
npm install --silent

# 3. Rebuild native modules
echo "Rebuilding native modules..."
npm rebuild better-sqlite3 2>/dev/null || true

# 4. Install ethers if missing
echo "Installing ethers..."
npm install ethers --save 2>/dev/null || true

# 5. Check if predictive-intelligence.js exists
if [ ! -f predictive-intelligence.js ]; then
    echo "WARNING: predictive-intelligence.js not found!"
    echo "Fix: Remove from PM2 ecosystem or create the file"
fi

# 6. Restart all services
echo "Restarting services..."
pm2 restart all

# 7. Check status
echo ""
echo "=== Service Status ==="
pm2 status