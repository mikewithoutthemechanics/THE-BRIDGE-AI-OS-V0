/**
 * BRIDGE SVG SKILL RENDERER — Serverless Edition (CommonJS)
 *
 * Self-contained port of:
 *   renderer/primitives.js  +  skills/bridge.*.skill.js
 *
 * No external deps. Require once; call renderSkill(id, input).
 */
'use strict';

// ── THEME ───────────────────────────────────────────────────────────────────
const T = {
  bg:     '#060810', bg2: '#0a0e17', bg3: '#111827',
  cyan:   '#63ffda', blue: '#38bdf8', purple: '#a78bfa',
  pink:   '#f472b6', orange: '#fb923c', green: '#4ade80',
  muted:  '#64748b', dim: '#475569', gold: '#facc15',
  red:    '#ef4444', border: 'rgba(99,255,218,0.18)',
  font:   'JetBrains Mono, monospace',
};

// ── PRIMITIVES ───────────────────────────────────────────────────────────────
function glowDef(id, color = T.cyan) {
  return `<defs>
    <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <linearGradient id="grad-${id}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="${color}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.2"/>
    </linearGradient>
  </defs>`;
}

function node(x, y, w, h, lbl, meta = '', color = T.cyan, rx = 8) {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${T.bg2}" stroke="${color}" stroke-width="1.5"/>
    <text x="${x+w/2}" y="${y+h/2-6}" text-anchor="middle" fill="${color}" font-family="${T.font}" font-size="11" font-weight="500">${lbl}</text>
    <text x="${x+w/2}" y="${y+h/2+10}" text-anchor="middle" fill="${T.muted}" font-family="${T.font}" font-size="9">${meta}</text>
  </g>`;
}

function edge(x1, y1, x2, y2, color = T.cyan, dashed = false) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" stroke-opacity="0.6" ${dashed ? 'stroke-dasharray="6,3"' : ''}/>`;
}

function curve(x1, y1, x2, y2, color = T.cyan) {
  const mx = (x1+x2)/2;
  return `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="0.5"/>`;
}

function arrow(x, y, color = T.cyan, size = 7) {
  return `<polygon points="${x},${y} ${x-size},${y-size/2} ${x-size},${y+size/2}" fill="${color}" opacity="0.8"/>`;
}

function pulse(cx, cy, r, color = T.cyan, dur = '2s') {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="2">
    <animate attributeName="r" values="${r};${r*2};${r}" dur="${dur}" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.8;0;0.8" dur="${dur}" repeatCount="indefinite"/>
  </circle>`;
}

function signalDot(pathD, dur = '3s', color = T.cyan, r = 5) {
  const pid = 'sp' + color.replace('#','');
  return `<path id="${pid}" d="${pathD}" fill="none" stroke="none"/>
  <circle r="${r}" fill="${color}" opacity="0.9">
    <animateMotion dur="${dur}" repeatCount="indefinite" calcMode="linear"><mpath href="#${pid}"/></animateMotion>
  </circle>`;
}

function ticker(x, y, value, unit, color = T.cyan) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${T.font}" font-size="20" font-weight="700">${value}<tspan fill="${T.muted}" font-size="11"> ${unit}</tspan></text>`;
}

function badge(x, y, text, color = T.cyan) {
  const w = text.length * 7 + 14;
  return `<g>
    <rect x="${x}" y="${y-12}" width="${w}" height="18" rx="9" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1"/>
    <text x="${x+w/2}" y="${y+1}" text-anchor="middle" fill="${color}" font-family="${T.font}" font-size="9">${text}</text>
  </g>`;
}

function progressBar(x, y, w, h, pct, color = T.cyan) {
  const fw = Math.round(w * Math.min(1, Math.max(0, pct)));
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2}" fill="${T.bg3}"/>
    <rect x="${x}" y="${y}" width="${fw}" height="${h}" rx="${h/2}" fill="${color}" opacity="0.8">
      <animate attributeName="width" from="0" to="${fw}" dur="1s" fill="freeze"/>
    </rect>
  </g>`;
}

function gauge(cx, cy, r, pct, lbl, color = T.cyan) {
  pct = Math.min(1, Math.max(0, pct));
  const sa = -Math.PI * 0.75, ea = sa + Math.PI * 1.5 * pct;
  const arc = (a1, a2) => {
    const x1 = cx + r*Math.cos(a1), y1 = cy + r*Math.sin(a1);
    const x2 = cx + r*Math.cos(a2), y2 = cy + r*Math.sin(a2);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  return `<g>
    <path d="${arc(-Math.PI*0.75, Math.PI*0.75)}" fill="none" stroke="${T.bg3}" stroke-width="8"/>
    <path d="${arc(sa, ea)}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
    <text x="${cx}" y="${cy+4}" text-anchor="middle" fill="${color}" font-family="${T.font}" font-size="14" font-weight="700">${Math.round(pct*100)}%</text>
    <text x="${cx}" y="${cy+20}" text-anchor="middle" fill="${T.muted}" font-family="${T.font}" font-size="9">${lbl}</text>
  </g>`;
}

function panel(W, H, content, title = '') {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${T.bg}" rx="12"/>
  ${title ? `<text x="16" y="22" fill="${T.cyan}" font-family="${T.font}" font-size="10" opacity="0.6">${title}</text>` : ''}
  ${content}
</svg>`;
}

// ── SKILL DEFINITIONS ────────────────────────────────────────────────────────

const SKILLS = {

  'bridge.economy': {
    id: 'bridge.economy', name: 'Bridge Economic Engine',
    description: 'Live economic loop: marketplace → execution → revenue → treasury → UBI.',
    tags: ['economy','treasury','marketplace','ubi','bridge'], version: '1.2.0',
    run() {
      return {
        circuit_breaker: false,
        global_exposure:  Math.floor(Math.random()*800),
        exposure_ceiling: 10000,
        trade_count:      Math.floor(Math.random()*45),
        trade_freq_limit: 50,
        entropy:          parseFloat((Math.random()*0.4).toFixed(3)),
        treasury_balance: parseFloat((1000+Math.random()*4000).toFixed(2)),
        ubi_distributed:  parseFloat((Math.random()*200).toFixed(2)),
        revenue_today:    parseFloat((Math.random()*500).toFixed(2)),
      };
    },
    visualize(input = {}) {
      const d = this.run(input);
      const W = 900, H = 300;
      const exposurePct = d.global_exposure / d.exposure_ceiling;
      const tradePct    = d.trade_count / d.trade_freq_limit;
      const cbColor     = d.circuit_breaker ? T.pink : T.green;
      const defs = glowDef('g-econ', T.cyan);
      const cbX = 60, cbY = 150;
      const cbStatus = `<g>
        <circle cx="${cbX}" cy="${cbY}" r="28" fill="${T.bg2}" stroke="${cbColor}" stroke-width="2"/>
        ${pulse(cbX, cbY, 28, cbColor, '2.5s')}
        <text x="${cbX}" y="${cbY-6}" text-anchor="middle" fill="${cbColor}" font-family="${T.font}" font-size="8" font-weight="700">CIRCUIT</text>
        <text x="${cbX}" y="${cbY+8}" text-anchor="middle" fill="${cbColor}" font-family="${T.font}" font-size="8">${d.circuit_breaker ? 'TRIPPED' : 'OK'}</text>
      </g>`;
      const g1 = gauge(200,150,44, exposurePct,    'EXPOSURE',  T.blue);
      const g2 = gauge(310,150,44, tradePct,        'TRADES',    T.orange);
      const g3 = gauge(420,150,44, d.entropy,       'ENTROPY',   T.purple);
      const tx = 530, ty = 80;
      const treasury = `<g>
        <rect x="${tx}" y="${ty}" width="160" height="140" rx="10" fill="${T.bg2}" stroke="${T.cyan}" stroke-width="1.5"/>
        <text x="${tx+80}" y="${ty+20}" text-anchor="middle" fill="${T.cyan}" font-family="${T.font}" font-size="10" font-weight="700">TREASURY</text>
        ${ticker(tx+16, ty+50, '\u20BF ' + d.treasury_balance.toFixed(0), 'BRDG', T.cyan)}
        <text x="${tx+16}" y="${ty+75}" fill="${T.muted}" font-family="${T.font}" font-size="9">Revenue today</text>
        ${progressBar(tx+16, ty+82, 128, 6, Math.min(1, d.revenue_today/1000), T.green)}
        <text x="${tx+16}" y="${ty+105}" fill="${T.muted}" font-family="${T.font}" font-size="9">UBI distributed</text>
        ${progressBar(tx+16, ty+112, 128, 6, Math.min(1, d.ubi_distributed/500), T.purple)}
      </g>`;
      const ux = 730, uy = 80;
      const ubi = `<g>
        <rect x="${ux}" y="${uy}" width="100" height="140" rx="10" fill="${T.bg2}" stroke="${T.purple}" stroke-width="1.5"/>
        <text x="${ux+50}" y="${uy+20}" text-anchor="middle" fill="${T.purple}" font-family="${T.font}" font-size="10" font-weight="700">UBI</text>
        <text x="${ux+50}" y="${uy+50}" text-anchor="middle" fill="${T.purple}" font-family="${T.font}" font-size="18" font-weight="700">${d.ubi_distributed}</text>
        <text x="${ux+50}" y="${uy+68}" text-anchor="middle" fill="${T.muted}" font-family="${T.font}" font-size="9">BRDG claimed</text>
        ${pulse(ux+50, uy+105, 16, T.purple, '3s')}
      </g>`;
      const arrows2 = `${edge(cbX+28,cbY,155,150,T.cyan)}${arrow(155,150,T.cyan)}
        ${edge(480,150,tx,150,T.cyan)}${arrow(tx,150,T.cyan)}
        ${edge(tx+160,150,ux,150,T.purple)}${arrow(ux,150,T.purple)}`;
      return panel(W,H,[defs,cbStatus,g1,g2,g3,treasury,ubi,arrows2].join('\n'),
        `ECONOMIC ENGINE — exposure: ${d.global_exposure}/${d.exposure_ceiling} | entropy: ${d.entropy} | trades: ${d.trade_count}/${d.trade_freq_limit}`);
    },
  },

  'bridge.swarm': {
    id: 'bridge.swarm', name: 'Swarm Health Monitor',
    description: 'Real-time swarm health index: queue latency, worker utilization, profitability, fault rate.',
    tags: ['swarm','health','infrastructure','bridge'], version: '1.0.0',
    run() {
      const latency     = parseFloat((Math.random()*120).toFixed(1));
      const utilization = parseFloat((0.4+Math.random()*0.5).toFixed(2));
      const profit      = parseFloat((0.001+Math.random()*0.008).toFixed(4));
      const failRate    = parseFloat((Math.random()*0.05).toFixed(4));
      const health = Math.min(1, (1-latency/500)*utilization*(1-failRate)*(profit/0.005));
      return { latency, utilization, profit, failRate, health: parseFloat(health.toFixed(3)) };
    },
    visualize(input = {}) {
      const d = this.run(input);
      const W = 780, H = 220;
      const healthColor = d.health > 0.7 ? T.green : d.health > 0.4 ? T.orange : T.pink;
      const defs  = glowDef('g-swarm', healthColor);
      const mainG = gauge(120,110,70, d.health,          'HEALTH',      healthColor);
      const puls  = pulse(120,110,70, healthColor, '3s');
      const g1 = gauge(300,110,44, 1-d.latency/500,  'LATENCY',     T.blue);
      const g2 = gauge(410,110,44, d.utilization,    'UTILIZATION', T.cyan);
      const g3 = gauge(520,110,44, 1-d.failRate*20,  'FAULT FREE',  T.green);
      const g4 = gauge(630,110,44, d.profit/0.01,    'PROFIT',      T.purple);
      const statsY = 185;
      const stats = [`${d.latency}ms`,`${Math.round(d.utilization*100)}%`,`${(d.profit*100).toFixed(2)}%`,`${(d.failRate*100).toFixed(2)}%`]
        .map((v,i) => {
          const lbl=['LATENCY','UTILIZATION','PROFIT','FAULT'][i];
          const x = 290+i*120;
          return `<text x="${x}" y="${statsY}" fill="${T.muted}" font-family="${T.font}" font-size="8">${lbl}</text>
                  <text x="${x}" y="${statsY+14}" fill="${T.cyan}" font-family="${T.font}" font-size="12" font-weight="700">${v}</text>`;
        }).join('\n');
      const score = `<text x="120" y="185" text-anchor="middle" fill="${healthColor}" font-family="${T.font}" font-size="11">${Math.round(d.health*100)} / 100</text>`;
      return panel(W,H,[defs,puls,mainG,g1,g2,g3,g4,stats,score].join('\n'),
        `SWARM HEALTH — composite score from latency \xb7 utilization \xb7 profitability \xb7 fault_rate`);
    },
  },

  'bridge.treasury': {
    id: 'bridge.treasury', name: 'Central Treasury',
    description: 'Unified treasury: all revenue streams converge, tracked per-source, distributed to UBI + operations.',
    tags: ['treasury','economy','revenue','ubi','bridge','defi'], version: '1.0.0',
    run() {
      const sources = [
        { label:'Marketplace', amount: parseFloat((Math.random()*200).toFixed(2)), color: T.cyan   },
        { label:'BossBots',    amount: parseFloat((Math.random()*80).toFixed(2)),  color: T.orange },
        { label:'Sensors',     amount: parseFloat((Math.random()*30).toFixed(2)),  color: T.blue   },
        { label:'Execution',   amount: parseFloat((Math.random()*150).toFixed(2)), color: T.purple },
        { label:'DeFi',        amount: parseFloat((Math.random()*120).toFixed(2)), color: T.pink   },
      ];
      const total = sources.reduce((s,x) => s+x.amount, 0);
      return { sources, total: parseFloat(total.toFixed(2)),
        ubiPool: parseFloat((total*0.30).toFixed(2)), operations: parseFloat((total*0.40).toFixed(2)),
        reserve: parseFloat((total*0.20).toFixed(2)), evolution: parseFloat((total*0.10).toFixed(2)) };
    },
    visualize(input = {}) {
      const d = this.run(input);
      const W = 900, H = 300;
      const defs = glowDef('g-treas', T.cyan);
      const sourceEls = d.sources.map((s,i) => {
        const x=20, y=40+i*50, pct=Math.min(1,s.amount/250);
        return [node(x,y,140,36,s.label,`${s.amount} BRDG`,s.color,6),
          progressBar(x+144,y+10,120,8,pct,s.color),
          `<text x="${x+148+120}" y="${y+22}" fill="${T.muted}" font-family="${T.font}" font-size="9">${s.amount}</text>`
        ].join('\n');
      }).join('\n');
      const vx=360, vy=60;
      const vault = `<g>
        <rect x="${vx}" y="${vy}" width="180" height="180" rx="16" fill="${T.bg2}" stroke="${T.cyan}" stroke-width="2"/>
        <rect x="${vx}" y="${vy}" width="180" height="40" rx="16" fill="${T.bg3}"/>
        <rect x="${vx}" y="${vy+20}" width="180" height="20" fill="${T.bg3}"/>
        <text x="${vx+90}" y="${vy+24}" text-anchor="middle" fill="${T.cyan}" font-family="${T.font}" font-size="12" font-weight="700">TREASURY</text>
        ${pulse(vx+90,vy+90,50,T.cyan,'4s')}
        <text x="${vx+90}" y="${vy+85}" text-anchor="middle" fill="${T.cyan}" font-family="${T.font}" font-size="22" font-weight="700">${d.total}</text>
        <text x="${vx+90}" y="${vy+105}" text-anchor="middle" fill="${T.muted}" font-family="${T.font}" font-size="10">BRDG total</text>
        ${badge(vx+44,vy+155,'UNIFIED',T.cyan)}
      </g>`;
      const flowLines = d.sources.map((s,i) => curve(160, 40+i*50+18, vx, vy+90, s.color)).join('\n');
      const distItems = [
        {label:'UBI POOL',   amount:d.ubiPool,     color:T.purple, pct:0.30},
        {label:'OPERATIONS', amount:d.operations,  color:T.blue,   pct:0.40},
        {label:'RESERVE',    amount:d.reserve,     color:T.cyan,   pct:0.20},
        {label:'EVOLUTION',  amount:d.evolution,   color:T.orange, pct:0.10},
      ];
      const distEls = distItems.map((item,i) => {
        const x=580, y=55+i*55;
        return `${edge(vx+180,vy+90,x,y+18,item.color)}${arrow(x,y+18,item.color)}
          ${node(x,y,160,36,item.label,`${item.amount} BRDG`,item.color,6)}
          ${progressBar(x+4,y+40,152,6,item.pct,item.color)}`;
      }).join('\n');
      return panel(W,H,[defs,sourceEls,vault,flowLines,distEls].join('\n'),
        `TREASURY — total: ${d.total} BRDG | UBI: ${d.ubiPool} | OPS: ${d.operations} | RESERVE: ${d.reserve}`);
    },
  },

  'bridge.decision': {
    id: 'bridge.decision', name: 'Twin Decision Engine',
    description: 'Deterministic decision pipeline: environment scan → ethical filter → action or silence.',
    tags: ['decision','ethics','cognitive','bridge','silence'], version: '1.0.0',
    run() {
      const confidence = parseFloat((0.3+Math.random()*0.7).toFixed(2));
      const ethical    = parseFloat((Math.random()*0.6).toFixed(2));
      const silence    = ethical > 0.7 || confidence < 0.3;
      const latency_ms = Math.floor(Math.random()*90)+5;
      return { confidence, ethical_score: ethical, silence, latency_ms,
        reason: silence ? (ethical > 0.7 ? 'ethical_conflict' : 'confidence_below_floor') : 'action',
        action: silence ? null : 'execute_task', seed: Math.floor(Math.random()*999999) };
    },
    visualize(input = {}) {
      const d = this.run(input);
      const W = 900, H = 200;
      const defs = glowDef('g-dec', T.cyan);
      const stages = [
        {label:'ENV SCAN',   meta:'perception',         x:40,  color:T.blue},
        {label:'GOAL VEC',   meta:'goal alignment',     x:190, color:T.cyan},
        {label:'CANDIDATES', meta:'options generated',  x:340, color:T.cyan},
        {label:'ETHICS',     meta:`score=${d.ethical_score}`, x:490, color:d.ethical_score>0.7?T.pink:T.green},
        {label:'CONFIDENCE', meta:`${d.confidence}`,   x:640, color:d.confidence<0.3?T.orange:T.cyan},
        {label:d.silence?'SILENCE':'ACTION', meta:d.silence?d.reason:d.action||'execute', x:790, color:d.silence?T.pink:T.green},
      ];
      const NW=110, NH=60, NY=60;
      const nodes = stages.map(s => node(s.x,NY,NW,NH,s.label,s.meta,s.color)).join('\n');
      const edges2 = stages.slice(0,-1).map((s,i) => {
        const nextX=stages[i+1].x, midY=NY+NH/2;
        return [edge(s.x+NW,midY,nextX,midY,stages[i+1].color,i<2),arrow(nextX,midY,stages[i+1].color)].join('\n');
      }).join('\n');
      const pathStr = `M${stages[0].x+NW/2} ${NY+NH/2} L${stages[5].x+NW/2} ${NY+NH/2}`;
      const signal  = signalDot(pathStr,'4s',d.silence?T.pink:T.cyan);
      const metaItems = [`seed: ${d.seed}`,`latency: ${d.latency_ms}ms`,`confidence: ${d.confidence}`,
        `ethical: ${d.ethical_score}`,`outcome: ${d.silence?'SILENCE':'ACTION'}`]
        .map((m,i) => badge(30+i*172,155,m,i===4?(d.silence?T.pink:T.green):T.muted)).join('\n');
      const sp = d.silence ? pulse(stages[5].x+55,NY+NH/2,30,T.pink,'1.5s') : pulse(stages[5].x+55,NY+NH/2,30,T.green,'2.5s');
      return panel(W,H,[defs,nodes,edges2,signal,metaItems,sp].join('\n'),
        `DECISION ENGINE — deterministic | seed=${d.seed} | outcome=${d.silence?'SILENCE':'ACTION'}`);
    },
  },

  'bridge.youtube': {
    id: 'bridge.youtube', name: 'YouTube Skill Discovery',
    description: 'Searches YouTube for skill videos, parses descriptions as markdown, and learns skill definitions.',
    tags: ['youtube','learning','skills','discovery','bridge'], version: '1.0.0',
    run(input = {}) {
      return { skill_id:'bridge.youtube', query:input.query||'(no query)', video_id:null, skill_found:false, tags_inferred:[], steps_extracted:5, quota_used:101 };
    },
    visualize(input = {}) {
      const query      = input.query      || 'fastapi tutorial';
      const quotaUsed  = input.quota_used ?? 101;
      const quotaPct   = Math.min(quotaUsed/10000, 1);
      const stepsFound = input.steps      || 5;
      const tags2      = (input.tags      || ['youtube','learning','engineering']).slice(0,4);
      const videoTitle = input.video_title|| 'FastAPI Full Course';
      const W = 720, H = 320;
      const STAGES = [
        {id:'query',  x:30,  label:'QUERY',         color:T.cyan},
        {id:'search', x:160, label:'YT SEARCH API', color:T.purple},
        {id:'meta',   x:310, label:'VIDEO META',    color:T.blue},
        {id:'parse',  x:460, label:'MD PARSE',      color:T.green},
        {id:'adopt',  x:600, label:'SKILL ADOPT',   color:T.gold},
      ];
      const NW=110,NH=44,NY=120;
      const nodes = STAGES.map(s => node(s.x,NY,NW,NH,s.label,'',s.color,6)).join('');
      const edgesEl = STAGES.slice(0,-1).map((s,i) => {
        const b=STAGES[i+1], x1=s.x+NW, y=NY+NH/2, x2=b.x;
        return `${edge(x1,y,x2,y,T.dim)}${arrow(x2-8,y,T.cyan,6)}`;
      }).join('');
      const pathD = `M${STAGES[0].x+NW/2} ${NY+NH/2} L${STAGES[4].x+NW/2} ${NY+NH/2}`;
      const signal  = signalDot(pathD,'2.4s',T.cyan,5);
      const pulseEl = pulse(STAGES[4].x+NW/2,NY+NH/2,28,T.gold,'1.8s');
      const queryBox= `<rect x="30" y="200" width="200" height="50" rx="6" fill="#0d1b2a" stroke="${T.cyan}" stroke-width="1"/>
        <text x="40" y="218" fill="${T.dim}" font-family="${T.font}" font-size="9">SEARCH QUERY</text>
        <text x="40" y="236" fill="${T.cyan}" font-family="${T.font}" font-size="11">${query.substring(0,22)}</text>`;
      const quotaBar= `<text x="260" y="215" fill="${T.dim}" font-family="${T.font}" font-size="9">DAILY QUOTA</text>
        ${progressBar(260,220,160,10,quotaPct,quotaPct>0.8?T.red:T.green)}
        <text x="260" y="245" fill="${T.gold}" font-family="${T.font}" font-size="9">${quotaUsed} / 10000 units used</text>`;
      const tagBadges = tags2.map((t,i) => badge(460+i*64,220,t,T.purple)).join('');
      const stepsInfo = `<text x="460" y="215" fill="${T.dim}" font-family="${T.font}" font-size="9">INFERRED TAGS</text>
        ${tagBadges}
        <text x="460" y="258" fill="${T.green}" font-family="${T.font}" font-size="9">STEPS EXTRACTED: ${stepsFound}</text>`;
      const titleBanner = `<text x="${W/2}" y="92" text-anchor="middle" fill="${T.dim}" font-family="${T.font}" font-size="9">LEARNING FROM</text>
        <text x="${W/2}" y="107" text-anchor="middle" fill="${T.gold}" font-family="${T.font}" font-size="10" font-style="italic">${String(videoTitle||'').substring(0,50)}</text>`;
      return panel(W,H,[titleBanner,nodes,edgesEl,signal,pulseEl,queryBox,quotaBar,stepsInfo].join('\n'),
        'BRIDGE \xb7 YOUTUBE SKILL DISCOVERY');
    },
  },

  'bridge.speech': {
    id: 'bridge.speech', name: 'Speech Embodiment',
    description: 'Voice synthesis with emotion modulation, lip-sync, embodied expression.',
    tags: ['speech','voice','tts','emotion','bridge'], version: '1.0.0',
    run() {
      return { emotion:'calm', amplitude:0.7, pitch:1.05, rate:1.0, words_per_minute:145, lip_sync:true };
    },
    visualize(input = {}) {
      const d = this.run(input);
      const W = 700, H = 220;
      const defs = glowDef('g-speech', T.cyan);
      const bars = Array.from({length:40},(_,i) => {
        const h = 20 + Math.sin(i*0.5)*15 + Math.random()*25;
        const x = 30 + i*15;
        return `<rect x="${x}" y="${120-h/2}" width="10" height="${h}" rx="2" fill="${T.cyan}" opacity="0.6">
          <animate attributeName="height" values="${h};${h*0.4};${h}" dur="${(0.8+i*0.03).toFixed(2)}s" repeatCount="indefinite"/>
          <animate attributeName="y" values="${120-h/2};${120-h*0.2/2};${120-h/2}" dur="${(0.8+i*0.03).toFixed(2)}s" repeatCount="indefinite"/>
        </rect>`;
      }).join('');
      const stats = `<text x="30" y="165" fill="${T.muted}" font-family="${T.font}" font-size="9">EMOTION: </text>
        <text x="95" y="165" fill="${T.cyan}" font-family="${T.font}" font-size="9" font-weight="700">${d.emotion.toUpperCase()}</text>
        <text x="200" y="165" fill="${T.muted}" font-family="${T.font}" font-size="9">PITCH: </text>
        <text x="248" y="165" fill="${T.cyan}" font-family="${T.font}" font-size="9">${d.pitch}</text>
        <text x="320" y="165" fill="${T.muted}" font-family="${T.font}" font-size="9">RATE: </text>
        <text x="358" y="165" fill="${T.cyan}" font-family="${T.font}" font-size="9">${d.rate}x</text>
        <text x="420" y="165" fill="${T.muted}" font-family="${T.font}" font-size="9">WPM: </text>
        <text x="453" y="165" fill="${T.green}" font-family="${T.font}" font-size="9">${d.words_per_minute}</text>`;
      return panel(W,H,[defs,bars,stats].join('\n'), 'SPEECH EMBODIMENT \xb7 VOICE SYNTHESIS + EMOTION MODULATION');
    },
  },

  'bridge.twins': {
    id: 'bridge.twins', name: 'Digital Twin Network',
    description: 'Live mesh of business/AI digital twins syncing state, executing tasks, coordinating workflows.',
    tags: ['twins','mesh','sync','bridge','orchestration'], version: '1.0.0',
    run() {
      return { active:6, synced:5, tasks:14, latency_ms:38, consensus:0.94 };
    },
    visualize(input = {}) {
      const d = this.run(input);
      const W = 600, H = 300;
      const cx=300, cy=150, r=110;
      const names = ['EHSA','ABAAS','BRDG','LEAD','UBI','CRM'];
      const colors = [T.cyan,T.purple,T.gold,T.blue,T.green,T.orange];
      const nodes2 = names.map((n,i) => {
        const angle = (2*Math.PI*i/6) - Math.PI/2;
        const nx=Math.round(cx+r*Math.cos(angle)), ny=Math.round(cy+r*Math.sin(angle));
        return `<circle cx="${nx}" cy="${ny}" r="22" fill="${T.bg2}" stroke="${colors[i]}" stroke-width="1.5"/>
          <text x="${nx}" y="${ny+4}" text-anchor="middle" fill="${colors[i]}" font-family="${T.font}" font-size="9" font-weight="700">${n}</text>`;
      }).join('');
      const edgesEl = names.map((_,i) => {
        const a1=(2*Math.PI*i/6)-Math.PI/2, a2=(2*Math.PI*((i+1)%6)/6)-Math.PI/2;
        const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1), x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
        return `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${T.dim}" stroke-width="1" stroke-opacity="0.5"/>`;
      }).join('');
      const hub = `${pulse(cx,cy,30,T.cyan,'2s')}
        <circle cx="${cx}" cy="${cy}" r="20" fill="${T.bg2}" stroke="${T.cyan}" stroke-width="2"/>
        <text x="${cx}" y="${cy+4}" text-anchor="middle" fill="${T.cyan}" font-family="${T.font}" font-size="8" font-weight="700">MESH</text>`;
      const stats2 = `<text x="20" y="280" fill="${T.muted}" font-family="${T.font}" font-size="9">ACTIVE: </text><text x="70" y="280" fill="${T.cyan}" font-family="${T.font}" font-size="9">${d.active}/6</text>
        <text x="140" y="280" fill="${T.muted}" font-family="${T.font}" font-size="9">TASKS: </text><text x="185" y="280" fill="${T.gold}" font-family="${T.font}" font-size="9">${d.tasks}</text>
        <text x="240" y="280" fill="${T.muted}" font-family="${T.font}" font-size="9">CONSENSUS: </text><text x="320" y="280" fill="${T.green}" font-family="${T.font}" font-size="9">${Math.round(d.consensus*100)}%</text>`;
      return panel(W,H,[edgesEl,hub,nodes2,stats2].join('\n'), 'DIGITAL TWIN MESH \xb7 LIVE STATE SYNC');
    },
  },

  'flow.basic': {
    id: 'flow.basic', name: 'Basic Workflow',
    description: 'Foundational workflow: trigger → validate → execute → report.',
    tags: ['workflow','flow','basic','bridge'], version: '1.0.0',
    run() { return { steps:4, completed:3, failed:0, status:'running', elapsed_ms:247 }; },
    visualize(input = {}) {
      const W = 600, H = 160;
      const steps2 = [
        {label:'TRIGGER',  color:T.cyan,   done:true},
        {label:'VALIDATE', color:T.blue,   done:true},
        {label:'EXECUTE',  color:T.green,  done:true},
        {label:'REPORT',   color:T.muted,  done:false},
      ];
      const nodeEls = steps2.map((s,i) => {
        const x=30+i*140;
        return `${node(x,50,120,50,s.label,s.done?'\u2713 done':'running\u2026',s.done?s.color:T.gold,6)}
          ${i<3?edge(x+120,75,x+140,75,s.done?T.cyan:T.dim)+''+arrow(x+140,75,s.done?T.cyan:T.dim):''}`;
      }).join('');
      return panel(W,H,nodeEls,'BASIC WORKFLOW \xb7 TRIGGER \u2192 VALIDATE \u2192 EXECUTE \u2192 REPORT');
    },
  },

  // ── BIZ MARKETING ─────────────────────────────────────────────────────────
  'biz.marketing': {
    id: 'biz.marketing', name: 'Biz Marketing Pipeline',
    description: 'End-to-end marketing pipeline: LeadGen \u2192 Nurture \u2192 Close \u2192 Treasury, wired into A5E + SVG Graph.',
    tags: ['leadgen','nurture','sales','pipeline','treasury','graph','visualize','execute'], version: '1.0.0',
    run() {
      return {
        leads_captured:   Math.floor(Math.random()*120)+20,
        leads_qualified:  Math.floor(Math.random()*60)+10,
        deals_open:       Math.floor(Math.random()*20)+3,
        deals_closed_won: Math.floor(Math.random()*8)+1,
        mrr:              +(Math.random()*15000+3000).toFixed(2),
        campaign_active:  Math.floor(Math.random()*4)+1,
        nurture_sequences:Math.floor(Math.random()*30)+5,
        revenue_booked:   +(Math.random()*8000+1000).toFixed(2),
      };
    },
    visualize(input = {}) {
      const d = this.run(input);
      const W = 900, H = 320;
      const ORANGE = '#FF7A3C';
      const defs = glowDef('g-mkt', ORANGE);

      // Pipeline stages — 4 nodes in a row
      const stages = [
        { id:'leadgen',  label:'LEADGEN',  sub:`${d.leads_captured} captured`, color:'#38bdf8', x:60  },
        { id:'nurture',  label:'NURTURE',  sub:`${d.leads_qualified} qualified`,color:'#a78bfa', x:260 },
        { id:'close',    label:'CLOSE',    sub:`${d.deals_open} open deals`,   color:'#4ade80', x:460 },
        { id:'treasury', label:'TREASURY', sub:`R${d.mrr.toFixed(0)} MRR`,     color:'#facc15', x:660 },
      ];

      const NW=160, NH=70, NY=110;
      const stageEls = stages.map((s,i) => {
        const cx2 = s.x + NW/2;
        return `${node(s.x, NY, NW, NH, s.label, s.sub, s.color, 10)}
          ${pulse(cx2, NY+NH/2, 30, s.color, (2+i*0.3)+'s')}
          ${i < stages.length-1 ? `${edge(s.x+NW, NY+NH/2, s.x+NW+20, NY+NH/2, s.color)}${arrow(s.x+NW+20, NY+NH/2, s.color)}` : ''}`;
      }).join('');

      // Signal dots flowing along the pipeline
      const pipeY = NY + NH/2;
      const flowPath = `M${60+NW} ${pipeY} L${260} ${pipeY} L${260+NW} ${pipeY} L${460} ${pipeY} L${460+NW} ${pipeY} L${660} ${pipeY}`;
      const flow = signalDot(flowPath, '4s', ORANGE, 5);

      // Header
      const hdr = `<rect width="${W}" height="48" fill="rgba(255,122,60,0.08)" rx="0"/>
        <text x="20" y="18" fill="${ORANGE}" font-family="${T.font}" font-size="10" opacity="0.7">&#x26A1; BIZ.MARKETING \xb7 A5E ENGINE \xb7 v1.0.0</text>
        <text x="20" y="34" fill="#fff" font-family="${T.font}" font-size="13" font-weight="700">Marketing Pipeline \u2014 LeadGen \u2192 Nurture \u2192 Close \u2192 Treasury</text>`;

      // KPI bar at bottom
      const kpis = [
        { label:'CAMPAIGNS', val: d.campaign_active },
        { label:'SEQUENCES', val: d.nurture_sequences },
        { label:'WON',       val: d.deals_closed_won },
        { label:'REVENUE',   val: 'R'+d.revenue_booked.toFixed(0) },
      ];
      const kpiEls = kpis.map((k,i) => {
        const kx = 60 + i*210;
        return `<rect x="${kx}" y="220" width="170" height="56" rx="8" fill="${T.bg2}" stroke="rgba(255,122,60,0.25)" stroke-width="1"/>
          <text x="${kx+85}" y="244" text-anchor="middle" fill="${ORANGE}" font-family="${T.font}" font-size="10" opacity="0.7">${k.label}</text>
          <text x="${kx+85}" y="265" text-anchor="middle" fill="#fff" font-family="${T.font}" font-size="16" font-weight="700">${k.val}</text>`;
      }).join('');

      return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs}
  <rect width="${W}" height="${H}" fill="${T.bg}" rx="12"/>
  ${hdr}
  ${stageEls}
  ${flow}
  ${kpiEls}
</svg>`;
    },
  },
};

// ── SKILL GRAPH SVG ──────────────────────────────────────────────────────────
function buildGraph() {
  const list = Object.values(SKILLS);
  const W=1100, H=700, cx=W/2, cy=H/2+20, r=260;
  const n = list.length;
  const PLUGIN_COLORS = { economy:T.cyan, swarm:T.green, treasury:T.gold, decision:T.purple, youtube:T.pink, speech:T.blue, twins:T.orange, flow:T.muted };

  const nodes2 = list.map((s,i) => {
    const angle = (2*Math.PI*i/n) - Math.PI/2;
    const tag = s.tags[0];
    const col = PLUGIN_COLORS[tag] || T.cyan;
    const nx = Math.round(cx + r*Math.cos(angle));
    const ny = Math.round(cy + r*Math.sin(angle));
    const lbl = s.id.replace('bridge.','').replace('flow.','').toUpperCase();
    return `<g>
      ${pulse(nx,ny,22,col,'2.5s')}
      <circle cx="${nx}" cy="${ny}" r="18" fill="${T.bg2}" stroke="${col}" stroke-width="1.5"/>
      <circle cx="${nx}" cy="${ny}" r="5" fill="${col}"/>
      <text x="${nx}" y="${ny-26}" text-anchor="middle" fill="${col}" font-family="${T.font}" font-size="9">${lbl}</text>
    </g>`;
  });

  const edgeEls = [];
  for(let i=0;i<n;i++) {
    for(let j=i+1;j<n;j++) {
      const shared = list[i].tags.filter(t => list[j].tags.includes(t));
      if(shared.length) {
        const ai=(2*Math.PI*i/n)-Math.PI/2, aj=(2*Math.PI*j/n)-Math.PI/2;
        edgeEls.push(`<line x1="${Math.round(cx+r*Math.cos(ai))}" y1="${Math.round(cy+r*Math.sin(ai))}" x2="${Math.round(cx+r*Math.cos(aj))}" y2="${Math.round(cy+r*Math.sin(aj))}" stroke="rgba(99,255,218,0.1)" stroke-width="1"/>`);
      }
    }
  }

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#060810" rx="12"/>
  <text x="${cx}" y="32" text-anchor="middle" fill="${T.cyan}" font-family="${T.font}" font-size="14" font-weight="bold">BRIDGE SKILL GRAPH \u2014 ${n} SKILLS</text>
  <rect x="20" y="12" width="200" height="28" fill="#111827" rx="6" stroke="rgba(99,255,218,0.15)"/>
  <text x="32" y="31" fill="${T.cyan}" font-family="${T.font}" font-size="11">\u26a1 ${n} skills loaded</text>
  ${edgeEls.join('\n')}
  ${nodes2.join('\n')}
</svg>`;
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

const SKILL_LIST = Object.values(SKILLS).map(s => ({
  id: s.id, name: s.name, description: s.description,
  tags: s.tags, version: s.version, source: 'serverless',
}));

function renderSkill(id, input = {}) {
  const skill = SKILLS[id];
  if (!skill) return null;
  try { return skill.visualize(input); } catch(e) { return null; }
}

function getGraph() { return buildGraph(); }

module.exports = { SKILL_LIST, SKILLS, renderSkill, getGraph };
