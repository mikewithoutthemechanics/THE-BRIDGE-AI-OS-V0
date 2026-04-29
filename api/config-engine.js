// =============================================================================
// BRIDGE AI OS — Config Intelligence Engine REST API  v2
//
// Public (no auth):
//   GET  /api/config-engine/health       — engine liveness + status
//   GET  /api/config-engine/stream       — SSE: real-time hot-reload events
//
// Admin (bridge_token cookie or Authorization header):
//   GET  /api/config-engine/state        — full merged active config state
//   GET  /api/config-engine/cio          — all CIO identity objects (?status=active)
//   GET  /api/config-engine/cio/:hash    — single CIO (full payload) by hash
//   GET  /api/config-engine/registry     — recent events (?type=&limit=)
//   GET  /api/config-engine/snapshot     — latest snapshot info + archive list
//   GET  /api/config-engine/drift        — live drift report
//   GET  /api/config-engine/anomalies    — anomaly scan result
//   GET  /api/config-engine/docs         — auto-generated reports (?format=summary|validation|scores)
//   GET  /api/config-engine/scores       — all CIOs ranked by score
//   GET  /api/config-engine/lineage/:id  — full lineage chain for logical CIO id
//   GET  /api/config-engine/deps         — dependency graph + topological order
//   POST /api/config-engine/reconcile    — trigger immediate reconcile cycle
//   POST /api/config-engine/replay       — replay events + return reconstructed state
//   POST /api/config-engine/activate/:hash — manually promote a CIO to active
//   POST /api/config-engine/reload       — force hot-reload a specific file path
// =============================================================================
'use strict';

let engine = null;
try { engine = require('../engine/config-intelligence'); } catch (_) {}

function engineReady(res) {
  if (!engine || !engine.isStarted()) {
    res.status(503).json({ ok: false, error: 'Config Intelligence Engine not started' });
    return false;
  }
  return true;
}

function hasAuth(req) {
  return !!(req.cookies?.bridge_token || req.headers.authorization);
}

// ── Route handler ─────────────────────────────────────────────────────────────
async function handleConfigEngine(req, res) {
  const p      = (req.path || req.url || '').split('?')[0];
  const method = req.method;

  // ── Health (public) ──────────────────────────────────────────────────────
  if (p === '/api/config-engine/health' && method === 'GET') {
    return res.json({
      ok:         true,
      started:    engine?.isStarted() || false,
      reconciler: engine?.reconciler?.status() || null,
      watcher:    { running: engine?.watcher?.isRunning() || false },
      store:      engine?.store?.stats() || null,
      registry:   engine?.registry?.stats() || null,
      ts:         Date.now(),
    });
  }

  // ── SSE stream (public — no auth needed to observe hot-reload events) ────
  if (p === '/api/config-engine/stream' && method === 'GET') {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    // Register as SSE client
    if (engine?.hotReload) {
      engine.hotReload.registerSSEClient(res);
    }

    // Send a heartbeat every 25s to keep the connection alive through load balancers
    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
    }, 25000);

    // Send initial connected message
    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now(), message: 'Config Intelligence Engine SSE connected' })}\n\n`);

    req.on('close', () => {
      clearInterval(heartbeat);
      if (engine?.hotReload) engine.hotReload.unregisterSSEClient(res);
    });

    return; // response kept open — do not send further
  }

  // All other endpoints require auth
  if (!hasAuth(req)) {
    return res.status(401).json({ ok: false, error: 'Auth required' });
  }
  if (!engineReady(res)) return;

  // ── State ────────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/state' && method === 'GET') {
    return res.json({ ok: true, state: engine.getMerged() });
  }

  // ── CIO list ─────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/cio' && method === 'GET') {
    let cios = engine.store.all().map(c => c.toJSON());
    if (req.query.status) cios = cios.filter(c => c.status === req.query.status);
    if (req.query.type)   cios = cios.filter(c => c.type   === req.query.type);
    if (req.query.ns)     cios = cios.filter(c => c.namespace.includes(req.query.ns));
    return res.json({ ok: true, count: cios.length, cios });
  }

  // ── Single CIO (with full payload) ───────────────────────────────────────
  if (p.startsWith('/api/config-engine/cio/') && method === 'GET') {
    const hash = p.split('/').pop();
    const cio  = engine.store.getByHash(hash) || engine.store.getById(hash);
    if (!cio) return res.status(404).json({ ok: false, error: 'CIO not found' });
    return res.json({ ok: true, cio: cio.toFullJSON() });
  }

  // ── Registry events ───────────────────────────────────────────────────────
  if (p === '/api/config-engine/registry' && method === 'GET') {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 500);
    const type   = req.query.type || null;
    const events = engine.registry.getEvents({ type, limit });
    return res.json({ ok: true, stats: engine.registry.stats(), events });
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/snapshot' && method === 'GET') {
    const verify  = engine.snapshot.verify();
    const archive = engine.snapshot.listArchive().slice(0, 10);
    return res.json({ ok: true, ...verify, archive });
  }

  // ── Drift ─────────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/drift' && method === 'GET') {
    const active    = engine.store.allActive();
    const varActive = active.filter(c => c.type === 'var');
    return res.json({ ok: true, drift: engine.drift.scan(active, varActive) });
  }

  // ── Anomalies ─────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/anomalies' && method === 'GET') {
    return res.json({ ok: true, anomalies: engine.anomaly.scan() });
  }

  // ── Docs ─────────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/docs' && method === 'GET') {
    const format = req.query.format || 'summary';
    const text   = engine.getDocs(format);
    if (req.query.raw === '1') return res.type('text/plain').send(text);
    return res.json({ ok: true, format, content: text });
  }

  // ── Scores ───────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/scores' && method === 'GET') {
    const all   = engine.store.all();
    const sets  = {
      configs: all.filter(c => c.type === 'config'),
      vars:    all.filter(c => c.type === 'var'),
      secrets: all.filter(c => c.type === 'secret'),
    };
    const scored = engine.scorer.scoreAll(sets, { passed: [], failed: [], warnings: [] });
    return res.json({ ok: true, count: scored.length, scores: scored });
  }

  // ── Lineage ───────────────────────────────────────────────────────────────
  if (p.startsWith('/api/config-engine/lineage/') && method === 'GET') {
    const id = p.split('/').pop();
    return res.json({
      ok:          true,
      id,
      chain:       engine.lineage.getChain(id),
      fromEvents:  engine.lineage.getChainFromEvents(id),
    });
  }

  // ── Dependency graph ──────────────────────────────────────────────────────
  if (p === '/api/config-engine/deps' && method === 'GET') {
    const all   = engine.store.all();
    const sets  = { configs: all.filter(c => c.type === 'config'), vars: all.filter(c => c.type === 'var'), secrets: all.filter(c => c.type === 'secret') };
    const graph = engine.dependency.buildGraph(sets);
    const topo  = engine.dependency.topologicalSort(graph);
    return res.json({ ok: true, nodes: graph.nodes, edges: graph.edges, deadEdges: graph.deadEdges, activationOrder: topo.sorted, hasCycle: topo.hasCycle });
  }

  // ── Trigger reconcile ─────────────────────────────────────────────────────
  if (p === '/api/config-engine/reconcile' && method === 'POST') {
    const result = await engine.reconciler.runCycle();
    return res.json({ ok: result?.ok || false, ...result });
  }

  // ── Replay ───────────────────────────────────────────────────────────────
  if (p === '/api/config-engine/replay' && method === 'POST') {
    const { fromSnapshot = true, afterTs = 0 } = req.body || {};
    const state = engine.replay.replay({ fromSnapshot, afterTs });
    return res.json({ ok: true, replayedCount: state.replayedCount, skippedCount: state.skippedCount, cioCount: Object.keys(state.cioIndex).length });
  }

  // ── Manual CIO activation ─────────────────────────────────────────────────
  if (p.startsWith('/api/config-engine/activate/') && method === 'POST') {
    const hash = p.split('/').pop();
    const cio  = engine.store.getByHash(hash);
    if (!cio) return res.status(404).json({ ok: false, error: `CIO ${hash} not found` });
    if (cio.status === 'active') return res.json({ ok: true, message: 'already active', cio: cio.toJSON() });

    // Supersede current active for this namespace
    const currentActive = engine.store.allActive()
      .find(c => c.namespace === cio.namespace && c.type === cio.type);
    if (currentActive) engine.store.add(currentActive.withStatus('superseded'));

    const activated = cio.withStatus('active', { activeSince: Date.now() });
    engine.store.add(activated);
    engine.registry.emit('CIO_ACTIVATED', { cioId: activated.id, namespace: activated.namespace, trigger: 'manual-api' }, activated.hash);

    return res.json({ ok: true, message: 'activated', cio: activated.toJSON(), superseded: currentActive?.id || null });
  }

  // ── Force hot-reload a specific file ──────────────────────────────────────
  if (p === '/api/config-engine/reload' && method === 'POST') {
    const { filePath } = req.body || {};
    if (!filePath) return res.status(400).json({ ok: false, error: 'filePath required' });
    const result = await engine.hotReload.processChange(filePath);
    return res.json(result);
  }

  return null; // not handled
}

module.exports = { handleConfigEngine };
