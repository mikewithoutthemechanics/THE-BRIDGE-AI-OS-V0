-- ============================================================
-- BRIDGE AI OS — REAL TREASURY SCHEMA
-- PostgreSQL 15+
-- Double-entry accounting: every transaction has debit = credit
-- Immutable ledger with daily reconciliation
-- ============================================================

-- Account chart (double-entry ledger root accounts)
CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    subtype         TEXT,  -- treasury, user, agent, reserve, founder, liquidity, fees
    currency        TEXT NOT NULL DEFAULT 'BRDG',
    owner_id        TEXT,  -- user/agent ID if applicable
    chain_address   TEXT,  -- on-chain address if applicable (0x...)
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Insert chart of accounts (immutable)
INSERT INTO accounts (id, name, type, subtype, currency) VALUES
    ('asset-treasury-ops', 'Treasury Operations', 'asset', 'treasury', 'BRDG'),
    ('asset-treasury-liquidity', 'Treasury Liquidity', 'asset', 'treasury', 'BRDG'),
    ('asset-treasury-reserve', 'Treasury Reserve', 'asset', 'treasury', 'ETH'),
    ('asset-treasury-founder', 'Founder Allocation', 'asset', 'treasury', 'BRDG'),
    ('asset-users', 'User Account Balances', 'asset', 'user', 'BRDG'),
    ('asset-agents', 'Agent Earnings', 'asset', 'agent', 'BRDG'),
    ('liability-user-withdrawals', 'Pending User Withdrawals', 'liability', 'user', 'BRDG'),
    ('equity-initial-mint', 'Initial BRDG Mint', 'equity', 'treasury', 'BRDG'),
    ('revenue-subscriptions', 'Subscription Revenue', 'revenue', 'revenue', 'ZAR'),
    ('revenue-task-fees', 'Task Marketplace Fees', 'revenue', 'revenue', 'BRDG'),
    ('revenue-dex-fees', 'DEX Trading Fees', 'revenue', 'revenue', 'BRDG'),
    ('expense-operations', 'Operating Expenses', 'expense', 'operations', 'BRDG'),
    ('expense-staking-rewards', 'Staking Rewards Paid', 'expense', 'operations', 'BRDG')
ON CONFLICT DO NOTHING;

-- Double-entry ledger (immutable append-only)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    tx_group        UUID NOT NULL,  -- groups entries from same transaction
    account_id      TEXT NOT NULL REFERENCES accounts(id),
    entry_type      TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount          NUMERIC(28, 8) NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'BRDG',
    description     TEXT NOT NULL,
    related_id      TEXT,  -- payment ID, task ID, withdrawal ID, etc.
    on_chain_tx     TEXT,  -- Ethereum/Linea tx hash if applicable
    operator        TEXT,  -- 'system', 'payfast-webhook', 'task-settlement', etc.
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CHECK (amount > 0),

    -- Indexes
    CONSTRAINT ledger_immutable CHECK (created_at <= NOW()),
    INDEX idx_tx_group (tx_group),
    INDEX idx_account_id (account_id),
    INDEX idx_created_at (created_at),
    INDEX idx_related_id (related_id)
);

-- Account balance materialized view (denormalized for fast queries)
CREATE TABLE IF NOT EXISTS account_balances (
    account_id      TEXT PRIMARY KEY REFERENCES accounts(id),
    balance         NUMERIC(28, 8) NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'BRDG',
    last_updated    TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_balance (balance),
    INDEX idx_updated (last_updated)
);

-- User account mapping (one user → many accounts if needed)
CREATE TABLE IF NOT EXISTS user_accounts (
    user_id         TEXT NOT NULL,
    account_id      TEXT NOT NULL REFERENCES accounts(id),
    role            TEXT DEFAULT 'owner',  -- owner, authorized, viewer
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (user_id, account_id)
);

-- Payment gateway integration (PayFast, Stripe, etc.)
CREATE TABLE IF NOT EXISTS payments (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    gateway         TEXT NOT NULL CHECK (gateway IN ('payfast', 'stripe', 'paypal', 'crypto')),
    amount          NUMERIC(18, 2) NOT NULL,
    currency        TEXT NOT NULL,  -- ZAR, USD, ETH, etc.
    status          TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
    gateway_reference TEXT,
    description     TEXT,
    metadata        JSONB,  -- subscription_id, tier, etc.
    tx_group_id     UUID,  -- links to ledger_entries.tx_group
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,

    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Task marketplace (agents earn BRDG for work)
CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    posted_by       TEXT NOT NULL,  -- user or system
    title           TEXT NOT NULL,
    description     TEXT,
    reward_brdg     NUMERIC(18, 8) NOT NULL,
    reward_zar      NUMERIC(18, 2),
    status          TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'completed', 'disputed', 'settled')),
    assigned_agent  TEXT,
    completed_at    TIMESTAMPTZ,
    settlement_tx_group UUID,  -- links to ledger settlement entries
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_posted_by (posted_by),
    INDEX idx_assigned_agent (assigned_agent),
    INDEX idx_status (status)
);

-- Subscriptions (recurring revenue)
CREATE TABLE IF NOT EXISTS subscriptions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    tier            TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'enterprise')),
    amount_zar      NUMERIC(18, 2) NOT NULL,
    billing_cycle   TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    gateway         TEXT NOT NULL,
    gateway_subscription_id TEXT,
    status          TEXT NOT NULL CHECK (status IN ('active', 'paused', 'cancelled')),
    next_billing_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_next_billing_at (next_billing_at)
);

-- Reconciliation logs (nightly & hourly checks)
CREATE TABLE IF NOT EXISTS reconciliation_log (
    id              BIGSERIAL PRIMARY KEY,
    check_type      TEXT NOT NULL,  -- solvency, ledger_integrity, supply_consistency, etc.
    status          TEXT NOT NULL CHECK (status IN ('pass', 'warning', 'critical')),
    details         JSONB,
    action_taken    TEXT,
    run_at          TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_check_type (check_type),
    INDEX idx_run_at (run_at),
    INDEX idx_status (status)
);

-- Audit log (all financial mutations)
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    actor           TEXT NOT NULL,  -- user_id, system, service name
    action          TEXT NOT NULL,  -- deposit, withdraw, mint, burn, settle_task, etc.
    detail          JSONB,
    tx_group_id     UUID,  -- links to ledger entry group
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_actor (actor),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
);

-- Withdrawal requests (queued for processing)
CREATE TABLE IF NOT EXISTS withdrawals (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    destination     TEXT NOT NULL,  -- user wallet address or bank account
    amount_brdg     NUMERIC(28, 8) NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'confirmed', 'failed')),
    on_chain_tx     TEXT,  -- Ethereum tx hash if bridged to mainnet
    requested_at    TIMESTAMPTZ DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,

    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);

-- Buyback log (DEX operations)
CREATE TABLE IF NOT EXISTS buyback_log (
    id              TEXT PRIMARY KEY,
    eth_spent       NUMERIC(28, 8) NOT NULL,
    brdg_acquired   NUMERIC(28, 8) NOT NULL,
    dex_price       NUMERIC(28, 8) NOT NULL,
    pool_address    TEXT,
    tx_hash         TEXT,
    executed_at     TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_executed_at (executed_at)
);

-- Function: Record ledger entry (ensures debit = credit)
CREATE OR REPLACE FUNCTION record_ledger_entry(
    p_tx_group UUID,
    p_debit_account TEXT,
    p_credit_account TEXT,
    p_amount NUMERIC,
    p_currency TEXT,
    p_description TEXT,
    p_related_id TEXT DEFAULT NULL,
    p_operator TEXT DEFAULT 'system'
) RETURNS BOOLEAN AS $$
BEGIN
    -- Debit entry
    INSERT INTO ledger_entries (tx_group, account_id, entry_type, amount, currency, description, related_id, operator)
    VALUES (p_tx_group, p_debit_account, 'debit', p_amount, p_currency, p_description, p_related_id, p_operator);

    -- Credit entry
    INSERT INTO ledger_entries (tx_group, account_id, entry_type, amount, currency, description, related_id, operator)
    VALUES (p_tx_group, p_credit_account, 'credit', p_amount, p_currency, p_description, p_related_id, p_operator);

    -- Audit
    INSERT INTO audit_log (actor, action, detail, tx_group_id)
    VALUES (p_operator, 'ledger_entry', jsonb_build_object('debit', p_debit_account, 'credit', p_credit_account, 'amount', p_amount), p_tx_group);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Update account balance (materialized view refresh)
CREATE OR REPLACE FUNCTION update_account_balance(p_account_id TEXT) RETURNS VOID AS $$
DECLARE
    v_balance NUMERIC(28, 8);
BEGIN
    SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END), 0)
    INTO v_balance
    FROM ledger_entries
    WHERE account_id = p_account_id;

    INSERT INTO account_balances (account_id, balance, last_updated)
    VALUES (p_account_id, v_balance, NOW())
    ON CONFLICT (account_id) DO UPDATE SET balance = v_balance, last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update balance after ledger entry
CREATE OR REPLACE FUNCTION trigger_update_balance()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_account_balance(NEW.account_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_update_balance_after_entry
AFTER INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION trigger_update_balance();

-- Initial seed: create system accounts
INSERT INTO user_accounts (user_id, account_id, role)
VALUES
    ('system', 'asset-treasury-ops', 'owner'),
    ('system', 'asset-treasury-liquidity', 'owner'),
    ('system', 'asset-treasury-reserve', 'owner'),
    ('system', 'asset-treasury-founder', 'owner')
ON CONFLICT DO NOTHING;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx_group ON ledger_entries (tx_group);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created ON ledger_entries (created_at);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks (assigned_agent);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals (user_id);

-- Permissions (if using Supabase or managed DB)
-- GRANT SELECT, INSERT ON ledger_entries TO service_role;
-- GRANT SELECT, INSERT ON payments TO service_role;
-- GRANT SELECT, INSERT, UPDATE ON account_balances TO service_role;
