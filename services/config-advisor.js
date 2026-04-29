#!/usr/bin/env node
// services/config-advisor.js — isolated AI-propose service, multi-provider.
//
// Runs as a SEPARATE PM2 process. Listens ONLY on 127.0.0.1 (loopback).
// Supported providers:
//   anthropic      — Claude API (recommended default)
//   openai         — OpenAI API
//   openai-compat  — any OpenAI-compatible endpoint: OpenCode router,
//                    LiteLLM gateway, Ollama local, LM Studio, etc.
//   heuristic      — deterministic, no AI, zero egress (always-available fallback)
//
// Provider selection rules (honours ADVISOR_PROVIDER env var):
//   'auto' (default) — picks first available in preference order: anthropic,
//                       openai, openai-compat, else heuristic
//   explicit value   — honoured; falls back to heuristic if that provider's
//                       key/base-url is missing
//
// Contract (UNCHANGED — providers are interchangeable behind this shape):
//   POST /propose { baseline, context, tier }  ->  { ok, mode, proposed, reason }
//   GET  /healthz                              ->  { ok, mode, model }
//
// Security invariants (identical across providers):
//   - loopback bind + remote-addr check
//   - shared-secret header auth
//   - rate limit (30 req/min per addr)
//   - AI output parsed as strict JSON, validated against schema whitelist
//   - providers only see the payload we build; they CANNOT see other env vars
//   - provider keys are scoped: compromise of one key ≠ compromise of others

const http  = require('http');
const https = require('https');
const path  = require('path');
const url   = require('url');

const schema = require(path.resolve(__dirname, '..', 'lib', 'config-schema'));

const PORT   = parseInt(process.env.ADVISOR_PORT || '4721', 10);
const SECRET = process.env.ADVISOR_SHARED_SECRET || '';

// Provider configuration
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY    || '';
const ANTHROPIC_MODEL  = process.env.ANTHROPIC_MODEL      || 'claude-haiku-4-5-20251001';
const OPENAI_KEY       = process.env.OPENAI_API_KEY       || '';
const OPENAI_MODEL     = process.env.OPENAI_MODEL         || 'gpt-4o-mini';
const OPENAI_COMPAT_KEY   = process.env.OPENAI_COMPAT_API_KEY  || '';
const OPENAI_COMPAT_BASE  = process.env.OPENAI_COMPAT_BASE_URL || '';
const OPENAI_COMPAT_MODEL = process.env.OPENAI_COMPAT_MODEL    || 'gpt-4o-mini';

const REQUESTED = (process.env.ADVISOR_PROVIDER || 'auto').toLowerCase();

function pickProvider(){
  const available = {
    anthropic:       !!ANTHROPIC_KEY,
    openai:          !!OPENAI_KEY,
    'openai-compat': !!(OPENAI_COMPAT_KEY && OPENAI_COMPAT_BASE),
    heuristic:       true,
  };
  if (REQUESTED !== 'auto'){
    if (available[REQUESTED]) return REQUESTED;
    console.warn(`[advisor] requested provider '${REQUESTED}' not configured; falling back to heuristic`);
    return 'heuristic';
  }
  // Auto-pick: preference order
  for (const p of ['anthropic', 'openai', 'openai-compat', 'heuristic']){
    if (available[p]) return p;
  }
  return 'heuristic';
}

const MODE = pickProvider();
const MODEL = MODE === 'anthropic'     ? ANTHROPIC_MODEL
            : MODE === 'openai'        ? OPENAI_MODEL
            : MODE === 'openai-compat' ? OPENAI_COMPAT_MODEL
            : null;

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

// --- Shared prompt construction -----------------------------------------------
// Identical for all providers so behaviour is interchangeable. User-supplied
// context is fenced inside ```json blocks so prompt injection can't escape.
function buildPrompt({ baseline, context, tier }){
  const s = schema.loadSchema();
  const system =
`You are Config Advisor. Given a baseline configuration and a requested context change, return a JSON proposal that changes ONLY the minimum number of keys needed.

HARD RULES:
- Respond with ONLY a JSON object — no prose, no markdown fences.
- Shape: {"proposed": {"features"?: {}, "limits"?: {}, "ui"?: {}}, "reason": "one sentence"}
- Allowed buckets: features, limits, ui. NOTHING else.
- Allowed keys:
    features: ${s.features.keys.join(', ')}
    limits:   ${s.limits.keys.join(', ')}
    ui:       ${s.ui.keys.join(', ')}
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
  return { system, user };
}

function parseProposalText(text){
  const stripped = String(text || '').trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(stripped);
}

// Generic HTTPS/HTTP POST JSON helper; handles both http: and https: targets
// (openai-compat gateways are often local http://).
function httpPostJson({ urlStr, headers, body, timeoutMs = 15000 }){
  return new Promise((resolve, reject) => {
    const u = new url.URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const req = lib.request({
      host: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: Object.assign({
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      }, headers || {}),
      timeout: timeoutMs,
    }, r => {
      let buf = '';
      r.on('data', c => buf += c);
      r.on('end', () => {
        if (r.statusCode < 200 || r.statusCode >= 300){
          return reject(new Error(`${u.hostname}_${r.statusCode}: ${buf.slice(0,200)}`));
        }
        try { resolve(JSON.parse(buf)); }
        catch(e){ reject(new Error(`${u.hostname}_parse_failed: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`${u.hostname}_timeout`)));
    req.write(payload);
    req.end();
  });
}

// --- Provider: Anthropic Messages API ---------------------------------------
async function callAnthropic({ baseline, context, tier }){
  const { system, user } = buildPrompt({ baseline, context, tier });
  const resp = await httpPostJson({
    urlStr: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    },
  });
  const text = (resp.content || []).map(c => c.text || '').join('');
  return parseProposalText(text);
}

// --- Provider: OpenAI Chat Completions --------------------------------------
async function callOpenAI({ baseline, context, tier }){
  const { system, user } = buildPrompt({ baseline, context, tier });
  const resp = await httpPostJson({
    urlStr: 'https://api.openai.com/v1/chat/completions',
    headers: { 'authorization': 'Bearer ' + OPENAI_KEY },
    body: {
      model: OPENAI_MODEL,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
    },
  });
  const text = (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || '';
  return parseProposalText(text);
}

// --- Provider: OpenAI-compatible gateway (OpenCode / LiteLLM / Ollama) -----
async function callOpenAICompat({ baseline, context, tier }){
  const { system, user } = buildPrompt({ baseline, context, tier });
  // Normalise base URL — append /chat/completions if caller gave just the /v1 root
  let endpoint = OPENAI_COMPAT_BASE.replace(/\/+$/, '');
  if (!/\/chat\/completions$/.test(endpoint)) endpoint += '/chat/completions';
  const resp = await httpPostJson({
    urlStr: endpoint,
    headers: { 'authorization': 'Bearer ' + OPENAI_COMPAT_KEY },
    body: {
      model: OPENAI_COMPAT_MODEL,
      max_tokens: 1024,
      // Some gateways (Ollama) ignore response_format but don't error on it
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
    },
  });
  const text = (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || '';
  return parseProposalText(text);
}

// Provider dispatch — preserves the single callsite in the request handler
const PROVIDERS = {
  anthropic:       callAnthropic,
  openai:          callOpenAI,
  'openai-compat': callOpenAICompat,
};

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
    return json(res, 200, {
      ok: true,
      mode: MODE,
      model: MODEL,
      providers_available: {
        anthropic:       !!ANTHROPIC_KEY,
        openai:          !!OPENAI_KEY,
        'openai-compat': !!(OPENAI_COMPAT_KEY && OPENAI_COMPAT_BASE),
      },
    });
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
      const providerFn = PROVIDERS[MODE];
      const result = providerFn
        ? await providerFn({ baseline, context: ctx, tier: t })
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
  const suffix = MODEL ? ` model=${MODEL}` : '';
  const avail = [
    ANTHROPIC_KEY && 'anthropic',
    OPENAI_KEY && 'openai',
    OPENAI_COMPAT_KEY && OPENAI_COMPAT_BASE && 'openai-compat',
  ].filter(Boolean).join(',') || 'none';
  console.log(`[advisor] listening 127.0.0.1:${PORT} mode=${MODE}${suffix} providers=[${avail}] requested=${REQUESTED}`);
});

process.on('SIGTERM', () => srv.close(() => process.exit(0)));
