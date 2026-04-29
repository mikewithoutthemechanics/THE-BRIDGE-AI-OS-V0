// =============================================================================
// BRIDGE AI OS — Auto-Kill (IP rate-limit + ban enforcement)
//
// Behaviour:
//   - Exempts loopback (watchdog / PM2 / nginx internal polls).
//   - Exempts a small allow-list of public endpoints (SIWE login + health
//     checks) so a user can never be locked out of authentication.
//   - Rate-limits by IP using a rolling 10-second bucket. Default 120 req/10s
//     per IP (was 20 — far too low for a single SPA page load).
//   - Persists bans to Supabase `bans` table when available, but degrades
//     gracefully if Supabase is not configured.
//   - Refreshes the in-memory banlist from Supabase every 60s so an operator
//     can unban an IP with a DB UPDATE — no process restart required.
//   - Responds with JSON (not plain text) so browser clients calling
//     `res.json()` do not throw "Unexpected token 'b'" parse errors.
// =============================================================================

require('dotenv').config();

let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
} catch (_) { /* supabase optional */ }

// ── Config (tunable via env) ────────────────────────────────────────────────
function parseEnvInt(name, defaultValue, minValue) {
  const parsed = parseInt(process.env[name], 10);
  const value  = Number.isFinite(parsed) ? parsed : defaultValue;
  return Math.max(minValue, value);
}

const WINDOW_MS    = parseEnvInt('AUTO_KILL_WINDOW_MS',    10000, 1000);
const MAX_REQUESTS = parseEnvInt('AUTO_KILL_MAX_REQUESTS',   120,    1);
const REFRESH_MS   = parseEnvInt('AUTO_KILL_REFRESH_MS',   60000, 1000);
const EXEMPT_PREFIXES = [
  '/api/siwe',          // SIWE login/verify/nonce — never lock out auth.
  '/api/health',
  '/api/status',
  '/health',
  '/healthz',
];
const EXEMPT_IPS = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
]);

// ── State ────────────────────────────────────────────────────────────────────
const buckets = Object.create(null);
const banned  = new Set();

async function loadBansFromDb() {
  if (!supabase) return;
  try {
    const { data } = await supabase.from('bans').select('ip');
    if (!data) return;
    const fresh = new Set(data.map(r => r.ip));
    // Remove IPs that were unbanned in the DB; add any new ones.
    for (const ip of banned) if (!fresh.has(ip)) banned.delete(ip);
    for (const ip of fresh) banned.add(ip);
  } catch (e) {
    console.warn('[AUTO-KILL] banlist refresh failed:', e.message);
  }
}
loadBansFromDb();
if (REFRESH_MS > 0) setInterval(loadBansFromDb, REFRESH_MS).unref?.();

// Expire per-IP counters once the window has passed.
setInterval(() => {
  const now = Date.now();
  for (const ip in buckets) {
    if (now - buckets[ip].ts > WINDOW_MS) delete buckets[ip];
  }
}, Math.max(1000, Math.floor(WINDOW_MS / 2))).unref?.();

function isExemptPath(pathname) {
  return EXEMPT_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// ── Middleware ───────────────────────────────────────────────────────────────
module.exports = async function autoKill(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress;
  if (!ip || EXEMPT_IPS.has(ip)) return next();

  const pathname = (req.path || req.url || '').split('?')[0];
  if (isExemptPath(pathname)) return next();

  if (banned.has(ip)) {
    return res.status(403).json({
      ok: false,
      error: 'banned',
      detail: 'This IP has been blocked. Contact support if this is unexpected.',
    });
  }

  const now = Date.now();
  const b = buckets[ip];
  if (!b || now - b.ts > WINDOW_MS) {
    buckets[ip] = { count: 1, ts: now };
  } else {
    b.count++;
  }

  if (buckets[ip].count > MAX_REQUESTS) {
    banned.add(ip);
    if (supabase) {
      try {
        await supabase.from('bans').insert({
          ip,
          reason: 'rate-limit',
          ts: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[AUTO-KILL] could not persist ban:', e.message);
      }
    }
    console.log('[AUTO-KILL] BANNED', ip, `>${MAX_REQUESTS} req/${WINDOW_MS}ms`);
    return res.status(429).json({
      ok: false,
      error: 'rate_limited',
      detail: `Rate limit exceeded: ${MAX_REQUESTS} requests per ${WINDOW_MS}ms window.`,
      retryAfterMs: WINDOW_MS,
    });
  }

  next();
};

// Exposed for tests / ops tooling.
module.exports.loadBansFromDb = loadBansFromDb;
module.exports.__internals = { buckets, banned, loadBansFromDb };
// Test hooks — intentionally prefixed underscore. Do not rely on in production.
module.exports._banned = banned;
module.exports._buckets = buckets;
