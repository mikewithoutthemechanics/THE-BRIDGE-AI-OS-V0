'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Treasury Service — Real double-entry ledger operations
 * Matches the hardened production schema (treasury-schema.sql):
 *
 * Column mapping:
 *   ledger_entries.tx_id     → groups entries from same transaction
 *   ledger_entries.direction → 'debit' | 'credit'
 *   ledger_entries.reference → payment ID, task ID, etc.
 *   ledger_entries.metadata  → JSONB context
 *
 * Invariant enforced by DB constraint trigger:
 *   SUM(debit) == SUM(credit) per tx_id (DEFERRABLE INITIALLY DEFERRED)
 *
 * Balance auto-synced by DB trigger:
 *   credit → +amount, debit → -amount in account_balances
 */

class TreasuryService {
  constructor(db) {
    this.db = db;
    this.paymentsHalted = false;
    this.haltReason = null;
    this._accountCache = new Map(); // name → UUID cache
  }

  // ── Circuit Breaker ──────────────────────────────────────────────────────

  assertNotHalted() {
    if (this.paymentsHalted) {
      throw new Error(`CIRCUIT BREAKER ACTIVE: ${this.haltReason}. All financial mutations are frozen until manual review.`);
    }
  }

  // ── Account Resolution ───────────────────────────────────────────────────

  /**
   * Resolve account name → UUID. Caches after first lookup.
   */
  async resolveAccount(name) {
    if (this._accountCache.has(name)) return this._accountCache.get(name);
    const { rows } = await this.db.query(`SELECT id FROM accounts WHERE name = $1`, [name]);
    if (rows.length === 0) throw new Error(`Account not found: ${name}`);
    this._accountCache.set(name, rows[0].id);
    return rows[0].id;
  }

  // ── Ledger Primitives ────────────────────────────────────────────────────

  /**
   * Record a double-entry pair. Both entries share the same tx_id.
   * The DB constraint trigger enforces debit == credit per tx_id.
   */
  async recordEntry(txId, debitAccountName, creditAccountName, amount, reference, metadata) {
    const debitId = await this.resolveAccount(debitAccountName);
    const creditId = await this.resolveAccount(creditAccountName);

    await this.db.query(
      `INSERT INTO ledger_entries (tx_id, account_id, amount, direction, reference, metadata) VALUES ($1, $2, $3, 'debit', $4, $5)`,
      [txId, debitId, amount, reference, JSON.stringify(metadata)]
    );
    await this.db.query(
      `INSERT INTO ledger_entries (tx_id, account_id, amount, direction, reference, metadata) VALUES ($1, $2, $3, 'credit', $4, $5)`,
      [txId, creditId, amount, reference, JSON.stringify(metadata)]
    );
  }

  // ── PayFast Payment Processing ───────────────────────────────────────────

  async processPayFastPayment(paymentData) {
    this.assertNotHalted();
    const paymentId = `pf-${paymentData.m_payment_id}`;
    const txId = uuidv4();

    try {
      // 1. Record payment
      await this.db.query(
        `INSERT INTO payments (id, user_id, gateway, amount, currency, status, gateway_reference, metadata, tx_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          paymentId,
          paymentData.custom_str1 || 'unknown-user',
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
          txId,
        ]
      );

      // 2. Double-entry: debit Treasury Operations, credit Subscription Revenue
      const splits = {
        ops: paymentData.amount_gross * 0.40,
        liquidity: paymentData.amount_gross * 0.25,
        reserve: paymentData.amount_gross * 0.20,
        founder: paymentData.amount_gross * 0.15,
      };

      await this.recordEntry(
        txId,
        'Treasury Operations',
        'Subscription Revenue',
        paymentData.amount_gross,
        paymentId,
        { gateway: 'payfast', item: paymentData.item_description, splits }
      );

      // 3. Audit log (hash-chained by DB trigger)
      await this.db.query(
        `INSERT INTO audit_log (action, actor, detail, metadata) VALUES ($1, $2, $3, $4)`,
        ['payment_processed', 'payfast-webhook', `PayFast ${paymentId}: ${paymentData.amount_gross} ZAR`, JSON.stringify({ paymentId, txId, splits })]
      );

      console.log(`[Treasury] PayFast payment ${paymentId} recorded: ${paymentData.amount_gross} ZAR`);

      return { ok: true, paymentId, txId, amount: paymentData.amount_gross, splits };
    } catch (error) {
      console.error(`[Treasury] Error processing payment ${paymentId}:`, error);
      throw error;
    }
  }

  // ── Balance Queries ──────────────────────────────────────────────────────

  async getAccountBalance(accountName) {
    const { rows } = await this.db.query(
      `SELECT ab.balance FROM account_balances ab JOIN accounts a ON ab.account_id = a.id WHERE a.name = $1`,
      [accountName]
    );
    return { account: accountName, balance: rows.length > 0 ? parseFloat(rows[0].balance) : 0 };
  }

  async getTreasurySummary() {
    const { rows } = await this.db.query(`
      SELECT a.name, COALESCE(ab.balance, 0) AS balance
      FROM accounts a
      LEFT JOIN account_balances ab ON a.id = ab.account_id
      WHERE a.type = 'treasury'
    `);
    const buckets = Object.fromEntries(rows.map(r => [r.name, parseFloat(r.balance)]));
    return { ...buckets, total: Object.values(buckets).reduce((s, v) => s + v, 0), lastUpdated: new Date().toISOString() };
  }

  // ── Task Settlement ──────────────────────────────────────────────────────

  async settleTask(taskId, agentId, taskRewardBrdg) {
    this.assertNotHalted();
    const txId = uuidv4();

    try {
      const treasuryFee = taskRewardBrdg * 0.14;
      const burnAmount = taskRewardBrdg * 0.01;
      const agentEarnings = taskRewardBrdg - treasuryFee - burnAmount;

      // 1. Agent earnings: debit Agent Earnings, credit Task Fee Revenue
      await this.recordEntry(txId, 'Agent Earnings', 'Task Fee Revenue', agentEarnings, taskId, { type: 'agent-payment', agentId });

      // 2. Treasury fee: debit Treasury Operations, credit Task Fee Revenue
      await this.recordEntry(txId, 'Treasury Operations', 'Task Fee Revenue', treasuryFee, taskId, { type: 'treasury-fee' });

      // 3. Burn: debit Burn Address, credit Task Fee Revenue
      await this.recordEntry(txId, 'Burn Address', 'Task Fee Revenue', burnAmount, taskId, { type: 'burn' });

      // Update task status
      await this.db.query(
        `UPDATE tasks SET status = 'settled', settlement_tx_id = $1 WHERE id = $2`,
        [txId, taskId]
      );

      console.log(`[Treasury] Task ${taskId} settled: agent ${agentEarnings} BRDG, fee ${treasuryFee}, burn ${burnAmount}`);
      return { ok: true, taskId, txId, agentEarnings, treasuryFee, burnAmount };
    } catch (error) {
      console.error(`[Treasury] Error settling task ${taskId}:`, error);
      throw error;
    }
  }

  // ── Ledger Integrity ─────────────────────────────────────────────────────

  async verifyLedgerIntegrity() {
    const { rows } = await this.db.query(`
      SELECT tx_id,
        SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) AS net
      FROM ledger_entries
      GROUP BY tx_id
      HAVING ABS(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END)) > 0.00000001
    `);

    if (rows.length > 0) {
      console.error('[Treasury] LEDGER IMBALANCE DETECTED:', rows);
      return { ok: false, imbalanced: rows };
    }
    return { ok: true, imbalanced: [] };
  }

  // ── Recent Transactions ──────────────────────────────────────────────────

  async getRecentTransactions(limit = 50) {
    const { rows } = await this.db.query(
      `SELECT tx_id, account_id, direction, amount, reference, metadata, created_at
       FROM ledger_entries ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return rows;
  }

  // ── Daily Reconciliation + Circuit Breaker ───────────────────────────────

  async runDailyReconciliation() {
    const checks = [];

    // Check 1: Solvency
    try {
      const { rows } = await this.db.query(`
        SELECT a.type, COALESCE(SUM(ab.balance), 0) AS total
        FROM accounts a
        LEFT JOIN account_balances ab ON a.id = ab.account_id
        GROUP BY a.type
      `);
      const totals = Object.fromEntries(rows.map(r => [r.type, parseFloat(r.total)]));
      const solvency = (totals.treasury || 0) + (totals.reserve || 0) >= 0;
      checks.push({ check: 'solvency', pass: solvency, detail: totals });
    } catch (err) {
      checks.push({ check: 'solvency', pass: false, detail: { error: err.message } });
    }

    // Check 2: Ledger integrity
    const integrity = await this.verifyLedgerIntegrity();
    checks.push({ check: 'ledger_integrity', pass: integrity.ok, detail: integrity });

    // Check 3: No negative balances on treasury accounts
    try {
      const { rows: negatives } = await this.db.query(`
        SELECT a.name, ab.balance
        FROM account_balances ab
        JOIN accounts a ON a.id = ab.account_id
        WHERE a.type IN ('treasury', 'reserve') AND ab.balance < 0
      `);
      checks.push({ check: 'no_negative_treasury', pass: negatives.length === 0, detail: negatives });
    } catch (err) {
      checks.push({ check: 'no_negative_treasury', pass: false, detail: { error: err.message } });
    }

    // Log results
    for (const check of checks) {
      await this.db.query(
        `INSERT INTO reconciliation_log (check_type, status, details) VALUES ($1, $2, $3)`,
        [check.check, check.pass ? 'pass' : 'critical', JSON.stringify(check.detail)]
      );
    }

    // Circuit breaker
    const failed = checks.filter(c => !c.pass);
    if (failed.length > 0) {
      this.paymentsHalted = true;
      this.haltReason = `Reconciliation failed: ${failed.map(f => f.check).join(', ')}`;
      console.error(`[Treasury] CIRCUIT BREAKER TRIPPED — ${this.haltReason}`);
      await this.db.query(
        `INSERT INTO audit_log (action, actor, detail) VALUES ($1, $2, $3)`,
        ['CIRCUIT_BREAKER_TRIPPED', 'system', JSON.stringify({ failed, timestamp: new Date().toISOString() })]
      );
      process.emit('treasury:circuit-breaker', { reason: this.haltReason, failed });
    } else if (this.paymentsHalted) {
      console.log('[Treasury] All reconciliation checks passed — circuit breaker auto-reset');
      this.paymentsHalted = false;
      this.haltReason = null;
    }

    const passCount = checks.filter(c => c.pass).length;
    console.log(`[Treasury] Daily reconciliation: ${passCount}/${checks.length} checks passed${this.paymentsHalted ? ' — PAYMENTS HALTED' : ''}`);
    return { checks, halted: this.paymentsHalted };
  }

  // ── Circuit Breaker Reset ────────────────────────────────────────────────

  resetCircuitBreaker(actor = 'admin') {
    const wasHalted = this.paymentsHalted;
    this.paymentsHalted = false;
    this.haltReason = null;
    if (wasHalted) {
      console.log(`[Treasury] Circuit breaker manually reset by ${actor}`);
      this.db.query(
        `INSERT INTO audit_log (action, actor, detail) VALUES ($1, $2, $3)`,
        ['CIRCUIT_BREAKER_RESET', actor, JSON.stringify({ resetBy: actor, timestamp: new Date().toISOString() })]
      ).catch(err => console.error('[Treasury] Failed to log breaker reset:', err.message));
    }
    return { ok: true, wasHalted };
  }
}

module.exports = TreasuryService;
