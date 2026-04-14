// Build script for Vercel: copies static assets into public/ for CDN serving
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'public');

function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log(`  ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dest)}`);
}

function copyDir(srcDir, destDir, extensions) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, extensions);
    } else if (!extensions || extensions.some(ext => entry.name.endsWith(ext))) {
      copyFile(srcPath, destPath);
    }
  }
}

console.log('Building static assets into public/...');
mkdirp(OUT);

// Copy root-level HTML/CSS/JS static files
const staticExts = ['.html', '.css', '.ico', '.png', '.jpg', '.svg', '.gif', '.webp', '.woff', '.woff2', '.ttf'];
const rootFiles = fs.readdirSync(ROOT);
for (const file of rootFiles) {
  const fullPath = path.join(ROOT, file);
  if (fs.statSync(fullPath).isFile() && staticExts.some(ext => file.endsWith(ext))) {
    copyFile(fullPath, path.join(OUT, file));
  }
}

// Copy Xpublic/ HTML files to public/ ROOT so /topology.html etc. work on Vercel
// (Non-HTML assets still go to public/Xpublic/ to avoid collisions)
const xpubDir = path.join(ROOT, 'Xpublic');
if (fs.existsSync(xpubDir)) {
  const xpubFiles = fs.readdirSync(xpubDir, { withFileTypes: true });
  for (const entry of xpubFiles) {
    const srcPath = path.join(xpubDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.html')) {
      // HTML pages go to public/ root for clean URLs
      copyFile(srcPath, path.join(OUT, entry.name));
    } else if (entry.isFile()) {
      copyFile(srcPath, path.join(OUT, 'Xpublic', entry.name));
    } else if (entry.isDirectory()) {
      copyDir(srcPath, path.join(OUT, 'Xpublic', entry.name));
    }
  }
}

// Copy Xscripts/ (if referenced by HTML)
copyDir(path.join(ROOT, 'Xscripts'), path.join(OUT, 'Xscripts'));

// Copy any other public-facing asset directories
for (const dir of ['Xlogs', 'migrations']) {
  const src = path.join(ROOT, dir);
  if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
    copyDir(src, path.join(OUT, dir), ['.html', '.css', '.js', '.json', '.svg', '.png']);
  }
}

// Create index.html redirect to ui.html if not present
if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!DOCTYPE html><meta http-equiv="refresh" content="0;url=/ui.html"><a href="/ui.html">Bridge AI OS</a>`);
  console.log('  Created index.html -> ui.html redirect');
}

// Inject SEO meta tags into all HTML files that are missing them
try {
  require('./inject-meta');
} catch (e) {
  console.warn('inject-meta failed:', e.message);
}

// ── GENERATE STATIC SVG ASSETS ────────────────────────────────────────────────
console.log('Generating static SVG assets...');

// BAN Ultra — animated network activity banner
const BAN_BARS = [
  {h:58,lbl:'alpha'},{h:82,lbl:'beta'},{h:45,lbl:'gamma'},{h:96,lbl:'delta'},
  {h:71,lbl:'L1'},{h:63,lbl:'L2'},{h:88,lbl:'L3'},{h:52,lbl:'ORC'},
];
const banBars = BAN_BARS.map((b, i) => {
  const x = 16 + i * 64;
  return `<rect x="${x}" y="${165 - b.h}" width="54" height="${b.h}" fill="#63ffda" opacity="0.45" rx="3">
    <animate attributeName="height" values="${b.h};${b.h + 18};${b.h}" dur="${1.2 + i * 0.15}s" repeatCount="indefinite"/>
    <animate attributeName="y" values="${165 - b.h};${165 - b.h - 18};${165 - b.h}" dur="${1.2 + i * 0.15}s" repeatCount="indefinite"/>
  </rect>
  <text x="${x + 27}" y="182" text-anchor="middle" fill="#64748b" font-family="JetBrains Mono,monospace" font-size="8">${b.lbl}</text>`;
}).join('\n');

const banUltraSVG = `<svg width="540" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="hdr" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#63ffda" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#a855f7" stop-opacity="0.15"/>
    </linearGradient>
  </defs>
  <rect width="540" height="200" fill="#060810" rx="10"/>
  <rect width="540" height="36" fill="url(#hdr)" rx="10"/>
  <rect width="540" height="1" y="36" fill="#1a2540"/>
  <text x="16" y="23" fill="#63ffda" font-family="JetBrains Mono,monospace" font-size="12" font-weight="bold" filter="url(#glow)">&#x2B21; BAN ULTRA · BRIDGE AUTONOMOUS NETWORK</text>
  <circle cx="505" cy="19" r="4" fill="#22c55e" filter="url(#glow)"/>
  <text x="514" y="23" fill="#22c55e" font-family="JetBrains Mono,monospace" font-size="9">LIVE</text>
  ${banBars}
  <text x="16" y="50" fill="#a855f7" font-family="JetBrains Mono,monospace" font-size="9">NODES: 8  ACTIVE: 6  TASKS: 24  THROUGHPUT: 142/min</text>
  <text x="16" y="64" fill="#64748b" font-family="JetBrains Mono,monospace" font-size="9">STATE: OPERATIONAL · CONSENSUS: ACHIEVED · CHAIN: LINEA MAINNET</text>
</svg>`;

fs.writeFileSync(path.join(OUT, 'ban-ultra.svg'), banUltraSVG);
console.log('  Generated ban-ultra.svg');

// BAN Live Console — streaming log lines animation
const LOG_LINES = [
  {col:'#63ffda', txt:'[AGENT alpha] task assigned: market-scan-v2'},
  {col:'#a855f7', txt:'[L2 router]   dispatching to 3 L3 workers'},
  {col:'#4ade80', txt:'[treasury]    +0.0042 BRDG · tx 0x7f3a...'},
  {col:'#f59e0b', txt:'[orchestrator] circuit-breaker: NORMAL'},
  {col:'#38bdf8', txt:'[skill-engine] teach/bridge.economy: 12ms'},
  {col:'#63ffda', txt:'[AGENT beta]  task complete: 38ms latency'},
  {col:'#64748b', txt:'[swarm]       health: 0.94 · 8/8 agents OK'},
];
const logLines = LOG_LINES.map((l, i) =>
  `<text x="12" y="${28 + i * 22}" fill="${l.col}" font-family="JetBrains Mono,monospace" font-size="10" opacity="0">
    <animate attributeName="opacity" values="0;1;1;0.7" begin="${i * 0.4}s" dur="3.5s" repeatCount="indefinite"/>
    ${l.txt}
  </text>`
).join('\n');

const banConsoleSVG = `<svg width="540" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="540" height="200" fill="#060810" rx="10"/>
  <rect width="540" height="28" fill="#0a0e17" rx="10"/>
  <rect width="540" height="1" y="28" fill="#1a2540"/>
  <circle cx="14" cy="14" r="5" fill="#ef4444"/>
  <circle cx="28" cy="14" r="5" fill="#f59e0b"/>
  <circle cx="42" cy="14" r="5" fill="#22c55e"/>
  <text x="58" y="19" fill="#64748b" font-family="JetBrains Mono,monospace" font-size="10">ban-live-console · Bridge AI OS</text>
  ${logLines}
</svg>`;

fs.writeFileSync(path.join(OUT, 'ban-live-console.svg'), banConsoleSVG);
console.log('  Generated ban-live-console.svg');

// Pre-build all skill SVGs into public/output/
const outDir = path.join(OUT, 'output');
mkdirp(outDir);

try {
  const { SKILL_LIST, renderSkill, getGraph } = require('./api/svg-skills');

  for (const skill of SKILL_LIST) {
    const svg = renderSkill(skill.id);
    if (svg) {
      fs.writeFileSync(path.join(outDir, skill.id + '.svg'), svg);
      console.log('  output/' + skill.id + '.svg');
    }
  }

  // Skill graph
  const graphSvg = getGraph();
  if (graphSvg) {
    fs.writeFileSync(path.join(outDir, '_graph.svg'), graphSvg);
    console.log('  output/_graph.svg');
  }

  // Index listing for /output/
  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.svg'));
  const indexHtml = `<!DOCTYPE html><html><head><title>Bridge SVG Output</title>
<style>body{background:#060810;color:#63ffda;font-family:monospace;padding:20px}a{color:#63ffda;display:block;padding:4px 0;text-decoration:none}a:hover{color:#fff}</style>
</head><body><h3>Bridge SVG Output (${files.length} files)</h3>
${files.map(f => `<a href="${f}">${f}</a>`).join('\n')}
</body></html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml);
  console.log('  output/index.html (' + files.length + ' SVGs listed)');

} catch (e) {
  console.warn('SVG skill pre-build failed:', e.message);
}

console.log('Done!');
