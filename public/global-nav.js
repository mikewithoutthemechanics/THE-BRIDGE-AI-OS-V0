/**
 * Bridge AI OS — Global Navigation Bar
 * Auto-injects a fixed bottom nav on every page.
 * Add <script src="/global-nav.js" defer></script> to any page.
 *
 * RBAC-aware: only shows links the current user's role can access.
 */
(function() {
  'use strict';

  var currentPath = window.location.pathname;

  // ── Detect auth state and role ──────────────────────────────────────────
  var _token = localStorage.getItem('bridge_token') || localStorage.getItem('bridge_user_token');
  var _user = null;
  var _role = null; // null = unauthenticated
  var _authLabel = 'Sign In';
  var _authHref = '/onboarding.html';

  try {
    _user = JSON.parse(localStorage.getItem('bridge_user'));
  } catch (_) {}

  if (_token && _user) {
    _role = _user.role || 'user';
    _authLabel = (_user.name || _user.email || '').split(' ')[0] || 'Account';
    _authHref = '/portal.html';
  }

  var isAuthenticated = !!(_token && _user);
  var isAdmin = isAuthenticated && (_role === 'admin' || _role === 'superadmin' || _role === 'owner');
  var isSuperAdmin = isAuthenticated && (_role === 'superadmin' || _role === 'owner');

  // ── Primary nav items (always visible) ──────────────────────────────────
  var NAV_ITEMS = [
    { label: 'Home', href: '/', icon: '\u2302' },
    { label: 'Portal', href: '/portal.html', icon: '\uD83E\uDDE0' },
  ];

  // Only show Economy link to authenticated users (CLIENT tier page)
  if (isAuthenticated) {
    NAV_ITEMS.push({ label: 'Economy', href: '/economy.html', icon: '\u26A1' });
  }

  NAV_ITEMS.push({ label: _authLabel, href: _authHref, icon: isAuthenticated ? '\uD83D\uDC64' : '\uD83D\uDD11' });

  // ── More panel items (role-gated) ───────────────────────────────────────
  var MORE_ITEMS = [];

  // Public items (always visible)
  MORE_ITEMS.push({ label: 'Voice AI', href: '/voice.html' });

  // CLIENT tier — only for authenticated users
  if (isAuthenticated) {
    MORE_ITEMS.push(
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'CRM', href: '/crm.html' },
      { label: 'Invoicing', href: '/invoicing.html' },
      { label: 'Settings', href: '/settings.html' },
      { label: 'Economy', href: '/economy.html' },
      { label: 'Agents', href: '/agents.html' },
      { label: 'Avatar', href: '/avatar.html' },
      { label: 'Marketplace', href: '/marketplace.html' },
      { label: 'Brain', href: '/ehsa-brain.html' },
      { label: 'Topology', href: '/topology.html' },
      { label: 'Legal', href: '/legal.html' }
    );
  }

  // ADMIN tier
  if (isAdmin) {
    MORE_ITEMS.push(
      { label: 'Admin', href: '/admin-command.html' },
      { label: 'Revenue', href: '/admin-revenue.html' },
      { label: 'Control', href: '/control.html' },
      { label: 'Logs', href: '/logs.html' }
    );
  }

  // SUPERADMIN tier
  if (isSuperAdmin) {
    MORE_ITEMS.push(
      { label: 'Treasury', href: '/treasury-dashboard.html' },
      { label: 'Wallet', href: '/wallet.html' },
      { label: 'DeFi', href: '/defi.html' },
      { label: 'Trading', href: '/trading.html' }
    );
  }

  // Sign Out option (only when authenticated)
  // Rendered separately at the bottom of the panel

  // ── Inject styles ───────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '.gn{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:rgba(5,10,15,.95);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid rgba(0,200,255,.15);display:flex;justify-content:space-around;align-items:center;padding:0;height:56px;font-family:system-ui,sans-serif}',
    '@supports not (backdrop-filter:blur(12px)){.gn{background:rgba(5,10,15,.98)}}',
    '.gn a,.gn span[role="link"]{display:flex;flex-direction:column;align-items:center;text-decoration:none;color:#7a8fa0;font-size:.75rem;padding:6px 8px;transition:color .2s;min-width:50px;gap:2px}',
    '.gn a:hover,.gn a.active,.gn span[role="link"].active{color:#00c8ff;text-decoration:none}',
    '.gn a .gi{font-size:1.2rem;line-height:1}',
    '.gn a.active .gi,.gn span[role="link"].active .gi{filter:drop-shadow(0 0 4px rgba(0,200,255,.5))}',
    '.gn-more-btn{display:flex;flex-direction:column;align-items:center;color:#7a8fa0;font-size:.75rem;padding:6px 8px;cursor:pointer;min-width:50px;gap:2px;background:none;border:none;font-family:inherit}',
    '.gn-more-btn:hover{color:#00c8ff}',
    '.gn-more-btn .gi{font-size:1.2rem;line-height:1}',
    '.gn-panel{display:none;position:fixed;bottom:56px;left:0;right:0;z-index:9998;background:rgba(5,10,15,.97);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid rgba(0,200,255,.1);padding:12px;max-height:60vh;overflow-y:auto}',
    '@supports not (backdrop-filter:blur(12px)){.gn-panel{background:rgba(5,10,15,.99)}}',
    '.gn-panel.open{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px}',
    '.gn-panel a,.gn-panel button.gn-signout{display:block;padding:10px 8px;text-align:center;color:#b0bec5;font-size:.75rem;text-decoration:none;border-radius:8px;background:rgba(26,45,64,.3);border:1px solid rgba(26,45,64,.5);transition:all .15s;cursor:pointer;font-family:inherit}',
    '.gn-panel a:hover,.gn-panel button.gn-signout:hover{background:rgba(0,200,255,.08);border-color:rgba(0,200,255,.3);color:#00c8ff;text-decoration:none}',
    '.gn-panel a.active{border-color:#00c8ff;color:#00c8ff}',
    '.gn-panel button.gn-signout{color:#ff5a5a;border-color:rgba(255,90,90,.3)}',
    '.gn-panel button.gn-signout:hover{background:rgba(255,60,60,.1);border-color:rgba(255,90,90,.5);color:#ff3c3c}',
    '.gn a:focus-visible,.gn-more-btn:focus-visible,.gn-panel a:focus-visible,.gn-panel button.gn-signout:focus-visible{outline:2px solid #00c8ff;outline-offset:2px}',
    'body{padding-bottom:60px!important}',
  ].join('\n');
  document.head.appendChild(style);

  // ── Build nav bar ───────────────────────────────────────────────────────
  var nav = document.createElement('div');
  nav.className = 'gn';

  NAV_ITEMS.forEach(function(item) {
    var isActive = currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href))
      || (item.href === '/' && (currentPath === '/' || currentPath === '/index.html'));

    var el;
    if (isActive && item.label === 'Home') {
      el = document.createElement('span');
      el.setAttribute('role', 'link');
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('aria-current', 'page');
      el.className = 'active';
      el.style.cssText = 'cursor:default';
    } else {
      el = document.createElement('a');
      el.href = item.href;
      if (isActive) {
        el.className = 'active';
        el.setAttribute('aria-current', 'page');
      }
    }

    if (item.label === 'Economy') {
      el.setAttribute('aria-label', 'Economy (navigation)');
    }

    var icon = document.createElement('span');
    icon.className = 'gi';
    icon.textContent = item.icon;
    var label = document.createElement('span');
    label.textContent = item.label;
    el.appendChild(icon);
    el.appendChild(label);
    nav.appendChild(el);
  });

  // ── More button ─────────────────────────────────────────────────────────
  var moreBtn = document.createElement('button');
  moreBtn.className = 'gn-more-btn';
  var moreIcon = document.createElement('span');
  moreIcon.className = 'gi';
  moreIcon.textContent = '\u2261';
  var moreLabel = document.createElement('span');
  moreLabel.textContent = 'More';
  moreBtn.appendChild(moreIcon);
  moreBtn.appendChild(moreLabel);
  nav.appendChild(moreBtn);

  // ── More panel ──────────────────────────────────────────────────────────
  var panel = document.createElement('div');
  panel.className = 'gn-panel';

  MORE_ITEMS.forEach(function(item) {
    var a = document.createElement('a');
    a.href = item.href;
    a.textContent = item.label;
    if (currentPath === item.href) a.className = 'active';
    panel.appendChild(a);
  });

  // Sign Out button (only for authenticated users)
  if (isAuthenticated) {
    var signOutBtn = document.createElement('button');
    signOutBtn.className = 'gn-signout';
    signOutBtn.textContent = 'Sign Out';
    signOutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (window.BridgeAuth && typeof window.BridgeAuth.signOut === 'function') {
        window.BridgeAuth.signOut();
      } else {
        localStorage.removeItem('bridge_token');
        localStorage.removeItem('bridge_user_token');
        localStorage.removeItem('bridge_user');
        document.cookie = 'bridge_token=;path=/;max-age=0';
        window.location.href = '/onboarding.html';
      }
    });
    panel.appendChild(signOutBtn);
  }

  moreBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    panel.classList.toggle('open');
    moreIcon.textContent = panel.classList.contains('open') ? '\u2715' : '\u2261';
  });

  document.addEventListener('click', function() {
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      moreIcon.textContent = '\u2261';
    }
  });

  document.body.appendChild(panel);
  document.body.appendChild(nav);
})();
