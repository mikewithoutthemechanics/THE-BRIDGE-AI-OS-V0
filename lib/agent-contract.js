// =============================================================================
// BRIDGE AI OS — Agent Response Contract
// Standardized response wrapper for ALL agent endpoints.
// Guarantees JSON responses — never HTML — on /agent/* and /api/* routes.
// =============================================================================
'use strict';

// ── Success response ─────────────────────────────────────────────────────────
function success(agentName, data, meta = {}) {
  return {
    status: 'success',
    agent: agentName,
    data,
    meta: {
      latency_ms: meta.latency_ms || 0,
      version: 'ap2-v2',
      ts: Date.now(),
      ...meta,
    },
  };
}

// ── Error response ───────────────────────────────────────────────────────────
function error(message, code = 'AGENT_EXECUTION_FAILED', status = 500) {
  return {
    status: 'error',
    error: message,
    code,
    meta: { version: 'ap2-v2', ts: Date.now() },
  };
}

// ── Middleware: wraps any async handler with timing + error handling + JSON ───
function agentHandler(agentName, handler) {
  return async (req, res) => {
    const start = Date.now();
    try {
      const result = await handler(req, res);
      if (res.headersSent) return;
      const latency_ms = Date.now() - start;
      res.json(success(agentName, result, { latency_ms }));
    } catch (err) {
      if (res.headersSent) return;
      const code = err.code || 'AGENT_EXECUTION_FAILED';
      const status_code = err.statusCode || 500;
      res.status(status_code).json(error(err.message, code, status_code));
    }
  };
}

// ── Response validator middleware — ensures JSON on all /agent/* and /api/* ───
function jsonGuard() {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    // Override send to catch HTML responses on agent/api routes
    res.send = function (body) {
      if (typeof body === 'string' && (body.startsWith('<!DOCTYPE') || body.startsWith('<html'))) {
        return originalJson(error('Unexpected HTML response', 'HTML_RESPONSE', 500));
      }
      return originalSend(body);
    };
    next();
  };
}

module.exports = { success, error, agentHandler, jsonGuard };
