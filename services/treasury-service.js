'use strict';

const { v4: uuidv4 } = require('uuid');
const { getProvider } = require('../lib/eth-treasury');

/**
 * Treasury Service — Real double-entry ledger operations
 * Replaces in-memory state with PostgreSQL truth
 *
 * Every financial mutation creates a transaction group (UUID) with:
 * - Debit to one account
 * - Credit to another account
 * - Invariant: sum(debits) == sum(credits) per tx_group
 */

class TreasuryService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Process incoming PayFast payment → ledger entries
   * Steps:
   * 1. Record payment in payments table
   * 2. Create ledger entries for split (ops/liquidity/reserve/founder)
   * 3. Trigger buyback for liquidity allocation
   */
  async processPayFastPayment(paymentData) {
    const paymentId = `pf-${paymentData.m_payment_id}`;
    const txGroup = uuidv4();

    try {
      // Step 1: Record payment
      await this.db.query(
        `INSERT INTO payments (id, user_id, gateway, amount, currency, status, gateway_reference, metadata, tx_group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          paymentId,
          paymentData.custom_str1 || 'unknown-user',  // user_id from custom field
          'payfast',
          paymentData.amount_gross,
          'ZAR',
          'confirmed',
          paymentData.m_payment_id,
          JSON.stringify({
            subscription: paymentData.subscription_idfrom || null,
            tier: paymentData.item_description || 'general',
            email: paymentData.email_address,
          }),
          txGroup,
        ]
      );

      // Step 2: Split revenue into 4 buckets (on-chain split in TreasuryVault)
      // For now, record as single deposit to ops account
      // Real TreasuryVault contract will enforce split on-chain
      const splits = {
        ops: paymentData.amount_gross * 0.40,
        liquidity: paymentData.amount_gross * 0.25,
        reserve: paymentData.amount_gross * 0.20,
        founder: paymentData.amount_gross * 0.15,
      };

      // Record as revenue inflow → treasury ops
      await this.db.query(
        `SELECT record_ledger_entry($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          txGroup,
          'asset-treasury-ops',           // debit (increase ops account)
          'revenue-subscriptions',        // credit (revenue earned)
          paymentData.amount_gross,
          'ZAR',
          `PayFast payment for ${paymentData.item_description || 'subscription'}`,
          paymentId,
          'payfast-webhook',
        ]
      );

      // Update balances
      await this.db.query(`SELECT update_account_balance($1)`, ['asset-treasury-ops']);
      await this.db.query(`SELECT update_account_balance($1)`, ['revenue-subscriptions']);

      // Step 3: Log for audit
      await this.db.query(
        `INSERT INTO audit_log (actor, action, detail, tx_group_id)
         VALUES ($1, $2, $3, $4)`,
        [
          'payfast-webhook',
          'payment_processed',
          JSON.stringify({ paymentId, amount: paymentData.amount_gross, splits }),
          txGroup,
        ]
      );

      console.log(`[Treasury] PayFast payment ${paymentId} recorded: ${paymentData.amount_gross} ZAR`);

      return {
        ok: true,
        paymentId,
        txGroup,
        amount: paymentData.amount_gross,
        splits,
      };
    } catch (error) {
      console.error(`[Treasury] Error processing payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Get account balance from ledger
   */
  async getAccountBalance(accountId) {
    const { rows } = await this.db.query(
      `SELECT balance, currency, last_updated FROM account_balances WHERE account_id = $1`,
      [accountId]
    );

    if (rows.length === 0) {
      return { accountId, balance: 0, currency: 'BRDG', lastUpdated: null };
    }

    return {
      accountId,
      balance: rows[0].balance,
      currency: rows[0].currency,
      lastUpdated: rows[0].last_updated,
    };
  }

  /**
   * Get treasury summary (all buckets)
   */
  async getTreasurySummary() {
    const ops = await this.getAccountBalance('asset-treasury-ops');
    const liquidity = await this.getAccountBalance('asset-treasury-liquidity');
    const reserve = await this.getAccountBalance('asset-treasury-reserve');
    const founder = await this.getAccountBalance('asset-treasury-founder');

    return {
      ops: ops.balance,
      liquidity: liquidity.balance,
      reserve: reserve.balance,
      founder: founder.balance,
      total: ops.balance + liquidity.balance + reserve.balance + founder.balance,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get user account balance
   */
  async getUserBalance(userId) {
    const { rows } = await this.db.query(
      `SELECT ab.balance, ab.currency
       FROM account_balances ab
       JOIN user_accounts ua ON ab.account_id = ua.account_id
       WHERE ua.user_id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return { userId, balance: 0, currency: 'BRDG' };
    }

    // Sum all user accounts (in case of multiple)
    const balance = rows.reduce((sum, row) => sum + parseFloat(row.balance), 0);

    return {
      userId,
      balance,
      currency: rows[0].currency,
    };
  }

  /**
   * Record task completion → agent payment + treasury fee
   * Task fee structure: 14% to treasury, 1% burn, 85% to agent
   */
  async settleTask(taskId, agentId, taskRewardBrdg) {
    const txGroup = uuidv4();

    try {
      // Calculate fee split
      const treasuryFee = taskRewardBrdg * 0.14;
      const burnAmount = taskRewardBrdg * 0.01;
      const agentEarnings = taskRewardBrdg - treasuryFee - burnAmount;

      // 1. Credit agent with earnings
      await this.db.query(
        `SELECT record_ledger_entry($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          txGroup,
          'asset-agents',                           // debit (agent account)
          'revenue-task-fees',                      // credit (task fee revenue)
          agentEarnings,
          'BRDG',
          `Task ${taskId} completion payment to ${agentId}`,
          taskId,
          'task-settlement',
        ]
      );

      // 2. Credit treasury with fee
      await this.db.query(
        `SELECT record_ledger_entry($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          txGroup,
          'asset-treasury-ops',                     // debit
          'revenue-task-fees',                      // credit
          treasuryFee,
          'BRDG',
          `Task ${taskId} treasury fee (14%)`,
          taskId,
          'task-settlement',
        ]
      );

      // 3. Record burn (debit from revenue, no corresponding credit = destruction)
      await this.db.query(
        `SELECT record_ledger_entry($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          txGroup,
          'expense-operations',                     // debit burn
          'revenue-task-fees',                      // credit from revenue
          burnAmount,
          'BRDG',
          `Task ${taskId} burn (1%)`,
          taskId,
          'task-settlement',
        ]
      );

      // Update task status
      await this.db.query(
        `UPDATE tasks SET status = 'settled', settlement_tx_group = $1 WHERE id = $2`,
        [txGroup, taskId]
      );

      // Update balances
      await this.db.query(`SELECT update_account_balance('asset-agents')`);
      await this.db.query(`SELECT update_account_balance('asset-treasury-ops')`);

      console.log(`[Treasury] Task ${taskId} settled: agent earned ${agentEarnings} BRDG, treasury fee ${treasuryFee}, burn ${burnAmount}`);

      return {
        ok: true,
        taskId,
        txGroup,
        agentEarnings,
        treasuryFee,
        burnAmount,
      };
    } catch (error) {
      console.error(`[Treasury] Error settling task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Verify ledger integrity: all tx_groups have debit = credit
   */
  async verifyLedgerIntegrity() {
    const { rows } = await this.db.query(`
      SELECT
        tx_group,
        SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END) AS net
      FROM ledger_entries
      GROUP BY tx_group
      HAVING ABS(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END)) > 0.00000001
    `);

    if (rows.length > 0) {
      console.error('[Treasury] LEDGER IMBALANCE DETECTED:', rows);
      return { ok: false, imbalanced: rows };
    }

    return { ok: true, imbalanced: [] };
  }

  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit = 50) {
    const { rows } = await this.db.query(
      `SELECT
        tx_group,
        account_id,
        entry_type,
        amount,
        description,
        operator,
        created_at
      FROM ledger_entries
      ORDER BY created_at DESC
      LIMIT $1`,
      [limit]
    );

    return rows;
  }

  /**
   * Daily reconciliation check (called via cron)
   */
  async runDailyReconciliation() {
    const checks = [];

    // Check 1: Assets >= Liabilities
    const { rows: [balanceCheck] } = await this.db.query(`
      SELECT
        SUM(CASE WHEN type = 'asset' THEN SUM(ab.balance) ELSE 0 END) AS total_assets,
        SUM(CASE WHEN type = 'liability' THEN SUM(ab.balance) ELSE 0 END) AS total_liabilities
      FROM accounts a
      LEFT JOIN account_balances ab ON a.id = ab.account_id
      GROUP BY a.type
    `);

    const solvency = balanceCheck && balanceCheck.total_assets >= balanceCheck.total_liabilities;
    checks.push({
      check: 'solvency',
      pass: solvency,
      detail: balanceCheck,
    });

    // Check 2: Ledger integrity
    const integrity = await this.verifyLedgerIntegrity();
    checks.push({
      check: 'ledger_integrity',
      pass: integrity.ok,
      detail: integrity,
    });

    // Log results
    for (const check of checks) {
      await this.db.query(
        `INSERT INTO reconciliation_log (check_type, status, details)
         VALUES ($1, $2, $3)`,
        [
          check.check,
          check.pass ? 'pass' : 'critical',
          JSON.stringify(check.detail),
        ]
      );
    }

    console.log(`[Treasury] Daily reconciliation: ${checks.filter(c => c.pass).length}/${checks.length} checks passed`);
    return checks;
  }
}

module.exports = TreasuryService;
