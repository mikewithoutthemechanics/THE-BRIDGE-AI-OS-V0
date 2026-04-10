# BRIDGE AI OS — REAL SYSTEM BLUEPRINT
## From Simulation to Sovereign Financial System

**Date**: 2026-04-08
**Status**: EXECUTION READY
**Target**: Linea L2 (Chain 59144) + PostgreSQL + Modular Services

---

## KILL LIST (DELETE IMMEDIATELY)

These must be removed before any new code ships:

```
# Hardcoded financial state
brain.js:131         → state.treasury = { balance: 0, earned: 0, spent: 4210.50 }
api/index.js:190     → const TREASURY_SEED = 1389208.00
brain.js:1095-1097   → address: '0x...' placeholder crypto rails
brain.js:1109-1112   → hardcoded BRDG/ETH: 0.00042, BRDG/USDT: 1.28, BRDG/SOL: 0.0072
brain.js:1119-1122   → contracts: { treasury: '0xTreasury...', token: '0xBRDG...' }

# Simulated DEX
brain.js:1171-1240   → entire _dexPools() function (Math.max formulas)
brain.js:1183-1210   → all /api/dex/* endpoints returning hardcoded data

# Simulated trading
brain.js:872         → pnlDelta = +(Math.random() * 80 - 15).toFixed(2)
brain.js:833-882     → entire BossBot P&L simulation loop

# Simulated UBI
api/index.js:2430-2441  → hardcoded 47 wallets, 12.50 ZAR claim

# Simulated staking
brain.js:1262-1264   → total_staked = max(earned * 13.5, 2500000), apy = 0.15

# Simulated revenue metrics
brain-business.js:309-316  → hardcoded marketing funnel (2450/587/234/142/85/62)
brain-business.js:336-345  → hardcoded agent workforce stats
brain-business.js:350-354  → hardcoded HR team

# In-memory financial state
brain-agents.js:65-75      → wallets Map() (in-memory agent balances)
brain-agents.js:125-136    → /api/agents/pay mutating in-memory state
brain-business.js:19-33    → all in-memory Map() stores for financial data

# Fake compliance
brain-business.js:283-288  → hardcoded compliance status
```

---

## 1. SMART CONTRACT SPECIFICATIONS

### 1A. BRDG Token (ERC-20 on Linea)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BRDGToken is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18;  // 100M fixed cap
    
    // Treasury receives initial allocation
    // Remaining supply mintable only by governance
    constructor(address treasury) ERC20("Bridge Token", "BRDG") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, treasury);
        
        // Initial distribution:
        // 10M to treasury (operations + liquidity seeding)
        // 5M to staking rewards pool (locked in StakingVault)
        // Remaining 85M mintable via governance over time
        _mint(treasury, 10_000_000 * 1e18);
    }
    
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Cap exceeded");
        _mint(to, amount);
    }
    
    // Burn on every task execution (deflationary pressure)
    // 1% of task fee is burned
    function burnFromFee(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
```

**Deployment parameters**:
- Chain: Linea (59144)
- RPC: https://rpc.linea.build
- Treasury wallet: KeyForge-derived (0xF22Bc18487764FEe106ca5Fb2EE27b11FDcB3756)
- Initial supply: 10M BRDG to treasury
- Max supply: 100M (hard cap, no inflation beyond)

**Token economics**:
- **Mint**: Only MINTER_ROLE (treasury + governance multisig)
- **Burn**: 1% of every task fee auto-burned (deflationary)
- **Velocity control**: Staking locks reduce circulating supply
- **Price discovery**: AMM pool only (no admin price setting)

### 1B. Treasury Vault Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TreasuryVault is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    IERC20 public immutable brdg;
    
    // Allocation buckets (on-chain enforcement)
    uint256 public opsBalance;
    uint256 public liquidityBalance;
    uint256 public reserveBalance;
    uint256 public founderBalance;
    
    // Split ratios (basis points, must sum to 10000)
    uint16 public opsPct = 4000;       // 40%
    uint16 public liquidityPct = 2500; // 25%
    uint16 public reservePct = 2000;   // 20%
    uint16 public founderPct = 1500;   // 15%
    
    event Deposited(address indexed from, uint256 amount, uint256 ops, uint256 liq, uint256 res, uint256 founder);
    event Withdrawn(string bucket, address indexed to, uint256 amount);
    event SplitUpdated(uint16 ops, uint16 liq, uint16 res, uint16 founder);
    
    constructor(address _brdg) {
        brdg = IERC20(_brdg);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }
    
    // Receive ETH directly
    receive() external payable {
        // ETH goes to reserve bucket
        reserveBalance += msg.value;
    }
    
    // Deposit BRDG — auto-splits into buckets
    function deposit(uint256 amount) external {
        require(brdg.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        uint256 ops = (amount * opsPct) / 10000;
        uint256 liq = (amount * liquidityPct) / 10000;
        uint256 res = (amount * reservePct) / 10000;
        uint256 founder = amount - ops - liq - res; // remainder to founder (avoids rounding loss)
        
        opsBalance += ops;
        liquidityBalance += liq;
        reserveBalance += res;
        founderBalance += founder;
        
        emit Deposited(msg.sender, amount, ops, liq, res, founder);
    }
    
    // Withdraw from specific bucket (operator only)
    function withdrawOps(address to, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        require(amount <= opsBalance, "Exceeds ops balance");
        opsBalance -= amount;
        require(brdg.transfer(to, amount), "Transfer failed");
        emit Withdrawn("ops", to, amount);
    }
    
    function withdrawETH(address payable to, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        require(amount <= reserveBalance, "Exceeds reserve");
        reserveBalance -= amount;
        to.transfer(amount);
        emit Withdrawn("reserve_eth", to, amount);
    }
    
    function withdrawFounder(address to, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        require(amount <= founderBalance, "Exceeds founder balance");
        founderBalance -= amount;
        require(brdg.transfer(to, amount), "Transfer failed");
        emit Withdrawn("founder", to, amount);
    }
    
    // Update split ratios (admin only, must sum to 10000)
    function updateSplit(uint16 _ops, uint16 _liq, uint16 _res, uint16 _founder) 
        external onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(_ops + _liq + _res + _founder == 10000, "Must sum to 10000");
        opsPct = _ops;
        liquidityPct = _liq;
        reservePct = _res;
        founderPct = _founder;
        emit SplitUpdated(_ops, _liq, _res, _founder);
    }
    
    // View total BRDG held
    function totalBRDG() external view returns (uint256) {
        return brdg.balanceOf(address(this));
    }
}
```

### 1C. Staking Vault Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract StakingVault is Ownable {
    IERC20 public immutable brdg;
    
    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 lockDays;
        bool withdrawn;
    }
    
    mapping(address => Stake[]) public stakes;
    
    uint256 public totalStaked;
    uint256 public rewardPool;       // Funded from real fees only
    uint256 public totalDistributed;
    
    // No fixed APY — rewards are proportional share of rewardPool
    // Pool is funded by: DEX fees, task fees, buyback engine
    
    event Staked(address indexed user, uint256 amount, uint256 lockDays, uint256 stakeIndex);
    event Unstaked(address indexed user, uint256 principal, uint256 reward, uint256 stakeIndex);
    event RewardsFunded(uint256 amount, string source);
    
    constructor(address _brdg) Ownable(msg.sender) {
        brdg = IERC20(_brdg);
    }
    
    // Fund the reward pool (called by treasury/fee router)
    function fundRewards(uint256 amount, string calldata source) external {
        require(brdg.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        rewardPool += amount;
        emit RewardsFunded(amount, source);
    }
    
    // Stake BRDG with lock period
    function stake(uint256 amount, uint256 lockDays) external {
        require(amount > 0, "Zero amount");
        require(lockDays >= 30, "Min 30 days");
        require(lockDays <= 365, "Max 365 days");
        require(brdg.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        stakes[msg.sender].push(Stake({
            amount: amount,
            startTime: block.timestamp,
            lockDays: lockDays,
            withdrawn: false
        }));
        
        totalStaked += amount;
        emit Staked(msg.sender, amount, lockDays, stakes[msg.sender].length - 1);
    }
    
    // Unstake after lock period — reward = proportional share of pool
    function unstake(uint256 stakeIndex) external {
        Stake storage s = stakes[msg.sender][stakeIndex];
        require(!s.withdrawn, "Already withdrawn");
        require(block.timestamp >= s.startTime + (s.lockDays * 1 days), "Still locked");
        
        // Reward proportional to: (stake / totalStaked) * (lockDays / 365) * rewardPool
        // Longer locks get proportionally more reward
        uint256 weight = (s.amount * s.lockDays) / 365;
        uint256 totalWeight = totalStaked > 0 ? totalStaked : 1;
        uint256 reward = (rewardPool * weight) / (totalWeight * 2); // cap at 50% of pool per unstake
        
        if (reward > rewardPool) reward = rewardPool;
        
        s.withdrawn = true;
        totalStaked -= s.amount;
        rewardPool -= reward;
        totalDistributed += reward;
        
        require(brdg.transfer(msg.sender, s.amount + reward), "Transfer failed");
        emit Unstaked(msg.sender, s.amount, reward, stakeIndex);
    }
    
    // View pending reward estimate
    function pendingReward(address user, uint256 stakeIndex) external view returns (uint256) {
        Stake storage s = stakes[user][stakeIndex];
        if (s.withdrawn || totalStaked == 0) return 0;
        uint256 weight = (s.amount * s.lockDays) / 365;
        uint256 reward = (rewardPool * weight) / (totalStaked * 2);
        return reward > rewardPool ? rewardPool : reward;
    }
    
    // View all stakes for a user
    function getStakes(address user) external view returns (Stake[] memory) {
        return stakes[user];
    }
    
    // Current effective APY (annualized, for display only)
    function effectiveAPY() external view returns (uint256) {
        if (totalStaked == 0) return 0;
        // rewardPool distributed over ~1 year = APY
        return (rewardPool * 10000) / totalStaked; // basis points
    }
}
```

---

## 2. DEX + LIQUIDITY DEPLOYMENT PLAN

### Strategy: Use existing Linea DEX infrastructure

Linea has deployed Uniswap V3 forks and SyncSwap. Instead of deploying our own AMM:

**Step 1**: Deploy BRDG ERC-20 on Linea
**Step 2**: Create BRDG/ETH pool on SyncSwap (or LynexFi — Linea-native DEX)
**Step 3**: Seed liquidity from treasury

### Liquidity Seeding Calculation

```
Treasury ETH allocation: 25% of holdings
Initial seed: 1 ETH + equivalent BRDG at target price

Target initial price: 1 BRDG = 0.0001 ETH (~$0.36 at ETH=$3600)
Pool: 1 ETH paired with 10,000 BRDG

This gives:
- Pool TVL: ~$7,200
- BRDG fully diluted (10M circulating): $3.6M market cap
- Depth: ~$3,600 per side (sufficient for <$100 trades with <2% slippage)
```

### Price Oracle Integration

```javascript
// lib/price-oracle.js — reads AMM pool state, not constants
const { ethers } = require('ethers');

const POOL_ABI = [
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

async function getBRDGPrice(provider, poolAddress, brdgAddress) {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const [reserve0, reserve1] = await pool.getReserves();
  const token0 = await pool.token0();
  
  // Determine which reserve is BRDG
  const [brdgReserve, ethReserve] = token0.toLowerCase() === brdgAddress.toLowerCase()
    ? [reserve0, reserve1]
    : [reserve1, reserve0];
  
  // Price = ethReserve / brdgReserve
  const price = Number(ethers.formatEther(ethReserve)) / Number(ethers.formatEther(brdgReserve));
  return { priceInETH: price, brdgReserve: ethers.formatEther(brdgReserve), ethReserve: ethers.formatEther(ethReserve) };
}

module.exports = { getBRDGPrice };
```

### Buyback Engine

```javascript
// services/buyback-engine.js
// Runs after every fiat payment: uses 10% of revenue to market-buy BRDG

async function executeBuyback(ethAmount, router, brdgAddress, wethAddress, treasuryWallet) {
  const tx = await router.swapExactETHForTokens(
    0, // min out (use slippage check in production)
    [wethAddress, brdgAddress],
    treasuryWallet.address,
    Math.floor(Date.now() / 1000) + 300, // 5 min deadline
    { value: ethers.parseEther(ethAmount) }
  );
  return tx;
}
```

---

## 3. PAYMENT RAIL → CRYPTO CONVERSION ARCHITECTURE

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  PayFast     │────▶│  Treasury        │────▶│  On-Chain        │
│  Webhook     │     │  Service         │     │  Actions         │
│  (ZAR)       │     │  (PostgreSQL)    │     │  (Linea)         │
└──────────────┘     └────────┬─────────┘     └─────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │ For each payment:  │
                    │                    │
                    │ 1. Record to       │
                    │    double-entry    │
                    │    ledger          │
                    │                    │
                    │ 2. Split:          │
                    │    40% → ops       │
                    │    25% → liquidity │
                    │    20% → reserve   │
                    │    15% → founder   │
                    │                    │
                    │ 3. Liquidity 25%:  │
                    │    → Convert ZAR   │
                    │      to ETH (Luno) │
                    │    → 50% buy BRDG  │
                    │    → 50% add LP    │
                    │                    │
                    │ 4. Founder 15%:    │
                    │    → Queue payout  │
                    │    → Execute via   │
                    │      PayFast/EFT   │
                    └────────────────────┘
```

### Fiat → Crypto Pipeline

```javascript
// services/fiat-crypto-bridge.js

// Step 1: PayFast webhook confirms ZAR payment
// Step 2: Record in ledger
// Step 3: For liquidity allocation, use Luno API (ZA crypto exchange)

const LUNO_API = 'https://api.luno.com/api/1';

async function convertZARtoETH(zarAmount) {
  // Luno is a South African exchange — direct ZAR/ETH pair
  // Requires: LUNO_API_KEY, LUNO_API_SECRET in env
  
  const response = await fetch(`${LUNO_API}/postorder`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(
        `${process.env.LUNO_API_KEY}:${process.env.LUNO_API_SECRET}`
      ).toString('base64'),
    },
    body: new URLSearchParams({
      pair: 'ETHZAR',
      type: 'BUY',
      counter_volume: zarAmount.toFixed(2), // ZAR amount to spend
    }),
  });
  
  return response.json();
}

// Step 4: ETH arrives in Luno → withdraw to Linea treasury wallet
async function withdrawETHtoLinea(ethAmount) {
  // Luno supports Linea L2 withdrawals
  const response = await fetch(`${LUNO_API}/send`, {
    method: 'POST',
    headers: { /* auth */ },
    body: new URLSearchParams({
      amount: ethAmount,
      currency: 'ETH',
      address: process.env.TREASURY_ETH_ADDRESS, // 0xF22Bc...
      // Linea network
    }),
  });
  return response.json();
}
```

---

## 4. TREASURY ACCOUNTING MODEL (EXACT SQL)

### Double-Entry Ledger Schema

```sql
-- ============================================================
-- BRIDGE AI OS — REAL TREASURY SCHEMA
-- PostgreSQL 15+
-- Double-entry accounting: every transaction has debit = credit
-- ============================================================

-- Account types: asset, liability, equity, revenue, expense
CREATE TABLE accounts (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    subtype         TEXT,  -- treasury, user, agent, reserve, founder, liquidity
    currency        TEXT NOT NULL DEFAULT 'BRDG',
    owner_id        TEXT,  -- user/agent ID if applicable
    chain_address   TEXT,  -- on-chain address if applicable (0x...)
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Core ledger: immutable transaction log
-- RULE: SUM(debit) = SUM(credit) for every tx_group
CREATE TABLE ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    tx_group        UUID NOT NULL,        -- groups debit+credit pair
    account_id      TEXT NOT NULL REFERENCES accounts(id),
    entry_type      TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount          NUMERIC(28, 8) NOT NULL CHECK (amount > 0),
    asset           TEXT NOT NULL DEFAULT 'BRDG',  -- BRDG, ETH, ZAR, USD
    reference       TEXT,                 -- payment_id, tx_hash, invoice_id
    description     TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    -- Immutability: no updates, no deletes (enforced by policy)
    CONSTRAINT positive_amount CHECK (amount > 0)
);

-- Materialized balance view (refreshed on each transaction)
CREATE MATERIALIZED VIEW account_balances AS
SELECT 
    a.id AS account_id,
    a.name,
    a.type,
    a.subtype,
    a.currency,
    a.chain_address,
    COALESCE(SUM(CASE WHEN le.entry_type = 'debit' THEN le.amount ELSE 0 END), 0) AS total_debits,
    COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE 0 END), 0) AS total_credits,
    COALESCE(SUM(CASE 
        WHEN a.type IN ('asset', 'expense') AND le.entry_type = 'debit' THEN le.amount
        WHEN a.type IN ('asset', 'expense') AND le.entry_type = 'credit' THEN -le.amount
        WHEN a.type IN ('liability', 'equity', 'revenue') AND le.entry_type = 'credit' THEN le.amount
        WHEN a.type IN ('liability', 'equity', 'revenue') AND le.entry_type = 'debit' THEN -le.amount
        ELSE 0
    END), 0) AS balance
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id
GROUP BY a.id, a.name, a.type, a.subtype, a.currency, a.chain_address;

CREATE UNIQUE INDEX idx_account_balances_id ON account_balances(account_id);

-- Payment records (external inflows)
CREATE TABLE payments (
    id              BIGSERIAL PRIMARY KEY,
    external_id     TEXT UNIQUE,          -- PayFast pf_payment_id, Paystack reference
    provider        TEXT NOT NULL,         -- payfast, paystack, crypto, stripe
    amount          NUMERIC(18, 2) NOT NULL,
    currency        TEXT NOT NULL,         -- ZAR, NGN, USD, ETH
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
    payer_email     TEXT,
    payer_name      TEXT,
    item_ref        TEXT,                 -- subscription_id, task_id, invoice_id
    tx_group        UUID,                 -- links to ledger_entries
    webhook_payload JSONB,
    signature_valid BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ
);

-- On-chain transaction log (mirroring)
CREATE TABLE chain_transactions (
    id              BIGSERIAL PRIMARY KEY,
    chain           TEXT NOT NULL DEFAULT 'linea',
    chain_id        INTEGER NOT NULL DEFAULT 59144,
    tx_hash         TEXT UNIQUE NOT NULL,
    from_address    TEXT NOT NULL,
    to_address      TEXT NOT NULL,
    value_wei       TEXT NOT NULL,         -- stored as string (uint256)
    value_eth       NUMERIC(28, 18),
    asset           TEXT DEFAULT 'ETH',    -- ETH, BRDG
    block_number    BIGINT,
    gas_used        TEXT,
    status          TEXT CHECK (status IN ('pending', 'confirmed', 'failed')),
    tx_group        UUID,                 -- links to ledger
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions (real recurring billing)
CREATE TABLE subscriptions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL,
    plan            TEXT NOT NULL CHECK (plan IN ('free', 'starter', 'pro', 'enterprise', 'platform')),
    price_zar       NUMERIC(10, 2) NOT NULL,
    price_usd       NUMERIC(10, 2),
    billing_cycle   TEXT DEFAULT 'monthly',
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
    payment_method  TEXT,                 -- payfast, stripe, crypto
    payfast_token   TEXT,                 -- PayFast subscription token for recurring
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at    TIMESTAMPTZ
);

-- Task marketplace (real work, real payments)
CREATE TABLE tasks (
    id              BIGSERIAL PRIMARY KEY,
    poster_id       TEXT NOT NULL,         -- user who posted
    executor_id     TEXT,                  -- agent/user who executes
    title           TEXT NOT NULL,
    description     TEXT,
    task_type       TEXT NOT NULL,         -- inference, scraping, coding, analysis
    price_brdg      NUMERIC(18, 8) NOT NULL,
    price_zar       NUMERIC(10, 2),
    status          TEXT DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'executing', 'completed', 'disputed', 'cancelled')),
    result          JSONB,                -- execution output
    fee_burned      NUMERIC(18, 8) DEFAULT 0,  -- 1% burn
    fee_treasury    NUMERIC(18, 8) DEFAULT 0,  -- 14% to treasury
    tx_group        UUID,                 -- payment ledger link
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- Reconciliation checks
CREATE TABLE reconciliation_log (
    id              BIGSERIAL PRIMARY KEY,
    check_type      TEXT NOT NULL,         -- ledger_balance, chain_balance, payment_match
    account_id      TEXT,
    expected        NUMERIC(28, 8),
    actual          NUMERIC(28, 8),
    drift           NUMERIC(28, 8),
    status          TEXT CHECK (status IN ('ok', 'warning', 'critical')),
    action_taken    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (immutable)
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    actor           TEXT NOT NULL,          -- user_id, system, admin
    action          TEXT NOT NULL,          -- payment.confirmed, withdrawal.executed, etc.
    resource        TEXT,                   -- account_id, payment_id, etc.
    detail          JSONB,
    ip_address      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED ACCOUNTS
-- ============================================================
INSERT INTO accounts (id, name, type, subtype, currency, chain_address) VALUES
    ('treasury-ops',       'Operations',     'asset', 'treasury',  'ZAR', NULL),
    ('treasury-liquidity', 'Liquidity Pool', 'asset', 'treasury',  'ETH', NULL),
    ('treasury-reserve',   'Reserve',        'asset', 'treasury',  'ETH', '0xF22Bc18487764FEe106ca5Fb2EE27b11FDcB3756'),
    ('treasury-founder',   'Founder',        'asset', 'treasury',  'ZAR', NULL),
    ('treasury-staking',   'Staking Rewards','asset', 'treasury',  'BRDG', NULL),
    ('revenue-payfast',    'PayFast Revenue','revenue','payments', 'ZAR', NULL),
    ('revenue-crypto',     'Crypto Revenue', 'revenue','payments', 'ETH', NULL),
    ('revenue-subscriptions','Subscription Revenue','revenue','payments','ZAR', NULL),
    ('revenue-tasks',      'Task Fees',      'revenue','marketplace','BRDG', NULL),
    ('expense-ops',        'Operations Cost','expense','operations','ZAR', NULL),
    ('expense-api',        'API Costs',      'expense','operations','USD', NULL),
    ('expense-founder',    'Founder Draws',  'expense','distributions','ZAR', NULL);

-- ============================================================
-- INVARIANT CHECKS (run as scheduled job)
-- ============================================================

-- Check 1: Ledger balance (debits = credits per tx_group)
-- SELECT tx_group, SUM(CASE WHEN entry_type='debit' THEN amount ELSE -amount END) AS net
-- FROM ledger_entries GROUP BY tx_group HAVING ABS(net) > 0.00000001;

-- Check 2: On-chain vs ledger (treasury reserve account)
-- Compare chain_transactions sum vs account_balances for treasury-reserve

-- Check 3: No negative balances on asset accounts
-- SELECT * FROM account_balances WHERE type = 'asset' AND balance < 0;
```

---

## 5. SERVICE ARCHITECTURE

```
                    ┌─────────────────────────────────────────┐
                    │              LOAD BALANCER               │
                    │         (nginx / Cloudflare)             │
                    └──────────────┬──────────────────────────┘
                                   │
                    ┌──────────────┴──────────────────────────┐
                    │          API GATEWAY (:8080)             │
                    │  - Stateless                             │
                    │  - JWT/KeyForge validation               │
                    │  - Rate limiting (per-user)              │
                    │  - CORS (specific origins only)          │
                    │  - Request routing                       │
                    └───┬──────────┬──────────┬───────────────┘
                        │          │          │
              ┌─────────┴──┐  ┌───┴────┐  ┌──┴──────────┐
              │ TREASURY   │  │ DEFI   │  │ EXECUTION   │
              │ SERVICE    │  │ SERVICE│  │ ENGINE      │
              │ (:8001)    │  │ (:8002)│  │ (:8003)     │
              └──────┬─────┘  └───┬────┘  └──────┬──────┘
                     │            │               │
                     │            │               │
              ┌──────┴─────┐  ┌──┴──────┐  ┌─────┴─────┐
              │ PostgreSQL │  │ Linea   │  │ Redis     │
              │ (primary)  │  │ RPC     │  │ (cache)   │
              │ + replicas │  │ (L2)    │  │           │
              └────────────┘  └─────────┘  └───────────┘
                     │
              ┌──────┴─────┐
              │ BullMQ     │
              │ (job queue)│
              └────────────┘
```

### Service Responsibilities

**API Gateway** (gateway-service/)
- Stateless request router
- JWT + KeyForge token validation on every request
- Per-user rate limiting via Redis
- CORS: `['https://go.ai-os.co.za', 'https://wall.bridge-ai-os.com']` only
- No financial state. No in-memory data

**Treasury Service** (treasury-service/)
- SOLE owner of financial state
- Double-entry ledger writes
- Payment webhook processing (PayFast, Paystack, crypto)
- Subscription management
- Reconciliation jobs
- Founder payout execution
- NEVER exposes raw DB mutations via API

**DeFi Service** (defi-service/)
- On-chain interactions via ethers.js
- BRDG token reads (balanceOf, totalSupply)
- DEX price feeds (pool reserves)
- Staking contract interactions
- Treasury vault deposits/withdrawals
- Buyback engine execution

**Execution Engine** (execution-service/)
- Task marketplace
- Agent dispatch and monitoring
- Task pricing (supply/demand)
- Completion verification
- Payment routing to treasury service

---

## 6. REVENUE + INCENTIVE MODEL

### Value Flow (Fully Grounded)

```
EXTERNAL MONEY IN
├── PayFast (ZAR subscriptions, one-time)
├── Paystack (NGN/ZAR)
├── Crypto deposits (ETH to treasury wallet)
└── Task payments (BRDG or ZAR)
        │
        ▼
TREASURY SERVICE (PostgreSQL ledger)
├── 40% → Operations (ZAR bank account, real costs)
├── 25% → Liquidity (→ Luno → ETH → DEX LP)
│         ├── 50% market-buy BRDG (demand pressure)
│         └── 50% add BRDG+ETH to LP (depth)
├── 20% → Reserve (ETH in Linea wallet)
└── 15% → Founder (real ZAR payout via EFT/PayFast)
        │
        ▼
DEX (SyncSwap/Lynex on Linea)
├── Users trade BRDG/ETH
├── 0.3% fee per swap
│   ├── 50% → LP providers
│   └── 50% → StakingVault.fundRewards()
└── Price discovery: AMM reserves only
        │
        ▼
STAKING VAULT (on-chain contract)
├── Users lock BRDG (30-365 days)
├── Rewards = proportional share of funded pool
├── NO fixed APY
├── Effective yield: depends on fees + buybacks
└── Longer lock → larger share of rewards
        │
        ▼
TASK MARKETPLACE
├── User posts task → pays BRDG (or ZAR → auto-buy BRDG)
├── Agent executes → delivers result
├── On completion:
│   ├── 85% → agent wallet (on-chain BRDG)
│   ├── 1% → burn (deflationary)
│   └── 14% → treasury vault
└── Failed/disputed → escrow refund
```

### Token Sink Summary

| Sink | Mechanism | Effect |
|------|-----------|--------|
| Task fee burn | 1% of every task payment burned | Deflationary |
| Staking lock | 30-365 day lock reduces circulating supply | Velocity reduction |
| Buyback | 25% of all revenue buys BRDG from DEX | Demand pressure |
| LP lock | Liquidity tokens locked in treasury vault | Permanent depth |

### Revenue Sources (Real Only)

| Source | Mechanism | Expected |
|--------|-----------|----------|
| Subscriptions | PayFast recurring billing | Primary |
| Task marketplace fees | 15% of task value (14% treasury + 1% burn) | Growing |
| DEX trading fees | 0.3% per swap, 50% to protocol | Passive |
| API metering | Per-request billing above free tier | Future |

---

## 7. SECURITY ARCHITECTURE

### Key Management

```
CURRENT (broken):
  .env → JWT_SECRET → KF_MASTER → ETH private key
  (Single compromise = total loss)

TARGET:
  ┌─────────────────────────────────────────┐
  │  Secrets Manager (PM2 ecosystem env)    │
  │  ├── JWT_SECRET (rotated monthly)       │
  │  ├── KEYFORGE_MASTER (separate seed)    │
  │  └── PAYFAST_KEYS (rotated yearly)      │
  └─────────────────────────────────────────┘
  
  ┌─────────────────────────────────────────┐
  │  ETH Treasury Key (SEPARATE)            │
  │  ├── NOT derived from app secrets       │
  │  ├── Generated from dedicated seed      │
  │  ├── Stored in encrypted keystore       │
  │  └── Requires password to unlock        │
  └─────────────────────────────────────────┘
```

### Auth on Every Endpoint

```javascript
// middleware/auth.js — applied to ALL routes except /health and webhooks
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });
  
  // Try KeyForge first, then JWT
  const kf = kfValidate(token);
  if (kf.valid) { req.auth = kf; return next(); }
  
  try {
    const jwt = verifyJWT(token);
    req.auth = jwt;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Webhook endpoints use signature verification instead of bearer tokens
function requireWebhookSignature(provider) {
  return (req, res, next) => {
    if (provider === 'payfast') {
      if (!verifyPayFastSignature(req.body)) return res.sendStatus(400);
    } else if (provider === 'paystack') {
      const sig = req.headers['x-paystack-signature'];
      const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET)
        .update(JSON.stringify(req.body)).digest('hex');
      if (sig !== hash) return res.sendStatus(400);
    }
    next();
  };
}
```

### Immediate Rotation Required

```bash
# 1. Generate new secrets
NEW_JWT=$(openssl rand -hex 32)
NEW_KF_MASTER=$(openssl rand -hex 32)
NEW_INTERNAL=$(openssl rand -hex 16)

# 2. Generate new ETH treasury wallet (separate seed, not derived from app secrets)
# Use a hardware wallet or dedicated mnemonic — NOT derived from JWT

# 3. Rotate PayFast credentials via PayFast dashboard

# 4. Update .env on VPS (not in git)
# 5. Restart services
# 6. Scrub git history: git filter-repo --path .env --invert-paths
```

---

## 8. EXECUTION ROADMAP

### Week 1: Foundation (HARD COMMIT)

| Day | Task | Artifact |
|-----|------|----------|
| 1 | Rotate ALL secrets. Scrub git history. | New .env on VPS only |
| 1 | Delete kill list items from brain.js | Cleaned codebase |
| 2 | Deploy PostgreSQL schema (Section 4) | Running DB with seed accounts |
| 2 | Build treasury-service with double-entry ledger | treasury-service/ |
| 3 | Migrate PayFast webhook to treasury-service | Real payments → real ledger |
| 3 | Build reconciliation job (hourly) | Cron: check ledger integrity |
| 4 | Deploy BRDG ERC-20 on Linea testnet | Contract address |
| 4 | Replace all in-memory balances with DB queries | Zero in-memory financial state |
| 5 | Integration test: PayFast → ledger → DB query → API response | End-to-end verified |

### Week 2: On-Chain Reality

| Day | Task | Artifact |
|-----|------|----------|
| 1 | Deploy BRDG ERC-20 on Linea mainnet | Mainnet contract |
| 1 | Deploy TreasuryVault on Linea | Vault contract |
| 2 | Create BRDG/ETH pool on Linea DEX (SyncSwap/Lynex) | Pool address |
| 2 | Seed initial liquidity (treasury ETH + BRDG) | LP position |
| 3 | Build price-oracle.js (reads pool reserves) | Real price feed |
| 3 | Replace all hardcoded prices with oracle reads | No constants |
| 4 | Deploy StakingVault on Linea | Staking contract |
| 4 | Fund initial staking rewards from treasury | Funded pool |
| 5 | Build defi-service with all on-chain interactions | defi-service/ |

### Week 3: Revenue Activation

| Day | Task | Artifact |
|-----|------|----------|
| 1 | Build subscription billing (PayFast recurring) | Real subscriptions |
| 1 | Gate service access by subscription status | Paywall enforced |
| 2 | Build task marketplace (Section 4 schema) | Real task posting |
| 2 | Connect agents to task execution pipeline | Agents earn for real work |
| 3 | Build buyback engine (revenue → BRDG purchase) | Automated buybacks |
| 3 | Build fee router (task fees → treasury + burn + staking) | Fee distribution |
| 4 | Build execution-service | execution-service/ |
| 5 | Integration test: task posted → agent executes → fee split → BRDG burned | Full cycle |

### Week 4: Security + Scale

| Day | Task | Artifact |
|-----|------|----------|
| 1 | Build API gateway (stateless, auth on every route) | gateway-service/ |
| 1 | Fix CORS, add HSTS, remove unsafe-inline from CSP | Hardened headers |
| 2 | Add WebSocket auth (JWT on connect) | Authenticated WS |
| 2 | Add per-user rate limiting via Redis | Rate limiter |
| 3 | Set up BullMQ for async job processing | Job queue |
| 3 | Move webhook processing to queue (idempotent) | Reliable payments |
| 4 | Deploy read replicas for PostgreSQL | Scale reads |
| 5 | Full system audit + penetration test | Audit report |

### Week 5: POINT OF NO RETURN

| Day | Task |
|-----|------|
| 1 | Delete ALL simulation code (brain-business.js hardcoded returns, agent wallets Map, etc.) |
| 2 | Remove admin endpoints that mutate financial state without ledger entry |
| 3 | Enable circuit breakers: halt withdrawals if ledger drift > 0.01% |
| 4 | Go-live checklist verification (see below) |
| 5 | **LAUNCH: Real system, no simulation fallback** |

---

## 9. GO-LIVE CHECKLIST

```
[ ] All secrets rotated (JWT, KeyForge, PayFast, SMTP, SIWE)
[ ] .env removed from git history (BFG or filter-repo)
[ ] ETH treasury wallet uses dedicated seed (not derived from app secrets)
[ ] BRDG ERC-20 deployed on Linea mainnet
[ ] TreasuryVault deployed and funded
[ ] StakingVault deployed with initial reward pool
[ ] BRDG/ETH pool live on DEX with >$5K liquidity
[ ] Double-entry ledger operational (all invariant checks passing)
[ ] PayFast webhooks writing to ledger (not in-memory state)
[ ] All API endpoints behind auth (except /health and webhooks)
[ ] CORS restricted to production domains only
[ ] Rate limiting active per-user
[ ] No in-memory financial state anywhere
[ ] No hardcoded balances, prices, or revenue numbers
[ ] No Math.random() in any financial calculation
[ ] Reconciliation job running hourly
[ ] Audit log capturing all financial mutations
[ ] Subscription billing active (PayFast recurring)
[ ] Task marketplace accepting real payments
[ ] Buyback engine executing after each payment
[ ] Circuit breakers tested and armed
[ ] 48-hour burn-in with real traffic before full launch
```

---

## 10. DEPLOYMENT SEQUENCE (EXACT ORDER)

```
1. npx hardhat compile                        # Compile contracts
2. npx hardhat deploy --network linea-testnet  # Test deployment
3. npx hardhat verify --network linea-testnet  # Verify on explorer
4. Run integration tests against testnet
5. npx hardhat deploy --network linea          # Mainnet deployment
6. npx hardhat verify --network linea          # Verify on Lineascan
7. Call BRDGToken.grantRole(MINTER_ROLE, treasuryVault.address)
8. Call TreasuryVault.deposit() with initial BRDG allocation
9. Create DEX pool: BRDG/ETH
10. Add initial liquidity to pool
11. Call StakingVault constructor with BRDG address
12. Fund staking: BRDGToken.transfer(stakingVault, rewardAmount)
13. Update defi-service config with all contract addresses
14. Switch treasury-service to write real ledger entries
15. Cut over: disable old brain.js financial endpoints
16. Monitor for 48 hours
17. Delete simulation code
```

---

**This document is the execution plan. Every line maps to a deployable artifact. No theory remains.**
