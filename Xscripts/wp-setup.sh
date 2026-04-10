#!/bin/bash
# Bridge AI OS — WP-CLI Setup Script
# Run on the server hosting bridge-ai-os.com and gateway.ai-os.co.za
# Usage: bash wp-setup.sh bridge-ai-os.com /var/www/bridge-ai-os.com/public_html brain@bridge-ai-os.com
#        bash wp-setup.sh gateway.ai-os.co.za /var/www/gateway.ai-os.co.za/public_html brain@gateway.ai-os.co.za

DOMAIN="${1:-bridge-ai-os.com}"
WP_PATH="${2:-/home/bridgeai/domains/$DOMAIN/public_html}"
BRAIN_EMAIL="${3:-brain@$DOMAIN}"
BRAIN_USER="bridge-brain"
SITE_URL="https://$DOMAIN"

set -e

# ── Download WP-CLI if not present ────────────────────────────────────────────
if ! command -v wp &>/dev/null; then
  echo "[1/6] Downloading WP-CLI..."
  curl -sL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp
  chmod +x /usr/local/bin/wp
  wp --info | head -3
else
  echo "[1/6] WP-CLI already installed: $(wp --version)"
fi

# ── Install WordPress if not present ─────────────────────────────────────────
if [ ! -f "$WP_PATH/wp-config.php" ]; then
  echo "[2/6] Downloading WordPress..."
  mkdir -p "$WP_PATH"
  wp core download --path="$WP_PATH" --allow-root

  echo "      Creating wp-config.php..."
  read -rp "DB name: " DB_NAME
  read -rp "DB user: " DB_USER
  read -rsp "DB pass: " DB_PASS; echo
  wp config create \
    --path="$WP_PATH" \
    --dbname="$DB_NAME" \
    --dbuser="$DB_USER" \
    --dbpass="$DB_PASS" \
    --dbhost=localhost \
    --allow-root

  echo "      Installing WordPress..."
  ADMIN_PASS=$(wp eval 'echo wp_generate_password(16);' --allow-root 2>/dev/null || openssl rand -base64 12)
  wp core install \
    --path="$WP_PATH" \
    --url="$SITE_URL" \
    --title="Bridge AI OS" \
    --admin_user="bridge-brain" \
    --admin_email="$BRAIN_EMAIL" \
    --admin_password="$ADMIN_PASS" \
    --allow-root
  echo "      WordPress installed."
else
  echo "[2/6] WordPress already installed at $WP_PATH"
fi

# ── Create brain user if not present ─────────────────────────────────────────
echo "[3/6] Ensuring $BRAIN_USER user exists..."
if ! wp user get "$BRAIN_USER" --path="$WP_PATH" --allow-root &>/dev/null; then
  BRAIN_PASS=$(openssl rand -base64 16)
  wp user create "$BRAIN_USER" "$BRAIN_EMAIL" \
    --role=administrator \
    --user_pass="$BRAIN_PASS" \
    --path="$WP_PATH" \
    --allow-root
  echo "      User $BRAIN_USER created."
else
  echo "      User $BRAIN_USER already exists."
fi

BRAIN_ID=$(wp user get "$BRAIN_USER" --field=ID --path="$WP_PATH" --allow-root)

# ── Generate Application Password ────────────────────────────────────────────
echo "[4/6] Generating application password for $BRAIN_USER..."
APP_PASS=$(wp user application-password create "$BRAIN_ID" bridge-brain \
  --porcelain \
  --path="$WP_PATH" \
  --allow-root 2>/dev/null)

if [ -z "$APP_PASS" ]; then
  echo "      Retrying with user login..."
  APP_PASS=$(wp user application-password create "$BRAIN_USER" bridge-brain \
    --porcelain \
    --path="$WP_PATH" \
    --allow-root)
fi

# ── Enable REST API ───────────────────────────────────────────────────────────
echo "[5/6] Enabling REST API..."
wp option update blog_public 1 --path="$WP_PATH" --allow-root

# ── Output ────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo "  Bridge AI Brain — WP Setup Complete"
echo "  Domain : $DOMAIN"
echo "  User   : $BRAIN_USER ($BRAIN_EMAIL)"
echo "  App PW : $APP_PASS"
echo "════════════════════════════════════════════"
echo ""
echo "[6/6] Add this to your .env:"
ENV_KEY=$(echo "$DOMAIN" | tr '.-' '_' | tr '[:lower:]' '[:upper:]')
echo "WP_${ENV_KEY}_URL=$SITE_URL"
echo "WP_${ENV_KEY}_USER=$BRAIN_USER"
echo "WP_${ENV_KEY}_APP_PASS=$APP_PASS"
echo ""
echo "Then run: vercel env add WP_${ENV_KEY}_APP_PASS production"
