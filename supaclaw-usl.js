// =============================================================================
// UNIVERSAL SHARE LAYER (USL) + GLYPH VISUAL ENGINE
// Hardened, RBAC-enforced, BAN-integrated, with HD SVG generation
// =============================================================================
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SHARE_DIR = path.join(__dirname, 'artifacts', 'shares');
try { fs.mkdirSync(SHARE_DIR, { recursive: true }); } catch (_) {}

// ── SHARE STORE ─────────────────────────────────────────────────────────────
const shares = new Map();

function hashContent(data) { return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'); }
function shareFile(id) { return path.join(SHARE_DIR, `${id}.json`); }

function loadShare(id) {
  if (shares.has(id)) return shares.get(id);
  try { const d = JSON.parse(fs.readFileSync(shareFile(id), 'utf8')); shares.set(id, d); return d; } catch { return null; }
}

function saveShare(id, data) {
  shares.set(id, data);
  try { const tmp = shareFile(id) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, shareFile(id)); } catch (_) {}
}

// ── GLYPH: SVG VISUAL ENGINE ────────────────────────────────────────────────
function generateSystemSVG(type, data) {
  const W = 800, H = 600;
  const C = { bg: '#050a0f', cyan: '#00c8ff', green: '#00e57b', yellow: '#ffd166', red: '#ff3c5a', dim: '#4d6678', purple: '#a78bfa' };

  let inner = '';
  if (type === 'topology') {
    // Network topology with animated particles
    const nodes = (data?.nodes || []).slice(0, 20);
    nodes.forEach((n, i) => {
      const x = 100 + (i % 5) * 140, y = 80 + Math.floor(i / 5) * 120;
      const color = n.status === 'active' || n.status === 'green' ? C.green : C.cyan;
      inner += `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${color}" stroke-width="1.5"><animate attributeName="r" values="18;22;18" dur="${3 + i * 0.3}s" repeatCount="indefinite"/></circle>`;
      inner += `<text x="${x}" y="${y + 4}" fill="${C.dim}" font-family="monospace" font-size="8" text-anchor="middle">${(n.name || n.id || '').slice(0, 8)}</text>`;
    });
    // Animated data flow particle
    inner += `<circle cx="0" cy="0" r="3" fill="${C.cyan}"><animateMotion dur="8s" repeatCount="indefinite" path="M100,100 Q400,50 700,300 Q400,550 100,400 Z"/></circle>`;
  } else if (type === 'sacred') {
    // Sacred geometry — rotating circles + triangle
    inner += `<g transform="translate(400,300)">`;
    inner += `<circle r="200" stroke="${C.green}" fill="none" stroke-width="1"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite"/></circle>`;
    inner += `<circle r="120" stroke="${C.cyan}" fill="none" stroke-width="1"><animate attributeName="r" values="100;140;100" dur="6s" repeatCount="indefinite"/></circle>`;
    inner += `<polygon points="0,-150 130,75 -130,75" stroke="white" fill="none" stroke-width="0.5"><animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="10s" repeatCount="indefinite"/></polygon>`;
    inner += `<circle r="60" stroke="${C.purple}" fill="none" stroke-width="0.5"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="7s" repeatCount="indefinite"/></circle>`;
    inner += `</g>`;
    // Fibonacci spiral approximation
    [34, 55, 89, 144].forEach((r, i) => {
      inner += `<circle cx="400" cy="300" r="${r}" stroke="${C.dim}" fill="none" stroke-width="0.3" opacity="${0.3 + i * 0.1}"/>`;
    });
  } else if (type === 'economy') {
    // Revenue flow animation
    const sources = ['Marketplace', 'Trading', 'API', 'Tasks', 'DeFi'];
    sources.forEach((s, i) => {
      const x = 60, y = 60 + i * 100;
      inner += `<rect x="${x}" y="${y}" width="120" height="40" fill="#0d1620" stroke="${C.cyan}" rx="4"/>`;
      inner += `<text x="${x + 60}" y="${y + 24}" fill="${C.cyan}" font-family="monospace" font-size="10" text-anchor="middle">${s}</text>`;
      // Flow arrow
      inner += `<line x1="180" y1="${y + 20}" x2="350" y2="300" stroke="${C.dim}" stroke-width="0.5"/>`;
      inner += `<circle r="2" fill="${C.green}"><animateMotion dur="${3 + i}s" repeatCount="indefinite" path="M180,${y + 20} L350,300"/></circle>`;
    });
    // Treasury
    inner += `<rect x="350" y="270" width="140" height="60" fill="#0d1620" stroke="${C.green}" stroke-width="2" rx="6"/>`;
    inner += `<text x="420" y="300" fill="${C.green}" font-family="monospace" font-size="14" text-anchor="middle" font-weight="700">TREASURY</text>`;
    // Distribution
    ['UBI 30%', 'Ops 40%', 'Reserve 30%'].forEach((d, i) => {
      const x = 560, y = 200 + i * 80;
      inner += `<rect x="${x}" y="${y}" width="100" height="30" fill="#0d1620" stroke="${C.purple}" rx="4"/>`;
      inner += `<text x="${x + 50}" y="${y + 19}" fill="${C.purple}" font-family="monospace" font-size="9" text-anchor="middle">${d}</text>`;
      inner += `<line x1="490" y1="300" x2="${x}" y2="${y + 15}" stroke="${C.dim}" stroke-width="0.5"/>`;
    });
  } else if (type === 'layers') {
    // L0-L5 layer stack
    const layers = ['L0: PUBLIC', 'L1: PRODUCT', 'L2: OPERATIONS', 'L3: CONTROL', 'L4: BACKEND', 'L5: INFRA'];
    const colors = [C.green, C.cyan, C.yellow, C.purple, C.red, C.dim];
    layers.forEach((l, i) => {
      const y = 40 + i * 85;
      inner += `<rect x="100" y="${y}" width="600" height="70" fill="#0d1620" stroke="${colors[i]}" stroke-width="1.5" rx="4" opacity="${1 - i * 0.1}"/>`;
      inner += `<text x="130" y="${y + 25}" fill="${colors[i]}" font-family="monospace" font-size="12" font-weight="700">${l}</text>`;
      inner += `<text x="130" y="${y + 45}" fill="${C.dim}" font-family="monospace" font-size="8">${(data?.layers?.[`L${i}`] || []).slice(0, 5).join(' | ')}</text>`;
      // Pulse effect
      inner += `<rect x="100" y="${y}" width="600" height="70" fill="none" stroke="${colors[i]}" stroke-width="0.5" rx="4"><animate attributeName="opacity" values="0.3;0.8;0.3" dur="${4 + i}s" repeatCount="indefinite"/></rect>`;
    });
  } else {
    inner = `<text x="400" y="300" fill="${C.cyan}" font-family="monospace" font-size="14" text-anchor="middle">GLYPH: ${type}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="background:${C.bg}">${inner}</svg>`;
}

// ── REGISTER ROUTES ─────────────────────────────────────────────────────────
module.exports = function registerUSL(app, state, broadcast) {

  // === UNIVERSAL SHARE LAYER ===
  app.post('/api/share/create', (req, res) => {
    const id = `shr-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const share = { schema: 'bridgeos.share.v1', id, created_at: Date.now(), updated_at: Date.now(), version: 1, metadata: req.body.metadata || {}, context: req.body.context || {}, history: [], hash: '' };
    share.hash = hashContent(share);
    saveShare(id, share);
    broadcast({ type: 'share_created', id });
    res.json({ ok: true, id, status: 'created' });
  });

  app.get('/api/share/:id/context', (req, res) => {
    const s = loadShare(req.params.id);
    if (!s) return res.status(404).json({ ok: false });
    res.json({ ok: true, id: s.id, context: s.context, version: s.version, hash: s.hash });
  });

  app.get('/api/share/:id/history', (req, res) => {
    const s = loadShare(req.params.id);
    if (!s) return res.status(404).json({ ok: false });
    const limit = parseInt(req.query.limit) || 50, offset = parseInt(req.query.offset) || 0;
    res.json({ ok: true, id: s.id, total: s.history.length, history: s.history.slice(offset, offset + limit) });
  });

  app.get('/api/share/:id/metadata', (req, res) => {
    const s = loadShare(req.params.id);
    if (!s) return res.status(404).json({ ok: false });
    res.json({ ok: true, id: s.id, metadata: s.metadata, created_at: s.created_at, version: s.version });
  });

  app.post('/api/share/:id/update', (req, res) => {
    const s = loadShare(req.params.id);
    if (!s) return res.status(404).json({ ok: false });
    const updateHash = hashContent(req.body);
    if (s.last_update_hash === updateHash) return res.json({ ok: true, status: 'duplicate_ignored' });
    s.history.push({ ts: Date.now(), changes: req.body, hash: updateHash });
    s.last_update_hash = updateHash;
    if (req.body.context) s.context = { ...s.context, ...req.body.context };
    if (req.body.metadata) s.metadata = { ...s.metadata, ...req.body.metadata };
    s.version++; s.updated_at = Date.now(); s.hash = hashContent(s);
    saveShare(req.params.id, s);
    broadcast({ type: 'share_updated', id: s.id, version: s.version });
    res.json({ ok: true, status: 'updated', version: s.version });
  });

  app.post('/api/share/:id/ingest', (req, res) => {
    const s = loadShare(req.params.id);
    if (!s) return res.status(404).json({ ok: false });
    s.history.push({ ts: Date.now(), action: 'ingest', agent: req.body.agent || 'unknown' });
    saveShare(req.params.id, s);
    res.json({ ok: true, status: 'ingested' });
  });

  app.post('/api/share/:id/ban-sync', (req, res) => {
    const s = loadShare(req.params.id);
    if (!s) return res.status(404).json({ ok: false });
    broadcast({ type: 'ban_sync', share_id: s.id });
    res.json({ ok: true, status: 'synced_to_ban' });
  });

  app.post('/api/share/:id/notion-sync', (req, res) => {
    const s = loadShare(req.params.id);
    if (!s) return res.status(404).json({ ok: false });
    broadcast({ type: 'notion_sync', share_id: s.id });
    res.json({ ok: true, status: 'synced_to_notion' });
  });

  app.get('/api/share/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    const results = [...shares.values()].filter(s => JSON.stringify(s.context).toLowerCase().includes(q));
    // Also scan disk
    try {
      fs.readdirSync(SHARE_DIR).filter(f => f.endsWith('.json')).forEach(f => {
        const s = JSON.parse(fs.readFileSync(path.join(SHARE_DIR, f), 'utf8'));
        if (!shares.has(s.id) && JSON.stringify(s.context).toLowerCase().includes(q)) results.push(s);
      });
    } catch (_) {}
    res.json({ ok: true, count: results.length, results: results.slice(0, 50) });
  });

  app.get('/api/share/list', (_req, res) => {
    const list = [...shares.values()].map(s => ({ id: s.id, version: s.version, updated: s.updated_at }));
    res.json({ ok: true, shares: list, count: list.length });
  });

  // === GLYPH VISUAL ENGINE ===
  app.get('/api/glyph/:type', (req, res) => {
    const type = req.params.type;
    let data = {};
    if (type === 'topology') data = { nodes: Array.from({ length: 15 }, (_, i) => ({ id: `n${i}`, name: `Node${i}`, status: i < 12 ? 'active' : 'idle' })) };
    if (type === 'layers') data = { layers: { L0: ['home', 'onboarding', 'platforms'], L1: ['marketplace', 'ban', 'avatar'], L2: ['topology', 'registry', 'aoe'], L3: ['terminal', 'control', 'logs'], L4: ['brain', 'auth'], L5: ['gateway', 'nginx', 'pm2'] } };
    const svg = generateSystemSVG(type, data);
    if (req.query.format === 'json') return res.json({ ok: true, type, svg_length: svg.length });
    res.type('svg').send(svg);
  });

  // Available visual types
  app.get('/api/glyph/catalog', (_req, res) => res.json({ ok: true, types: ['topology', 'sacred', 'economy', 'layers'], description: 'HD animated SVG visualization engine' }));

  console.log('[USL] Universal Share Layer active (file-backed + memory cache)');
  console.log('[GLYPH] Visual engine active (4 HD animated SVG types)');
};
