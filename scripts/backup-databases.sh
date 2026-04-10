#!/bin/bash
# Automated database backup to S3 + local retention
# Run via cron: 0 2 * * * /var/www/bridgeai/scripts/backup-databases.sh

set -e

BACKUP_DIR="/var/www/bridgeai/backups"
S3_BUCKET="${S3_BACKUP_BUCKET:-bridgeai-backups}"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
LOCAL_RETENTION_DAYS=7

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Backup SQLite databases
if [ -f "/var/www/bridgeai/users.db" ]; then
  sqlite3 /var/www/bridgeai/users.db ".backup $BACKUP_DIR/users.db.$TIMESTAMP"
  echo "[$(date)] ✓ SQLite users.db backed up"
fi

if [ -f "/var/www/bridgeai/defi.db" ]; then
  sqlite3 /var/www/bridgeai/defi.db ".backup $BACKUP_DIR/defi.db.$TIMESTAMP"
  echo "[$(date)] ✓ SQLite defi.db backed up"
fi

# Backup PostgreSQL (if running)
if command -v pg_dump &> /dev/null && [ ! -z "$PG_HOST" ]; then
  PGPASSWORD="${PG_PASSWORD}" pg_dump \
    -h "${PG_HOST}" \
    -U "${PG_USER}" \
    -d "${PG_DATABASE:-bridgeai_prod}" \
    > "$BACKUP_DIR/postgres.$TIMESTAMP.sql"
  echo "[$(date)] ✓ PostgreSQL database backed up"
fi

# Create tarball of entire backup directory + project files
tar -czf "$BACKUP_DIR/bridgeai-backup-$TIMESTAMP.tar.gz" \
  -C /var/www/bridgeai \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=backups \
  .

echo "[$(date)] ✓ Project files archived: bridgeai-backup-$TIMESTAMP.tar.gz"

# Upload to S3
if command -v aws &> /dev/null; then
  aws s3 cp "$BACKUP_DIR/bridgeai-backup-$TIMESTAMP.tar.gz" \
    "s3://$S3_BUCKET/backups/$(date +%Y/%m/%d)/" \
    --storage-class INTELLIGENT_TIERING \
    --metadata "timestamp=$TIMESTAMP,hostname=$(hostname)"

  echo "[$(date)] ✓ Backup uploaded to S3: s3://$S3_BUCKET/backups/$(date +%Y/%m/%d)/bridgeai-backup-$TIMESTAMP.tar.gz"
else
  echo "[$(date)] ⚠ AWS CLI not found — backup stored locally only"
fi

# Clean up old local backups (keep 7 days)
find "$BACKUP_DIR" -name "bridgeai-backup-*.tar.gz" -mtime +$LOCAL_RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.db.*" -mtime +$LOCAL_RETENTION_DAYS -delete
echo "[$(date)] ✓ Cleaned up old backups (retention: $LOCAL_RETENTION_DAYS days)"

echo "[$(date)] Backup completed successfully"
