/**
 * BRIDGE AI OS — Agent Registry REST Routes
 *
 * Mounts on: /api/registry/*
 * Full CRUD for the unified agent database.
 *
 * GET    /api/registry/agents          — List all agents (filterable)
 * GET    /api/registry/agents/:id      — Get agent by ID
 * GET    /api/registry/agents/name/:n  — Get agent by name
 * POST   /api/registry/agents          — Register new agent
 * PATCH  /api/registry/agents/:id      — Update agent
 * DELETE /api/registry/agents/:id      — Remove agent
 * GET    /api/registry/search?q=       — Search agents
 * GET    /api/registry/stats           — Registry statistics
 * GET    /api/registry/layers          — Group by layer
 * GET    /api/registry/export          — Full export (JSON)
 * POST   /api/registry/import          — Bulk import agents
 */

'use strict';

var registry = require('./agent-registry');

function mount(app) {

  // ─── List all agents (with optional filters) ──────────────────────────
  app.get('/api/registry/agents', function(req, res) {
    try {
      var filter = {};
      if (req.query.layer)  filter.layer  = req.query.layer;
      if (req.query.type)   filter.type   = req.query.type;
      if (req.query.role)   filter.role   = req.query.role;
      if (req.query.status) filter.status = req.query.status;
      if (req.query.limit)  filter.limit  = parseInt(req.query.limit);

      var hasFilter = Object.keys(filter).length > 0;
      var agents = hasFilter ? registry.getByFilter(filter) : registry.getAll();
      res.json({ ok: true, agents: agents, count: agents.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ─── Get agent by ID ──────────────────────────────────────────────────
  app.get('/api/registry/agents/:id', function(req, res) {
    var agent = registry.getById(req.params.id);
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' });
    res.json({ ok: true, agent: agent });
  });

  // ─── Get agent by name ────────────────────────────────────────────────
  app.get('/api/registry/agents/name/:name', function(req, res) {
    var agent = registry.getByName(req.params.name);
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' });
    res.json({ ok: true, agent: agent });
  });

  // ─── Register new agent ───────────────────────────────────────────────
  app.post('/api/registry/agents', function(req, res) {
    try {
      var agent = registry.register(req.body);
      res.status(201).json({ ok: true, agent: agent });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ─── Update agent ─────────────────────────────────────────────────────
  app.patch('/api/registry/agents/:id', function(req, res) {
    try {
      var agent = registry.update(req.params.id, req.body);
      res.json({ ok: true, agent: agent });
    } catch (e) {
      res.status(404).json({ ok: false, error: e.message });
    }
  });

  // ─── Remove agent ─────────────────────────────────────────────────────
  app.delete('/api/registry/agents/:id', function(req, res) {
    try {
      var removed = registry.remove(req.params.id);
      res.json({ ok: true, removed: removed });
    } catch (e) {
      res.status(404).json({ ok: false, error: e.message });
    }
  });

  // ─── Search agents ────────────────────────────────────────────────────
  app.get('/api/registry/search', function(req, res) {
    var q = req.query.q || req.query.query || '';
    if (!q) return res.status(400).json({ ok: false, error: 'Query parameter "q" is required' });
    var results = registry.search(q, parseInt(req.query.limit) || 50);
    res.json({ ok: true, results: results, count: results.length, query: q });
  });

  // ─── Registry stats ───────────────────────────────────────────────────
  app.get('/api/registry/stats', function(_req, res) {
    res.json({ ok: true, ...registry.stats() });
  });

  // ─── Agents grouped by layer ──────────────────────────────────────────
  app.get('/api/registry/layers', function(_req, res) {
    var all = registry.getAll();
    var byLayer = {};
    all.forEach(function(a) {
      if (!byLayer[a.layer]) byLayer[a.layer] = [];
      byLayer[a.layer].push(a);
    });
    var summary = {};
    Object.keys(byLayer).forEach(function(layer) {
      summary[layer] = {
        count: byLayer[layer].length,
        agents: byLayer[layer].map(function(a) {
          return { id: a.id, name: a.name, role: a.role, status: a.status };
        }),
      };
    });
    res.json({ ok: true, layers: summary, total: all.length });
  });

  // ─── Full export ──────────────────────────────────────────────────────
  app.get('/api/registry/export', function(_req, res) {
    var all = registry.getAll();
    res.json({
      ok: true,
      version: '1.0',
      exported_at: new Date().toISOString(),
      agents: all,
      count: all.length,
    });
  });

  // ─── Bulk import ──────────────────────────────────────────────────────
  app.post('/api/registry/import', function(req, res) {
    var agents = req.body.agents;
    if (!Array.isArray(agents)) {
      return res.status(400).json({ ok: false, error: 'Body must contain an "agents" array' });
    }
    var imported = 0;
    var errors = [];
    agents.forEach(function(a, i) {
      try {
        registry.register(a);
        imported++;
      } catch (e) {
        errors.push({ index: i, name: a.name, error: e.message });
      }
    });
    res.json({ ok: true, imported: imported, errors: errors, total: agents.length });
  });

  // ─── Resolve agent (by name, old AGENT_DEFS key, or ID) ──────────────
  app.get('/api/registry/resolve/:nameOrId', function(req, res) {
    var resolved = registry.resolveAgentId(req.params.nameOrId);
    if (!resolved) return res.status(404).json({ ok: false, error: 'Could not resolve agent' });
    var agent = registry.getById(resolved);
    res.json({ ok: true, resolved_id: resolved, agent: agent });
  });
}

module.exports = { mount: mount };
