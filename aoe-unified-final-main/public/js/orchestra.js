/* ──────────────────────────────────────────────────────────
   ORCHESTRA — data wiring
   - Reads /admin/overview (real PM2 stats)  and /api/status (per-service port/latency)
   - Shows offline banner when upstream unreachable (no synthetic data)
   - Derives "Protocol Feed" events from real state diffs
   ────────────────────────────────────────────────────────── */
const API = {
  overview: '/admin/overview',
  status:   '/api/status',
  // Cross-origin fallback only fires when same-origin returns non-OK. Requires go.ai-os.co.za
  // to set Access-Control-Allow-Origin for bridge-ai-os.com, otherwise the fetch is a no-op.
  absOverview: 'https://go.ai-os.co.za/admin/overview',
  absStatus:   'https://go.ai-os.co.za/api/status',
};

// Escape untrusted strings before they enter innerHTML or HTML attributes. Service names,
// statuses and feed text come from the PM2 admin API and must not be interpolated raw.
function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Categorize a PM2 service name into one of the 4 buckets visible on screen.
function categorize(name){
  const n = name.toLowerCase();
  if (/(brain|logic|god|gateway|auth|consensus|treasury|admin|api|govern)/.test(n)) return 'logic';
  if (/(engine|worker|runner|ban|svg|ainode|compute|gpu|server|unified|rotate|pm2)/.test(n)) return 'compute';
  if (/(proxy|stream|vector|data|archive|synth|embed|search|terminal|ws|socket|pipe)/.test(n)) return 'synth';
  return 'compute';
}

// Short human description shown on each service card. Keyed by PM2 name; falls back
// to a generic line for services not in the map. Descriptions are static copy, not metrics.
function describe(s){
  const map = {
    'super-brain':        'Top-level reasoning kernel. Recursive planner + tool router for the stack.',
    'auth-service':       'Identity + session issuance. Gatekeeps A2A and H2A handshakes.',
    'god-mode-system':    'Elevated-privilege control surface for stack-wide operators.',
    'terminal-proxy':     'Streams shell I/O over WS. Bridges agent → human terminal.',
    'ban-engine':         'Bridge Task Runner. OSINT + automation execution.',
    'svg-engine':         'Vector synthesis engine. Generates visual artefacts on demand.',
    'core-gateway':       'Unified edge router. All inbound traffic lands here first.',
    'system':             'System dashboard API. Fleet health and aggregate telemetry.',
    'live-system':        'Live-state broadcaster. Pushes realtime metrics to subscribers.',
    'pm2-logrotate':      'Log-rotation worker. Keeps the fleet\'s tape clean.',
    'bridge-gateway':     'Legacy gateway. Bridges older routes into the unified plane.',
    'admin-api':          'Control-plane API. Backs the operator console and overview feed.',
    'treasury':           'On-chain economy ledger. Settlement for Φ-denominated exchanges.',
    'unified-server':     'Unified stack entrypoint. Serves /engine, /loop, /master, /docs.',
  };
  return map[s.name] || 'Fleet node · PM2-managed service.';
}

function fmtMem(mb){ return mb >= 1024 ? (mb/1024).toFixed(2)+' GB' : Math.round(mb)+' MB'; }
function fmtPct(v){ return (Math.round(v*10)/10) + '%'; }
function fmtK(n){ if (n>=1e9) return (n/1e9).toFixed(2)+'B'; if (n>=1e6) return (n/1e6).toFixed(2)+'M'; if (n>=1e3) return (n/1e3).toFixed(1)+'k'; return String(n); }
function nowClock(){ const d=new Date(); return d.toTimeString().slice(0,8); }

// Fetch helper with timeout + dual-origin fallback (relative first, then absolute).
async function j(rel, abs){
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), 6000);
  try{
    const r = await fetch(rel, {signal: controller.signal, cache:'no-store'});
    if (r.ok) return await r.json();
  }catch{}
  finally{ clearTimeout(t); }
  try{
    const r2 = await fetch(abs, {cache:'no-store'});
    if (r2.ok) return await r2.json();
  }catch{}
  return null;
}

// ── state ──────────────────────────────────────────
const state = {
  services: [],     // latest /admin/overview services[]
  status:   [],     // latest /api/status services[]
  overview: null,
  prev:     new Map(),
  events:   [],
  cat: 'all',
  q: '',
  offline: false,
};

// ── render: cards (in-place, no DOM wipe) ─────────
function cardMetrics(s){
  const cat = categorize(s.name);
  const online = s.status==='online';
  const stClass = online ? (s.restarts>5?'warn':'online') : 'down';
  const stText  = online ? (s.restarts>5?'Unstable':'Active') : (s.status||'Offline');
  const portRow = (state.status||[]).find(x => s.name.toLowerCase().includes(x.id));
  const latMs = portRow ? portRow.latency_ms : null;
  const tflops = Math.max(1, Math.round(s.cpu * 140) / 10);
  const tokenCost = ((s.mem_mb * 0.00001) + 0.0001).toFixed(4);
  const rel = online ? (Math.max(90, 100 - s.restarts*1.5)).toFixed(2) : '0.00';
  const tier = s.mem_mb > 120 ? 'HEAVY' : (s.restarts===0 ? 'v4' : 'LIGHT');
  const icon = cat==='logic' ? 'psychology' : cat==='synth' ? 'dataset' : 'memory';
  return { cat, stClass, stText, latMs, tflops, tokenCost, rel, tier, icon };
}
function buildCard(s){
  const m = cardMetrics(s);
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.name = s.name;
  el.innerHTML = `
    <div class="statusRow">
      <span class="status ${esc(m.stClass)}" data-f="status"><span class="d"></span><span data-f="stText">${esc(m.stText)}</span></span>
      <span class="cat">${esc(m.cat.toUpperCase())}</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:10px">
      <span class="icon" style="color:var(--accent);font-size:22px">${esc(m.icon)}</span>
      <div class="name">${esc(s.name.toUpperCase())} <span style="color:var(--dim);font-size:11px;letter-spacing:2px" data-f="tier">· ${esc(m.tier)}</span></div>
    </div>
    <div class="desc">${esc(describe(s))}</div>
    <div class="metrics">
      <div class="metric"><span class="k">Latency</span><span class="v" data-f="lat">${m.latMs==null?'—':m.latMs+'ms'}</span></div>
      <div class="metric"><span class="k">Reliability</span><span class="v" data-f="rel">${m.rel}%</span></div>
      <div class="metric" title="~ estimated: mem_mb × 0.00001 + 0.0001"><span class="k">Token Cost</span><span class="v" data-f="tok">~${m.tokenCost}Φ</span></div>
      <div class="metric" title="~ estimated: cpu% × 14"><span class="k">Throughput</span><span class="v" data-f="tf">~${m.tflops} TF</span></div>
      <div class="metric"><span class="k">CPU</span><span class="v dim" data-f="cpu">${fmtPct(s.cpu||0)}</span></div>
      <div class="metric"><span class="k">Memory</span><span class="v dim" data-f="mem">${fmtMem(s.mem_mb||0)}</span></div>
    </div>
    <div class="cta">
      <a class="link" href="#" data-handshake="${esc(s.name)}">INITIATE HANDSHAKE <span class="icon">arrow_forward</span></a>
      <span class="restarts">restarts <b data-f="restarts">${s.restarts|0}</b> · pid <span data-f="pid">${esc(s.pid||'—')}</span></span>
    </div>`;
  return el;
}
function updateCard(el, s){
  const m = cardMetrics(s);
  const set = (f, v) => { const t = el.querySelector(`[data-f="${f}"]`); if (t && t.textContent !== v) t.textContent = v; };
  const stEl = el.querySelector('[data-f="status"]');
  if (stEl){ const want = `status ${m.stClass}`; if (stEl.className !== want) stEl.className = want; }
  set('stText', m.stText);
  set('tier',   '· ' + m.tier);
  set('lat',    m.latMs==null ? '—' : m.latMs+'ms');
  set('rel',    m.rel + '%');
  set('tok',    m.tokenCost + 'Φ');
  set('tf',     m.tflops + ' TF');
  set('cpu',    fmtPct(s.cpu||0));
  set('mem',    fmtMem(s.mem_mb||0));
  set('restarts', String(s.restarts));
  set('pid',    String(s.pid||'—'));
}
// ── render: animated SVG topology ─────────────────
// Lay nodes out on concentric rings around a central hub. Ring assignment is deterministic
// (category-driven) so the same service lands in the same spot across ticks — no flicker.
const TOPO = { cx:400, cy:225, rings:[140, 190, 240] };
function topoPos(i, total, ring){
  // Distribute this ring's members evenly; add a small phase offset per ring so rings don't align.
  const angle = (i/total) * Math.PI*2 + (ring*0.37);
  return { x: TOPO.cx + Math.cos(angle)*TOPO.rings[ring], y: TOPO.cy + Math.sin(angle)*TOPO.rings[ring] };
}
function nodeTone(s){
  if (s.status !== 'online') return 'of';
  if ((s.restarts||0) > 5 || (s.cpu||0) > 70) return 'wa';
  return 'on';
}
// Packet factory: creates a small circle that animates along an edge using <animateMotion>.
// Keyed by service name + phase so re-renders can reuse the same element (no flicker/restart).
// A packet is only emitted for ONLINE and WARN edges; offline edges stay dark with no flow.
function ensurePacket(packetsG, name, tone, fromX, fromY, toX, toY){
  const key = `pkt-${name}`;
  let pkt = packetsG.querySelector(`[data-name="${CSS.escape(name)}"]`);
  if (!pkt){
    pkt = document.createElementNS('http://www.w3.org/2000/svg','circle');
    pkt.setAttribute('r','2.6');
    pkt.dataset.name = name;
    const am = document.createElementNS('http://www.w3.org/2000/svg','animateMotion');
    am.setAttribute('dur','2.6s');
    am.setAttribute('repeatCount','indefinite');
    am.setAttribute('rotate','auto');
    // Deterministic phase per service so packets don't all strobe in lockstep
    const hash = [...name].reduce((a,c)=>a + c.charCodeAt(0), 0);
    am.setAttribute('begin', `-${(hash % 26) * 0.1}s`);
    pkt.appendChild(am);
    packetsG.appendChild(pkt);
  }
  pkt.setAttribute('class', `packet ${tone}`);
  const am = pkt.querySelector('animateMotion');
  // Travel slightly past endpoint so the packet appears to "arrive" at the node
  am.setAttribute('path', `M ${fromX} ${fromY} L ${toX} ${toY}`);
  // Throttle the flow on warn edges so operators can read the difference
  am.setAttribute('dur', tone==='wa' ? '3.4s' : '2.6s');
  pkt.style.display = '';
  return pkt;
}
function renderTopology(){
  const nodesG = document.getElementById('topoNodes');
  const edgesG = document.getElementById('topoEdges');
  const pktG   = document.getElementById('topoPackets');
  if (!nodesG || !edgesG) return;
  const services = state.services.slice();
  // Bucket by category → ring (logic=inner, compute=mid, synth=outer). Keeps visual grouping legible.
  const byRing = [[],[],[]];
  for (const s of services){
    const cat = categorize(s.name);
    const ring = cat==='logic' ? 0 : cat==='compute' ? 1 : 2;
    byRing[ring].push(s);
  }
  const active = state._selected;
  // Re-use existing node groups keyed by service name to avoid flicker
  const existing = new Map(Array.from(nodesG.querySelectorAll('.nodeG')).map(g => [g.dataset.name, g]));
  const existingE = new Map(Array.from(edgesG.querySelectorAll('.edge')).map(p => [p.dataset.name, p]));
  const existingP = pktG ? new Map(Array.from(pktG.querySelectorAll('[data-name]')).map(p => [p.dataset.name, p])) : new Map();
  const wanted = new Set();
  byRing.forEach((list, ringIdx) => {
    list.forEach((s, i) => {
      const p = topoPos(i, Math.max(list.length, 1), ringIdx);
      const tone = nodeTone(s);
      wanted.add(s.name);
      // Edge
      let edge = existingE.get(s.name);
      if (!edge){
        edge = document.createElementNS('http://www.w3.org/2000/svg','path');
        edge.setAttribute('class', `edge ${tone}`);
        edge.dataset.name = s.name;
        edgesG.appendChild(edge);
      } else {
        edge.setAttribute('class', `edge ${tone}${edge.classList.contains('hot')?' hot':''}`);
      }
      edge.setAttribute('d', `M ${TOPO.cx} ${TOPO.cy} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      edge.setAttribute('stroke', tone==='on' ? 'url(#edgeOn)' : (tone==='wa' ? '#ffb347' : '#ff4d6d'));

      // Emit a flow packet along live edges; drop packet for offline nodes.
      if (pktG && tone !== 'of'){
        ensurePacket(pktG, s.name, tone, TOPO.cx, TOPO.cy, p.x, p.y);
        existingP.delete(s.name);
      }

      // Node group
      let g = existing.get(s.name);
      if (!g){
        g = document.createElementNS('http://www.w3.org/2000/svg','g');
        g.setAttribute('class','nodeG');
        g.dataset.name = s.name;
        const hit = document.createElementNS('http://www.w3.org/2000/svg','circle');
        hit.setAttribute('r','22'); hit.setAttribute('fill','transparent'); hit.setAttribute('pointer-events','all');
        const ringEl = document.createElementNS('http://www.w3.org/2000/svg','circle');
        ringEl.setAttribute('class','ring'); ringEl.setAttribute('r','14');
        const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
        dot.setAttribute('class','dot'); dot.setAttribute('r','6');
        const pulse = document.createElementNS('http://www.w3.org/2000/svg','circle');
        pulse.setAttribute('class','pulse'); pulse.setAttribute('fill','none'); pulse.setAttribute('stroke-width','1.2');
        const label = document.createElementNS('http://www.w3.org/2000/svg','text');
        label.setAttribute('dy','28');
        g.appendChild(hit); g.appendChild(ringEl); g.appendChild(dot); g.appendChild(pulse); g.appendChild(label);
        g.addEventListener('click', () => selectNode(s.name));
        nodesG.appendChild(g);
      }
      g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      g.classList.toggle('active', s.name===active);
      const color = tone==='on' ? '#00ff9c' : tone==='wa' ? '#ffb347' : '#ff4d6d';
      g.querySelector('.dot').setAttribute('fill', color);
      g.querySelector('.pulse').setAttribute('stroke', color);
      g.querySelector('.pulse').setAttribute('class', `pulse ${tone}`);
      const short = s.name.length > 14 ? s.name.slice(0,12)+'…' : s.name;
      const label = g.querySelector('text');
      if (label.textContent !== short) label.textContent = short;
    });
  });
  // Drop any nodes/edges/packets no longer in the fleet (or now offline)
  for (const [name, g] of existing) if (!wanted.has(name)) g.remove();
  for (const [name, p] of existingE) if (!wanted.has(name)) p.remove();
  for (const [, p] of existingP) p.remove();
}
function selectNode(name){
  state._selected = (state._selected===name) ? null : name;
  const sel = document.getElementById('topoSel');
  if (state._selected){
    const s = state.services.find(x => x.name===name);
    sel.innerHTML = `<b>${esc(name)}</b> · ${esc(s?.status||'?')} · cpu ${fmtPct(s?.cpu||0)} · ${fmtMem(s?.mem_mb||0)}`;
    // Scroll card into view for deeper inspection
    document.querySelector(`.card[data-name="${CSS.escape(name)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
  } else {
    sel.textContent = 'click a node';
  }
  renderTopology();
}
// Briefly highlight one edge (e.g. on restart/CPU spike) so operators see activity pulse through the graph.
function flashEdge(name){
  const p = document.querySelector(`#topoEdges .edge[data-name="${CSS.escape(name)}"]`);
  if (!p) return;
  p.classList.add('hot');
  setTimeout(()=>p.classList.remove('hot'), 1800);
}

function render(){
  const grid = document.getElementById('grid');
  const q = state.q.trim().toLowerCase();
  const items = state.services
    .filter(s => state.cat==='all' || categorize(s.name)===state.cat)
    .filter(s => !q || s.name.toLowerCase().includes(q));

  // Toggle visibility of existing cards; build any missing.
  const existing = new Map(Array.from(grid.querySelectorAll('.card')).map(c => [c.dataset.name, c]));
  const wanted = new Set(items.map(s => s.name));

  for (const s of items){
    let el = existing.get(s.name);
    if (!el){ el = buildCard(s); grid.appendChild(el); }
    else { updateCard(el, s); }
    el.style.display = '';
    existing.delete(s.name);
  }
  // Hide (don't delete) cards that are filtered out — preserves hover state when toggling tabs back
  for (const [name, el] of existing){
    if (state.services.find(x => x.name===name)) el.style.display = 'none';
    else el.remove();
  }

  // Empty state
  let empty = grid.querySelector('.empty-state');
  if (!items.length){
    if (!empty){
      empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.style.cssText = 'color:var(--dim);padding:20px;grid-column:1/-1';
      empty.textContent = 'No agents match this filter.';
      grid.appendChild(empty);
    }
  } else if (empty){ empty.remove(); }
}

// ── render: feed ──────────────────────────────────
function renderFeed(){
  const el = document.getElementById('events');
  el.innerHTML = state.events.slice(0, 30).map(ev => `
    <div class="ev ${esc(ev.tone||'')}">
      <div class="t">${esc(ev.t)}</div>
      <div class="b"><span class="k">${esc(ev.head)}</span><div class="d">${esc(ev.body)}</div></div>
    </div>`).join('') || `<div style="color:var(--dim);padding:20px">Waiting for fleet activity…</div>`;
}

// ── render: bottom stats ──────────────────────────
function renderStats(){
  const o = state.overview;
  const up = o?.services_up ?? state.services.filter(s=>s.status==='online').length;
  const total = o?.services_total ?? state.services.length;
  const cpu = o?.cpu_avg ?? 0;
  const mem = o?.mem_avg ?? 0;
  const totalCpu = state.services.reduce((a,s)=>a+(s.cpu||0),0);
  const totalMem = state.services.reduce((a,s)=>a+(s.mem_mb||0),0);

  document.getElementById('sNodes').innerHTML = `${up}<span style="color:var(--dim)">/${total}</span>`;
  document.getElementById('sFlops').textContent = fmtK(Math.round(totalCpu*140)) + ' TF';
  document.getElementById('sLiq').textContent   = (totalMem/1024).toFixed(2) + ' GB·mem';
  document.getElementById('sLat').textContent   = (o?.latency_p95_ms ?? 0) + ' ms';
  document.getElementById('sDealers').textContent = up;

  // top bar network state
  const dot = document.getElementById('netDot');
  const lbl = document.getElementById('netLabel');
  if (state.offline){ dot.className='dot err'; lbl.textContent='Network: Offline'; }
  else if (up < total){ dot.className='dot warn'; lbl.textContent=`Network: Degraded (${up}/${total})`; }
  else { dot.className='dot'; lbl.textContent='Network: Optimal'; }

  if (o?.git_commit){
    document.getElementById('proto').textContent = `Protocol v4.2 · commit ${o.git_commit.slice(0,7)}`;
  }
}

// ── event derivation (emits only on real state diffs) ──────
// Guard against the "heartbeat ← undefined" class of bug: coerce every field
// so the feed never renders the literal string "undefined".
function pushEvent(head, body, tone){
  const H = (head==null||head==='') ? 'event' : String(head);
  const B = (body==null) ? '' : String(body);
  state.events.unshift({ t: nowClock(), head:H, body:B, tone: tone||'' });
  if (state.events.length > 80) state.events.length = 80;
  renderFeed();
}

function diffAndEmit(next){
  for (const s of next){
    const prev = state.prev.get(s.name);
    if (!prev){
      if (state.prev.size) pushEvent('Node joined', `${s.name} · status=${s.status}`);
    } else {
      if (prev.status !== s.status){
        const tone = s.status==='online' ? '' : 'err';
        pushEvent(`${s.name} → ${s.status}`, `transition from ${prev.status}`, tone);
        flashEdge(s.name);
      }
      if ((s.restarts||0) > (prev.restarts||0)){
        pushEvent(`${s.name} restarted`, `restart count ${prev.restarts} → ${s.restarts}`, 'warn');
        flashEdge(s.name);
      }
      if (Math.abs((s.cpu||0) - (prev.cpu||0)) > 10){
        pushEvent(`${s.name} CPU spike`, `${fmtPct(prev.cpu||0)} → ${fmtPct(s.cpu||0)}`, 'warn');
        flashEdge(s.name);
      }
    }
    state.prev.set(s.name, { status:s.status, restarts:s.restarts||0, cpu:s.cpu||0 });
  }
}

// ── tick ──────────────────────────────────────────
async function tick(){
  const overview = await j(API.overview, API.absOverview);
  const status   = await j(API.status,   API.absStatus);
  const banner = document.getElementById('banner');

  if (!overview){
    state.offline = true;
    banner.style.display = 'flex';
    banner.className = 'banner warn';
    if (!state.services.length){
      banner.innerHTML = `<span class="icon">cloud_off</span>
        Live backend unreachable — <code>/admin/overview</code> returned no data.
        Ensure this page is served from
        <a href="https://bridge-ai-os.com" target="_blank" rel="noopener noreferrer">bridge-ai-os.com</a>
        or proxied via <code>node orchestra-proxy.js</code>. No synthetic data will be shown.`;
    } else {
      // Transient failure after healthy start — keep last-known real state visible, surface stall.
      banner.innerHTML = `<span class="icon">cloud_off</span>
        Last poll failed — showing last-known real data from previous tick.`;
    }
  } else {
    state.overview = overview;
    diffAndEmit(overview.services || []);
    state.services = overview.services || [];
    state.status = (status && status.services) || [];
    state.offline = false;
    banner.style.display = 'none';
  }
  render(); renderStats(); renderTopology();
}

// ── wiring ────────────────────────────────────────
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  b.classList.add('active'); state.cat = b.dataset.cat; render();
});
document.getElementById('search').addEventListener('input', e => { state.q = e.target.value; render(); });
document.addEventListener('click', e => {
  const a = e.target.closest('[data-handshake]');
  if (a){ e.preventDefault();
    const name = a.dataset.handshake;
    pushEvent(`Handshake → ${name}`, `A2A channel opened from operator console`);
  }
});
document.getElementById('btnDeploy').addEventListener('click', ()=>{
  pushEvent('Deploy Node', 'operator requested node deployment — awaiting target');
});
document.getElementById('btnSettings').addEventListener('click', ()=>{
  pushEvent('Settings opened', 'operator console → preferences');
});
// Rail nav with anchor validation. Hard-stops on missing target so broken links
// surface in the feed instead of silently no-op-ing.
document.querySelectorAll('.rail .r[data-href]').forEach(r=>{
  r.addEventListener('click', ()=>{
    const href = r.dataset.href;
    if (href && href.startsWith('#')){
      // CSS.escape guards against IDs with special characters
      const sel = '#' + CSS.escape(href.slice(1));
      const target = document.querySelector(sel);
      if (!target){
        pushEvent('Navigation error', `missing anchor target ${href}`);
        return; // do NOT mark active — leave focus on currently active button
      }
      target.scrollIntoView({behavior:'smooth',block:'start'});
    } else if (href === '.'){
      document.querySelector('.main')?.scrollTo({top:0,behavior:'smooth'});
    }
    document.querySelectorAll('.rail .r').forEach(x=>x.classList.remove('active'));
    r.classList.add('active');
  });
});

// Keyboard-nav for SVG nodes: Enter or Space triggers the existing click handler.
// Applied in a mutation observer because nodes are injected dynamically by renderTopo().
(function wireNodeKeyboard(){
  const container = document.getElementById('topoNodes');
  if (!container) return;
  const enhance = g => {
    if (g.dataset.a11yWired) return;
    g.dataset.a11yWired = '1';
    g.setAttribute('tabindex','0');
    g.setAttribute('role','button');
    const name = g.dataset.name || 'node';
    g.setAttribute('aria-label', `agent node ${name}`);
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        g.dispatchEvent(new MouseEvent('click', {bubbles:true}));
      }
    });
  };
  new MutationObserver(() => {
    container.querySelectorAll('.nodeG').forEach(enhance);
  }).observe(container, {childList:true, subtree:false});
  // Enhance any nodes already present on first paint
  container.querySelectorAll('.nodeG').forEach(enhance);
})();

// seed feed with real boot lines (live diff events take over on first successful tick)
state.events = [
  { t:nowClock(), head:'Orchestra booted',     body:'Protocol v4.2 · operator terminal ready' },
  { t:nowClock(), head:'Binding /admin/overview', body:'Discovering fleet…' },
];
renderFeed();

tick();
setInterval(tick, 5000);
