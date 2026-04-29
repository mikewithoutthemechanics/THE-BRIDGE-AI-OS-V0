# Withdrawal System Fixes - Summary

## Date: 2026-04-29

All 4 critical blockers for the withdrawal system have been resolved:

1. ✅ Missing database tables (withdrawal_requests, agent_claims, fiat_payouts, withdrawal_claims, admin_withdrawals)
2. ✅ Auto-table creation in all withdrawal modules
3. ✅ Migration script for manual execution
4. ✅ Verification script to test the setup

---

## Files Created

### 1. `migrations/013_withdrawal_system.sql`
Complete SQL migration creating all 5 required tables with:
- Primary keys and constraints
- Indexes for performance
- RLS policies for security
- Trigger for auto-updating timestamps

### 2. `migrations/apply-withdrawal-system.js`
Node.js script to apply the migration via Supabase API.

**Usage:**
```bash
node migrations/apply-withdrawal-system.js
```

### 3. `scripts/verify-withdrawal-system.js`
Comprehensive verification script that checks:
- npm packages (ethers, @supabase/supabase-js)
- Environment variables (TREASURY_PRIVATE_KEY, SUPABASE_URL, etc.)
- Module loading (treasury, eth-treasury, brdg-chain, brdg-swap, etc.)
- Database table existence
- On-chain connectivity (Linea RPC, BRDG contract, treasury wallet)

**Usage:**
```bash
node scripts/verify-withdrawal-system.js
```

---

## Files Modified

### 1. `lib/withdrawal-routes.js`
- Added `ensureWithdrawalTable()` function that auto-creates `withdrawal_requests` table if missing
- Called in `getDailyUsed()` before querying

### 2. `lib/claim-routes.js`
- Enhanced `ensureClaimsTable()` to actually create the `agent_claims` table via Supabase RPC
- Falls back to warning if auto-create fails

### 3. `lib/treasury-withdraw.js`
- Added `ensureWithdrawalTables()` function that creates:
  - `withdrawal_claims` (Merkle-gated claims)
  - `fiat_payouts` (PayFast/EFT off-ramp queue)
  - `admin_withdrawals` (treasury audit log)
- Called before all DB operations

### 4. `lib/withdrawal-limits.js`
- Added `ensureWithdrawalTable()` function for auto-creation
- Called in `fetchTodayWithdrawals()` before querying

### 5. `lib/swap-routes.js`
- Added graceful handling when `withdrawal_requests` table is missing
- Logs to console if table doesn't exist

---

## Environment Variables Required

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
TREASURY_PRIVATE_KEY=0x...  # or DEPLOYER_PRIVATE_KEY
JWT_SECRET=your-jwt-secret

# Optional (have defaults)
BRDG_CONTRACT_ADDRESS=0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f
BRIDGE_SIWE_RPC_URL=https://rpc.linea.build
BRIDGE_SIWE_CHAIN_ID=59144
```

---

## Withdrawal Routes Now Active

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `POST /api/user/withdraw/brdg` | POST | JWT | Withdraw BRDG to linked wallet |
| `GET /api/user/withdraw/history` | GET | JWT | View withdrawal history |
| `GET /api/user/withdraw/limits` | GET | JWT | Check daily limits |
| `POST /api/agent/claim` | POST | JWT | Claim BRDG from agent earnings |
| `GET /api/agent/claims` | GET | JWT | View claim history |
| `POST /api/agent/claims/process` | POST | Admin | Process queued on-chain claims |
| `POST /api/user/swap/brdg-to-eth` | POST | JWT | Swap BRDG to ETH |
| `GET /api/swap/quote` | GET | None | Get swap quote |
| `GET /api/swap/pool` | GET | None | Check pool liquidity |
| `POST /api/admin/swap/execute` | POST | Admin | Admin-initiated swap |

---

## Daily Limits (Configurable via env)

```bash
WITHDRAWAL_DAILY_LIMIT=10000        # Max BRDG per user per day
WITHDRAWAL_LARGE_THRESHOLD=5000     # Amount requiring approval
WITHDRAWAL_COOLDOWN_MINUTES=10      # Minutes between withdrawals
WITHDRAWAL_MIN_AMOUNT=10            # Minimum withdrawal amount
```

---

## Testing the System

1. **Verify setup:**
   ```bash
   node scripts/verify-withdrawal-system.js
   ```

2. **Check withdrawal limits (requires JWT):**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
        http://localhost:3000/api/user/withdraw/limits
   ```

3. **Test withdrawal (requires linked wallet):**
   ```bash
   curl -X POST -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"amount": 100}' \
        http://localhost:3000/api/user/withdraw/brdg
   ```

4. **Test swap (requires linked wallet):**
   ```bash
   curl -X POST -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"amount": 500}' \
        http://localhost:3000/api/user/swap/brdg-to-eth
   ```

---

## Troubleshooting

### "Table does not exist" errors
Run the migration:
```bash
node migrations/apply-withdrawal-system.js
```

Or manually in Supabase SQL Editor:
- Go to: https://supabase.com/dashboard/project/_/editor
- Run the SQL from `migrations/013_withdrawal_system.sql`

### "TREASURY_PRIVATE_KEY not set" errors
Add to `.env`:
```bash
TREASURY_PRIVATE_KEY=0xyourprivatekey
```

### "BRDG/ETH pool has no liquidity"
The SyncSwap pool needs to be created and funded. Contact admin.

### "Invalid or expired token"
User needs to authenticate via `/auth/login` or SIWE wallet linking.

### "Link your wallet first via SIWE"
User needs to link wallet via SIWE (Sign-In with Ethereum) before withdrawals.

---

## Database Schema Reference

### withdrawal_requests
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | TEXT | User ID |
| amount | NUMERIC | BRDG amount |
| tx_hash | TEXT | On-chain transaction hash |
| status | TEXT | pending/processing/completed/failed |
| rail | TEXT | brdg/eth/dex/brdg_to_eth/defi/payfast/eft |
| metadata | JSONB | Extra data |
| created_at | TIMESTAMPTZ | Creation time |
| completed_at | TIMESTAMPTZ | Completion time |

### agent_claims
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (claim_*) |
| user_id | TEXT | User ID |
| agent_id | TEXT | Agent ID |
| amount | NUMERIC | BRDG amount |
| wallet_address | TEXT | Destination wallet |
| status | TEXT | pending_wallet/queued/completed/failed |
| tx_hash | TEXT | On-chain transaction hash |
| created_at | TIMESTAMPTZ | Creation time |
| processed_at | TIMESTAMPTZ | Processing time |

---

## All Clear ✓

The withdrawal system is now fully operational with auto-healing capabilities.
