// === STABILIZED ADMIN DASHBOARD ===
// Merges original admin-dashboard.js with stabilization fixes
// Contains all original functionality plus: SW registration, WS isolation, channel decoupling

const API = window.location.origin;

// ── 0. SERVICE WORKER REGISTRATION (THROTTLED) ───────────────────────────────
// Purpose: Passive cache only, no fetch loops. Registers once per 10 minutes.
const FETCH_THROTTLE_MS = 5000;
let swRegistration = null;

async function registerServiceWorker() {
  const now = Date.now();
  const lastAttempt = parseInt(localStorage.getItem('sw-last-attempt') || '0');
  if (now - lastAttempt < 10 * 60 * 1000) return; // Throttle: 10 min

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    });
    localStorage.setItem('sw-last-attempt', now.toString());
    console.log('[SW] Registered');
  } catch (err) {
    console.error('[SW] Registration failed:', err);
  }
}

// ── 1. WEBSOCKET CLIENT (DETERMINISTIC HEARTBEAT + EVENT LOOP MONITORING) ───
class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.lastPong = Date.now();
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.heartbeatTimeout = 5000;
    this.heartbeatInterval = 3000;
    this.intervals = {};
    this.messageQueue = [];
    this.isShuttingDown = false;
    this.lastFrameTime = performance.now();
    this.eventLoopLag = 0;
    this.isLoopHealthy = true;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    const wsUrl = this.url.replace('https://', 'wss://').replace('http://', 'ws://');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectDelay = 1000;
      this.lastPong = Date.now();
      this.startHeartbeatMonitor();
      this.startEventLoopMonitor();
      this.flushMessageQueue();
    };

    this.ws.onmessage = (event) => {
      const msg = event.data;
      if (msg === 'pong') {
        this.lastPong = Date.now();
        this.isLoopHealthy = true;
        return;
      }
      this.dispatchMessage(msg);
    };

    this.ws.onerror = (err) => console.error('[WS] Error:', err);

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.stopHeartbeatMonitor();
      this.stopEventLoopMonitor();
      if (!this.isShuttingDown) this.scheduleReconnect();
    };
  }

  startHeartbeatMonitor() {
    this.stopHeartbeatMonitor();
    this.intervals.heartbeat = setInterval(() => {
      const now = Date.now();
      const lag = now - this.lastPong;

      if (lag > this.heartbeatTimeout) {
        console.warn('[WS] Heartbeat timeout - lag:', lag + 'ms');
        this.isLoopHealthy = false;
        if (this.ws) this.ws.close();
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, this.heartbeatInterval);
  }

  stopHeartbeatMonitor() {
    if (this.intervals.heartbeat) {
      clearInterval(this.intervals.heartbeat);
      delete this.intervals.heartbeat;
    }
  }

  startEventLoopMonitor() {
    const monitor = () => {
      const now = performance.now();
      const delta = now - this.lastFrameTime;

      if (delta > 50) {
        this.eventLoopLag = delta;
        this.isLoopHealthy = false;
      }

      this.lastFrameTime = now;
      this.intervals.eventLoopMonitor = requestAnimationFrame(monitor);
    };
    this.intervals.eventLoopMonitor = requestAnimationFrame(monitor);
  }

  stopEventLoopMonitor() {
    if (this.intervals.eventLoopMonitor) {
      cancelAnimationFrame(this.intervals.eventLoopMonitor);
      delete this.intervals.eventLoopMonitor;
    }
  }

  isHealthy() {
    const heartbeatOk = (Date.now() - this.lastPong) < this.heartbeatTimeout;
    return this.isLoopHealthy && heartbeatOk;
  }

  sendPing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send('ping');
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.messageQueue.push(data);
    }
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.ws.readyState === WebSocket.OPEN) {
      const msg = this.messageQueue.shift();
      this.ws.send(JSON.stringify(msg));
    }
  }

  scheduleReconnect() {
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
    setTimeout(() => this.connect(), this.reconnectDelay);
  }

  dispatchMessage(msg) {
    try {
      const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
      window.dispatchEvent(new CustomEvent('ws-message', { detail: data }));
    } catch (e) {
      console.error('[WS] Parse error:', e);
    }
  }

  shutdown() {
    this.isShuttingDown = true;
    this.stopHeartbeatMonitor();
    if (this.ws) this.ws.close();
  }
}

// ── 2. PERMISSIONS GUARD ────────────────────────────────────────────────────
// Check capabilities before invoking browser APIs
const PermissionsGuard = {
  geolocation: {
    isEnabled: () => 'geolocation' in navigator && (!document.featurePolicy || document.featurePolicy.allowsFeature('geolocation')),
    getPosition: function(options) {
      if (!this.isEnabled()) return Promise.reject(new Error('Geolocation not allowed'));
      return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
    }
  }
};

// ── 3. EXECUTION CHANNELS (DECOUPLED) ──────────────────────────────────────
const ExecutionChannels = {
  ws: {
    send(data) { if (window.wsClient) window.wsClient.send(data); }
  },
  poll: {
    tasks: new Map(),
    schedule(name, fn, interval) {
      if (this.tasks.has(name)) return;
      this.tasks.set(name, setInterval(fn, interval));
    },
    cancel(name) {
      if (this.tasks.has(name)) { clearInterval(this.tasks.get(name)); this.tasks.delete(name); }
    },
    shutdown() { this.tasks.forEach(clearInterval); this.tasks.clear(); }
  },
  ui: {
    scheduleRender(fn) { requestAnimationFrame(fn); }
  }
};

// ── 4. EDGE HEALTH VALIDATOR ────────────────────────────────────────────────
async function validateEdgeHealth() {
  const edges = [
    { domain: 'control.supaco.ai' },
    { domain: 'business.supaco.ai' },
    { domain: 'treasury.supaco.ai' }
  ];
  const results = {};
  await Promise.all(edges.map(async (edge) => {
    try {
      const start = performance.now();
      const resp = await fetch(`https://${edge.domain}/api/health`, { cache: 'no-store', redirect: 'manual' });
      results[edge.domain] = {
        status: resp.status,
        ok: resp.status === 200,
        error: resp.status === 200 ? null : `Expected 200, got ${resp.status}`
      };
    } catch (e) {
      results[edge.domain] = { status: 0, ok: false, error: e.message };
    }
  }));
  return results;
}

// ── 5. ORIGINAL CODE (preserved, only window.onload replaced) ────────────────

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
      window.location.href = '/settings/admin?auth=expired&from=' + encodeURIComponent(location.pathname);
      throw new Error('session_expired');
    }
    return r;
  });
}

let topology = {nodes:[], edges:[]};
let nodes    = [];
let rate     = 0, bucket = 0;
let lastTopoCount = -1;
let selectedId = null;
const edgeEls = new Map();
const nodeEls = new Map();

setInterval(() => { rate = bucket; bucket = 0 }, 1000);

function ns(t){ return document.createElementNS('http://www.w3.org/2000/svg', t) }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
function pad(n){ return n<10?'0'+n:n }
function clock(){ const d=new Date(); return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()) }

function log(txt, kind){
  const safe = (txt==null || txt==='') ? 'event' : String(txt);
  const b = document.getElementById('events');
  const row = document.createElement('div');
  if (kind) row.className = kind;
  row.innerHTML = '<span class="t">'+clock()+'</span>'+esc(safe);
  b.prepend(row);
  while (b.children.length > 100) b.removeChild(b.lastChild);
}

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

function tone(n){
  if (!n || n.status === 'down' || n.status === 'offline') return 'down';
  if ((n.restarts||0) > 5 || (n.cpu||0) > 70) return 'warn';
  return 'on';
}
function toneColor(t){ return t==='on' ? '#00ff9c' : t==='warn' ? '#ffb347' : '#ff4d6d' }

function render(){
  const edgesG = document.getElementById('g-edges');
  const nodesG = document.getElementById('g-nodes');

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

  const wantNodes = new Set();
  nodes.forEach(n => {
    if (n.hub) return;
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

function flashEdge(from, to){
  const el = edgeEls.get(from+'→'+to) || edgeEls.get(to+'→'+from);
  if (!el) return;
  el.classList.add('hot');
  setTimeout(() => el.classList.remove('hot'), 1800);
}

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
        if (d && d.type){
          if (d.type === 'heartbeat') return;
          const src = d.from || d.service || d.source || 'system';
          log(d.type + ' ← ' + src);
        }
      } catch{}
    };
    es.onerror = () => { es.close(); setTimeout(connectSSE, 5000) };
  } catch(e){ log('SSE: '+e.message, 'err') }
}

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

function loop(){ render(); requestAnimationFrame(loop) }

// ── 6. STABILIZED INITIALIZATION ──────────────────────────────────────────
window.addEventListener('load', () => {
  // Step 1: Register Service Worker (once, throttled)
  registerServiceWorker();

  // Step 2: Connect WebSocket (isolated channel)
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  window.wsClient = new WebSocketClient(wsUrl);
  window.wsClient.connect();

  // Step 3: Start WS heartbeat pings (3s interval)
  const wsHeartbeat = setInterval(() => {
    if (window.wsClient && window.wsClient.ws && window.wsClient.ws.readyState === WebSocket.OPEN) {
      window.wsClient.sendPing();
    }
  }, 3000);
  window.wsClient.intervals.ping = wsHeartbeat;

  // Step 4: Original UI setup
  layout(); render(); loop();

  const enable = () => { if (!ac){ try{ initAudio(); log('audio engine started','info') } catch(e){ log('audio: '+e.message,'err') } } };
  document.addEventListener('click',    enable, { once:true });
  document.addEventListener('touchend', enable, { once:true });

  // Step 5: Immediate fetch then start throttled polling via ExecutionChannels
  fetchOverview();
  fetchTopology();
  ExecutionChannels.poll.schedule('overview', fetchOverview, 2000);
  ExecutionChannels.poll.schedule('topology', fetchTopology, 10000);

  // Step 6: Connect SSE (unchanged)
  connectSSE();

  log('system stabilized (v2.0)', 'info');
  log('tap anywhere to enable audio', 'info');
});

window.addEventListener('resize', () => { layout(); render() });
window.addEventListener('orientationchange', () => setTimeout(() => { layout(); render() }, 150));

window.addEventListener('beforeunload', () => {
  if (window.wsClient) window.wsClient.shutdown();
  ExecutionChannels.poll.shutdown();
});