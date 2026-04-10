#!/bin/bash
# Deploy backup infrastructure to VPS
# Run this on the VPS to set up automatic backups
# Usage: bash /var/www/bridgeai/scripts/deploy-backup-infrastructure.sh

set -e

echo "======================================"
echo "BridgeAI Backup Infrastructure Deploy"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root"
    exit 1
fi

# Configuration
PROJECT_DIR="/var/www/bridgeai"
SCRIPTS_DIR="$PROJECT_DIR/scripts"
BIN_DIR="/usr/local/bin"
LOG_DIR="/var/log"

echo "✓ Running as root"
echo "✓ Project directory: $PROJECT_DIR"
echo ""

# Step 1: Make scripts executable
echo "[1/6] Making scripts executable..."
chmod +x "$SCRIPTS_DIR/backup-restore-recovery.sh"
chmod +x "$SCRIPTS_DIR/load-secrets-from-aws.sh"
chmod +x "$SCRIPTS_DIR/backup-databases.sh"
echo "✓ Scripts are executable"
echo ""

# Step 2: Copy scripts to /usr/local/bin
echo "[2/6] Installing scripts to /usr/local/bin..."
cp "$SCRIPTS_DIR/backup-restore-recovery.sh" "$BIN_DIR/backup-bridgeai"
chmod +x "$BIN_DIR/backup-bridgeai"
echo "✓ Installed: backup-bridgeai (use: backup-bridgeai {backup|restore|list})"
echo ""

# Step 3: Create log file
echo "[3/6] Creating log file..."
touch "$LOG_DIR/bridgeai-backup.log"
chmod 644 "$LOG_DIR/bridgeai-backup.log"
echo "✓ Log file: /var/log/bridgeai-backup.log"
echo ""

# Step 4: Create systemd service for backups
echo "[4/6] Creating systemd service for automated backups..."
cat > /etc/systemd/system/bridgeai-backup.service << 'SYSTEMD_EOF'
[Unit]
Description=BridgeAI Database Backup
After=pm2.service
Wants=bridgeai-backup.timer

[Service]
Type=oneshot
User=root
ExecStart=/usr/local/bin/backup-bridgeai backup
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

cat > /etc/systemd/system/bridgeai-backup.timer << 'TIMER_EOF'
[Unit]
Description=BridgeAI Backup Timer
Requires=bridgeai-backup.service

[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true
Unit=bridgeai-backup.service

[Install]
WantedBy=timers.target
TIMER_EOF

systemctl daemon-reload
systemctl enable bridgeai-backup.timer
echo "✓ Systemd service created"
echo "✓ Timer configured: daily at 02:00 AM"
echo ""

# Step 5: Test backup (first run)
echo "[5/6] Running first backup..."
/usr/local/bin/backup-bridgeai backup || {
    echo "❌ First backup failed"
    echo "   Check logs: tail -50 /var/log/bridgeai-backup.log"
    exit 1
}
echo "✓ First backup completed successfully"
echo ""

# Step 6: Verify backup
echo "[6/6] Verifying backup..."
BACKUP_FILE=$(ls -t "$PROJECT_DIR"/backups/bridgeai-backup-*.tar.gz 2>/dev/null | head -1)
if [ -f "$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✓ Latest backup: $(basename $BACKUP_FILE) ($SIZE)"
    echo "✓ Location: $BACKUP_FILE"
else
    echo "❌ No backup found"
    exit 1
fi
echo ""

# Summary
echo "======================================"
echo "✅ Backup Infrastructure Deployed"
echo "======================================"
echo ""
echo "📋 What's installed:"
echo "  • backup-bridgeai command (available system-wide)"
echo "  • Systemd timer for daily backups at 2 AM"
echo "  • Logs at: /var/log/bridgeai-backup.log"
echo ""
echo "🚀 Quick commands:"
echo "  • Manual backup: backup-bridgeai backup"
echo "  • Restore latest: backup-bridgeai restore"
echo "  • List backups:  backup-bridgeai list"
echo ""
echo "⏰ Scheduled backups:"
systemctl list-timers bridgeai-backup.timer --all
echo ""
echo "📊 Backup location: $PROJECT_DIR/backups"
echo "   Size: $(du -sh "$PROJECT_DIR/backups" | cut -f1)"
echo ""
echo "💾 S3 Upload:"
if command -v aws &> /dev/null; then
    echo "  ✓ AWS CLI installed"
    echo "  Status: aws s3 ls s3://bridgeai-backups/backups/ --recursive"
else
    echo "  ⚠ AWS CLI not installed"
    echo "  To enable S3 uploads: apt-get install awscli && aws configure"
fi
echo ""
echo "✓ Setup complete! Backups will run automatically at 2 AM daily."
