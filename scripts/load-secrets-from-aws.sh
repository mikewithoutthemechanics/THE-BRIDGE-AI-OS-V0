#!/bin/bash
# Load environment variables from AWS Secrets Manager
# This runs on VPS startup before the app starts
# Requires: AWS CLI installed, IAM credentials configured

set -e

# Configuration
SECRET_NAME="bridgeai/prod/env"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENV_FILE="/var/www/bridgeai/.env"

echo "[$(date)] Loading secrets from AWS Secrets Manager..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "[ERROR] AWS CLI not found. Install with: curl https://awscli.amazonaws.com/awscliv2.zip -o awscliv2.zip && unzip && ./aws/install"
    exit 1
fi

# Fetch secret
SECRET_JSON=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --region "$AWS_REGION" \
    --query SecretString \
    --output text 2>/dev/null) || {
    echo "[ERROR] Failed to fetch secret from AWS Secrets Manager"
    echo "[ERROR] Make sure:"
    echo "  1. AWS credentials are configured: aws configure"
    echo "  2. Secret exists: aws secretsmanager describe-secret --secret-id $SECRET_NAME"
    exit 1
}

# Convert JSON to .env format
echo "$SECRET_JSON" | jq -r 'to_entries | .[] | "\(.key)=\(.value)"' > "$ENV_FILE"

# Restrict permissions (read-only by app user)
chmod 400 "$ENV_FILE"
chown nobody:nobody "$ENV_FILE" 2>/dev/null || true

# Count loaded variables
VAR_COUNT=$(grep -c "=" "$ENV_FILE" || echo "0")

echo "[$(date)] ✓ Loaded $VAR_COUNT environment variables from AWS Secrets Manager"
echo "[$(date)] .env file written to: $ENV_FILE"

# Verify critical variables
for VAR in JWT_SECRET PAYFAST_MERCHANT_ID; do
    if grep -q "^$VAR=" "$ENV_FILE"; then
        echo "[$(date)] ✓ $VAR is configured"
    else
        echo "[WARNING] $VAR is NOT configured"
    fi
done

exit 0
