# DEPLOY NOW - Withdrawal System

## ✅ GitHub Push Complete!

All code has been pushed to: https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0

Commit: `8a2e038` - feat: Complete withdrawal system with auto-healing and deployment automation

---

## 🚀 Next Steps: Deploy to Supabase & VPS

### STEP 1: Deploy to Supabase (Database Tables)

**Option A: Automated (Recommended)**
```bash
node migrations/apply-withdrawal-system.js
```

**Option B: Manual SQL**
1. Go to: https://supabase.com/dashboard/project/_/editor
2. Copy and paste the contents of `migrations/013_withdrawal_system.sql`
3. Click "Run"

**Verify tables were created:**
```bash
curl -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  "$SUPABASE_URL/rest/v1/withdrawal_requests?limit=1"
```

---

### STEP 2: Deploy to VPS

**SSH into VPS and execute:**

```bash
# 1. Pull latest code from GitHub
ssh root@37.27.245.219 "cd /opt/bridge-os && git pull origin main"

# 2. Install any new dependencies
ssh root@37.27.245.219 "cd /opt/bridge-os && npm install"

# 3. Restart services
ssh root@37.27.245.219 "cd /opt/bridge-os && pm2 reload ecosystem.config.js"

# 4. Verify health
ssh root@37.27.245.219 "curl -s http://localhost:3000/health"
```

**Or use the automated deployment script:**
```bash
# From your local machine (requires SSH key setup)
./scripts/deploy-all.sh
```

---

### STEP 3: Verify Deployment

**Run the verification script:**
```bash
node scripts/verify-withdrawal-system.js
```

**Test the endpoints:**
```bash
# Test withdrawal limits (should return daily limits)
curl http://37.27.245.219:3000/api/user/withdraw/limits

# Test swap quote (should return ETH estimate)
curl "http://37.27.245.219:3000/api/swap/quote?amount=100"

# Test pool liquidity
curl http://37.27.245.219:3000/api/swap/pool

# Test health check
curl http://37.27.245.219:3000/health
```

---

## 📋 What Was Deployed

### New Files (12 total)
1. `migrations/013_withdrawal_system.sql` - Database migration
2. `migrations/apply-withdrawal-system.js` - Migration runner
3. `scripts/verify-withdrawal-system.js` - Verification tool
4. `scripts/deploy-all.sh` - Complete deployment script
5. `WITHDRAWAL_SYSTEM_FIXES.md` - Documentation
6. Updated `DEPLOYMENT_CHECKLIST.md` with Phase 11

### Modified Files (5 total)
1. `lib/withdrawal-routes.js` - Auto-table creation
2. `lib/claim-routes.js` - Auto-table creation
3. `lib/treasury-withdraw.js` - Auto-table creation
4. `lib/withdrawal-limits.js` - Auto-table creation
5. `lib/swap-routes.js` - Graceful handling

---

## 🔧 Environment Variables Required

Make sure these are set on the VPS in `/opt/bridge-os/.env`:

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
TREASURY_PRIVATE_KEY=0x... (or DEPLOYER_PRIVATE_KEY)
JWT_SECRET=your-jwt-secret

# Optional (have defaults)
BRDG_CONTRACT_ADDRESS=0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f
BRIDGE_SIWE_RPC_URL=https://rpc.linea.build
BRIDGE_SIWE_CHAIN_ID=59144
```

---

## 🎯 Withdrawal System Features

| Feature | Value |
|---------|-------|
| Daily Limit | 10,000 BRDG per user |
| Cooldown | 10 minutes between withdrawals |
| Minimum | 10 BRDG |
| Large Threshold | 5,000 BRDG (requires approval) |

### Active Endpoints

**User Withdrawals:**
- `POST /api/user/withdraw/brdg` - Withdraw BRDG to linked wallet
- `GET /api/user/withdraw/limits` - Check daily limits
- `GET /api/user/withdraw/history` - View withdrawal history

**Agent Claims:**
- `POST /api/agent/claim` - Claim BRDG from agent earnings
- `GET /api/agent/claims` - View claim history
- `POST /api/agent/claims/process` - Admin: Process queued claims

**Swaps:**
- `POST /api/user/swap/brdg-to-eth` - Swap BRDG to ETH
- `GET /api/swap/quote?amount=100` - Get swap quote
- `GET /api/swap/pool` - Check pool liquidity

---

## 🐛 Troubleshooting

### "Table does not exist" error
```bash
# Re-run the migration
node migrations/apply-withdrawal-system.js
```

### "TREASURY_PRIVATE_KEY not set"
```bash
# On VPS, add to .env
ssh root@37.27.245.219 "echo 'TREASURY_PRIVATE_KEY=0x...' >> /opt/bridge-os/.env"
ssh root@37.27.245.219 "pm2 reload ecosystem.config.js"
```

### "BRDG/ETH pool has no liquidity"
The SyncSwap pool needs to be created and funded. This requires admin action to add liquidity.

### "Invalid or expired token"
User needs to authenticate via `/auth/login` or link wallet via SIWE.

---

## 📊 Monitoring

After deployment, monitor these:

```bash
# Check withdrawal request count
curl -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  "$SUPABASE_URL/rest/v1/withdrawal_requests?select=count"

# Check agent claims queue
curl -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  "$SUPABASE_URL/rest/v1/agent_claims?status=eq.queued"

# Server logs
ssh root@37.27.245.219 "pm2 logs bridge-os --lines 50"
```

---

## ✅ Deployment Complete Checklist

- [ ] Code pushed to GitHub
- [ ] Database tables created in Supabase
- [ ] VPS updated with latest code
- [ ] Services restarted
- [ ] Health check passes
- [ ] Verification script passes
- [ ] Withdrawal endpoints respond

**Estimated Time:** 5-10 minutes

---

## 📞 Support

If deployment fails:
1. Check `WITHDRAWAL_SYSTEM_FIXES.md` for detailed docs
2. Run `node scripts/verify-withdrawal-system.js` for diagnostics
3. Check server logs: `ssh root@37.27.245.219 "pm2 logs"`
