(function() {
  'use strict';

  var services = [
    { name: 'ABAAS CONTROL', port: '3000', subdomain: 'abaas',    url: 'https://abaas.bridge-ai-os.com' },
    { name: 'GOD MODE',      port: '3001', subdomain: 'god',      url: 'https://god.bridge-ai-os.com' },
    { name: 'TERMINAL',      port: '5002', subdomain: 'terminal', url: 'https://terminal.bridge-ai-os.com' },
    { name: 'SUPER BRAIN',   port: '8000', subdomain: 'brain',    url: 'https://brain.bridge-ai-os.com' },
    { name: 'SVG ENGINE',    port: '7070', subdomain: 'svg',      url: 'https://svg.bridge-ai-os.com' },
    { name: 'LIVE WALL',     port: '8001', subdomain: 'live',     url: 'https://live.bridge-ai-os.com' },
    { name: 'AUTH',           port: '3030', subdomain: 'auth',     url: 'https://auth.bridge-ai-os.com' },
    { name: 'GRAFANA',        port: '3003', subdomain: 'grafana',  url: 'https://grafana.bridge-ai-os.com' }
  ];

  var currentHost = window.location.hostname;
  var currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
  var isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';

  var css = [
    '.bn-bar{position:fixed;top:0;left:0;right:0;height:40px;z-index:9999;',
    'background:var(--bg-1,#0a0e17);display:flex;align-items:center;',
    'justify-content:space-between;padding:0 16px;font-family:"JetBrains Mono",monospace;',
    'border-bottom:1px solid rgba(99,255,218,0.1);box-shadow:0 2px 12px rgba(0,0,0,0.4);}',
    '.bn-logo{color:var(--cyan,#63ffda);font-size:13px;font-weight:700;letter-spacing:3px;',
    'text-transform:uppercase;white-space:nowrap;}',
    '.bn-links{display:flex;gap:6px;align-items:center;flex-wrap:nowrap;}',
    '.bn-link{color:var(--muted,#64748b);text-decoration:none;font-size:11px;',
    'font-weight:500;letter-spacing:1.2px;text-transform:uppercase;',
    'padding:4px 10px;border-radius:4px;transition:all 0.2s;white-space:nowrap;',
    'border:1px solid transparent;}',
    '.bn-link:hover{color:#e2e8f0;background:rgba(99,255,218,0.06);',
    'border-color:rgba(99,255,218,0.15);box-shadow:0 0 8px rgba(99,255,218,0.1);}',
    '.bn-link.bn-active{color:var(--cyan,#63ffda);background:rgba(99,255,218,0.08);',
    'border-color:rgba(99,255,218,0.25);box-shadow:0 0 12px rgba(99,255,218,0.15);}',
    '.bn-status{width:8px;height:8px;border-radius:50%;background:var(--green,#4ade80);',
    'box-shadow:0 0 6px rgba(74,222,128,0.5);flex-shrink:0;}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.className = 'bn-bar';

  var logo = document.createElement('span');
  logo.className = 'bn-logo';
  logo.textContent = 'BRIDGE AI';

  var links = document.createElement('nav');
  links.className = 'bn-links';

  for (var i = 0; i < services.length; i++) {
    var s = services[i];
    var a = document.createElement('a');
    var isActive = isLocalhost ? (s.port === currentPort) : currentHost.indexOf(s.subdomain) !== -1;
    a.className = 'bn-link' + (isActive ? ' bn-active' : '');
    a.href = s.url;
    a.textContent = s.name;
    links.appendChild(a);
  }

  var dot = document.createElement('span');
  dot.className = 'bn-status';

  bar.appendChild(logo);
  bar.appendChild(links);
  bar.appendChild(dot);

  document.body.appendChild(bar);
  document.body.style.paddingTop = '40px';
})();
