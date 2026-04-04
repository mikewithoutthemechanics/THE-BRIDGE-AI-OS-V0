/**
 * DirectAdmin API client — Bridge AI OS infrastructure layer.
 *
 * Authentication: Login Key (read-only key recommended for autonomous polling).
 * Set env vars:
 *   DA_BASE_URL   = https://ai-os.co.za:2222   (or custom port)
 *   DA_USERNAME   = your-admin-username
 *   DA_LOGIN_KEY  = your-login-key              (from DirectAdmin → Login Keys)
 *
 * Human-in-the-loop: All WRITE actions are queued in system_state.pending_actions
 * and fire a Telegram alert. Execution only happens after /api/infra/approve is called.
 *
 * READ endpoints run autonomously — agents consume and report.
 */

const https = require('https');
const http  = require('http');
const { setState, getState } = require('./db');
const { alertSystemEvent }   = require('./notify');

const DA_BASE    = (process.env.DA_BASE_URL || 'https://ai-os.co.za:2222').replace(/\/$/, '');
const DA_USER    = process.env.DA_USERNAME  || '';
const DA_KEY     = process.env.DA_LOGIN_KEY || '';

// Basic auth string — DirectAdmin uses username:loginkey
function authHeader() {
  if (!DA_USER || !DA_KEY) return null;
  return 'Basic ' + Buffer.from(`${DA_USER}:${DA_KEY}`).toString('base64');
}

function isConfigured() {
  return !!(DA_USER && DA_KEY);
}

// ── Raw HTTP client ───────────────────────────────────────────────────────────

function daFetch(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const auth = authHeader();
    if (!auth) return reject(new Error('DA_USERNAME / DA_LOGIN_KEY not configured'));

    const url  = new URL(DA_BASE + path);
    const lib  = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + (url.search || ''),
      method,
      headers: {
        'Authorization': auth,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      rejectUnauthorized: false, // VPS may have self-signed cert
    };

    const req = lib.request(opts, (r) => {
      let data = '';
      r.on('data', d => { data += d; });
      r.on('end', () => {
        try {
          resolve({ status: r.statusCode, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: r.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('DA request timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Safe read-only endpoints (autonomous) ─────────────────────────────────────

async function getSystemInfo() {
  if (!isConfigured()) return { configured: false };
  try {
    const [cpu, mem, load, fs, svc, uptime] = await Promise.allSettled([
      daFetch('/api/system-info/cpu'),
      daFetch('/api/system-info/memory'),
      daFetch('/api/system-info/load'),
      daFetch('/api/system-info/fs'),
      daFetch('/api/system-info/services'),
      daFetch('/api/system-info/uptime'),
    ]);

    return {
      cpu:      cpu.status     === 'fulfilled' ? cpu.value.data     : null,
      memory:   mem.status     === 'fulfilled' ? mem.value.data     : null,
      load:     load.status    === 'fulfilled' ? load.value.data    : null,
      fs:       fs.status      === 'fulfilled' ? fs.value.data      : null,
      services: svc.status     === 'fulfilled' ? svc.value.data     : null,
      uptime:   uptime.status  === 'fulfilled' ? uptime.value.data  : null,
      polled_at: new Date().toISOString(),
    };
  } catch (e) {
    return { error: e.message, polled_at: new Date().toISOString() };
  }
}

async function getServerInfo() {
  if (!isConfigured()) return { configured: false };
  try {
    const [info, ver, lic, session] = await Promise.allSettled([
      daFetch('/api/info'),
      daFetch('/api/version'),
      daFetch('/api/license'),
      daFetch('/api/session/state'),
    ]);
    return {
      info:    info.status    === 'fulfilled' ? info.value.data    : null,
      version: ver.status     === 'fulfilled' ? ver.value.data     : null,
      license: lic.status     === 'fulfilled' ? lic.value.data     : null,
      session: session.status === 'fulfilled' ? session.value.data : null,
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function getServices() {
  if (!isConfigured()) return { configured: false };
  try {
    const r = await daFetch('/api/system-services/list');
    return r.data;
  } catch (e) { return { error: e.message }; }
}

async function getDbProcesses() {
  if (!isConfigured()) return { configured: false };
  try {
    const r = await daFetch('/api/db-monitor/processes');
    return r.data;
  } catch (e) { return { error: e.message }; }
}

async function getEmailLogs(limit = 20) {
  if (!isConfigured()) return { configured: false };
  try {
    const r = await daFetch(`/api/email-logs?limit=${limit}`);
    return r.data;
  } catch (e) { return { error: e.message }; }
}

async function getDiskUsage() {
  if (!isConfigured()) return { configured: false };
  try {
    const r = await daFetch('/api/system-info/fs');
    return r.data;
  } catch (e) { return { error: e.message }; }
}

// ── Human-in-the-loop write queue ─────────────────────────────────────────────

const WRITE_ACTIONS = {
  'restart-service': { label: 'Restart service', risk: 'medium' },
  'restart-server':  { label: 'Restart DirectAdmin', risk: 'high' },
  'kill-db-process': { label: 'Kill DB process', risk: 'medium' },
  'update-system':   { label: 'System package update', risk: 'high' },
};

/**
 * Queue a write action for human approval.
 * Returns the action ID. Fires Telegram alert.
 */
async function queueAction(type, params = {}, requestedBy = 'agent') {
  if (!WRITE_ACTIONS[type]) throw new Error(`Unknown action type: ${type}`);

  const id  = `da_action_${Date.now()}`;
  const action = {
    id,
    type,
    params,
    requestedBy,
    risk:       WRITE_ACTIONS[type].risk,
    label:      WRITE_ACTIONS[type].label,
    status:     'pending',
    queued_at:  new Date().toISOString(),
    approved_at: null,
    executed_at: null,
  };

  // Persist queue
  const queue = (await getState('da_pending_actions')) || {};
  queue[id] = action;
  await setState('da_pending_actions', queue);

  // Alert human
  const msg = `⚠️ ACTION QUEUED — ${action.label}\nRisk: ${action.risk.toUpperCase()}\nParams: ${JSON.stringify(params)}\nID: ${id}\nRequested by: ${requestedBy}\n\nApprove: POST /api/infra/approve {"actionId":"${id}"}`;
  alertSystemEvent(msg).catch(() => {});

  console.log(JSON.stringify({ type: 'da_action_queued', id, action: type, risk: action.risk }));
  return action;
}

/**
 * Approve and execute a queued action.
 * Returns execution result.
 */
async function approveAction(actionId) {
  const queue = (await getState('da_pending_actions')) || {};
  const action = queue[actionId];
  if (!action) throw new Error(`Action not found: ${actionId}`);
  if (action.status !== 'pending') throw new Error(`Action already ${action.status}`);

  action.status      = 'executing';
  action.approved_at = new Date().toISOString();
  await setState('da_pending_actions', queue);

  let result;
  try {
    result = await executeAction(action);
    action.status      = 'done';
    action.executed_at = new Date().toISOString();
    action.result      = result;
    alertSystemEvent(`✅ Action executed: ${action.label} (${actionId})`).catch(() => {});
  } catch (e) {
    action.status = 'failed';
    action.error  = e.message;
    alertSystemEvent(`❌ Action failed: ${action.label} — ${e.message}`).catch(() => {});
  }

  queue[actionId] = action;
  await setState('da_pending_actions', queue);
  return action;
}

async function executeAction(action) {
  switch (action.type) {
    case 'restart-service': {
      const r = await daFetch(`/api/system-services-actions/service/${action.params.service}/restart`, 'POST');
      return r.data;
    }
    case 'restart-server': {
      const r = await daFetch('/api/restart', 'POST');
      return r.data;
    }
    case 'kill-db-process': {
      const r = await daFetch(`/api/db-monitor/processes/${action.params.id}/kill`, 'POST');
      return r.data;
    }
    case 'update-system': {
      const r = await daFetch('/api/system-packages/update-run', 'POST', action.params);
      return r.data;
    }
    default:
      throw new Error(`No executor for action type: ${action.type}`);
  }
}

/**
 * Deny / discard a pending action.
 */
async function denyAction(actionId) {
  const queue = (await getState('da_pending_actions')) || {};
  if (!queue[actionId]) throw new Error(`Action not found: ${actionId}`);
  queue[actionId].status   = 'denied';
  queue[actionId].denied_at = new Date().toISOString();
  await setState('da_pending_actions', queue);
  alertSystemEvent(`🚫 Action denied: ${queue[actionId].label} (${actionId})`).catch(() => {});
  return queue[actionId];
}

async function getPendingActions() {
  const queue = (await getState('da_pending_actions')) || {};
  return Object.values(queue).sort((a, b) => new Date(b.queued_at) - new Date(a.queued_at));
}

// ── Snapshot: persist infra state into system_state ───────────────────────────

async function snapshotInfra() {
  if (!isConfigured()) return { configured: false };
  const [sysInfo, srvInfo] = await Promise.allSettled([
    getSystemInfo(),
    getServerInfo(),
  ]);
  const snapshot = {
    system:  sysInfo.status  === 'fulfilled' ? sysInfo.value  : { error: sysInfo.reason?.message },
    server:  srvInfo.status  === 'fulfilled' ? srvInfo.value  : { error: srvInfo.reason?.message },
    snapped_at: new Date().toISOString(),
  };
  await setState('infra_snapshot', snapshot);
  return snapshot;
}

async function getInfraSnapshot() {
  return (await getState('infra_snapshot')) || { configured: !isConfigured() ? false : true, snapped_at: null };
}

module.exports = {
  isConfigured,
  getSystemInfo,
  getServerInfo,
  getServices,
  getDbProcesses,
  getEmailLogs,
  getDiskUsage,
  queueAction,
  approveAction,
  denyAction,
  getPendingActions,
  snapshotInfra,
  getInfraSnapshot,
  WRITE_ACTIONS,
};
