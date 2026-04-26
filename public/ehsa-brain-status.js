/**
 * Bridge AI OS — EHSA Brain Status Pill
 * Self-contained. Include on any page:
 *   <script src="/ehsa-brain-status.js" defer></script>
 *
 * Polls /api/brain/status every 30s, renders a small floating pill in the
 * bottom-left showing brain health, EHSA signal, and on-chain treasury link.
 * Never blocks the page. Never errors visibly. Fails silent to a muted dot.
 */
(function () {
  'use strict';
  if (window.__ehsaBrainStatusLoaded) return;
  window.__ehsaBrainStatusLoaded = true;

  var POLL_MS = 30000;
  var ENDPOINT = '/api/brain/status';
  var LINEASCAN_VAULT = 'https://lineascan.build/address/0x6daA8db214B7c7D95fB26d98c4Fc4DE82430572A';

  var css = ''
    + '.ebs-pill{position:fixed;left:16px;bottom:16px;z-index:9998;'
    + 'display:flex;align-items:center;gap:8px;padding:8px 12px;'
    + 'background:rgba(13,19,33,0.92);border:1px solid rgba(99,179,237,0.25);'
    + 'border-radius:999px;backdrop-filter:blur(8px);'
    + 'font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;'
    + 'color:#a0aec0;box-shadow:0 4px 20px rgba(0,0,0,0.4);'
    + 'transition:opacity .2s,transform .2s;opacity:0;transform:translateY(8px);'
    + 'cursor:pointer;text-decoration:none;}'
    + '.ebs-pill.visible{opacity:1;transform:translateY(0);}'
    + '.ebs-pill:hover{border-color:rgba(99,179,237,0.6);}'
    + '.ebs-dot{width:8px;height:8px;border-radius:50%;background:#4a5568;'
    + 'box-shadow:0 0 0 0 rgba(104,211,145,0.4);}'
    + '.ebs-dot.ok{background:#68d391;animation:ebsPulse 2s infinite;}'
    + '.ebs-dot.degraded{background:#ecc94b;}'
    + '.ebs-dot.down{background:#fc8181;}'
    + '@keyframes ebsPulse{0%{box-shadow:0 0 0 0 rgba(104,211,145,0.6);}'
    + '70%{box-shadow:0 0 0 6px rgba(104,211,145,0);}'
    + '100%{box-shadow:0 0 0 0 rgba(104,211,145,0);}}'
    + '.ebs-label{color:#f7fafc;font-weight:600;}'
    + '.ebs-sep{color:#2d3748;}'
    + '.ebs-chain{color:#63b3ed;}'
    + '@media (max-width:640px){.ebs-pill{left:8px;bottom:8px;padding:6px 10px;font-size:10px;}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var pill = document.createElement('a');
  pill.className = 'ebs-pill';
  pill.href = LINEASCAN_VAULT;
  pill.target = '_blank';
  pill.rel = 'noopener';
  pill.setAttribute('aria-label', 'EHSA Brain status — click to view Treasury on Lineascan');
  pill.innerHTML = ''
    + '<span class="ebs-dot" id="ebs-dot"></span>'
    + '<span class="ebs-label" id="ebs-label">brain</span>'
    + '<span class="ebs-sep">·</span>'
    + '<span id="ebs-ehsa">ehsa —</span>'
    + '<span class="ebs-sep">·</span>'
    + '<span class="ebs-chain" id="ebs-chain">linea</span>';

  function mount() {
    document.body.appendChild(pill);
    requestAnimationFrame(function () { pill.classList.add('visible'); });
    refresh();
    setInterval(refresh, POLL_MS);
  }

  function refresh() {
    fetch(ENDPOINT, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var dot = document.getElementById('ebs-dot');
        var label = document.getElementById('ebs-label');
        var ehsa = document.getElementById('ebs-ehsa');
        var chain = document.getElementById('ebs-chain');
        if (!d) { dot.className = 'ebs-dot down'; label.textContent = 'brain offline'; return; }
        if (d.brain && d.brain.healthy) {
          dot.className = d.degraded ? 'ebs-dot degraded' : 'ebs-dot ok';
          label.textContent = 'brain ' + (d.brain.latency_ms || '?') + 'ms';
        } else if (d.degraded) {
          dot.className = 'ebs-dot degraded';
          label.textContent = 'brain degraded';
        } else {
          dot.className = 'ebs-dot down';
          label.textContent = 'brain offline';
        }
        var p = (d.ehsa && d.ehsa.patients) || 0;
        var a = (d.ehsa && d.ehsa.appointments) || 0;
        ehsa.textContent = 'ehsa ' + p + 'p/' + a + 'a';
        if (d.chain && d.chain.network) chain.textContent = d.chain.network;
      })
      .catch(function () {
        var dot = document.getElementById('ebs-dot');
        var label = document.getElementById('ebs-label');
        if (dot) dot.className = 'ebs-dot down';
        if (label) label.textContent = 'brain offline';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
