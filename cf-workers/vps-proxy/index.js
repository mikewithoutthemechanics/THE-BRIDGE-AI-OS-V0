/**
 * Bridge AI OS — VPS Proxy Worker
 *
 * Dual-mode:
 *   1. Root supaco.ai  → serve static landing page from edge (zero VPS round-trip)
 *   2. app/admin.supaco.ai, live.bridge-ai-os.com → proxy to VPS via go.ai-os.co.za
 *
 * Why go.ai-os.co.za as origin:
 *   CF Workers block subrequests to their own proxied zone (anti-loop protection).
 *   go.ai-os.co.za bypasses this — it's on the same VPS but outside CF proxy.
 */

const ORIGIN = "https://go.ai-os.co.za";

// ── Static assets for supaco.ai root domain ────────────────────────────────

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supa-Claw | Sovereign Control Plane</title>
    <meta name="description" content="Supa-Claw is the deterministic sovereign execution layer for Bridge AI OS — zero-trust infrastructure control across api, control, treasury, and business domains.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://supaco.ai/">
    <meta property="og:title" content="Supa-Claw | Sovereign Control Plane">
    <meta property="og:description" content="Deterministic sovereign execution layer for Bridge AI OS. Zero-trust infrastructure with invariant lattice guardrails.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://supaco.ai/">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Supa-Claw | Sovereign Control Plane">
    <meta name="twitter:description" content="Deterministic sovereign execution layer for Bridge AI OS. Zero-trust infrastructure with invariant lattice guardrails.">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        body { font-family: 'JetBrains Mono', monospace; background-color: #050505; color: #00ff41; }
        .glow { text-shadow: 0 0 10px #00ff41; }
        .border-neon { border: 1px solid #00ff41; box-shadow: 0 0 5px #00ff41; }
        .bg-dark { background-color: rgba(0, 20, 0, 0.9); }
        a { color: #00ff41; text-decoration: underline; }
        a:hover { color: #4ade80; }
        a:focus { outline: 2px solid #00ff41; outline-offset: 2px; }
    </style>
</head>
<body class="p-4 md:p-8">
    <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-green-900 focus:px-4 focus:py-2 focus:z-50">Skip to main content</a>
    <div class="max-w-6xl mx-auto">
        <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-green-900 pb-4">
            <div>
                <h1 class="text-3xl font-bold glow">Supa-Claw / supaco.ai</h1>
                <p class="text-sm opacity-70">Deterministic Sovereign Execution Layer</p>
            </div>
            <div class="text-right mt-4 md:mt-0">
                <div class="inline-block px-3 py-1 border-neon rounded text-sm animate-pulse" aria-label="System integrity score: 1.000">V_TOTAL = 1.000</div>
                <p class="text-xs mt-1 opacity-60">LATTICE: L9 + L27 ACTIVE</p>
            </div>
        </header>
        <nav aria-label="Primary navigation" class="mb-6">
            <ul class="flex flex-wrap gap-4 text-sm">
                <li><a href="https://app.supaco.ai">App Dashboard</a></li>
                <li><a href="https://admin.supaco.ai">Admin Panel</a></li>
                <li><a href="https://go.ai-os.co.za">Bridge AI OS</a></li>
            </ul>
        </nav>
        <main id="main-content">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <section class="bg-dark border-neon p-6 rounded-lg" aria-labelledby="domains-heading">
                    <h2 id="domains-heading" class="text-lg font-bold mb-4 border-b border-green-900 pb-2">SYSTEM DOMAINS</h2>
                    <ul class="space-y-3 text-sm">
                        <li class="flex justify-between"><a href="https://api.supaco.ai">api.supaco.ai</a> <span class="text-white bg-green-900 px-2 rounded text-xs" role="status">ACTIVE</span></li>
                        <li class="flex justify-between"><a href="https://control.supaco.ai">control.supaco.ai</a> <span class="text-white bg-green-900 px-2 rounded text-xs" role="status">ACTIVE</span></li>
                        <li class="flex justify-between"><span>treasury.supaco.ai</span> <span class="text-amber-400 text-xs font-semibold" role="status">PENDING</span></li>
                        <li class="flex justify-between"><span>business.supaco.ai</span> <span class="text-amber-400 text-xs font-semibold" role="status">PENDING</span></li>
                    </ul>
                </section>
                <section class="bg-dark border-neon p-6 rounded-lg md:col-span-2" aria-labelledby="lattice-heading">
                    <h2 id="lattice-heading" class="text-lg font-bold mb-4 border-b border-green-900 pb-2">INVARIANT LATTICE (L9 + L27)</h2>
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                        <div class="p-3 border border-green-900 bg-green-950/30 rounded"><p class="opacity-60">L1: TUNNEL</p><p class="font-bold">VERIFIED</p></div>
                        <div class="p-3 border border-green-900 bg-green-950/30 rounded"><p class="opacity-60">L2: GATEKEEPER</p><p class="font-bold">ENFORCED</p></div>
                        <div class="p-3 border border-green-900 bg-green-950/30 rounded"><p class="opacity-60">L9: SECRETS</p><p class="font-bold">CLEAN</p></div>
                        <div class="p-3 border border-green-900 bg-green-950/30 rounded"><p class="opacity-60">L10: DOCTRINE</p><p class="font-bold">BINDING</p></div>
                    </div>
                    <blockquote class="mt-4 bg-green-900/20 p-3 rounded text-sm italic">"A validator that blocks everything is broken. A validator that blocks nothing is ceremonial."</blockquote>
                </section>
                <section class="bg-dark border-neon p-6 rounded-lg md:col-span-3" aria-labelledby="logs-heading">
                    <h2 id="logs-heading" class="text-lg font-bold mb-4 border-b border-green-900 pb-2">EXECUTION LOGS</h2>
                    <pre class="text-xs leading-relaxed opacity-80 h-48 overflow-y-auto" id="logs" role="log" aria-live="polite" tabindex="0">
[2026-03-02 15:44:12] CI/CD: Invariant Lattice Passed.
[2026-03-02 15:44:11] Deploy: Worker updated at api.supaco.ai.
[2026-03-02 15:38:45] Precision: Contextual Secret Detection Applied.
[2026-03-02 15:31:32] Sync: Policy Kernel Alpha Integrated.
[2026-03-02 15:24:00] Governance: Branch protection enforced on main.
                    </pre>
                </section>
            </div>
        </main>
        <footer class="mt-8 border-t border-green-900 pt-4">
            <nav aria-label="Footer navigation" class="flex flex-wrap gap-4 text-sm mb-4">
                <a href="https://app.supaco.ai">App</a>
                <a href="https://admin.supaco.ai">Admin</a>
                <a href="https://go.ai-os.co.za">Bridge AI OS</a>
                <a href="https://github.com/bridgeaios/Supa-Claw">GitHub</a>
            </nav>
            <p class="text-xs opacity-60">Sovereign Identity: Bridge AI OS | Repo: bridgeaios/Supa-Claw | Mode: Zero-Trust</p>
        </footer>
    </div>
</body>
</html>`;

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://supaco.ai/</loc>
    <lastmod>2026-04-08</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://app.supaco.ai/</loc>
    <lastmod>2026-04-08</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://admin.supaco.ai/</loc>
    <lastmod>2026-04-08</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;

const ROBOTS_TXT = `User-agent: *
Allow: /

Sitemap: https://supaco.ai/sitemap.xml`;

// ── Static file routing for root supaco.ai ─────────────────────────────────

const STATIC_FILES = {
  "/":             { body: LANDING_HTML, type: "text/html;charset=utf-8" },
  "/index.html":   { body: LANDING_HTML, type: "text/html;charset=utf-8" },
  "/sitemap.xml":  { body: SITEMAP_XML,  type: "application/xml;charset=utf-8" },
  "/robots.txt":   { body: ROBOTS_TXT,   type: "text/plain;charset=utf-8" },
};

function serveStatic(pathname) {
  const file = STATIC_FILES[pathname];
  if (!file) {
    return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
  return new Response(file.body, {
    status: 200,
    headers: {
      "Content-Type": file.type,
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Served-By": "bridge-vps-proxy-edge",
    },
  });
}

// ── Main handler ───────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const host = url.hostname;

    // Root supaco.ai → serve static landing page from edge
    if (host === "supaco.ai" || host === "www.supaco.ai") {
      return serveStatic(url.pathname);
    }

    // app.supaco.ai / admin.supaco.ai / live.bridge-ai-os.com → proxy to VPS
    const targetUrl = new URL(url.pathname + url.search, ORIGIN);

    const headers = new Headers(request.headers);
    headers.set("Host",              host);
    headers.set("X-Forwarded-Host",  host);
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Proxied-By",      "bridge-vps-proxy");

    const originReq = new Request(targetUrl.toString(), {
      method:  request.method,
      headers,
      body:    ["GET", "HEAD"].includes(request.method) ? null : request.body,
      redirect: "manual",
    });

    try {
      const res = await fetch(originReq);

      const respHeaders = new Headers(res.headers);
      respHeaders.set("X-Proxied-By", "bridge-vps-proxy");

      return new Response(res.body, {
        status:     res.status,
        statusText: res.statusText,
        headers:    respHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Origin unreachable", detail: err.message }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
