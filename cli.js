#!/usr/bin/env node
/**
 * Bridge AI OS — Unified CLI
 * Connects to: GOD MODE (:3000), Gateway (:8080), Brain (:8000), SVG Engine (:7070)
 * Usage:  node cli.js [command] [args...]
 *         node cli.js          ← interactive ASCII dashboard
 */

'use strict';

const http  = require('http');
const https = require('https');
const readline = require('readline');

// ── Service registry ──────────────────────────────────────────────────────────
const SERVICES = {
  godmode:  { name: 'GOD MODE',    host: 'localhost', port: 3000, health: '/health' },
  gateway:  { name: 'Gateway',     host: 'localhost', port: 8080, health: '/health' },
  brain:    { name: 'Brain',       host: 'localhost', port: parseInt(process.env.BRAIN_PORT) || 8080, health: '/health' },
  svg:      { name: 'SVG Engine',  host: 'localhost', port: 7070, health: '/health' },
};

// Cloud endpoints (override via BRIDGE_CLOUD env)
const CLOUD = {
  godmode: process.env.BRIDGE_CLOUD || 'https://go.ai-os.co.za',
  gateway: process.env.BRIDGE_GATEWAY || 'https://bridge-ai-os.com',
};

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  magenta:'\x1b[35m',
  white:  '\x1b[37m',
  bgBlue: '\x1b[44m',
};

const W = process.stdout.columns || 80;
const hr  = (ch = '─') => C.dim + ch.repeat(W) + C.reset;
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const rpad = (s, n) => String(s).padStart(n).slice(-n);

// ── HTTP helper ───────────────────────────────────────────────────────────────
function get(urlOrOpts, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const url    = typeof urlOrOpts === 'string' ? new URL(urlOrOpts) : urlOrOpts;
    const proto  = (url.protocol || 'http:') === 'https:' ? https : http;
    const opts   = { hostname: url.hostname, port: url.port, path: url.pathname + (url.search || ''), method: 'GET',
                     headers: { 'Accept': 'application/json' } };
    const req = proto.request(opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function localUrl(svc, path) {
  return new URL(`http://${SERVICES[svc].host}:${SERVICES[svc].port}${path}`);
}

// ── Health check all services ─────────────────────────────────────────────────
async function checkAll() {
  const results = {};
  await Promise.all(Object.entries(SERVICES).map(async ([key, svc]) => {
    try {
      const r = await get(localUrl(key, svc.health));
      results[key] = r.status < 400 ? 'up' : 'err';
    } catch {
      results[key] = 'down';
    }
  }));
  return results;
}

// ── ASCII status board ────────────────────────────────────────────────────────
async function dashboard() {
  console.clear();

  // Header
  console.log(C.cyan + C.bold);
  console.log('  ██████╗ ██████╗ ██╗██████╗  ██████╗ ███████╗     █████╗ ██╗');
  console.log('  ██╔══██╗██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝    ██╔══██╗██║');
  console.log('  ██████╔╝██████╔╝██║██║  ██║██║  ███╗█████╗      ███████║██║');
  console.log('  ██╔══██╗██╔══██╗██║██║  ██║██║   ██║██╔══╝      ██╔══██║██║');
  console.log('  ██████╔╝██║  ██║██║██████╔╝╚██████╔╝███████╗    ██║  ██║██║');
  console.log('  ╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ ╚══════╝   ╚═╝  ╚═╝╚═╝' + C.reset);
  console.log(C.dim + '  Bridge AI OS — Unified Control CLI' + C.reset);
  console.log(hr());

  // Service health
  console.log(C.bold + '  SERVICES' + C.reset);
  const health = await checkAll();
  const dot = s => s === 'up' ? C.green + '●' + C.reset : s === 'err' ? C.yellow + '◐' + C.reset : C.red + '○' + C.reset;
  const lbl = s => s === 'up' ? C.green + 'UP' + C.reset : s === 'err' ? C.yellow + 'ERR' + C.reset : C.red + 'DOWN' + C.reset;

  Object.entries(SERVICES).forEach(([key, svc]) => {
    const st = health[key];
    console.log(`  ${dot(st)}  ${pad(svc.name, 14)} ${C.dim}localhost:${svc.port}${C.reset}  ${lbl(st)}`);
  });

  // Economics
  console.log(hr());
  console.log(C.bold + '  ECONOMICS' + C.reset);
  try {
    const econ = await get(localUrl('godmode', '/api/marketplace/stats'));
    if (econ.data && econ.data.totals) {
      const t = econ.data.totals;
      console.log(`  ${C.dim}Monthly${C.reset}   ${C.green}$${Number(t.usd_monthly||0).toLocaleString()}${C.reset}`);
      console.log(`  ${C.dim}ZAR${C.reset}       ${C.green}R${Number(t.zar_invoice||0).toLocaleString()}${C.reset}`);
    } else {
      console.log(`  ${C.yellow}No economics data${C.reset}`);
    }
  } catch { console.log(`  ${C.red}Economics unavailable${C.reset}`); }

  // SVG Skills
  console.log(hr());
  console.log(C.bold + '  SVG SKILLS' + C.reset);
  try {
    const skills = await get(localUrl('svg', '/skills'));
    const list   = skills.data && skills.data.skills ? skills.data.skills : [];
    const local  = list.filter(s => s.source === 'local');
    const ban    = list.filter(s => s.source !== 'local');
    console.log(`  ${C.dim}Local${C.reset}    ${C.cyan}${local.length}${C.reset}  ${local.slice(0,3).map(s=>s.id).join(', ')}${local.length > 3 ? '...' : ''}`);
    console.log(`  ${C.dim}BAN${C.reset}      ${C.cyan}${ban.length}${C.reset}  skills loaded`);
  } catch { console.log(`  ${C.red}SVG Engine unavailable${C.reset}`); }

  // Cloud
  console.log(hr());
  console.log(C.bold + '  CLOUD' + C.reset);
  for (const [name, url] of Object.entries(CLOUD)) {
    try {
      const r = await get(url + '/health', 4000);
      console.log(`  ${dot(r.status < 400 ? 'up' : 'err')}  ${pad(url, 35)}  ${lbl(r.status < 400 ? 'up' : 'err')}`);
    } catch {
      console.log(`  ${dot('down')}  ${pad(url, 35)}  ${lbl('down')}`);
    }
  }

  console.log(hr());
  console.log(C.dim + '  Commands: status | skills | econ | agents | logs | exec <skill> | help | exit' + C.reset);
  console.log(hr());
}

// ── Command handlers ──────────────────────────────────────────────────────────
const COMMANDS = {
  async status() {
    const h = await checkAll();
    Object.entries(SERVICES).forEach(([k, s]) => {
      const st = h[k];
      const icon = st === 'up' ? '✓' : st === 'err' ? '!' : '✗';
      console.log(`  [${icon}] ${s.name} :${s.port}  — ${st.toUpperCase()}`);
    });
  },

  async skills(filter) {
    const res = await get(localUrl('svg', '/skills'));
    const all = res.data.skills || [];
    const list = filter ? all.filter(s => s.id.includes(filter) || (s.tags||[]).includes(filter)) : all;
    console.log(`\n  ${C.cyan}${list.length} skills${filter ? ` matching "${filter}"` : ''}${C.reset}\n`);
    list.slice(0, 20).forEach(s => {
      console.log(`  ${C.green}${pad(s.id, 24)}${C.reset} ${C.dim}${s.source}${C.reset}  ${s.description ? s.description.slice(0, 50) : ''}`);
    });
    if (list.length > 20) console.log(`  ${C.dim}... and ${list.length - 20} more${C.reset}`);
  },

  async econ() {
    const res = await get(localUrl('godmode', '/api/marketplace/stats'));
    const d = res.data;
    if (!d || !d.totals) { console.log('  No economics data'); return; }
    console.log(`\n  ${C.bold}Economics${C.reset}`);
    console.log(`  Monthly   $${Number(d.totals.usd_monthly).toLocaleString()}`);
    console.log(`  Yearly    $${Number(d.totals.usd_yearly).toLocaleString()}`);
    console.log(`  ZAR       R${Number(d.totals.zar_invoice).toLocaleString()}`);
    if (d.platforms) {
      console.log(`\n  ${C.dim}Platforms${C.reset}`);
      d.platforms.forEach(p => console.log(`  ${pad(p.name, 24)} ${p.status}`));
    }
  },

  async agents() {
    try {
      const res = await get(localUrl('godmode', '/api/agents'));
      const agents = Array.isArray(res.data) ? res.data : (res.data.agents || []);
      console.log(`\n  ${C.cyan}${agents.length} agents${C.reset}`);
      agents.slice(0, 15).forEach(a => {
        const name = typeof a === 'string' ? a : (a.name || a.id || JSON.stringify(a));
        console.log(`  • ${name}`);
      });
    } catch (e) {
      console.log(`  ${C.red}Agents unavailable: ${e.message}${C.reset}`);
    }
  },

  async logs(n = 20) {
    try {
      const res = await get(localUrl('godmode', '/api/logs'));
      const lines = Array.isArray(res.data) ? res.data : [];
      console.log(`\n  ${C.dim}Last ${Math.min(n, lines.length)} log lines${C.reset}`);
      lines.slice(-n).forEach(l => console.log('  ' + (typeof l === 'string' ? l : JSON.stringify(l))));
    } catch (e) {
      console.log(`  ${C.red}Logs unavailable: ${e.message}${C.reset}`);
    }
  },

  async exec(skillId) {
    if (!skillId) { console.log('  Usage: exec <skill-id>'); return; }
    console.log(`  ${C.dim}Executing skill: ${skillId}${C.reset}`);
    try {
      const res = await get(localUrl('svg', '/run/' + encodeURIComponent(skillId)));
      console.log(`\n  ${C.green}✓ ${skillId}${C.reset}`);
      const d = res.data;
      if (d && d.data) {
        Object.entries(d.data).forEach(([k, v]) => console.log(`  ${pad(k, 22)} ${v}`));
      }
    } catch (e) {
      console.log(`  ${C.red}Error: ${e.message}${C.reset}`);
    }
  },

  async cloud() {
    console.log(`\n  ${C.bold}Cloud Endpoints${C.reset}`);
    for (const [name, url] of Object.entries(CLOUD)) {
      try {
        const r = await get(url + '/health', 5000);
        console.log(`  ${C.green}✓${C.reset}  ${url}  (${r.status})`);
      } catch (e) {
        console.log(`  ${C.red}✗${C.reset}  ${url}  — ${e.message}`);
      }
    }
  },

  help() {
    console.log(`
  ${C.cyan}Bridge AI OS CLI${C.reset}

  ${C.bold}Commands:${C.reset}
    status              — health check all local services
    skills [filter]     — list SVG skills (optional filter)
    econ                — economics summary
    agents              — agent list from GOD MODE
    logs [n]            — tail last N log lines (default 20)
    exec <skill>        — run an SVG skill
    cloud               — check cloud endpoints
    dash                — redraw full ASCII dashboard
    exit / quit         — exit CLI

  ${C.bold}Services:${C.reset}
${Object.entries(SERVICES).map(([k,s]) => `    ${pad(k,10)} localhost:${s.port}  ${s.name}`).join('\n')}

  ${C.bold}Environment:${C.reset}
    BRIDGE_CLOUD        — override cloud GOD MODE URL (default: https://go.ai-os.co.za)
    BRIDGE_GATEWAY      — override gateway URL (default: https://bridge-ai-os.com)
`);
  },
};

// ── One-shot CLI mode ─────────────────────────────────────────────────────────
async function runCommand(argv) {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === 'dash') { await dashboard(); return; }
  if (COMMANDS[cmd]) {
    await COMMANDS[cmd](...args);
  } else {
    console.log(`  Unknown command: ${cmd}. Run: node cli.js help`);
    process.exit(1);
  }
}

// ── Interactive REPL ──────────────────────────────────────────────────────────
async function repl() {
  await dashboard();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: C.cyan + '\n  bridge> ' + C.reset });
  rl.prompt();
  rl.on('line', async line => {
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (!cmd) { rl.prompt(); return; }
    if (cmd === 'exit' || cmd === 'quit') { console.log('  Bye.'); process.exit(0); }
    if (cmd === 'dash') { await dashboard(); rl.prompt(); return; }
    if (COMMANDS[cmd]) {
      try { await COMMANDS[cmd](...args); } catch(e) { console.log(`  ${C.red}Error: ${e.message}${C.reset}`); }
    } else {
      console.log(`  Unknown: ${cmd}. Type ${C.cyan}help${C.reset}`);
    }
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
}

// ── Entry point ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.length) {
  runCommand(argv).catch(e => { console.error(e.message); process.exit(1); });
} else {
  repl().catch(e => { console.error(e.message); process.exit(1); });
}
