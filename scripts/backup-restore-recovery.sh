#!/bin/bash
# Comprehensive backup, restore, and recovery utilities for BridgeAI OS
# Usage:
#   backup-restore-recovery.sh backup      # Create backup
#   backup-restore-recovery.sh restore     # Restore from latest backup
#   backup-restore-recovery.sh list        # List available backups

set -e

# Configuration
PROJECT_DIR="/var/www/bridgeai"
BACKUP_DIR="$PROJECT_DIR/backups"
S3_BUCKET="${S3_BACKUP_BUCKET:-bridgeai-backups}"
LOCAL_RETENTION_DAYS=7
LOG_FILE="/var/log/bridgeai-backup.log"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "$timestamp [$level] $message" | tee -a "$LOG_FILE"
}

# Error handler
error_exit() {
    log "ERROR" "$1"
    exit 1
}

# Ensure required tools are available
check_requirements() {
    local missing=0

    for cmd in sqlite3 tar gzip; do
        if ! command -v "$cmd" &> /dev/null; then
            log "ERROR" "Required tool not found: $cmd"
            missing=1
        fi
    done

    if [ $missing -eq 1 ]; then
        error_exit "Install missing tools with: apt-get install sqlite3 tar gzip"
    fi

    # AWS CLI is optional but recommended
    if ! command -v aws &> /dev/null; then
        log "WARNING" "AWS CLI not found — S3 upload will be skipped"
        log "WARNING" "Install with: apt-get install awscli"
    fi
}

# Backup function
backup() {
    log "INFO" "Starting backup process..."

    mkdir -p "$BACKUP_DIR"
    local timestamp=$(date +%Y-%m-%d_%H-%M-%S)

    # Backup SQLite databases
    if [ -f "$PROJECT_DIR/users.db" ]; then
        log "INFO" "Backing up users.db..."
        sqlite3 "$PROJECT_DIR/users.db" ".backup '$BACKUP_DIR/users.db.$timestamp'"
        log "INFO" "✓ users.db backed up"
    fi

    if [ -f "$PROJECT_DIR/defi.db" ]; then
        log "INFO" "Backing up defi.db..."
        sqlite3 "$PROJECT_DIR/defi.db" ".backup '$BACKUP_DIR/defi.db.$timestamp'"
        log "INFO" "✓ defi.db backed up"
    fi

    # Backup PostgreSQL (if configured)
    if [ ! -z "$PG_HOST" ] && command -v pg_dump &> /dev/null; then
        log "INFO" "Backing up PostgreSQL database..."
        PGPASSWORD="${PG_PASSWORD}" pg_dump \
            -h "${PG_HOST}" \
            -U "${PG_USER}" \
            -d "${PG_DATABASE:-bridgeai_prod}" \
            > "$BACKUP_DIR/postgres.$timestamp.sql" || \
            log "WARNING" "PostgreSQL backup failed (database may not be running)"
        [ -f "$BACKUP_DIR/postgres.$timestamp.sql" ] && log "INFO" "✓ PostgreSQL backed up"
    fi

    # Create archive of entire project
    log "INFO" "Creating project archive..."
    tar -czf "$BACKUP_DIR/bridgeai-backup-$timestamp.tar.gz" \
        -C "$PROJECT_DIR" \
        --exclude=node_modules \
        --exclude=.git \
        --exclude=backups \
        . || error_exit "Failed to create archive"

    log "INFO" "✓ Project archive created: bridgeai-backup-$timestamp.tar.gz"

    # Upload to S3
    if command -v aws &> /dev/null; then
        log "INFO" "Uploading to S3..."
        aws s3 cp "$BACKUP_DIR/bridgeai-backup-$timestamp.tar.gz" \
            "s3://$S3_BUCKET/backups/$(date +%Y/%m/%d)/" \
            --storage-class INTELLIGENT_TIERING \
            --metadata "timestamp=$timestamp,hostname=$(hostname)" || \
            log "WARNING" "S3 upload failed (credentials may not be configured)"

        if [ $? -eq 0 ]; then
            log "INFO" "✓ Uploaded to S3: s3://$S3_BUCKET/backups/$(date +%Y/%m/%d)/bridgeai-backup-$timestamp.tar.gz"
        fi
    else
        log "INFO" "Backup stored locally: $BACKUP_DIR/bridgeai-backup-$timestamp.tar.gz"
    fi

    # Clean up old backups
    log "INFO" "Cleaning up backups older than $LOCAL_RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "bridgeai-backup-*.tar.gz" -mtime +$LOCAL_RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "*.db.*" -mtime +$LOCAL_RETENTION_DAYS -delete
    log "INFO" "✓ Cleanup complete"

    log "INFO" "Backup completed successfully"
}

# Restore function
restore() {
    local backup_file="${1:-}"

    if [ -z "$backup_file" ]; then
        # List available backups
        log "INFO" "Available backups:"
        ls -lh "$BACKUP_DIR"/bridgeai-backup-*.tar.gz 2>/dev/null | tail -5 || error_exit "No backups found"
        echo ""
        read -p "Enter backup filename to restore (e.g., bridgeai-backup-2025-04-01_02-00-00.tar.gz): " backup_file
    fi

    local backup_path="$BACKUP_DIR/$backup_file"

    [ ! -f "$backup_path" ] && error_exit "Backup file not found: $backup_path"

    log "WARNING" "This will overwrite current data. Creating safety backup first..."
    backup  # Create safety backup before restoring

    log "INFO" "Extracting backup to temporary directory..."
    local restore_dir="/tmp/bridgeai-restore-$$"
    mkdir -p "$restore_dir"

    tar -xzf "$backup_path" -C "$restore_dir" || error_exit "Failed to extract backup"

    log "INFO" "Stopping application..."
    pm2 stop all || log "WARNING" "Failed to stop PM2 (may not be running)"

    log "INFO" "Restoring files..."
    # Restore databases
    [ -f "$restore_dir/users.db" ] && cp "$restore_dir/users.db" "$PROJECT_DIR/users.db"
    [ -f "$restore_dir/defi.db" ] && cp "$restore_dir/defi.db" "$PROJECT_DIR/defi.db"

    log "INFO" "Starting application..."
    pm2 restart all || pm2 start "$PROJECT_DIR/ecosystem.config.js"

    log "INFO" "Verifying restore..."
    sleep 2
    curl -s http://localhost:3000/health > /dev/null && log "INFO" "✓ Application is running" || log "WARNING" "Application health check failed"

    log "INFO" "Restore completed. Temporary directory: $restore_dir (you can delete after verification)"
}

# List backups
list_backups() {
    log "INFO" "Available backups:"
    echo ""
    ls -lh "$BACKUP_DIR"/bridgeai-backup-*.tar.gz 2>/dev/null | awk '{print $9, "(" $5 ")"}'
    echo ""
    echo "Total size: $(du -sh "$BACKUP_DIR" | cut -f1)"
}

# Main
main() {
    local action="${1:-backup}"

    check_requirements

    case "$action" in
        backup)
            backup
            ;;
        restore)
            restore "$2"
            ;;
        list)
            list_backups
            ;;
        *)
            echo "Usage: $0 {backup|restore|list}"
            exit 1
            ;;
    esac
}

main "$@"
