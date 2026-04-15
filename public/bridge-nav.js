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
    { label: 'Home',           href: '/',                    role: null },
    { label: 'Bridge Home',    href: '/bridge',              role: null },
    { label: 'Pricing',        href: '/pricing',             role: null },
    { label: 'Docs',           href: '/docs',                role: null },
    { label: 'Claude Partner', href: '/claude-partner.html', role: null },
    { label: 'Voice AI',       href: '/voice',               role: null },
    { label: 'Activate',       href: '/activate',            role: null },
    { label: 'Join',           href: '/join',                role: null },
    { label: 'Welcome',        href: '/welcome',             role: null },
    { label: 'Wizard',         href: '/wizard',              role: null },
    { label: 'Activation',     href: '/activation.html',     role: null },

    // Authenticated users
    { label: 'Portal',         href: '/portal',         role: 'user' },
    { label: 'Dashboard',      href: '/dashboard',      role: 'user' },
    { label: 'Agents',         href: '/agents',         role: 'user' },
    { label: 'Economy',        href: '/economy',        role: 'user' },
    { label: 'Marketplace',    href: '/marketplace',    role: 'user' },
    { label: 'Carrier/eSIM',  href: '/esim',           role: 'user' },
    { label: 'Carrier Admin', href: '/carrier-admin',  role: 'admin' },
    { label: 'CRM',            href: '/crm',            role: 'user' },
    { label: 'Leads',          href: '/leads',          role: 'user' },
    { label: 'Invoicing',      href: '/invoicing',      role: 'user' },
    { label: 'Settings',       href: '/settings',       role: 'user' },
    { label: 'Profile',        href: '/profile',        role: 'user' },
    { label: 'Billing',         href: '/billing',        role: 'user' },
    { label: 'Projects',        href: '/projects',        role: 'user' },
    { label: 'Avatar',         href: '/avatar',         role: 'user' },
    { label: 'NeuroLink',      href: '/neurolink',      role: 'user' },
    { label: 'Topology',       href: '/topology',       role: 'user' },
    { label: 'Legal',          href: '/legal',          role: 'user' },
    { label: 'UI Dashboard',   href: '/ui',             role: 'user' },
    { label: 'Workforce',      href: '/workforce',      role: 'user' },
    { label: 'Vendors',        href: '/vendors',        role: 'user' },
    { label: 'Quotes',         href: '/quotes',         role: 'user' },
    { label: '50 Applications', href: '/50-applications', role: 'user' },
    { label: 'ABAAS',         href: '/abaas',         role: 'user' },
    { label: 'ABAAS Home',    href: '/abaas-home.html',   role: 'user' },
    { label: 'Affiliate',      href: '/affiliate',          role: 'user' },
    { label: 'AID Home',      href: '/aid-home.html',      role: 'user' },
    { label: 'Applications',   href: '/applications',       role: 'user' },
    { label: 'Aurora Home',   href: '/aurora-home.html',   role: 'user' },
    { label: 'BAN Home',      href: '/ban-home.html',      role: 'user' },
    { label: 'Banks',         href: '/banks',         role: 'user' },
    { label: 'Brand',         href: '/brand',         role: 'user' },
    { label: 'Carrier Admin', href: '/carrier-admin', role: 'user' },
    { label: 'Checkout',      href: '/checkout',       role: 'user' },
    { label: 'Command Center', href: '/command-center', role: 'user' },
    { label: 'Corporate',     href: '/corporate',     role: 'user' },
    { label: 'Customers',     href: '/customers',     role: 'user' },
    { label: 'Demo',          href: '/demo',          role: 'user' },
    { label: 'Digital Twin Console', href: '/digital-twin-console', role: 'user' },
    { label: 'EHSA App',     href: '/ehsa-app',      role: 'user' },
    { label: 'EHSA Brain',   href: '/ehsa-brain',    role: 'user' },
    { label: 'EHSA Home',    href: '/ehsa-home',     role: 'user' },
    { label: 'eSIM PBX',     href: '/esim-pbx.html',  role: 'user' },
    { label: 'Gateway',       href: '/gateway',        role: 'user' },
    { label: 'HITL',          href: '/hitl',          role: 'user' },
    { label: 'Home',          href: '/home',          role: 'user' },
    { label: 'Hospital Home', href: '/hospital-home', role: 'user' },
    { label: 'Infra',         href: '/infra',         role: 'user' },
    { label: 'IoT',           href: '/iot',           role: 'user' },
    { label: 'Landing',       href: '/landing',        role: 'user' },
    { label: 'Lead Gen',      href: '/leadgen',       role: 'user' },
    { label: 'Legal AI',      href: '/legal-ai.html',  role: 'user' },
    { label: 'Marketing',     href: '/marketing',     role: 'user' },
    { label: 'Onboarding',    href: '/onboarding',    role: 'user' },
    { label: 'Outputs',       href: '/outputs',       role: 'user' },
    { label: 'Payment',       href: '/payment',       role: 'user' },
    { label: 'Payment Cancel', href: '/payment-cancel', role: 'user' },
    { label: 'Payment Success', href: '/payment-success', role: 'user' },
    { label: 'Platforms',     href: '/platforms',   role: 'user' },
    { label: 'Registry',      href: '/registry',      role: 'user' },
    { label: 'RootedEarth Home', href: '/rootedearth-home', role: 'user' },
    { label: 'Runtime',       href: '/runtime',       role: 'user' },
    { label: 'Sitemap',       href: '/sitemap',       role: 'user' },
    { label: 'SUPAC Home',   href: '/supac-home',   role: 'user' },
    { label: 'Terminal',      href: '/terminal',      role: 'user' },
    { label: 'Terminal V3',   href: '/terminal-v3',   role: 'user' },
    { label: 'Tickets',       href: '/tickets',       role: 'user' },
    { label: 'Tokenomics',    href: '/tokenomics',    role: 'user' },
    { label: 'Topology Layers', href: '/topology-layers', role: 'user' },
    { label: 'Treasury Dashboard', href: '/treasury-dashboard', role: 'user' },
    { label: 'Twin Wall',     href: '/twin-wall',     role: 'user' },
    { label: 'UBI Home',     href: '/ubi-home',      role: 'user' },
    { label: 'View',          href: '/view',          role: 'user' },
    { label: 'View Logs',     href: '/view-logs',     role: 'user' },
    { label: 'Welcome Tour',  href: '/welcome-tour',  role: 'user' },

    // Vertical Platforms (user level)
    { label: 'AID',            href: '/aid',            role: 'user' },
    { label: 'Aurora',         href: '/aurora',         role: 'user' },
    { label: 'BAN',           href: '/ban',           role: 'user' },
    { label: 'EHSA',          href: '/ehsa',          role: 'user' },
    { label: 'Hospital',       href: '/hospital',       role: 'user' },
    { label: 'RootedEarth',   href: '/rootedearth',   role: 'user' },
    { label: 'SUPAC',         href: '/supac',         role: 'user' },
    { label: 'UBI',           href: '/ubi',           role: 'user' },

    // System Tools (user level)
    { label: 'Console',        href: '/console',        role: 'user' },
    { label: 'Pipeline',       href: '/pipeline',       role: 'user' },
    { label: 'TVM',           href: '/tvm',           role: 'user' },
    { label: 'Digital Twin',   href: '/twin',           role: 'user' },

    // Admin+
    { label: 'Admin',          href: '/admin-command',  role: 'admin' },
    { label: 'Admin Home',    href: '/admin',          role: 'admin' },
    { label: 'Revenue',        href: '/admin-revenue',  role: 'admin' },
    { label: 'Withdrawals',     href: '/withdraw',       role: 'admin' },
    { label: 'eSIM Admin',     href: '/admin-esim',    role: 'admin' },
    { label: 'Intelligence',    href: '/intelligence',   role: 'admin' },
    { label: 'Exec Dashboard',  href: '/executive-dashboard', role: 'admin' },
    { label: 'AOE Dashboard',  href: '/aoe-dashboard', role: 'admin' },
    { label: 'SVG Engine',     href: '/svg-engine',    role: 'admin' },
    { label: 'Supadash',       href: '/supadash',       role: 'admin' },
    { label: 'Supadash Registry', href: '/supadash-registry.html', role: 'admin' },
    { label: 'Supadash Topology', href: '/supadash-topology.html', role: 'admin' },
    { label: 'Supadash Marketplace', href: '/supadash-marketplace.html', role: 'admin' },
    { label: 'Supadash Avatar', href: '/supadash-avatar.html', role: 'admin' },
    { label: 'Bridge Audit',   href: '/bridge-audit-dashboard', role: 'admin' },
    { label: 'Auth Dashboard',  href: '/auth-dashboard', role: 'admin' },
    { label: 'Admin Sitemap',   href: '/admin-sitemap',  role: 'admin' },
    { label: 'System Status',   href: '/system-status-dashboard', role: 'admin' },
    { label: 'God Mode',       href: '/godmode-terminal', role: 'superadmin' },
    { label: 'Control',        href: '/control',        role: 'admin' },
    { label: 'Logs',           href: '/logs',           role: 'admin' },
    { label: 'Governance',      href: '/governance',      role: 'superadmin' },

    // Admin/Superadmin
    { label: 'Treasury',       href: '/treasury',       role: 'admin' },
    { label: 'Wallet',         href: '/wallet',         role: 'admin' },
    { label: 'DeFi',           href: '/defi',           role: 'admin' },
    { label: 'Trading',        href: '/trading',        role: 'admin' },
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

  // ── Breadcrumb Config ───────────────────────────────────────────────────────
  var BREADCRUMBS = {
    '/home': ['Home'],
    '/portal': ['Home', 'Portal'],
    '/agents': ['Home', 'Agents'],
    '/economy': ['Home', 'Economy'],
    '/marketplace': ['Home', 'Marketplace'],
    '/esim': ['Home', 'Carrier/eSIM'],
    '/carrier-admin': ['Home', 'Carrier Admin'],
    '/crm': ['Home', 'CRM'],
    '/leads': ['Home', 'CRM', 'Leads'],
    '/invoicing': ['Home', 'CRM', 'Invoicing'],
    '/quotes': ['Home', 'CRM', 'Quotes'],
    '/customers': ['Home', 'CRM', 'Customers'],
    '/vendors': ['Home', 'CRM', 'Vendors'],
    '/marketing': ['Home', 'CRM', 'Marketing'],
    '/tickets': ['Home', 'CRM', 'Tickets'],
    '/legal': ['Home', 'CRM', 'Legal'],
    '/workforce': ['Home', 'CRM', 'Workforce'],
    '/affiliate': ['Home', 'Affiliate'],
    '/profile': ['Home', 'Profile'],
    '/billing': ['Home', 'Billing'],
    '/projects': ['Home', 'Projects'],
    '/settings': ['Home', 'Settings'],
    '/avatar': ['Home', 'Avatar'],
    '/neurolink': ['Home', 'NeuroLink'],
    '/topology': ['Home', 'Topology'],
    '/ui': ['Home', 'UI Dashboard'],
    '/control': ['Home', 'Control'],
    '/logs': ['Home', 'Control', 'Logs'],
    '/infra': ['Home', 'Control', 'Infrastructure'],
    '/terminal': ['Home', 'Control', 'Terminal'],
    '/admin-command': ['Home', 'Admin'],
    '/admin-revenue': ['Home', 'Admin', 'Revenue'],
    '/admin-withdraw': ['Home', 'Admin', 'Withdrawals'],
    '/admin-esim': ['Home', 'Admin', 'eSIM Admin'],
    '/intelligence': ['Home', 'Admin', 'Intelligence'],
    '/executive-dashboard': ['Home', 'Admin', 'Exec Dashboard'],
    '/aoe-dashboard': ['Home', 'Admin', 'AOE Dashboard'],
    '/svg-engine': ['Home', 'Admin', 'SVG Engine'],
    '/supadash': ['Home', 'Admin', 'Supadash'],
    '/bridge-audit-dashboard': ['Home', 'Admin', 'Bridge Audit'],
    '/auth-dashboard': ['Home', 'Admin', 'Auth Dashboard'],
    '/admin-sitemap': ['Home', 'Admin', 'Sitemap'],
    '/godmode-terminal': ['Home', 'Admin', 'God Mode'],
    '/treasury': ['Home', 'Treasury'],
    '/wallet': ['Home', 'Wallet'],
    '/defi': ['Home', 'Economy', 'DeFi'],
    '/trading': ['Home', 'Economy', 'Trading'],
    '/platforms': ['Home', 'Platforms'],
    '/ehsa': ['Home', 'Platforms', 'EHSA'],
    '/aurora': ['Home', 'Platforms', 'Aurora'],
    '/hospital': ['Home', 'Platforms', 'Hospital'],
    '/aid': ['Home', 'Platforms', 'AID'],
    '/ban': ['Home', 'Platforms', 'BAN'],
    '/ubi': ['Home', 'Platforms', 'UBI'],
    '/abaas': ['Home', 'Platforms', 'ABaaS'],
    '/rootedearth': ['Home', 'Platforms', 'RootedEarth'],
    '/supac': ['Home', 'Platforms', 'SUPA.C'],
    '/activate': ['Activate'],
    '/activation': ['Activation'],
    '/join': ['Join'],
    '/welcome': ['Welcome'],
    '/wizard': ['Wizard'],
    '/50-applications': ['Home', '50 Applications'],
    '/abaas-home': ['Home', 'Platforms', 'ABaaS'],
    '/aid-home': ['Home', 'Platforms', 'AID'],
    '/applications': ['Home', 'Applications'],
    '/aurora-home': ['Home', 'Platforms', 'Aurora'],
    '/ban-home': ['Home', 'Platforms', 'BAN'],
    '/banks': ['Home', 'Banks'],
    '/brand': ['Home', 'Brand'],
    '/checkout': ['Home', 'Checkout'],
    '/demo': ['Home', 'Demo'],
    '/digital-twin-console': ['Home', 'Digital Twin Console'],
    '/ehsa-app': ['Home', 'Platforms', 'EHSA', 'App'],
    '/ehsa-brain': ['Home', 'Platforms', 'EHSA', 'Brain'],
    '/ehsa-home': ['Home', 'Platforms', 'EHSA'],
    '/esim-pbx': ['Home', 'Carrier', 'eSIM PBX'],
    '/gateway': ['Home', 'Gateway'],
    '/hitl': ['Home', 'HITL'],
    '/hospital-home': ['Home', 'Platforms', 'Hospital'],
    '/iot': ['Home', 'IoT'],
    '/landing': ['Home', 'Landing'],
    '/leadgen': ['Home', 'Lead Gen'],
    '/legal-ai': ['Home', 'Legal AI'],
    '/onboarding': ['Home', 'Onboarding'],
    '/outputs': ['Home', 'Outputs'],
    '/payment': ['Home', 'Payment'],
    '/payment-cancel': ['Home', 'Payment', 'Cancelled'],
    '/payment-success': ['Home', 'Payment', 'Success'],
    '/registry': ['Home', 'Registry'],
    '/rootedearth-home': ['Home', 'Platforms', 'RootedEarth'],
    '/runtime': ['Home', 'Runtime'],
    '/sitemap': ['Home', 'Sitemap'],
    '/supac-home': ['Home', 'Platforms', 'SUPAC'],
    '/terminal-v3': ['Home', 'Control', 'Terminal V3'],
    '/tokenomics': ['Home', 'Tokenomics'],
    '/topology-layers': ['Home', 'Topology', 'Layers'],
    '/treasury-dashboard': ['Home', 'Treasury'],
    '/twin-wall': ['Home', 'Digital Twin', 'Wall'],
    '/ubi-home': ['Home', 'Platforms', 'UBI'],
    '/view': ['Home', 'View'],
    '/view-logs': ['Home', 'Control', 'View Logs'],
    '/welcome-tour': ['Home', 'Welcome Tour'],
  };

  function renderBreadcrumb() {
    var path = currentCleanPath();
    var crumbs = BREADCRUMBS[path];
    if (!crumbs) return '';
    return crumbs.map(function (c, i) {
      return i === crumbs.length - 1 ? '<span class="bn-crumb-last">' + c + '</span>' : '<span class="bn-crumb">' + c + '</span>';
    }).join('<span class="bn-crumb-sep">›</span>');
  }

  // ── Inject ────────────────────────────────────────────────────────────────
  function inject() {
    if (document.getElementById('bridge-nav')) return;

    var styleEl = document.createElement('style');
    styleEl.id = 'bridge-nav-style';
    styleEl.textContent = STYLES + [
      '.bn-breadcrumb{margin-left:24px;font-size:.72rem;color:rgba(200,220,230,0.4);display:flex;align-items:center;gap:4px;flex-shrink:0}',
      '.bn-crumb{color:rgba(200,220,230,0.4)}',
      '.bn-crumb-last{color:rgba(200,220,230,0.7)}',
      '.bn-crumb-sep{color:rgba(200,220,230,0.2);margin:0 2px}',
      '@media(max-width:768px){.bn-breadcrumb{display:none}}',
    ].join('\n');
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
      '<div class="bn-breadcrumb" aria-label="Breadcrumb">' + renderBreadcrumb() + '</div>' +
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

    // -- Usage beacon for auto-orchestration --
    // Sends lightweight page/service signal to /api/usage/event so
    // Bridge AI can auto-sync profile activity into lead/orchestration flows.
    try {
      if (isLoggedIn && (_user.id || _user.email)) {
        var uid = _user.id || _user.email;
        var p = window.location.pathname || '/';
        var feature = (p.replace(/\.html$/, '').replace(/\//g, '_').replace(/^_+/, '') || 'home') + '_view';
        fetch('/api/usage/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: uid,
            feature: feature,
            meta: {
              page: p,
              platform: p.split('/').pop() || 'home',
              service: 'bridge-nav-beacon',
              email: _user.email || null,
              company: _user.company || null
            }
          })
        }).catch(function () {});
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})();
