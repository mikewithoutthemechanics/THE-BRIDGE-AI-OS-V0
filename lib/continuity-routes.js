// =============================================================================
// BRIDGE AI OS — Continuity Routes
//
// Scaffold for the twin-orchestration + bank-settled-expense system.
//
// Architecture:
//   Each digital twin runs with N sibling twins (default 2) on distinct
//   instances. A "lineage" is the root shared by a primary and its siblings.
//   Any expense incurred by any twin is posted to the Bank with an
//   idempotency key — siblings emit the same key for the same logical action,
//   so the Bank settles it exactly once across Layer 1/2/3.
//
// Store: in-memory for now. Swap to Postgres/Supabase when schema stabilizes;
//   the idempotency-key contract (UNIQUE index on idempotency_key) is the
//   only thing that MUST survive the migration.
// =============================================================================
'use strict';

const crypto = require('crypto');

// ── In-memory stores (replace with DB in production) ────────────────────────
const twins    = new Map();              // twin_id -> twin
const lineages = new Map();              // lineage_id -> { twin_ids: Set, conversions, credit_earned, payouts_settled }
const ledger   = [];                     // ordered list of settled events
const byIdem   = new Map();              // idempotency_key -> event (for dedup)
let   dupCount = 0;

// Layer allocation thresholds (USD). Expenses route to whichever Bank layer
// covers the amount. Override via env in deployment.
const LAYER_THRESHOLDS = {
  L1_MAX: Number(process.env.BANK_L1_MAX || 100),
  L2_MAX: Number(process.env.BANK_L2_MAX || 10000),
};

function layerFor(amount) {
  if (amount <= LAYER_THRESHOLDS.L1_MAX) return 'L1';
  if (amount <= LAYER_THRESHOLDS.L2_MAX) return 'L2';
  return 'L3';
}

function shortId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function makeTwin({ lineage_id, role }) {
  const id = shortId('twin');
  const twin = {
    id,
    lineage_id,
    role,                                 // 'primary' | 'sibling'
    status: 'live',
    heartbeat: new Date().toISOString(),
    siblings: [],
    created_at: new Date().toISOString(),
  };
  twins.set(id, twin);
  if (!lineages.has(lineage_id)) {
    lineages.set(lineage_id, {
      lineage_id, twin_count: 0, conversions: 0, credit_earned: 0, payouts_settled: 0,
      twin_ids: new Set(),
    });
  }
  const lin = lineages.get(lineage_id);
  lin.twin_ids.add(id);
  lin.twin_count = lin.twin_ids.size;
  return twin;
}

// ── Ledger primitive — idempotent expense settlement ────────────────────────
function postExpense({ twin_id, lineage_id, type, amount, idempotency_key, meta }) {
  if (!idempotency_key) {
    throw new Error('idempotency_key is required — siblings must co-operate on this');
  }
  // Dedup: siblings emit the same key for the same logical action.
  if (byIdem.has(idempotency_key)) {
    dupCount++;
    const existing = byIdem.get(idempotency_key);
    return { ...existing, duplicate: true };
  }
  const event = {
    id: shortId('evt'),
    ts: new Date().toISOString(),
    type: type || 'expense.incurred',
    twin_id: twin_id || null,
    lineage_id: lineage_id || null,
    amount: Number(amount) || 0,
    layer: layerFor(Number(amount) || 0),
    idempotency_key,
    status: 'settled',
    meta: meta || null,
  };
  ledger.push(event);
  byIdem.set(idempotency_key, event);

  // Affiliate payouts bump lineage credit
  if (event.type === 'affiliate.payout' && lineage_id && lineages.has(lineage_id)) {
    const lin = lineages.get(lineage_id);
    lin.payouts_settled += 1;
    lin.credit_earned += event.amount;
  }
  return event;
}

function layerTotals() {
  const totals = { L1: 0, L2: 0, L3: 0 };
  for (const e of ledger) totals[e.layer] += e.amount;
  return totals;
}

function dedupRatio() {
  const attempts = ledger.length + dupCount;
  return attempts > 0 ? dupCount / attempts : 0;
}

// ── Route wiring ────────────────────────────────────────────────────────────
function registerContinuityRoutes(app, { requireAdmin } = {}) {
  if (typeof requireAdmin !== 'function') {
    throw new Error('registerContinuityRoutes: requireAdmin middleware must be provided');
  }

  // Spawn a primary twin + N siblings sharing a lineage.
  // Emits one expense.incurred for compute setup (keyed by lineage_id).
  app.post('/api/twin/spawn', requireAdmin, (req, res) => {
    const siblingCount = Math.max(0, Math.min(8, Number(req.body?.siblings ?? 2)));
    const lineage_id = shortId('lin');
    const primary = makeTwin({ lineage_id, role: 'primary' });
    const siblings = [];
    for (let i = 0; i < siblingCount; i++) {
      siblings.push(makeTwin({ lineage_id, role: 'sibling' }));
    }
    primary.siblings = siblings.map((s) => s.id);

    // Compute setup expense — same idem key across all spawned twins in this lineage.
    const event = postExpense({
      twin_id: primary.id,
      lineage_id,
      type: 'expense.incurred',
      amount: 2 + siblingCount * 1.5,       // scaffold: flat setup cost per twin
      idempotency_key: 'spawn:' + lineage_id,
      meta: { action: 'twin_spawn', siblings: siblingCount },
    });

    res.json({ ok: true, lineage_id, primary, siblings, event });
  });

  app.get('/api/twin/supervisor', requireAdmin, (_req, res) => {
    // Touch heartbeats so the UI shows live activity.
    for (const t of twins.values()) t.heartbeat = new Date().toISOString();
    res.json({ ok: true, twins: Array.from(twins.values()) });
  });

  app.post('/api/twin/stop-all', requireAdmin, (_req, res) => {
    const count = twins.size;
    twins.clear();
    lineages.clear();
    res.json({ ok: true, stopped: count });
  });

  app.get('/api/twin/lineages', requireAdmin, (_req, res) => {
    const out = Array.from(lineages.values()).map((l) => ({
      lineage_id: l.lineage_id,
      twin_count: l.twin_count,
      conversions: l.conversions,
      credit_earned: l.credit_earned,
      payouts_settled: l.payouts_settled,
    }));
    res.json({ ok: true, lineages: out });
  });

  // Post an expense — called by twin runtimes. Siblings cooperate via shared key.
  app.post('/api/bank/expense', requireAdmin, (req, res) => {
    const { twin_id, lineage_id, type, amount, idempotency_key, meta } = req.body || {};
    if (!idempotency_key) {
      return res.status(400).json({ ok: false, error: 'idempotency_key required' });
    }
    try {
      const event = postExpense({ twin_id, lineage_id, type, amount, idempotency_key, meta });
      res.json({ ok: true, event });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err.message || err) });
    }
  });

  app.get('/api/bank/ledger', requireAdmin, (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const typeFilter = req.query.type ? String(req.query.type) : null;
    let events = ledger.slice(-limit).reverse();
    if (typeFilter) events = events.filter((e) => e.type === typeFilter);
    res.json({ ok: true, events });
  });

  app.get('/api/bank/summary', requireAdmin, (_req, res) => {
    const totals = layerTotals();
    res.json({
      ok: true,
      ...totals,
      total: totals.L1 + totals.L2 + totals.L3,
      entries: ledger.length,
      duplicates_discarded: dupCount,
      dedup_ratio: dedupRatio(),
      thresholds: LAYER_THRESHOLDS,
    });
  });

  return {
    // exported for testing / other modules
    _postExpense: postExpense,
    _twins: twins,
    _ledger: ledger,
  };
}

module.exports = { registerContinuityRoutes };
