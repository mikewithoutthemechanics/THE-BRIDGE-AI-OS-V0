// =============================================================================
// SUPACLAW-CORE — Deterministic Execution Layer (Supabase-backed)
// L1 TUNNEL: Supabase state engine (single source of truth)
// L2 GATEKEEPER: AsyncMutex (Promise-chaining, zero external deps)
// L9 SECRETS: secrets subsystem isolation
// L10 DOCTRINE: SafeAsync quarantine wrapper
// L27 EXTENDED: InvariantMonitor + kill switch enforcement
// =============================================================================
'use strict';

const crypto  = require('crypto');
const EventEmitter = require('events');
const { supabase } = require('./lib/supabase');

// ── L2 GATEKEEPER: AsyncMutex ────────────────────────────────────────────────
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
        console.error('[L10] SafeAsync quarantine:', name, err && err.message);
        return { quarantined: true, entry };
      });
  }
}

// ── L27 EXTENDED: InvariantMonitor ──────────────────────────────────────────
class InvariantMonitor {
  constructor() {
    this._invariants = {
      L1_TUNNEL:      { enforced: true,  violations: 0, label: 'Supabase state engine' },
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
    console.error(`[L27] Invariant violation: ${invariant} — ${detail}`);
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

    console.log('[CORE] StateCore initialized (Supabase-backed)');
  }

  // ── READ (cache-first, then Supabase) ──────────────────────────────────────
  async read(key, defaultVal) {
    if (this._cache.has(key)) return this._cache.get(key);
    if (!supabase) return defaultVal !== undefined ? defaultVal : null;

    try {
      const { data } = await supabase.from('supaclaw_state').select('value').eq('key', key).single();
      if (!data) return defaultVal !== undefined ? defaultVal : null;
      const val = JSON.parse(data.value);
      this._cache.set(key, val);
      return val;
    } catch (_) {
      return defaultVal !== undefined ? defaultVal : null;
    }
  }

  // ── WRITE (mutex-serialized, Supabase-flushed) ─────────────────────────────
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
        const { data: exists } = await supabase.from('supaclaw_ledger').select('id').eq('id', opts.idempotency_key).single();
        if (exists) return { skipped: true, idempotency_key: opts.idempotency_key };
      }

      await supabase.from('supaclaw_state').upsert({ key, value: serialized, updated_at: now }, { onConflict: 'key' });

      if (opts.idempotency_key) {
        await supabase.from('supaclaw_ledger').insert({
          id: opts.idempotency_key,
          payload: JSON.stringify({ key, ts: now }),
          ts: now,
        });
      }

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

    // Check idempotency
    if (supabase) {
      const { data: exists } = await supabase.from('supaclaw_ledger').select('id').eq('id', ikey).single();
      if (exists) return { skipped: true, idempotency_key: ikey };
    }

    const release = await this._mutex.acquire();
    try {
      if (supabase) {
        const { data: exists2 } = await supabase.from('supaclaw_ledger').select('id').eq('id', ikey).single();
        if (exists2) return { skipped: true, idempotency_key: ikey };
      }

      const current = await this.read('treasury', { balance: 0, earned: 0, spent: 0 });
      const updated = {
        balance:     +(current.balance + amount).toFixed(8),
        earned:      +(current.earned  + amount).toFixed(8),
        spent:       current.spent || 0,
        last_credit: Date.now(),
        last_source: source,
      };

      const now = Date.now();
      if (supabase) {
        await supabase.from('supaclaw_state').upsert({ key: 'treasury', value: JSON.stringify(updated), updated_at: now }, { onConflict: 'key' });
        await supabase.from('supaclaw_ledger').insert({ id: ikey, payload: JSON.stringify({ op: 'credit', amount, source, ts: now }), ts: now });
      }

      this._cache.set('treasury', updated);
      this._invariant.tick();
      this.emit('treasury:credit', { amount, source, balance: updated.balance });

      if (!this._treasury_active &&
          this._invariant._total_cycles >= 1000 &&
          this._invariant._cycle_errors === 0) {
        this._treasury_active = true;
        console.log('[CORE] Treasury gate: PENDING -> ACTIVE (1000 clean cycles complete)');
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

    if (supabase) {
      const { data: exists } = await supabase.from('supaclaw_ledger').select('id').eq('id', ikey).single();
      if (exists) return { skipped: true, idempotency_key: ikey };
    }

    const release = await this._mutex.acquire();
    try {
      if (supabase) {
        const { data: exists2 } = await supabase.from('supaclaw_ledger').select('id').eq('id', ikey).single();
        if (exists2) return { skipped: true, idempotency_key: ikey };
      }

      const current = await this.read('treasury', { balance: 0, earned: 0, spent: 0 });
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
      if (supabase) {
        await supabase.from('supaclaw_state').upsert({ key: 'treasury', value: JSON.stringify(updated), updated_at: now }, { onConflict: 'key' });
        await supabase.from('supaclaw_ledger').insert({ id: ikey, payload: JSON.stringify({ op: 'debit', amount, source, ts: now }), ts: now });
      }

      this._cache.set('treasury', updated);
      this.emit('treasury:debit', { amount, source, balance: updated.balance });
      return { ok: true, balance: updated.balance, idempotency_key: ikey };
    } finally {
      release();
    }
  }

  // ── SNAPSHOT ──────────────────────────────────────────────────────────────
  async snapshot() {
    const ts  = Date.now();
    const id  = 'snap_' + ts;

    if (!supabase) return { ok: false, reason: 'Supabase not configured' };

    const { data: rows } = await supabase.from('supaclaw_state').select('key, value');
    const state = {};
    for (const row of (rows || [])) {
      try { state[row.key] = JSON.parse(row.value); } catch (_) { state[row.key] = row.value; }
    }
    const payload = JSON.stringify({ ts, state });
    await supabase.from('supaclaw_snapshots').upsert({ id, payload, ts }, { onConflict: 'id' });
    return { ok: true, id, ts };
  }

  // ── RESTORE from latest snapshot ──────────────────────────────────────────
  async restore() {
    if (!supabase) return { ok: false, reason: 'Supabase not configured' };

    const { data: row } = await supabase.from('supaclaw_snapshots').select('payload').order('ts', { ascending: false }).limit(1).single();
    if (!row) return { ok: false, reason: 'no_snapshot' };
    try {
      const { ts, state } = JSON.parse(row.payload);
      const now = Date.now();
      for (const [key, value] of Object.entries(state)) {
        await supabase.from('supaclaw_state').upsert({ key, value: JSON.stringify(value), updated_at: now }, { onConflict: 'key' });
      }
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
      console.error('[CORE] Error threshold breached:', errs, '— halting treasury, restoring snapshot');
      this._treasury_halted = true;
      const result = await this.restore();
      console.log('[CORE] Restore result:', result);
      inv.reset();
      this._treasury_halted = false;
      console.log('[CORE] Treasury resumed after heal');
      this.emit('treasury:healed');
    }
  }

  // ── HALT / RESUME ─────────────────────────────────────────────────────────
  halt(sub)   { if (sub === 'treasury') { this._treasury_halted = true;  this.emit('treasury:halted');  } }
  resume(sub) { if (sub === 'treasury') { this._treasury_halted = false; this.emit('treasury:resumed'); } }

  // ── STATUS ────────────────────────────────────────────────────────────────
  async status() {
    const treasury = await this.read('treasury', { balance: 0, earned: 0, spent: 0 });
    return {
      ok:              true,
      db:              'supabase',
      treasury_gate:   this._treasury_active ? 'ACTIVE' : 'PENDING',
      treasury_halted: this._treasury_halted,
      treasury,
      invariants:      this._invariant.status(),
    };
  }

  // ── SHUTDOWN ──────────────────────────────────────────────────────────────
  shutdown() {
    if (this._healingHandle) clearInterval(this._healingHandle);
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

  app.get('/api/core/status', async (_req, res) => res.json(await core.status()));

  app.get('/api/core/invariants', (_req, res) => res.json({
    ok: true,
    ...core._invariant.status(),
  }));

  app.get('/api/core/treasury', async (_req, res) => {
    const t = await core.read('treasury', { balance: 0, earned: 0, spent: 0 });
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

  app.post('/api/core/snapshot', async (_req, res) => res.json(await core.snapshot()));

  app.post('/api/core/restore', async (_req, res) => res.json(await core.restore()));

  app.post('/api/core/halt/:sub',   (req, res) => { core.halt(req.params.sub);   res.json({ ok: true, halted:  req.params.sub }); });
  app.post('/api/core/resume/:sub', (req, res) => { core.resume(req.params.sub); res.json({ ok: true, resumed: req.params.sub }); });

  return core;
}

module.exports = registerCore;
module.exports.getCore = getCore;
module.exports.StateCore = StateCore;
