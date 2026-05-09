// settings-client.js — frontend enforcement SDK
//
// Resolves the effective settings for a given email and applies them to the DOM:
//   - [data-feature="X"] elements are hidden if features[X] === false
//   - [data-limit="X"] elements have their text set to the limit value
//   - document.body.dataset.tier = resolved tier
//   - Triggers 'settings:resolved' CustomEvent with { detail: effective } on window
//
// Usage:
//   <script src="/public/js/settings-client.js"></script>
//   <script>
//     SettingsClient.resolve({ email: 'ryanpcowan@gmail.com', token: 'ADMIN_TOKEN' })
//       .then(s => console.log('tier:', s.tier, 'features:', s.effective.features));
//   </script>
//
// API base is inferred from window.location.origin. Override via {apiBase:"..."}.

(function(global){
  'use strict';

  const DEFAULT_API = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';

  async function fetchJSON(url, opts){
    const r = await fetch(url, Object.assign({ cache: 'no-store' }, opts || {}));
    if (!r.ok){
      const body = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}: ${body || r.statusText}`);
    }
    return r.json();
  }

  function applyToDOM(effective, tier){
    if (typeof document === 'undefined') return;
    document.body.dataset.tier = tier;
    const features = (effective && effective.features) || {};
    document.querySelectorAll('[data-feature]').forEach(el => {
      const key = el.getAttribute('data-feature');
      const enabled = features[key] !== false;
      el.hidden = !enabled;
      el.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    });
    const limits = (effective && effective.limits) || {};
    document.querySelectorAll('[data-limit]').forEach(el => {
      const key = el.getAttribute('data-limit');
      if (key in limits){
        el.textContent = String(limits[key] === -1 ? '∞' : limits[key]);
      }
    });
    const ui = (effective && effective.ui) || {};
    if (ui.accent_color) document.documentElement.style.setProperty('--accent', ui.accent_color);
    if (ui.info_color)   document.documentElement.style.setProperty('--info',   ui.info_color);
    if (ui.warn_color)   document.documentElement.style.setProperty('--warn',   ui.warn_color);
    if (ui.err_color)    document.documentElement.style.setProperty('--err',    ui.err_color);
  }

  function featureEnabled(resolved, key){
    return !!(resolved && resolved.effective && resolved.effective.features && resolved.effective.features[key] !== false);
  }

  function limit(resolved, key){
    if (!resolved || !resolved.effective || !resolved.effective.limits) return null;
    return resolved.effective.limits[key];
  }

  async function resolve(opts){
    opts = opts || {};
    const apiBase = opts.apiBase || DEFAULT_API;
    const email   = opts.email;
    const token   = opts.token || (typeof localStorage !== 'undefined' ? localStorage.getItem('ORCHESTRA_ADMIN_TOKEN') : '');
    if (!email) throw new Error('settings-client: email required');

    const url = `${apiBase}/settings/resolve?email=${encodeURIComponent(email)}`;
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resolved = await fetchJSON(url, { headers });

    applyToDOM(resolved.effective, resolved.tier);

    if (typeof window !== 'undefined' && typeof CustomEvent === 'function'){
      window.dispatchEvent(new CustomEvent('settings:resolved', { detail: resolved }));
    }
    return resolved;
  }

  async function mutate(opts){
    opts = opts || {};
    const apiBase = opts.apiBase || DEFAULT_API;
    const actor   = opts.actor;
    const token   = opts.token;
    const path    = opts.path;
    const body    = opts.body || {};
    if (!actor || !token || !path) throw new Error('settings-client: actor, token, path required');
    return fetchJSON(`${apiBase}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Actor-Email': actor,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  const SettingsClient = { resolve, mutate, applyToDOM, featureEnabled, limit };

  if (typeof module !== 'undefined' && module.exports) module.exports = SettingsClient;
  global.SettingsClient = SettingsClient;
})(typeof window !== 'undefined' ? window : globalThis);
