// ── Startup env validation ────────────────────────────────────────────────────
// Catches misconfigured deployments immediately with an actionable error in
// Vercel function logs instead of a cryptic FUNCTION_INVOCATION_FAILED.
const REQUIRED_ENV = [
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    // Log once at module init — visible in Vercel Functions → Logs tab
    console.error(`[proxy] FATAL: missing env var ${key} — add it in Vercel project settings`);
  }
}

// ── Proxy target ──────────────────────────────────────────────────────────────
const TARGET = 'http://102.208.228.44:3035';

// Connect + response timeout — must be well under Vercel's maxDuration (30s).
// 25s gives the upstream time to respond while leaving a 5s safety margin for
// Vercel to write the error response before the function is killed.
const UPSTREAM_TIMEOUT_MS = 25_000;

// Hop-by-hop headers must never be forwarded to/from the upstream.
const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

module.exports = async function handler(req, res) {
  const start = Date.now();
  const url = `${TARGET}${req.url}`;

  try {
    // Strip hop-by-hop headers before forwarding to VPS.
    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        forwardHeaders[key] = value;
      }
    }

    // Read raw body — Vercel does NOT pre-parse req.body like Express does.
    // For JSON payloads it may provide a parsed object; convert it back.
    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body !== undefined && req.body !== null) {
        body = typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body);
      }
    }

    const upstream = await fetch(url, {
      method: req.method,
      headers: forwardHeaders,
      body,
      redirect: 'manual',
      // AbortSignal.timeout() cancels the fetch cleanly before Vercel's hard
      // kill fires — gives us a proper TimeoutError we can distinguish in logs.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // Buffer the full response BEFORE writing any headers so the catch block
    // can always send a 500 (headers not yet sent).
    const buffer = Buffer.from(await upstream.arrayBuffer());

    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });
    responseHeaders['content-length'] = String(buffer.byteLength);

    res.writeHead(upstream.status, responseHeaders);
    res.end(buffer);

  } catch (err) {
    const ms = Date.now() - start;

    // Classify the error so logs are actionable rather than generic.
    let status = 502;
    let code = 'UPSTREAM_ERROR';
    let message = err.message;

    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      status = 504;
      code = 'UPSTREAM_TIMEOUT';
      message = `Upstream did not respond within ${UPSTREAM_TIMEOUT_MS}ms`;
    } else if (err.cause?.code === 'ECONNREFUSED') {
      status = 503;
      code = 'UPSTREAM_UNREACHABLE';
      message = `Cannot connect to upstream at ${TARGET}`;
    } else if (err.cause?.code === 'ENOTFOUND') {
      status = 503;
      code = 'UPSTREAM_DNS_FAILURE';
      message = `DNS resolution failed for upstream target`;
    }

    // Always log with enough context to diagnose from Vercel Functions → Logs.
    console.error(`[proxy] ${code} ${req.method} ${req.url} (${ms}ms) — ${message}`);

    if (!res.headersSent) {
      res.status(status).json({ error: code, message });
    }
  }
};
