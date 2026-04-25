# BridgeAI PM2 Configuration Commands
# Run these on your VPS where PM2 is installed

# 1. Stop current process
pm2 delete orchestra-core

# 2. Restart with real credentials (replace PLACEHOLDER values)
SUPABASE_URL="https://your-project-id.supabase.co" \
SUPABASE_ANON_KEY="your-anon-key-here" \
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here" \
SMTP_HOST="smtp.brevo.com" \
SMTP_USER="your-smtp-username" \
SMTP_PASS="your-smtp-password" \
NOTION_TOKEN="your-notion-integration-token" \
JWT_SECRET="KEEP_EXISTING_VALUE" \
MASTER_SECRET="KEEP_EXISTING_VALUE" \
pm2 start ecosystem.config.js --only orchestra-core

# 3. Save the configuration
pm2 save

# 4. Verify environment variables are injected
pm2 logs orchestra-core --lines 5

# 5. Check process environment (should show real values, not empty)
cat /proc/$(pgrep -f 'orchestra-core')/environ | tr '\0' '\n' | grep -E "SUPABASE|SMTP|NOTION"