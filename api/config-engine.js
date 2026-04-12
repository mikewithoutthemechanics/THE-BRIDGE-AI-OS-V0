// =============================================================================
// BRIDGE AI OS — Config Intelligence Engine REST API
//
// Endpoints (all require admin auth except GET /api/config-engine/health):
//
//   GET  /api/config-engine/health       — engine liveness + status
//   GET  /api/config-engine/state        — full merged active config state
//   GET  /api/config-engine/cio          — all CIO identity objects
//   GET  /api/config-engine/cio/:hash    — single CIO by hash
//   GET  /api/config-engine/registry     — recent registry events
//   GET  /api/config-engine/snapshot     — latest snapshot info
//   GET  /api/config-engine/drift        — latest drift report
//   GET  /api/config-engine/anomalies    — anomaly scan results
//   GET  /api/config-engine/docs         — auto-generated system summary
//   GET  /api/config-engine/scores       — all CIO scores ranked
//   GET  /api/config-engine/lineage/:id  — lineage chain for a CIO
//   GET  /api/config-engine/deps         — dependency graph
//   POST /api/config-engine/reconcile    — trigger immediate reconcile cycle
//   POST /api/config-engine/replay       — replay events and return state
// =============================================================================
'use strict';

let engine = null;
try { engine = require('../engine/config-intelligence'); } catch (_) {}

function requireEngine(res) {
  if (!engine || !engine.isStarted()) {
    res.status(503).json({ ok: false, error: 'Config Intelligence Engine not started' });
    return false;
  }
  return true;
}

// Simple admin guard — reuse existing requireAdmin middleware if mounted via server.js
function adminGuard(req, res, next) {
  // If mounted in server.js, requireAdmin middleware is applied upstream.
  // This fallback checks for bearer token matching ADMIN_SECRET.
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const adminSecret = process.env.ADMIN_SECRET || process.env.JWT_SECRET;
  if (!adminSecret || token !== adminSecret) {
    // Also accept bridge_token cookie from admin session
    const cookieToken = req.cookies?.bridge_token;
    if (!cookieToken) {
      return res.status(401).json({ ok: false, error: 'Admin authentication required' });
    }
  }
  next();
}

// ── Route handler ─────────────────────────────────────────────────────────────
async function handleConfigEngine(req, res) {
  const p = (req.path || req.url || '').split('?')[0];
  const method = req.method;

  // ── Health (public) ──────────────────────────────────────────────────────
  if (p === '/api/config-engine/health' && method === 'GET') {
    const started = engine?.isStarted() || false;
    const reconcilerStatus = engine?.reconciler?.status() || {};
    return res.json({
      ok:         true,
      started,
      reconciler: reconcilerStatus,
      registry:   engine?.registry?.stats() || null,
      ts:         Date.now(),
    });
  }

  // All other endpoints require admin auth
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const cookieToken = req.cookies?.bridge_token;
  if (!token && !cookieToken) {
    return res.status(401).json({ ok: false, error: 'Auth required' });
  }

  if (!requireEngine(res)) return;

  // ── State ────────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/state' && method === 'GET') {
    const merged = engine.getMerged();
    return res.json({ ok: true, state: merged });
  }

  // ── CIO list ─────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/cio' && method === 'GET') {
    const cios = engine.store.all().map(c => c.toJSON());
    const status = req.query.status;
    const filtered = status ? cios.filter(c => c.status === status) : cios;
    return res.json({ ok: true, count: filtered.length, cios: filtered });
  }

  // ── Single CIO ────────────────────────────────────────────────────────────
  if (p.startsWith('/api/config-engine/cio/') && method === 'GET') {
    const hash = p.split('/').pop();
    const cio = engine.store.getByHash(hash);
    if (!cio) return res.status(404).json({ ok: false, error: 'CIO not found' });
    return res.json({ ok: true, cio: cio.toFullJSON() });
  }

  // ── Registry ──────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/registry' && method === 'GET') {
    const limit = parseInt(req.query.limit) || 50;
    const type  = req.query.type || null;
    const events = engine.registry.getEvents({ type, limit });
    const stats  = engine.registry.stats();
    return res.json({ ok: true, stats, events });
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/snapshot' && method === 'GET') {
    const { verified, hash, savedAt } = engine.snapshot.verify();
    const archive = engine.snapshot.listArchive().slice(0, 10);
    return res.json({ ok: true, verified, hash, savedAt, archive });
  }

  // ── Drift ────────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/drift' && method === 'GET') {
    const activeCIOs    = engine.store.allActive();
    const activeVarCIOs = activeCIOs.filter(c => c.type === 'var');
    const report = engine.drift.scan(activeCIOs, activeVarCIOs);
    return res.json({ ok: true, drift: report });
  }

  // ── Anomalies ─────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/anomalies' && method === 'GET') {
    const report = engine.anomaly.scan();
    return res.json({ ok: true, anomalies: report });
  }

  // ── Docs ─────────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/docs' && method === 'GET') {
    const format = req.query.format || 'summary';
    const text   = engine.getDocs(format);
    if (req.query.raw === 'true') {
      return res.type('text/plain').send(text);
    }
    return res.json({ ok: true, format, content: text });
  }

  // ── Scores ───────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/scores' && method === 'GET') {
    const allCIOs = engine.store.all();
    const sets = {
      configs: allCIOs.filter(c => c.type === 'config'),
      vars:    allCIOs.filter(c => c.type === 'var'),
      secrets: allCIOs.filter(c => c.type === 'secret'),
    };
    const scored = engine.scorer.scoreAll(sets, { passed: [], failed: [], warnings: [] });
    return res.json({ ok: true, count: scored.length, scores: scored });
  }

  // ── Lineage ───────────────────────────────────────────────────────────────
  if (p.startsWith('/api/config-engine/lineage/') && method === 'GET') {
    const id    = p.split('/').pop();
    const chain = engine.lineage.getChain(id);
    const fromEvents = engine.lineage.getChainFromEvents(id);
    return res.json({ ok: true, id, chain, fromEvents });
  }

  // ── Dependency graph ──────────────────────────────────────────────────────
  if (p === '/api/config-engine/deps' && method === 'GET') {
    const allCIOs = engine.store.all();
    const sets = {
      configs: allCIOs.filter(c => c.type === 'config'),
      vars:    allCIOs.filter(c => c.type === 'var'),
      secrets: allCIOs.filter(c => c.type === 'secret'),
    };
    const graph = engine.dependency.buildGraph(sets);
    const topo  = engine.dependency.topologicalSort(graph);
    return res.json({ ok: true, nodes: graph.nodes, edges: graph.edges, deadEdges: graph.deadEdges, activationOrder: topo.sorted, hasCycle: topo.hasCycle });
  }

  // ── Trigger reconcile ─────────────────────────────────────────────────────
  if (p === '/api/config-engine/reconcile' && method === 'POST') {
    const result = await engine.reconciler.runCycle();
    return res.json({ ok: result.ok, ...result });
  }

  // ── Replay ───────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/replay' && method === 'POST') {
    const { fromSnapshot = true, afterTs = 0 } = req.body || {};
    const state = engine.replay.replay({ fromSnapshot, afterTs });
    return res.json({
      ok:            true,
      replayedCount: state.replayedCount,
      skippedCount:  state.skippedCount,
      cioCount:      Object.keys(state.cioIndex).length,
    });
  }

  return null; // not handled
}

module.exports = { handleConfigEngine };
