// =============================================================================
// BRIDGE AI OS — Orchestration REST API
//
// Public:
//   GET  /api/orch/health         — engine health
//
// Admin:
//   GET  /api/orch/runs           — list runs (?status=running|paused|completed)
//   GET  /api/orch/runs/:id       — get run detail + steps + approvals
//   POST /api/orch/runs           — start a new run for a contact
//   POST /api/orch/runs/:id/advance — manually advance a run
//   POST /api/orch/runs/:id/signal  — send a signal (quote_accepted, payment_received…)
//   POST /api/orch/runs/:id/cancel
//   POST /api/orch/tick           — process due nurture emails (called by cron)
//
// CRM Contacts:
//   GET  /api/orch/contacts       — list all CRM contacts
//   POST /api/orch/contacts       — create/upsert contact
//   GET  /api/orch/contacts/:id   — get contact detail
//   PATCH /api/orch/contacts/:id  — update contact
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

function pathSeg(url) {
  return (url || '').split('?')[0].split('/').filter(Boolean);
}

async function handlePipeline(req, res) {
  const url    = (req.path || req.url || '').split('?')[0];
  const method = req.method;
  const seg    = pathSeg(url).slice(2); // strip 'api' + 'orch'
  const body   = req.body || {};

  // ── Health (public) ───────────────────────────────────────────────────────
  if (url === '/api/orch/health' && method === 'GET') {
    if (!engineReady(res)) return;
    try {
      const s = await orch.stats();
      return res.json({ ok: true, engine: 'pipeline', ...s });
    } catch (e) {
      return res.json({ ok: false, engine: 'pipeline', error: e.message });
    }
  }

  // All other endpoints require admin
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Admin required' });
  if (!engineReady(res)) return;

  // ── Contacts ──────────────────────────────────────────────────────────────
  if (seg[0] === 'contacts') {
    const contactId = seg[1];

    if (!contactId && method === 'GET') {
      try {
        const contacts = await orch.listContacts({ limit: parseInt(req.query.limit) || 100 });
        return res.json({ ok: true, count: contacts.length, contacts });
      } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    }

    if (!contactId && method === 'POST') {
      if (!body.email) return res.status(400).json({ ok: false, error: 'email required' });
      try {
        const run = await orch.start(body);
        return res.status(201).json({ ok: true, message: 'Contact added and run started', run_id: run.id });
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message });
      }
    }

    if (contactId && method === 'GET') {
      try {
        const contact = await orch.getContact(contactId);
        return res.json({ ok: true, contact });
      } catch (e) { return res.status(404).json({ ok: false, error: e.message }); }
    }

    if (contactId && method === 'PATCH') {
      try {
        const contact = await orch.updateContact(contactId, body);
        return res.json({ ok: true, contact });
      } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
    }
  }

  // ── Runs ─────────────────────────────────────────────────────────
  if (seg[0] === 'runs') {
    const runId = seg[1];
    const action = seg[2];

    if (!runId && method === 'GET') {
      try {
        const runs = await orch.listRuns({
          status: req.query.status,
          limit:  parseInt(req.query.limit) || 50,
          offset: parseInt(req.query.offset) || 0,
        });
        return res.json({ ok: true, count: runs.length, runs });
      } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
      }
    }

    if (!runId && method === 'POST') {
      if (!body.email) return res.status(400).json({ ok: false, error: 'email required' });
      try {
        const run = await orch.start(body);
        return res.status(201).json({ ok: true, run });
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message });
      }
    }

    if (runId && !action && method === 'GET') {
      try {
        const run = await orch.getRun(runId);
        return res.json({ ok: true, run });
      } catch (e) {
        return res.status(404).json({ ok: false, error: e.message });
      }
    }

    if (runId && action === 'advance' && method === 'POST') {
      try {
        const run = await orch.advance(runId);
        return res.json({ ok: true, run });
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message });
      }
    }

    if (runId && action === 'signal' && method === 'POST') {
      if (!body.type) return res.status(400).json({ ok: false, error: 'type required' });
      try {
        const run = await orch.signal(runId, body.type, body.payload || body);
        return res.json({ ok: true, run });
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message });
      }
    }

    if (runId && action === 'cancel' && method === 'POST') {
      try {
        await orch.cancelRun(runId);
        return res.json({ ok: true, message: 'Run cancelled' });
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message });
      }
    }
  }

  // ── Cron tick ─────────────────────────────────────────────────────────────
  if (url === '/api/orch/tick' && (method === 'POST' || method === 'GET')) {
    try {
      const result = await orch.tick();
      return res.json({ ok: true, ...result });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return null; // not handled
}

module.exports = { handlePipeline };
