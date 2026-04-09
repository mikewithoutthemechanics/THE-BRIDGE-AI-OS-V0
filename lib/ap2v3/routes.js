/**
 * BRIDGE AI OS — AP2-v3 Routes
 *
 * Express route registration for the AP2-v3 orchestration engine.
 *
 *   POST   /v3/execute         — execute a single named agent
 *   POST   /v3/process         — auto-route via intent parsing
 *   POST   /v3/chain           — execute an explicit multi-agent chain
 *   GET    /v3/stream/:agent   — SSE streaming execution
 *   GET    /v3/memory/:session — get session memory
 *   DELETE /v3/memory/:session — clear session memory
 *   GET    /v3/agents          — list all agents with status
 *   GET    /v3/events          — get event bus log
 *   GET    /v3/health          — v3 system health
 */

'use strict';

const crypto = require('crypto');

// Graceful requires — each module may fail independently
let Orchestrator, agents, memory, bus, resilience, streaming, contract;

try { Orchestrator = require('./orchestrator'); } catch (e) { console.warn('[AP2-v3] Orchestrator unavailable:', e.message); }
try { agents = require('./agents'); } catch (e) { console.warn('[AP2-v3] Agents unavailable:', e.message); }
try { memory = require('./memory'); } catch (e) { console.warn('[AP2-v3] Memory unavailable:', e.message); }
try { bus = require('./message-bus'); } catch (e) { console.warn('[AP2-v3] MessageBus unavailable:', e.message); }
try { resilience = require('./resilience'); } catch (e) { console.warn('[AP2-v3] Resilience unavailable:', e.message); }
try { streaming = require('./streaming'); } catch (e) { console.warn('[AP2-v3] Streaming unavailable:', e.message); }
try { contract = require('./contract'); } catch (e) { console.warn('[AP2-v3] Contract unavailable:', e.message); }

const BOOT_TIME = new Date().toISOString();
let orchestrator = null;
try { if (Orchestrator) orchestrator = new Orchestrator(); } catch (_) { /* will be null */ }

/**
 * Generate a session ID if none provided.
 * @returns {string}
 */
function ensureSession(sessionId) {
  return sessionId || 'sess_' + crypto.randomBytes(8).toString('hex');
}

/**
 * Register all AP2-v3 routes on the Express app.
 * @param {import('express').Application} app
 */
function registerAP2v3Routes(app) {

  // ── POST /v3/execute — Execute a single named agent ────────────────────
  app.post('/v3/execute', async (req, res) => {
    try {
      if (!orchestrator) return res.status(503).json({ ok: false, error: 'Orchestrator not available' });

      const { agent, input, session_id } = req.body || {};
      if (!agent || !input) {
        return res.status(400).json({ ok: false, error: 'Missing required fields: agent, input' });
      }

      const sessionId = ensureSession(session_id);
      const result = await orchestrator.executeSingle(agent, input, sessionId);

      res.json({ ok: result.status === 'success', session_id: sessionId, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /v3/process — Auto-route via intent parsing ───────────────────
  app.post('/v3/process', async (req, res) => {
    try {
      if (!orchestrator) return res.status(503).json({ ok: false, error: 'Orchestrator not available' });

      const { input, session_id } = req.body || {};
      if (!input) {
        return res.status(400).json({ ok: false, error: 'Missing required field: input' });
      }

      const sessionId = ensureSession(session_id);
      const intent = orchestrator.parseIntent(input);
      const result = await orchestrator.process(input, sessionId);

      res.json({ ok: result.status === 'success', session_id: sessionId, intent, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /v3/chain — Execute explicit multi-agent chain ────────────────
  app.post('/v3/chain', async (req, res) => {
    try {
      if (!orchestrator) return res.status(503).json({ ok: false, error: 'Orchestrator not available' });

      const { agents: agentNames, input, session_id } = req.body || {};
      if (!agentNames || !Array.isArray(agentNames) || agentNames.length === 0 || !input) {
        return res.status(400).json({ ok: false, error: 'Missing required fields: agents (array), input' });
      }

      const sessionId = ensureSession(session_id);
      const result = await orchestrator.executeChain(agentNames, input, sessionId);

      res.json({ ok: result.status === 'success', session_id: sessionId, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /v3/stream/:agent — SSE streaming execution ────────────────────
  app.get('/v3/stream/:agent', async (req, res) => {
    try {
      if (!streaming) return res.status(503).json({ ok: false, error: 'Streaming not available' });
      if (!orchestrator) return res.status(503).json({ ok: false, error: 'Orchestrator not available' });

      const agentName = req.params.agent;
      const input = req.query.input || req.query.q || '';
      const sessionId = ensureSession(req.query.session_id);

      if (!input) {
        return res.status(400).json({ ok: false, error: 'Missing query parameter: input or q' });
      }

      const stream = streaming.createStream(res, agentName);

      try {
        // Send initial status
        stream.sendChunk('Processing with agent: ' + agentName + '...', 0);

        const result = await orchestrator.executeSingle(agentName, input, sessionId);

        if (result.status === 'error') {
          stream.sendError(result.data?.content || 'Agent execution failed');
        } else {
          // Stream the content in chunks
          const content = typeof result.data?.content === 'string'
            ? result.data.content
            : JSON.stringify(result.data?.content || '');

          const chunkSize = 80;
          let index = 1;
          for (let i = 0; i < content.length; i += chunkSize) {
            stream.sendChunk(content.slice(i, i + chunkSize), index++);
          }

          stream.sendComplete(result);
        }
      } catch (err) {
        stream.sendError(err.message);
      }
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: e.message });
      }
    }
  });

  // ── GET /v3/memory/:session — Get session memory ───────────────────────
  app.get('/v3/memory/:session', (req, res) => {
    try {
      if (!memory) return res.status(503).json({ ok: false, error: 'Memory module not available' });

      const sessionId = req.params.session;
      const ctx = typeof memory.getSessionContext === 'function'
        ? memory.getSessionContext(sessionId)
        : { entries: memory.getSession ? memory.getSession(sessionId) : [] };
      const history = ctx.entries || ctx;

      res.json({
        ok: true,
        session_id: sessionId,
        history,
        count: history.length,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── DELETE /v3/memory/:session — Clear session memory ──────────────────
  app.delete('/v3/memory/:session', (req, res) => {
    try {
      if (!memory) return res.status(503).json({ ok: false, error: 'Memory module not available' });

      const sessionId = req.params.session;
      const longTerm = req.query.longTerm !== 'false'; // default true
      memory.clearSession(sessionId, { longTerm });

      res.json({
        ok: true,
        session_id: sessionId,
        message: longTerm ? 'Session memory cleared (short-term + long-term)' : 'Session short-term memory cleared',
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /v3/agents — List all agents with status ───────────────────────
  app.get('/v3/agents', (_req, res) => {
    try {
      if (!agents) return res.status(503).json({ ok: false, error: 'Agent registry not available' });

      const agentList = agents.listAgents();

      res.json({
        ok: true,
        agents: agentList,
        count: agentList.length,
        version: 'ap2-v3',
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /v3/events — Get event bus log ─────────────────────────────────
  app.get('/v3/events', (req, res) => {
    try {
      if (!bus) return res.status(503).json({ ok: false, error: 'Event bus not available' });

      const limit = parseInt(req.query.limit, 10) || 50;
      const topic = req.query.topic || null;
      const log = typeof bus.getEventLog === 'function'
        ? bus.getEventLog(limit)
        : (typeof bus.getLog === 'function' ? bus.getLog(topic, limit) : []);

      res.json({
        ok: true,
        events: log,
        count: log.length,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /v3/health — V3 system health ──────────────────────────────────
  app.get('/v3/health', (_req, res) => {
    try {
      const agentList = agents ? agents.listAgents() : [];
      const memoryStats = memory
        ? (typeof memory.getStats === 'function' ? memory.getStats() : { status: 'active' })
        : { sessions: 0 };
      const busStats = bus && typeof bus.activeChannels === 'function'
        ? { channels: bus.activeChannels().length }
        : (bus && typeof bus.getStats === 'function' ? bus.getStats() : { topics: 0 });
      const circuitStats = resilience && typeof resilience.getCircuitStats === 'function'
        ? resilience.getCircuitStats() : {};

      res.json({
        ok: true,
        version: 'ap2-v3',
        status: orchestrator ? 'ACTIVE' : 'DEGRADED',
        boot_time: BOOT_TIME,
        uptime_ms: Date.now() - new Date(BOOT_TIME).getTime(),
        agents: {
          total: agentList.length,
          active: agentList.filter(a => a.status === 'active').length,
          names: agentList.map(a => a.name),
        },
        memory: memoryStats,
        bus: busStats,
        circuits: circuitStats,
        modules: {
          orchestrator: !!orchestrator,
          agents: !!agents,
          memory: !!memory,
          bus: !!bus,
          resilience: !!resilience,
          streaming: !!streaming,
          contract: !!contract,
        },
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerAP2v3Routes };
