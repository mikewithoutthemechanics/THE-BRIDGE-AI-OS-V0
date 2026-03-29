(function() {
  'use strict';

  var base = 'https://abaas.bridge-ai-os.com';
  var sections = {
    'SERVICES': [
      { name: 'CONTROL', subdomain: 'abaas', port: '3000', url: 'https://abaas.bridge-ai-os.com' },
      { name: 'GOD MODE', subdomain: 'god', port: '3001', url: 'https://god.bridge-ai-os.com' },
      { name: 'LIVE WALL', subdomain: 'live', port: '8001', url: 'https://live.bridge-ai-os.com' },
      { name: 'SVG ENGINE', subdomain: 'svg', port: '7070', url: 'https://svg.bridge-ai-os.com' },
      { name: 'BRAIN', subdomain: 'brain', port: '8000', url: 'https://brain.bridge-ai-os.com' },
      { name: 'TERMINAL', subdomain: 'terminal', port: '5002', url: 'https://terminal.bridge-ai-os.com' },
      { name: 'GRAFANA', subdomain: 'grafana', port: '3003', url: 'https://grafana.bridge-ai-os.com' }
    ],
    'PLATFORMS': [
      { name: 'EHSA', url: base+'/ehsa' }, { name: 'HOSPITAL', url: base+'/hospital' },
      { name: 'AID', url: base+'/aid' }, { name: 'UBI', url: base+'/ubi' },
      { name: 'SUPAC', url: base+'/supac' }, { name: 'BAN', url: base+'/ban' },
      { name: 'AURORA', url: base+'/aurora' }, { name: 'ROOTED EARTH', url: base+'/rootedearth' }
    ],
    'BUSINESS': [
      { name: 'CRM', url: base+'/crm' }, { name: 'INVOICING', url: base+'/invoicing' },
      { name: 'QUOTES', url: base+'/quotes' }, { name: 'LEGAL', url: base+'/legal' },
      { name: 'MARKETING', url: base+'/marketing' }, { name: 'TICKETS', url: base+'/tickets' },
      { name: 'VENDORS', url: base+'/vendors' }, { name: 'CUSTOMERS', url: base+'/customers' },
      { name: 'WORKFORCE', url: base+'/workforce' }
    ],
    'MORE': [
      { name: 'APPS', url: base+'/apps' }, { name: 'MARKETPLACE', url: base+'/marketplace' },
      { name: 'DEFI', url: base+'/defi' }, { name: 'TRADING', url: base+'/trading' },
      { name: 'PRICING', url: base+'/pricing' }, { name: 'DOCS', url: base+'/docs' }
    ]
  };

  var currentHost = window.location.hostname;
  var currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
  var currentPath = window.location.pathname;
  var isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';

  function isActive(item) {
    if (item.subdomain) return isLocalhost ? item.port === currentPort : currentHost.indexOf(item.subdomain) !== -1;
    try { var u = new URL(item.url); return currentPath === u.pathname || currentPath === u.pathname + '.html'; } catch(e) { return false; }
  }

  var css = [
    '.bn-bar{position:fixed;top:0;left:0;right:0;height:40px;z-index:99999 !important;background:var(--bg-1,#0a0e17);display:flex;align-items:center;padding:0 12px;font-family:"JetBrains Mono",monospace;border-bottom:1px solid rgba(99,255,218,0.1);box-shadow:0 2px 12px rgba(0,0,0,0.4);gap:8px;pointer-events:all !important;}',
    '.bn-logo{color:var(--cyan,#63ffda);font-size:12px;font-weight:700;letter-spacing:2px;white-space:nowrap;cursor:pointer;flex-shrink:0;}',
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
    '.bn-status{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 6px rgba(74,222,128,0.5);flex-shrink:0;}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.className = 'bn-bar';

  var logo = document.createElement('span');
  logo.className = 'bn-logo';
  logo.textContent = 'BRIDGE AI';
  logo.onclick = function() { window.location.href = base + '/apps'; };
  bar.appendChild(logo);

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
  });
})();
