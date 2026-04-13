/**
 * bridge-nav.js — Bridge AI OS Unified Navigation Component
 *
 * Single registry-driven nav. One route array governs desktop links,
 * mobile drawer, and role-based visibility. Replaces both the old
 * bridge-nav.js (top bar) and global-nav.js (bottom tabs).
 *
 * Usage: <script src="/bridge-nav.js"></script>
 *
 * Role hierarchy: null (public) < 'user' < 'admin' < 'superadmin'
 */
(function () {
  'use strict';

  // ── Route Registry ────────────────────────────────────────────────────────
  // Single source of truth. Add/remove/reorder routes here only.
  // role: null = public | 'user' = authenticated | 'admin' | 'superadmin'
  var ROUTES = [
    // Public
    { label: 'Home',           href: '/home',           role: null },
    { label: 'Pricing',        href: '/pricing',        role: null },
    { label: 'Docs',           href: '/docs',           role: null },
    { label: 'Claude Partner', href: '/claude-partner', role: null },
    { label: 'Voice AI',       href: '/voice',          role: null },

    // Authenticated users
    { label: 'Portal',         href: '/portal',         role: 'user' },
    { label: 'Agents',         href: '/agents',         role: 'user' },
    { label: 'Economy',        href: '/economy',        role: 'user' },
    { label: 'Marketplace',    href: '/marketplace',    role: 'user' },
    { label: 'CRM',            href: '/crm',            role: 'user' },
    { label: 'Leads',          href: '/leads',          role: 'user' },
    { label: 'Invoicing',      href: '/invoicing',      role: 'user' },
    { label: 'Settings',       href: '/settings',       role: 'user' },
    { label: 'Avatar',         href: '/avatar',         role: 'user' },
    { label: 'NeuroLink',      href: '/neurolink',      role: 'user' },
    { label: 'Topology',       href: '/topology',       role: 'user' },
    { label: 'Legal',          href: '/legal',          role: 'user' },

    // Admin+
    { label: 'Admin',          href: '/admin-command',  role: 'admin' },
    { label: 'Revenue',        href: '/admin-revenue',  role: 'admin' },
    { label: 'Control',        href: '/control',        role: 'admin' },
    { label: 'Logs',           href: '/logs',           role: 'admin' },

    // Superadmin+
    { label: 'Treasury',       href: '/treasury',       role: 'superadmin' },
    { label: 'Wallet',         href: '/wallet',         role: 'superadmin' },
    { label: 'DeFi',           href: '/defi',           role: 'superadmin' },
    { label: 'Trading',        href: '/trading',        role: 'superadmin' },
  ];

  // Top-bar shows only the first N public/user routes (keeps bar clean).
  // The full filtered list appears in the mobile drawer.
  var TOP_BAR_MAX = 6;

  // ── Role hierarchy ────────────────────────────────────────────────────────
  var ROLE_ORDER = [null, 'user', 'admin', 'superadmin'];
  function canSee(route, userRole) {
    if (route.role === null) return true;
    if (!userRole) return false;
    return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(route.role);
  }

  // ── Auth state ────────────────────────────────────────────────────────────
  var _token = localStorage.getItem('bridge_token') || localStorage.getItem('bridge_user_token');
  var _user = null;
  try { _user = JSON.parse(localStorage.getItem('bridge_user') || '{}'); } catch (_) { _user = {}; }

  var isLoggedIn = !!(_token || _user.email);
  var userRole   = isLoggedIn ? (_user.role || 'user') : null;
  var userName   = isLoggedIn ? ((_user.name || _user.email || '').split(' ')[0] || 'Dashboard') : null;

  // ── Visible routes ────────────────────────────────────────────────────────
  var visibleRoutes = ROUTES.filter(function (r) { return canSee(r, userRole); });

  // Desktop top-bar: public routes + first few user routes, capped
  var topBarRoutes = visibleRoutes.filter(function (r) {
    return r.role === null || r.role === 'user';
  }).slice(0, TOP_BAR_MAX);

  // ── Active path detection ─────────────────────────────────────────────────
  function currentCleanPath() {
    return window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  }
  function isActive(href) {
    var path = currentCleanPath();
    var clean = href.replace(/\.html$/, '');
    if (clean === '/home' && (path === '/' || path === '/home')) return true;
    return path === clean;
  }

  // ── Theme: apply stored preference before first paint ────────────────────
  (function () {
    var t = localStorage.getItem('bridge_theme');
    if (!t) return;
    var resolved = t;
    if (t === 'system') resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', resolved);
  })();

  // ── Fonts (idempotent) ────────────────────────────────────────────────────
  if (!document.querySelector('#bridge-fonts')) {
    var lnk = document.createElement('link');
    lnk.id = 'bridge-fonts';
    lnk.rel = 'stylesheet';
    lnk.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(lnk);
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  var STYLES = [
    '#bridge-nav{position:sticky;top:0;z-index:1000;display:flex;align-items:center;height:52px;padding:0 20px;background:rgba(4,8,15,0.88);border-bottom:1px solid rgba(99,255,218,0.08);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font-family:"Outfit",system-ui,sans-serif;flex-shrink:0}',
    '#bridge-nav .bn-logo{font-size:.92rem;font-weight:800;color:#63ffda;letter-spacing:.2em;text-decoration:none;white-space:nowrap;margin-right:20px;display:flex;align-items:center;gap:6px;flex-shrink:0}',
    '#bridge-nav .bn-logo span{color:#00e57b}',
    '#bridge-nav .bn-links{display:flex;align-items:center;gap:2px;flex:1;overflow-x:auto;scrollbar-width:none}',
    '#bridge-nav .bn-links::-webkit-scrollbar{display:none}',
    '#bridge-nav .bn-link{display:inline-block;padding:5px 10px;border-radius:6px;color:rgba(200,220,230,0.55);font-size:.77rem;font-weight:500;text-decoration:none;white-space:nowrap;transition:color .15s,background .15s;letter-spacing:.02em}',
    '#bridge-nav .bn-link:hover,#bridge-nav .bn-link.active{color:#63ffda;background:rgba(99,255,218,0.07)}',
    '#bridge-nav .bn-right{display:flex;align-items:center;gap:8px;margin-left:12px;flex-shrink:0}',
    '#bridge-nav .bn-status{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;border:1px solid rgba(99,255,218,0.2);background:rgba(99,255,218,0.05);font-size:.68rem;font-weight:600;color:#63ffda;letter-spacing:.05em;cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s}',
    '#bridge-nav .bn-status:hover{background:rgba(99,255,218,0.12);border-color:rgba(99,255,218,0.4)}',
    '#bridge-nav .bn-dot{width:6px;height:6px;border-radius:50%;background:#00e57b;box-shadow:0 0 6px rgba(0,229,123,.6);animation:bn-pulse 2s ease-in-out infinite;flex-shrink:0}',
    '#bridge-nav .bn-dot.offline{background:#ff3366;box-shadow:0 0 6px rgba(255,51,102,.6);animation:none}',
    '@keyframes bn-pulse{0%,100%{opacity:1}50%{opacity:.4}}',
    '#bridge-nav .bn-cta{display:inline-flex;align-items:center;padding:5px 14px;border-radius:6px;font-size:.75rem;font-weight:700;background:linear-gradient(135deg,#63ffda,#00e57b);color:#020408;text-decoration:none;letter-spacing:.04em;transition:filter .15s,transform .15s}',
    '#bridge-nav .bn-cta:hover{filter:brightness(1.1);transform:translateY(-1px)}',
    '#bridge-nav .bn-hamburger{display:none;align-items:center;justify-content:center;flex-direction:column;gap:4px;cursor:pointer;padding:8px;border-radius:6px;background:none;border:none}',
    '#bridge-nav .bn-hamburger span{display:block;width:18px;height:2px;background:rgba(200,220,230,.7);border-radius:2px;transition:all .2s;pointer-events:none}',
    '#bridge-nav-drawer{display:none;position:fixed;top:52px;left:0;right:0;background:rgba(4,8,15,0.97);border-bottom:1px solid rgba(99,255,218,0.1);padding:12px 16px 16px;z-index:999;flex-direction:column;gap:2px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);max-height:calc(100vh - 52px);overflow-y:auto}',
    '#bridge-nav-drawer.open{display:flex}',
    '#bridge-nav-drawer .bn-link{font-size:.85rem;padding:9px 14px;border-radius:8px}',
    '#bridge-nav-drawer .bn-divider{height:1px;background:rgba(99,255,218,0.08);margin:6px 0}',
    '#bridge-nav-drawer .bn-signout{display:block;padding:9px 14px;border-radius:8px;font-size:.85rem;font-weight:500;color:#ff5a5a;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;width:100%;transition:background .15s}',
    '#bridge-nav-drawer .bn-signout:hover{background:rgba(255,60,60,.08)}',
    '@media(max-width:820px){#bridge-nav .bn-links{display:none}#bridge-nav .bn-hamburger{display:flex}#bridge-nav .bn-status{display:none}}',
    '@media(max-width:480px){#bridge-nav{padding:0 12px}#bridge-nav .bn-cta{font-size:.7rem;padding:4px 10px}}',
  ].join('\n');

  // ── Inject ────────────────────────────────────────────────────────────────
  function inject() {
    if (document.getElementById('bridge-nav')) return;

    var styleEl = document.createElement('style');
    styleEl.id = 'bridge-nav-style';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    // -- Auth pill (right side) --
    var authHtml = isLoggedIn
      ? '<a class="bn-status" href="/portal"><span class="bn-dot" id="bn-dot"></span>' + userName + '</a>'
      : '<a class="bn-status" href="/onboarding"><span class="bn-dot offline" id="bn-dot"></span>Sign In</a>';

    // -- Top bar links --
    var topLinksHtml = topBarRoutes.map(function (r) {
      return '<a class="bn-link' + (isActive(r.href) ? ' active' : '') + '" href="' + r.href + '">' + r.label + '</a>';
    }).join('');

    // -- Nav element --
    var nav = document.createElement('nav');
    nav.id = 'bridge-nav';
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML =
      '<a class="bn-logo" href="/home">BRIDGE <span>AI</span></a>' +
      '<div class="bn-links" role="menubar">' + topLinksHtml + '</div>' +
      '<div class="bn-right">' +
        authHtml +
        (isLoggedIn ? '' : '<a class="bn-cta" href="/onboarding">Get Started</a>') +
        '<button class="bn-hamburger" id="bn-ham" aria-label="Toggle navigation" aria-expanded="false">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</div>';

    // -- Drawer (full route list, all visible routes) --
    var drawerLinksHtml = visibleRoutes.map(function (r) {
      return '<a class="bn-link' + (isActive(r.href) ? ' active' : '') + '" href="' + r.href + '">' + r.label + '</a>';
    }).join('');

    var signOutHtml = isLoggedIn
      ? '<div class="bn-divider"></div><button class="bn-signout" id="bn-signout">Sign Out</button>'
      : '';

    var drawer = document.createElement('div');
    drawer.id = 'bridge-nav-drawer';
    drawer.setAttribute('aria-label', 'Mobile navigation');
    drawer.innerHTML = drawerLinksHtml + signOutHtml;

    // Prepend both so they sit above page content
    var body = document.body;
    body.insertBefore(drawer, body.firstChild);
    body.insertBefore(nav, body.firstChild);

    // -- Hamburger toggle --
    var ham = document.getElementById('bn-ham');
    ham.addEventListener('click', function () {
      var d = document.getElementById('bridge-nav-drawer');
      var open = d.classList.toggle('open');
      this.setAttribute('aria-expanded', String(open));
    });

    // -- Sign out --
    var signOutBtn = document.getElementById('bn-signout');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', function () {
        var token = localStorage.getItem('bridge_token') || localStorage.getItem('bridge_user_token');
        // Best-effort server-side revocation
        if (token) {
          fetch('/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          }).catch(function () {});
        }
        localStorage.removeItem('bridge_token');
        localStorage.removeItem('bridge_user_token');
        localStorage.removeItem('bridge_user');
        document.cookie = 'access_token=;path=/;max-age=0';
        document.cookie = 'bridge_token=;path=/;max-age=0';
        window.location.href = '/onboarding';
      });
    }

    // -- Live health ping --
    fetch('/api/health').catch(function () {
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
