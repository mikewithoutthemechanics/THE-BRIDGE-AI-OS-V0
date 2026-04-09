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

var registry   = require('./agent-registry');
var validation = require('./validation');

// Graceful require for rate-limit
var rateLimit;
try { rateLimit = require('express-rate-limit'); } catch (_) {
  rateLimit = function() { return function(_req, _res, next) { next(); }; };
}

function requireAdmin(req, res, next) {
  var secret = req.headers['x-bridge-secret'];
  if (!secret || secret !== process.env.BRIDGE_INTERNAL_SECRET) {
    return res.status(403).json({ ok: false, error: 'Admin secret required' });
  }
  next();
}

function mount(app) {

  // ─── List all agents (with optional filters) ──────────────────────────
  app.get('/api/registry/agents',
    rateLimit({ windowMs: 60000, max: 1000, message: 'Too many requests' }),
    validation.validateRequest({
      layer:  { type: 'string', required: false },
      type:   { type: 'string', required: false },
      role:   { type: 'string', required: false },
      status: { type: 'string', required: false },
      limit:  { type: 'positive', required: false, default: 100 }
    }),
    async function(req, res) {
      try {
        var filter = {};
        if (req.query.layer)  filter.layer  = req.query.layer;
        if (req.query.type)   filter.type   = req.query.type;
        if (req.query.role)   filter.role   = req.query.role;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.limit)  filter.limit  = parseInt(req.query.limit);

        var hasFilter = Object.keys(filter).length > 0;
        var agents = hasFilter ? await registry.getByFilter(filter) : await registry.getAll();
        res.json({ ok: true, agents: agents, count: agents.length });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });

  // ─── Get agent by ID ──────────────────────────────────────────────────
  app.get('/api/registry/agents/:id', async function(req, res) {
    var agent = await registry.getById(req.params.id);
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' });
    res.json({ ok: true, agent: agent });
  });

  // ─── Get agent by name ────────────────────────────────────────────────
  app.get('/api/registry/agents/name/:name', async function(req, res) {
    var agent = await registry.getByName(req.params.name);
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' });
    res.json({ ok: true, agent: agent });
  });

  // ─── Register new agent ───────────────────────────────────────────────
  app.post('/api/registry/agents', async function(req, res) {
    try {
      var agent = await registry.register(req.body);
      res.status(201).json({ ok: true, agent: agent });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ─── Update agent ─────────────────────────────────────────────────────
  app.patch('/api/registry/agents/:id', async function(req, res) {
    try {
      var agent = await registry.update(req.params.id, req.body);
      res.json({ ok: true, agent: agent });
    } catch (e) {
      res.status(404).json({ ok: false, error: e.message });
    }
  });

  // ─── Remove agent ─────────────────────────────────────────────────────
  app.delete('/api/registry/agents/:id', async function(req, res) {
    try {
      var removed = await registry.remove(req.params.id);
      res.json({ ok: true, removed: removed });
    } catch (e) {
      res.status(404).json({ ok: false, error: e.message });
    }
  });

  // ─── Search agents ────────────────────────────────────────────────────
  app.get('/api/registry/search',
    rateLimit({ windowMs: 60000, max: 50, message: 'Too many requests' }),
    validation.validateRequest({
      q: { type: 'string', required: true, min: 3, max: 200 }
    }),
    async function(req, res) {
      var q = req.query.q || req.query.query || '';
      if (!q) return res.status(400).json({ ok: false, error: 'Query parameter "q" is required' });
      var results = await registry.search(q, parseInt(req.query.limit) || 50);
      res.json({ ok: true, results: results, count: results.length, query: q });
    });

  // ─── Registry stats ───────────────────────────────────────────────────
  app.get('/api/registry/stats', async function(_req, res) {
    res.json({ ok: true, ...(await registry.stats()) });
  });

  // ─── Agents grouped by layer ──────────────────────────────────────────
  app.get('/api/registry/layers', async function(_req, res) {
    var all = await registry.getAll();
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
  app.get('/api/registry/export', async function(_req, res) {
    var all = await registry.getAll();
    res.json({
      ok: true,
      version: '1.0',
      exported_at: new Date().toISOString(),
      agents: all,
      count: all.length,
    });
  });

// ─── Bulk import ──────────────────────────────────────────────────────
  app.post('/api/registry/import', requireAdmin, rateLimit({ windowMs: 60000, max: 10, message: 'Too many requests' }), async function(req, res) {
    try {
      const agents = req.body.agents;
      if (!Array.isArray(agents)) {
        return res.status(400).json({ ok: false, error: 'Body must contain an "agents" array' });
      }
      var imported = 0;
      var errors = [];
      for (var i = 0; i < agents.length; i++) {
        try {
          await registry.register(agents[i]);
          imported++;
        } catch (e) {
          errors.push({ index: i, name: agents[i].name, error: e.message });
        }
      }
      res.json({ ok: true, imported: imported, errors: errors, total: agents.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ─── Resolve agent (by name, old AGENT_DEFS key, or ID) ──────────────
  app.get('/api/registry/resolve/:nameOrId', async function(req, res) {
    var resolved = await registry.resolveAgentId(req.params.nameOrId);
    if (!resolved) return res.status(404).json({ ok: false, error: 'Could not resolve agent' });
    var agent = await registry.getById(resolved);
    res.json({ ok: true, resolved_id: resolved, agent: agent });
  });
}

module.exports = { mount: mount };
