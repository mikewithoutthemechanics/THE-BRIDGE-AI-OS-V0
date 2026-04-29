/**
 * Bridge AI OS — Floating Brain Widget
 * Self-contained: injects styles, canvas orb, chat panel onto any page.
 * Usage: <script src="/bridge-widget.js" defer></script>
 */
(function () {
  'use strict';

  /* ── constants ────────────────────────────────────────────────── */
  const PFX = 'bw__';
  const LS_CHAT = 'bridge_widget_chat';
  const LS_OPEN = 'bridge_widget_open';
  const LS_USER = 'bridge_widget_user';
  const LS_JOURNEY = 'bridge_widget_journey';
  const LS_TOKEN = 'bridge_user_token';
  const MAX_MSGS = 50;
  const ORB_SIZE = 60;
  const ORB_EXPAND = 80;
  const PANEL_W = 350;
  const PANEL_H = 500;

  // ── Theme Detection ─────────────────────────────────────────────────────
  function detectTheme() {
    var path = window.location.pathname.toLowerCase();
    // Admin pages
    if (path.indexOf('/admin') !== -1 || path.indexOf('/admin-') !== -1 || path.indexOf('/executive') !== -1 || path.indexOf('/intelligence') !== -1 || path.indexOf('/bridge-audit') !== -1 || path.indexOf('/aoe') !== -1) {
      return 'admin';
    }
    // Agent pages
    if (path.indexOf('/agent') !== -1 || path.indexOf('/join') !== -1 || path.indexOf('/neurolink') !== -1) {
      return 'agent';
    }
    // Default to user theme
    return 'user';
  }

  var theme = detectTheme();
  var themeColors = {
    admin: {
      primary: '#ff8c00',
      primaryRgb: '255,140,0',
      primaryGlow: 'rgba(255, 140, 0, 0.35)',
      bg1: '#0f0a0a',
      bg2: '#1a1212'
    },
    agent: {
      primary: '#e63946',
      primaryRgb: '230,57,70',
      primaryGlow: 'rgba(230, 57, 70, 0.35)',
      bg1: '#100a0a',
      bg2: '#1a1212'
    },
    user: {
      primary: '#00c8ff',
      primaryRgb: '0,200,255',
      primaryGlow: 'rgba(0, 212, 255, 0.35)',
      bg1: '#0a0e17',
      bg2: '#111827'
    }
  };
  var c = themeColors[theme];

  const PAGE_CONTEXT = {
    '/': 'The user is on the landing page. Help them understand Bridge AI OS and guide them to try the portal or sign up.',
    '/index.html': 'The user is on the landing page. Help them understand Bridge AI OS and guide them to try the portal or sign up.',
    '/portal.html': 'The user is on the voice portal. Help them use the brain interface — they can just talk.',
    '/checkout.html': 'The user is on the checkout page. Help them choose a plan. Answer pricing questions.',
    '/economy.html': 'The user is viewing the agent economy dashboard. Explain what BRDG tokens are and how agents earn.',
    '/admin-command.html': 'The user is on the admin command center. Help them manage agents and system controls.',
    '/admin-revenue.html': 'The user is viewing revenue metrics. Explain the treasury and payment data.',
    '/ui.html': 'The user is on the main dashboard. Guide them through the available tools.',
    '/crm.html': 'The user is managing contacts and CRM. Help with contact management features.',
    '/invoicing.html': 'The user is creating invoices. Guide them through the invoicing workflow.',
  };

  const PROACTIVE_HINTS = {
    '/': { delay: 20000, text: 'Want to see what Bridge AI can do for your business?' },
    '/index.html': { delay: 20000, text: 'Want to see what Bridge AI can do for your business?' },
    '/checkout.html': { delay: 10000, text: 'Need help choosing a plan?' },
    '/portal.html': { delay: 25000, text: 'Try saying "Hello" to the brain!' },
    '/economy.html': { delay: 25000, text: 'Curious how BRDG tokens work?' },
    '/admin-command.html': { delay: 30000, text: 'Need help managing your agents?' },
    '/admin-revenue.html': { delay: 30000, text: 'Want me to explain the revenue data?' },
  };

  const IDLE_HINTS = ['Need help?', 'Ask me anything', 'I can guide you', 'Let\'s talk'];

  const SYSTEM_KB = `You are Bridge, the AI assistant for Bridge AI OS — an autonomous business intelligence platform.
Key features: CRM, invoicing, AI agent workforce, DeFi treasury on Linea L2, BRDG token economy.
Pricing: Starter R0/mo (free), Pro R499/mo, Enterprise R2,499/mo.
Built for Africa, scaling globally. 150+ API endpoints. Voice portal, admin command center, agent economy dashboard.
Be concise, helpful, and proactive. If a user seems interested, guide them toward signing up or trying features.
If they ask about pricing, explain the three tiers clearly.
Always be friendly and knowledgeable. You represent Bridge AI OS.`;

  /* ── helpers ───────────────────────────────────────────────────── */
  function el(tag, cls, attrs) {
    const e = document.createElement(tag);
    if (cls) e.className = PFX + cls;
    if (attrs) Object.keys(attrs).forEach(k => { e[k] = attrs[k]; });
    return e;
  }

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  /* ── styles (scoped with prefix) ──────────────────────────────── */
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      .${PFX}root{position:fixed;bottom:20px;right:20px;z-index:999999;font-family:system-ui,-apple-system,sans-serif;}
      .${PFX}orb-wrap{width:${ORB_SIZE}px;height:${ORB_SIZE}px;cursor:pointer;position:relative;transition:transform .3s cubic-bezier(.34,1.56,.64,1);}
      .${PFX}orb-wrap:hover{transform:scale(1.08);}
      .${PFX}orb-canvas{width:100%;height:100%;border-radius:50%;}
      .${PFX}bubble{position:absolute;bottom:70px;right:0;background:${c.bg1}cc;border:1px solid ${c.primaryGlow};color:#e0e8f0;padding:8px 14px;border-radius:12px 12px 2px 12px;font-size:13px;white-space:nowrap;pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity .4s,transform .4s;box-shadow:0 4px 20px rgba(0,0,0,.4);}
      .${PFX}bubble.${PFX}show{opacity:1;transform:translateY(0);}
      .${PFX}panel{position:absolute;bottom:0;right:0;width:${PANEL_W}px;height:${PANEL_H}px;background:${c.bg2};border:1px solid ${c.primaryGlow};border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.6);opacity:0;transform:scale(.3) translateY(40px);transform-origin:bottom right;transition:opacity .35s cubic-bezier(.34,1.56,.64,1),transform .35s cubic-bezier(.34,1.56,.64,1);pointer-events:none;}
      .${PFX}panel.${PFX}open{opacity:1;transform:scale(1) translateY(0);pointer-events:auto;}
      .${PFX}header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:${c.bg1};border-bottom:1px solid ${c.primaryGlow};}
      .${PFX}header-title{font-weight:700;font-size:15px;color:${c.primary};}
      .${PFX}header-close{background:none;border:none;color:#4d6678;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;}
      .${PFX}header-close:hover{color:#e0e8f0;}
      .${PFX}messages{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:${c.primaryGlow} transparent;}
      .${PFX}msg{max-width:85%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;word-wrap:break-word;}
      .${PFX}msg-user{align-self:flex-end;background:${c.primaryGlow};color:#b0c4d8;border-bottom-right-radius:3px;}
      .${PFX}msg-ai{align-self:flex-start;background:${c.primaryGlow};color:#e0e8f0;border-bottom-left-radius:3px;border-left:2px solid ${c.primary};}
      .${PFX}typing{align-self:flex-start;padding:8px 14px;display:none;gap:4px;}
      .${PFX}typing span{width:6px;height:6px;border-radius:50%;background:${c.primary};display:inline-block;animation:${PFX}bounce .6s infinite alternate;}
      .${PFX}typing span:nth-child(2){animation-delay:.15s;}
      .${PFX}typing span:nth-child(3){animation-delay:.3s;}
      @keyframes ${PFX}bounce{to{opacity:.3;transform:translateY(-4px);}}
      .${PFX}input-row{display:flex;gap:6px;padding:10px 12px;border-top:1px solid ${c.primaryGlow};background:${c.bg1};}
      .${PFX}input{flex:1;background:#050a0f;border:1px solid ${c.primaryGlow};border-radius:8px;padding:8px 12px;color:#e0e8f0;font-size:13px;outline:none;font-family:inherit;}
      .${PFX}input:focus{border-color:${c.primary};}
      .${PFX}send-btn,.${PFX}mic-btn{background:none;border:1px solid ${c.primaryGlow};border-radius:8px;color:${c.primary};cursor:pointer;padding:6px 10px;font-size:14px;transition:background .2s;}
      .${PFX}send-btn:hover,.${PFX}mic-btn:hover{background:${c.primaryGlow};}
      .${PFX}mic-btn.${PFX}active{background:rgba(255,60,90,.2);border-color:rgba(255,60,90,.4);color:#ff3c5a;}
      .${PFX}highlight-ring{position:fixed;pointer-events:none;z-index:999998;border:2px solid ${c.primary};border-radius:8px;box-shadow:0 0 12px ${c.primaryGlow},inset 0 0 12px ${c.primaryGlow};animation:${PFX}pulse-ring 1.2s ease-in-out infinite;}
      .${PFX}highlight-tip{position:fixed;z-index:999998;background:${c.bg1}cc;border:1px solid ${c.primaryGlow};color:#e0e8f0;padding:6px 12px;border-radius:8px;font-size:12px;pointer-events:none;max-width:220px;}
      @keyframes ${PFX}pulse-ring{0%,100%{box-shadow:0 0 8px ${c.primaryGlow}}50%{box-shadow:0 0 20px ${c.primaryGlow}}}
      @media(max-width:500px){
        .${PFX}panel{width:calc(100vw - 20px);height:calc(100vh - 100px);right:-10px;bottom:-10px;border-radius:16px 16px 0 0;}
      }
    `;
    document.head.appendChild(s);
  }

  /* ── Widget class ─────────────────────────────────────────────── */
  class BridgeWidget {
    constructor() {
      this.open = loadJSON(LS_OPEN, false);
      this.messages = loadJSON(LS_CHAT, []);
      this.journey = loadJSON(LS_JOURNEY, { pages: [], interactions: 0 });
      this.userData = loadJSON(LS_USER, {});
      this.speaking = false;
      this.recognition = null;
      this.orbPhase = 0;
      this.particles = [];
      this.attentionTimer = 0;
      this.attentionScale = 1;
      this.mouseNear = false;
      this.hintShown = false;
      this.proactiveShown = false;
      this.authUser = null;
      this.nurturePrompt = '';

      this._initAuth();
      this._trackPage();
      injectStyles();
      this._buildDOM();
      this._startOrbAnimation();
      this._setupProactive();
    }

    /* ── auth ──────────────────────────────────────────────────── */
    _initAuth() {
      try {
        const token = localStorage.getItem(LS_TOKEN) || localStorage.getItem('bridge_token');
        if (token) {
          this._verifyToken(token);
        }
      } catch {}
    }

    async _verifyToken(token) {
      try {
        const r = await fetch('/auth/verify', { headers: { 'Authorization': 'Bearer ' + token } });
        if (r.ok) {
          const d = await r.json();
          this.authUser = d.user || d;
        }
      } catch {}
    }

    async _autoRegister(email, name) {
      try {
        const r = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'auto-' + Date.now().toString(36), name: name || email.split('@')[0] })
        });
        if (r.ok) {
          const d = await r.json();
          if (d.token) {
            localStorage.setItem(LS_TOKEN, d.token);
            this.authUser = d.user || d;
          }
        }
      } catch {}
    }

    /* ── page tracking ──────────────────────────────────────────── */
    _trackPage() {
      const path = location.pathname;
      if (this.journey.pages[this.journey.pages.length - 1] !== path) {
        this.journey.pages.push(path);
        saveJSON(LS_JOURNEY, this.journey);
      }
    }

    /* ── DOM building ───────────────────────────────────────────── */
    _buildDOM() {
      const root = el('div', 'root');
      const orbWrap = el('div', 'orb-wrap');
      this.canvas = el('canvas', 'orb-canvas');
      this.canvas.width = ORB_SIZE;
      this.canvas.height = ORB_SIZE;
      this.ctx = this.canvas.getContext('2d');
      orbWrap.appendChild(this.canvas);
      orbWrap.onclick = () => this._toggle();

      this.bubble = el('div', 'bubble');
      root.appendChild(this.bubble);
      root.appendChild(orbWrap);

      const panel = el('div', 'panel');
      const header = el('div', 'header');
      const title = el('div', 'header-title');
      title.textContent = 'BRIDGE AI';
      const close = el('button', 'header-close');
      close.textContent = '×';
      close.onclick = () => this._toggle();
      header.appendChild(title);
      header.appendChild(close);

      const messages = el('div', 'messages');
      this.messagesEl = messages;

      const typing = el('div', 'typing');
      typing.innerHTML = '<span></span><span></span><span></span>';
      this.typingEl = typing;

      const inputRow = el('div', 'input-row');
      this.input = el('input', 'input');
      this.input.placeholder = 'Type a message...';
      this.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this._send();
      });
      const sendBtn = el('button', 'send-btn');
      sendBtn.textContent = '→';
      sendBtn.onclick = () => this._send();
      const micBtn = el('button', 'mic-btn');
      micBtn.textContent = '🎤';
      micBtn.onclick = () => this._toggleVoice();
      this.micBtn = micBtn;

      inputRow.appendChild(this.input);
      inputRow.appendChild(sendBtn);
      inputRow.appendChild(micBtn);

      panel.appendChild(header);
      panel.appendChild(messages);
      panel.appendChild(typing);
      panel.appendChild(inputRow);

      root.appendChild(panel);
      this.panel = panel;
      document.body.appendChild(root);

      // load existing messages
      this._renderMessages();

      // mouse proximity
      document.addEventListener('mousemove', (e) => {
        const rect = orbWrap.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.mouseNear = dist < 120;
      });

      orbWrap.addEventListener('mouseenter', () => { this.mouseNear = true; });
      orbWrap.addEventListener('mouseleave', () => { this.mouseNear = false; });
    }

    _toggle() {
      this.open = !this.open;
      saveJSON(LS_OPEN, this.open);
      this.panel.classList.toggle(PFX + 'open', this.open);
      if (this.open) {
        this.input.focus();
        this.journey.interactions++;
        saveJSON(LS_JOURNEY, this.journey);
      }
    }

    _renderMessages() {
      this.messagesEl.innerHTML = '';
      this.messages.forEach(m => {
        const msgEl = el('div', 'msg ' + (m.role === 'user' ? 'msg-user' : 'msg-ai'));
        msgEl.textContent = m.text;
        this.messagesEl.appendChild(msgEl);
      });
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    async _send() {
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';

      // add user message
      this.messages.push({ role: 'user', text, time: Date.now() });
      if (this.messages.length > MAX_MSGS) this.messages.shift();
      saveJSON(LS_CHAT, this.messages);
      this._renderMessages();

      // capture lead info
      this._captureLeadInfo(text);

      // show typing
      this.typingEl.style.display = 'flex';
      this.messagesEl.appendChild(this.typingEl);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

      // generate response
      const response = await this._generateResponse(text);

      // hide typing
      this.typingEl.style.display = 'none';

      // add AI message
      this.messages.push({ role: 'ai', text: response, time: Date.now() });
      if (this.messages.length > MAX_MSGS) this.messages.shift();
      saveJSON(LS_CHAT, this.messages);
      this._renderMessages();
    }

    async _generateResponse(text) {
      const context = PAGE_CONTEXT[location.pathname] || 'The user is on a Bridge AI OS page.';
      const prompt = `${SYSTEM_KB}\n\nPage context: ${context}\n\nUser message: ${text}`;
      
      try {
        const r = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, context })
        });
        if (r.ok) {
          const d = await r.json();
          return d.response || d.message || this._fallbackResponse(text);
        }
      } catch {}

      return this._fallbackResponse(text);
    }

    _fallbackResponse(text) {
      const lower = text.toLowerCase();
      if (lower.includes('price') || lower.includes('cost') || lower.includes('plan'))
        return 'We have three pricing tiers: Starter (free), Pro at R499/mo, and Enterprise at R2,499/mo. The Pro plan includes 10 AI agents, CRM, invoicing, and the agent economy dashboard. Enterprise adds dedicated support and custom integrations.';
      if (lower.includes('hello') || lower.includes('hi'))
        return 'Hello! Welcome to Bridge AI OS. I can help you explore the platform, answer pricing questions, or guide you through any feature. What interests you?';
      return 'Thanks for your message! I\'m here to help with anything about Bridge AI OS — pricing, features, agent economy, or getting started. What would you like to know?';
    }

    /* ── lead capture ──────────────────────────────────────────── */
    _captureLeadInfo(text) {
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
      if (emailMatch) {
        this.userData.email = emailMatch[0];
        saveJSON(LS_USER, this.userData);
        this._postLead();
        // Auto-register user when email is mentioned
        if (!this.authUser) {
          this._autoRegister(emailMatch[0], this.userData.name);
        }
      }
      const nameMatch = text.match(/(?:my name is|i'm|i am)\s+(\w+(?:\s+\w+)?)/i);
      if (nameMatch) {
        this.userData.name = nameMatch[1];
        saveJSON(LS_USER, this.userData);
      }
    }

    async _postLead() {
      try {
        await fetch('/api/leads/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.userData)
        });
      } catch {}
    }

    /* ── voice ─────────────────────────────────────────────────── */
    _toggleVoice() {
      if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
      if (this.speaking) {
        this.recognition.stop();
        this.speaking = false;
        this.micBtn.classList.remove(PFX + 'active');
        return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SR();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      this.recognition.onresult = (e) => {
        const t = e.results[0][0].transcript;
        this.input.value = t;
        this._send();
      };
      this.recognition.onend = () => {
        this.speaking = false;
        this.micBtn.classList.remove(PFX + 'active');
      };
      this.recognition.start();
      this.speaking = true;
      this.micBtn.classList.add(PFX + 'active');
    }

    /* ── element highlighting ──────────────────────────────────── */
    highlightElement(selector, message) {
      try {
        const target = document.querySelector(selector);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const ring = el('div', 'highlight-ring');
        ring.style.left = (rect.left - 4) + 'px';
        ring.style.top = (rect.top - 4) + 'px';
        ring.style.width = (rect.width + 8) + 'px';
        ring.style.height = (rect.height + 8) + 'px';
        document.body.appendChild(ring);

        if (message) {
          const tip = el('div', 'highlight-tip');
          tip.textContent = message;
          tip.style.left = rect.left + 'px';
          tip.style.top = (rect.top - 32) + 'px';
          document.body.appendChild(tip);
          setTimeout(() => tip.remove(), 5000);
        }

        const remove = () => { ring.remove(); };
        setTimeout(remove, 5000);
        target.addEventListener('click', remove, { once: true });
      } catch {}
    }

    /* ── proactive engagement ──────────────────────────────────── */
    _setupProactive() {
      const path = location.pathname;
      const hint = PROACTIVE_HINTS[path];
      const delay = hint ? hint.delay : 30000;
      const text = hint ? hint.text : 'Need any help?';

      setTimeout(() => {
        if (!this.open && !this.proactiveShown) {
          this.proactiveShown = true;
          this._showBubble(text);
        }
      }, delay);

      // multi-page engagement
      if (this.journey.pages.length >= 3 && !this.userData.offered) {
        setTimeout(() => {
          if (!this.open) {
            this._showBubble('You seem interested! Want me to set up a free account?');
            this.userData.offered = true;
            saveJSON(LS_USER, this.userData);
          }
        }, 15000);
      }
    }

    _showBubble(text) {
      this.bubble.textContent = text;
      this.bubble.classList.add(PFX + 'show');
      setTimeout(() => { this.bubble.classList.remove(PFX + 'show'); }, 4000);
    }

    /* ── canvas orb animation ──────────────────────────────────── */
    _startOrbAnimation() {
      const c = this.canvas;
      const ctx = this.ctx;
      const w = c.width;
      const h = c.height;
      const cx = w / 2;
      const cy = h / 2;
      let frame = 0;
      let lastAttention = 0;
      let hintCycle = 0;

      const loop = (time) => {
        requestAnimationFrame(loop);
        if (this.open) return;
        frame++;
        ctx.clearRect(0, 0, w, h);

        const breathe = 1 + Math.sin(frame * 0.03) * 0.06;

        // attention grab every ~18 seconds (roughly 1080 frames at 60fps)
        const sinceLast = frame - lastAttention;
        if (sinceLast > 1080) {
          lastAttention = frame;
          this.attentionTimer = 30;
          // spawn burst particles
          for (let i = 0; i < 10; i++) {
            const angle = (Math.PI * 2 * i) / 10;
            this.particles.push({
              x: cx, y: cy,
              vx: Math.cos(angle) * 2.5,
              vy: Math.sin(angle) * 2.5,
              life: 40, maxLife: 40, size: 2.5
            });
          }
        }

        // idle hint bubble every ~20 seconds offset from attention
        if (frame % 1200 === 600 && !this.open) {
          this._showBubble(IDLE_HINTS[hintCycle % IDLE_HINTS.length]);
          hintCycle++;
        }

        // attention scale
        if (this.attentionTimer > 0) {
          this.attentionTimer--;
          const t = this.attentionTimer / 30;
          this.attentionScale = 1 + Math.sin(t * Math.PI) * 0.35;
        } else {
          this.attentionScale = 1;
        }

        const glow = this.mouseNear ? 1.3 : 1;
        const scale = breathe * this.attentionScale;
        const r = 22 * scale * glow;

        // outer glow
        const outerGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.2);
        outerGrad.addColorStop(0, `rgba(${c.primaryRgb},${0.12 * glow})`);
        outerGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
        ctx.fill();

        // pulsing rings
        for (let i = 0; i < 3; i++) {
          const ringPhase = (frame * 0.02 + i * 2.1) % (Math.PI * 2);
          const ringR = r * (1.2 + Math.sin(ringPhase) * 0.3 + i * 0.25);
          const alpha = (0.15 - i * 0.04) * glow;
          ctx.strokeStyle = `rgba(${c.primaryRgb},${alpha})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // core orb gradient
        const coreGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
        coreGrad.addColorStop(0, `rgba(${c.primaryRgb},0.9)`);
        coreGrad.addColorStop(0.5, `rgba(${c.primaryRgb},0.7)`);
        coreGrad.addColorStop(1, `rgba(${c.primaryRgb},0.3)`);
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // inner highlight
        const hiGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r * 0.7);
        hiGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
        hiGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hiGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
        ctx.fill();

        // occasional thought sparks
        if (frame % 45 === 0 && this.particles.length < 20) {
          const angle = Math.random() * Math.PI * 2;
          this.particles.push({
            x: cx + Math.cos(angle) * r * 0.6,
            y: cy + Math.sin(angle) * r * 0.6,
            vx: Math.cos(angle) * (1 + Math.random()),
            vy: Math.sin(angle) * (1 + Math.random()) - 0.5,
            life: 30 + Math.random() * 20,
            maxLife: 50,
            size: 1.5 + Math.random()
          });
        }

        // draw & update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life--;
          if (p.life <= 0) { this.particles.splice(i, 1); continue; }
          const alpha = p.life / p.maxLife;
          ctx.fillStyle = `rgba(${c.primaryRgb},${alpha * 0.8})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      requestAnimationFrame(loop);
    }
  }

  /* ── auto-init ────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BridgeWidget());
  } else {
    new BridgeWidget();
  }
})();
