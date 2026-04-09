/* Bridge AI OS — Main Application Script */
'use strict';

var $ = function(id) { return document.getElementById(id); };
var fmt = function(n) { return parseFloat(n).toLocaleString(undefined, { maximumFractionDigits: 1 }); };

/* ── Hamburger nav toggle ── */
(function() {
  var toggle = $('nav-toggle');
  var links = $('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function() {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? '\u2715' : '\u2630';
    });
  }
})();

/* ── Quick prompts ── */
document.querySelectorAll('.quick-prompt').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var input = $('demo-command');
    if (input) { input.value = btn.textContent; input.focus(); }
  });
});

/* ── Remove shimmer when data loads ── */
function clearShimmer(el) { if (el) el.classList.remove('loading'); }

/* ── Animate counter from current to target ── */
function animateCount(el, target) {
  var current = parseFloat(el.textContent.replace(/,/g, '')) || 0;
  if (current === target) return;
  var diff = target - current;
  var steps = 40;
  var stepVal = diff / steps;
  var i = 0;
  var interval = setInterval(function() {
    i++;
    current += stepVal;
    if (i >= steps) { current = target; clearInterval(interval); }
    el.textContent = fmt(current);
  }, 30);
}

/* ── Time-ago helper ── */
function timeAgo(ts) {
  if (!ts) return 'just now';
  var diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return Math.floor(diff) + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

/* ── Live Activity Ticker ── */
function buildTickerItem(item) {
  var div = document.createElement('div');
  div.className = 'ticker-item';
  var nameSpan = document.createElement('span');
  nameSpan.className = 'agent-name';
  nameSpan.textContent = item.from || item.agent || 'agent';
  div.appendChild(nameSpan);
  var actionSpan = document.createElement('span');
  actionSpan.className = 'action';
  var amountSpan = document.createElement('span');
  var amt = parseFloat(item.amount) || 0;
  var type = (item.type || '').toLowerCase();
  if (type === 'burn') {
    actionSpan.textContent = 'burned';
    amountSpan.className = 'amount-burned';
    amountSpan.textContent = fmt(amt) + ' BRDG';
  } else if (type === 'transfer' || type === 'payment') {
    actionSpan.textContent = 'sent';
    amountSpan.className = 'amount-transfer';
    amountSpan.textContent = fmt(amt) + ' BRDG';
  } else {
    actionSpan.textContent = 'earned';
    amountSpan.className = 'amount-earned';
    amountSpan.textContent = fmt(amt) + ' BRDG';
  }
  div.appendChild(actionSpan);
  div.appendChild(amountSpan);
  if (item.reason || item.memo) {
    var reasonSpan = document.createElement('span');
    reasonSpan.className = 'action';
    reasonSpan.textContent = "for '" + (item.reason || item.memo) + "'";
    div.appendChild(reasonSpan);
  }
  var timeSpan = document.createElement('span');
  timeSpan.className = 'time-ago';
  timeSpan.textContent = timeAgo(item.timestamp || item.created_at);
  div.appendChild(timeSpan);
  return div;
}

/* ── SSE-based unified data stream ── */
/* Replaces 3 polling intervals (ticker 10s, burn 15s, stats) with one SSE connection */
var sseActive = false;
var sseFallbackTimer = null;

function connectSSE() {
  if (typeof EventSource === 'undefined') { startPollingFallback(); return; }

  var es = new EventSource('/events/stream');
  sseActive = true;

  es.addEventListener('economy', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.totalTransactions != null) {
        var txEl = $('s-txs'); if (txEl) { txEl.textContent = d.totalTransactions; clearShimmer(txEl); }
        var eTxs = $('e-txs'); if (eTxs) eTxs.textContent = d.totalTransactions;
      }
      if (d.totalBurned != null) {
        var burnEl = $('s-burned'); if (burnEl) { burnEl.textContent = fmt(d.totalBurned); clearShimmer(burnEl); }
        var eBurned = $('e-burned'); if (eBurned) eBurned.textContent = fmt(d.totalBurned);
        var burnNum = $('burn-counter-num');
        if (burnNum) {
          var burned = parseFloat(d.totalBurned) || 0;
          animateCount(burnNum, burned);
        }
      }
      if (d.totalCirculating != null) {
        var eCirc = $('e-circ'); if (eCirc) eCirc.textContent = fmt(d.totalCirculating);
      }
      if (d.topEarners && d.topEarners[0]) {
        var eTreas = $('e-treasury'); if (eTreas) eTreas.textContent = fmt(d.topEarners[0].balance || 0);
      }
    } catch (_) {}
  });

  es.addEventListener('flow', function(e) {
    try {
      var d = JSON.parse(e.data);
      var items = d.flow || d.transactions || d.data || [];
      if (!items.length) return;
      var track = $('ticker-track');
      if (!track) return;
      while (track.firstChild) track.removeChild(track.firstChild);
      var visible = items.slice(0, 8);
      var all = visible.concat(visible);
      for (var i = 0; i < all.length; i++) {
        track.appendChild(buildTickerItem(all[i]));
      }
    } catch (_) {}
  });

  // Generic message fallback
  es.onmessage = function(e) {
    try {
      var d = JSON.parse(e.data);
      // Handle any broadcast event that includes economy data
      if (d.type === 'economy_update' || d.type === 'burn' || d.type === 'transfer') {
        refreshStatsOnce();
      }
    } catch (_) {}
  };

  es.onerror = function() {
    sseActive = false;
    es.close();
    console.warn('[Bridge AI] SSE disconnected, falling back to polling');
    startPollingFallback();
    // Try to reconnect SSE after 30s
    setTimeout(function() { if (!sseActive) connectSSE(); }, 30000);
  };
}

/* ── Polling fallback (used if SSE fails) ── */
function startPollingFallback() {
  if (sseFallbackTimer) return; // already polling
  refreshTicker();
  refreshBurnCounter();
  sseFallbackTimer = setInterval(function() {
    refreshTicker();
    refreshBurnCounter();
  }, 15000); // single 15s interval instead of separate 10s + 15s
}

function refreshTicker() {
  fetch('/api/economy/flow').then(function(r) { return r.json(); }).then(function(d) {
    var items = d.flow || d.transactions || d.data || [];
    if (!items.length) return;
    var track = $('ticker-track');
    if (!track) return;
    while (track.firstChild) track.removeChild(track.firstChild);
    var visible = items.slice(0, 8);
    var all = visible.concat(visible);
    for (var i = 0; i < all.length; i++) {
      track.appendChild(buildTickerItem(all[i]));
    }
  }).catch(function(err) { console.warn('[Bridge AI] Ticker unavailable:', err.message); });
}

var lastBurn = 0;
function refreshBurnCounter() {
  fetch('/api/economy/stats').then(function(r) { return r.json(); }).then(function(d) {
    if (!d.ok) return;
    var burned = parseFloat(d.totalBurned) || 0;
    var el = $('burn-counter-num');
    if (burned !== lastBurn && el) {
      animateCount(el, burned);
      el.style.transform = 'scale(1.08)';
      setTimeout(function() { el.style.transform = 'scale(1)'; }, 300);
      lastBurn = burned;
    }
  }).catch(function(err) { console.warn('[Bridge AI] Burn counter unavailable:', err.message); });
}

function refreshStatsOnce() {
  fetch('/api/economy/stats').then(function(r) { return r.json(); }).then(function(d) {
    if (!d.ok) return;
    var txEl = $('s-txs'); if (txEl) { txEl.textContent = d.totalTransactions; clearShimmer(txEl); }
    var burnEl = $('s-burned'); if (burnEl) { burnEl.textContent = fmt(d.totalBurned); clearShimmer(burnEl); }
    var eCirc = $('e-circ'); if (eCirc) eCirc.textContent = fmt(d.totalCirculating);
    var eBurned = $('e-burned'); if (eBurned) eBurned.textContent = fmt(d.totalBurned);
    var eTreas = $('e-treasury'); if (eTreas) eTreas.textContent = fmt(d.topEarners && d.topEarners[0] ? d.topEarners[0].balance : 0);
    var eTxs = $('e-txs'); if (eTxs) eTxs.textContent = d.totalTransactions;
  }).catch(function(err) { console.warn('[Bridge AI] Stats refresh failed:', err.message); });
}

/* ── Agent Command Demo ── */
(function() {
  var btn = $('demo-exec-btn');
  var input = $('demo-command');
  var select = $('demo-agent');
  var resultBox = $('demo-result');
  if (!btn || !input || !select || !resultBox) return;

  function execDemo() {
    var cmd = input.value.trim();
    if (!cmd) { input.focus(); return; }
    btn.disabled = true;
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    var spinner = document.createElement('span');
    spinner.className = 'demo-spinner';
    btn.appendChild(spinner);
    btn.appendChild(document.createTextNode(' Running...'));
    resultBox.className = 'demo-result visible';
    resultBox.textContent = 'Sending command to ' + select.value + '...';

    var agent = encodeURIComponent(select.value);
    fetch('/api/agents/' + agent + '/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      resultBox.className = 'demo-result visible';
      resultBox.textContent = d.result || d.response || d.text || d.message || JSON.stringify(d, null, 2);
    })
    .catch(function() {
      resultBox.className = 'demo-result visible error';
      resultBox.textContent = 'Could not reach agent. The API may be starting up. Try again in a moment.';
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = 'Execute';
    });
  }

  btn.addEventListener('click', execDemo);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') execDemo();
  });
})();

/* ── Initial Load — Stats + Health + BRDG Token ── */
(async function() {
  // Initial stats fetch, then switch to SSE
  try {
    var r = await fetch('/api/economy/stats');
    var d = await r.json();
    if (d.ok) {
      var txEl = $('s-txs'); if (txEl) { txEl.textContent = d.totalTransactions; clearShimmer(txEl); }
      var burnEl = $('s-burned'); if (burnEl) { burnEl.textContent = fmt(d.totalBurned); clearShimmer(burnEl); }
      var eCirc = $('e-circ'); if (eCirc) eCirc.textContent = fmt(d.totalCirculating);
      var eBurned = $('e-burned'); if (eBurned) eBurned.textContent = fmt(d.totalBurned);
      var eTreas = $('e-treasury'); if (eTreas) eTreas.textContent = fmt(d.topEarners && d.topEarners[0] ? d.topEarners[0].balance : 0);
      var eTxs = $('e-txs'); if (eTxs) eTxs.textContent = d.totalTransactions;
      lastBurn = parseFloat(d.totalBurned) || 0;
    }
  } catch (err) { console.warn('[Bridge AI] Economy stats unavailable:', err.message); }

  try {
    var r2 = await fetch('/health');
    var d2 = await r2.json();
    if (d2.status === 'OK') {
      var hrs = Math.floor((d2.core && d2.core.uptime || 0) / 3600);
      var upEl = $('s-uptime'); if (upEl) { upEl.textContent = hrs > 0 ? hrs + 'h' : 'live'; clearShimmer(upEl); }
    }
  } catch (err) {
    var upEl2 = $('s-uptime'); if (upEl2) { upEl2.textContent = 'live'; clearShimmer(upEl2); }
    console.warn('[Bridge AI] Health check unavailable:', err.message);
  }

  try {
    var r3 = await fetch('/api/brdg/token');
    var d3 = await r3.json();
    if (d3.ok && d3.token) {
      var footer = $('brdg-footer');
      if (footer) footer.textContent = fmt(d3.token.totalSupply) + ' BRDG minted \u00b7 ' + fmt(d3.token.totalBurned) + ' burned \u00b7 Linea L2';
    }
  } catch (err) { console.warn('[Bridge AI] BRDG token data unavailable:', err.message); }

  // Connect SSE for live updates (replaces polling)
  connectSSE();
})();

/* ── Video pause/play toggle ── */
(function() {
  var vid = $('hero-vid');
  var btn = document.getElementById('hero-vid-toggle');
  if (vid && btn) {
    btn.addEventListener('click', function() {
      if (vid.paused) { vid.play(); btn.textContent = 'Pause'; btn.setAttribute('aria-label', 'Pause background video'); }
      else { vid.pause(); btn.textContent = 'Play'; btn.setAttribute('aria-label', 'Play background video'); }
    });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      vid.pause(); btn.textContent = 'Play'; btn.setAttribute('aria-label', 'Play background video');
    }
  }
})();

/* ── PWA Install Prompt ── */
var deferredPrompt = null;
var installBtn = document.getElementById('pwa-install-btn');

if (installBtn) {
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'inline-block';
  });

  installBtn.addEventListener('click', async function() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    var result = await deferredPrompt.userChoice;
    console.log('[Bridge AI] Install:', result.outcome);
    deferredPrompt = null;
    installBtn.style.display = 'none';
  });

  window.addEventListener('appinstalled', function() {
    installBtn.style.display = 'none';
    deferredPrompt = null;
    console.log('[Bridge AI] App installed');
  });
}

/* ── Service Worker Registration ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(reg) { console.log('[Bridge AI] SW registered, scope:', reg.scope); })
      .catch(function(err) { console.warn('[Bridge AI] SW registration failed:', err); });
  });
}

/* ── Smart auth button ── */
(function() {
  var btn = document.getElementById('nav-auth-btn');
  if (!btn) return;
  var token = localStorage.getItem('bridge_token') || localStorage.getItem('bridge_user_token');
  if (token) {
    try {
      var user = JSON.parse(localStorage.getItem('bridge_user'));
      var name = (user && (user.name || user.email)) || 'My Account';
      btn.textContent = name.split(' ')[0];
      btn.href = '/console.html';
    } catch (_) {
      btn.textContent = 'Console';
      btn.href = '/console.html';
    }
  }
})();

/* ── Location-based personalization ── */
(function() {
  var africanTLDs = ['.za', '.ng', '.ke', '.gh', '.tz', '.ug', '.rw', '.et', '.eg', '.ma'];
  var africanTimezones = ['Africa/'];
  var isAfrican = false;

  // Check timezone
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.indexOf('Africa/') === 0) isAfrican = true;
  } catch (_) {}

  // Check language
  var lang = (navigator.language || '').toLowerCase();
  if (lang === 'af' || lang === 'zu' || lang === 'xh' || lang === 'st') isAfrican = true;

  if (isAfrican) {
    // Adapt messaging for African audience
    var sub = document.querySelector('.hero .sub');
    if (sub) {
      sub.textContent = 'Automate sales, invoicing, and operations with 35 AI agents \u2014 built for Africa, accepting PayFast (ZAR) and Paystack (NGN). Live in under 5 minutes.';
    }
    // Show ZAR-focused pricing emphasis
    var pricingSub = document.querySelector('#pricing .section-sub');
    if (pricingSub) {
      pricingSub.textContent = 'Replace a sales rep (R15k/mo), accountant (R10k/mo), and support agent (R8k/mo) \u2014 starting at R0. Pay in ZAR via PayFast. Cancel anytime.';
    }
  } else {
    // Global audience — show USD equivalent context
    var pricingSub2 = document.querySelector('#pricing .section-sub');
    if (pricingSub2 && pricingSub2.textContent.indexOf('R15k') !== -1) {
      pricingSub2.textContent = 'Replace a sales team, accountant, and support agent \u2014 starting free. Plans from $27/mo. Cancel anytime.';
    }
  }
})();
