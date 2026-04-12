/**
 * bridge-nav.js — Shared Navigation Component
 * Injects a consistent top nav bar into every Bridge AI OS page.
 * Usage: <script src="/bridge-nav.js"></script>
 */
(function(){
'use strict';

// Load Outfit + JetBrains Mono once (idempotent)
if (!document.querySelector('#bridge-fonts')) {
  var lnk = document.createElement('link');
  lnk.id = 'bridge-fonts';
  lnk.rel = 'stylesheet';
  lnk.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap';
  document.head.appendChild(lnk);
}

// Load phere design system (idempotent)
if (!document.querySelector('#bridge-phere-css')) {
  var css = document.createElement('link');
  css.id = 'bridge-phere-css';
  css.rel = 'stylesheet';
  css.href = '/bridge-phere.css';
  document.head.appendChild(css);
}

var NAV_LINKS = [
  { label: 'Home',        href: '/home',        public: true },
  { label: 'Agents',      href: '/agents',      public: true },
  { label: 'Marketplace', href: '/marketplace', public: true },
  { label: 'CRM',         href: '/crm',         public: false },
  { label: 'Leads',       href: '/leads',       public: false },
  { label: 'Invoicing',   href: '/invoicing',   public: false },
  { label: 'Wallet',      href: '/wallet',      public: false },
  { label: 'Pricing',        href: '/pricing',       public: true  },
  { label: 'Claude Partner', href: '/claude-partner', public: true  },
  { label: 'Docs',           href: '/docs',           public: true  },
];

var STYLES = `
#bridge-nav{
  position:sticky;top:0;z-index:1000;
  display:flex;align-items:center;
  height:52px;padding:0 20px;
  background:rgba(4,8,15,0.88);
  border-bottom:1px solid rgba(99,255,218,0.08);
  backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px);
  font-family:'Outfit',system-ui,sans-serif;
  flex-shrink:0;
}
#bridge-nav .bn-logo{
  font-size:.92rem;font-weight:800;color:#63ffda;letter-spacing:.2em;
  text-decoration:none;white-space:nowrap;margin-right:20px;
  display:flex;align-items:center;gap:6px;flex-shrink:0;
}
#bridge-nav .bn-logo span{color:#00e57b}
#bridge-nav .bn-links{
  display:flex;align-items:center;gap:2px;flex:1;overflow-x:auto;
  scrollbar-width:none;
}
#bridge-nav .bn-links::-webkit-scrollbar{display:none}
#bridge-nav .bn-link{
  display:inline-block;padding:5px 10px;border-radius:6px;
  color:rgba(200,220,230,0.55);font-size:.77rem;font-weight:500;
  text-decoration:none;white-space:nowrap;
  transition:color .15s,background .15s;letter-spacing:.02em;
}
#bridge-nav .bn-link:hover,#bridge-nav .bn-link.active{
  color:#63ffda;background:rgba(99,255,218,0.07);
}
#bridge-nav .bn-right{
  display:flex;align-items:center;gap:8px;margin-left:12px;flex-shrink:0;
}
#bridge-nav .bn-status{
  display:inline-flex;align-items:center;gap:5px;
  padding:4px 12px;border-radius:20px;
  border:1px solid rgba(99,255,218,0.2);
  background:rgba(99,255,218,0.05);
  font-size:.68rem;font-weight:600;color:#63ffda;
  letter-spacing:.05em;cursor:pointer;text-decoration:none;
  transition:background .15s,border-color .15s;
}
#bridge-nav .bn-status:hover{
  background:rgba(99,255,218,0.12);border-color:rgba(99,255,218,0.4);
}
#bridge-nav .bn-dot{
  width:6px;height:6px;border-radius:50%;background:#00e57b;
  box-shadow:0 0 6px rgba(0,229,123,.6);
  animation:bn-pulse 2s ease-in-out infinite;flex-shrink:0;
}
#bridge-nav .bn-dot.offline{background:#ff3366;box-shadow:0 0 6px rgba(255,51,102,.6);animation:none}
@keyframes bn-pulse{0%,100%{opacity:1}50%{opacity:.4}}
#bridge-nav .bn-cta{
  display:inline-flex;align-items:center;
  padding:5px 14px;border-radius:6px;font-size:.75rem;font-weight:700;
  background:linear-gradient(135deg,#63ffda,#00e57b);color:#020408;
  text-decoration:none;letter-spacing:.04em;
  transition:filter .15s,transform .15s;
}
#bridge-nav .bn-cta:hover{filter:brightness(1.1);transform:translateY(-1px)}
#bridge-nav .bn-hamburger{
  display:none;align-items:center;justify-content:center;
  flex-direction:column;gap:4px;cursor:pointer;
  padding:8px;border-radius:6px;background:none;border:none;
}
#bridge-nav .bn-hamburger span{
  display:block;width:18px;height:2px;
  background:rgba(200,220,230,.7);border-radius:2px;
  transition:all .2s;pointer-events:none;
}
#bridge-nav-drawer{
  display:none;position:fixed;top:52px;left:0;right:0;
  background:rgba(4,8,15,0.97);border-bottom:1px solid rgba(99,255,218,0.1);
  padding:12px 16px 16px;z-index:999;flex-direction:column;gap:2px;
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  max-height:calc(100vh - 52px);overflow-y:auto;
}
#bridge-nav-drawer.open{display:flex}
#bridge-nav-drawer .bn-link{font-size:.85rem;padding:9px 14px;border-radius:8px}
#bridge-nav-drawer .bn-divider{height:1px;background:rgba(99,255,218,0.08);margin:6px 0}
@media(max-width:820px){
  #bridge-nav .bn-links{display:none}
  #bridge-nav .bn-hamburger{display:flex}
  #bridge-nav .bn-status{display:none}
}
@media(max-width:480px){
  #bridge-nav{padding:0 12px}
  #bridge-nav .bn-cta{font-size:.7rem;padding:4px 10px}
}
`;

function getCurrentPath(){
  return window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
}

function isActive(href){
  var path = getCurrentPath();
  var hrefClean = href.replace(/\.html$/, '');
  if (hrefClean === '/home' && (path === '/' || path === '/home')) return true;
  return path === hrefClean;
}

function getUser(){
  try{ return JSON.parse(localStorage.getItem('bridge_user')||'{}'); } catch(e){ return {}; }
}

function inject(){
  if (document.getElementById('bridge-nav')) return;

  var s = document.createElement('style');
  s.id = 'bridge-nav-style';
  s.textContent = STYLES;
  document.head.appendChild(s);

  var user = getUser();
  var isLoggedIn = !!(localStorage.getItem('bridge_token') || user.email);

  var linksHtml = NAV_LINKS.filter(function(l){
    return l.public || isLoggedIn;
  }).map(function(l){
    return '<a class="bn-link'+(isActive(l.href)?' active':'')+'" href="'+l.href+'">'+l.label+'</a>';
  }).join('');

  var drawerLinksHtml = NAV_LINKS.map(function(l){
    return '<a class="bn-link'+(isActive(l.href)?' active':'')+'" href="'+l.href+'">'+l.label+'</a>';
  }).join('');

  var authHtml = isLoggedIn
    ? '<a class="bn-status" href="/welcome"><span class="bn-dot" id="bn-dot"></span>'+(user.name ? user.name.split(' ')[0] : 'Dashboard')+'</a>'
    : '<a class="bn-status" href="/onboarding"><span class="bn-dot offline" id="bn-dot"></span>Sign In</a>';

  var nav = document.createElement('nav');
  nav.id = 'bridge-nav';
  nav.setAttribute('aria-label','Main navigation');
  nav.innerHTML =
    '<a class="bn-logo" href="/home">BRIDGE <span>AI</span></a>'+
    '<div class="bn-links" role="menubar">'+linksHtml+'</div>'+
    '<div class="bn-right">'+
      authHtml+
      '<a class="bn-cta" href="/onboarding">Get Started</a>'+
      '<button class="bn-hamburger" id="bn-ham" aria-label="Toggle navigation" aria-expanded="false">'+
        '<span></span><span></span><span></span>'+
      '</button>'+
    '</div>';

  var drawer = document.createElement('div');
  drawer.id = 'bridge-nav-drawer';
  drawer.setAttribute('aria-label','Mobile navigation');
  drawer.innerHTML = drawerLinksHtml +
    '<div class="bn-divider"></div>'+
    (isLoggedIn
      ? '<a class="bn-link" href="/welcome">Dashboard</a>'
      : '<a class="bn-link" href="/onboarding">Sign In / Register</a>');

  var body = document.body;
  body.insertBefore(drawer, body.firstChild);
  body.insertBefore(nav, body.firstChild);

  // Hamburger
  document.getElementById('bn-ham').addEventListener('click', function(){
    var d = document.getElementById('bridge-nav-drawer');
    var open = d.classList.toggle('open');
    this.setAttribute('aria-expanded', String(open));
  });

  // Live health ping
  fetch('/api/health').catch(function(){
    var dot = document.getElementById('bn-dot');
    if (dot) dot.classList.add('offline');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inject);
} else {
  inject();
}

})();
