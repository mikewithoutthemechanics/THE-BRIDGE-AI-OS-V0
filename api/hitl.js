// =============================================================================
// BRIDGE AI OS — HITL (Human-In-The-Loop) REST API
//
// GET  /api/hitl/queue              — list pending approvals
// GET  /api/hitl/queue/:id          — get single approval
// POST /api/hitl/queue/:id/approve  — approve a gate
// POST /api/hitl/queue/:id/reject   — reject a gate
// GET  /api/hitl/stats              — dashboard counts
//
// All endpoints require admin auth (X-Bridge-Admin header).
// =============================================================================
'use strict';

let orch = null;
try { orch = require('../engine/pipeline'); } catch (_) {}

function engineReady(res) {
  if (!orch) { res.status(503).json({ ok: false, error: 'Orchestration engine not loaded' }); return false; }
  return true;
}

function isAdmin(req) {
  return req.headers['x-bridge-admin'] === (process.env.BRIDGE_ADMIN_SECRET || 'bridge-admin');
}

async function handleHitl(req, res) {
  const url    = (req.path || req.url || '').split('?')[0];
  const method = req.method;

  // ── Stats (public for dashboard health checks) ───────────────────────────
  if (url === '/api/hitl/stats' && method === 'GET') {
    if (!engineReady(res)) return;
    try {
      const s = await orch.stats();
      return res.json({ ok: true, ...s });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // All other HITL endpoints require admin
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Admin required' });
  if (!engineReady(res)) return;

  const body = req.body || {};

  // ── List pending approvals ────────────────────────────────────────────────
  if (url === '/api/hitl/queue' && method === 'GET') {
    try {
      const items = await orch.getPendingApprovals({
        limit:       parseInt(req.query.limit) || 50,
        assigned_to: req.query.assigned_to,
      });
      return res.json({ ok: true, count: items.length, items });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Get single approval ───────────────────────────────────────────────────
  const approvalMatch = url.match(/^\/api\/hitl\/queue\/([^/]+)$/);
  if (approvalMatch && method === 'GET') {
    try {
      const items = await orch.getPendingApprovals({ limit: 200 });
      const item = items.find(i => i.id === approvalMatch[1]);
      if (!item) return res.status(404).json({ ok: false, error: 'Approval not found' });
      return res.json({ ok: true, item });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  const approveMatch = url.match(/^\/api\/hitl\/queue\/([^/]+)\/approve$/);
  if (approveMatch && method === 'POST') {
    try {
      const run = await orch.approve(approveMatch[1], {
        by:    body.decided_by || body.by || 'admin',
        notes: body.notes || '',
      });
      return res.json({ ok: true, message: 'Approved — workflow resumed', run });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  const rejectMatch = url.match(/^\/api\/hitl\/queue\/([^/]+)\/reject$/);
  if (rejectMatch && method === 'POST') {
    try {
      const run = await orch.reject(rejectMatch[1], {
        by:     body.decided_by || body.by || 'admin',
        notes:  body.notes || '',
        action: body.action || 'hold',   // 'hold' | 'cancel'
      });
      return res.json({ ok: true, message: 'Rejected — workflow on hold', run });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  }

  return null; // not handled
}

module.exports = { handleHitl };
