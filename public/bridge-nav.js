(function() {
  'use strict';

  // Auto-detect: use VPS domains when on ai-os.co.za, tunnel when on bridge-ai-os.com, relative when same origin
  var h = window.location.hostname;
  var isVPS = h.indexOf('ai-os.co.za') !== -1;
  var isTunnel = h.indexOf('bridge-ai-os.com') !== -1;
  var svcBase = isVPS ? 'https://go.ai-os.co.za' : (isTunnel ? 'https://abaas.bridge-ai-os.com' : '');
  var godUrl = isVPS ? 'https://go.ai-os.co.za/control.html' : 'https://god.bridge-ai-os.com';
  var svgUrl = isVPS ? 'https://go.ai-os.co.za/avatar.html' : 'https://svg.bridge-ai-os.com';
  var termUrl = isVPS ? 'https://terminal.ai-os.co.za' : 'https://terminal.bridge-ai-os.com';
  var authUrl = isVPS ? 'https://auth.ai-os.co.za' : 'https://auth.bridge-ai-os.com';
  var gwUrl = isVPS ? 'https://gateway.ai-os.co.za' : 'https://gateway.bridge-ai-os.com';
  var sections = {
    'SERVICES': [
      { name: 'CONTROL', subdomain: 'abaas', port: '3000', url: svcBase || '/' },
      { name: 'GOD MODE', subdomain: 'god', port: '3001', url: godUrl },
      { name: 'LIVE WALL', subdomain: 'live', port: '8001', url: isVPS ? svcBase : 'https://live.bridge-ai-os.com' },
      { name: 'SVG ENGINE', subdomain: 'svg', port: '7070', url: svgUrl },
      { name: 'BRAIN', subdomain: 'brain', port: '8000', url: svcBase + '/api/health' },
      { name: 'TERMINAL', subdomain: 'terminal', port: '5002', url: termUrl },
      { name: 'GRAFANA', subdomain: 'grafana', port: '3003', url: isVPS ? 'https://go.ai-os.co.za/status' : 'https://grafana.bridge-ai-os.com' }
    ],
    'PLATFORMS': [
      { name: 'EHSA', url: svcBase+'/ehsa-home.html' }, { name: 'HOSPITAL', url: svcBase+'/hospital-home.html' },
      { name: 'AID', url: svcBase+'/aid-home.html' }, { name: 'UBI', url: svcBase+'/ubi-home.html' },
      { name: 'SUPAC', url: svcBase+'/supac-home.html' }, { name: 'BAN', url: svcBase+'/ban-home.html' },
      { name: 'AURORA', url: svcBase+'/aurora-home.html' }, { name: 'ROOTED EARTH', url: svcBase+'/rootedearth-home.html' },
      { name: 'PLATFORMS', url: svcBase+'/platforms.html' }
    ],
    'BUSINESS': [
      { name: 'CRM', url: svcBase+'/crm.html' }, { name: 'INVOICING', url: svcBase+'/invoicing.html' },
      { name: 'QUOTES', url: svcBase+'/quotes.html' }, { name: 'LEGAL', url: svcBase+'/legal.html' },
      { name: 'MARKETING', url: svcBase+'/marketing.html' }, { name: 'TICKETS', url: svcBase+'/tickets.html' },
      { name: 'VENDORS', url: svcBase+'/vendors.html' }, { name: 'CUSTOMERS', url: svcBase+'/customers.html' },
      { name: 'WORKFORCE', url: svcBase+'/workforce.html' }, { name: 'LEADGEN', url: svcBase+'/leadgen.html' },
      { name: 'AFFILIATE', url: svcBase+'/affiliate.html' }, { name: 'GOVERNANCE', url: svcBase+'/governance.html' }
    ],
    'SYSTEM': [
      { name: 'COMMAND', url: svcBase+'/command-center.html' }, { name: 'AGENTS', url: svcBase+'/agents.html' }, { name: 'TOPOLOGY', url: svcBase+'/topology.html' }, { name: 'LAYERS', url: svcBase+'/topology-layers.html' },
      { name: 'STATUS', url: svcBase+'/system-status-dashboard.html' }, { name: 'REGISTRY', url: svcBase+'/registry.html' },
      { name: 'LOGS', url: svcBase+'/logs.html' }, { name: 'TERMINAL', url: svcBase+'/terminal.html' },
      { name: 'TREASURY', url: svcBase+'/treasury-dashboard.html' }, { name: 'BANKS', url: svcBase+'/banks.html' }, { name: 'INFRA', url: svcBase+'/infra.html' }, { name: 'DASHBOARD', url: svcBase+'/aoe-dashboard.html' }
    ],
    'MORE': [
      { name: 'APPS', url: svcBase+'/50-applications.html' }, { name: 'MARKETPLACE', url: svcBase+'/marketplace.html' },
      { name: 'DEFI', url: svcBase+'/defi.html' }, { name: 'TRADING', url: svcBase+'/trading.html' },
      { name: 'PRICING', url: svcBase+'/pricing.html' }, { name: 'PAYMENT', url: svcBase+'/payment.html' }, { name: 'DOCS', url: svcBase+'/docs.html' },
      { name: 'AVATAR', url: svcBase+'/avatar.html' }, { name: 'BRAND', url: svcBase+'/brand.html' },
      { name: 'CORPORATE', url: svcBase+'/corporate.html' }, { name: 'SITEMAP', url: svcBase+'/sitemap.html' },
      { name: 'JOIN', url: svcBase+'/join.html' }
    ]
  };

  var currentHost = window.location.hostname;
  var currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
  var currentPath = window.location.pathname;
  var isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';

  function isActive(item) {
    if (item.subdomain) return isLocalhost ? item.port === currentPort : currentHost.indexOf(item.subdomain) !== -1;
    try {
      var u = new URL(item.url, window.location.origin);
      return currentPath === u.pathname || currentPath === u.pathname + '.html';
    } catch(e) { return currentPath === item.url; }
  }

  var twinUrl   = svcBase + '/digital-twin-console.html';
  var avatarUrl = svcBase + '/avatar.html';

  var css = [
    '.bn-bar{position:fixed;top:0;left:0;right:0;height:40px;z-index:99999 !important;background:var(--bg-1,#0a0e17);display:flex;align-items:center;padding:0 8px;font-family:"JetBrains Mono",monospace;border-bottom:1px solid rgba(99,255,218,0.1);box-shadow:0 2px 12px rgba(0,0,0,0.4);gap:6px;pointer-events:all !important;}',
    '.bn-logo{color:var(--cyan,#63ffda);font-size:12px;font-weight:700;letter-spacing:2px;white-space:nowrap;cursor:pointer;flex-shrink:0;}',
    /* Twin + Avatar pinned pods */
    '.bn-pod{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;white-space:nowrap;flex-shrink:0;transition:all .2s;cursor:pointer;border:none;}',
    '.bn-pod-twin{color:#050a0f;background:#63ffda;box-shadow:0 0 10px rgba(99,255,218,0.4);}',
    '.bn-pod-twin:hover{background:#00ffcc;box-shadow:0 0 18px rgba(99,255,218,0.7);}',
    '.bn-pod-avatar{color:#050a0f;background:#a78bfa;box-shadow:0 0 10px rgba(167,139,250,0.4);}',
    '.bn-pod-avatar:hover{background:#c4b5fd;box-shadow:0 0 18px rgba(167,139,250,0.7);}',
    '.bn-pod-sep{width:1px;height:20px;background:rgba(99,255,218,0.15);flex-shrink:0;}',
    /* sections */
    '.bn-sections{display:flex;gap:4px;align-items:center;flex:1;overflow-x:auto;scrollbar-width:none;}',
    '.bn-sections::-webkit-scrollbar{display:none;}',
    '.bn-group{position:relative;}',
    '.bn-group-btn{color:var(--cyan,#63ffda);font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:6px 12px;border-radius:4px;cursor:pointer;border:1px solid rgba(99,255,218,0.15);background:rgba(99,255,218,0.04);white-space:nowrap;transition:all 0.2s;pointer-events:all;position:relative;z-index:9999;}',
    '.bn-group-btn:hover,.bn-group.open .bn-group-btn{background:rgba(99,255,218,0.08);border-color:rgba(99,255,218,0.3);}',
    '.bn-dropdown{display:none;position:absolute;top:100%;left:0;margin-top:4px;background:var(--bg-0,#060810);border:1px solid rgba(99,255,218,0.15);border-radius:6px;padding:4px;min-width:140px;box-shadow:0 8px 24px rgba(0,0,0,0.6);z-index:10000;}',
    '.bn-group.open .bn-dropdown{display:block;}',
    '.bn-link{display:block;color:var(--text-secondary,#94a3b8);text-decoration:none;font-size:10px;font-weight:500;letter-spacing:1px;text-transform:uppercase;padding:6px 10px;border-radius:3px;transition:all 0.15s;white-space:nowrap;}',
    '.bn-link:hover{color:#e2e8f0;background:rgba(99,255,218,0.06);}',
    '.bn-link.bn-active{color:var(--cyan,#63ffda);background:rgba(99,255,218,0.1);}',
    '.bn-status{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 6px rgba(74,222,128,0.5);flex-shrink:0;}',
    /* floating twin control FAB */
    '.bn-fab{position:fixed;bottom:20px;right:20px;z-index:99998;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:"JetBrains Mono",monospace;}',
    '.bn-fab-btn{width:48px;height:48px;border-radius:50%;border:2px solid #63ffda;background:#050a0f;color:#63ffda;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 14px rgba(99,255,218,0.35);transition:all .2s;}',
    '.bn-fab-btn:hover{background:#0a1a1a;box-shadow:0 0 24px rgba(99,255,218,0.6);}',
    '.bn-fab-panel{display:none;background:#060810;border:1px solid rgba(99,255,218,0.2);border-radius:10px;padding:12px;width:200px;box-shadow:0 8px 32px rgba(0,0,0,0.7);}',
    '.bn-fab-panel.open{display:block;}',
    '.bn-fab-title{color:#63ffda;font-size:9px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(99,255,218,0.1);}',
    '.bn-fab-row{display:flex;gap:6px;margin-bottom:6px;}',
    '.bn-fab-link{flex:1;display:block;text-align:center;padding:8px 4px;border-radius:6px;font-size:9px;letter-spacing:1px;font-weight:700;text-decoration:none;text-transform:uppercase;transition:all .2s;}',
    '.bn-fab-link.twin{background:rgba(99,255,218,0.1);color:#63ffda;border:1px solid rgba(99,255,218,0.25);}',
    '.bn-fab-link.twin:hover{background:rgba(99,255,218,0.2);border-color:#63ffda;}',
    '.bn-fab-link.avatar{background:rgba(167,139,250,0.1);color:#a78bfa;border:1px solid rgba(167,139,250,0.25);}',
    '.bn-fab-link.avatar:hover{background:rgba(167,139,250,0.2);border-color:#a78bfa;}',
    '.bn-fab-status{font-size:9px;color:#628ba0;text-align:center;padding-top:4px;}',
    '.bn-fab-status .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#4ade80;margin-right:4px;box-shadow:0 0 4px rgba(74,222,128,0.6);}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.className = 'bn-bar';

  var logo = document.createElement('span');
  logo.className = 'bn-logo';
  logo.textContent = 'BRIDGE AI';
  logo.onclick = function() { window.location.href = svcBase + '/applications.html'; };
  bar.appendChild(logo);

  // ── Twin + Avatar pinned control pods ──────────────────────────────────
  var twinPod = document.createElement('a');
  twinPod.className = 'bn-pod bn-pod-twin';
  twinPod.href = twinUrl;
  twinPod.title = 'Digital Twin \u2014 central orchestration';
  twinPod.textContent = '\u25b3 TWIN';
  bar.appendChild(twinPod);

  var avatarPod = document.createElement('a');
  avatarPod.className = 'bn-pod bn-pod-avatar';
  avatarPod.href = avatarUrl;
  avatarPod.title = 'Avatar \u2014 AI embodiment interface';
  avatarPod.textContent = '\u25cb AVATAR';
  bar.appendChild(avatarPod);

  var sep = document.createElement('span');
  sep.className = 'bn-pod-sep';
  bar.appendChild(sep);

  var sectionsDiv = document.createElement('div');
  sectionsDiv.className = 'bn-sections';

  Object.keys(sections).forEach(function(sectionName) {
    var group = document.createElement('div');
    group.className = 'bn-group';
    var btn = document.createElement('button');
    btn.className = 'bn-group-btn';
    btn.textContent = sectionName;
    btn.onclick = function(e) {
      e.stopPropagation();
      document.querySelectorAll('.bn-group').forEach(function(g) { if (g !== group) g.classList.remove('open'); });
      group.classList.toggle('open');
    };
    group.appendChild(btn);

    var dropdown = document.createElement('div');
    dropdown.className = 'bn-dropdown';
    sections[sectionName].forEach(function(item) {
      var a = document.createElement('a');
      a.className = 'bn-link' + (isActive(item) ? ' bn-active' : '');
      a.href = item.url;
      a.textContent = item.name;
      dropdown.appendChild(a);
    });
    group.appendChild(dropdown);
    sectionsDiv.appendChild(group);
  });

  bar.appendChild(sectionsDiv);

  var dot = document.createElement('span');
  dot.className = 'bn-status';
  bar.appendChild(dot);

  document.body.insertBefore(bar, document.body.firstChild);
  document.body.style.paddingTop = '40px';

  document.addEventListener('click', function() {
    document.querySelectorAll('.bn-group').forEach(function(g) { g.classList.remove('open'); });
    document.querySelectorAll('.bn-fab-panel').forEach(function(p) { p.classList.remove('open'); });
  });

  // ── Floating Twin Control FAB ─────────────────────────────────────────
  var fab = document.createElement('div');
  fab.className = 'bn-fab';

  var fabPanel = document.createElement('div');
  fabPanel.className = 'bn-fab-panel';

  var fabTitle = document.createElement('div');
  fabTitle.className = 'bn-fab-title';
  fabTitle.textContent = 'TWIN CONTROL';
  fabPanel.appendChild(fabTitle);

  var fabRow = document.createElement('div');
  fabRow.className = 'bn-fab-row';

  var fabTwin = document.createElement('a');
  fabTwin.className = 'bn-fab-link twin';
  fabTwin.href = twinUrl;
  fabTwin.textContent = '\u25b3 DIGITAL TWIN';
  fabRow.appendChild(fabTwin);

  var fabAvatar = document.createElement('a');
  fabAvatar.className = 'bn-fab-link avatar';
  fabAvatar.href = avatarUrl;
  fabAvatar.textContent = '\u25cb AVATAR';
  fabRow.appendChild(fabAvatar);

  fabPanel.appendChild(fabRow);

  var fabStatus = document.createElement('div');
  fabStatus.className = 'bn-fab-status';
  fabPanel.appendChild(fabStatus);

  var fabBtn = document.createElement('button');
  fabBtn.className = 'bn-fab-btn';
  fabBtn.title = 'Twin Control';
  fabBtn.textContent = '\u29c6';
  fabBtn.setAttribute('aria-label', 'Open Twin Control panel');
  fabBtn.onclick = function(e) {
    e.stopPropagation();
    fabPanel.classList.toggle('open');
    if (fabPanel.classList.contains('open')) pingBrain();
  };

  fab.appendChild(fabPanel);
  fab.appendChild(fabBtn);
  document.body.appendChild(fab);

  function pingBrain() {
    fabStatus.textContent = 'Connecting...';
    fetch('/api/health', { method: 'GET', signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined })
      .then(function(r) {
        var dot = document.createElement('span');
        dot.className = 'dot';
        fabStatus.textContent = '';
        fabStatus.appendChild(dot);
        fabStatus.appendChild(document.createTextNode(r.ok ? 'Brain online' : 'Brain degraded'));
      })
      .catch(function() {
        fabStatus.textContent = 'Brain offline';
      });
  }

  // Auto-inject PHERE design system if not already loaded
  if (!document.getElementById('bridge-phere-css')) {
    var phereLink = document.createElement('link');
    phereLink.id = 'bridge-phere-css';
    phereLink.rel = 'stylesheet';
    phereLink.href = '/bridge-phere.css';
    document.head.appendChild(phereLink);
  }
  if (!document.querySelector('script[src*="bridge-phere"]')) {
    var phereScript = document.createElement('script');
    phereScript.src = '/bridge-phere.js';
    phereScript.defer = true;
    document.head.appendChild(phereScript);
  }
})();
