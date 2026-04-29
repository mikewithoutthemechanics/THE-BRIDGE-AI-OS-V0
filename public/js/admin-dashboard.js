const API = window.location.origin;

// ── auth bridge ────────────────────────────────
// Zero client-side token handling. The browser ships the bridge_admin_session
// cookie automatically (HttpOnly, SameSite=Strict) when credentials:'include'.
// For state-changing requests we mirror the bridge_csrf cookie into an
// X-CSRF-Token header — the double-submit pattern gates cross-site forgery.
function readCookie(name){
  const parts = document.cookie.split(';');
  for (const p of parts){
    const [k, ...v] = p.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}
function apiFetch(path, opts){
  opts = opts || {};
  opts.credentials = 'include';
  opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD'){
    const csrf = readCookie('bridge_csrf');
    if (csrf) opts.headers['X-CSRF-Token'] = csrf;
  }
  return fetch(API + path, opts).then(r => {
    if (r.status === 401){
      // Hard-fail visibility: no silent failures. Bounce to login with a
      // return target so operator can resume where they left off.
      window.location.href = '/settings/admin?auth=expired&from=' + encodeURIComponent(location.pathname);
      throw new Error('session_expired');
    }
    return r;
  });
}

// ── state ──────────────────────────────────────
let topology = {nodes:[], edges:[]};
let nodes    = [];                  // positioned copies for rendering
let rate     = 0, bucket = 0;       // events/sec
let lastTopoCount = -1;             // suppress redundant "topology: N nodes" spam
let selectedId = null;
const edgeEls = new Map();          // edge path elements by "from→to"
const nodeEls = new Map();          // node <g> elements by id

setInterval(() => { rate = bucket; bucket = 0 }, 1000);

// ── helpers ────────────────────────────────────
function ns(t){ return document.createElementNS('http://www.w3.org/2000/svg', t) }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
function pad(n){ return n<10?'0'+n:n }
function clock(){ const d=new Date(); return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()) }

// Never let the literal string "undefined" reach the log. Also tolerate
// SSE payloads that omit `from` (heartbeats) or `type`.
function log(txt, kind){
  const safe = (txt==null || txt==='') ? 'event' : String(txt);
  const b = document.getElementById('events');
  const row = document.createElement('div');
  if (kind) row.className = kind;
  row.innerHTML = '<span class="t">'+clock()+'</span>'+esc(safe);
  b.prepend(row);
  while (b.children.length > 100) b.removeChild(b.lastChild);
}

// ── layout ─────────────────────────────────────
// bridge-gateway at hub; other nodes ring around it. Re-computed on resize.
function layout(){
  const c  = document.getElementById('canvas');
  const W  = c.clientWidth  || 800;
  const H  = c.clientHeight || 600;
  const cx = W/2, cy = H/2;
  const R  = Math.min(W, H) * 0.38;
  const gw = topology.nodes.find(n => n.id === 'bridge-gateway');
  const others = topology.nodes.filter(n => n.id !== 'bridge-gateway');
  nodes = [];
  if (gw) nodes.push({ ...gw, x:cx, y:cy, hub:true });
  others.forEach((n, i) => {
    const a = (i/others.length) * Math.PI*2 - Math.PI/2;
    nodes.push({ ...n, x: cx + Math.cos(a)*R, y: cy + Math.sin(a)*R });
  });
  // Cache canvas bounds for the orbit rings
  document.getElementById('svg').setAttribute('viewBox', `0 0 ${W} ${H}`);
  drawOrbits(cx, cy, R);
  drawHub(cx, cy);
}

function drawOrbits(cx, cy, R){
  const g = document.getElementById('g-orbits');
  g.innerHTML = '';
  [0.55, 0.78, 1.0, 1.18].forEach(k => {
    const r = ns('circle');
    r.setAttribute('cx', cx); r.setAttribute('cy', cy);
    r.setAttribute('r', R*k);
    r.setAttribute('class', 'ring');
    g.appendChild(r);
  });
}

function drawHub(cx, cy){
  const g = document.getElementById('g-hub');
  g.innerHTML = '';
  const halo = ns('circle');
  halo.setAttribute('cx', cx); halo.setAttribute('cy', cy); halo.setAttribute('r', 46);
  halo.setAttribute('fill', 'url(#hubGrad)'); halo.setAttribute('class', 'hub-glow');
  g.appendChild(halo);
  const core = ns('g'); core.setAttribute('class', 'hub-core'); core.setAttribute('transform', `translate(${cx} ${cy})`);
  const ring = ns('circle'); ring.setAttribute('r', 20); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#00ff9c'); ring.setAttribute('stroke-width', '1.4');
  core.appendChild(ring);
  const pulse = ns('circle'); pulse.setAttribute('r', 12); pulse.setAttribute('class', 'pulse'); pulse.setAttribute('stroke', '#00ff9c');
  core.appendChild(pulse);
  const label = ns('text'); label.setAttribute('class', 'hub-label'); label.setAttribute('dy', -2); label.textContent = 'BRIDGE';
  core.appendChild(label);
  const sub   = ns('text'); sub.setAttribute('class', 'hub-sub'); sub.setAttribute('dy', 12); sub.textContent = 'GATEWAY';
  core.appendChild(sub);
  g.appendChild(core);
}

// ── render nodes + edges (in-place, no flicker) ─
function tone(n){
  if (!n || n.status === 'down' || n.status === 'offline') return 'down';
  if ((n.restarts||0) > 5 || (n.cpu||0) > 70) return 'warn';
  return 'on';
}
function toneColor(t){ return t==='on' ? '#00ff9c' : t==='warn' ? '#ffb347' : '#ff4d6d' }

function render(){
  const edgesG = document.getElementById('g-edges');
  const nodesG = document.getElementById('g-nodes');

  // ── edges
  const wantEdges = new Set();
  topology.edges.forEach(e => {
    const A = nodes.find(n => n.id === e.from);
    const B = nodes.find(n => n.id === e.to);
    if (!A || !B) return;
    const key = e.from + '→' + e.to;
    wantEdges.add(key);
    const tA = tone(A), tB = tone(B);
    const t = tA==='down' || tB==='down' ? 'down' : (tA==='warn' || tB==='warn' ? 'warn' : 'on');
    let el = edgeEls.get(key);
    if (!el){
      el = ns('path');
      el.dataset.key = key;
      edgesG.appendChild(el);
      edgeEls.set(key, el);
    }
    el.setAttribute('d', `M ${A.x} ${A.y} L ${B.x} ${B.y}`);
    el.setAttribute('class', `edge ${t}${el.classList.contains('hot') ? ' hot' : ''}`);
  });
  for (const [key, el] of edgeEls){
    if (!wantEdges.has(key)){ el.remove(); edgeEls.delete(key); }
  }

  // ── nodes
  const wantNodes = new Set();
  nodes.forEach(n => {
    if (n.hub) return;                        // hub is drawn separately
    wantNodes.add(n.id);
    const t = tone(n);
    const color = toneColor(t);
    let g = nodeEls.get(n.id);
    if (!g){
      g = ns('g'); g.setAttribute('class', 'node-g'); g.dataset.id = n.id;
      const ring  = ns('circle'); ring.setAttribute('class','node-ring'); ring.setAttribute('r', 14);
      const dot   = ns('circle'); dot.setAttribute('class','node-dot');  dot.setAttribute('r', 5.5);
      const pulse = ns('circle'); pulse.setAttribute('class','pulse');   pulse.setAttribute('stroke-width', '1.2');
      const label = ns('text');   label.setAttribute('dy', 28);
      g.appendChild(ring); g.appendChild(dot); g.appendChild(pulse); g.appendChild(label);
      g.addEventListener('click', () => select(n));
      nodesG.appendChild(g);
      nodeEls.set(n.id, g);
    }
    g.setAttribute('transform', `translate(${n.x} ${n.y})`);
    g.classList.toggle('sel', n.id === selectedId);
    g.querySelector('.node-dot').setAttribute('fill', color);
    g.querySelector('.pulse').setAttribute('stroke', color);
    g.querySelector('.pulse').setAttribute('class', `pulse ${t}`);
    const short = n.id.length > 16 ? n.id.slice(0,14) + '…' : n.id;
    const lbl = g.querySelector('text');
    if (lbl.textContent !== short) lbl.textContent = short;
  });
  for (const [id, g] of nodeEls){
    if (!wantNodes.has(id)){ g.remove(); nodeEls.delete(id); }
  }
}

// ── selection ──────────────────────────────────
function select(n){
  selectedId = (selectedId === n.id) ? null : n.id;
  const el = document.getElementById('sel');
  if (!selectedId){ el.textContent = 'click a node'; render(); return; }
  el.innerHTML =
    '<b>'+esc(n.id)+'</b>'+
    '<div class="kv">status: <b>'+esc(n.status||'unknown')+'</b></div>'+
    '<div class="kv">cpu: <b>'+esc((n.cpu==null?'—':n.cpu+'%'))+'</b> · mem: <b>'+esc((n.mem_mb==null?'—':(n.mem_mb>=1024?(n.mem_mb/1024).toFixed(1)+' GB':n.mem_mb+' MB')))+'</b></div>'+
    '<button class="act" data-a="restart">restart</button>'+
    '<button class="act" data-a="reload">reload</button>';
  el.querySelectorAll('button').forEach(b => b.onclick = () => action(n.id, b.dataset.a));
  flow('bridge-gateway', n.id);
  render();
}

async function action(name, act){
  if (!confirm(act+' '+name+'?')) return;
  try{
    const r = await apiFetch('/admin/services/'+encodeURIComponent(name)+'/'+encodeURIComponent(act), { method:'POST' });
    if (!r.ok) throw new Error('HTTP '+r.status);
    log(act+' → '+name+' OK', 'info');
    flashEdge('bridge-gateway', name);
  } catch(e){ log(act+' '+name+' failed: '+e.message, 'err') }
}

// Brief "hot" pulse on an edge so operators see activity flow visually.
function flashEdge(from, to){
  const el = edgeEls.get(from+'→'+to) || edgeEls.get(to+'→'+from);
  if (!el) return;
  el.classList.add('hot');
  setTimeout(() => el.classList.remove('hot'), 1800);
}

// Token flying along the edge from A → B (existing behavior, kept).
function flow(a, b){
  const A = nodes.find(n => n.id === a), B = nodes.find(n => n.id === b);
  if (!A || !B) return;
  const flowsG = document.getElementById('g-flows');
  const p = ns('circle'); p.setAttribute('r', 4); p.setAttribute('fill', '#00ff9c'); p.setAttribute('filter', 'url(#glowFilter)');
  flowsG.appendChild(p);
  let t = 0;
  const id = setInterval(() => {
    t += .035;
    p.setAttribute('cx', A.x + (B.x-A.x)*t);
    p.setAttribute('cy', A.y + (B.y-A.y)*t);
    if (t >= 1){ clearInterval(id); p.remove() }
  }, 16);
  flashEdge(a, b);
}

// ── data ───────────────────────────────────────
async function fetchOverview(){
  try{
    const r = await apiFetch('/admin/overview', { cache:'no-store' });
    if (!r.ok) throw new Error('HTTP '+r.status);
    const d = await r.json();
    const pill = document.getElementById('pill');
    pill.classList.remove('stale');
    pill.classList.add('live');
    document.getElementById('conn').textContent = 'online';
    document.getElementById('up').textContent     = (d.services_up ?? '—') + ' / ' + (d.services_total ?? '—');
    document.getElementById('commit').textContent = (d.git_commit || '—').slice(0,7);
    const cpuV = document.getElementById('cpu');
    const memV = document.getElementById('mem');
    cpuV.textContent = (d.cpu_avg ?? '—') + '%';
    memV.textContent = (d.mem_avg ?? '—') + '%';
    cpuV.className = 'v' + ((d.cpu_avg||0) > 85 ? ' err' : (d.cpu_avg||0) > 70 ? ' warn' : '');
    memV.className = 'v' + ((d.mem_avg||0) > 85 ? ' err' : (d.mem_avg||0) > 70 ? ' warn' : '');
    if (d.services){
      d.services.forEach(s => {
        const n = topology.nodes.find(x => x.id === s.name);
        if (n){
          const prevStatus = n.status;
          n.status = s.status;
          n.cpu = s.cpu;
          n.mem_mb = s.mem_mb;
          n.restarts = s.restarts;
          if (prevStatus && prevStatus !== s.status){
            log(s.name+' → '+s.status, s.status==='online' ? 'info' : 'err');
            flashEdge('bridge-gateway', s.name);
          }
        }
      });
      // update positioned copies too so render() picks up new tone
      nodes.forEach(n => {
        const src = topology.nodes.find(x => x.id === n.id);
        if (src){ n.status = src.status; n.cpu = src.cpu; n.mem_mb = src.mem_mb; n.restarts = src.restarts; }
      });
    }
  } catch(e){
    const pill = document.getElementById('pill');
    pill.classList.remove('live');
    pill.classList.add('stale');
    document.getElementById('conn').textContent = 'offline';
    log('overview: '+e.message, 'err');
  }
}

async function fetchTopology(){
  try{
    const r = await apiFetch('/admin/topology', { cache:'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (d.nodes && d.edges){
      topology = d;
      layout();
      // Only log on count change — stop the every-10s "topology: 12 nodes" spam
      if (d.nodes.length !== lastTopoCount){
        log('topology: '+d.nodes.length+' nodes', 'info');
        lastTopoCount = d.nodes.length;
      }
    }
  } catch{}
}

function connectSSE(){
  try{
    const es = new EventSource(API+'/events/stream', { withCredentials: true });
    es.onopen  = () => log('event stream connected', 'info');
    es.onmessage = e => {
      bucket++;
      try{
        const d = JSON.parse(e.data);
        // Heartbeats often have no `from`; don't render the string "undefined".
        if (d && d.type){
          if (d.type === 'heartbeat') return;    // suppress heartbeat from the scrollback
          const src = d.from || d.service || d.source || 'system';
          log(d.type + ' ← ' + src);
        }
      } catch{}
    };
    es.onerror = () => { es.close(); setTimeout(connectSSE, 5000) };
  } catch(e){ log('SSE: '+e.message, 'err') }
}

// ── audio (unchanged wiring; just scaled to panel width) ─
let ac, an, osc;
function initAudio(){
  ac  = new (window.AudioContext || window.webkitAudioContext)();
  an  = ac.createAnalyser(); an.fftSize = 128;
  osc = ac.createOscillator();
  const g = ac.createGain(); g.gain.value = .018;
  osc.connect(g); g.connect(an); an.connect(ac.destination);
  osc.start(); drawAudio();
}
function drawAudio(){
  requestAnimationFrame(drawAudio);
  if (!an) return;
  if (osc) osc.frequency.value = 80 + rate*30;
  const data = new Uint8Array(an.frequencyBinCount);
  an.getByteFrequencyData(data);
  const c = document.getElementById('ac');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (c.width !== c.clientWidth*dpr || c.height !== c.clientHeight*dpr){
    c.width = c.clientWidth*dpr; c.height = c.clientHeight*dpr;
  }
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  const bars = data.length;
  const bw = c.width / bars;
  x.fillStyle = '#00ff9c';
  for (let i=0; i<bars; i++){
    const v = data[i]/255;
    x.fillRect(i*bw, c.height - v*c.height, bw*0.72, v*c.height);
  }
  x.fillStyle = '#00bfff';
  x.font = (11*dpr)+'px ui-monospace,monospace';
  x.fillText(rate + ' evt/s', 6*dpr, 14*dpr);
}

// ── main ──────────────────────────────────────
function loop(){ render(); requestAnimationFrame(loop) }

window.addEventListener('load', () => {
  layout(); render(); loop();
  const enable = () => { if (!ac){ try{ initAudio(); log('audio engine started','info') } catch(e){ log('audio: '+e.message,'err') } } };
  // Audio needs a user gesture; listen for click OR touchend on mobile.
  document.addEventListener('click',    enable, { once:true });
  document.addEventListener('touchend', enable, { once:true });
  fetchOverview(); fetchTopology();
  setInterval(fetchOverview, 2000);
  setInterval(fetchTopology, 10000);
  connectSSE();
  log('control plane init', 'info');
  log('tap anywhere to enable audio', 'info');
});

window.addEventListener('resize', () => { layout(); render() });
// On orientation change (mobile), give the browser a tick to settle before relayout.
window.addEventListener('orientationchange', () => setTimeout(() => { layout(); render() }, 150));