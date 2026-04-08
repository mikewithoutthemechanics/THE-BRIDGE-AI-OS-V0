/**
 * BRIDGE AI OS — PHERE Runtime Engine v1.0
 * Post-Human Experiential Reality Engine
 *
 * Modules:
 *  1. WebGL Ambient Environment (canvas particle field)
 *  2. Scroll Revelation System
 *  3. Magnetic Cursor / Physics Micro-interactions
 *  4. Kinetic Typography Engine
 *  5. Page Transition Continuity
 *  6. Behavioral Variability Engine
 *  7. Stat Counter Animations
 *  8. Button Ripple + Pressure Physics
 *  9. Performance-adaptive motion scaling
 * 10. Accessibility gate (prefers-reduced-motion)
 *
 * Security: no innerHTML with user data; all DOM manipulation uses
 * createElement/textContent/setAttribute exclusively.
 */
(function PHERE() {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────────────
     GATE: respect user motion preferences
     ──────────────────────────────────────────────────────────────────────── */
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ──────────────────────────────────────────────────────────────────────────
     PERFORMANCE BUDGET: scale based on device capability
     ──────────────────────────────────────────────────────────────────────── */
  const PERF = (function () {
    const cores = navigator.hardwareConcurrency || 2;
    const memory = navigator.deviceMemory || 2;
    const score = cores * memory;
    return {
      tier: score >= 16 ? 'high' : score >= 8 ? 'mid' : 'low',
      webgl: !REDUCED && score >= 4,
      particles: REDUCED ? 0 : Math.min(Math.floor(score * 4), 80),
      magnetic: !REDUCED && score >= 8,
    };
  }());

  /* ──────────────────────────────────────────────────────────────────────────
     1. AMBIENT CANVAS PARTICLE FIELD
        GPU-accelerated: only transform/opacity, zero layout impact
     ──────────────────────────────────────────────────────────────────────── */
  function initAmbient() {
    if (!PERF.webgl || PERF.particles === 0) return;

    var canvas = document.createElement('canvas');
    canvas.id = 'phere-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:0', 'pointer-events:none',
      'opacity:0.5', 'mix-blend-mode:screen', 'width:100%', 'height:100%'
    ].join(';');
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext('2d');
    var W, H, particles = [];
    var raf;

    function resize() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    var COLORS = [
      'rgba(99,255,218,',
      'rgba(0,229,123,',
      'rgba(99,255,218,',
      'rgba(168,85,247,',
    ];

    for (var i = 0; i < PERF.particles; i++) {
      var angle = (i / PERF.particles) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
      var radius = 0.15 + Math.pow(Math.random(), 1.5) * 0.7;
      particles.push({
        x: W * 0.5 + Math.cos(angle) * W * radius * 0.6,
        y: H * 0.5 + Math.sin(angle) * H * radius * 0.6,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.18 - 0.04,
        r: 0.5 + Math.random() * 1.5,
        a: 0.03 + Math.random() * 0.15,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        phase: (i * 2.618) % (Math.PI * 2),
        freq: 0.003 + Math.random() * 0.005,
      });
    }

    var frame = 0;
    function tick() {
      raf = requestAnimationFrame(tick);
      frame++;
      if (PERF.tier === 'low' && frame % 2 !== 0) return;

      ctx.clearRect(0, 0, W, H);

      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        p.x += p.vx;
        p.y += p.vy;
        p.phase += p.freq;
        p.x += Math.sin(p.phase) * 0.12;
        if (p.x < -50) p.x = W + 50;
        if (p.x > W + 50) p.x = -50;
        if (p.y < -50) p.y = H + 50;
        if (p.y > H + 50) p.y = -50;
      }

      if (PERF.tier !== 'low') {
        var THRESH = PERF.tier === 'high' ? 140 : 100;
        for (var a = 0; a < particles.length; a++) {
          for (var b = a + 1; b < particles.length; b++) {
            var dx = particles[a].x - particles[b].x;
            var dy = particles[a].y - particles[b].y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < THRESH) {
              ctx.beginPath();
              ctx.moveTo(particles[a].x, particles[a].y);
              ctx.lineTo(particles[b].x, particles[b].y);
              ctx.strokeStyle = 'rgba(99,255,218,' + ((1 - dist / THRESH) * 0.08).toFixed(3) + ')';
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }

      for (var k = 0; k < particles.length; k++) {
        var q = particles[k];
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fillStyle = q.color + (q.a * (0.8 + Math.sin(q.phase) * 0.2)).toFixed(3) + ')';
        ctx.fill();
      }
    }

    tick();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { cancelAnimationFrame(raf); }
      else { tick(); }
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     2. SCROLL REVELATION SYSTEM
     ──────────────────────────────────────────────────────────────────────── */
  function initScrollReveal() {
    var selectors = [
      '.card', '.section', '.stat',
      'h1', 'h2', 'h3',
      '.phere-reveal', '.phere-reveal-left', '.phere-reveal-scale',
      '.phere-stagger',
    ].join(',');

    var elements = document.querySelectorAll(selectors);

    if (REDUCED) {
      elements.forEach(function (el) { el.classList.add('phere-revealed'); });
      return;
    }

    var VARIANTS = ['phere-reveal', 'phere-reveal-left', 'phere-reveal-scale'];
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.dataset.phereDelay || '0', 10);
        setTimeout(function () { el.classList.add('phere-revealed'); }, delay);
        observer.unobserve(el);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    var rowIndex = 0;
    var lastTop = -9999;

    elements.forEach(function (el, i) {
      var rect = el.getBoundingClientRect();
      if (Math.abs(rect.top - lastTop) > 30) { rowIndex = 0; lastTop = rect.top; }

      var hasVariant = VARIANTS.some(function (v) { return el.classList.contains(v); });
      if (!hasVariant) {
        el.classList.add(VARIANTS[i % 7 === 0 ? 2 : i % 5 === 0 ? 1 : 0]);
      }

      var jitter = (Math.random() * 20 - 10) | 0;
      el.dataset.phereDelay = String(rowIndex * 65 + jitter);
      rowIndex++;

      observer.observe(el);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     3. MAGNETIC CURSOR PHYSICS
     ──────────────────────────────────────────────────────────────────────── */
  function initMagnetics() {
    if (!PERF.magnetic || REDUCED) return;

    var targets = document.querySelectorAll('.phere-btn-primary, .phere-btn, .btn-p, .btn-g');
    targets.forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var rect = el.getBoundingClientRect();
        var dx = (e.clientX - (rect.left + rect.width / 2)) * 0.25;
        var dy = (e.clientY - (rect.top + rect.height / 2)) * 0.20;
        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) translateY(-2px)';
        el.style.transition = 'transform 80ms linear';
      });

      el.addEventListener('mouseleave', function () {
        el.style.transform = '';
        el.style.transition = 'transform 400ms cubic-bezier(0.16,1,0.3,1)';
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     4. KINETIC TYPOGRAPHY
        Safe: uses createElement + textContent, never innerHTML with user data
     ──────────────────────────────────────────────────────────────────────── */
  function initKineticType() {
    if (REDUCED) return;

    var targets = document.querySelectorAll('h1, .phere-display, .boot-logo');
    targets.forEach(function (el) {
      if (el.dataset.phereKinetic) return;
      // Skip if element has child elements (complex HTML — don't touch)
      if (el.children.length > 0) return;

      el.dataset.phereKinetic = '1';
      var text = el.textContent || '';
      if (!text.trim()) return;

      // Clear and rebuild using safe DOM methods only
      while (el.firstChild) { el.removeChild(el.firstChild); }

      text.split('').forEach(function (c, i) {
        if (c === ' ') {
          el.appendChild(document.createTextNode(' '));
          return;
        }
        var span = document.createElement('span');
        span.textContent = c;
        span.style.cssText = [
          'display:inline-block',
          'opacity:0',
          'transform:translateY(8px)',
          'transition:opacity 280ms ' + (i * 28 + ((Math.random() * 12) | 0)) + 'ms cubic-bezier(0.34,1.56,0.64,1),' +
                    'transform 280ms ' + (i * 28 + ((Math.random() * 12) | 0)) + 'ms cubic-bezier(0.34,1.56,0.64,1)',
        ].join(';');
        el.appendChild(span);
      });

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.querySelectorAll('span').forEach(function (s) {
            s.style.opacity = '1';
            s.style.transform = 'translateY(0)';
          });
        });
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     5. PAGE TRANSITION CONTINUITY
     ──────────────────────────────────────────────────────────────────────── */
  function initPageTransitions() {
    if (REDUCED) return;

    var overlay = document.createElement('div');
    overlay.id = 'phere-transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999', 'pointer-events:none',
      'background:linear-gradient(135deg,#020408,#080f1a)',
      'opacity:0',
      'transition:opacity 300ms cubic-bezier(0.16,1,0.3,1)',
    ].join(';');
    document.body.appendChild(overlay);

    // Fade from black on load
    window.addEventListener('load', function () {
      overlay.style.opacity = '1';
      overlay.style.transition = 'none';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          overlay.style.transition = 'opacity 500ms cubic-bezier(0.16,1,0.3,1)';
          overlay.style.opacity = '0';
        });
      });
    });

    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href) return;
      var skip = href.charAt(0) === '#' ||
                 href.indexOf('javascript') === 0 ||
                 href.indexOf('http') === 0 ||
                 href.indexOf('mailto') === 0 ||
                 a.getAttribute('target') === '_blank';
      if (skip) return;

      e.preventDefault();
      overlay.style.transition = 'opacity 220ms cubic-bezier(0.4,0,1,1)';
      overlay.style.opacity = '1';
      var dest = href;
      setTimeout(function () { window.location.href = dest; }, 240);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     6. BUTTON RIPPLE PHYSICS
     ──────────────────────────────────────────────────────────────────────── */
  function initButtonPhysics() {
    if (REDUCED) return;

    function addRipple(e) {
      var btn = e.currentTarget;
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 2;
      var x = e.clientX - rect.left - size / 2;
      var y = e.clientY - rect.top - size / 2;

      var ripple = document.createElement('span');
      ripple.setAttribute('aria-hidden', 'true');
      ripple.style.cssText = [
        'width:' + size + 'px',
        'height:' + size + 'px',
        'left:' + x + 'px',
        'top:' + y + 'px',
        'position:absolute',
        'border-radius:50%',
        'background:rgba(255,255,255,0.12)',
        'transform:scale(0)',
        'animation:phereRipple 0.55s cubic-bezier(0.16,1,0.3,1) forwards',
        'pointer-events:none',
      ].join(';');

      if (getComputedStyle(btn).position === 'static') {
        btn.style.position = 'relative';
      }
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(function () { if (ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 600);
    }

    document.querySelectorAll('.phere-btn,.btn,.btn-p,.btn-g,.btn-s,button,.card').forEach(function (btn) {
      btn.addEventListener('mousedown', addRipple);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     7. STAT COUNTER ANIMATION
     ──────────────────────────────────────────────────────────────────────── */
  function initStatCounters() {
    if (REDUCED) return;

    function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

    function animateCounter(el) {
      if (el.dataset.phereAnimated) return;
      el.dataset.phereAnimated = '1';

      var raw = el.textContent.trim();
      var match = raw.match(/^([^0-9\-]*)(-?[\d,]+\.?\d*)([^0-9]*)$/);
      if (!match) return;

      var prefix = match[1];
      var numStr = match[2].replace(/,/g, '');
      var suffix = match[3];
      var target = parseFloat(numStr);
      if (isNaN(target) || target === 0) return;

      var duration = 1200 + Math.random() * 400;
      var start = performance.now();
      var decimals = numStr.indexOf('.') >= 0 ? (numStr.split('.')[1] || '').length : 0;

      function step(now) {
        var progress = Math.min((now - start) / duration, 1);
        var current = target * easeOutExpo(progress);
        el.textContent = prefix +
          (decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString()) +
          suffix;
        if (progress < 1) { requestAnimationFrame(step); }
        else {
          el.textContent = prefix + (decimals > 0 ? target.toFixed(decimals) : target.toLocaleString()) + suffix;
        }
      }
      requestAnimationFrame(step);
    }

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animateCounter(e.target); obs.unobserve(e.target); }
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('.hero-stat-val,.phere-stat-val,[id^="s-"]').forEach(function (el) {
      obs.observe(el);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     8. BEHAVIORAL VARIABILITY ENGINE
     ──────────────────────────────────────────────────────────────────────── */
  function initVariability() {
    if (REDUCED) return;

    var yOffsets  = [0, 2, -1, 3, -2, 1, -3, 2];
    var radii     = [10, 11, 12, 10, 13, 11, 12, 10];
    var opacities = [0.62, 0.58, 0.65, 0.60, 0.63, 0.57, 0.64, 0.61];

    document.querySelectorAll('.grid > .card, .cards > .card').forEach(function (el, i) {
      var yOff = yOffsets[i % yOffsets.length];
      if (yOff !== 0) el.style.marginTop = yOff + 'px';
      el.style.borderRadius = radii[i % radii.length] + 'px';
      var desc = el.querySelector('.card-desc, p');
      if (desc) desc.style.opacity = String(opacities[i % opacities.length]);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     9. AMBIENT HOVER GLOW
     ──────────────────────────────────────────────────────────────────────── */
  function initHoverGlow() {
    if (REDUCED || PERF.tier === 'low') return;

    document.querySelectorAll('.card, .phere-card').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
        var y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
        card.style.background = [
          'radial-gradient(',
          'circle at ' + x + '% ' + y + '%,',
          'rgba(99,255,218,0.04) 0%,',
          'transparent 60%',
          '),var(--bg2,#0a0e17)',
        ].join('');
      });
      card.addEventListener('mouseleave', function () {
        card.style.background = '';
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     10. NOISE TEXTURE (eliminates flat synthetic surfaces)
     ──────────────────────────────────────────────────────────────────────── */
  function injectNoise() {
    if (document.getElementById('phere-noise')) return;
    var noise = document.createElement('div');
    noise.id = 'phere-noise';
    noise.setAttribute('aria-hidden', 'true');
    noise.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:1', 'pointer-events:none',
      'opacity:0.022',
      'background-image:url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.4\'/%3E%3C/svg%3E")',
      'background-size:200px 200px',
      'mix-blend-mode:overlay',
    ].join(';');
    document.body.insertBefore(noise, document.body.firstChild);
  }

  /* ──────────────────────────────────────────────────────────────────────────
     PUBLIC API
     ──────────────────────────────────────────────────────────────────────── */
  window.BRIDGE_PHERE = {
    version: '1.0.0',
    tier: PERF.tier,
    init: bootstrap,
    injectWordPress: function () {
      // Signal to WP REST API that PHERE is active
      fetch('/wp-json/bridge-ai/v1/phere/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '1.0.0', tier: PERF.tier }),
      }).catch(function () {});
    },
    animate: function (selector, props) {
      if (REDUCED) return;
      document.querySelectorAll(selector).forEach(function (el) {
        Object.assign(el.style, props);
      });
    },
  };

  /* ──────────────────────────────────────────────────────────────────────────
     BOOTSTRAP
     ──────────────────────────────────────────────────────────────────────── */
  function bootstrap() {
    if (!document.getElementById('bridge-phere-css')) {
      var link = document.createElement('link');
      link.id = 'bridge-phere-css';
      link.rel = 'stylesheet';
      link.href = '/bridge-phere.css';
      document.head.appendChild(link);
    }

    // Inject ripple keyframe if not in a stylesheet yet
    if (!document.getElementById('phere-keyframes')) {
      var style = document.createElement('style');
      style.id = 'phere-keyframes';
      style.textContent = '@keyframes phereRipple{to{transform:scale(4);opacity:0}}';
      document.head.appendChild(style);
    }

    injectNoise();

    requestAnimationFrame(function () {
      initAmbient();
      requestAnimationFrame(function () {
        initScrollReveal();
        initStatCounters();
        requestAnimationFrame(function () {
          initKineticType();
          initButtonPhysics();
          initMagnetics();
          initHoverGlow();
          initVariability();
          setTimeout(initPageTransitions, 100);
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

}());
