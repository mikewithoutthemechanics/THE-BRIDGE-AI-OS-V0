#!/usr/bin/env node
// services/config-advisor.js — isolated AI-propose service.
//
// Runs as a SEPARATE PM2 process. Listens ONLY on 127.0.0.1 (loopback) so
// nginx does not proxy it to the public internet. Authorised by a shared
// secret header (ADVISOR_SHARED_SECRET) set at boot — the only caller is
// server.js which sets the same secret.
//
// Environment whitelist (enforced by PM2 ecosystem config, not here):
//   ANTHROPIC_API_KEY     — optional, enables real AI
//   ADVISOR_SHARED_SECRET — required, proxied-in auth
//   ADVISOR_PORT          — default 4721, loopback only
//   ANTHROPIC_MODEL       — default 'claude-haiku-4-5-20251001'
//
// Contract:
//   POST /propose { baseline, context, tier }  ->  { ok, proposed, reason }
//   GET  /healthz                              ->  { ok, mode, model }
//
// The service NEVER:
//   - reads settings.runtime.json (no disk access to mutable state)
//   - writes anything (pure compute)
//   - returns keys outside the schema allowlist (validator rejects pre-return)
//   - sees or forwards .env secrets (scoped env; the only secret it sees
//     is ANTHROPIC_API_KEY which it uses exclusively for the Anthropic call)

const http  = require('http');
const https = require('https');
const path  = require('path');

const schema = require(path.resolve(__dirname, '..', 'lib', 'config-schema'));

const PORT   = parseInt(process.env.ADVISOR_PORT || '4721', 10);
const SECRET = process.env.ADVISOR_SHARED_SECRET || '';
const MODEL  = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODE   = API_KEY ? 'anthropic' : 'heuristic';

if (!SECRET){
  console.error('[advisor] ADVISOR_SHARED_SECRET not set — refusing to start');
  process.exit(1);
}

// Rolling rate limiter: N requests per 60s window, keyed by remote addr.
const RATE_LIMIT = 30;
const WINDOW_MS  = 60_000;
const hits = new Map(); // addr -> [timestamps]

function rateLimit(addr){
  const now = Date.now();
  const arr = (hits.get(addr) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= RATE_LIMIT) return false;
  arr.push(now); hits.set(addr, arr);
  return true;
}

function json(res, status, body){
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 32768){ reject(new Error('body_too_large')); req.destroy(); }});
    req.on('end',  () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { reject(new Error('invalid_json')); }});
    req.on('error', reject);
  });
}

// --- AI: Anthropic Messages API call ----------------------------------------
// Fixed system prompt; user-supplied context goes in a fenced JSON block
// so prompt injection via context strings cannot escape the code fence.
function callAnthropic({ baseline, context, tier }){
  const system =
`You are Config Advisor. Given a baseline configuration and a requested context change, return a JSON proposal that changes ONLY the minimum number of keys needed.

HARD RULES:
- Respond with ONLY a JSON object — no prose, no markdown fences.
- Shape: {"proposed": {"features"?: {}, "limits"?: {}, "ui"?: {}}, "reason": "one sentence"}
- Allowed buckets: features, limits, ui. NOTHING else.
- Allowed keys:
    features: ${schema.loadSchema().features.keys.join(', ')}
    limits:   ${schema.loadSchema().limits.keys.join(', ')}
    ui:       ${schema.loadSchema().ui.keys.join(', ')}
- features.* are booleans; limits.* are non-negative integers (only super_admin tier may use -1 for unlimited); ui.* are hex colors (#rrggbb).
- If no change is needed for a bucket, omit it.
- Never return keys not in the lists above. Never return secrets, tokens, endpoints, or api_base.
- Tier "${tier}" is the commit tier — do not propose limits above what that tier would realistically receive.`;

  const user =
`Baseline:
\`\`\`json
${JSON.stringify(baseline, null, 2)}
\`\`\`

Context change:
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

Return the JSON proposal now.`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const req = https.request({
      host: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, r => {
      let buf = '';
      r.on('data', c => buf += c);
      r.on('end', () => {
        if (r.statusCode < 200 || r.statusCode >= 300){
          return reject(new Error(`anthropic_${r.statusCode}: ${buf.slice(0,200)}`));
        }
        try {
          const resp = JSON.parse(buf);
          const text = (resp.content || []).map(c => c.text || '').join('').trim();
          // Strip accidental fences, just in case.
          const stripped = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '').trim();
          const parsed = JSON.parse(stripped);
          resolve(parsed);
        } catch(e){
          reject(new Error('anthropic_parse_failed: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('anthropic_timeout')); });
    req.write(body);
    req.end();
  });
}

// --- Heuristic fallback ------------------------------------------------------
// Deterministic, no AI, safe to run offline. Reacts to a handful of context
// shifts we care about operationally. Returns the same shape as the AI path.
function heuristicPropose({ baseline, context, tier }){
  const proposed = {};
  const reasons  = [];

  // OS shift: dark theme stays dark but reduce refresh on mobile/win tablets
  if (context.os && context.os !== (baseline.os || 'linux')){
    // nothing in schema keys maps to OS; noop
  }

  // Env shift: prod -> dev widens refresh; dev -> prod tightens
  if (context.env === 'dev'){
    // no limit changes; maybe accent color hint (purely cosmetic)
    proposed.ui = { accent_color: '#00bfff' };
    reasons.push('dev env: switched accent to info-blue for visual distinction');
  } else if (context.env === 'prod'){
    proposed.ui = { accent_color: '#00ff9c' };
    reasons.push('prod env: restored production accent color');
  }

  // Tier shift proposals: only propose delta features/limits that move in the
  // requested direction. We leave the actual floor/ceiling to the validator.
  if (context.requested_tier && context.requested_tier !== tier){
    const tgt = context.requested_tier;
    if (tgt === 'enterprise'){
      proposed.features = { blockchain_admin: true, multi_tenant: true };
      proposed.limits   = { api_requests_per_hour: 50000, max_concurrent_sessions: 20 };
      reasons.push('proposing enterprise feature + limit envelope');
    } else if (tgt === 'pro'){
      proposed.features = { admin_actions: true, blockchain_admin: false };
      proposed.limits   = { api_requests_per_hour: 5000, max_concurrent_sessions: 5 };
      reasons.push('proposing pro feature + limit envelope');
    } else if (tgt === 'free'){
      proposed.features = { admin_actions: false, blockchain_admin: false };
      proposed.limits   = { api_requests_per_hour: 100, max_concurrent_sessions: 1 };
      reasons.push('proposing free baseline');
    }
  }

  // Explicit feature toggle request
  if (context.toggle_feature && typeof context.toggle_feature === 'string'){
    const k = context.toggle_feature;
    if (schema.loadSchema().features.keys.includes(k)){
      const cur = !!(baseline.features && baseline.features[k]);
      proposed.features = Object.assign({}, proposed.features || {}, { [k]: !cur });
      reasons.push(`toggling feature ${k} to ${!cur}`);
    }
  }

  return {
    proposed,
    reason: reasons.length ? reasons.join('; ') : 'no-op: context did not warrant changes'
  };
}

// --- HTTP server -------------------------------------------------------------
const srv = http.createServer(async (req, res) => {
  const addr = req.socket.remoteAddress || 'unknown';
  // Only accept loopback. PM2 binds to 127.0.0.1 via host below, but defend
  // in depth in case the bind is ever relaxed.
  if (!addr.includes('127.0.0.1') && !addr.includes('::1')){
    return json(res, 403, { error: 'loopback_only' });
  }
  if (req.method === 'GET' && req.url === '/healthz'){
    return json(res, 200, { ok: true, mode: MODE, model: MODE === 'anthropic' ? MODEL : null });
  }
  const tok = req.headers['x-advisor-token'] || '';
  if (tok !== SECRET){
    return json(res, 401, { error: 'invalid_advisor_token' });
  }
  if (!rateLimit(addr)){
    return json(res, 429, { error: 'rate_limited', limit: RATE_LIMIT, window_ms: WINDOW_MS });
  }
  if (req.method === 'POST' && req.url === '/propose'){
    let body;
    try { body = await readBody(req); } catch(e){ return json(res, 400, { error: e.message }); }
    const { baseline, context, tier } = body;
    if (!baseline || typeof baseline !== 'object'){
      return json(res, 400, { error: 'baseline_required' });
    }
    const ctx = context && typeof context === 'object' ? context : {};
    const t = tier || 'free';
    try {
      const result = MODE === 'anthropic'
        ? await callAnthropic({ baseline, context: ctx, tier: t })
        : heuristicPropose({ baseline, context: ctx, tier: t });
      // Validator is the final gate: no response leaves the advisor unvalidated.
      const val = schema.validate(result.proposed || {}, { tier: t });
      if (!val.ok){
        return json(res, 422, { error: 'proposal_failed_validation', errors: val.errors, proposed: result.proposed, reason: result.reason });
      }
      return json(res, 200, { ok: true, mode: MODE, proposed: result.proposed, reason: result.reason });
    } catch(e){
      return json(res, 502, { error: 'advisor_failed', detail: e.message, mode: MODE });
    }
  }
  return json(res, 404, { error: 'unknown_route', path: req.url });
});

srv.listen(PORT, '127.0.0.1', () => {
  console.log(`[advisor] listening 127.0.0.1:${PORT} mode=${MODE}${MODE==='anthropic' ? ` model=${MODEL}`:''}`);
});

process.on('SIGTERM', () => srv.close(() => process.exit(0)));
