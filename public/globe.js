/**
 * Bridge AI OS — 3D Rotating Globe with Agent Nodes
 * Self-contained Canvas-based animation. No dependencies.
 * Usage: initGlobe('globe-canvas')
 */
(function () {
  'use strict';

  // --- Agent definitions ---
  var AGENTS = [
    { name: 'Sales',     color: '#00c8ff', orbitR: 1.25, speed: 0.35,  phase: 0 },
    { name: 'Research',  color: '#a78bfa', orbitR: 1.30, speed: -0.28, phase: 1.2 },
    { name: 'Marketing', color: '#fb923c', orbitR: 1.22, speed: 0.42,  phase: 2.4 },
    { name: 'Finance',   color: '#00e57b', orbitR: 1.35, speed: -0.32, phase: 0.8 },
    { name: 'Trading',   color: '#ff3c5a', orbitR: 1.28, speed: 0.38,  phase: 3.6 },
    { name: 'Support',   color: '#00c8ff', orbitR: 1.32, speed: -0.25, phase: 4.2 },
    { name: 'Legal',     color: '#a78bfa', orbitR: 1.20, speed: 0.30,  phase: 5.0 },
    { name: 'Dev',       color: '#00e57b', orbitR: 1.38, speed: -0.22, phase: 1.8 },
    { name: 'Analytics', color: '#00c8ff', orbitR: 1.26, speed: 0.33,  phase: 2.8 },
    { name: 'HR',        color: '#fb923c', orbitR: 1.33, speed: -0.27, phase: 4.8 },
    { name: 'Ops',       color: '#00e57b', orbitR: 1.24, speed: 0.40,  phase: 0.5 },
    { name: 'Audit',     color: '#a78bfa', orbitR: 1.30, speed: -0.35, phase: 3.2 },
    { name: 'Treasury',  color: '#ff3c5a', orbitR: 1.36, speed: 0.26,  phase: 5.5 },
    { name: 'Growth',    color: '#00c8ff', orbitR: 1.21, speed: -0.38, phase: 1.5 },
  ];

  // --- Particles (stars/dust) ---
  var PARTICLE_COUNT = 120;

  // --- Connection state ---
  var MAX_CONNECTIONS = 4;
  var CONNECTION_LIFETIME = 2500; // ms

  // --- Helper math ---
  function rotateY(x, y, z, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: x * c + z * s, y: y, z: -x * s + z * c };
  }
  function rotateX(x, y, z, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: x, y: y * c - z * s, z: y * s + z * c };
  }
  function project(x, y, z, cx, cy, r) {
    // Simple perspective
    var fov = 600;
    var scale = fov / (fov + z * r);
    return { sx: cx + x * r * scale, sy: cy + y * r * scale, scale: scale, z: z };
  }

  function initGlobe(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;

    var width, height, globeR;

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      globeR = Math.min(width, height) * 0.28;
    }
    resize();
    window.addEventListener('resize', resize);

    var cx = function () { return width / 2; };
    var cy = function () { return height / 2 - height * 0.02; };

    // --- Particles ---
    var particles = [];
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
        z: Math.random() * 2 - 1,
        size: Math.random() * 1.2 + 0.3,
        alpha: Math.random(),
        speed: Math.random() * 0.002 + 0.001,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // --- Connections ---
    var connections = [];
    var lastConnectionTime = 0;

    function spawnConnection(time) {
      if (connections.length >= MAX_CONNECTIONS) return;
      var a = Math.floor(Math.random() * AGENTS.length);
      var b = Math.floor(Math.random() * AGENTS.length);
      if (a === b) b = (a + 1) % AGENTS.length;
      connections.push({
        from: a,
        to: b,
        born: time,
        particleT: 0,
      });
    }

    // --- Node 3D positions cache (updated each frame) ---
    var nodeScreenPos = new Array(AGENTS.length);

    // --- Draw wireframe sphere ---
    function drawGlobe(t) {
      var ccx = cx(), ccy = cy();
      var rotY = t * 0.15;
      var tiltX = 0.35; // slight tilt

      ctx.strokeStyle = 'rgba(0,200,255,0.12)';
      ctx.lineWidth = 0.7;

      // Latitude lines
      for (var lat = -80; lat <= 80; lat += 20) {
        var phi = (lat * Math.PI) / 180;
        ctx.beginPath();
        var first = true;
        for (var lon = 0; lon <= 360; lon += 5) {
          var theta = (lon * Math.PI) / 180;
          var x0 = Math.cos(phi) * Math.cos(theta);
          var y0 = Math.sin(phi);
          var z0 = Math.cos(phi) * Math.sin(theta);
          var r1 = rotateY(x0, y0, z0, rotY);
          var r2 = rotateX(r1.x, r1.y, r1.z, tiltX);
          var p = project(r2.x, r2.y, r2.z, ccx, ccy, globeR);
          if (first) { ctx.moveTo(p.sx, p.sy); first = false; }
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }

      // Longitude lines
      for (var lon = 0; lon < 360; lon += 30) {
        var theta = (lon * Math.PI) / 180;
        ctx.beginPath();
        var first = true;
        for (var lat = -90; lat <= 90; lat += 5) {
          var phi = (lat * Math.PI) / 180;
          var x0 = Math.cos(phi) * Math.cos(theta);
          var y0 = Math.sin(phi);
          var z0 = Math.cos(phi) * Math.sin(theta);
          var r1 = rotateY(x0, y0, z0, rotY);
          var r2 = rotateX(r1.x, r1.y, r1.z, tiltX);
          var p = project(r2.x, r2.y, r2.z, ccx, ccy, globeR);
          if (first) { ctx.moveTo(p.sx, p.sy); first = false; }
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(ccx, ccy, globeR * 1.01, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,200,255,0.06)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // --- Draw agent nodes ---
    function drawNodes(t) {
      var ccx = cx(), ccy = cy();
      var rotY = t * 0.15;
      var tiltX = 0.35;

      for (var i = 0; i < AGENTS.length; i++) {
        var ag = AGENTS[i];
        var angle = t * ag.speed + ag.phase;
        // Orbit on a tilted plane unique to each node
        var orbTilt = (i * 0.5) + 0.3;
        var x0 = ag.orbitR * Math.cos(angle);
        var y0 = ag.orbitR * Math.sin(angle) * Math.sin(orbTilt);
        var z0 = ag.orbitR * Math.sin(angle) * Math.cos(orbTilt);

        var r1 = rotateY(x0, y0, z0, rotY * 0.4);
        var r2 = rotateX(r1.x, r1.y, r1.z, tiltX * 0.5);
        var p = project(r2.x, r2.y, r2.z, ccx, ccy, globeR);

        nodeScreenPos[i] = { sx: p.sx, sy: p.sy, scale: p.scale, z: r2.z };

        // Pulse
        var pulseSize = 3 + Math.sin(t * 2 + ag.phase) * 1.2;
        var nodeSize = pulseSize * p.scale;
        var alpha = 0.5 + r2.z * 0.3; // fade if behind
        alpha = Math.max(0.15, Math.min(1, alpha));

        // Glow
        var grad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, nodeSize * 4);
        grad.addColorStop(0, ag.color + hexAlpha(alpha * 0.5));
        grad.addColorStop(1, ag.color + '00');
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, nodeSize * 4, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, nodeSize, 0, Math.PI * 2);
        ctx.fillStyle = ag.color + hexAlpha(alpha);
        ctx.fill();

        // Label
        ctx.font = (9 * p.scale) + 'px system-ui, sans-serif';
        ctx.fillStyle = ag.color + hexAlpha(alpha * 0.8);
        ctx.textAlign = 'center';
        ctx.fillText(ag.name, p.sx, p.sy - nodeSize - 4);
      }
    }

    function hexAlpha(a) {
      var v = Math.round(Math.max(0, Math.min(1, a)) * 255);
      return (v < 16 ? '0' : '') + v.toString(16);
    }

    // --- Draw connections ---
    function drawConnections(t, time) {
      var ccx = cx(), ccy = cy();
      // Spawn new connections periodically
      if (time - lastConnectionTime > 1800 + Math.random() * 1400) {
        spawnConnection(time);
        lastConnectionTime = time;
      }

      // Filter expired
      connections = connections.filter(function (c) {
        return time - c.born < CONNECTION_LIFETIME;
      });

      for (var i = 0; i < connections.length; i++) {
        var c = connections[i];
        var fromPos = nodeScreenPos[c.from];
        var toPos = nodeScreenPos[c.to];
        if (!fromPos || !toPos) continue;

        var life = (time - c.born) / CONNECTION_LIFETIME;
        var fadeAlpha = life < 0.15 ? life / 0.15 : life > 0.8 ? (1 - life) / 0.2 : 1;
        fadeAlpha *= 0.35;

        // Dashed arc between nodes
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = -t * 40;
        ctx.beginPath();

        // Curved arc via quadratic bezier (midpoint lifted)
        var midX = (fromPos.sx + toPos.sx) / 2;
        var midY = (fromPos.sy + toPos.sy) / 2 - 30;
        ctx.moveTo(fromPos.sx, fromPos.sy);
        ctx.quadraticCurveTo(midX, midY, toPos.sx, toPos.sy);

        ctx.strokeStyle = 'rgba(0,200,255,' + fadeAlpha.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // Traveling particle along the arc
        var pt = life; // 0 -> 1 over lifetime
        // Quadratic bezier evaluation
        var tt = pt;
        var mt = 1 - tt;
        var px = mt * mt * fromPos.sx + 2 * mt * tt * midX + tt * tt * toPos.sx;
        var py = mt * mt * fromPos.sy + 2 * mt * tt * midY + tt * tt * toPos.sy;

        var particleAlpha = fadeAlpha * 2.5;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,200,255,' + Math.min(1, particleAlpha).toFixed(3) + ')';
        ctx.fill();

        // Tiny glow on traveling particle
        var pg = ctx.createRadialGradient(px, py, 0, px, py, 10);
        pg.addColorStop(0, 'rgba(0,200,255,' + (particleAlpha * 0.4).toFixed(3) + ')');
        pg.addColorStop(1, 'rgba(0,200,255,0)');
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();
      }
    }

    // --- Draw particles/sparkles ---
    function drawParticles(t) {
      var ccx = cx(), ccy = cy();
      var spread = Math.max(width, height) * 0.5;

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var flickerAlpha = (Math.sin(t * p.speed * 500 + p.phase) + 1) * 0.5;
        var alpha = flickerAlpha * 0.4 + 0.05;

        var sx = ccx + p.x * spread;
        var sy = ccy + p.y * spread;

        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,220,255,' + alpha.toFixed(3) + ')';
        ctx.fill();
      }
    }

    // --- Animation loop ---
    var startTime = null;
    function frame(timestamp) {
      if (!startTime) startTime = timestamp;
      var time = timestamp - startTime;
      var t = time / 1000; // seconds

      ctx.clearRect(0, 0, width, height);

      drawParticles(t);
      drawGlobe(t);
      drawConnections(t, time);
      drawNodes(t);

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  // Export
  window.initGlobe = initGlobe;
})();
