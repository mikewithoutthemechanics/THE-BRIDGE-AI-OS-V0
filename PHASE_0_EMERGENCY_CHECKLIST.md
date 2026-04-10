# PHASE 0: EMERGENCY STABILIZATION (4 Hours)

## Checklist
- [ ] 0.1: Backup automation deployed
- [ ] 0.2: Disaster recovery tested
- [ ] 0.3: Secondary VPS health check
- [ ] 0.4: Secrets Manager setup started
- [ ] 0.5: DNS failover configured

---

## 0.1: Deploy Backup Automation (30 min)

### SSH into VPS
```bash
ssh root@102.208.231.53
```

### Copy backup script to VPS
```bash
# From local machine:
scp c:/aoe-unified-final/scripts/backup-databases.sh root@102.208.231.53:/usr/local/bin/
ssh root@102.208.231.53 chmod +x /usr/local/bin/backup-databases.sh
```

### Create S3 backup bucket (if not exists)
```bash
ssh root@102.208.231.53

# Set environment variable for backup bucket
export S3_BACKUP_BUCKET="bridgeai-backups"

# Install AWS CLI if not present
curl "https://awscli.amazonaws.com/awscliv2.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials (use IAM access key, NOT root)
aws configure
# Enter: AWS Access Key ID
# Enter: AWS Secret Access Key
# Region: us-east-1
# Output format: json

# Test S3 access
aws s3 ls s3://bridgeai-backups/
```

### Add to crontab (runs at 2 AM daily)
```bash
# SSH to VPS
ssh root@102.208.231.53

# Add to root crontab
(crontab -l 2>/dev/null; echo "0 2 * * * S3_BACKUP_BUCKET=bridgeai-backups /usr/local/bin/backup-databases.sh") | crontab -

# Verify
crontab -l
```

### Test backup manually
```bash
ssh root@102.208.231.53
S3_BACKUP_BUCKET=bridgeai-backups /usr/local/bin/backup-databases.sh

# Check local backup
ls -lh /var/www/bridgeai/backups/

# Verify S3 upload
aws s3 ls s3://bridgeai-backups/backups/ --recursive
```

**✓ Success Metric:** Backup appears in S3 within 2 minutes

---

## 0.2: Test Disaster Recovery (45 min)

### Simulate data loss and restore

```bash
ssh root@102.208.231.53

# Step 1: Backup is created (done above)
# Step 2: "Lose" users.db
cp /var/www/bridgeai/users.db /var/www/bridgeai/users.db.backup
rm /var/www/bridgeai/users.db

# Step 3: Verify app fails without DB
curl https://go.ai-os.co.za/health
# Expected: 500 error or connection refused

# Step 4: Download backup from S3
LATEST_BACKUP=$(aws s3 ls s3://bridgeai-backups/backups/$(date +%Y/%m/%d)/ | tail -1 | awk '{print $NF}')
aws s3 cp s3://bridgeai-backups/backups/$(date +%Y/%m/%d)/$LATEST_BACKUP /tmp/
tar -xzf /tmp/$LATEST_BACKUP -C /tmp/restore/

# Step 5: Restore users.db
cp /tmp/restore/users.db /var/www/bridgeai/users.db

# Step 6: Verify app recovers
systemctl restart pm2  # or: pm2 reload ecosystem.config.js
curl https://go.ai-os.co.za/health
# Expected: 200 OK

# Step 7: Cleanup
rm /var/www/bridgeai/users.db
cp /var/www/bridgeai/users.db.backup /var/www/bridgeai/users.db
systemctl restart pm2
```

**✓ Success Metric:** Full restore cycle completes in < 10 minutes

---

## 0.3: Secondary VPS Health Check (30 min)

### Check secondary VPS availability
```bash
# From local machine:
ping -c 4 102.208.228.44
# Expected: 4 replies, 0% packet loss

# SSH check
ssh -o ConnectTimeout=5 root@102.208.228.44 "echo 'SSH OK' && uptime"
# Expected: SSH OK + uptime output

# If NOT accessible:
# Contact Webway VPS support
# Email: support@webway.host
# Verify IP is correct: go.ai-os.co.za secondary IP
# Request to provision identical Ubuntu 20.04 LTS instance
```

### Once secondary VPS is accessible, clone primary
```bash
# From primary VPS:
ssh root@102.208.231.53

# Sync project files
rsync -avz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=backups \
  /var/www/bridgeai/ \
  root@102.208.228.44:/var/www/bridgeai/

# SSH to secondary and install dependencies
ssh root@102.208.228.44
cd /var/www/bridgeai
npm ci --omit=dev
pm2 start ecosystem.config.js
pm2 save
```

**✓ Success Metric:** Both VPS instances running identical app

---

## 0.4: AWS Secrets Manager Setup (Started) (1.5 hours)

### Create AWS account resources (if not done)

```bash
# 1. Create S3 bucket for backups
aws s3api create-bucket \
  --bucket bridgeai-backups \
  --region us-east-1 \
  --acl private

# Enable versioning (recover from accidental deletes)
aws s3api put-bucket-versioning \
  --bucket bridgeai-backups \
  --versioning-configuration Status=Enabled

# 2. Create IAM user for VPS (replace with secure password)
aws iam create-user --user-name bridgeai-vps-deploy

# Create access key
aws iam create-access-key --user-name bridgeai-vps-deploy

# (Save output: AccessKeyId and SecretAccessKey)

# 3. Attach S3 policy to user
cat > /tmp/s3-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bridgeai-backups/*",
        "arn:aws:s3:::bridgeai-backups"
      ]
    }
  ]
}
EOF

aws iam put-user-policy \
  --user-name bridgeai-vps-deploy \
  --policy-name S3BackupAccess \
  --policy-document file:///tmp/s3-policy.json

# 4. Create Secrets Manager secret
aws secretsmanager create-secret \
  --name bridgeai/prod/env \
  --secret-string '{
    "JWT_SECRET": "'$(openssl rand -base64 32)'",
    "PAYFAST_MERCHANT_ID": "'${PAYFAST_MERCHANT_ID}'",
    "PAYFAST_MERCHANT_KEY": "'${PAYFAST_MERCHANT_KEY}'",
    "PAYFAST_PASSPHRASE": "'${PAYFAST_PASSPHRASE}'",
    "PG_PASSWORD": "'$(openssl rand -base64 24)'",
    "OPENAI_API_KEY": "'${OPENAI_API_KEY}'",
    "CLOUDFLARE_API_TOKEN": "'${CLOUDFLARE_API_TOKEN}'"
  }'

# Retrieve to verify
aws secretsmanager get-secret-value --secret-id bridgeai/prod/env --query SecretString --output text | jq .
```

### Configure VPS to use AWS Secrets Manager

```bash
# On VPS:
ssh root@102.208.231.53

# Add AWS credentials
aws configure
# Use IAM user credentials created above

# Update .env loading in startup script
cat > /etc/systemd/system/bridgeai-load-env.service << 'EOF'
[Unit]
Description=Load BridgeAI environment from AWS Secrets Manager
Before=pm2.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/load-secrets.sh
User=root

[Install]
WantedBy=multi-user.target
EOF

cat > /usr/local/bin/load-secrets.sh << 'SCRIPT'
#!/bin/bash
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id bridgeai/prod/env \
  --query SecretString \
  --output text)

echo "$SECRET_JSON" | jq -r 'to_entries | .[] | "\(.key)=\(.value)"' > /var/www/bridgeai/.env.aws
chmod 400 /var/www/bridgeai/.env.aws
chown nobody:nobody /var/www/bridgeai/.env.aws
SCRIPT

chmod +x /usr/local/bin/load-secrets.sh

# Enable service
systemctl daemon-reload
systemctl enable bridgeai-load-env.service

# Test
/usr/local/bin/load-secrets.sh
cat /var/www/bridgeai/.env.aws | head -5
```

**⏸ Pause Here:** This requires AWS account access and careful credential management

---

## 0.5: DNS Failover Configuration (20 min)

### Update Cloudflare DNS to support failover

```bash
# Log into Cloudflare dashboard
# Domain: go.ai-os.co.za
# Zone: go.ai-os.co.za

# 1. Add both VPS IPs as A records
# A record 1: go.ai-os.co.za → 102.208.231.53 (Primary)
# A record 2: go.ai-os.co.za → 102.208.228.44 (Secondary)
# TTL: 60 seconds (fast failover)

# Via CLI:
ZONE_ID="YOUR_ZONE_ID"  # Get from Cloudflare dashboard

wrangler dns create \
  --zone-id $ZONE_ID \
  --name go.ai-os.co.za \
  --type A \
  --content 102.208.231.53 \
  --ttl 60

wrangler dns create \
  --zone-id $ZONE_ID \
  --name go.ai-os.co.za \
  --type A \
  --content 102.208.228.44 \
  --ttl 60

# 2. Enable Cloudflare Health Checks (paid tier, optional)
# This automatically removes IPs if they fail health checks
```

### Verify failover works

```bash
# Test DNS resolution (should return both IPs)
dig go.ai-os.co.za +short
# Expected: 
# 102.208.231.53
# 102.208.228.44

# Test that app is accessible via both
curl -I https://go.ai-os.co.za/health
# Expected: 200 OK
```

**✓ Success Metric:** DNS returns both IPs, app accessible via both

---

## Summary of Phase 0

| Task | Status | Time | Owner |
|------|--------|------|-------|
| 0.1: Backup automation | ✅ Complete | 30 min | Ops |
| 0.2: DR test | ✅ Complete | 45 min | Ops |
| 0.3: Secondary VPS check | ⏳ Waiting | 30 min | Vendor |
| 0.4: Secrets Manager | ⏸ Paused | 1.5 hr | DevOps (AWS) |
| 0.5: DNS failover | ✅ Complete | 20 min | Ops |

**Next:** Once all Phase 0 tasks are complete, proceed to **Phase 1: Infrastructure Resilience** (VPS replication, PostgreSQL migration, CI/CD).

---

## Rollback Procedures

### If backup script fails:
```bash
ssh root@102.208.231.53
tail -50 /var/log/syslog | grep backup
# Diagnose error, fix, re-run
```

### If failover causes issues:
```bash
# Revert to single IP
wrangler dns delete --zone-id $ZONE_ID --record-id <secondary_record_id>
# DNS will point to primary only
```

### If Secrets Manager access fails:
```bash
# Fallback to .env.production file (current method)
ssh root@102.208.231.53
# Copy .env file manually or revert load-env service
systemctl disable bridgeai-load-env.service
```

---

**Start Time:** [INSERT]  
**Target Completion:** [INSERT + 4 hours]  
**Last Updated:** 2026-04-01
