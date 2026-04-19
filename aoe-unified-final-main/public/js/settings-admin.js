const API = window.location.origin;

// ── auth model ────────────────────────────────
// Zero client-side token handling. Identity comes from the signed HttpOnly
// session cookie bridge_admin_session (JS cannot read it; XSS cannot
// exfiltrate it). CSRF protection via the readable bridge_csrf cookie
// mirrored into X-CSRF-Token on mutating requests.
let SESSION = null;   // { email, exp, super_admin } | null

function readCookie(name){
  const parts = document.cookie.split(';');
  for (const p of parts){
    const [k, ...v] = p.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}
function getActor(){ return SESSION ? SESSION.email : ''; }

async function fetchJSON(path, opts){
  opts = opts || {};
  opts.credentials = 'include';
  opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  opts.cache = 'no-store';
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD'){
    const csrf = readCookie('bridge_csrf');
    if (csrf) opts.headers['X-CSRF-Token'] = csrf;
  }
  const r = await fetch(API + path, opts);
  if (r.status === 401){
    // Hard-fail visibility: surface the login overlay instead of swallowing
    SESSION = null;
    showLoginOverlay('session expired — re-authenticate');
    throw new Error('session_expired');
  }
  if (!r.ok){
    const t = await r.text().catch(() => '');
    throw new Error('HTTP '+r.status+': '+(t||r.statusText));
  }
  return r.json();
}

// ── login overlay ─────────────────────────────
// Rendered on demand when no session cookie is present, or on 401. The
// overlay posts to /settings/session which issues the HttpOnly cookie and
// returns ok. Credentials never touch localStorage.
function showLoginOverlay(reason){
  if (document.getElementById('loginOverlay')) return;
  const div = document.createElement('div');
  div.id = 'loginOverlay';
  div.innerHTML =
    '<div class="login-backdrop">'+
      '<form class="login-card" id="loginForm">'+
        '<h3>BRIDGE AI OS · ADMIN SIGN-IN</h3>'+
        (reason ? '<div class="login-note">'+String(reason).replace(/[<>]/g,'')+'</div>' : '')+
        '<label>super-admin email</label>'+
        '<input name="email" type="email" autocomplete="username" required>'+
        '<label>admin token</label>'+
        '<input name="admin_token" type="password" autocomplete="current-password" required>'+
        '<div class="login-actions">'+
          '<button type="submit">sign in</button>'+
        '</div>'+
        '<div class="login-err" id="loginErr"></div>'+
      '</form>'+
    '</div>';
  document.body.appendChild(div);
  const form = div.querySelector('#loginForm');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const body = { email: String(fd.get('email')||'').toLowerCase().trim(), admin_token: String(fd.get('admin_token')||'') };
    const errEl = document.getElementById('loginErr');
    errEl.textContent = '';
    try {
      const r = await fetch(API + '/settings/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok){ errEl.textContent = j.error || ('HTTP '+r.status); return; }
      SESSION = { email: j.email, exp: j.exp, super_admin: true };
      div.remove();
      logLine('signed in as '+j.email, 'info');
      await bootstrap();
    } catch(e){
      errEl.textContent = 'network error: '+e.message;
    }
  });
  // focus the first empty input
  setTimeout(() => {
    const emailInput = form.querySelector('input[name=email]');
    const tokenInput = form.querySelector('input[name=admin_token]');
    if (!emailInput.value) emailInput.focus();
    else tokenInput.focus();
  }, 30);
}

async function checkSession(){
  try {
    const r = await fetch(API + '/settings/session', { credentials:'include', cache:'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function doLogout(){
  try {
    await fetch(API + '/settings/session/logout', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': readCookie('bridge_csrf') },
    });
  } catch {}
  SESSION = null;
  window.location.href = '/settings/admin?auth=logged_out';
}
window.bridgeLogout = doLogout;
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('signoutBtn');
  if (btn) btn.addEventListener('click', doLogout);
});

function pad(n){ return n<10?'0'+n:n }
function clock(){ const d=new Date(); return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()) }
function logLine(msg, kind){
  const el = document.getElementById('log');
  const row = document.createElement('div');
  if (kind) row.className = kind;
  row.innerHTML = '<span class="t">'+clock()+'</span>'+String(msg).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  el.prepend(row);
  while (el.children.length > 200) el.removeChild(el.lastChild);
}

// --- Panel A: System Metrics
async function loadOverview(){
  try{
    const d = await fetchJSON('/admin/overview');
    document.getElementById('m_conn').textContent = 'online';
    document.getElementById('m_up').textContent   = (d.services_up ?? '—') + ' / ' + (d.services_total ?? '—');
    document.getElementById('m_cpu').textContent  = (d.cpu_avg ?? '—') + '%';
    document.getElementById('m_mem').textContent  = (d.mem_avg ?? '—') + '%';
    document.getElementById('m_commit').textContent = (d.git_commit || '—').slice(0,7);
  } catch(e){
    document.getElementById('m_conn').textContent = 'offline';
    logLine('overview: '+e.message, 'err');
  }
  try{
    const h = await fetchJSON('/settings/healthz');
    document.getElementById('m_store').textContent = h.ok ? 'ok' : 'fail';
  } catch(e){ document.getElementById('m_store').textContent = 'err'; }
}

// --- Panel B: Tier Distribution + Panel C: Feature Flags + Panel D populator
let DEFAULTS = null;
let RUNTIME  = null;

async function loadSettings(){
  try{
    DEFAULTS = await fetchJSON('/settings/defaults');
    RUNTIME  = await fetchJSON('/settings/runtime');
    renderTiers();
    renderResolvedFor(getActor());
    renderLimitsSelector();
  } catch(e){
    logLine('settings load: '+e.message, 'err');
  }
}

function renderTiers(){
  const users = RUNTIME.users || {};
  const counts = {};
  Object.keys(DEFAULTS.tiers).forEach(t => counts[t] = 0);
  Object.values(users).forEach(u => { counts[u.tier] = (counts[u.tier] || 0) + 1; });
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  document.getElementById('b_total').textContent = total + ' users';
  const body = document.getElementById('tierBody');
  body.innerHTML = '';
  Object.keys(counts).forEach(tier => {
    const n = counts[tier];
    const pct = total ? Math.round(100*n/total) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="chip '+(tier==='super_admin'?'err':tier==='free'?'warn':'')+'">'+tier+'</span></td>'+
      '<td class="num">'+n+'</td>'+
      '<td class="num">'+pct+'%<div class="bar"><span style="width:'+pct+'%"></span></div></td>'+
      '<td><code style="font-size:10px; color:var(--muted)">'+(DEFAULTS.tiers[tier].description || '').slice(0,50)+'</code></td>';
    body.appendChild(tr);
  });
}

async function renderResolvedFor(email){
  if (!email){ document.getElementById('flagsBody').textContent = '(no actor email)'; return; }
  const resolved = await fetchJSON('/settings/resolve?email='+encodeURIComponent(email));
  document.getElementById('actorEmail').textContent = resolved.email;
  document.getElementById('actorTier').textContent  = resolved.tier;
  document.getElementById('resolvedJson').textContent = JSON.stringify(resolved, null, 2);
  const body = document.getElementById('flagsBody');
  body.innerHTML = '';
  const features = resolved.effective.features || {};
  Object.keys(features).sort().forEach(k => {
    const on = features[k] !== false;
    const span = document.createElement('span');
    span.className = 'chip ' + (on ? '' : 'err');
    span.textContent = (on ? '✓ ' : '✗ ') + k;
    body.appendChild(span);
  });
  // Apply to DOM for visual hide/show
  if (window.SettingsClient) SettingsClient.applyToDOM(resolved.effective, resolved.tier);
}

function renderLimitsSelector(){
  const sel = document.getElementById('limTierSel');
  sel.innerHTML = '';
  Object.keys(DEFAULTS.tiers).forEach(t => {
    const o = document.createElement('option'); o.value = t; o.textContent = t;
    sel.appendChild(o);
  });
  sel.value = 'pro';
  sel.onchange = renderLimitsForSelectedTier;
  renderLimitsForSelectedTier();
}

function renderLimitsForSelectedTier(){
  const t = document.getElementById('limTierSel').value;
  const tierCfg = DEFAULTS.tiers[t] || {};
  const tierLimits = tierCfg.limits || {};
  const globalLimits = DEFAULTS.global.limits || {};
  const merged = Object.assign({}, globalLimits, tierLimits);
  const body = document.getElementById('limitsBody');
  body.innerHTML = '';
  Object.keys(merged).sort().forEach(k => {
    const v = merged[k];
    const row = document.createElement('div');
    row.className = 'metric';
    row.innerHTML = '<span>'+k+'</span><span class="v">'+(v===-1?'∞':v)+'</span>';
    body.appendChild(row);
  });
}

// --- Tier apply action
document.getElementById('applyTierBtn').addEventListener('click', async () => {
  const email = document.getElementById('limTarget').value.trim().toLowerCase();
  const tier  = document.getElementById('limTierSel').value;
  if (!email){ logLine('target email required', 'warn'); return; }
  if (!confirm('Apply tier "'+tier+'" to '+email+'?')) return;
  try{
    const r = await fetchJSON('/settings/tier', { method:'POST', body: JSON.stringify({ email, tier })});
    logLine('tier → '+email+' = '+tier, 'info');
    await loadSettings();
    await loadAudit();
  } catch(e){ logLine('tier apply failed: '+e.message, 'err'); }
});

// --- Panel E: Audit Log
async function loadAudit(){
  try{
    const d = await fetchJSON('/settings/audit?limit=50');
    document.getElementById('auditCount').textContent = d.total + ' entries';
    const log = document.getElementById('log');
    log.innerHTML = '';
    d.entries.slice().reverse().forEach(e => {
      const msg = e.actor + ' · ' + e.action + (e.target ? ' → '+e.target : '');
      logLine(msg, e.action.includes('revoke') ? 'warn' : 'info');
    });
  } catch(e){ logLine('audit: '+e.message, 'err'); }
}

// --- Panel F: Workflows
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

let WORKFLOWS = [];

async function loadWorkflows(){
  try{
    const d = await fetchJSON('/settings/workflows');
    WORKFLOWS = d.workflows || [];
    document.getElementById('wfCount').textContent = d.count + ' available · tier=' + d.tier;
    renderWorkflows();
  } catch(e){
    document.getElementById('wfBody').innerHTML = '<div class="metric"><span>error</span><span class="v err">'+esc(e.message)+'</span></div>';
  }
}

function renderWorkflows(){
  const body = document.getElementById('wfBody');
  if (!WORKFLOWS.length){ body.innerHTML = '<div class="metric"><span>no workflows</span></div>'; return; }
  // Group by category
  const byCat = {};
  for (const w of WORKFLOWS){ (byCat[w.category] = byCat[w.category] || []).push(w); }
  body.innerHTML = '';
  Object.keys(byCat).sort().forEach(cat => {
    const h = document.createElement('div');
    h.style.cssText = 'font-size:10px; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase; margin:10px 0 4px; border-bottom:1px solid var(--line2); padding-bottom:3px';
    h.textContent = '— ' + cat + ' —';
    body.appendChild(h);
    byCat[cat].forEach(w => body.appendChild(renderWorkflowRow(w)));
  });
}

function renderWorkflowRow(w){
  const row = document.createElement('div');
  row.className = 'wf-row';
  const dangerCls = w.danger ? 'wf-danger-' + w.danger : '';
  row.innerHTML =
    '<div class="wf-meta">'+
      '<div class="wf-name">'+esc(w.name)+(w.danger?' <span class="'+dangerCls+'" style="font-size:10px;letter-spacing:1px">⚠ '+esc(w.danger)+'</span>':'')+'</div>'+
      '<div class="wf-desc">'+esc(w.description || '')+'</div>'+
      '<div class="wf-tags">'+
        '<span class="chip wf-tier-'+esc(w.required_tier)+'">'+esc(w.required_tier)+'</span>'+
        (w.required_capability ? '<span class="chip">cap: '+esc(w.required_capability)+'</span>' : '')+
        (w.estimated_duration_s ? '<span class="chip">~'+w.estimated_duration_s+'s</span>' : '')+
      '</div>'+
    '</div>';
  const btn = document.createElement('button');
  btn.className = 'act';
  btn.textContent = 'run';
  btn.onclick = () => openWorkflowDialog(w);
  row.appendChild(btn);
  return row;
}

function openWorkflowDialog(w){
  const root = document.getElementById('modalRoot');
  const params = w.params || [];
  const fields = params.map(p => {
    const id = 'wfp_' + p.name;
    let input;
    if (Array.isArray(p.values) && p.values.length){
      input = '<select id="'+id+'">' + p.values.map(v => '<option value="'+esc(v)+'">'+esc(v)+'</option>').join('') + '</select>';
    } else {
      const type = (p.type === 'integer' || p.type === 'number') ? 'number' : (p.type === 'email' ? 'email' : 'text');
      const attrs =
        (p.default !== undefined ? ' value="'+esc(p.default)+'"' : '') +
        (p.pattern ? ' pattern="'+esc(p.pattern)+'"' : '') +
        (p.min !== undefined ? ' min="'+esc(p.min)+'"' : '') +
        (p.min_length ? ' minlength="'+esc(p.min_length)+'"' : '') +
        (p.required ? ' required' : '');
      input = '<input id="'+id+'" type="'+type+'"'+attrs+' placeholder="'+esc(p.label || p.name)+'">';
    }
    return '<div class="wf-param"><label for="'+id+'">'+esc(p.label || p.name)+(p.required?' *':'')+'</label>'+input+'</div>';
  }).join('');

  root.innerHTML =
    '<div class="modal-backdrop" id="wfModalBd">'+
      '<div class="modal">'+
        '<h3>'+esc(w.name)+'</h3>'+
        '<div style="font-size:10px;color:var(--muted);margin-bottom:10px">'+esc(w.description||'')+'</div>'+
        '<form id="wfForm">'+fields+'</form>'+
        '<div id="wfPlanOut"></div>'+
        '<div class="modal-actions">'+
          '<button class="act" id="wfCancel">cancel</button>'+
          '<button class="act" id="wfPlan">plan</button>'+
        '</div>'+
      '</div>'+
    '</div>';

  document.getElementById('wfCancel').onclick = closeWorkflowDialog;
  document.getElementById('wfPlan').onclick = async () => {
    const body = { params: {} };
    params.forEach(p => {
      const v = document.getElementById('wfp_' + p.name).value;
      if (v !== '') body.params[p.name] = v;
    });
    try{
      const plan = await fetchJSON('/settings/workflows/' + encodeURIComponent(w.id) + '/plan', {
        method: 'POST', body: JSON.stringify(body)
      });
      renderPlanPreview(w, plan);
    } catch(e){
      document.getElementById('wfPlanOut').innerHTML = '<div class="wf-confirm" style="color:var(--err);background:rgba(255,77,109,.08)">plan failed: '+esc(e.message)+'</div>';
    }
  };
}

function renderPlanPreview(w, plan){
  const out = document.getElementById('wfPlanOut');
  const confirmStep = (plan.steps || []).find(s => s.type === 'confirm');
  const httpSteps   = (plan.steps || []).filter(s => s.type !== 'confirm');
  out.innerHTML =
    (confirmStep ? '<div class="wf-confirm">'+esc(confirmStep.message)+'</div>' : '') +
    '<details open><summary>execution plan ('+httpSteps.length+' step'+(httpSteps.length===1?'':'s')+')</summary>'+
      '<pre class="json">'+esc(JSON.stringify(httpSteps, null, 2))+'</pre>'+
    '</details>';
  // Replace plan button with execute button
  const planBtn = document.getElementById('wfPlan');
  planBtn.textContent = 'execute';
  planBtn.onclick = async () => {
    if (!confirm('Execute workflow "'+w.name+'"? This will fire '+httpSteps.length+' HTTP step(s).')) return;
    logLine('workflow exec: '+w.id, w.danger === 'CRITICAL' ? 'err' : (w.danger === 'HIGH' ? 'warn' : 'info'));
    for (const step of httpSteps){
      try {
        const opts = {
          method: step.type === 'http_post' ? 'POST' : 'GET',
          headers: step.headers || {},
        };
        if (step.body) opts.body = JSON.stringify(step.body);
        const r = await fetchJSON(step.path, opts);
        logLine('  '+step.path+' → ok', 'info');
      } catch(e){
        logLine('  '+step.path+' → '+e.message, 'err');
        if (!confirm('Step failed: '+e.message+'\n\nContinue with remaining steps?')) break;
      }
    }
    closeWorkflowDialog();
    loadAudit();
  };
}

function closeWorkflowDialog(){
  document.getElementById('modalRoot').innerHTML = '';
}

// --- AI Summary banner ---
async function loadAiSummary(){
  const bar = document.getElementById('aiSummaryBar');
  const textEl = document.getElementById('aiSummaryText');
  const metaEl = document.getElementById('aiSummaryMeta');
  const statEl = document.getElementById('aiSummaryStatus');
  try{
    const d = await fetchJSON('/settings/summary');
    const s = d.ai_summary;
    bar.className = s ? '' : 'offline';
    if (s){
      textEl.textContent = s.reason || '(no narrative)';
      metaEl.textContent = 'mode=' + s.mode + ' · ' + d.total_users + ' users · ' + d.audit.total + ' audit entries';
      statEl.textContent = 'online';
      statEl.style.color = 'var(--accent)';
    } else {
      textEl.textContent = 'advisor offline (' + (d.ai_error || 'not configured') + ')';
      metaEl.textContent = d.total_users + ' users · ' + d.audit.total + ' audit entries · summary unavailable';
      statEl.textContent = 'offline';
      statEl.style.color = 'var(--muted)';
    }
    // Also render Panel H (reporting) from this same call
    renderReporting(d);
  } catch(e){
    bar.className = 'err';
    textEl.textContent = 'summary load failed: ' + e.message;
    metaEl.textContent = '';
    statEl.textContent = 'error';
    statEl.style.color = 'var(--err)';
  }
}

// --- Panel H: Reporting ---
function renderReporting(d){
  const body = document.getElementById('rpBody');
  document.getElementById('rpStatus').textContent = 'generated ' + new Date(d.generated_at).toLocaleTimeString();
  body.innerHTML = '';
  const card = (title, value, hint) => {
    const el = document.createElement('div');
    el.style.cssText = 'border:1px solid var(--line); border-radius:6px; padding:10px; background:var(--panel2)';
    el.innerHTML =
      '<div style="font-size:10px; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase">'+esc(title)+'</div>'+
      '<div style="font-size:18px; color:var(--accent); margin:4px 0; font-variant-numeric:tabular-nums">'+esc(value)+'</div>'+
      (hint ? '<div style="font-size:10px; color:var(--muted)">'+esc(hint)+'</div>' : '');
    return el;
  };
  body.appendChild(card('Total users', d.total_users, 'across all tiers'));
  Object.keys(d.tier_counts).forEach(t => {
    body.appendChild(card(t+' tier', d.tier_counts[t], (100 * d.tier_counts[t] / Math.max(1, d.total_users)).toFixed(0) + '%'));
  });
  body.appendChild(card('Audit entries', d.audit.total, 'total logged'));
  // Top 3 audit actions
  const top = Object.entries(d.audit.action_counts || {}).sort((a,b) => b[1]-a[1]).slice(0,3);
  top.forEach(([k,v]) => body.appendChild(card(k, v, 'action count')));
}

// --- Panel G: Config Advisor ---
let CURRENT_PROPOSAL = null;

async function initAdvisorPanel(){
  // Populate toggle dropdown with schema feature keys
  try{
    const schema = await fetchJSON('/settings/config/schema');
    const sel = document.getElementById('gaCtxToggle');
    schema.features.forEach(k => {
      const o = document.createElement('option'); o.value = k; o.textContent = k;
      sel.appendChild(o);
    });
  } catch(e){ logLine('schema load: '+e.message, 'err'); }

  // Advisor health status chip
  try{
    const h = await fetchJSON('/settings/advisor/healthz');
    document.getElementById('gaStatus').textContent = 'advisor: ' + (h.mode || 'unknown') + (h.model ? ' ('+h.model+')' : '');
  } catch(e){
    document.getElementById('gaStatus').textContent = 'advisor: offline';
  }

  // Default target to actor
  document.getElementById('gaTarget').value = getActor();

  document.getElementById('gaProposeBtn').addEventListener('click', proposeConfig);
}

async function proposeConfig(){
  const target = document.getElementById('gaTarget').value.trim().toLowerCase();
  const context = {};
  const os    = document.getElementById('gaCtxOs').value;
  const env   = document.getElementById('gaCtxEnv').value;
  const tier  = document.getElementById('gaCtxTier').value;
  const togg  = document.getElementById('gaCtxToggle').value;
  if (os)   context.os = os;
  if (env)  context.env = env;
  if (tier) context.requested_tier = tier;
  if (togg) context.toggle_feature = togg;
  if (!target){ logLine('target email required', 'warn'); return; }
  if (!Object.keys(context).length){ logLine('select at least one context dimension', 'warn'); return; }

  const out = document.getElementById('gaOut');
  out.innerHTML = '<div class="metric"><span>advisor</span><span class="v">proposing…</span></div>';
  try{
    const d = await fetchJSON('/settings/config/propose', {
      method:'POST', body: JSON.stringify({ target_email: target, context })
    });
    CURRENT_PROPOSAL = d;
    renderProposalPreview(d);
    logLine('proposal '+d.proposal_id+' ('+d.mode+')', 'info');
  } catch(e){
    out.innerHTML = '<div class="metric"><span>advisor error</span><span class="v err">'+esc(e.message)+'</span></div>';
    logLine('propose failed: '+e.message, 'err');
  }
}

function renderProposalPreview(d){
  const out = document.getElementById('gaOut');
  const rows = [];
  d.diff.added.forEach(x => rows.push('<div class="diff-row diff-add">'+esc(x.path)+' = '+esc(JSON.stringify(x.to))+'</div>'));
  d.diff.modified.forEach(x => rows.push('<div class="diff-row diff-mod">'+esc(x.path)+' : '+esc(JSON.stringify(x.from))+' → '+esc(JSON.stringify(x.to))+'</div>'));
  d.diff.removed.forEach(x => rows.push('<div class="diff-row diff-rem">'+esc(x.path)+' (was '+esc(JSON.stringify(x.from))+')</div>'));
  const empty = !rows.length;

  out.innerHTML =
    '<div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:var(--muted); margin-bottom:4px">'+
      '<span>target: <b style="color:var(--text)">'+esc(d.target)+'</b> · tier: <b style="color:var(--text)">'+esc(d.tier)+'</b></span>'+
      '<span>proposal: '+esc(d.proposal_id)+' · mode: '+esc(d.mode || 'unknown')+'</span>'+
    '</div>'+
    '<div style="font-size:11px; color:var(--info); margin-bottom:6px">reason: '+esc(d.reason || '—')+'</div>'+
    '<div class="diff-list">'+(empty ? '<div class="diff-empty">no changes in proposal</div>' : rows.join(''))+'</div>'+
    '<div style="margin-top:8px; display:flex; gap:8px; justify-content:flex-end">'+
      '<button class="act" id="gaReject">reject</button>'+
      '<button class="act" id="gaCommit"'+(empty?' disabled':'')+'>commit</button>'+
    '</div>';
  document.getElementById('gaReject').onclick = () => { CURRENT_PROPOSAL = null; out.innerHTML = ''; logLine('proposal rejected', 'warn'); };
  document.getElementById('gaCommit').onclick = commitProposal;
}

async function commitProposal(){
  if (!CURRENT_PROPOSAL){ logLine('no proposal to commit', 'warn'); return; }
  const d = CURRENT_PROPOSAL;
  if (!confirm('Commit proposal '+d.proposal_id+' to '+d.target+'?\n\n'+
               d.diff.added.length+' additions, '+d.diff.modified.length+' modifications, '+d.diff.removed.length+' removals.')) return;
  try{
    const r = await fetchJSON('/settings/config/commit', {
      method:'POST', body: JSON.stringify({
        target_email: d.target,
        proposed: d.proposed,
        reason: d.reason,
        proposal_id: d.proposal_id,
      })
    });
    logLine('proposal '+d.proposal_id+' committed → '+d.target, 'info');
    CURRENT_PROPOSAL = null;
    document.getElementById('gaOut').innerHTML = '<div class="metric"><span>committed</span><span class="v">'+esc(d.target)+'</span></div>';
    await loadSettings();
    await loadAudit();
    await loadAiSummary();
  } catch(e){
    logLine('commit failed: '+e.message, 'err');
  }
}

// --- bootstrap
async function bootstrap(){
  logLine('settings-admin init', 'info');
  await loadOverview();
  await loadSettings();
  await loadAudit();
  await loadWorkflows();
  await initAdvisorPanel();
  await loadAiSummary();
  // Intervals are registered only after bootstrap succeeds, so a 401 during
  // bootstrap surfaces the login overlay without a flood of background 401s.
  if (!window.__BRIDGE_INTERVALS_SET){
    window.__BRIDGE_INTERVALS_SET = true;
    setInterval(loadOverview,  5000);
    setInterval(loadAudit,    15000);
    setInterval(loadAiSummary,60000);
  }
}

window.addEventListener('load', async () => {
  // URL hints tell us why we're here (e.g. ?auth=expired after 401 redirect).
  const qs = new URLSearchParams(location.search);
  const reason = qs.get('auth') === 'expired' ? 'session expired — sign in again' :
                 qs.get('auth') === 'logged_out' ? 'signed out' : null;
  const s = await checkSession();
  if (!s || !s.ok){
    showLoginOverlay(reason || 'sign in to continue');
    return;
  }
  SESSION = { email: s.email, exp: s.exp, super_admin: !!s.super_admin };
  await bootstrap();
});