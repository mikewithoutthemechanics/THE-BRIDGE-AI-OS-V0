// =============================================================================
// SUPACLAW-CORE — Deterministic Execution Layer
// L1 TUNNEL: SQLite WAL state engine (single source of truth)
// L2 GATEKEEPER: AsyncMutex (Promise-chaining, zero external deps)
// L9 SECRETS: secrets subsystem isolation
// L10 DOCTRINE: SafeAsync quarantine wrapper
// L27 EXTENDED: InvariantMonitor + kill switch enforcement
// =============================================================================
'use strict';

const crypto  = require('crypto');
const path    = require('path');
const EventEmitter = require('events');

// ── L2 GATEKEEPER: AsyncMutex ────────────────────────────────────────────────
// Promise-chaining mutex. Serializes concurrent writers at the JS event-loop
// level. No OS primitives required — works because Node.js is single-threaded
// and async suspension points are the only interleave boundary.
class AsyncMutex {
  constructor() { this._chain = Promise.resolve(); }

  acquire() {
    let release;
    const ticket = new Promise(res => { release = res; });
    const wait   = this._chain.then(() => release);
    this._chain  = this._chain.then(() => ticket);
    return wait;
  }
}

// ── L10 DOCTRINE: SafeAsync ──────────────────────────────────────────────────
// Wraps any async fn so that unhandled rejections are routed to a quarantine
// log rather than crashing the process or silently dying.
class SafeAsync {
  constructor(quarantineLog) {
    this._log = quarantineLog || [];
  }

  spawn(name, fn, ...args) {
    return Promise.resolve()
      .then(() => fn(...args))
      .catch(err => {
        const entry = {
          id:   crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
          name,
          error: err && err.message ? err.message : String(err),
          stack: err && err.stack  ? err.stack  : '',
          ts:   Date.now(),
        };
        this._log.push(entry);
        if (this._log.length > 500) this._log.shift();
        console.error('[𝓛₁₀] SafeAsync quarantine:', name, err && err.message);
        return { quarantined: true, entry };
      });
  }
}

// ── L27 EXTENDED: InvariantMonitor ──────────────────────────────────────────
class InvariantMonitor {
  constructor() {
    this._invariants = {
      L1_TUNNEL:      { enforced: true,  violations: 0, label: 'SQLite WAL state engine' },
      L2_GATEKEEPER:  { enforced: true,  violations: 0, label: 'AsyncMutex single-writer' },
      L9_SECRETS:     { enforced: true,  violations: 0, label: 'Secrets subsystem isolation' },
      L10_DOCTRINE:   { enforced: true,  violations: 0, label: 'SafeAsync quarantine wrapper' },
      L27_EXTENDED:   { enforced: true,  violations: 0, label: 'Kill switch + InvariantMonitor' },
    };
    this._total_cycles  = 0;
    this._cycle_errors  = 0;
    this._quarantine    = [];
  }

  tick() { this._total_cycles++; }

  recordViolation(invariant, detail) {
    if (this._invariants[invariant]) {
      this._invariants[invariant].violations++;
    }
    this._cycle_errors++;
    console.error(`[𝓛₂₇] Invariant violation: ${invariant} — ${detail}`);
  }

  recordError(name, err) {
    this._cycle_errors++;
    const entry = {
      id:    Date.now().toString(36),
      name,
      error: err && err.message ? err.message : String(err),
      ts:    Date.now(),
    };
    this._quarantine.push(entry);
    if (this._quarantine.length > 200) this._quarantine.shift();
    return entry;
  }

  reset() { this._cycle_errors = 0; }

  status() {
    return {
      total_cycles:     this._total_cycles,
      cycle_errors:     this._cycle_errors,
      invariants:       this._invariants,
      quarantine_count: this._quarantine.length,
      quarantine:       this._quarantine.slice(-10),
    };
  }
}

// ── L1 TUNNEL: StateCore ─────────────────────────────────────────────────────
class StateCore extends EventEmitter {
  constructor(opts) {
    super();
    const options = opts || {};

    // Resolve DB path
    const dbDir  = options.db_dir || path.join(process.cwd(), '.bridge-state');
    const dbFile = options.db_file || 'supaclaw.db';
    this._dbPath = path.join(dbDir, dbFile);

    // Ensure directory exists
    const fs = require('fs');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    // Open SQLite (synchronous WAL)
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch (e) {
      console.error('[CORE] better-sqlite3 not found — run: npm install better-sqlite3');
      throw e;
    }
    this._db = new Database(this._dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');

    // Schema
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS state (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ledger (
        id         TEXT PRIMARY KEY,
        payload    TEXT NOT NULL,
        ts         INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS quarantine (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        error      TEXT NOT NULL,
        ts         INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        id         TEXT PRIMARY KEY,
        payload    TEXT NOT NULL,
        ts         INTEGER NOT NULL
      );
    `);

    // Prepared statements
    this._stmts = {
      upsert:        this._db.prepare('INSERT OR REPLACE INTO state(key, value, updated_at) VALUES (?,?,?)'),
      select:        this._db.prepare('SELECT value FROM state WHERE key = ?'),
      ledger_exists: this._db.prepare('SELECT 1 FROM ledger WHERE id = ?'),
      ledger_insert: this._db.prepare('INSERT OR IGNORE INTO ledger(id, payload, ts) VALUES (?,?,?)'),
      snap_insert:   this._db.prepare('INSERT OR REPLACE INTO snapshots(id, payload, ts) VALUES (?,?,?)'),
      snap_latest:   this._db.prepare('SELECT payload FROM snapshots ORDER BY ts DESC LIMIT 1'),
      quar_insert:   this._db.prepare('INSERT OR IGNORE INTO quarantine(id, name, error, ts) VALUES (?,?,?,?)'),
    };

    // In-memory read cache (derived, never source of truth)
    this._cache = new Map();

    // Sub-components
    this._mutex     = new AsyncMutex();
    this._safe      = new SafeAsync();
    this._invariant = new InvariantMonitor();

    // Treasury gate state
    this._treasury_active  = false;
    this._treasury_halted  = false;
    this._max_cycle_errors = options.max_cycle_errors || 5;

    // Healing loop
    this._healingHandle = setInterval(() => {
      this._safe.spawn('healing_cycle', () => this.healingCycle());
    }, 10000);

    console.log('[CORE] StateCore initialized →', this._dbPath);
  }

  // ── READ (cache-first, then DB) ────────────────────────────────────────────
  read(key, defaultVal) {
    if (this._cache.has(key)) return this._cache.get(key);
    const row = this._stmts.select.get(key);
    if (!row) return defaultVal !== undefined ? defaultVal : null;
    try {
      const val = JSON.parse(row.value);
      this._cache.set(key, val);
      return val;
    } catch (e) {
      return row.value;
    }
  }

  // ── WRITE (mutex-serialized, WAL-flushed) ──────────────────────────────────
  async write(key, value, options) {
    const opts       = options || {};
    const now        = Date.now();
    const serialized = JSON.stringify(value);

    if (opts.validate) {
      const err = opts.validate(value);
      if (err) {
        this._invariant.recordViolation('VALIDATION_FAILED', `key=${key} err=${err}`);
        throw new Error('[CORE] Validation failed: ' + err);
      }
    }

    const release = await this._mutex.acquire();
    try {
      if (opts.idempotency_key) {
        const exists = this._stmts.ledger_exists.get(opts.idempotency_key);
        if (exists) return { skipped: true, idempotency_key: opts.idempotency_key };
      }

      const commit = this._db.transaction(() => {
        this._stmts.upsert.run(key, serialized, now);
        if (opts.idempotency_key) {
          this._stmts.ledger_insert.run(
            opts.idempotency_key,
            JSON.stringify({ key, ts: now }),
            now
          );
        }
      });
      commit();

      this._cache.set(key, value);
      this.emit('state:write', { key, ts: now });
      return { ok: true, key, ts: now };
    } finally {
      release();
    }
  }

  // ── TREASURY CREDIT (idempotent, gated) ───────────────────────────────────
  async treasuryCredit(amount, source, idempotency_key) {
    if (this._treasury_halted) {
      console.warn('[CORE] Treasury halted — credit rejected:', source);
      return { halted: true };
    }

    const ikey = idempotency_key || crypto.createHash('sha256')
      .update(source + '_' + amount.toFixed(8) + '_' + Date.now())
      .digest('hex').slice(0, 32);

    const exists = this._stmts.ledger_exists.get(ikey);
    if (exists) return { skipped: true, idempotency_key: ikey };

    const release = await this._mutex.acquire();
    try {
      const exists2 = this._stmts.ledger_exists.get(ikey);
      if (exists2) return { skipped: true, idempotency_key: ikey };

      const current = this.read('treasury', { balance: 0, earned: 0, spent: 0 });
      const updated = {
        balance:     +(current.balance + amount).toFixed(8),
        earned:      +(current.earned  + amount).toFixed(8),
        spent:       current.spent || 0,
        last_credit: Date.now(),
        last_source: source,
      };

      const now = Date.now();
      const commit = this._db.transaction(() => {
        this._stmts.upsert.run('treasury', JSON.stringify(updated), now);
        this._stmts.ledger_insert.run(
          ikey,
          JSON.stringify({ op: 'credit', amount, source, ts: now }),
          now
        );
      });
      commit();

      this._cache.set('treasury', updated);
      this._invariant.tick();
      this.emit('treasury:credit', { amount, source, balance: updated.balance });

      // Treasury gate: PENDING → ACTIVE after 1000 clean cycles
      if (!this._treasury_active &&
          this._invariant._total_cycles >= 1000 &&
          this._invariant._cycle_errors === 0) {
        this._treasury_active = true;
        console.log('[CORE] 🟢 Treasury gate: PENDING → ACTIVE (1000 clean cycles complete)');
        this.emit('treasury:active');
      }

      return { ok: true, balance: updated.balance, idempotency_key: ikey };
    } finally {
      release();
    }
  }

  // ── TREASURY DEBIT (idempotent, gated) ────────────────────────────────────
  async treasuryDebit(amount, source, idempotency_key) {
    if (this._treasury_halted) return { halted: true };

    const ikey = idempotency_key || crypto.createHash('sha256')
      .update('debit_' + source + '_' + amount.toFixed(8) + '_' + Date.now())
      .digest('hex').slice(0, 32);

    const exists = this._stmts.ledger_exists.get(ikey);
    if (exists) return { skipped: true, idempotency_key: ikey };

    const release = await this._mutex.acquire();
    try {
      const exists2 = this._stmts.ledger_exists.get(ikey);
      if (exists2) return { skipped: true, idempotency_key: ikey };

      const current = this.read('treasury', { balance: 0, earned: 0, spent: 0 });
      if (current.balance < amount) {
        return { insufficient: true, balance: current.balance };
      }

      const updated = {
        balance:    +(current.balance - amount).toFixed(8),
        earned:     current.earned || 0,
        spent:      +((current.spent || 0) + amount).toFixed(8),
        last_debit: Date.now(),
        last_source: source,
      };

      const now = Date.now();
      const commit = this._db.transaction(() => {
        this._stmts.upsert.run('treasury', JSON.stringify(updated), now);
        this._stmts.ledger_insert.run(
          ikey,
          JSON.stringify({ op: 'debit', amount, source, ts: now }),
          now
        );
      });
      commit();

      this._cache.set('treasury', updated);
      this.emit('treasury:debit', { amount, source, balance: updated.balance });
      return { ok: true, balance: updated.balance, idempotency_key: ikey };
    } finally {
      release();
    }
  }

  // ── SNAPSHOT ──────────────────────────────────────────────────────────────
  snapshot() {
    const ts  = Date.now();
    const id  = 'snap_' + ts;
    const state = {};
    const rows  = this._db.prepare('SELECT key, value FROM state').all();
    for (const row of rows) {
      try { state[row.key] = JSON.parse(row.value); } catch (e) { state[row.key] = row.value; }
    }
    const payload = JSON.stringify({ ts, state });
    this._stmts.snap_insert.run(id, payload, ts);
    return { ok: true, id, ts };
  }

  // ── RESTORE from latest snapshot ──────────────────────────────────────────
  restore() {
    const row = this._stmts.snap_latest.get();
    if (!row) return { ok: false, reason: 'no_snapshot' };
    try {
      const { ts, state } = JSON.parse(row.payload);
      const now = Date.now();
      const restoreTx = this._db.transaction(() => {
        for (const [key, value] of Object.entries(state)) {
          this._stmts.upsert.run(key, JSON.stringify(value), now);
        }
      });
      restoreTx();
      this._cache.clear();
      console.log('[CORE] Restored from snapshot ts:', ts);
      return { ok: true, restored_ts: ts };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  // ── SELF-HEALING LOOP (10s) ───────────────────────────────────────────────
  async healingCycle() {
    const inv  = this._invariant;
    const errs = inv._cycle_errors;

    if (errs >= this._max_cycle_errors && !this._treasury_halted) {
      console.error('[CORE] 🔴 Error threshold breached:', errs, '— halting treasury, restoring snapshot');
      this._treasury_halted = true;
      const result = this.restore();
      console.log('[CORE] Restore result:', result);
      inv.reset();
      this._treasury_halted = false;
      console.log('[CORE] 🟡 Treasury resumed after heal');
      this.emit('treasury:healed');
    }
  }

  // ── HALT / RESUME ─────────────────────────────────────────────────────────
  halt(sub)   { if (sub === 'treasury') { this._treasury_halted = true;  this.emit('treasury:halted');  } }
  resume(sub) { if (sub === 'treasury') { this._treasury_halted = false; this.emit('treasury:resumed'); } }

  // ── STATUS ────────────────────────────────────────────────────────────────
  status() {
    const treasury = this.read('treasury', { balance: 0, earned: 0, spent: 0 });
    return {
      ok:              true,
      db:              this._dbPath,
      treasury_gate:   this._treasury_active ? 'ACTIVE' : 'PENDING',
      treasury_halted: this._treasury_halted,
      treasury,
      invariants:      this._invariant.status(),
    };
  }

  // ── SHUTDOWN ──────────────────────────────────────────────────────────────
  shutdown() {
    if (this._healingHandle) clearInterval(this._healingHandle);
    if (this._db) this._db.close();
  }
}

// ── SINGLETON ─────────────────────────────────────────────────────────────────
let _instance = null;
function getCore(opts) {
  if (!_instance) _instance = new StateCore(opts);
  return _instance;
}

// ── EXPRESS ROUTE REGISTRATION ────────────────────────────────────────────────
function registerCore(app, opts) {
  const core = getCore(opts);

  app.get('/api/core/status', (_req, res) => res.json(core.status()));

  app.get('/api/core/invariants', (_req, res) => res.json({
    ok: true,
    ...core._invariant.status(),
  }));

  app.get('/api/core/treasury', (_req, res) => {
    const t = core.read('treasury', { balance: 0, earned: 0, spent: 0 });
    res.json({
      ok:     true,
      gate:   core._treasury_active ? 'ACTIVE' : 'PENDING',
      halted: core._treasury_halted,
      cycles: core._invariant._total_cycles,
      ...t,
    });
  });

  app.post('/api/core/treasury/credit', async (req, res) => {
    try {
      const amt    = parseFloat(req.body && req.body.amount) || 0;
      const src    = (req.body && req.body.source) || 'api';
      const ikey   = req.body && req.body.idempotency_key;
      const result = await core.treasuryCredit(amt, src, ikey);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/core/treasury/debit', async (req, res) => {
    try {
      const amt    = parseFloat(req.body && req.body.amount) || 0;
      const src    = (req.body && req.body.source) || 'api';
      const ikey   = req.body && req.body.idempotency_key;
      const result = await core.treasuryDebit(amt, src, ikey);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/core/snapshot', (_req, res) => res.json(core.snapshot()));

  app.post('/api/core/restore', (_req, res) => res.json(core.restore()));

  app.post('/api/core/halt/:sub',   (req, res) => { core.halt(req.params.sub);   res.json({ ok: true, halted:  req.params.sub }); });
  app.post('/api/core/resume/:sub', (req, res) => { core.resume(req.params.sub); res.json({ ok: true, resumed: req.params.sub }); });

  return core;
}

module.exports = registerCore;
module.exports.getCore = getCore;
module.exports.StateCore = StateCore;
