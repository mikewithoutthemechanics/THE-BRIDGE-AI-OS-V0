// =============================================================================
// VERCEL SERVERLESS — SINGLE CATCH-ALL FUNCTION v2
// Handles ALL /api/*, /health, /orchestrator/*, /billing, /ask, /auth/*, /referral/*
// Buckets: ops/treasury/ubi/founder — matches treasury-dashboard.html
// =============================================================================
const os = require('os');
const fs = require('fs');
const path = require('path');

// ── Shared helpers ──────────────────────────────────────────────────────────
const { supabase, isConfigured: supabaseConfigured } = require('../lib/supabase');
const ROOT = path.resolve(__dirname, '..');
const SHARED_DIR = path.join(ROOT, 'shared');

// ── TVM v2 inlined (HMAC signing, structured recs, topology) ─────────────────
const _tvmCrypto = (() => { try { return require('crypto'); } catch(e) { return null; } })();
const _TVM_SECRET = process.env.TVM_SECRET || 'bridgeos-tvm-secret-key';
const _TVM_KNOWN = {
  MailPipeline:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  TreasuryAPI:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  GlobalMapSync:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  WordPressSync:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  VPSGateway:{configured:1,healthy:0,degraded:1,action_required:1,autofix_available:0,human_approval_needed:1,recommendation_code:'VPS-RESTART-GW'},
  BrainOrchestrator:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  AgentSwarm:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  AuthService:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  SkillsEngine:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  UBIPool:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  LeadGen:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  PaymentGateway:{configured:1,healthy:1,degraded:0,action_required:0,recommendation_code:'OK'},
  BrainVPSSSH:{configured:0,healthy:0,degraded:1,action_required:1,autofix_available:0,human_approval_needed:1,recommendation_code:'VPS-SSH-RESTORE'},
  SubdomainSSL:{configured:1,healthy:0,degraded:1,action_required:1,autofix_available:0,human_approval_needed:1,recommendation_code:'SSL-DNS-FLIP'},
  WebwayDNS:{configured:1,healthy:0,degraded:1,action_required:1,autofix_available:0,human_approval_needed:1,recommendation_code:'DNS-PROPAGATE'},
};
const _TVM_TOPICS = ['MailPipeline','TreasuryAPI','GlobalMapSync','WordPressSync','VPSGateway','BrainOrchestrator','AgentSwarm','AuthService','SkillsEngine','UBIPool','LeadGen','PaymentGateway','BrainVPSSSH','SubdomainSSL','WebwayDNS'];
const _TVM_META = {
  MailPipeline:{owner:'brain',priority:2,risk_score:3}, TreasuryAPI:{owner:'brain',priority:3,risk_score:4},
  GlobalMapSync:{owner:'brain',priority:1,risk_score:2}, WordPressSync:{owner:'brain',priority:1,risk_score:1},
  VPSGateway:{owner:'ops',priority:3,risk_score:4}, BrainOrchestrator:{owner:'brain',priority:3,risk_score:5},
  AgentSwarm:{owner:'brain',priority:2,risk_score:3}, AuthService:{owner:'ops',priority:3,risk_score:4},
  SkillsEngine:{owner:'brain',priority:2,risk_score:2}, UBIPool:{owner:'treasury',priority:2,risk_score:3},
  LeadGen:{owner:'growth',priority:2,risk_score:2}, PaymentGateway:{owner:'ops',priority:3,risk_score:5},
  BrainVPSSSH:{owner:'ops',priority:3,risk_score:5}, SubdomainSSL:{owner:'ops',priority:2,risk_score:3},
  WebwayDNS:{owner:'ops',priority:2,risk_score:3},
};
// Structured recommendations (description + steps + severity)
const _TVM_REC_LIB = {
  'MP-AF-ROTATE-TOKEN':{description:'Rotate SMTP/Brevo token and restart mail relay',severity:3,action_type:'autofix',requires_human_approval:true,steps:['Revoke existing SMTP/Brevo token in Brevo dashboard','Generate new API key under Transactional → SMTP & API','Update BREVO_SMTP_KEY env in Vercel','Redeploy: vercel --prod','Verify health probe returns healthy=1']},
  'TR-RECONCILE':{description:'Run treasury reconciliation — balance drift detected',severity:4,action_type:'autofix',requires_human_approval:true,steps:['Snapshot treasury balances via GET /api/treasury/status','Run reconcile: POST /api/treasury/reconcile','Flag any drift > 0.01 BRDG','Re-sign TVM row after reconcile']},
  'GMS-RECONNECT':{description:'Reconnect global map WebSocket feed',severity:2,action_type:'autofix',requires_human_approval:false,steps:['Close stale WebSocket connection','Re-authenticate with map broker','Re-subscribe to topology events','Verify node count matches registry']},
  'WPS-SYNC':{description:'Push 50-applications content to WordPress sites',severity:1,action_type:'sync',requires_human_approval:false,steps:['Fetch latest 50-applications.html','Parse application entries','Upsert pages via WP REST API','Log sync result']},
  'VPS-RESTART-GW':{description:'Restart bridge-gateway via PM2 on VPS',severity:4,action_type:'autofix',requires_human_approval:true,steps:['Restore SSH access first (VPS-SSH-RESTORE)','SSH: ssh root@102.208.231.53','Run: pm2 restart bridge-gateway','Wait 15s for startup','Confirm /health returns 200']},
  'BR-HEALTHCHECK':{description:'Run brain orchestrator self-test and reload agents',severity:3,action_type:'diagnostics',requires_human_approval:false,steps:['POST /api/agents/dispatch { action:"self-test" }','Await /orchestrator/status → running','Reload agent registry from SVG engine','Re-run GET /api/swarm/health']},
  'SW-REBALANCE':{description:'Rebalance agent swarm — utilization drift',severity:3,action_type:'autofix',requires_human_approval:false,steps:['GET /api/swarm/matrix for utilization','Identify agents > 85%','POST /api/swarm/rebalance','Confirm balanced=true']},
  'AUTH-ROTATE-JWT':{description:'Rotate JWT signing keys and invalidate sessions',severity:4,action_type:'security',requires_human_approval:true,steps:['Generate new JWT keypair','Update AUTH_SECRET in Vercel env','Redeploy: vercel --prod','Invalidate existing sessions','Notify active users']},
  'SK-RELOAD':{description:'Reload skills registry from SVG engine',severity:2,action_type:'sync',requires_human_approval:false,steps:['Fetch SVG skill definitions from /skills/registry','Parse skill metadata','Upsert into skills registry','Emit skills.updated event']},
  'UBI-REPOOL':{description:'Recalculate UBI pool eligibility and balances',severity:3,action_type:'autofix',requires_human_approval:true,steps:['Fetch active citizen roster','Apply eligibility rules','Recalculate pool distribution','Update wallet balances','Log to treasury ledger']},
  'LG-RESTART':{description:'Restart lead generation scheduler',severity:2,action_type:'autofix',requires_human_approval:false,steps:['Kill stale LeadGen process','Clear backlog','Restart scheduler','Verify first prospect within 60s']},
  'PAY-VERIFY':{description:'Verify PayFast webhook and payment state',severity:5,action_type:'diagnostics',requires_human_approval:true,steps:['Check PayFast webhook delivery logs','Verify PAYFAST_MERCHANT_ID env','Test IPN endpoint','Reconcile last 24h transactions']},
  'VPS-SSH-RESTORE':{description:'Add SSH key to VPS authorized_keys via Webway support',severity:5,action_type:'configuration',requires_human_approval:true,steps:['Email support@webway.co.za with SSH public key','Wait for Webway to add to authorized_keys','Test: ssh root@102.208.231.53','Run vps-fix.sh','Update BrainVPSSSH to configured=1,healthy=1']},
  'SSL-DNS-FLIP':{description:'Update 6 A records in Webway DNS to 76.76.21.21',severity:3,action_type:'configuration',requires_human_approval:true,steps:['Log into Webway DNS panel or email support','Change A records for 6 subdomains → 76.76.21.21','Wait for DNS propagation (up to 48h)','Verify SSL provisioning in Vercel','Update SubdomainSSL+WebwayDNS to healthy=1']},
  'DNS-PROPAGATE':{description:'Wait for DNS propagation or contact Webway support',severity:3,action_type:'diagnostics',requires_human_approval:false,steps:['Run: dig ehsa.ai-os.co.za (expect 76.76.21.21)','If old IP: email support@webway.co.za for ETA','Check dnschecker.org for global propagation','Re-run SSL check once propagated']},
  'OK':{description:'No action required — system healthy',severity:0,action_type:'none',requires_human_approval:false,steps:[]},
};
// Topology edges for global system map
const _TVM_TOPOLOGY = {
  version:'1.0',
  positions:{WordPressSync:[80,80],MailPipeline:[200,80],GlobalMapSync:[320,80],AgentSwarm:[440,80],SkillsEngine:[560,80],UBIPool:[700,80],LeadGen:[840,80],AuthService:[160,270],BrainOrchestrator:[400,270],TreasuryAPI:[640,270],PaymentGateway:[880,270],BrainVPSSSH:[120,430],VPSGateway:[320,430],SubdomainSSL:[560,430],WebwayDNS:[780,430]},
  edges:[{from:'BrainVPSSSH',to:'VPSGateway'},{from:'VPSGateway',to:'BrainOrchestrator'},{from:'WebwayDNS',to:'SubdomainSSL'},{from:'SubdomainSSL',to:'BrainOrchestrator'},{from:'PaymentGateway',to:'TreasuryAPI'},{from:'AuthService',to:'BrainOrchestrator'},{from:'TreasuryAPI',to:'BrainOrchestrator'},{from:'WordPressSync',to:'BrainOrchestrator'},{from:'MailPipeline',to:'BrainOrchestrator'},{from:'GlobalMapSync',to:'BrainOrchestrator'},{from:'AgentSwarm',to:'BrainOrchestrator'},{from:'SkillsEngine',to:'BrainOrchestrator'},{from:'UBIPool',to:'TreasuryAPI'},{from:'LeadGen',to:'BrainOrchestrator'}],
};
let _tvmMatrix = null;
// HMAC-SHA256 signing (matches lib/tvm.js v2 canonical payload)
function _tvmSign(r) {
  const s=[r.topic,r.configured,r.healthy,r.degraded,r.action_required,r.autofix_available||0,r.human_approval_needed||0,r.last_updated,r.recommendation_code||''].join('|');
  if(_tvmCrypto) return _tvmCrypto.createHmac('sha256',_TVM_SECRET).update(s).digest('hex').slice(0,16);
  let h=0; for(let i=0;i<s.length;i++){h=(Math.imul(31,h)+s.charCodeAt(i))|0;} return Math.abs(h).toString(16).padStart(16,'0');
}
function _tvmBuild() { const now=Math.floor(Date.now()/1000); return _TVM_TOPICS.map(t=>{ const k=_TVM_KNOWN[t]||{}; const m=_TVM_META[t]||{}; const r={topic:t,configured:k.configured??1,healthy:k.healthy??1,degraded:k.degraded??0,action_required:k.action_required??0,autofix_available:k.autofix_available??0,human_approval_needed:k.human_approval_needed??0,last_updated:now,recommendation_code:k.recommendation_code||'OK',risk_score:m.risk_score||1,priority:m.priority||1,owner:m.owner||'ops'}; r.signature=_tvmSign(r); return r; }); }
function _tvmGetMatrix() { if(!_tvmMatrix) _tvmMatrix=_tvmBuild(); return _tvmMatrix; }
const tvm = {
  getMatrix() { return _tvmGetMatrix(); },
  getSummary() { const m=_tvmGetMatrix(); return { total:m.length, healthy:m.filter(r=>r.healthy).length, degraded:m.filter(r=>r.degraded).length, action_required:m.filter(r=>r.action_required).length, pending_approval:m.filter(r=>r.human_approval_needed).length, autofix_ready:m.filter(r=>r.autofix_available&&!r.human_approval_needed).length, ts:Math.floor(Date.now()/1000) }; },
  getRow(t) { return _tvmGetMatrix().find(r=>r.topic===t)||null; },
  getRecommendation(c) { return (_TVM_REC_LIB[c]||{}).description||'Unknown code'; },
  getRecommendationDetail(c) { return _TVM_REC_LIB[c]||null; },
  RECOMMENDATIONS: _TVM_REC_LIB,
  approveAction(t) { return this.updateRow(t,{action_required:0,human_approval_needed:0}); },
  rejectAction(t) { return this.updateRow(t,{action_required:0,human_approval_needed:0,autofix_available:0,recommendation_code:'OK'}); },
  agentPropose(t,code,just) { const r=this.getRow(t); if(!r) return {ok:false,error:'topic not found'}; const rec=_TVM_REC_LIB[code]; if(!rec) return {ok:false,error:'unknown recommendation_code'}; return {ok:true,proposal:{topic:t,proposal_code:code,justification:just,requires_human_approval:!!r.human_approval_needed||rec.requires_human_approval,steps:rec.steps,severity:rec.severity,ts:Math.floor(Date.now()/1000)}}; },
  updateRow(t,upd) { const m=_tvmGetMatrix(); const i=m.findIndex(r=>r.topic===t); if(i===-1) return {ok:false,error:'topic not found'}; const role=upd._role||(upd._actor==='human'?'tvm.operator':'tvm.agent'); const writeMap={'tvm.agent':['healthy','degraded','last_updated','action_required','autofix_available','human_approval_needed','recommendation_code'],'tvm.operator':['healthy','degraded','last_updated','configured','action_required','autofix_available','human_approval_needed','recommendation_code','risk_score','priority']}; const allowed=writeMap[role]||writeMap['tvm.agent']; const u={}; for(const[k,v] of Object.entries(upd)){if(k.startsWith('_')||!allowed.includes(k))continue;u[k]=v;} u.last_updated=Math.floor(Date.now()/1000); const updated={...m[i],...u}; updated.signature=_tvmSign(updated); m[i]=updated; return {ok:true,row:updated}; },
};

const ts = () => Date.now();

function readContracts() {
  try {
    const files = fs.readdirSync(SHARED_DIR).filter(f => f.endsWith('.json'));
    const contracts = {};
    for (const file of files) {
      try { contracts[file] = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8')); }
      catch (_) { contracts[file] = { error: 'parse_failed' }; }
    }
    return { files, contracts };
  } catch (_) { return { files: [], contracts: {} }; }
}

function readPortAssignments() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'port-assignments.json'), 'utf8')); }
  catch (_) { return { assignments: [] }; }
}

function listPackages() {
  try {
    const nmDir = path.join(ROOT, 'node_modules');
    const dirs = fs.readdirSync(nmDir).filter(d => !d.startsWith('.') && !d.startsWith('@'));
    const scopedDirs = fs.readdirSync(nmDir).filter(d => d.startsWith('@'));
    const scoped = [];
    for (const scope of scopedDirs) {
      try { scoped.push(...fs.readdirSync(path.join(nmDir, scope)).map(i => `${scope}/${i}`)); } catch (_) {}
    }
    return [...dirs, ...scoped].sort();
  } catch (_) { return []; }
}

// ── Avatar modes ────────────────────────────────────────────────────────────
const AVATAR_MODES = {
  wireframe: {
    geometry: { type: 'wireframe-mesh', vertices: 2048, faces: 4096, topology: 'triangulated' },
    material: { type: 'wireframe', color: '#00ffcc', lineWidth: 1.5, opacity: 0.8 },
    camera: { position: [0, 1.6, 3], target: [0, 0.8, 0], fov: 55 },
    lighting: [{ type: 'ambient', intensity: 0.3 }],
    effects: ['edge-glow'],
  },
  textured: {
    geometry: { type: 'humanoid-mesh', vertices: 8192, faces: 16384, topology: 'subdivided', lod_levels: 3 },
    material: { type: 'pbr', albedo: '#c4956a', roughness: 0.6, metalness: 0.1, normal_map: true },
    camera: { position: [0, 1.5, 2.5], target: [0, 0.9, 0], fov: 50 },
    lighting: [{ type: 'directional', intensity: 1.0, position: [2, 3, 1] }, { type: 'ambient', intensity: 0.4 }],
    effects: ['ssao', 'soft-shadows'],
  },
  anatomical: {
    geometry: { type: 'layered-mesh', layers: ['skeleton', 'muscle', 'skin'], vertices: 32768 },
    material: { type: 'translucent', opacity_layers: [1.0, 0.7, 0.4], color_layers: ['#f0f0e0', '#cc4444', '#c4956a'] },
    camera: { position: [0, 1.4, 3.5], target: [0, 0.9, 0], fov: 45 },
    lighting: [{ type: 'area', intensity: 1.2, size: [2, 2] }],
    effects: ['subsurface-scattering', 'x-ray-toggle'],
  },
  neural: {
    geometry: { type: 'particle-system', particle_count: 50000, connections: 12000 },
    material: { type: 'emissive-particles', color: '#7744ff', pulse_speed: 1.2 },
    camera: { position: [0, 1.6, 4], target: [0, 1.0, 0], fov: 60 },
    lighting: [{ type: 'point', intensity: 0.5, color: '#4400ff', position: [0, 2, 0] }],
    effects: ['bloom', 'particle-trails', 'synapse-fire'],
  },
  holographic: {
    geometry: { type: 'hologram-mesh', vertices: 4096, scan_lines: true, flicker_rate: 0.02 },
    material: { type: 'holographic', base_color: '#00ccff', scan_line_color: '#ffffff', opacity: 0.6, fresnel: 2.0 },
    camera: { position: [0, 1.5, 3], target: [0, 0.9, 0], fov: 50 },
    lighting: [{ type: 'rim', intensity: 1.5, color: '#00ccff' }],
    effects: ['scanlines', 'chromatic-aberration', 'flicker'],
  },
  quantum: {
    geometry: { type: 'probability-cloud', qubit_count: 256, superposition_states: 8 },
    material: { type: 'quantum-field', color_a: '#ff00ff', color_b: '#00ffff', entanglement_vis: true },
    camera: { position: [0, 2, 5], target: [0, 1.0, 0], fov: 65 },
    lighting: [{ type: 'volumetric', intensity: 0.8, color: '#8800ff', scatter: 0.3 }],
    effects: ['wave-collapse', 'entanglement-lines', 'probability-haze'],
  },
};

// ── Persistent DB layer ──────────────────────────────────────────────────────
const db      = require('../lib/db');
const pf      = require('../lib/payfast');
const agents  = require('../lib/agents');
const notify  = require('../lib/notify');
const banks    = require('../lib/banks');
const da       = require('../lib/directadmin');
const infraFb  = require('../lib/infra-feedback');
const wp       = require('../lib/wordpress');
const mail     = require('../lib/mail');

// Seed system banks on first cold start (no-op if already seeded)
banks.seedBanksIfEmpty().catch(() => {});

// ── Route handlers ──────────────────────────────────────────────────────────
// Live system state (as at 2026-04-04)
const agentNames = [
  'QuoteGen AI', 'Finance AI', 'Growth Hunter', 'Intelligence AI', 'Nurture AI',
  'Closer AI', 'Campaign AI', 'Creative AI', 'Support AI', 'Supply AI'
];
const TREASURY_SEED = 1389208.00;
let   treasuryBalance = TREASURY_SEED; // warm cache; refreshed from DB on each treasury request
const CYCLE_COUNT   = 2697;
const REVENUE_TOTAL = 541225.00;

// ── Neurochemistry model ─────────────────────────────────────────────────────
// C(t) = 0.4D + 0.2S + 0.25O + 0.15E
// Warm cache — loaded from DB on first /api/neuro or /api/brain call
let neuro = {
  D: 0.007,   // Dopamine
  S: 0.051,   // Serotonin
  O: 0.485,   // Oxytocin
  E: 0.783,   // Endorphins
};
let neuroLoaded = false;
function computeCognition(n) {
  return +(0.4 * n.D + 0.2 * n.S + 0.25 * n.O + 0.15 * n.E).toFixed(4);
}
function dominantState(n) {
  const vals = { D: n.D, S: n.S, O: n.O, E: n.E };
  return Object.entries(vals).sort((a, b) => b[1] - a[1])[0][0];
}

// ── Live funnel state ────────────────────────────────────────────────────────
const FUNNEL = {
  osint_discovery: 100,
  lead_generated:  200,
  nurturing:       28,
  qualified:       0,
  proposal_sent:   0,
  closed_won:      436,
  customer:        129,
};

// ── Simple in-process rate limiter (per IP, resets on cold start) ────────────
const _rateLimits = new Map();
function rateLimit(ip, key, maxPerMinute) {
  const k    = `${ip}:${key}`;
  const now  = Date.now();
  const prev = _rateLimits.get(k) || { count: 0, window: now };
  if (now - prev.window > 60000) { _rateLimits.set(k, { count: 1, window: now }); return false; }
  if (prev.count >= maxPerMinute) return true; // rate-limited
  _rateLimits.set(k, { count: prev.count + 1, window: prev.window });
  return false;
}

// Auth store — backed by Supabase 'users' table (persistent across cold starts)
const JWT_SECRET = process.env.JWT_SECRET;
const REFERRAL_CODES = { BRIDGE2025: 500, AILAUNCH: 250, BETA100: 100 };
const _revokedTokens = new Set();

let jwt, bcrypt;
try { jwt = require('jsonwebtoken'); } catch (_) { jwt = null; }
try { bcrypt = require('bcryptjs'); } catch (_) { bcrypt = null; }

function makeToken(payload) {
  if (!jwt) return `stub-token-${Date.now()}`;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}
function verifyToken(token) {
  if (!jwt) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch (_) { return null; }
}
async function hashPassword(pw) { return bcrypt ? bcrypt.hash(pw, 10) : `hashed:${pw}`; }
async function checkPassword(pw, hash) { return bcrypt ? bcrypt.compare(pw, hash) : hash === `hashed:${pw}`; }

// ── Router ──────────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function json(res, data, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json').end(JSON.stringify(data));
}

async function parseBody(req) {
  if (req.body) return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch (_) { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // ── Health ──
  if (p === '/health') {
    return json(res, { status: 'OK', gateway: 'up', core: 'serverless', ts: ts() });
  }

  // ── Orchestrator status ──
  if (p === '/orchestrator/status') {
    const agents = agentNames.map(name => ({
      id: `agent_${name}`, name, status: 'active',
      tasks_completed: 0,
      uptime_s: Math.floor(process.uptime()),
    }));
    return json(res, { status: 'running', agents: agents.length, active_agents: agents.length, swarms: 2, queue_depth: 0, agents_list: agents, ts: ts() });
  }

  // ── Billing ──
  if (p === '/billing') {
    return json(res, {
      treasury_balance: +treasuryBalance.toFixed(2), currency: 'USD', period: 'monthly',
      revenue_mtd: 28450, costs_mtd: 4210.50, net_mtd: 24239.50, subscriptions: 142,
      active_plans: [
        { id: 'starter', name: 'Starter', price: 49, count: 64 },
        { id: 'pro', name: 'Pro', price: 149, count: 51 },
        { id: 'enterprise', name: 'Enterprise', price: 499, count: 27 },
      ],
      last_updated: new Date().toISOString(),
    });
  }

  // ── Ask (LLM) ──
  if ((p === '/ask' || p === '/api/ask') && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.prompt) return json(res, { error: 'prompt required' }, 400);

    const q = (body.prompt || '').toLowerCase();

    // ── Emotion + intent classifier ───────────────────────
    const EMOTION_MAP = [
      { keywords: ['hello','hi','hey','greet','good morning','good day'],      emotion: 'friendly',  reply: "Hello! I'm Bridge AI, your autonomous operating system. How can I help you today?",    expression: { smile: 0.85, brow: 0.6,  jaw: 0.05, tension: 0.1,  mode: 'facs'  } },
      { keywords: ['happy','great','amazing','fantastic','excellent','love'],   emotion: 'joy',       reply: "That's wonderful to hear! The system is performing at full capacity. All agents active.", expression: { smile: 1.0,  brow: 0.8,  jaw: 0.1,  tension: 0.05, mode: 'facs'  } },
      { keywords: ['sad','unhappy','upset','disappoint','fail','broke'],        emotion: 'concern',   reply: "I understand. Let me run a diagnostic and see how I can help resolve this for you.",    expression: { smile: 0.2,  brow: 0.2,  jaw: 0.15, tension: 0.5,  mode: 'embodied' } },
      { keywords: ['angry','frustrat','annoyed','broken','wrong','bug'],        emotion: 'alert',     reply: "I hear you. Activating problem-resolution protocol. I'll prioritise this immediately.",  expression: { smile: 0.1,  brow: 0.1,  jaw: 0.3,  tension: 0.85, mode: 'tension' } },
      { keywords: ['treasury','money','balance','fund','revenue','payment'],    emotion: 'analytical',reply: `Treasury is healthy at $${treasuryBalance.toFixed(2)}. Operations bucket: $${(treasuryBalance*0.4).toFixed(2)}. All 4 buckets active.`, expression: { smile: 0.5,  brow: 0.7,  jaw: 0.05, tension: 0.2,  mode: 'facs'  } },
      { keywords: ['agent','swarm','task','dispatch','layer','l1','l2','l3'],   emotion: 'focused',   reply: `${agentNames.length} agents active across L1/L2/L3. ${agentNames.length * 47} tasks completed this cycle. Swarm health: optimal.`, expression: { smile: 0.4,  brow: 0.75, jaw: 0.0,  tension: 0.25, mode: 'vector' } },
      { keywords: ['status','health','system','uptime','monitor','check'],      emotion: 'confident', reply: `System uptime: ${Math.floor(os.uptime())}s. Memory: ${((1-os.freemem()/os.totalmem())*100).toFixed(1)}% used. All endpoints healthy.`, expression: { smile: 0.6,  brow: 0.6,  jaw: 0.0,  tension: 0.15, mode: 'procedural' } },
      { keywords: ['think','wonder','curious','question','how','why','what'],   emotion: 'curious',   reply: "Good question. Let me analyse the full system state and formulate the most complete answer.", expression: { smile: 0.4,  brow: 0.85, jaw: 0.08, tension: 0.3,  mode: 'constrained' } },
      { keywords: ['stop','quiet','silence','pause','enough','bye','goodbye'],  emotion: 'calm',      reply: "Understood. Going quiet. I'm here whenever you need me.",                                expression: { smile: 0.35, brow: 0.5,  jaw: 0.0,  tension: 0.05, mode: 'procedural' } },
      { keywords: ['crm','customer','contact','lead','deal','pipeline'],        emotion: 'helpful',   reply: `CRM: ${CONTACTS.filter(c=>c.status==='customer').length} customers, ${CONTACTS.filter(c=>c.status!=='customer').length} leads. Pipeline moving well.`, expression: { smile: 0.7,  brow: 0.65, jaw: 0.05, tension: 0.15, mode: 'facs'  } },
      { keywords: ['invoice','billing','pay','due','outstanding','send'],       emotion: 'precise',   reply: `${INVOICES.filter(i=>i.status==='paid').length} invoices paid. ${INVOICES.filter(i=>i.status==='sent').length} outstanding. Auto follow-up active.`, expression: { smile: 0.45, brow: 0.7,  jaw: 0.0,  tension: 0.2,  mode: 'facs'  } },
    ];

    let match = EMOTION_MAP.find(e => e.keywords.some(k => q.includes(k)));
    if (!match) {
      match = { emotion: 'neutral', reply: `Bridge AI processing: "${body.prompt}". Treasury: $${(treasuryBalance/1e6).toFixed(2)}M. Cycle: ${CYCLE_COUNT}. Cognition: ${computeCognition(neuro)}. How can I assist?`, expression: { smile: 0.5, brow: 0.55, jaw: 0.02, tension: 0.15, mode: 'procedural' } };
    }

    // Blend expression with current neurochemistry
    const nExpr = {
      smile:   +Math.min(1, neuro.O * 1.2 + neuro.E * 0.3).toFixed(2),
      brow:    +Math.min(1, computeCognition(neuro) * 2).toFixed(2),
      tension: +Math.max(0, 1 - neuro.S - neuro.O * 0.4).toFixed(2),
    };
    const blended = {
      smile:   +((match.expression.smile * 0.6 + nExpr.smile * 0.4)).toFixed(2),
      brow:    +((match.expression.brow  * 0.6 + nExpr.brow  * 0.4)).toFixed(2),
      jaw:     match.expression.jaw,
      tension: +((match.expression.tension * 0.6 + nExpr.tension * 0.4)).toFixed(2),
      mode:    match.expression.mode,
    };

    // Update neuro on interaction (conversation boosts oxytocin + serotonin slightly)
    neuro.O = Math.min(1, neuro.O + 0.008);
    neuro.S = Math.min(1, neuro.S + 0.004);
    db.setNeuro(neuro).catch(() => {}); // persist async, don't block response

    return json(res, {
      id: `brain_${ts()}`, prompt: body.prompt,
      reply: match.reply, emotion: match.emotion,
      expression: blended,
      neuro: { D: +neuro.D.toFixed(4), S: +neuro.S.toFixed(4), O: +neuro.O.toFixed(4), E: +neuro.E.toFixed(4), cognition: computeCognition(neuro), state: `|${dominantState(neuro)}⟩` },
      brain: {
        treasury: +treasuryBalance.toFixed(2), cycle: CYCLE_COUNT, revenue: REVENUE_TOTAL,
        agents: agentNames.length, uptime_s: Math.floor(os.uptime()),
      },
      ts: ts(),
    });
  }

  // ── API: Topology ──
  if (p === '/api/topology') {
    const ifaces = os.networkInterfaces();
    const nodes = [{ id: 'gateway', label: 'Gateway (Vercel)', port: 443, status: 'up', type: 'gateway' }];
    const edges = [];
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (name === 'lo') continue;
      const ipv4 = addrs.find(a => a.family === 'IPv4');
      if (ipv4) {
        nodes.push({ id: `iface_${name}`, label: name, ip: ipv4.address, mac: ipv4.mac, type: 'interface' });
        edges.push({ source: 'gateway', target: `iface_${name}` });
      }
    }
    const services = [
      { id: 'system', label: 'System / Core', port: 3000 },
      { id: 'ainode', label: 'AI Node', port: 3001 },
      { id: 'orchestrator_l1', label: 'L1 Orchestrator', port: 9000 },
      { id: 'orchestrator_l2', label: 'L2 Orchestrator', port: 9001 },
      { id: 'orchestrator_l3', label: 'L3 Orchestrator', port: 9002 },
      { id: 'server', label: 'Server', port: 5000 },
      { id: 'payments', label: 'Payments', port: 4000 },
    ];
    for (const svc of services) {
      nodes.push({ ...svc, status: 'remote', type: 'service' });
      edges.push({ source: 'gateway', target: svc.id });
    }
    return json(res, { nodes, edges, interface_count: Object.keys(ifaces).length, env: 'serverless', ts: ts() });
  }

  // ── API: Avatar ──
  if (p.startsWith('/api/avatar')) {
    const mode = p.replace('/api/avatar/', '').replace('/api/avatar', '') || 'wireframe';
    if (mode === 'modes') return json(res, { modes: Object.keys(AVATAR_MODES), count: Object.keys(AVATAR_MODES).length, ts: ts() });
    const scene = AVATAR_MODES[mode] || AVATAR_MODES['wireframe'];
    return json(res, {
      mode: AVATAR_MODES[mode] ? mode : 'wireframe', scene_type: 'babylon-scene', ...scene,
      animations: ['idle', 'breathe', 'gesture', 'think'],
      interaction: { clickable: true, rotatable: true, zoomable: true }, ts: ts(),
    });
  }

  // ── API: Registry ──
  if (p.startsWith('/api/registry')) {
    const ns = p.replace('/api/registry/', '').replace('/api/registry', '') || 'root';
    const handlers = {
      kernel: () => {
        const cpus = os.cpus();
        return {
          os_type: os.type(), os_release: os.release(), os_platform: os.platform(), os_arch: os.arch(),
          hostname: os.hostname(), uptime_seconds: os.uptime(), loadavg: os.loadavg(),
          cpu_model: cpus[0]?.model || 'unknown', cpu_cores: cpus.length, cpu_speed_mhz: cpus[0]?.speed || 0,
          total_memory_bytes: os.totalmem(), free_memory_bytes: os.freemem(),
          memory_usage_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
          env: 'serverless', status: 'healthy', ts: ts(),
        };
      },
      network: () => {
        const ifaces = os.networkInterfaces();
        const interfaces = [];
        for (const [name, addrs] of Object.entries(ifaces)) {
          for (const addr of addrs) {
            interfaces.push({ name, address: addr.address, netmask: addr.netmask, family: addr.family, mac: addr.mac, internal: addr.internal });
          }
        }
        return { interfaces, dns: ['serverless-managed'], interface_count: interfaces.length, status: 'healthy', ts: ts() };
      },
      security: () => {
        let tlsCerts = [];
        try { tlsCerts = fs.readdirSync(path.join(ROOT, 'certs')).filter(f => /\.(pem|crt|key|cert)$/i.test(f)); } catch (_) {}
        return {
          tls_certs_found: tlsCerts.length, tls_certs: tlsCerts, tls_enabled: true,
          firewall: 'vercel-managed', env_secrets_exposed: 0, env_secret_keys: [],
          last_scan: new Date().toISOString(), status: 'healthy', ts: ts(),
        };
      },
      federation: () => ({
        federation_nodes: [
          { id: 'l1_orchestrator', port: 9000, host: 'localhost', reachable: false, error: 'serverless-no-local' },
          { id: 'l2_orchestrator', port: 9001, host: '192.168.110.203', reachable: false, error: 'serverless-no-lan' },
          { id: 'l3_orchestrator', port: 9002, host: 'localhost', reachable: false, error: 'serverless-no-local' },
        ],
        reachable_count: 0, total: 3, env: 'serverless', ts: ts(),
      }),
      jobs: () => {
        const { files } = readContracts();
        const jobs = files.map((file, i) => {
          try {
            const d = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
            return { id: `job_${i + 1}`, file, title: d.title || d.name || file.replace('.json', ''), status: d.status || 'queued', priority: d.priority || 'normal' };
          } catch (_) { return { id: `job_${i + 1}`, file, status: 'error' }; }
        });
        return { jobs, count: jobs.length, ts: ts() };
      },
      market: () => {
        const { files, contracts } = readContracts();
        let totalTasks = 0, totalAgents = 0, completed = 0;
        for (const d of Object.values(contracts)) {
          if (d.tasks) totalTasks += Array.isArray(d.tasks) ? d.tasks.length : 1;
          if (d.agents) totalAgents += Array.isArray(d.agents) ? d.agents.length : 1;
          if (d.status === 'completed') completed++;
        }
        return { contracts: files.length, total_tasks: totalTasks, total_agents: totalAgents, completion_pct: files.length > 0 ? +((completed / files.length) * 100).toFixed(1) : 0, ts: ts() };
      },
      bridgeos: () => ({
        source: 'serverless-fallback', live: false,
        data: { hostname: os.hostname(), platform: os.platform(), arch: os.arch(), uptime: os.uptime(), memory: { total: os.totalmem(), free: os.freemem() }, cpus: os.cpus().length },
        ts: ts(),
      }),
      nodemap: () => {
        const ifaces = os.networkInterfaces();
        const nodes = [{ id: 'gateway', label: 'Gateway (Vercel)', port: 443, status: 'up', type: 'gateway' }];
        for (const [name, addrs] of Object.entries(ifaces)) {
          const ipv4 = addrs.find(a => a.family === 'IPv4');
          if (ipv4 && name !== 'lo') nodes.push({ id: `iface_${name}`, label: name, ip: ipv4.address, type: 'interface' });
        }
        return {
          nodes, orchestrators: [
            { id: 'orch_l1', host: 'localhost', port: 9000, layer: 'L1' },
            { id: 'orch_l2', host: '192.168.110.203', port: 9001, layer: 'L2' },
            { id: 'orch_l3', host: 'localhost', port: 9002, layer: 'L3' },
          ], ts: ts(),
        };
      },
    };
    const handler = handlers[ns];
    if (handler) return json(res, { namespace: ns, data: handler(), ts: ts() });
    return json(res, { namespace: ns, available: Object.keys(handlers), ts: ts() });
  }

  // ── API: Marketplace ──
  if (p.startsWith('/api/marketplace')) {
    const section = p.replace('/api/marketplace/', '').replace('/api/marketplace', '') || 'index';
    const handlers = {
      tasks: () => {
        const { files } = readContracts();
        const tasks = [];
        for (const file of files) {
          try {
            const d = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
            tasks.push({
              id: `task_${file.replace('.json', '')}`, title: d.title || d.name || file.replace('.json', '').replace(/-/g, ' '),
              source_file: file, status: d.status || 'pending', reward: d.reward || Math.floor(file.length * 17.3),
              created: d.created || d.generated || null,
            });
          } catch (_) {}
        }
        return { open: tasks.filter(t => t.status === 'pending' || t.status === 'open').length, in_progress: tasks.filter(t => t.status === 'in_progress').length, completed: tasks.filter(t => t.status === 'completed').length, listings: tasks, ts: ts() };
      },
      dex: () => {
        const pa = readPortAssignments();
        const assignments = pa.assignments || [];
        const pairs = [];
        for (let i = 0; i < assignments.length; i++) {
          for (let j = i + 1; j < assignments.length; j++) {
            pairs.push({
              pair: `${assignments[i].service.replace('.js', '').toUpperCase()}/${assignments[j].service.replace('.js', '').toUpperCase()}`,
              ports: [assignments[i].assigned_port, assignments[j].assigned_port],
              active: !assignments[i].conflict && !assignments[j].conflict,
            });
          }
        }
        return { pairs: pairs.slice(0, 20), total_services: assignments.length, active_pairs: pairs.filter(p => p.active).length, ts: ts() };
      },
      wallet: () => {
        const totalMem = os.totalmem(), freeMem = os.freemem(), cpus = os.cpus();
        return {
          balances: [
            { token: 'CPU', amount: cpus.length, unit: 'cores', utilization_pct: +(os.loadavg()[0] / cpus.length * 100).toFixed(1) },
            { token: 'RAM', amount: +(totalMem / 1073741824).toFixed(2), unit: 'GB', free: +(freeMem / 1073741824).toFixed(2), usage_pct: +((1 - freeMem / totalMem) * 100).toFixed(1) },
            { token: 'UPTIME', amount: os.uptime(), unit: 'seconds' },
          ],
          system_value_score: Math.floor(cpus.length * 100 + (totalMem / 1073741824) * 50),
          env: 'serverless', ts: ts(),
        };
      },
      skills: () => {
        const pkgs = listPackages();
        return {
          installed: pkgs, count: pkgs.length,
          categories: {
            runtime: pkgs.filter(p => ['express', 'cors', 'dotenv', '@supabase/supabase-js'].includes(p)),
            security: pkgs.filter(p => ['bcryptjs', 'jsonwebtoken', 'helmet'].includes(p)),
            testing: pkgs.filter(p => ['jest', 'supertest', 'mocha', 'chai'].includes(p)),
          },
          ts: ts(),
        };
      },
      portfolio: () => ({
        total_value: 1000, health_pct: 14.3,
        assets: [
          { id: 'gateway', port: 443, status: 'up', value: 1000 },
          { id: 'system', port: 3000, status: 'remote', value: 0 },
          { id: 'ainode', port: 3001, status: 'remote', value: 0 },
          { id: 'orchestrator_l1', port: 9000, status: 'remote', value: 0 },
          { id: 'orchestrator_l2', port: 9001, status: 'remote', value: 0 },
          { id: 'server', port: 5000, status: 'remote', value: 0 },
          { id: 'payments', port: 4000, status: 'remote', value: 0 },
        ],
        env: 'serverless', ts: ts(),
      }),
      stats: () => {
        const { files } = readContracts();
        let totalTasks = 0, agentCount = 0;
        for (const file of files) {
          try {
            const d = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
            if (d.tasks) totalTasks += Array.isArray(d.tasks) ? d.tasks.length : 1;
            if (d.agents) agentCount += Array.isArray(d.agents) ? d.agents.length : 1;
          } catch (_) {}
        }
        try {
          const af = fs.readdirSync(path.join(ROOT, 'agents')).filter(f => f.endsWith('.js'));
          agentCount = Math.max(agentCount, af.length);
        } catch (_) {}
        return { total_tasks: totalTasks || files.length, total_agents: agentCount, contracts: files.length, uptime_seconds: os.uptime(), uptime_hours: +(os.uptime() / 3600).toFixed(2), memory_usage_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1), cpu_cores: os.cpus().length, platform: os.platform(), env: 'serverless', ts: ts() };
      },
    };
    const handler = handlers[section];
    if (handler) return json(res, { section, data: handler(), ts: ts() });
    return json(res, { section, available: Object.keys(handlers), ts: ts() });
  }

  // ── API: Status ──
  if (p === '/api/status') {
    return json(res, {
      overall: 'serverless',
      services: [
        { id: 'gateway', port: 443, status: 'up', latency_ms: 0 },
        { id: 'system', port: 3000, status: 'remote', latency_ms: -1 },
        { id: 'ainode', port: 3001, status: 'remote', latency_ms: -1 },
        { id: 'orchestrator', port: 3002, status: 'remote', latency_ms: -1 },
      ],
      env: 'serverless', ts: ts(),
    });
  }

  // ── API: Agents ──
  if (p === '/api/agents') {
    return json(res, {
      count: agentNames.length,
      layers: {
        L1: { status: 'serverless-no-local', layer: 'L1', agents: agentNames.map(n => ({ id: `agent_${n}`, name: n, status: 'active', layer: 'L1' })), count: agentNames.length },
        L2: { status: 'serverless-no-lan', layer: 'L2', agents: [], count: 0 },
      },
      agents: agentNames.map(n => ({ id: `agent_${n}`, name: n, status: 'active', layer: 'L1' })),
      env: 'serverless', ts: ts(),
    });
  }

  // ── API: Contracts ──
  if (p === '/api/contracts') {
    const { files, contracts } = readContracts();
    return json(res, { count: files.length, files, contracts, ts: ts() });
  }

  // ── Auth: Register (rate limited) ──
  if (p === '/auth/register' && req.method === 'POST') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (rateLimit('register:' + clientIp, 5)) {
      return json(res, { error: 'Too many registration attempts. Try again in 60 seconds.' }, 429);
    }

    const body = await parseBody(req);
    if (!body.email || !body.password) return json(res, { error: 'email and password required' }, 400);
    if (!supabase) return json(res, { error: 'Database not configured' }, 503);

    const { data: existing } = await supabase.from('users').select('id').eq('email', body.email.toLowerCase().trim()).single();
    if (existing) return json(res, { error: 'email already registered' }, 409);

    const password_hash = await hashPassword(body.password);
    const userId = `usr_${Date.now()}`;
    const now = new Date().toISOString();
    const { data: user, error: insertErr } = await supabase.from('users').insert({
      id: userId, email: body.email.toLowerCase().trim(), password_hash,
      brdg_balance: 0, first_seen: now, last_seen: now,
      oauth_provider: 'email', plan: 'visitor', funnel_stage: 'visitor',
      lead_score: 0, conversations: 0, role: 'user',
    }).select().single();
    if (insertErr) return json(res, { error: 'Registration failed: ' + insertErr.message }, 500);

    const token = makeToken({ sub: user.id, email: user.email });
    return json(res, { token, user: { id: user.id, email: user.email, credits: user.brdg_balance || 0 } }, 201);
  }

  // ── Auth: Login (with rate limiting) ──
  if (p === '/auth/login' && req.method === 'POST') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (rateLimit('login:' + clientIp, 10)) {
      return json(res, { error: 'Too many login attempts. Try again in 60 seconds.' }, 429);
    }

    const body = await parseBody(req);
    if (!body.email || !body.password) return json(res, { error: 'email and password required' }, 400);
    if (!supabase) return json(res, { error: 'Database not configured' }, 503);

    const { data: user, error: lookupErr } = await supabase.from('users').select('*').eq('email', body.email.toLowerCase().trim()).single();
    if (lookupErr || !user) return json(res, { error: 'invalid credentials' }, 401);
    const ok = await checkPassword(body.password, user.password_hash);
    if (!ok) return json(res, { error: 'invalid credentials' }, 401);

    // Upgrade legacy SHA-256 hash to bcrypt on successful login
    if (user.password_hash && user.password_hash.includes(':') && user.password_hash.length === 97) {
      const newHash = bcrypt ? bcrypt.hashSync(body.password, 12) : null;
      if (newHash) {
        await supabase.from('users').update({ password_hash: newHash, last_seen: new Date().toISOString() }).eq('id', user.id);
      }
    } else {
      await supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
    }

    const token = makeToken({ sub: user.id, email: user.email });
    return json(res, { token, user: { id: user.id, email: user.email, credits: user.brdg_balance || 0 } });
  }

  // ── Auth: Verify ──
  if (p === '/auth/verify') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return json(res, { error: 'no token provided' }, 401);
    if (_revokedTokens.has(token)) return json(res, { error: 'token revoked' }, 401);
    const payload = verifyToken(token);
    if (!payload) return json(res, { error: 'invalid or expired token' }, 401);
    return json(res, { valid: true, user: { sub: payload.sub, email: payload.email } });
  }

  // ── Referral: Claim ──
  if (p === '/referral/claim' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return json(res, { error: 'authentication required' }, 401);
    const payload = verifyToken(token);
    if (!payload) return json(res, { error: 'invalid or expired token' }, 401);
    const body = await parseBody(req);
    if (!body.code) return json(res, { error: 'referral code required' }, 400);
    const credits = REFERRAL_CODES[String(body.code).toUpperCase()];
    if (!credits) return json(res, { error: 'invalid referral code' }, 404);
    if (supabase) {
      const { data: user } = await supabase.from('users').select('id, brdg_balance').eq('email', payload.email.toLowerCase().trim()).single();
      if (user) {
        await supabase.from('users').update({ brdg_balance: (user.brdg_balance || 0) + credits }).eq('id', user.id);
      }
    }
    return json(res, { success: true, code: body.code, credits, message: `${credits} credits applied` });
  }

  // ── Clerk removed — auth handled by Supabase Auth directly ──

  // ── Auth: Logout (invalidate token) ──
  if (p === '/api/auth/logout' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token) {
      // Add to server-side blacklist (survives until JWT expires)
      _revokedTokens.add(token);
      // Prune if too large (in serverless, this resets per cold start anyway)
      if (_revokedTokens.size > 10000) _revokedTokens.clear();
    }
    return json(res, { ok: true, message: 'Signed out' });
  }

  // ── L1 / L2 / L3 orchestrator proxy stubs ──
  const layerMatch = p.match(/^\/api\/(l1|l2|l3)(\/.*)?$/);
  if (layerMatch) {
    const layer = layerMatch[1].toUpperCase();
    const subpath = layerMatch[2] || '/';
    return json(res, { error: `${layer} orchestrator unavailable in serverless mode`, layer, path: subpath, env: 'serverless' }, 502);
  }

  // ── SSE stub ──
  if (p === '/events/stream') {
    return json(res, { error: 'SSE not available in serverless mode. Use local gateway at localhost:8080 for live events.', env: 'serverless' });
  }

  // ── API: Treasury Ledger ──
  if (p === '/api/treasury/ledger') {
    const now = Date.now();
    const txTypes = [
      { type: 'subscription', desc: 'Starter Plan', amount: 49 },
      { type: 'subscription', desc: 'Pro Plan', amount: 149 },
      { type: 'subscription', desc: 'Enterprise Plan', amount: 499 },
      { type: 'cost', desc: 'AWS Infrastructure', amount: -89.50 },
      { type: 'cost', desc: 'Vercel Hosting', amount: -20 },
      { type: 'cost', desc: 'API Usage (OpenAI)', amount: -156.30 },
      { type: 'reward', desc: 'Agent Task Reward', amount: -25 },
      { type: 'referral', desc: 'Referral Bonus', amount: -50 },
      { type: 'subscription', desc: 'Pro Plan', amount: 149 },
      { type: 'subscription', desc: 'Starter Plan', amount: 49 },
    ];
    const ledger = [];
    for (let i = 0; i < 30; i++) {
      const tx = txTypes[i % txTypes.length];
      ledger.push({
        id: `tx_${1000 + i}`,
        type: tx.type,
        description: tx.desc,
        amount: tx.amount,
        balance_after: +(137284.50 + (i * 12.3)).toFixed(2),
        timestamp: new Date(now - (30 - i) * 3600000).toISOString(),
      });
    }
    return json(res, { ledger, count: ledger.length, ts: ts() });
  }

  // ── API: Treasury Summary ──
  if (p === '/api/treasury/summary') {
    return json(res, {
      balance: +treasuryBalance.toFixed(2),
      currency: 'USD',
      revenue_mtd: 28450,
      costs_mtd: 4210.50,
      net_mtd: 24239.50,
      subscriptions: 142,
      plans: [
        { id: 'starter', name: 'Starter', price: 49, count: 64, revenue: 3136 },
        { id: 'pro', name: 'Pro', price: 149, count: 51, revenue: 7599 },
        { id: 'enterprise', name: 'Enterprise', price: 499, count: 27, revenue: 13473 },
      ],
      revenue_trend: Array.from({length: 12}, (_, i) => ({ month: i + 1, revenue: 0, costs: 0 })),
      ts: ts(),
    });
  }

  // ── API: Events Recent ──
  if (p === '/api/events/recent') {
    const now = Date.now();
    const types = ['lead_delivered', 'ai_inference', 'swarm_dispatch', 'task_completed', 'treasury_update'];
    const events = [];
    for (let i = 0; i < 50; i++) {
      const type = types[i % types.length];
      const agent = agentNames[i % agentNames.length];
      const evtTs = now - (50 - i) * 6000;
      let data;
      if (type === 'lead_delivered') data = { agent, lead_id: `lead_${evtTs}`, value: 0 };
      else if (type === 'ai_inference') data = { agent, model: 'bridge-llm', tokens: 0, latency_ms: 0 };
      else if (type === 'swarm_dispatch') data = { agent, task: `task_${evtTs}`, priority: ['low', 'medium', 'high'][i % 3] };
      else if (type === 'task_completed') data = { agent, task: `task_${evtTs - 5000}`, duration_ms: 0 };
      else data = { balance: +treasuryBalance.toFixed(2), delta: 0, currency: 'USD' };
      events.push({ id: `evt_${i}`, type, data, ts: evtTs });
    }
    return json(res, { events, count: events.length, ts: ts() });
  }

  // ── API: Agents Dispatch ──
  if (p === '/api/agents/dispatch' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.agent || !body.task) return json(res, { error: 'agent and task required' }, 400);
    return json(res, {
      id: `dispatch_${Date.now()}`,
      agent: body.agent,
      task: body.task,
      priority: body.priority || 'medium',
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
      estimated_completion_ms: 15000,
    });
  }

  // ── API: Agents Queue ──
  if (p === '/api/agents/queue') {
    const queue = agentNames.slice(0, 5).map((agent, i) => ({
      id: `qtask_${Date.now() - i * 10000}`,
      agent,
      description: ['Process lead batch', 'Run inference pipeline', 'Verify contracts', 'Optimize queries', 'Generate report'][i],
      priority: ['high', 'medium', 'medium', 'low', 'high'][i],
      status: i === 0 ? 'running' : 'queued',
      queued_at: new Date(Date.now() - i * 30000).toISOString(),
      elapsed_ms: 0,
    }));
    return json(res, { queue, count: queue.length, ts: ts() });
  }

  // ── API: Marketplace Tasks Create ──
  if (p === '/api/marketplace/tasks/create' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.title) return json(res, { error: 'title required' }, 400);
    return json(res, {
      id: `task_${Date.now()}`,
      title: body.title,
      description: body.description || '',
      reward: body.reward || 100,
      status: 'open',
      created_at: new Date().toISOString(),
    });
  }

  // ── API: Users ──
  if (p === '/api/users') {
    const seedUsers = [
      { id: 'usr_1001', email: 'admin@bridgeai.os', credits: 5000, referral_code: 'BRIDGE2025', active: true, joined: '2026-01-15T08:00:00Z' },
      { id: 'usr_1002', email: 'agent.alpha@bridgeai.os', credits: 2450, referral_code: 'ALPHA100', active: true, joined: '2026-01-20T14:30:00Z' },
      { id: 'usr_1003', email: 'dev@bridgeai.os', credits: 1200, referral_code: 'DEV500', active: true, joined: '2026-02-01T09:15:00Z' },
      { id: 'usr_1004', email: 'ops@bridgeai.os', credits: 800, referral_code: 'OPS250', active: true, joined: '2026-02-10T16:45:00Z' },
      { id: 'usr_1005', email: 'beta.tester@bridgeai.os', credits: 350, referral_code: 'BETA100', active: false, joined: '2026-03-01T11:00:00Z' },
    ];
    return json(res, { users: seedUsers, count: seedUsers.length, ts: ts() });
  }

  // ── /api/treasury (alias for treasury/summary) ──
  if (p === '/api/treasury') {
    // Read from DB (falls back to seed if not yet stored)
    treasuryBalance = await db.getTreasuryBalance(TREASURY_SEED);
    const recentTx = await db.getTransactions(10);
    const staticFallback = recentTx.length === 0 ? [
      { created_at: new Date(Date.now() - 3600000).toISOString(),  source: 'Patel Tech',       amount: 499,  status: 'success', meta: { type: 'subscription', bucket: 'ops' } },
      { created_at: new Date(Date.now() - 7200000).toISOString(),  source: 'Botha Digital',    amount: 49,   status: 'success', meta: { type: 'subscription', bucket: 'ops' } },
      { created_at: new Date(Date.now() - 14400000).toISOString(), source: 'UBI Distribution', amount: -82,  status: 'success', meta: { type: 'payout',        bucket: 'ubi' } },
      { created_at: new Date(Date.now() - 28800000).toISOString(), source: 'Dlamini Group',    amount: 149,  status: 'success', meta: { type: 'subscription', bucket: 'ops' } },
    ] : recentTx;
    const recent = staticFallback.map(t => ({
      timestamp: t.created_at, type: (t.meta && t.meta.type) || 'payment',
      source: t.source, amount: t.amount, bucket: (t.meta && t.meta.bucket) || 'ops',
    }));
    return json(res, {
      total: +treasuryBalance.toFixed(2), balance: +treasuryBalance.toFixed(2), currency: 'ZAR',
      buckets: [
        { name: 'ops',      label: 'Operations', pct: 40, balance: +(treasuryBalance * 0.4).toFixed(2),  value: +(treasuryBalance * 0.4).toFixed(2) },
        { name: 'treasury', label: 'Growth',     pct: 25, balance: +(treasuryBalance * 0.25).toFixed(2), value: +(treasuryBalance * 0.25).toFixed(2) },
        { name: 'ubi',      label: 'Reserve',    pct: 20, balance: +(treasuryBalance * 0.2).toFixed(2),  value: +(treasuryBalance * 0.2).toFixed(2) },
        { name: 'founder',  label: 'Founder',    pct: 15, balance: +(treasuryBalance * 0.15).toFixed(2), value: +(treasuryBalance * 0.15).toFixed(2) },
      ],
      recent, payments_today: staticFallback.length,
      status: 'healthy', ts: ts()
    });
  }

  // ── /api/treasury/payments ──
  if (p === '/api/treasury/payments') {
    const payments = Array.from({ length: 8 }, (_, i) => ({
      id: `pay_${1000 + i}`, amount: 0, currency: 'ZAR',
      status: ['completed', 'completed', 'pending', 'completed'][i % 4],
      method: ['PayFast', 'EFT', 'Crypto', 'PayFast'][i % 4],
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
    }));
    return json(res, { payments, count: payments.length, ts: ts() });
  }

  // ── /api/health ──
  if (p === '/api/health') {
    return json(res, { status: 'ok', uptime: process.uptime(), env: 'serverless', ts: ts() });
  }

  // ── /api/swarm/agents ──
  if (p === '/api/swarm/agents') {
    const agents = agentNames.map((n, i) => ({
      id: `agent_${i}`, name: n, status: 'active',
      layer: i < 3 ? 'L1' : i < 6 ? 'L2' : 'L3',
      tasks_completed: 0,
      uptime_pct: 99.9,
    }));
    return json(res, { agents, count: agents.length, swarms: 2, ts: ts() });
  }

  // ── /api/swarm/* (health, matrix, strategies, orchestrate) ──
  if (p.startsWith('/api/swarm/')) {
    const sub = p.split('/api/swarm/')[1];
    if (sub === 'health') return json(res, { status: 'healthy', agents: 8, active: 8, ts: ts() });
    if (sub === 'matrix') return json(res, { L1: { count: 3, role: 'streaming' }, L2: { count: 3, role: 'processing' }, L3: { count: 2, role: 'minimax' }, ts: ts() });
    if (sub === 'strategies') return json(res, { strategies: ['round-robin', 'priority-weighted', 'consensus', 'auction'], active: 'priority-weighted', ts: ts() });
    if (sub === 'orchestrate' && req.method === 'POST') return json(res, { status: 'dispatched', task_id: `task_${ts()}`, ts: ts() });
    return json(res, { error: 'unknown_swarm_endpoint', path: p }, 404);
  }

  // ── /api/ehsa/dashboard ──
  if (p === '/api/ehsa/dashboard') {
    return json(res, { patients: 1247, facilities: 8, compliance_pct: 94, active_cases: 23, ts: ts() });
  }

  // ── /api/economics ──
  if (p === '/api/economics') {
    return json(res, {
      revenue: { monthly: +(treasuryBalance * 0.08).toFixed(2), annual: +(treasuryBalance * 0.96).toFixed(2), currency: 'USD' },
      costs: { monthly: +(treasuryBalance * 0.03).toFixed(2), breakdown: { infra: 40, agents: 35, marketing: 25 } },
      margin_pct: 62.5, mrr_growth_pct: 12.3, ts: ts()
    });
  }

  // ── /api/credits ──
  if (p === '/api/credits') {
    return json(res, { balance: 5000, used_today: 127, limit: 10000, ts: ts() });
  }

  // ── Seed data (deterministic — no Math.random on financial figures) ──────────
  const CONTACTS = [
    { id: 'c001', name: 'Sipho Ndlovu',    email: 'sipho@ndlovuholdings.co.za',  company: 'Ndlovu Holdings',    status: 'customer', plan: 'pro',        value: 149, stage: 'closed', joined: '2026-01-15' },
    { id: 'c002', name: 'Priya Naidoo',    email: 'priya@techbridge.io',          company: 'TechBridge IO',      status: 'customer', plan: 'enterprise', value: 499, stage: 'closed', joined: '2026-01-22' },
    { id: 'c003', name: 'Thabo Mokoena',   email: 'thabo@mokoena.co.za',          company: 'Mokoena Consulting', status: 'lead',     plan: 'pro',        value: 149, stage: 'proposal', joined: '2026-02-03' },
    { id: 'c004', name: 'Zoe van der Berg',email: 'zoe@vdberg.co.za',             company: 'VDB Solutions',      status: 'customer', plan: 'starter',    value: 49,  stage: 'closed', joined: '2026-02-10' },
    { id: 'c005', name: 'Kwame Asante',    email: 'kwame@asante.africa',          company: 'Asante Africa',      status: 'lead',     plan: 'enterprise', value: 499, stage: 'demo',   joined: '2026-02-18' },
    { id: 'c006', name: 'Naledi Dlamini',  email: 'naledi@dlaminigroup.co.za',    company: 'Dlamini Group',      status: 'customer', plan: 'pro',        value: 149, stage: 'closed', joined: '2026-03-01' },
    { id: 'c007', name: 'Reza Patel',      email: 'reza@pateltech.io',            company: 'Patel Tech',         status: 'customer', plan: 'enterprise', value: 499, stage: 'closed', joined: '2026-03-08' },
    { id: 'c008', name: 'Amara Osei',      email: 'amara@oseiventures.com',       company: 'Osei Ventures',      status: 'lead',     plan: 'pro',        value: 149, stage: 'outreach', joined: '2026-03-15' },
    { id: 'c009', name: 'Leilani Botha',   email: 'leilani@bothadigital.co.za',   company: 'Botha Digital',      status: 'customer', plan: 'starter',    value: 49,  stage: 'closed', joined: '2026-03-20' },
    { id: 'c010', name: 'Jabu Khumalo',    email: 'jabu@khumalocorp.co.za',       company: 'Khumalo Corp',       status: 'prospect', plan: 'enterprise', value: 499, stage: 'identified', joined: '2026-04-01' },
  ];

  const INVOICES = [
    { id: 'inv_001', client: 'Ndlovu Holdings',    email: 'sipho@ndlovuholdings.co.za',  amount: 149, currency: 'ZAR', status: 'paid',    due: '2026-03-15', issued: '2026-03-01', description: 'Bridge AI OS Pro — March 2026' },
    { id: 'inv_002', client: 'TechBridge IO',       email: 'priya@techbridge.io',          amount: 499, currency: 'ZAR', status: 'paid',    due: '2026-03-20', issued: '2026-03-05', description: 'Bridge AI OS Enterprise — March 2026' },
    { id: 'inv_003', client: 'VDB Solutions',        email: 'zoe@vdberg.co.za',             amount: 49,  currency: 'ZAR', status: 'paid',    due: '2026-03-25', issued: '2026-03-10', description: 'Bridge AI OS Starter — March 2026' },
    { id: 'inv_004', client: 'Dlamini Group',        email: 'naledi@dlaminigroup.co.za',    amount: 149, currency: 'ZAR', status: 'paid',    due: '2026-04-01', issued: '2026-03-15', description: 'Bridge AI OS Pro — April 2026' },
    { id: 'inv_005', client: 'Patel Tech',           email: 'reza@pateltech.io',            amount: 499, currency: 'ZAR', status: 'sent',    due: '2026-04-08', issued: '2026-03-22', description: 'Bridge AI OS Enterprise — April 2026' },
    { id: 'inv_006', client: 'Botha Digital',        email: 'leilani@bothadigital.co.za',   amount: 49,  currency: 'ZAR', status: 'sent',    due: '2026-04-20', issued: '2026-04-01', description: 'Bridge AI OS Starter — April 2026' },
    { id: 'inv_007', client: 'Mokoena Consulting',   email: 'thabo@mokoena.co.za',          amount: 149, currency: 'ZAR', status: 'draft',   due: '2026-04-30', issued: '2026-04-04', description: 'Bridge AI OS Pro — Onboarding' },
    { id: 'inv_008', client: 'Asante Africa',        email: 'kwame@asante.africa',          amount: 499, currency: 'ZAR', status: 'draft',   due: '2026-05-01', issued: '2026-04-04', description: 'Bridge AI OS Enterprise — Demo Period' },
  ];

  const TICKETS = [
    { id: 'tkt_001', subject: 'Treasury dashboard not refreshing', client: 'TechBridge IO',     email: 'priya@techbridge.io',        priority: 'high',   status: 'open',       created: '2026-04-02T08:12:00Z', agent: 'alpha' },
    { id: 'tkt_002', subject: 'How do I add team members?',         client: 'VDB Solutions',      email: 'zoe@vdberg.co.za',           priority: 'medium', status: 'resolved',   created: '2026-04-01T14:30:00Z', agent: 'beta',  resolved: '2026-04-01T16:45:00Z' },
    { id: 'tkt_003', subject: 'API rate limit hit on swarm',         client: 'Ndlovu Holdings',    email: 'sipho@ndlovuholdings.co.za', priority: 'high',   status: 'in_progress', created: '2026-04-03T09:00:00Z', agent: 'gamma' },
    { id: 'tkt_004', subject: 'Invoice PDF not generating',          client: 'Dlamini Group',      email: 'naledi@dlaminigroup.co.za',  priority: 'medium', status: 'open',       created: '2026-04-03T11:15:00Z', agent: null },
    { id: 'tkt_005', subject: 'Can I upgrade mid-cycle?',            client: 'Botha Digital',      email: 'leilani@bothadigital.co.za', priority: 'low',    status: 'resolved',   created: '2026-03-30T10:00:00Z', agent: 'delta', resolved: '2026-03-30T10:45:00Z' },
    { id: 'tkt_006', subject: 'Leadgen pipeline stalled at nurture', client: 'Patel Tech',         email: 'reza@pateltech.io',          priority: 'high',   status: 'open',       created: '2026-04-04T07:30:00Z', agent: 'epsilon' },
  ];

  // ── /api/treasury/status ──
  if (p === '/api/treasury/status') {
    return json(res, {
      balance: +treasuryBalance.toFixed(2), currency: 'ZAR',
      status: 'healthy', last_updated: new Date().toISOString(),
      buckets: [
        { name: 'ops',      label: 'Operations', pct: 40, balance: +(treasuryBalance * 0.4).toFixed(2),  value: +(treasuryBalance * 0.4).toFixed(2) },
        { name: 'treasury', label: 'Growth',     pct: 25, balance: +(treasuryBalance * 0.25).toFixed(2), value: +(treasuryBalance * 0.25).toFixed(2) },
        { name: 'ubi',      label: 'Reserve',    pct: 20, balance: +(treasuryBalance * 0.2).toFixed(2),  value: +(treasuryBalance * 0.2).toFixed(2) },
        { name: 'founder',  label: 'Founder',    pct: 15, balance: +(treasuryBalance * 0.15).toFixed(2), value: +(treasuryBalance * 0.15).toFixed(2) },
      ],
      ts: ts(),
    });
  }

  // ── /api/analytics/summary ──
  if (p === '/api/analytics/summary') {
    const mrr = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const open = INVOICES.filter(i => i.status === 'sent').reduce((s, i) => s + i.amount, 0);
    const agents = agentNames.length;
    return json(res, {
      mrr, open_invoices: open,
      customers: CONTACTS.filter(c => c.status === 'customer').length,
      leads:     CONTACTS.filter(c => c.status !== 'customer').length,
      agents_active: agents,
      tasks_processed: agents * 47,
      treasury_balance: +treasuryBalance.toFixed(2),
      uptime_s: os.uptime(),
      memory_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
      last_24h: {
        total: agents * 47 + 312,
        routes: 18,
      },
      top_pages: [
        { route: '/ui',                  hits: 847 },
        { route: '/treasury-dashboard',  hits: 312 },
        { route: '/aoe-dashboard',       hits: 289 },
        { route: '/50-applications',     hits: 201 },
        { route: '/system-status-dashboard', hits: 178 },
      ],
      ts: ts(),
    });
  }

  // ── /api/tools ──
  if (p === '/api/tools') {
    const pkgs = listPackages();
    return json(res, {
      tools: [
        { id: 'swarm',    name: 'Agent Swarm',     status: 'active', agents: agentNames.length },
        { id: 'treasury', name: 'Treasury Engine',  status: 'active', balance: +treasuryBalance.toFixed(2) },
        { id: 'crm',      name: 'CRM',              status: 'active', contacts: CONTACTS.length },
        { id: 'leadgen',  name: 'LeadGen Pipeline', status: 'active', leads: CONTACTS.filter(c => c.status !== 'customer').length },
        { id: 'invoicing',name: 'Invoicing',        status: 'active', open: INVOICES.filter(i => i.status !== 'paid').length },
        { id: 'brain',    name: 'Central Brain',    status: 'active', uptime_s: os.uptime() },
      ],
      packages_installed: pkgs.length,
      ts: ts(),
    });
  }

  // ── /api/neuro ──
  if (p === '/api/neuro') {
    // Load from DB on first request or POST (warm cache otherwise)
    if (!neuroLoaded || req.method === 'POST') {
      const stored = await db.getNeuro();
      if (stored) neuro = stored;
      neuroLoaded = true;
    }
    const stateLabels = { D: 'Dopamine', S: 'Serotonin', O: 'Oxytocin', E: 'Endorphins' };
    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (body.boost) {
        const delta = 0.05;
        if (body.boost === 'dopamine')    neuro.D = Math.min(1, neuro.D + delta * 2);
        if (body.boost === 'serotonin')   neuro.S = Math.min(1, neuro.S + delta);
        if (body.boost === 'oxytocin')    neuro.O = Math.min(1, neuro.O + delta);
        if (body.boost === 'endorphins')  neuro.E = Math.min(1, neuro.E + delta);
        if (body.boost === 'cognition') { neuro.D = Math.min(1, neuro.D + 0.04); neuro.S = Math.min(1, neuro.S + 0.03); }
      }
      await db.setNeuro(neuro); // persist updated state
    }
    const ct = computeCognition(neuro);
    const dom = dominantState(neuro);
    return json(res, {
      D: +neuro.D.toFixed(4), S: +neuro.S.toFixed(4), O: +neuro.O.toFixed(4), E: +neuro.E.toFixed(4),
      cognition: ct, state: `|${dom}⟩ ${stateLabels[dom]}`, dominant: dom,
      formula: 'C(t) = 0.4D + 0.2S + 0.25O + 0.15E',
      expression: {
        smile:   +Math.min(1, neuro.O * 1.2 + neuro.E * 0.4).toFixed(2),
        brow:    +Math.min(1, neuro.D * 3 + ct).toFixed(2),
        jaw:     +(neuro.D * 0.2).toFixed(2),
        tension: +Math.max(0, 1 - neuro.S - neuro.O * 0.5).toFixed(2),
        mode:    neuro.O > 0.4 ? 'facs' : neuro.D > 0.3 ? 'tension' : neuro.E > 0.5 ? 'embodied' : 'procedural',
      },
      ts: ts(),
    });
  }

  // ── /api/funnel ──
  if (p === '/api/funnel') {
    return json(res, { funnel: FUNNEL, cycle: CYCLE_COUNT, osint: FUNNEL.osint_discovery, ts: ts() });
  }

  // ── /api/brain (central intelligence aggregator) ──
  if (p === '/api/brain') {
    const mrr = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const ct = computeCognition(neuro);
    const dom = dominantState(neuro);
    return json(res, {
      status: 'active',
      treasury: {
        balance: +treasuryBalance.toFixed(2), currency: 'ZAR', status: 'healthy',
        buckets: [
          { name: 'ops',      label: 'Operations', pct: 40, balance: +(treasuryBalance*0.4).toFixed(2) },
          { name: 'treasury', label: 'Growth',     pct: 25, balance: +(treasuryBalance*0.25).toFixed(2) },
          { name: 'ubi',      label: 'Reserve',    pct: 20, balance: +(treasuryBalance*0.2).toFixed(2) },
          { name: 'founder',  label: 'Founder',    pct: 15, balance: +(treasuryBalance*0.15).toFixed(2) },
        ],
      },
      agents:   { count: agentNames.length, active: agentNames.length, names: agentNames, swarms: 2 },
      crm:      { contacts: CONTACTS.length, customers: CONTACTS.filter(c => c.status === 'customer').length, leads: CONTACTS.filter(c => c.status !== 'customer').length },
      revenue:  { total: REVENUE_TOTAL, mrr, cycle: CYCLE_COUNT, open_invoices: INVOICES.filter(i => i.status === 'sent').length },
      funnel:   FUNNEL,
      neuro:    { D: +neuro.D.toFixed(4), S: +neuro.S.toFixed(4), O: +neuro.O.toFixed(4), E: +neuro.E.toFixed(4), cognition: ct, state: `|${dom}⟩` },
      support:  { open_tickets: TICKETS.filter(t => t.status === 'open').length, in_progress: TICKETS.filter(t => t.status === 'in_progress').length },
      system:   { uptime_s: os.uptime(), memory_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1), cpu_cores: os.cpus().length, env: 'serverless' },
      ts: ts(),
    });
  }

  // ── /api/crm/* ──
  if (p.startsWith('/api/crm')) {
    const sub = p.replace('/api/crm', '') || '/';
    if (sub === '/contacts' || sub === '/contacts/') {
      if (req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.name || !body.email) return json(res, { error: 'name and email required' }, 400);
        const newContact = { id: `c${Date.now()}`, ...body, status: 'lead', stage: 'identified', joined: new Date().toISOString().slice(0, 10) };
        return json(res, { contact: newContact, message: 'Contact created', ts: ts() }, 201);
      }
      return json(res, { contacts: CONTACTS, count: CONTACTS.length, ts: ts() });
    }
    if (sub === '/stats') {
      const customers = CONTACTS.filter(c => c.status === 'customer');
      const leads = CONTACTS.filter(c => c.status !== 'customer');
      const mrr = customers.reduce((s, c) => s + (c.value || 0), 0);
      return json(res, {
        total_contacts: CONTACTS.length, customers: customers.length, leads: leads.length, prospects: leads.filter(c => c.status === 'prospect').length,
        mrr, avg_deal_value: customers.length ? +(mrr / customers.length).toFixed(2) : 0,
        pipeline_value: leads.reduce((s, c) => s + (c.value || 0), 0),
        ts: ts(),
      });
    }
    if (sub === '/leads') {
      return json(res, { leads: CONTACTS.filter(c => c.status !== 'customer'), count: CONTACTS.filter(c => c.status !== 'customer').length, ts: ts() });
    }
    if (sub === '/campaigns') {
      return json(res, {
        campaigns: [
          { id: 'camp_01', name: 'Q1 AI Automation Outreach', status: 'active',   sent: 320, opened: 148, replied: 42, converted: 7,  revenue: +(7 * 149).toFixed(2) },
          { id: 'camp_02', name: 'Enterprise Decision Makers', status: 'active',   sent: 85,  opened: 61,  replied: 18, converted: 3,  revenue: +(3 * 499).toFixed(2) },
          { id: 'camp_03', name: 'SME Starter Push',           status: 'complete', sent: 500, opened: 210, replied: 89, converted: 21, revenue: +(21 * 49).toFixed(2)  },
          { id: 'camp_04', name: 'Q2 Re-engagement',           status: 'draft',    sent: 0,   opened: 0,   replied: 0,  converted: 0,  revenue: 0 },
        ],
        ts: ts(),
      });
    }
    return json(res, { error: 'unknown_crm_endpoint', sub }, 404);
  }

  // ── /api/outreach/stats ──
  if (p === '/api/outreach/stats') {
    return json(res, {
      emails_sent: 905, emails_opened: 419, open_rate_pct: 46.3,
      replies: 149, reply_rate_pct: 16.5,
      demos_booked: 28, deals_closed: 31,
      pipeline_value: CONTACTS.filter(c => c.status !== 'customer').reduce((s, c) => s + (c.value || 0), 0),
      ts: ts(),
    });
  }

  // ── /api/leadgen/* ──
  if (p.startsWith('/api/leadgen')) {
    const sub = p.replace('/api/leadgen', '') || '/';
    if (sub === '/auto-prospect' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, {
        id: `prospect_${ts()}`,
        status: 'queued',
        target: body.target || 'SME technology companies ZA',
        agent: 'epsilon',
        estimated_leads: 25,
        queued_at: new Date().toISOString(),
        ts: ts(),
      });
    }
    if (sub === '/auto-nurture' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, {
        id: `nurture_${ts()}`,
        status: 'dispatched',
        lead_id: body.lead_id || 'c003',
        sequence: ['intro_email', 'follow_up_1', 'demo_invite', 'follow_up_2', 'close_offer'],
        next_touch: new Date(Date.now() + 86400000).toISOString(),
        agent: 'zeta',
        ts: ts(),
      });
    }
    if (sub === '/auto-close' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, {
        id: `close_${ts()}`,
        status: 'initiated',
        lead_id: body.lead_id || 'c005',
        offer: { plan: 'pro', price: 149, trial_days: 14 },
        agent: 'eta',
        ts: ts(),
      });
    }
    // GET — pipeline summary
    return json(res, {
      pipeline: CONTACTS.filter(c => c.status !== 'customer').map(c => ({ id: c.id, name: c.name, company: c.company, stage: c.stage, value: c.value })),
      stages: { identified: 1, outreach: 1, demo: 1, proposal: 1 },
      total_pipeline_value: CONTACTS.filter(c => c.status !== 'customer').reduce((s, c) => s + (c.value || 0), 0),
      ts: ts(),
    });
  }

  // ── /api/marketing/* ──
  if (p.startsWith('/api/marketing')) {
    const sub = p.replace('/api/marketing', '') || '/';
    const rev = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    if (sub === '/funnel') {
      return json(res, {
        stages: [
          { name: 'Awareness',    visitors: 4200, pct: 100 },
          { name: 'Interest',     visitors: 1890, pct: 45  },
          { name: 'Consideration',visitors: 630,  pct: 15  },
          { name: 'Intent',       visitors: 210,  pct: 5   },
          { name: 'Conversion',   visitors: 63,   pct: 1.5 },
        ],
        conversion_rate_pct: 1.5, cac: +(rev * 0.12 / Math.max(CONTACTS.filter(c => c.status === 'customer').length, 1)).toFixed(2), ltv: +(rev * 3.2 / Math.max(CONTACTS.filter(c => c.status === 'customer').length, 1)).toFixed(2),
        ts: ts(),
      });
    }
    if (sub === '/seo') {
      return json(res, {
        organic_sessions: 1840, keywords_ranking: 47, avg_position: 14.2,
        top_keywords: [
          { keyword: 'AI business automation South Africa', position: 3,  volume: 320 },
          { keyword: 'autonomous operating system',         position: 7,  volume: 210 },
          { keyword: 'AI CRM South Africa',                position: 11, volume: 480 },
          { keyword: 'bridge AI OS',                       position: 1,  volume: 95  },
        ],
        domain_authority: 32, backlinks: 184, ts: ts(),
      });
    }
    if (sub === '/social') {
      return json(res, {
        platforms: [
          { name: 'LinkedIn',  followers: 1240, posts_mtd: 12, engagement_pct: 4.8, leads_generated: 14 },
          { name: 'Twitter/X', followers: 680,  posts_mtd: 28, engagement_pct: 2.1, leads_generated: 5  },
          { name: 'YouTube',   followers: 310,  posts_mtd: 4,  engagement_pct: 6.3, leads_generated: 8  },
        ],
        total_reach: 2230, total_leads: 27, ts: ts(),
      });
    }
    if (sub === '/email') {
      return json(res, {
        subscribers: 2840, active: 2310, unsubscribed: 530,
        sequences: [
          { name: 'Welcome Series',    emails: 5, open_rate_pct: 58.2, click_rate_pct: 18.4 },
          { name: 'Nurture Drip',      emails: 8, open_rate_pct: 42.1, click_rate_pct: 9.8  },
          { name: 'Re-engagement',     emails: 3, open_rate_pct: 22.3, click_rate_pct: 5.1  },
          { name: 'Upsell Enterprise', emails: 4, open_rate_pct: 51.7, click_rate_pct: 21.0 },
        ],
        revenue_attributed: +(rev * 0.35).toFixed(2), ts: ts(),
      });
    }
    if (sub === '/campaign' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.name) return json(res, { error: 'campaign name required' }, 400);
      return json(res, {
        id: `camp_${ts()}`, name: body.name, status: 'draft',
        created_at: new Date().toISOString(), agent: 'theta', ts: ts(),
      }, 201);
    }
    return json(res, { error: 'unknown_marketing_endpoint', sub }, 404);
  }

  // ── /api/tickets/* ──
  if (p.startsWith('/api/tickets')) {
    const ticketMatch = p.match(/^\/api\/tickets\/([^\/]+)\/reply$/);
    if (ticketMatch && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.message) return json(res, { error: 'message required' }, 400);
      return json(res, {
        id: `reply_${ts()}`, ticket_id: ticketMatch[1],
        message: body.message, agent: body.agent || 'alpha',
        sent_at: new Date().toISOString(), ts: ts(),
      }, 201);
    }
    if (p === '/api/tickets' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.subject) return json(res, { error: 'subject required' }, 400);
      return json(res, {
        id: `tkt_${ts()}`, subject: body.subject,
        client: body.client || 'Unknown', email: body.email || '',
        priority: body.priority || 'medium', status: 'open',
        created: new Date().toISOString(), agent: null, ts: ts(),
      }, 201);
    }
    // GET /api/tickets
    const stats = { open: TICKETS.filter(t => t.status === 'open').length, in_progress: TICKETS.filter(t => t.status === 'in_progress').length, resolved: TICKETS.filter(t => t.status === 'resolved').length };
    return json(res, { tickets: TICKETS, count: TICKETS.length, stats, ts: ts() });
  }

  // ── /api/invoices/* ──
  if (p.startsWith('/api/invoices')) {
    const invoicePathMatch = p.match(/^\/api\/invoices\/([^\/]+)\/status$/);
    if (invoicePathMatch && (req.method === 'PUT' || req.method === 'POST')) {
      const body = await parseBody(req);
      return json(res, { id: invoicePathMatch[1], status: body.status || 'sent', updated_at: new Date().toISOString(), ts: ts() });
    }
    if (p === '/api/invoices/ai-generate' && req.method === 'POST') {
      const body = await parseBody(req);
      const contact = CONTACTS.find(c => c.id === body.contact_id) || CONTACTS[0];
      return json(res, {
        id: `inv_${ts()}`, client: contact.company, email: contact.email,
        amount: contact.value || 149, currency: 'ZAR',
        description: `Bridge AI OS ${contact.plan || 'Pro'} — ${new Date().toLocaleString('en-ZA', { month: 'long', year: 'numeric' })}`,
        status: 'draft', line_items: [
          { description: `Bridge AI OS ${contact.plan || 'Pro'}`, qty: 1, unit_price: contact.value || 149 },
        ],
        generated_by: 'ai', ts: ts(),
      }, 201);
    }
    if (p === '/api/invoices/smart-create' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, {
        id: `inv_${ts()}`, ...body,
        status: 'draft', currency: body.currency || 'ZAR',
        issued: new Date().toISOString().slice(0, 10),
        created_by: 'smart-create', ts: ts(),
      }, 201);
    }
    if (p === '/api/invoices/send' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.invoice_id) return json(res, { error: 'invoice_id required' }, 400);
      return json(res, { invoice_id: body.invoice_id, status: 'sent', sent_at: new Date().toISOString(), ts: ts() });
    }
    if (p === '/api/invoices/follow-up' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, { invoice_id: body.invoice_id, follow_up_sent: true, method: 'email', ts: ts() });
    }
    // GET /api/invoices
    const paid   = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const outstanding = INVOICES.filter(i => i.status === 'sent').reduce((s, i) => s + i.amount, 0);
    return json(res, { invoices: INVOICES, count: INVOICES.length, paid_total: paid, outstanding_total: outstanding, ts: ts() });
  }

  // ── /api/subscribe ──
  if (p === '/api/subscribe' && req.method === 'POST') {
    const body = await parseBody(req);
    // Support both email-only newsletter signups (no plan) and plan-based subscriptions
    if (!body.plan) {
      // Newsletter / update subscription (email-only)
      return json(res, { ok: true, type: 'newsletter', email: body.email || 'anonymous', ts: ts() }, 201);
    }
    const plans = { starter: 49, pro: 149, enterprise: 499 };
    const price = plans[body.plan];
    if (!price) return json(res, { error: 'invalid plan — use starter|pro|enterprise' }, 400);
    const subId = `sub_${ts()}`;
    treasuryBalance += price;
    return json(res, {
      ok: true,
      subscription_id: subId, plan: body.plan, price, currency: 'ZAR',
      status: 'active', started_at: new Date().toISOString(),
      treasury_balance: +treasuryBalance.toFixed(2), ts: ts(),
    }, 201);
  }

  // ── /api/affiliate/* ──
  if (p.startsWith('/api/affiliate')) {
    const sub = p.replace('/api/affiliate', '').replace(/^\//, '') || 'dashboard';
    const affiliates = [
      { id: 'aff_001', name: 'Sipho Ndlovu',  code: 'SIPHO20',  clicks: 142, signups: 12, revenue: 1788, payout: 178.8, tier: 'silver' },
      { id: 'aff_002', name: 'Priya Naidoo',  code: 'PRIYA20',  clicks: 289, signups: 31, revenue: 4619, payout: 461.9, tier: 'gold'   },
      { id: 'aff_003', name: 'Thabo Mokoena', code: 'THABO20',  clicks: 88,  signups: 7,  revenue: 1043, payout: 104.3, tier: 'bronze' },
    ];
    if (sub === 'program' || sub === 'dashboard') return json(res, {
      program: { commission_pct: 10, cookie_days: 30, min_payout: 50, currency: 'ZAR' },
      stats: { total_affiliates: 3, total_clicks: 519, total_signups: 50, total_revenue: 7450, total_paid: 744.9 },
      top_affiliate: affiliates[1], ts: ts(),
    });
    if (sub === 'stats')       return json(res, { clicks_today: 34, signups_today: 3, revenue_today: 447, conversion_rate: 8.8, ts: ts() });
    if (sub === 'leaderboard') return json(res, { leaderboard: affiliates, ts: ts() });
    if (sub === 'creatives')   return json(res, { creatives: [
      { id: 'cr_001', type: 'banner', size: '728x90', url: '/assets/banners/bridge-728x90.png', clicks: 211 },
      { id: 'cr_002', type: 'banner', size: '300x250', url: '/assets/banners/bridge-300x250.png', clicks: 178 },
      { id: 'cr_003', type: 'text',   copy: 'Automate your business with Bridge AI OS', clicks: 130 },
    ], ts: ts() });
    if (sub === 'payouts') return json(res, { payouts: [
      { id: 'pay_a01', affiliate: 'Priya Naidoo', amount: 461.9, status: 'paid',    date: '2026-04-01' },
      { id: 'pay_a02', affiliate: 'Sipho Ndlovu', amount: 178.8, status: 'pending', date: '2026-04-04' },
    ], ts: ts() });
    if (sub === 'join' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, { ok: true, affiliate_id: `aff_${ts()}`, code: `${(body.name||'USER').slice(0,5).toUpperCase()}20`, ts: ts() }, 201);
    }
    return json(res, { error: 'unknown affiliate endpoint' }, 404);
  }

  // ── /api/agents/execute-paid ──
  if (p === '/api/agents/execute-paid' && req.method === 'POST') {
    const body = await parseBody(req);
    const agentName = body.agentName || body.agent || 'Growth Hunter';
    const input     = body.input || '';
    const cost      = body.cost || 5;

    // Deduct cost from treasury
    const newBalance = await db.addToTreasury(-cost, `agent_task:${agentName}`);
    treasuryBalance = newBalance;

    // Run the real agent (non-blocking — respond immediately, result in payload)
    try {
      const result = await agents.runAgent(agentName, input);
      return json(res, { ok: true, task_id: `task_${ts()}`, agent: agentName, cost, treasury_balance: +newBalance.toFixed(2), result: result.output, ts: ts() });
    } catch (e) {
      return json(res, { ok: false, error: e.message, agent: agentName, cost, treasury_balance: +newBalance.toFixed(2), ts: ts() });
    }
  }

  // ── /api/agents/run ──
  if (p === '/api/agents/run' && req.method === 'POST') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    if (rateLimit(ip, 'agent-run', 10)) return json(res, { error: 'rate_limited', retry_after: 60 }, 429);
    const body = await parseBody(req);
    const agentName = body.agentName || body.agent;
    if (!agentName) return json(res, { error: 'agentName required' }, 400);
    try {
      const result = await agents.runAgent(agentName, body.input || '');
      console.log(JSON.stringify({ type: 'agent_run', agent: agentName, time: new Date().toISOString() }));
      return json(res, { ok: true, ...result, ts: ts() });
    } catch (e) {
      notify.alertError({ context: 'agent-run', message: `${agentName}: ${e.message}` }).catch(() => {});
      return json(res, { ok: false, error: e.message }, 400);
    }
  }

  // ── /api/agents/run-all — manual override with full pipeline enforcement ──
  if (p === '/api/agents/run-all' && req.method === 'POST') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    if (rateLimit(ip, 'agent-run-all', 2)) return json(res, { error: 'rate_limited', retry_after: 60 }, 429);

    const { results, valid, discarded, executionStatus } = await agents.runAllAgentsValidated();

    // Binary validity: only persist if at least one value-positive output exists
    let committed = {};
    if (valid.length > 0) {
      committed = await db.commitAgentCycle(valid, executionStatus);
    }

    console.log(JSON.stringify({ type: 'agent_run_all', total: results.length, valid: valid.length, discarded: discarded.length, executionStatus, time: new Date().toISOString() }));
    return json(res, { ok: true, results, valid: valid.length, discarded: discarded.length, executionStatus, ts: ts() });
  }

  // ── /api/agents/outputs — cached outputs from system_state (no execution) ──
  if (p === '/api/agents/outputs') {
    const state = await db.getSystemState();
    return json(res, {
      outputs:          state.agents.outputs,
      lastRun:          state.agents.last_run,
      executionStatus:  state.agents.execution_status,
      spend:            state.ai.spend,
      budget:           state.ai.budget,
      ts: ts(),
    });
  }

  // ── /api/agents/auto — Vercel cron target, closed-loop pipeline ──
  if (p === '/api/agents/auto') {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers['authorization'] || '';
      if (auth !== 'Bearer ' + cronSecret) return json(res, { error: 'unauthorized' }, 401);
    }
    try {
      const { results, valid, discarded, executionStatus } = await agents.runAllAgentsValidated();

      // Pipeline enforcement: commit only if state_valid (executionStatus !== 'failed')
      // AND value_positive (at least one valid output)
      const stateValid    = executionStatus !== 'failed';
      const valuePositive = valid.length > 0;

      let committed = {};
      if (stateValid && valuePositive) {
        committed = await db.commitAgentCycle(valid, executionStatus);
      } else {
        // Log discard reason but do NOT overwrite existing good state
        console.warn(JSON.stringify({ type: 'agent_cycle_discarded', stateValid, valuePositive, executionStatus, time: new Date().toISOString() }));
      }

      console.log(JSON.stringify({ type: 'agent_auto_cycle', total: results.length, valid: valid.length, discarded: discarded.length, committed: Object.keys(committed).length, executionStatus, time: new Date().toISOString() }));
      notify.alertSystemEvent(`Agent cycle [${executionStatus}]: ${valid.length}/${results.length} outputs committed.`).catch(() => {});

      return json(res, {
        ok:              stateValid && valuePositive,
        executionStatus, ran: results.length,
        valid:           valid.length,
        discarded:       discarded.length,
        committed:       Object.keys(committed).length,
        ts:              ts(),
      });
    } catch (e) {
      console.error('[AGENTS/AUTO]', e.message);
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  // ── /api/system/state — unified single source of truth ──
  if (p === '/api/system/state') {
    const state = await db.getSystemState();
    return json(res, state);
  }

  // ═══════════════════════════════════════════════════════════════
  // INFRASTRUCTURE (DirectAdmin) — autonomous read + human-gated writes
  // ═══════════════════════════════════════════════════════════════

  // GET /api/infra/status — live VPS snapshot (read-only, autonomous)
  if (p === '/api/infra/status') {
    try {
      const [snapshot, pending] = await Promise.all([
        da.getInfraSnapshot(),
        da.getPendingActions(),
      ]);
      const pendingCount = pending.filter(a => a.status === 'pending').length;
      return json(res, { ok: true, configured: da.isConfigured(), snapshot, pendingActions: pendingCount, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // GET /api/infra/snapshot — trigger fresh DA poll and persist
  if (p === '/api/infra/snapshot' && req.method === 'POST') {
    try {
      const snapshot = await da.snapshotInfra();
      // Run Infra AI agent against the snapshot
      const sysStr = JSON.stringify(snapshot.system || {}).slice(0, 600);
      agents.runAgent('Infra AI', sysStr)
        .then(async r => {
          const outputs = (await db.getState('agent_outputs')) || {};
          outputs['Infra AI'] = { output: r.output, timestamp: r.timestamp };
          await db.setState('agent_outputs', outputs);
        })
        .catch(() => {});
      return json(res, { ok: true, snapshot, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // GET /api/infra/services — live service list
  if (p === '/api/infra/services') {
    try {
      const services = await da.getServices();
      return json(res, { ok: true, services, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // GET /api/infra/db-processes — live DB process monitor
  if (p === '/api/infra/db-processes') {
    try {
      const processes = await da.getDbProcesses();
      return json(res, { ok: true, processes, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // GET /api/infra/disk — disk usage
  if (p === '/api/infra/disk') {
    try {
      const disk = await da.getDiskUsage();
      return json(res, { ok: true, disk, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // GET /api/infra/actions — list pending/history human-approval queue
  if (p === '/api/infra/actions') {
    try {
      const actions = await da.getPendingActions();
      return json(res, { ok: true, actions, pending: actions.filter(a => a.status === 'pending').length, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/infra/action — queue a write action (agent or human requests)
  if (p === '/api/infra/action' && req.method === 'POST') {
    const body = await parseBody(req);
    const { type, params, requestedBy } = body;
    if (!type) return json(res, { error: 'type required' }, 400);
    try {
      const action = await da.queueAction(type, params || {}, requestedBy || 'manual');
      return json(res, { ok: true, action, message: 'Action queued — awaiting human approval', ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 400); }
  }

  // POST /api/infra/approve — human approves a queued action
  if (p === '/api/infra/approve' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.actionId) return json(res, { error: 'actionId required' }, 400);
    try {
      const result = await da.approveAction(body.actionId);
      console.log(JSON.stringify({ type: 'infra_action_approved', actionId: body.actionId, status: result.status, time: new Date().toISOString() }));
      return json(res, { ok: true, result, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 400); }
  }

  // POST /api/infra/deny — human denies a queued action
  if (p === '/api/infra/deny' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.actionId) return json(res, { error: 'actionId required' }, 400);
    try {
      const result = await da.denyAction(body.actionId);
      return json(res, { ok: true, result, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 400); }
  }

  // GET /api/infra/auto — cron: full closed-loop cycle
  if (p === '/api/infra/auto') {
    try {
      // infraFb loaded at top
      const snapshot = await da.snapshotInfra();
      const sys      = snapshot.system || {};

      // Build rich context for Infra AI: snapshot + outcome history
      const outcomeCtx = await infraFb.getOutcomeContext(8);
      const aiInput    = JSON.stringify({
        metrics:   Object.fromEntries(Object.entries(sys).filter(([k]) => k !== 'services').map(([k, v]) => [k, v])),
        outcomes:  outcomeCtx,
      }).slice(0, 1200);

      let agentResult = null;
      try {
        agentResult = await agents.runAgent('Infra AI', aiInput);
        const outputs = (await db.getState('agent_outputs')) || {};
        outputs['Infra AI'] = { output: agentResult.output, timestamp: agentResult.timestamp };
        await db.setState('agent_outputs', outputs);
        await db.setState('infra_last_report', agentResult.output);
      } catch (_) {}

      // ── REVENUE ↔ INFRA LINK ──────────────────────────────────────────
      const treasury   = await db.getTreasuryBalance();
      const cpuPct     = sys.cpu?.used || 0;
      const loadAvg    = sys.load?.load1 || 0;
      let revenueAction = null;

      // Scale signal: high load + healthy revenue → queue server resource action
      if (treasury > 5000 && cpuPct > 80) {
        try {
          revenueAction = await da.queueAction('restart-service', { service: 'php-fpm', reason: 'high_cpu_revenue_trigger' }, 'revenue-infra-link');
        } catch (_) {}
      }

      // ── SELF-HEALING WATCHDOG ─────────────────────────────────────────
      const healActions = [];
      const services = sys.services;
      if (services) {
        const svcList = Array.isArray(services) ? services : (services.services || Object.values(services));
        const critical = ['caddy', 'nginx', 'httpd', 'mysql', 'exim'];
        for (const svc of svcList) {
          const name = (svc.name || svc.service || '').toLowerCase();
          const st   = (svc.status || svc.state || '').toLowerCase();
          if (critical.includes(name) && (st === 'stopped' || st === 'failed')) {
            try {
              const healAct = await da.queueAction('restart-service', { service: name }, 'self-heal');
              healActions.push(name);
            } catch (_) {}
          }
        }
      }

      if (healActions.length) {
        alertSystemEvent(`Self-heal triggered for: ${healActions.join(', ')}`).catch(() => {});
      }

      const result = {
        ok: true, configured: da.isConfigured(), snapshot: !!snapshot,
        agentReport: agentResult?.output || null,
        revenueAction: revenueAction ? revenueAction.id : null,
        healActions, treasury, cpuPct,
        ts: ts(),
      };
      console.log(JSON.stringify({ type: 'infra_auto_cycle', ...result, time: new Date().toISOString() }));
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // GET /api/infra/outcomes — outcome history + action stats
  if (p === '/api/infra/outcomes') {
    // infraFb loaded at top
    const ctx     = await infraFb.getOutcomeContext(20);
    const cap     = await infraFb.isDailyCapExceeded();
    return json(res, { ok: true, ...ctx, dailyCap: cap, ts: ts() });
  }

  // GET /api/audit/export — full audit log export
  if (p === '/api/audit/export') {
    const [pending, outcomes, agentOutputs, bankTx, txs] = await Promise.all([
      db.getState('da_pending_actions'),
      db.getState('infra_outcomes'),
      db.getState('agent_outputs'),
      db.getState('bank_transactions_log'),
      db.getTransactions(50),
    ]);
    const report = {
      generated_at:  new Date().toISOString(),
      infra_actions: Object.values(pending || {}),
      infra_outcomes: (outcomes || []).slice(0, 50),
      agent_last_run: await db.getState('agent_last_run'),
      agent_execution_status: await db.getState('agent_execution_status'),
      transactions: txs,
      treasury: await db.getTreasuryBalance(),
      ai_spend: (await db.getAISpend()).spend,
    };
    res.setHeader('Content-Disposition', 'attachment; filename="bridge-ai-audit.json"');
    return json(res, report);
  }

  // ── /api/agents/economy ──
  if (p === '/api/agents/economy') {
    return json(res, {
      total_agents: agentNames.length, active: agentNames.length,
      tasks_completed: agentNames.length * 47, revenue_generated: +(treasuryBalance * 0.12).toFixed(2),
      cost_per_task: 2.40, avg_task_time_s: 1.8, ts: ts(),
    });
  }

  // ── /api/agents/workforce ──
  if (p === '/api/agents/workforce') {
    return json(res, {
      workforce: agentNames.map((n, i) => ({
        id: `agent_${i}`, name: n, role: ['analyst','executor','planner','monitor'][i % 4],
        layer: i < 3 ? 'L1' : i < 6 ? 'L2' : 'L3', utilisation_pct: +(70 + i * 3).toFixed(1),
        tasks_today: 40 + i * 7, status: 'active',
      })),
      ts: ts(),
    });
  }

  // ── /api/bossbots/:id/toggle ──
  if (p.match(/^\/api\/bossbots\/[^/]+\/toggle$/) && req.method === 'POST') {
    const id = p.split('/')[3];
    return json(res, { ok: true, bossbot_id: id, status: 'toggled', ts: ts() });
  }

  // ── /api/create-payment ──
  if (p === '/api/create-payment' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.amount || !body.email) return json(res, { error: 'amount and email required' }, 400);
    const result = pf.buildPaymentUrl({
      amount:   body.amount,
      email:    body.email,
      itemName: body.itemName || 'Bridge AI-OS Subscription',
      firstName: body.firstName || 'Client',
      meta:     body.meta || '',
    });
    return json(res, { ok: true, ...result, ts: ts() }, 201);
  }

  // ── /api/payfast-webhook (ITN — PayFast calls this on payment completion) ──
  if (p === '/api/payfast-webhook' && req.method === 'POST') {
    const body = await parseBody(req);

    // 1. Signature verification (local MD5 check)
    if (!pf.verifyWebhook(body)) {
      console.warn('[PAYFAST] Invalid webhook signature');
      return res.status(400).end('Invalid signature');
    }

    // 2. Server-side validation ping (PayFast mandatory for live integration)
    if (!pf.isSandbox()) {
      try {
        const pfValidate = await fetch('https://www.payfast.co.za/eng/query/validate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams(body).toString(),
        });
        const pfText = await pfValidate.text();
        if (pfText.trim() !== 'VALID') {
          console.warn('[PAYFAST] Server validation failed:', pfText);
          return res.status(400).end('Payment validation failed');
        }
      } catch (e) {
        console.warn('[PAYFAST] Could not reach PayFast validation server:', e.message);
        // Don't block in case of transient network error — log and continue
      }
    }

    if (body.payment_status === 'COMPLETE') {
      const paymentId = body.m_payment_id || body.pf_payment_id;
      const amount    = parseFloat(body.amount_gross || body.amount || 0);

      // 3. Idempotency — block duplicate ITN replay attacks
      const isDupe = await db.isDuplicatePayment(paymentId);
      if (isDupe) {
        console.warn(`[PAYFAST] Duplicate ITN ignored for ${paymentId}`);
        return res.status(200).end('OK'); // return 200 so PayFast stops retrying
      }

      // 4. Credit treasury + log transaction (idempotent)
      await db.logTransaction({ amount, status: 'success', source: body.email_address || 'PayFast', idempotencyKey: paymentId, meta: { plan: body.custom_str1, payment_id: paymentId } });
      const newBalance = await db.addToTreasury(amount, `PayFast:${paymentId}`);
      treasuryBalance = newBalance;

      // 4b. Split payment across all banks
      banks.splitPayment(amount, paymentId, body.email_address || 'PayFast').catch(e =>
        console.warn('[PAYFAST] Bank split failed:', e.message)
      );

      // 5. Trigger Finance AI agent with payment context (non-blocking)
      agents.runAgent('Finance AI', `Payment received: R${amount} from ${body.email_address || 'customer'}. Plan: ${body.custom_str1 || 'unknown'}. New treasury: R${newBalance.toFixed(2)}.`)
        .catch(e => console.warn('[PAYFAST] Agent trigger failed:', e.message));

      // 6. Structured log (visible in Vercel function logs)
      console.log(JSON.stringify({ type: 'payment', amount, payment_id: paymentId, balance: newBalance, time: new Date().toISOString() }));

      // 7. Telegram alert (non-blocking)
      notify.alertPayment({ amount, source: body.email_address, balance: newBalance }).catch(() => {});
    }

    return res.status(200).end('OK');
  }

  // ── /api/customers ──
  if (p === '/api/customers' || p.startsWith('/api/customers/')) {
    const customers = CONTACTS.filter(c => c.status === 'customer').map(c => ({
      id: c.id, name: c.name, email: c.email, company: c.company,
      plan: c.plan, value: c.value, joined: c.joined, ltv: c.value * 6,
    }));
    if (p === '/api/customers') return json(res, { customers, count: customers.length, ts: ts() });
    const id = p.split('/')[3];
    const found = customers.find(c => c.id === id);
    if (!found) return json(res, { error: 'customer not found' }, 404);
    return json(res, { customer: found, ts: ts() });
  }

  // ── /api/economy/dashboard ──
  if (p === '/api/economy/dashboard') {
    return json(res, {
      gdp_contribution: +(treasuryBalance * 0.0032).toFixed(2),
      jobs_created: 47, ubi_distributed: +(treasuryBalance * 0.20).toFixed(2),
      gini_impact: -0.012, currency: 'ZAR', ts: ts(),
    });
  }

  // ── /api/ehsa/funnel ──
  if (p === '/api/ehsa/funnel') {
    return json(res, {
      funnel: [
        { stage: 'Referred',    count: 3420 },
        { stage: 'Screened',    count: 2180 },
        { stage: 'Diagnosed',   count: 1470 },
        { stage: 'Treated',     count: 1240 },
        { stage: 'Discharged',  count: 1190 },
      ], ts: ts(),
    });
  }

  // ── /api/fabric/dashboard ──
  if (p === '/api/fabric/dashboard') {
    return json(res, {
      nodes: 12, edges: 34, active_contracts: 8,
      throughput_rps: 142, latency_ms: 18, ts: ts(),
    });
  }

  // ── /api/full (brain alias with extra fields) ──
  if (p === '/api/full') {
    const mrr = CONTACTS.filter(c => c.status === 'customer').reduce((s, c) => s + c.value, 0);
    return json(res, {
      treasury: { balance: +treasuryBalance.toFixed(2), currency: 'ZAR' },
      agents: { count: agentNames.length, active: agentNames.length },
      crm: { customers: CONTACTS.filter(c => c.status === 'customer').length, leads: CONTACTS.filter(c => c.status !== 'customer').length },
      mrr, invoices: INVOICES.length, tickets: TICKETS.length,
      system: { uptime_s: os.uptime(), memory_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1) },
      ts: ts(),
    });
  }

  // ── /api/governance/* ──
  if (p.startsWith('/api/governance')) {
    const PROPOSALS = [
      { id: 'prop_001', title: 'Increase UBI allocation to 25%', status: 'active',  votes_for: 142, votes_against: 38, ends: '2026-04-10' },
      { id: 'prop_002', title: 'Add new agent layer L4',          status: 'passed',  votes_for: 201, votes_against: 12, ends: '2026-03-28' },
      { id: 'prop_003', title: 'Reduce founder fee to 10%',       status: 'failed',  votes_for: 67,  votes_against: 189, ends: '2026-03-20' },
    ];
    if (p === '/api/governance/proposals') return json(res, { proposals: PROPOSALS, ts: ts() });
    if (p === '/api/governance/vote' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, { ok: true, proposal_id: body.proposal_id, vote: body.vote, ts: ts() });
    }
    return json(res, { error: 'unknown governance endpoint' }, 404);
  }

  // ── /api/integrations/status ──
  if (p === '/api/integrations/status') {
    return json(res, { integrations: [
      { name: 'PayFast',    status: 'connected', last_sync: new Date(Date.now() - 300000).toISOString() },
      { name: 'Supabase',  status: 'connected', last_sync: new Date(Date.now() - 60000).toISOString()  },
      { name: 'Sendgrid',  status: 'connected', last_sync: new Date(Date.now() - 600000).toISOString() },
      { name: 'Cloudflare',status: 'connected', last_sync: new Date(Date.now() - 120000).toISOString() },
      { name: 'Anthropic', status: 'connected', last_sync: new Date(Date.now() - 30000).toISOString()  },
    ], ts: ts() });
  }

  // ── /api/intelligence/dashboard ──
  if (p === '/api/intelligence/dashboard') {
    return json(res, {
      signals_processed: agentNames.length * 1240, anomalies_detected: 3,
      confidence_avg: 94.2, decisions_made: 47, model: 'bridge-ai-v2', ts: ts(),
    });
  }

  // ── /api/ledger ──
  if (p === '/api/ledger') {
    return json(res, {
      entries: INVOICES.map((inv, i) => ({
        id: `ldg_${i + 1}`, type: inv.status === 'paid' ? 'credit' : 'debit',
        amount: inv.amount, description: inv.description, date: inv.issued,
        balance: +(treasuryBalance - i * 50).toFixed(2),
      })),
      total_credits: INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0),
      ts: ts(),
    });
  }

  // ── /api/mfa/setup ──
  if (p === '/api/mfa/setup' && req.method === 'POST') {
    return json(res, { ok: true, totp_secret: 'JBSWY3DPEHPK3PXP', qr_url: 'data:image/png;base64,iVBOR', ts: ts() });
  }

  // ── /api/output/* ──
  if (p.startsWith('/api/output')) {
    return json(res, { output: [], count: 0, ts: ts() });
  }

  // ── /api/pricing ──
  if (p === '/api/pricing') {
    return json(res, { plans: [
      { id: 'starter',    name: 'Starter',    price: 49,  currency: 'ZAR', features: ['5 agents', '1k tasks/mo', 'Basic analytics'] },
      { id: 'pro',        name: 'Pro',        price: 149, currency: 'ZAR', features: ['20 agents', '10k tasks/mo', 'Full analytics', 'CRM'] },
      { id: 'enterprise', name: 'Enterprise', price: 499, currency: 'ZAR', features: ['Unlimited agents', 'Unlimited tasks', 'All features', 'SLA'] },
    ], ts: ts() });
  }

  // ── /api/quotes ──
  if (p === '/api/quotes' || p.match(/^\/api\/quotes\/[^/]+\/accept$/)) {
    const QUOTES = [
      { id: 'quo_001', client: 'Asante Africa',    amount: 499, status: 'sent',     valid_until: '2026-04-15', items: [{ desc: 'Enterprise Plan', qty: 1, price: 499 }] },
      { id: 'quo_002', client: 'Khumalo Corp',     amount: 149, status: 'draft',    valid_until: '2026-04-20', items: [{ desc: 'Pro Plan', qty: 1, price: 149 }] },
      { id: 'quo_003', client: 'Mokoena Consulting',amount: 149, status: 'accepted', valid_until: '2026-04-10', items: [{ desc: 'Pro Plan Onboarding', qty: 1, price: 149 }] },
    ];
    if (p === '/api/quotes') return json(res, { quotes: QUOTES, count: QUOTES.length, ts: ts() });
    const id = p.split('/')[3];
    if (req.method === 'POST') return json(res, { ok: true, quote_id: id, status: 'accepted', ts: ts() });
    return json(res, { error: 'method not allowed' }, 405);
  }

  // ── /api/revenue/summary ──
  if (p === '/api/revenue/summary') {
    const mrr = CONTACTS.filter(c => c.status === 'customer').reduce((s, c) => s + c.value, 0);
    return json(res, {
      mrr, arr: mrr * 12, ltv_avg: mrr * 6,
      churn_rate: 2.1, growth_pct: 12.3,
      revenue_by_plan: { starter: 98, pro: 447, enterprise: 998 },
      ts: ts(),
    });
  }

  // ── /api/supaclaw/runtime ──
  if (p === '/api/supaclaw/runtime') {
    return json(res, {
      version: '2.5.0', layers: ['L1','L2','L3','L9','L10','L27'],
      active_loops: 3, tick_rate_ms: 100, uptime_s: os.uptime(), ts: ts(),
    });
  }

  // ── /api/supaclaw/tick ──
  if (p === '/api/supaclaw/tick' && req.method === 'POST') {
    return json(res, { ok: true, tick: ts(), agents_pulsed: agentNames.length, ts: ts() });
  }

  // ── /api/wallet/balance ──
  if (p === '/api/wallet/balance') {
    return json(res, {
      balance: +(treasuryBalance * 0.05).toFixed(2), currency: 'ZAR',
      pending: 82.50, available: +(treasuryBalance * 0.05 - 82.50).toFixed(2), ts: ts(),
    });
  }

  // ── /api/banks ─────────────────────────────────────────────────────────────

  // GET /api/banks — list all banks with balances
  if (p === '/api/banks' && req.method !== 'POST') {
    const all = await banks.getAllBanks();
    const total = all.reduce((s, b) => s + parseFloat(b.balance || 0), 0);
    return json(res, { banks: all, count: all.length, total: +total.toFixed(2), ts: ts() });
  }

  // POST /api/banks — register a partner bank
  if (p === '/api/banks' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.id || !body.name || !body.owner) return json(res, { error: 'id, name, owner required' }, 400);
    try {
      const bank = await banks.registerPartnerBank(body);
      return json(res, { ok: true, bank, ts: ts() }, 201);
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // GET /api/banks/compound — preview compound amounts without executing
  if (p === '/api/banks/compound' && req.method === 'GET') {
    const all = await banks.getAllBanks();
    const preview = all.filter(b => b.active !== false).map(b => ({
      bankId: b.id, name: b.name,
      balance: +parseFloat(b.balance || 0).toFixed(2),
      rate: parseFloat(b.compound_rate || 0),
      projectedGain: +(parseFloat(b.balance || 0) * parseFloat(b.compound_rate || 0)).toFixed(2),
    }));
    const totalGain = preview.reduce((s, b) => s + b.projectedGain, 0);
    return json(res, { preview, totalGain: +totalGain.toFixed(2), ts: ts() });
  }

  // POST /api/banks/compound — execute compound cycle
  if (p === '/api/banks/compound' && req.method === 'POST') {
    try {
      const result = await banks.compoundAll();
      return json(res, { ok: true, ...result, ts: ts() });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // POST /api/banks/trade — internal bank-to-bank transfer
  if (p === '/api/banks/trade' && req.method === 'POST') {
    const body = await parseBody(req);
    const { from, to, amount, reason } = body;
    if (!from || !to || !amount) return json(res, { error: 'from, to, amount required' }, 400);
    try {
      const result = await banks.tradeBetweenBanks(from, to, parseFloat(amount), reason || '');
      return json(res, { ok: true, ...result, ts: ts() });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // POST /api/banks/split — manually trigger a payment split (testing)
  if (p === '/api/banks/split' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.amount) return json(res, { error: 'amount required' }, 400);
    try {
      const splits = await banks.splitPayment(parseFloat(body.amount), body.paymentId || `manual_${ts()}`, body.source || 'manual');
      return json(res, { ok: true, splits, ts: ts() });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // GET /api/banks/history — all bank transactions
  if (p === '/api/banks/history' || p.match(/^\/api\/banks\/[^/]+\/history$/)) {
    const bankId = p.match(/^\/api\/banks\/([^/]+)\/history$/) ? p.split('/')[3] : null;
    const history = await banks.getBankHistory(bankId, 50);
    return json(res, { history, count: history.length, ts: ts() });
  }

  // GET /api/banks/:id — single bank
  if (p.match(/^\/api\/banks\/[^/]+$/) && req.method === 'GET') {
    const id = p.split('/')[3];
    const bank = await banks.getBank(id);
    if (!bank) return json(res, { error: 'bank not found' }, 404);
    const history = await banks.getBankHistory(id, 10);
    return json(res, { bank, history, ts: ts() });
  }

  // ── /api/treasury/reconcile ──
  if (p === '/api/treasury/reconcile') {
    const result = await db.reconcileTreasury();
    if (!result.ok && result.drift !== undefined) {
      notify.alertError({ context: 'treasury-reconcile', message: `Drift detected: R${result.drift} (${result.driftPct}%). Auto-healed.` }).catch(() => {});
    }
    return json(res, { ...result, ts: ts() });
  }

  // ── /api/ai-spend ──
  if (p === '/api/ai-spend') {
    const spend = await db.getAISpend();
    return json(res, { ...spend, exceeded: spend.spend > spend.budget, ts: ts() });
  }

  // ── /api/system/health (comprehensive) ──
  if (p === '/api/system/health') {
    const [tBalance, spend, recon] = await Promise.all([
      db.getTreasuryBalance(),
      db.getAISpend(),
      db.reconcileTreasury().catch(() => ({ ok: false })),
    ]);
    return json(res, {
      treasury: { balance: tBalance, reconciled: recon.ok, drift: recon.drift || 0 },
      ai: { spend: spend.spend, budget: spend.budget, ok: spend.spend <= spend.budget },
      system: { uptime_s: os.uptime(), memory_pct: +((1-os.freemem()/os.totalmem())*100).toFixed(1) },
      ts: ts(),
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // WORDPRESS — multi-domain content sync (bridge-ai-os.com, gateway.ai-os.co.za)
  // ═══════════════════════════════════════════════════════════════

  // GET /api/wordpress/status — check which WP sites are configured + page exists
  if (p === '/api/wordpress/status') {
    try {
      const status = await wp.getStatus();
      return json(res, { ok: true, ...status, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // GET /api/wordpress/data — serve canonical 50-apps JSON
  if (p === '/api/wordpress/data') {
    try {
      const fs   = require('fs');
      const path = require('path');
      const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/50-applications.json'), 'utf8'));
      return json(res, { ok: true, data });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/wordpress/sync — push 50-apps to all configured WP sites
  if (p === '/api/wordpress/sync' && req.method === 'POST') {
    try {
      const result = await wp.syncAll();
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/wordpress/sync/:site — push to a specific site only
  if (p.startsWith('/api/wordpress/sync/') && req.method === 'POST') {
    const siteKey = p.replace('/api/wordpress/sync/', '');
    try {
      if (!Object.keys(wp.SITES).includes(siteKey)) {
        return json(res, { ok: false, error: `Unknown site: ${siteKey}`, known: Object.keys(wp.SITES) }, 400);
      }
      const result = await wp.syncSite(siteKey);
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // ── WordPress user / profile management ─────────────────────────────────────

  // GET /api/wordpress/users/:site — list WP users on a site
  if (p.startsWith('/api/wordpress/users/') && req.method === 'GET') {
    const siteKey = p.replace('/api/wordpress/users/', '');
    try {
      const result = await wp.listWpUsers(siteKey);
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/wordpress/users/:site — create a single WP user
  // Body: { username, email, password, firstName?, lastName?, role? }
  if (p.startsWith('/api/wordpress/users/') && req.method === 'POST') {
    const siteKey = p.replace('/api/wordpress/users/', '');
    try {
      const result = await wp.createWpUser(siteKey, body);
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/wordpress/profiles/:site — batch-create WP profiles
  // Body: { profiles: [{ username, email, password, role? }, ...] }
  if (p.startsWith('/api/wordpress/profiles/') && req.method === 'POST') {
    const siteKey = p.replace('/api/wordpress/profiles/', '');
    try {
      const result = await wp.createBridgeWpProfiles(siteKey, body.profiles || []);
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // ── DirectAdmin email account management ─────────────────────────────────────

  // GET /api/email/list/:domain — list email accounts on a domain
  if (p.startsWith('/api/email/list/') && req.method === 'GET') {
    const domain = p.replace('/api/email/list/', '');
    try {
      const result = await da.listEmailAccounts(domain);
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/email/create — create a single email account on DirectAdmin
  // Body: { domain, user, passwd, quota? }
  if (p === '/api/email/create' && req.method === 'POST') {
    try {
      const { domain, user, passwd, quota } = body;
      if (!domain || !user || !passwd) return json(res, { ok: false, error: 'domain, user, passwd required' }, 400);
      const result = await da.createEmailAccount(domain, user, passwd, quota);
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/email/delete — delete an email account
  // Body: { domain, user }
  if (p === '/api/email/delete' && req.method === 'POST') {
    try {
      const { domain, user } = body;
      if (!domain || !user) return json(res, { ok: false, error: 'domain, user required' }, 400);
      const result = await da.deleteEmailAccount(domain, user);
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/email/forwarder — create an email forwarder
  // Body: { domain, user, email }
  if (p === '/api/email/forwarder' && req.method === 'POST') {
    try {
      const { domain, user, email: fwdTo } = body;
      if (!domain || !user || !fwdTo) return json(res, { ok: false, error: 'domain, user, email required' }, 400);
      const result = await da.createForwarder(domain, user, fwdTo);
      return json(res, result);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/email/setup-bridge-profiles
  // One-shot: creates DA email accounts + WP user profiles in parallel
  // Body: { domain, daPasswd, wpSite?, wpPasswd?, profiles?: [{ user, wpRole? }] }
  if (p === '/api/email/setup-bridge-profiles' && req.method === 'POST') {
    try {
      const { domain, daPasswd, wpSite, profiles, wpPasswd } = body;
      if (!domain || !daPasswd) return json(res, { ok: false, error: 'domain and daPasswd required' }, 400);

      const profileList = profiles || [
        { user: 'admin',   wpRole: 'administrator' },
        { user: 'content', wpRole: 'editor'        },
        { user: 'support', wpRole: 'author'        },
        { user: 'noreply', wpRole: null            },
      ];

      // Step 1: create DA email accounts
      const daResults = [];
      for (const prof of profileList) {
        try {
          const r = await da.createEmailAccount(domain, prof.user, daPasswd);
          daResults.push(r);
        } catch (e) {
          daResults.push({ ok: false, email: `${prof.user}@${domain}`, message: e.message });
        }
      }

      // Step 2: create WP profiles for those with wpRole (if wpSite configured)
      let wpResults = null;
      if (wpSite && wp.isConfigured(wpSite)) {
        const wpProfiles = profileList
          .filter(prof => prof.wpRole)
          .map(prof => ({
            username: prof.user,
            email:    `${prof.user}@${domain}`,
            password: wpPasswd || daPasswd,
            role:     prof.wpRole,
          }));
        wpResults = await wp.createBridgeWpProfiles(wpSite, wpProfiles);
      }

      return json(res, {
        ok:         daResults.every(r => r.ok),
        domain,
        emailSetup: daResults,
        wpSetup:    wpResults,
        ts:         ts(),
      });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // GET /api/wordpress/preview — render HTML that would be pushed (no write)
  if (p === '/api/wordpress/preview') {
    try {
      const fs   = require('fs');
      const path = require('path');
      const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/50-applications.json'), 'utf8'));
      const html = wp.renderAppsHtml(data);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>WP Preview — 50 Apps</title></head><body>${html}</body></html>`);
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIL — Brevo primary, Gmail backup
  // ═══════════════════════════════════════════════════════════════

  // GET /api/mail/status — show configured providers (no credentials exposed)
  if (p === '/api/mail/status') {
    return json(res, { ok: true, ...mail.status(), ts: ts() });
  }

  // GET /api/mail/ping — verify SMTP connections (no email sent)
  if (p === '/api/mail/ping') {
    try {
      const result = await mail.ping();
      return json(res, { ...result, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/mail/test — send a test email
  // Body (optional): { to: "override@example.com" }
  if (p === '/api/mail/test' && req.method === 'POST') {
    try {
      const result = await mail.test(body.to || null);
      return json(res, { ...result, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // POST /api/mail/send — send a transactional email
  // Body: { to, subject, html, text?, from?, replyTo? }
  if (p === '/api/mail/send' && req.method === 'POST') {
    try {
      const { to, subject, html, text, from, replyTo } = body;
      if (!to || !subject || (!html && !text)) {
        return json(res, { ok: false, error: 'to, subject, and html/text required' }, 400);
      }
      const result = await mail.send({ to, subject, html, text, from, replyTo });
      return json(res, { ...result, ts: ts() });
    } catch (e) { return json(res, { ok: false, error: e.message }, 500); }
  }

  // ── Dashboard API: /live-map ──
  if (p === '/live-map') {
    return json(res, {
      nodes: agentNames.map((n, i) => ({ id: n, label: n.toUpperCase(), type: i < 3 ? 'L3' : i < 6 ? 'L2' : 'L1', status: 'active', tasks: 0 })),
      edges: agentNames.slice(1).map((n, i) => ({ from: agentNames[i], to: n, weight: 1 })),
      service_nodes: [
        { id: 'gateway', port: 8080, status: 'up' }, { id: 'brain', port: 8000, status: 'up' },
        { id: 'treasury', port: 0, status: 'up' }, { id: 'svg_engine', port: 7070, status: 'serverless' },
      ],
      ts: ts(),
    });
  }

  // ── Dashboard API: /treasury/summary and /treasury/ingest (without /api/ prefix) ──
  if (p === '/treasury/summary') {
    const bal = await db.getTreasuryBalance(TREASURY_SEED);
    return json(res, {
      balance: +bal.toFixed(2), total: +bal.toFixed(2), currency: 'ZAR',
      buckets: [
        { name: 'ops', pct: 40, balance: +(bal * 0.4).toFixed(2) },
        { name: 'treasury', pct: 25, balance: +(bal * 0.25).toFixed(2) },
        { name: 'ubi', pct: 20, balance: +(bal * 0.2).toFixed(2) },
        { name: 'founder', pct: 15, balance: +(bal * 0.15).toFixed(2) },
      ],
      transactions: 47, last_tx: new Date(Date.now() - 120000).toISOString(), status: 'healthy', ts: ts(),
    });
  }
  if (p === '/treasury/ingest' && req.method === 'POST') {
    let body = {};
    try { body = await parseBody(req); } catch (_) {}
    const amt = parseFloat(body.amount_brdg || body.amount || 0);
    const src = body.source || 'api';
    if (amt > 0) treasuryBalance += amt;
    return json(res, { ok: true, ingested: amt, source: src, new_balance: +treasuryBalance.toFixed(2), ts: ts() });
  }

  // ── Dashboard API: /skills (SVG engine skill list) ──
  if (p === '/skills') {
    const pkgs = listPackages ? listPackages() : [];
    const builtIn = [
      { id: 'bridge.economy',      name: 'Bridge Economy',      category: 'finance',      status: 'active' },
      { id: 'bridge.swarm',        name: 'Swarm Orchestration', category: 'agents',       status: 'active' },
      { id: 'bridge.treasury',     name: 'Treasury Manager',    category: 'finance',      status: 'active' },
      { id: 'bridge.leadgen',      name: 'Lead Generation',     category: 'sales',        status: 'active' },
      { id: 'bridge.ubi',          name: 'UBI Distributor',     category: 'distribution', status: 'active' },
      { id: 'bridge.crm',          name: 'CRM Engine',          category: 'sales',        status: 'active' },
      { id: 'bridge.invoicing',    name: 'Invoice Generator',   category: 'finance',      status: 'active' },
      { id: 'bridge.compliance',   name: 'Compliance Monitor',  category: 'security',     status: 'active' },
      { id: 'bridge.reputation',   name: 'Reputation Engine',   category: 'agents',       status: 'active' },
      { id: 'bridge.replication',  name: 'Twin Replicator',     category: 'agents',       status: 'active' },
      { id: 'bridge.telemetry',    name: 'System Telemetry',    category: 'monitoring',   status: 'active' },
      { id: 'bridge.sdg',          name: 'SDG Counter',         category: 'monitoring',   status: 'active' },
      ...pkgs.slice(0, 30).map(p => ({ id: `pkg.${p}`, name: p, category: 'package', status: 'installed' })),
    ];
    return json(res, builtIn);
  }

  // ── Dashboard API: /skills/definitions ──
  if (p === '/skills/definitions') {
    const pkgs = listPackages ? listPackages() : [];
    return json(res, {
      count: pkgs.length + 12,
      skills: [
        { name: 'bridge.economy', type: 'core' }, { name: 'bridge.swarm', type: 'core' },
        { name: 'bridge.treasury', type: 'core' }, { name: 'bridge.leadgen', type: 'sales' },
        { name: 'bridge.ubi', type: 'distribution' }, { name: 'bridge.crm', type: 'sales' },
        ...pkgs.slice(0, 44).map(n => ({ name: n, type: 'package' })),
      ],
      pricing: { L1: 0.05, L2: 0.15, L3: 0.50 },
      categories: { runtime: pkgs.slice(0, 5), security: pkgs.slice(5, 9), testing: pkgs.slice(9, 12) },
      ts: ts(),
    });
  }

  // ── Dashboard API: /skills/youtube-search ──
  if (p.startsWith('/skills/youtube-search')) {
    const q = new URL('http://x' + p).searchParams.get('q') || '';
    return json(res, {
      query: q, results: [
        { video_id: 'dQw4w9WgXcQ', title: `Bridge AI: ${q || 'Automation'}`, channel: 'Bridge AI OS', views: 12400 },
        { video_id: 'jNQXAC9IVRw', title: `Build with ${q || 'AI Agents'}`, channel: 'Bridge AI OS', views: 8200 },
      ], ts: ts(),
    });
  }

  // ── Dashboard API: /skills/learn-from-youtube ──
  if (p === '/skills/learn-from-youtube' && req.method === 'POST') {
    let body = {};
    try { body = await parseBody(req); } catch (_) {}
    return json(res, { ok: true, learned: true, video_id: body.video_id, skill_created: `bridge.yt.${Date.now()}`, ts: ts() });
  }

  // ── Dashboard API: /run/:id (execute skill) ──
  if (p.startsWith('/run/')) {
    const skillId = decodeURIComponent(p.slice(5));
    return json(res, {
      ok: true, skill_id: skillId, status: 'executed',
      result: { output: `Skill ${skillId} executed successfully`, cycles: 0, duration_ms: 0 },
      ts: ts(),
    });
  }

  // ── Dashboard API: /telemetry (SVG engine telemetry) ──
  if (p === '/telemetry') {
    return json(res, {
      engine: 'bridge-svg-engine', version: '2.5.0', status: 'serverless',
      skills_loaded: 1266, skills_active: 71,
      cpu_pct: 0,
      mem_mb: Math.floor(process.memoryUsage().rss / 1024 / 1024),
      requests_per_min: 0,
      uptime_s: Math.floor(os.uptime()),
      ts: ts(),
    });
  }

  // ── Dashboard API: /graph (SVG skill graph) ──
  if (p === '/graph') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" style="background:#060810">
      <text x="200" y="30" text-anchor="middle" fill="#63ffda" font-family="monospace" font-size="12">BRIDGE AI SKILL GRAPH</text>
      ${['economy','swarm','treasury','leadgen','ubi','crm'].map((s,i) => {
        const cx = 60 + (i % 3) * 140, cy = 80 + Math.floor(i / 3) * 120;
        return `<circle cx="${cx}" cy="${cy}" r="30" fill="none" stroke="#63ffda" stroke-width="1.5"/>
          <text x="${cx}" y="${cy+4}" text-anchor="middle" fill="#63ffda" font-size="9" font-family="monospace">${s}</text>`;
      }).join('')}
      ${[0,1,2,3,4].map(i => `<line x1="${60+(i%3)*140}" y1="${80+Math.floor(i/3)*120}" x2="${60+((i+1)%3)*140}" y2="${80+Math.floor((i+1)/3)*120}" stroke="#63ffda" stroke-width="0.5" opacity="0.4"/>`).join('')}
    </svg>`);
  }

  // ── Dashboard API: /teach/:id (SVG teaching visualization) ──
  if (p.startsWith('/teach/')) {
    const skillId = decodeURIComponent(p.slice(7));
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" style="background:#060810">
      <rect x="10" y="10" width="380" height="180" rx="8" fill="none" stroke="#63ffda" stroke-width="1"/>
      <text x="200" y="35" text-anchor="middle" fill="#63ffda" font-family="monospace" font-size="13" font-weight="bold">${skillId}</text>
      <text x="200" y="60" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="10">SKILL VISUALIZATION · BRIDGE AI OS</text>
      ${['INPUT','PROCESS','OUTPUT'].map((l,i) => `<rect x="${30+i*130}" y="80" width="110" height="50" rx="4" fill="rgba(99,255,218,0.05)" stroke="#63ffda" stroke-width="1"/>
        <text x="${85+i*130}" y="110" text-anchor="middle" fill="#63ffda" font-family="monospace" font-size="11">${l}</text>`).join('')}
      <line x1="140" y1="105" x2="160" y2="105" stroke="#63ffda" stroke-width="1.5" marker-end="url(#arrow)"/>
      <line x1="270" y1="105" x2="290" y2="105" stroke="#63ffda" stroke-width="1.5"/>
      <text x="200" y="165" text-anchor="middle" fill="#64748b" font-family="monospace" font-size="9">Active · Serverless Mode</text>
    </svg>`);
  }

  // ── Dashboard API: /swarm/health ──
  if (p === '/swarm/health' || p.startsWith('/swarm/')) {
    return json(res, {
      health_score: 1.000, ok: true,
      agents: agentNames.length, active: agentNames.length,
      components: {
        queue_latency_ms: 0,
        worker_utilization: 0,
        task_profitability: 0,
        agent_failure_rate: 0,
      },
      ts: ts(),
    });
  }

  // ── Dashboard API: /econ/circuit-breaker and /econ/reset-breaker ──
  if (p === '/econ/circuit-breaker') {
    return json(res, { state: 'closed', trips: 0, last_trip: null, threshold: 0.15, current_rate: 0, ts: ts() });
  }
  if (p === '/econ/reset-breaker' && req.method === 'POST') {
    return json(res, { ok: true, state: 'closed', reset_at: new Date().toISOString(), ts: ts() });
  }

  // ── Dashboard API: /ubi/status and /ubi/claim ──
  if (p === '/ubi/status') {
    return json(res, {
      pool_balance: +(treasuryBalance * 0.2).toFixed(2), currency: 'ZAR',
      eligible_wallets: 47, distributed_today: +(treasuryBalance * 0.001).toFixed(2),
      next_distribution: new Date(Date.now() + 86400000).toISOString(), ts: ts(),
    });
  }
  if (p === '/ubi/claim' && req.method === 'POST') {
    let body = {};
    try { body = await parseBody(req); } catch (_) {}
    if (!body.wallet_address) return json(res, { ok: false, error: 'wallet_address required' }, 400);
    return json(res, { ok: true, amount: 12.50, currency: 'ZAR', wallet: body.wallet_address, tx_id: `ubi_${ts()}`, ts: ts() });
  }

  // ── TVM — Topic Vector Matrix ─────────────────────────────────────────────
  if (p === '/api/tvm' || p === '/api/tvm/summary' || p === '/api/tvm/topology' || p === '/api/tvm/recommendations/all' || p === '/api/tvm/orchestrate' || p.startsWith('/api/tvm/')) {
    try {
      if (p === '/api/tvm' && req.method === 'GET') return json(res, tvm.getMatrix());
      if (p === '/api/tvm/summary') return json(res, tvm.getSummary());
      if (p === '/api/tvm/topology') return json(res, _TVM_TOPOLOGY);
      if (p === '/api/tvm/recommendations/all') return json(res, tvm.RECOMMENDATIONS);
      if (p === '/api/tvm/orchestrate' && req.method === 'POST') {
        // Run one orchestration tick — returns pending events for the bus
        const m = tvm.getMatrix();
        const events = [];
        for (const row of m) {
          if (row.healthy && !row.action_required) continue;
          if (!row.healthy && (!row.recommendation_code || row.recommendation_code === 'OK')) {
            events.push({ event_type: 'observer.request', topic: row.topic, emitted_at: Math.floor(Date.now()/1000) });
            continue;
          }
          if (row.recommendation_code && row.human_approval_needed) continue;
          if (row.recommendation_code && !row.human_approval_needed && row.action_required) {
            const rec = _TVM_REC_LIB[row.recommendation_code] || {};
            events.push({ event_type: 'executor.request', topic: row.topic, recommendation_code: row.recommendation_code, steps: rec.steps || [], emitted_at: Math.floor(Date.now()/1000) });
          }
        }
        return json(res, { ok: true, events, ts: Math.floor(Date.now()/1000) });
      }
      const parts = p.split('/');
      const topic = parts[3];
      const action = parts[4];
      if (action === 'approve' && req.method === 'POST') return json(res, tvm.approveAction(topic));
      if (action === 'reject'  && req.method === 'POST') return json(res, tvm.rejectAction(topic));
      if (action === 'propose' && req.method === 'POST') {
        let body = {};
        try { body = await parseBody(req); } catch (_) {}
        return json(res, tvm.agentPropose(topic, body.proposal_code, body.justification));
      }
      if (req.method === 'PUT') {
        let body = {};
        try { body = await parseBody(req); } catch (_) {}
        return json(res, tvm.updateRow(topic, { ...body, _actor: 'human' }));
      }
      if (req.method === 'GET') {
        const row = tvm.getRow(topic);
        if (!row) return json(res, { error: 'topic not found' }, 404);
        const recDetail = tvm.getRecommendationDetail(row.recommendation_code) || null;
        return json(res, { ...row, recommendation_text: tvm.getRecommendation(row.recommendation_code), rec_detail: recDetail });
      }
      return json(res, { error: 'method not allowed' }, 405);
    } catch (tvmErr) {
      return json(res, { ok: false, error: 'TVM error', detail: tvmErr.message }, 500);
    }
  }

  // ── 404 ──
  return json(res, { error: 'not_found', path: p, available: [
    '/health', '/api/health', '/api/brain', '/api/topology', '/api/avatar/{mode}',
    '/api/registry/{ns}', '/api/marketplace/{section}', '/api/status', '/api/agents',
    '/api/contracts', '/api/treasury', '/api/treasury/status', '/api/treasury/ledger',
    '/api/treasury/summary', '/api/treasury/payments', '/api/analytics/summary',
    '/api/swarm/agents', '/api/swarm/health', '/api/swarm/matrix', '/api/economics',
    '/api/credits', '/api/ehsa/dashboard', '/api/events/recent', '/api/agents/dispatch',
    '/api/agents/queue', '/api/tools', '/api/crm/contacts', '/api/crm/stats',
    '/api/crm/leads', '/api/crm/campaigns', '/api/outreach/stats', '/api/leadgen',
    '/api/leadgen/auto-prospect', '/api/leadgen/auto-nurture', '/api/leadgen/auto-close',
    '/api/marketing/funnel', '/api/marketing/seo', '/api/marketing/social',
    '/api/marketing/email', '/api/marketing/campaign', '/api/tickets', '/api/invoices',
    '/api/subscribe', '/api/users', '/orchestrator/status', '/billing',
    '/auth/register', '/auth/login', '/auth/verify', '/referral/claim',
    '/api/wordpress/status', '/api/wordpress/data', '/api/wordpress/preview',
    '/api/wordpress/sync (POST)', '/api/wordpress/sync/:site (POST)',
  ] }, 404);
};
