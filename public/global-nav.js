/**
 * Bridge AI OS — Global Navigation Bar
 * Auto-injects a fixed bottom nav on every page.
 * Add <script src="/global-nav.js" defer></script> to any page.
 */
(function() {
  'use strict';

  const currentPath = window.location.pathname;

  // Smart auth label
  const _token = localStorage.getItem('bridge_token') || localStorage.getItem('bridge_user_token');
  let _authLabel = 'Sign In';
  let _authHref = '/onboarding.html';
  if (_token) {
    _authHref = '/console.html';
    try {
      const u = JSON.parse(localStorage.getItem('bridge_user'));
      _authLabel = (u && (u.name || u.email || '').split(' ')[0]) || 'Account';
    } catch (_) { _authLabel = 'Account'; }
  }

  const NAV_ITEMS = [
    { label: 'Home', href: '/', icon: '\u2302' },
    { label: 'Portal', href: '/portal.html', icon: '\u{1F9E0}' },
    { label: 'Economy', href: '/economy.html', icon: '\u26A1' },
    { label: _authLabel, href: _authHref, icon: _token ? '\u{1F464}' : '\u{1F511}' },
    { label: 'Dashboard', href: '/ui.html', icon: '\u2699' },
  ];

  const MORE_ITEMS = [
    { label: 'Admin', href: '/admin-command.html', adminOnly: true },
    { label: 'Revenue', href: '/admin-revenue.html', adminOnly: true },
    { label: 'Voice AI', href: '/voice.html' },
    { label: 'Avatar', href: '/avatar.html' },
    { label: 'CRM', href: '/crm.html' },
    { label: 'Invoicing', href: '/invoicing.html' },
    { label: 'Marketplace', href: '/marketplace.html' },
    { label: 'Trading', href: '/trading.html' },
    { label: 'Agents', href: '/agents.html' },
    { label: 'Brain', href: '/ehsa-brain.html' },
    { label: 'Topology', href: '/topology.html' },
    { label: 'Control', href: '/control.html' },
    { label: 'Legal', href: '/legal.html' },
    { label: 'Wallet', href: '/wallet.html' },
    { label: 'Settings', href: '/settings.html' },
  ];

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    .gn{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:rgba(5,10,15,.95);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid rgba(0,200,255,.15);display:flex;justify-content:space-around;align-items:center;padding:0;height:56px;font-family:system-ui,sans-serif}
    @supports not (backdrop-filter:blur(12px)){.gn{background:rgba(5,10,15,.98)}}
    .gn a,.gn span[role="link"]{display:flex;flex-direction:column;align-items:center;text-decoration:none;color:#7a8fa0;font-size:.75rem;padding:6px 8px;transition:color .2s;min-width:50px;gap:2px}
    .gn a:hover,.gn a.active,.gn span[role="link"].active{color:#00c8ff;text-decoration:none}
    .gn a .gi{font-size:1.2rem;line-height:1}
    .gn a.active .gi,.gn span[role="link"].active .gi{filter:drop-shadow(0 0 4px rgba(0,200,255,.5))}
    .gn-more-btn{display:flex;flex-direction:column;align-items:center;color:#7a8fa0;font-size:.75rem;padding:6px 8px;cursor:pointer;min-width:50px;gap:2px;background:none;border:none;font-family:inherit}
    .gn-more-btn:hover{color:#00c8ff}
    .gn-more-btn .gi{font-size:1.2rem;line-height:1}
    .gn-panel{display:none;position:fixed;bottom:56px;left:0;right:0;z-index:9998;background:rgba(5,10,15,.97);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid rgba(0,200,255,.1);padding:12px;max-height:60vh;overflow-y:auto}
    @supports not (backdrop-filter:blur(12px)){.gn-panel{background:rgba(5,10,15,.99)}}
    .gn-panel.open{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px}
    .gn-panel a{display:block;padding:10px 8px;text-align:center;color:#b0bec5;font-size:.75rem;text-decoration:none;border-radius:8px;background:rgba(26,45,64,.3);border:1px solid rgba(26,45,64,.5);transition:all .15s}
    .gn-panel a:hover{background:rgba(0,200,255,.08);border-color:rgba(0,200,255,.3);color:#00c8ff;text-decoration:none}
    .gn-panel a.active{border-color:#00c8ff;color:#00c8ff}
    .gn a:focus-visible,.gn-more-btn:focus-visible,.gn-panel a:focus-visible{outline:2px solid #00c8ff;outline-offset:2px}
    body{padding-bottom:60px!important}
  `;
  document.head.appendChild(style);

  // Build nav
  const nav = document.createElement('div');
  nav.className = 'gn';

  NAV_ITEMS.forEach(item => {
    const isActive = currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href))
      || (item.href === '/' && (currentPath === '/' || currentPath === '/index.html'));

    // If user is on the Home page, render a span instead of a link
    let el;
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

    // Disambiguate Economy link from any page-level Economy link
    if (item.label === 'Economy') {
      el.setAttribute('aria-label', 'Economy (navigation)');
    }

    const icon = document.createElement('span');
    icon.className = 'gi';
    icon.textContent = item.icon;
    const label = document.createElement('span');
    label.textContent = item.label;
    el.appendChild(icon);
    el.appendChild(label);
    nav.appendChild(el);
  });

  // More button
  const moreBtn = document.createElement('button');
  moreBtn.className = 'gn-more-btn';
  const moreIcon = document.createElement('span');
  moreIcon.className = 'gi';
  moreIcon.textContent = '\u2261';
  const moreLabel = document.createElement('span');
  moreLabel.textContent = 'More';
  moreBtn.appendChild(moreIcon);
  moreBtn.appendChild(moreLabel);
  nav.appendChild(moreBtn);

  // More panel
  const panel = document.createElement('div');
  panel.className = 'gn-panel';
  // Determine if user has admin access (token present + admin/owner role)
  let _isAdmin = false;
  try {
    const u = JSON.parse(localStorage.getItem('bridge_user'));
    _isAdmin = _token && u && (u.role === 'admin' || u.role === 'owner');
  } catch (_) {}

  MORE_ITEMS.forEach(item => {
    if (item.adminOnly && !_isAdmin) return; // hide admin links from non-admins
    const a = document.createElement('a');
    a.href = item.href;
    a.textContent = item.label;
    if (currentPath === item.href) a.className = 'active';
    panel.appendChild(a);
  });

  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
    moreIcon.textContent = panel.classList.contains('open') ? '\u2715' : '\u2261';
  });

  document.addEventListener('click', () => {
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      moreIcon.textContent = '\u2261';
    }
  });

  document.body.appendChild(panel);
  document.body.appendChild(nav);
})();
