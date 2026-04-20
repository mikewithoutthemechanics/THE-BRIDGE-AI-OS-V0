/*****************************************************************************
  BOOT GUARD — must be served via http://, NOT file://
*****************************************************************************/
if (location.protocol === 'file:') {
  document.body.innerHTML = '<div style="padding:40px;font-family:monospace;background:#050a10;color:#f44;font-size:14px;">'
    + '<h2>⚠ OPEN VIA HTTP — NOT FILE://</h2>'
    + '<p style="margin-top:12px;color:#0ff;">Run in your terminal:</p>'
    + '<pre style="background:#000;padding:12px;color:#0f9;margin-top:8px;">node system.js</pre>'
    + '<p style="margin-top:12px;color:#0ff;">Then open: <a href="/" style="color:#0ff;">your local server</a></p>'
    + '</div>';
  throw new Error('file:// protocol — server not running');
}

/*****************************************************************************
  GLOBALS
*****************************************************************************/
const WIN    = navigator.platform.toLowerCase().includes('win');
const BASE   = window.location.origin;
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/terminal';
const IS_SERVERLESS = location.hostname.includes('vercel.app') || location.hostname.includes('.vercel.');

let socket       = null;
let terminals    = {};   // id → { term, fitAddon, el }
let activeId     = null;
let sessionSeq   = 0;
let packetCount  = 0;

/*****************************************************************************
  WEBSOCKET
*****************************************************************************/
function wsConnect() {
  if (IS_SERVERLESS) {
    document.getElementById('ws-status').textContent = 'WS: serverless mode';
    document.getElementById('ws-status').style.color = '#fc0';
    return;
  }

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    document.getElementById('ws-status').textContent = 'WS: connected';
    document.getElementById('ws-status').style.color = '#0f9';
  };

  socket.onclose = () => {
    document.getElementById('ws-status').textContent = 'WS: disconnected — reconnecting…';
    document.getElementById('ws-status').style.color = '#f90';
    setTimeout(wsConnect, 3000);
  };

  socket.onerror = () => {
    document.getElementById('ws-status').textContent = 'WS: error';
    document.getElementById('ws-status').style.color = '#f44';
  };

  socket.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    // Support both 'id' (new) and 'sessionId' (legacy)
    const sid = msg.id || msg.sessionId;

    if (msg.type === 'created' || msg.type === 'ready') {
      if (terminals[sid]) terminals[sid].term.write('\r\n\x1b[32m[SESSION READY]\x1b[0m\r\n');
    }
    if (msg.type === 'auth_ok') {
      console.log('Auth OK:', msg.user, msg.role);
    }
    if (msg.type === 'monitor' && msg.stats) {
      const s = msg.stats;
      document.getElementById('mon-cpu').textContent  = s.cpu + '%';
      document.getElementById('mon-mem').textContent  = s.memMB + 'MB';
      document.getElementById('mon-up').textContent   = s.uptime + 's';
      document.getElementById('mon-load').textContent = (s.load||[]).map(v=>v.toFixed(2)).join(' ');
    }
    if (msg.type === 'output' && terminals[sid]) {
      terminals[sid].term.write(msg.data);
    }
    if (msg.type === 'exit' && terminals[sid]) {
      terminals[sid].term.write(`\r\n\x1b[31m[EXIT code=${msg.code}]\x1b[0m\r\n`);
    }
  };
}

function wsSend(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

/*****************************************************************************
  TERMINALS
*****************************************************************************/
function createTerminal() {
  if (Object.keys(terminals).length >= 6) {
    alert('Max 6 terminals. Close one first.');
    return;
  }

  const id    = 'T' + (++sessionSeq);
  const grid  = document.getElementById('terminals');

  const slot = document.createElement('div');
  slot.className = 'term-slot';
  slot.id = 'slot-' + id;
  grid.appendChild(slot);

  const label = document.createElement('div');
  label.className = 'term-label';
  label.textContent = id;
  slot.appendChild(label);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'term-close';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => closeTerminal(id);
  slot.appendChild(closeBtn);

  const termEl = document.createElement('div');
  termEl.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;padding:2px;';
  slot.appendChild(termEl);

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 11,
    fontFamily: 'Courier New, monospace',
    theme: {
      background: '#000000',
      foreground: '#00ffcc',
      cursor:     '#00ffcc',
    },
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(termEl);

  try { fitAddon.fit(); } catch {}

  terminals[id] = { term, fitAddon, el: slot };
  activeId = id;
  updateStatusBar();

  // ASCII splash for each terminal
  const slotIndex = Object.keys(terminals).length - 1;
  const C = '\x1b[36m';
  const G = '\x1b[32m';
  const D = '\x1b[2;36m';
  const W = '\x1b[1;37m';
  const R = '\x1b[0m';
  term.writeln('');
  term.writeln(C + '  ____       _     __              ___    ____' + R);
  term.writeln(C + ' / __ )_____(_)___/ /___ _____    /   |  /  _/' + R);
  term.writeln(C + '/ __  / ___/ / __  / __ `/ _ \\   / /| |  / /  ' + R);
  term.writeln(C + '/ /_/ / /  / / /_/ / /_/ /  __/  / ___ |_/ /   ' + R);
  term.writeln(C + '/_____/_/  /_/\\__,_/\\__, /\\___/  /_/  |_/___/  ' + R);
  term.writeln(C + '                   /____/                       ' + R);
  term.writeln('');
  term.writeln(D + '  Session ' + (slotIndex + 1) + ' | Bridge AI OS Terminal' + R);
  term.writeln(G + '  Status: ' + R + (IS_SERVERLESS ? '\x1b[33mServerless Mode\x1b[0m' : '\x1b[32mConnecting...\x1b[0m'));
  term.writeln('');
  if (IS_SERVERLESS) {
    term.writeln(D + '  WebSocket unavailable in serverless mode.' + R);
    term.writeln(D + '  Run locally: ' + W + 'node gateway.js' + R);
    term.writeln('');
  }
  term.write(G + '  bridge@os' + R + ':' + C + '~' + R + '$ ');

  // Request PTY session
  wsSend({ type: 'create', id, cols: term.cols || 80, rows: term.rows || 24 });

  term.onData(data => {
    wsSend({ type: 'input', id: activeId, data });
  });

  // Activate this terminal on click
  slot.onclick = () => { activeId = id; updateStatusBar(); };

  // Resize observer
  const ro = new ResizeObserver(() => {
    try {
      fitAddon.fit();
      wsSend({ type:'resize', id, cols: term.cols, rows: term.rows });
    } catch {}
  });
  ro.observe(slot);

  rebalanceGrid();
}

function closeTerminal(id) {
  wsSend({ type: 'kill', id });
  if (terminals[id]) {
    terminals[id].term.dispose();
    const slot = document.getElementById('slot-' + id);
    if (slot) slot.remove();
    delete terminals[id];
  }
  if (activeId === id) {
    const remaining = Object.keys(terminals);
    activeId = remaining.length ? remaining[remaining.length - 1] : null;
  }
  updateStatusBar();
  rebalanceGrid();
}

function execCmd(cmd) {
  if (!activeId) { createTerminal(); setTimeout(() => execCmd(cmd), 500); return; }
  wsSend({ type: 'exec', id: activeId, cmd });
}

function runScan() {
  fetch(BASE + '/api/topology').then(r => r.json()).then(d => {
    if (activeId && terminals[activeId]) {
      terminals[activeId].term.write('\r\n\x1b[36m[SCAN COMPLETE]\x1b[0m Nodes: ' +
        (d.nodes ? d.nodes.length : '?') + '\r\n');
    }
  }).catch(err => console.warn('Scan failed:', err));
}

// Open a terminal in the working directory of a topology node
function openNodeTerminal(nodeId) {
  if (Object.keys(terminals).length >= 6) { createTerminal(); return; }
  const id = 'NODE-' + nodeId + '-' + (++sessionSeq);
  const grid = document.getElementById('terminals');

  const slot = document.createElement('div');
  slot.className = 'term-slot';
  slot.id = 'slot-' + id;
  grid.appendChild(slot);

  const label = document.createElement('div');
  label.className = 'term-label';
  label.textContent = nodeId;
  slot.appendChild(label);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'term-close';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => closeTerminal(id);
  slot.appendChild(closeBtn);

  const termEl = document.createElement('div');
  termEl.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;padding:2px;';
  slot.appendChild(termEl);

  const term = new Terminal({ cursorBlink:true, fontSize:11, fontFamily:'Courier New,monospace',
    theme:{ background:'#000', foreground:'#00ffcc', cursor:'#00ffcc' } });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(termEl);
  try { fitAddon.fit(); } catch {}

  terminals[id] = { term, fitAddon, el: slot };
  activeId = id;
  updateStatusBar();

  // Request node-aware PTY session
  wsSend({ type:'create_node', id, node:nodeId, cols:term.cols||80, rows:term.rows||24 });

  term.onData(data => wsSend({ type:'input', id, data }));
  slot.onclick = () => { activeId = id; updateStatusBar(); };

  const ro = new ResizeObserver(() => {
    try { fitAddon.fit(); wsSend({ type:'resize', id, cols:term.cols, rows:term.rows }); } catch {}
  });
  ro.observe(slot);
  rebalanceGrid();
}

// Broadcast a command to ALL active terminals (swarm)
function runSwarm(cmd) {
  const ids = Object.keys(terminals);
  if (ids.length === 0) { createTerminal(); setTimeout(() => runSwarm(cmd), 600); return; }
  ids.forEach(id => wsSend({ type:'exec', id, cmd }));
}

// Fetch and display audit log in active terminal
function fetchAudit() {
  fetch(BASE + '/api/contracts').then(r => r.json()).then(d => {
    if (!activeId || !terminals[activeId]) return;
    const t = terminals[activeId].term;
    t.write('\r\n\x1b[33m[CONTRACTS — ' + (d.count||0) + ' files]\x1b[0m\r\n');
    (d.files||[]).slice(-20).forEach(f => t.write('  ' + f + '\r\n'));
  }).catch(err => console.warn('Audit fetch failed:', err));
}

function rebalanceGrid() {
  const count = Object.keys(terminals).length;
  Object.values(terminals).forEach(({ el }) => {
    el.className = 'term-slot';
    if (count === 1) el.style.width = '100%', el.style.height = '100%';
    else if (count === 2) el.style.width = '50%', el.style.height = '100%';
    else if (count <= 4) el.style.width = '50%', el.style.height = '50%';
    else el.style.width = '33.33%', el.style.height = '50%';
  });
}

function updateStatusBar() {
  const count = Object.keys(terminals).length;
  document.getElementById('session-count').textContent = 'SESSIONS: ' + count;
  document.getElementById('active-session').textContent = 'ACTIVE: ' + (activeId || 'none');
}

/*****************************************************************************
  CLOCK
*****************************************************************************/
setInterval(() => {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString();
}, 1000);

/*****************************************************************************
  SYSTEM TOPOLOGY NODES (loaded from API, falls back to static)
*****************************************************************************/
let nodes = [], edges = [], scanData = {};

async function loadTopology() {
  try {
    const d = await fetch(BASE + '/api/topology').then(r => r.json());
    scanData = d;
    buildNodesFromAPI(d);
  } catch {
    buildStaticNodes();
  }
}

function buildNodesFromAPI(d) {
  nodes = (d.nodes || []).map(n => ({
    id: n.id, type: n.type || 'service', label: n.label || n.id,
  }));
  edges = (d.edges || []).map(e => [e.source, e.target]);
  if (nodes.length === 0) buildStaticNodes();
  document.getElementById('stats').textContent =
    'NODES:' + nodes.length + ' | EDGES:' + edges.length + ' | PKT:' + packetCount;
}

function buildNodesFromScan(d) {
  nodes = [
    { id:'HOST',    type:'hub',   label:'HOST' },
    { id:'HTTP',    type:'port',  label:':'+( (d.scan||{}).port||3000 ) },
    { id:'WS',      type:'port',  label:'WS' },
  ];
  const engines = d.engines || {};
  const topEngines = Object.keys(engines).filter(k=>engines[k]).slice(0,12);
  topEngines.forEach(k => nodes.push({ id:k, type:'engine', label:k }));

  edges = [
    ['HOST','HTTP'],['HOST','WS'],
    ...topEngines.map(k=>['HOST',k]),
  ];

  const nets = (d.scan||{}).network || [];
  nets.slice(0,4).forEach(n => {
    nodes.push({ id:n, type:'net', label:n });
    edges.push(['HOST',n]);
  });

  document.getElementById('stats').textContent =
    'NODES:' + nodes.length + ' | EDGES:' + edges.length + ' | PKT:' + packetCount;
}

function buildStaticNodes() {
  nodes = [
    {id:'C',    type:'drive', label:'C:'},{id:'D',    type:'drive', label:'D:'},{id:'E',    type:'drive', label:'E:'},
    {id:'bridgeos',     type:'project', parent:'C', label:'bridgeos'},
    {id:'BRIDGE_AI_OS', type:'project', parent:'C', label:'BRIDGE_AI_OS'},
    {id:'BridgeAI_C',   type:'project', parent:'C', label:'BridgeAI_C'},
    {id:'BRIDGE_PY',    type:'project', parent:'D', label:'BRIDGE_PY'},
    {id:'authority',    type:'project', parent:'D', label:'authority'},
    {id:'receipts',     type:'project', parent:'D', label:'receipts'},
    {id:'IdentityVault',type:'project', parent:'E', label:'IdentityVault'},
    {id:'BridgeAudit',  type:'project', parent:'E', label:'BridgeAudit'},
    {id:'SVGEngine',    type:'project', parent:'E', label:'SVGEngine'},
  ];
  edges = [
    ['C','bridgeos'],['C','BRIDGE_AI_OS'],['C','BridgeAI_C'],
    ['D','BRIDGE_PY'],['D','authority'],['D','receipts'],
    ['E','IdentityVault'],['E','BridgeAudit'],
    ['bridgeos','BRIDGE_PY'],['BRIDGE_PY','BridgeAudit'],
  ];
}

/*****************************************************************************
  SVG VISUAL ENGINE
  ──────────────────
  Replaces the old p5 canvas with a pure SVG render. Nodes sit on concentric
  rings (drive → inner, engine/port → mid, project/net → outer). Edges are
  drawn as dashed paths that dash-animate via CSS. A small circle with
  <animateMotion> rides each active edge outward from the hub; this is what
  delivers the "data flowing through the grid" feel without any rAF loop.

  Click on a node → openNodeTerminal(nodeId) so the topology acts as a
  launcher for the system-managed terminal orchestra (system.js PTY sessions).
*****************************************************************************/
const TOPO = { cx: 400, cy: 225, rings: { inner: 90, mid: 150, outer: 200 } };
let selectedNodeId = null;

function ringFor(type) {
  // Map topology node types to rings. Center-only types are handled upstream.
  if (type === 'drive')                return 'inner';
  if (type === 'engine' || type === 'port') return 'mid';
  return 'outer'; // project, net, service, anything else
}

function topoPos(i, total, ringKey) {
  const r = TOPO.rings[ringKey] || TOPO.rings.outer;
  // Add a per-ring phase so rings don't align and labels don't collide
  const phase = { inner: 0, mid: 0.37, outer: 0.74 }[ringKey] || 0;
  const angle = (i / Math.max(total, 1)) * Math.PI * 2 + phase;
  return { x: TOPO.cx + Math.cos(angle) * r, y: TOPO.cy + Math.sin(angle) * r };
}

function nodeTone(n) {
  // Topology doesn't ship per-node health yet; default all active. Overrides
  // come from scanData.health (if the scan API attaches it) or an 'offline'
  // flag on the node itself.
  if (n.offline)              return 'of';
  if (n.warn || n.restarts>5) return 'wa';
  return 'on';
}

// Packet factory — reuses existing element per edge name, so re-renders don't
// restart the animation (no flicker). Packet rides from hub out to node.
function ensurePacket(packetsG, key, tone, fromX, fromY, toX, toY) {
  let pkt = packetsG.querySelector('[data-name="' + CSS.escape(key) + '"]');
  if (!pkt) {
    pkt = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pkt.setAttribute('r', '2.6');
    pkt.dataset.name = key;
    const am = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    am.setAttribute('dur', '2.6s');
    am.setAttribute('repeatCount', 'indefinite');
    am.setAttribute('rotate', 'auto');
    // Deterministic phase offset so packets don't all strobe together
    const hash = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
    am.setAttribute('begin', '-' + ((hash % 26) * 0.1) + 's');
    pkt.appendChild(am);
    packetsG.appendChild(pkt);
  }
  pkt.setAttribute('class', 'packet ' + tone);
  const am = pkt.querySelector('animateMotion');
  am.setAttribute('path', 'M ' + fromX + ' ' + fromY + ' L ' + toX + ' ' + toY);
  am.setAttribute('dur', tone === 'wa' ? '3.4s' : '2.6s');
  return pkt;
}

function renderTopologySVG() {
  const nodesG = document.getElementById('topoNodes');
  const edgesG = document.getElementById('topoEdges');
  const pktG   = document.getElementById('topoPackets');
  if (!nodesG || !edgesG) return;

  // Nodes that sit at the hub (type:'hub') don't draw — the hub is static markup
  const drawable = nodes.filter(n => n.type !== 'hub');

  // Bucket by ring so we can distribute evenly
  const rings = { inner: [], mid: [], outer: [] };
  drawable.forEach(n => rings[ringFor(n.type)].push(n));

  // Reuse existing elements keyed by node id — prevents flicker on re-render
  const existingN = new Map(Array.from(nodesG.querySelectorAll('.nodeG')).map(g => [g.dataset.name, g]));
  const existingE = new Map(Array.from(edgesG.querySelectorAll('.edge')).map(p => [p.dataset.name, p]));
  const existingP = pktG ? new Map(Array.from(pktG.querySelectorAll('[data-name]')).map(p => [p.dataset.name, p])) : new Map();
  const wantedN = new Set();
  const wantedE = new Set();
  const wantedP = new Set();

  Object.entries(rings).forEach(([ringKey, list]) => {
    list.forEach((n, i) => {
      const pos = topoPos(i, list.length, ringKey);
      const tone = nodeTone(n);
      wantedN.add(n.id);

      // Edge (hub → node)
      const edgeKey = 'E-' + n.id;
      wantedE.add(edgeKey);
      let edge = existingE.get(edgeKey);
      if (!edge) {
        edge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        edge.dataset.name = edgeKey;
        edgesG.appendChild(edge);
      }
      edge.setAttribute('class', 'edge ' + tone);
      edge.setAttribute('d', 'M ' + TOPO.cx + ' ' + TOPO.cy + ' L ' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1));
      edge.setAttribute('stroke', tone === 'on' ? 'url(#edgeOn)' : tone === 'wa' ? '#ffb347' : '#ff4d6d');

      // Packet (only for live edges)
      if (pktG && tone !== 'of') {
        const pktKey = 'P-' + n.id;
        wantedP.add(pktKey);
        ensurePacket(pktG, pktKey, tone, TOPO.cx, TOPO.cy, pos.x, pos.y);
      }

      // Node group
      let g = existingN.get(n.id);
      if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'nodeG');
        g.dataset.name = n.id;
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hit.setAttribute('r', '22'); hit.setAttribute('fill', 'transparent'); hit.setAttribute('pointer-events', 'all');
        const ringEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ringEl.setAttribute('class', 'ring'); ringEl.setAttribute('r', '14');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('class', 'dot'); dot.setAttribute('r', '6');
        const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pulse.setAttribute('class', 'pulse'); pulse.setAttribute('fill', 'none'); pulse.setAttribute('stroke-width', '1.2');
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('dy', '28');
        g.appendChild(hit); g.appendChild(ringEl); g.appendChild(dot); g.appendChild(pulse); g.appendChild(label);
        // Click → open a system-managed terminal for this node
        g.addEventListener('click', () => selectTopoNode(n.id));
        nodesG.appendChild(g);
      }
      g.setAttribute('transform', 'translate(' + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1) + ')');
      g.classList.toggle('active', n.id === selectedNodeId);
      const color = tone === 'on' ? '#00ff9c' : tone === 'wa' ? '#ffb347' : '#ff4d6d';
      g.querySelector('.dot').setAttribute('fill', color);
      g.querySelector('.pulse').setAttribute('stroke', color);
      g.querySelector('.pulse').setAttribute('class', 'pulse ' + tone);
      const raw = n.label || n.id;
      const short = raw.length > 14 ? raw.slice(0, 12) + '…' : raw;
      const labelEl = g.querySelector('text');
      if (labelEl.textContent !== short) labelEl.textContent = short;
    });
  });

  // Sweep away elements that no longer correspond to a real node
  existingN.forEach((g, k) => { if (!wantedN.has(k)) g.remove(); });
  existingE.forEach((p, k) => { if (!wantedE.has(k)) p.remove(); });
  existingP.forEach((p, k) => { if (!wantedP.has(k)) p.remove(); });

  // Pure packet counter — grows at 1/edge/tick so the "PKT:" header climbs like
  // the old p5 counter, but without rAF overhead. Ticks at 10Hz below.
  packetCount += wantedP.size;
  const stats = document.getElementById('stats');
  if (stats) stats.textContent = 'NODES:' + drawable.length + ' | EDGES:' + wantedE.size + ' | PKT:' + packetCount;
}

// Click handler: highlight node, open a system-managed terminal for it.
// The terminal grid is capped at 6; openNodeTerminal already enforces that.
function selectTopoNode(id) {
  selectedNodeId = (selectedNodeId === id) ? null : id;
  const sel = document.getElementById('topoSel');
  if (sel) {
    sel.innerHTML = selectedNodeId
      ? '<b>' + id + '</b> · managed terminal session opening…'
      : 'click a node to open a managed terminal';
  }
  renderTopologySVG();
  if (selectedNodeId) openNodeTerminal(id);
}

// Responsive: viewBox handles scaling, but the host container size changes
// on rotate/resize. Re-render on resize so packet paths stay accurate.
window.addEventListener('resize', () => {
  clearTimeout(window._topoResizeT);
  window._topoResizeT = setTimeout(renderTopologySVG, 200);
});

// Initial topology load → render → re-render every 10s so packet paths track
// any new nodes that come online via the /api/topology poll.
loadTopology().then(() => renderTopologySVG());
setInterval(renderTopologySVG, 10000);

/*****************************************************************************
  FINANCE (CLIENT-SIDE TRACKING)
*****************************************************************************/
const Finance = {
  ledger: [],
  balance: 0,
  recordRevenue(amount, source) {
    this.balance += amount;
    this.ledger.push({ type:'revenue', amount, source, t: Date.now() });
  },
  recordCost(amount, service) {
    this.balance -= amount;
    this.ledger.push({ type:'cost', amount, service, t: Date.now() });
  },
  report() {
    return {
      balance:  this.balance,
      revenues: this.ledger.filter(x => x.type === 'revenue').length,
      costs:    this.ledger.filter(x => x.type === 'cost').length,
    };
  },
};

function simulateRevenue() {
  Finance.recordRevenue(Math.floor(Math.random() * 100), 'api_payment');
}
function simulateCost() {
  Finance.recordCost(Math.floor(Math.random() * 50), 'infrastructure');
}

/*****************************************************************************
  AI OVERLAY (DOM — lives inside #topo-host, updated on an interval)
  ──────────────────────────────────────────────────────────────────
  Replaces the old p5 canvas overlay. Same info (AI state, agent swarm,
  balance/rev/cost counters) but rendered as a positioned DOM block so it
  respects the SVG viewBox and never drifts off-pixel.
*****************************************************************************/
(function installAIOverlay() {
  const host = document.getElementById('topo-host');
  if (!host) return;
  const el = document.createElement('div');
  el.id = 'ai-overlay';
  el.style.cssText =
    'position:absolute;left:14px;bottom:10px;z-index:2;pointer-events:none;' +
    'font:10px/1.55 ui-monospace,monospace;letter-spacing:1.2px;' +
    'color:#00ffc8;text-shadow:0 0 6px rgba(0,255,200,.35)';
  el.innerHTML =
    '<div id="ai-row1">AI: AUTONOMOUS</div>' +
    '<div id="ai-row2" style="color:#9aa7b3">AGENTS: MONITOR · HEALER · OPTIMIZER</div>' +
    '<div id="ai-row3" style="color:#00ff9c">BALANCE: $0  REV:0  COST:0</div>';
  host.appendChild(el);
  setInterval(() => {
    const r = Finance.report();
    const row = document.getElementById('ai-row3');
    if (row) row.textContent = 'BALANCE: $' + r.balance + '  REV:' + r.revenues + '  COST:' + r.costs;
  }, 1500);
})();

/*****************************************************************************
  AI CONTROLS PANEL (added to DOM)
*****************************************************************************/
(function addAIControls() {
  const panel = document.createElement('div');
  panel.id = 'ai-ctrl-panel';
  panel.style.cssText = 'background:#000;border:1px solid #0f9;padding:8px;display:flex;flex-direction:column;gap:4px;flex-shrink:0;border-radius:4px;';
  panel.innerHTML = `
<div style="font-size:8px;letter-spacing:2px;color:#0f9;padding-bottom:4px;border-bottom:1px solid #0f92;margin-bottom:2px;">AI CONTROLS</div>
<button style="background:#001a0a;border:1px solid #0f93;color:#0f9;padding:3px 7px;font-size:9px;font-family:monospace;cursor:pointer;" onclick="runSwarm('pm2 status')">AI STATUS</button>
<button style="background:#001a0a;border:1px solid #0f93;color:#0f9;padding:3px 7px;font-size:9px;font-family:monospace;cursor:pointer;" onclick="runSwarm('docker stats --no-stream')">CONTAINERS</button>
<button style="background:#001a0a;border:1px solid #0f93;color:#0f9;padding:3px 7px;font-size:9px;font-family:monospace;cursor:pointer;" onclick="simulateRevenue();simulateCost()">+ SIM TX</button>
  `;
  const rightSidebar = document.getElementById('right-sidebar');
  if (rightSidebar) rightSidebar.appendChild(panel);
  else document.body.appendChild(panel);
})();

/*****************************************************************************
  ECONOMICS ENGINE — full cross-platform aggregator
*****************************************************************************/
let economicsData = null;

async function loadEconomics() {
  try {
    const raw = await fetch(BASE + '/api/marketplace/stats').then(r => r.json()).then(d => d.data || d);
    // Map API stats to economics format
    economicsData = {
      totals: {
        usd_monthly: raw.revenue_mtd || Math.floor((raw.total_tasks || 0) * 49),
        usd_yearly: (raw.revenue_mtd || Math.floor((raw.total_tasks || 0) * 49)) * 12,
        zar_invoice: Math.floor((raw.revenue_mtd || 5000) * 18.5),
      },
      platforms: [
        { id: 'saas', name: 'Bridge AI SaaS', type: 'subscription', status: 'active', location: 'gateway.js',
          mrr_potential: raw.revenue_mtd || 28450,
          plans: [
            { name: 'Starter', price_monthly: 49, price_yearly: 490, api_limit: 10000, token_limit: 500000 },
            { name: 'Pro', price_monthly: 149, price_yearly: 1490, api_limit: 100000, token_limit: 5000000 },
            { name: 'Enterprise', price_monthly: 499, price_yearly: 4990, api_limit: 0, token_limit: 0 },
          ] },
        { id: 'agents', name: 'Agent Marketplace', type: 'marketplace', status: 'active', location: 'agents/',
          stats: { leads: raw.total_tasks || 13, clicks: (raw.total_agents || 3) * 120 },
          base_url: window.location.origin + '/marketplace.html' },
        { id: 'infra', name: 'Infrastructure', type: 'cost-center', status: 'deployed', location: 'Xcontainerx/',
          line_items: [
            { description: 'Vercel Pro', total_zar: 740 },
            { description: 'Domain & SSL', total_zar: 350 },
            { description: 'API Compute', total_zar: 2800 },
          ],
          subtotal_zar: 3890, vat_rate: '15%', vat_zar: 583.5, total_zar: 4473.5 },
      ],
    };
    renderEconomicsPanel(economicsData);
    renderEconomicsOverlay();
  } catch (e) {
    console.warn('Economics API unavailable:', e.message);
  }
}

function renderEconomicsPanel(data) {
  const panel = document.getElementById('econ-container');
  if (!panel || !data) return;

  const fmt = (n, cur) => cur === 'ZAR' ? 'R' + Number(n).toLocaleString() :
                           cur === 'USD' ? '$' + Number(n).toLocaleString() :
                           cur === 'USDC' ? Number(n).toLocaleString() + ' USDC' : String(n);

  let html = `<div class="econ-title">◈ ECONOMICS — LIVE</div>`;

  // Totals bar
  html += `<div class="econ-totals">
    <span>SaaS MRR</span><span class="econ-val green">$${data.totals.usd_monthly}/mo</span>
    <span>ARR</span><span class="econ-val green">$${data.totals.usd_yearly}/yr</span>
    <span>Invoice</span><span class="econ-val gold">R${Number(data.totals.zar_invoice).toLocaleString()}</span>
  </div>`;

  // Each platform
  (data.platforms || []).forEach(p => {
    const statusCol = p.status === 'active' || p.status === 'deployed' ? '#0f9' :
                      p.status === 'configured' ? '#0cf' :
                      p.status === 'protocol-defined' ? '#f90' : '#556';

    html += `<div class="econ-platform" onclick="togglePlatform('${p.id}')">
      <div class="econ-ph">
        <span style="color:${statusCol}">▸ ${p.name}</span>
        <span class="econ-badge">${p.type.toUpperCase()}</span>
      </div>
      <div class="econ-body" id="econ-${p.id}" style="display:none;">`;

    if (p.plans) {
      p.plans.forEach(plan => {
        const mo = plan.price_monthly > 0 ? `$${plan.price_monthly}/mo` : 'FREE';
        const yr = plan.price_yearly > 0 ? ` · $${plan.price_yearly}/yr` : '';
        html += `<div class="econ-row"><span>${plan.name}</span><span class="econ-val">${mo}${yr}</span></div>`;
        if (plan.api_limit) html += `<div class="econ-sub">${Number(plan.api_limit).toLocaleString()} req · ${Number(plan.token_limit).toLocaleString()} tokens</div>`;
        if (!plan.api_limit) html += `<div class="econ-sub">UNLIMITED · dedicated SLA</div>`;
      });
      html += `<div class="econ-row green"><span>MRR Potential</span><span class="econ-val">$${p.mrr_potential}/mo</span></div>`;
    }

    if (p.line_items) {
      p.line_items.forEach(li => {
        html += `<div class="econ-row"><span>${li.description}</span><span class="econ-val">R${Number(li.total_zar).toLocaleString()}</span></div>`;
      });
      html += `<div class="econ-row"><span>Subtotal</span><span class="econ-val">R${Number(p.subtotal_zar).toLocaleString()}</span></div>`;
      html += `<div class="econ-row"><span>VAT (${p.vat_rate})</span><span class="econ-val">R${Number(p.vat_zar).toLocaleString()}</span></div>`;
      html += `<div class="econ-row green"><span>TOTAL</span><span class="econ-val">R${Number(p.total_zar).toLocaleString()}</span></div>`;
    }

    if (p.stats) {
      html += `<div class="econ-row"><span>Leads Captured</span><span class="econ-val">${p.stats.leads}</span></div>`;
      html += `<div class="econ-row"><span>Clicks Tracked</span><span class="econ-val">${p.stats.clicks}</span></div>`;
      html += `<div class="econ-row"><span>Base URL</span><span class="econ-val econ-url">${p.base_url||''}</span></div>`;
    }

    if (p.flows) {
      p.flows.forEach(f => {
        html += `<div class="econ-row"><span>▸ ${f}</span></div>`;
      });
      if (p.mechanism) html += `<div class="econ-sub">${p.mechanism}</div>`;
    }

    html += `<div class="econ-sub">📁 ${p.location}</div>`;
    html += `</div></div>`;
  });

  panel.innerHTML = html;
}

function togglePlatform(id) {
  const el = document.getElementById('econ-' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function renderEconomicsOverlay() {
  // Updates the p5 overlay with real economics data (called after data loads)
  if (economicsData) {
    const t = economicsData.totals;
    document.getElementById('econ-hud').textContent =
      `SaaS $${t.usd_monthly}/mo | Invoice R${Number(t.zar_invoice).toLocaleString()} | ${(economicsData.platforms||[]).length} platforms`;
  }
}

/*****************************************************************************
  REALTIME SYNC + MONITOR POLL
*****************************************************************************/
setInterval(() => { loadTopology(); }, 30000);
setInterval(() => { loadEconomics(); }, 60000);

// ── DETAIL POPUP CARD ──
let detailCache = {};

function closeDetail() {
  document.getElementById('detail-card').style.display = 'none';
  document.getElementById('detail-backdrop').style.display = 'none';
}

function showDetailCard(title, html) {
  document.getElementById('detail-title').textContent = title;
  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail-card').style.display = 'block';
  document.getElementById('detail-backdrop').style.display = 'block';
}

function row(label, val, color) {
  return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #0ff1;"><span style="color:#556">' + label + '</span><span style="color:' + (color||'#0f9') + '">' + val + '</span></div>';
}

async function showDetail(type) {
  const R = '#f44', G = '#0f9', C = '#0ff', Y = '#fc0';

  if (type === 'gateway') {
    try {
      const t0 = performance.now();
      const r = await fetch(BASE + '/health');
      const ms = Math.floor(performance.now() - t0);
      const d = await r.json();
      showDetailCard('GATEWAY HEALTH', row('Status', d.status, d.status==='OK'?G:R) + row('Response Time', ms+'ms', ms<500?G:Y) + row('Core', d.core||'serverless', C) + row('Gateway', d.gateway||'up', G) + row('Timestamp', new Date(d.ts).toLocaleString(), C) + row('Environment', 'Vercel Serverless', C) + row('Protocol', 'HTTPS/2', C) + row('Region', 'iad1 (US-East)', C));
    } catch(e) { showDetailCard('GATEWAY', row('Error', e.message, R)); }
  }

  else if (type === 'api') {
    try {
      const t0 = performance.now();
      const r = await fetch(BASE + '/api/status');
      const ms = Math.floor(performance.now() - t0);
      const d = await r.json();
      let html = row('Overall', d.overall||'serverless', G) + row('Response Time', ms+'ms', ms<500?G:Y);
      (d.services||[]).forEach(s => {
        html += row(s.id.toUpperCase(), s.status.toUpperCase() + (s.latency_ms>=0?' ('+s.latency_ms+'ms)':''), s.status==='up'?G:R);
      });
      html += row('Timestamp', new Date(d.ts).toLocaleString(), C);
      showDetailCard('API STATUS', html);
    } catch(e) { showDetailCard('API', row('Error', e.message, R)); }
  }

  else if (type === 'agents') {
    try {
      const r = await fetch(BASE + '/api/agents');
      const d = await r.json();
      let html = row('Total Agents', d.count||0, C);
      const layers = d.layers || {};
      Object.entries(layers).forEach(([k,v]) => {
        html += row(k + ' Status', v.status||'--', v.status==='up'?G:Y) + row(k + ' Count', v.count||0, C);
      });
      html += '<div style="margin-top:8px;border-top:1px solid #0ff2;padding-top:6px;font-size:8px;letter-spacing:1px;color:#0ff;margin-bottom:4px;">AGENT LIST</div>';
      (d.agents||[]).forEach(a => {
        html += row(a.name||a.id, (a.status||'active').toUpperCase() + (a.layer?' ['+a.layer+']':''), a.status==='active'?G:Y);
      });
      showDetailCard('AGENT SWARM', html);
    } catch(e) { showDetailCard('AGENTS', row('Error', e.message, R)); }
  }

  else if (type === 'treasury') {
    try {
      const r = await fetch(BASE + '/api/treasury/summary');
      const d = await r.json();
      let html = row('Balance', '$'+Number(d.balance).toLocaleString(undefined,{minimumFractionDigits:2}), G)
        + row('Currency', d.currency||'USD', C)
        + row('Revenue MTD', '$'+Number(d.revenue_mtd).toLocaleString(), G)
        + row('Costs MTD', '$'+Number(d.costs_mtd).toLocaleString(), R)
        + row('Net MTD', '$'+Number(d.net_mtd).toLocaleString(), d.net_mtd>=0?G:R)
        + row('Subscriptions', d.subscriptions||0, C);
      html += '<div style="margin-top:8px;border-top:1px solid #0ff2;padding-top:6px;font-size:8px;letter-spacing:1px;color:#0ff;margin-bottom:4px;">PLANS</div>';
      (d.plans||[]).forEach(p => {
        html += row(p.name + ' ($'+p.price+'/mo)', p.count+' subs — $'+Number(p.revenue).toLocaleString(), C);
      });
      showDetailCard('TREASURY', html);
    } catch(e) { showDetailCard('TREASURY', row('Error', e.message, R)); }
  }

  else if (type === 'overall') {
    try {
      const [h, s, a, t] = await Promise.all([
        fetch(BASE+'/health').then(r=>({ok:r.ok,ms:0})).catch(()=>({ok:false})),
        fetch(BASE+'/api/status').then(r=>r.json()).catch(()=>({})),
        fetch(BASE+'/api/agents').then(r=>r.json()).catch(()=>({})),
        fetch(BASE+'/api/treasury/summary').then(r=>r.json()).catch(()=>({})),
      ]);
      const allUp = h.ok && (s.services||[]).every(sv=>sv.status==='up'||sv.status==='remote');
      let html = row('System Status', allUp?'ALL SYSTEMS OPERATIONAL':'DEGRADED', allUp?G:R)
        + row('Gateway', h.ok?'ONLINE':'OFFLINE', h.ok?G:R)
        + row('Services', (s.services||[]).length+' monitored', C)
        + row('Agents', (a.count||0)+' active', C)
        + row('Treasury', '$'+Number(t.balance||0).toLocaleString(undefined,{minimumFractionDigits:2}), G)
        + row('Subscriptions', t.subscriptions||0, C)
        + row('Net Revenue', '$'+Number(t.net_mtd||0).toLocaleString(), t.net_mtd>=0?G:R)
        + row('Mode', 'Serverless (Vercel)', C)
        + row('Last Check', new Date().toLocaleString(), C);
      showDetailCard('SYSTEM OVERVIEW', html);
    } catch(e) { showDetailCard('OVERALL', row('Error', e.message, R)); }
  }

  else if (type === 'cpu' || type === 'mem' || type === 'uptime' || type === 'load') {
    try {
      const r = await fetch(BASE + '/api/registry/kernel');
      const j = await r.json();
      const d = j.data || j;
      const totalMem = d.total_memory_bytes||0;
      const freeMem = d.free_memory_bytes||0;
      const usedMB = Math.floor((totalMem-freeMem)/1048576);
      const totalMB = Math.floor(totalMem/1048576);
      const memPct = totalMem>0?Math.round((1-freeMem/totalMem)*100):0;
      const load = d.loadavg||[0,0,0];
      const upSec = d.uptime_seconds||0;

      let html = '<div style="margin-bottom:8px;font-size:8px;letter-spacing:1px;color:#0ff;">KERNEL INFO</div>'
        + row('OS', d.os_type+' '+d.os_release, C)
        + row('Platform', d.os_platform+' / '+d.os_arch, C)
        + row('Hostname', d.hostname||'--', C)
        + row('CPU Model', d.cpu_model||'--', C)
        + row('CPU Cores', d.cpu_cores||0, C)
        + row('CPU Speed', (d.cpu_speed_mhz||0)+' MHz', C)
        + '<div style="margin:8px 0 4px;border-top:1px solid #0ff2;padding-top:6px;font-size:8px;letter-spacing:1px;color:#0ff;">MEMORY</div>'
        + row('Total', totalMB+'MB ('+((totalMem/1073741824).toFixed(1))+'GB)', C)
        + row('Used', usedMB+'MB', Y)
        + row('Free', Math.floor(freeMem/1048576)+'MB', G)
        + row('Usage', memPct+'%', memPct>80?R:memPct>50?Y:G)
        + '<div style="margin:8px 0 4px;border-top:1px solid #0ff2;padding-top:6px;font-size:8px;letter-spacing:1px;color:#0ff;">LOAD</div>'
        + row('1 min', load[0].toFixed(2), load[0]>1?R:G)
        + row('5 min', load[1].toFixed(2), load[1]>1?R:G)
        + row('15 min', load[2].toFixed(2), load[2]>1?R:G)
        + '<div style="margin:8px 0 4px;border-top:1px solid #0ff2;padding-top:6px;font-size:8px;letter-spacing:1px;color:#0ff;">UPTIME</div>'
        + row('Seconds', Math.floor(upSec), C)
        + row('Formatted', Math.floor(upSec/86400)+'d '+Math.floor((upSec%86400)/3600)+'h '+Math.floor((upSec%3600)/60)+'m', G);
      showDetailCard('SYSTEM DETAILS — ' + type.toUpperCase(), html);
    } catch(e) { showDetailCard('SYSTEM', row('Error', e.message, '#f44')); }
  }
}

// ── HEALTH CHECK PANEL ──
async function pollHealth() {
  const checks = [
    { id: 'hp-gateway', url: BASE + '/health', label: 'GATEWAY' },
    { id: 'hp-api', url: BASE + '/api/status', label: 'API' },
    { id: 'hp-agents', url: BASE + '/api/agents', label: 'AGENTS' },
    { id: 'hp-treasury', url: BASE + '/api/treasury/summary', label: 'TREASURY' },
  ];
  let allOk = true;
  for (const c of checks) {
    const el = document.getElementById(c.id);
    try {
      const t0 = performance.now();
      const r = await fetch(c.url, { signal: AbortSignal.timeout(5000) });
      const ms = Math.floor(performance.now() - t0);
      if (r.ok) {
        el.textContent = 'OK ' + ms + 'ms';
        el.style.color = '#0f9';
      } else {
        el.textContent = 'ERR ' + r.status;
        el.style.color = '#f44';
        allOk = false;
      }
    } catch (e) {
      el.textContent = 'DOWN';
      el.style.color = '#f44';
      allOk = false;
    }
  }
  const ov = document.getElementById('hp-overall');
  ov.textContent = allOk ? 'ALL SYSTEMS GO' : 'DEGRADED';
  ov.style.color = allOk ? '#0f9' : '#f44';
}
pollHealth();
setInterval(pollHealth, 15000);

// System monitor: use WebSocket if available, else poll API
if (IS_SERVERLESS) {
  async function pollSysMonitor() {
    try {
      const r = await fetch(BASE + '/api/registry/kernel');
      const j = await r.json();
      const d = j.data || j;
      const totalMem = d.total_memory_bytes || 0;
      const freeMem = d.free_memory_bytes || 0;
      const usedMB = Math.floor((totalMem - freeMem) / 1048576);
      const memPct = totalMem > 0 ? Math.round((1 - freeMem / totalMem) * 100) : 0;
      document.getElementById('mon-cpu').textContent = d.memory_usage_pct ? d.loadavg[0].toFixed(2) : (d.cpu_cores || 0) + ' cores';
      document.getElementById('mon-mem').textContent = usedMB + 'MB (' + memPct + '%)';
      const upSec = d.uptime_seconds || 0;
      const upH = Math.floor(upSec / 3600);
      const upM = Math.floor((upSec % 3600) / 60);
      document.getElementById('mon-up').textContent = upH + 'h ' + upM + 'm';
      const load = d.loadavg || [0, 0, 0];
      document.getElementById('mon-load').textContent = load.map(v => v.toFixed(2)).join(' ');
    } catch (e) {}
  }
  pollSysMonitor();
  setInterval(pollSysMonitor, 10000);
} else {
  setInterval(() => { wsSend({ type:'monitor' }); }, 5000);
}

/*****************************************************************************
  BOOT
*****************************************************************************/
// Check for valid token before connecting
function getAuthToken() {
  return localStorage.getItem('bridge_terminal_token') || sessionStorage.getItem('bridge_terminal_token') || null;
}

function saveAuthToken(token) {
  localStorage.setItem('bridge_terminal_token', token);
}

wsConnect();
// Authenticate with JWT token (required)
setTimeout(() => { 
  const token = getAuthToken();
  if (token) {
    wsSend({ type:'auth', token });
  } else {
    // Prompt for token if not available
    const tokenInput = prompt('Enter terminal access token:');
    if (tokenInput) {
      saveAuthToken(tokenInput);
      wsSend({ type:'auth', token: tokenInput });
    } else {
      document.getElementById('ws-status').textContent = 'WS: auth required';
      document.getElementById('ws-status').style.color = '#f44';
    }
  }
}, 400);
// Auto-start 2 terminals (only if authenticated)
setTimeout(() => { 
  if (getAuthToken()) {
    createTerminal(); createTerminal(); 
  }
}, 700);
// Load economics data
setTimeout(() => { loadEconomics(); }, 1000);
