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
  const CYAN = '#00c8ff';
  const CYAN_RGB = '0,200,255';
  const ORB_SIZE = 60;
  const ORB_EXPAND = 80;
  const PANEL_W = 350;
  const PANEL_H = 500;

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
      .${PFX}bubble{position:absolute;bottom:70px;right:0;background:rgba(10,21,32,.92);border:1px solid rgba(${CYAN_RGB},.3);color:#e0e8f0;padding:8px 14px;border-radius:12px 12px 2px 12px;font-size:13px;white-space:nowrap;pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity .4s,transform .4s;box-shadow:0 4px 20px rgba(0,0,0,.4);}
      .${PFX}bubble.${PFX}show{opacity:1;transform:translateY(0);}
      .${PFX}panel{position:absolute;bottom:0;right:0;width:${PANEL_W}px;height:${PANEL_H}px;background:#0a1520;border:1px solid rgba(${CYAN_RGB},.25);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.6);opacity:0;transform:scale(.3) translateY(40px);transform-origin:bottom right;transition:opacity .35s cubic-bezier(.34,1.56,.64,1),transform .35s cubic-bezier(.34,1.56,.64,1);pointer-events:none;}
      .${PFX}panel.${PFX}open{opacity:1;transform:scale(1) translateY(0);pointer-events:auto;}
      .${PFX}header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#0d1a28;border-bottom:1px solid rgba(${CYAN_RGB},.15);}
      .${PFX}header-title{font-weight:700;font-size:15px;color:${CYAN};}
      .${PFX}header-close{background:none;border:none;color:#4d6678;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;}
      .${PFX}header-close:hover{color:#e0e8f0;}
      .${PFX}messages{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:rgba(${CYAN_RGB},.2) transparent;}
      .${PFX}msg{max-width:85%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;word-wrap:break-word;}
      .${PFX}msg-user{align-self:flex-end;background:rgba(${CYAN_RGB},.1);color:#b0c4d8;border-bottom-right-radius:3px;}
      .${PFX}msg-ai{align-self:flex-start;background:rgba(${CYAN_RGB},.15);color:#e0e8f0;border-bottom-left-radius:3px;border-left:2px solid ${CYAN};}
      .${PFX}typing{align-self:flex-start;padding:8px 14px;display:none;gap:4px;}
      .${PFX}typing span{width:6px;height:6px;border-radius:50%;background:${CYAN};display:inline-block;animation:${PFX}bounce .6s infinite alternate;}
      .${PFX}typing span:nth-child(2){animation-delay:.15s;}
      .${PFX}typing span:nth-child(3){animation-delay:.3s;}
      @keyframes ${PFX}bounce{to{opacity:.3;transform:translateY(-4px);}}
      .${PFX}input-row{display:flex;gap:6px;padding:10px 12px;border-top:1px solid rgba(${CYAN_RGB},.12);background:#0d1a28;}
      .${PFX}input{flex:1;background:#050a0f;border:1px solid rgba(${CYAN_RGB},.2);border-radius:8px;padding:8px 12px;color:#e0e8f0;font-size:13px;outline:none;font-family:inherit;}
      .${PFX}input:focus{border-color:${CYAN};}
      .${PFX}send-btn,.${PFX}mic-btn{background:none;border:1px solid rgba(${CYAN_RGB},.25);border-radius:8px;color:${CYAN};cursor:pointer;padding:6px 10px;font-size:14px;transition:background .2s;}
      .${PFX}send-btn:hover,.${PFX}mic-btn:hover{background:rgba(${CYAN_RGB},.1);}
      .${PFX}mic-btn.${PFX}active{background:rgba(255,60,90,.2);border-color:rgba(255,60,90,.4);color:#ff3c5a;}
      .${PFX}highlight-ring{position:fixed;pointer-events:none;z-index:999998;border:2px solid ${CYAN};border-radius:8px;box-shadow:0 0 12px rgba(${CYAN_RGB},.4),inset 0 0 12px rgba(${CYAN_RGB},.1);animation:${PFX}pulse-ring 1.2s ease-in-out infinite;}
      .${PFX}highlight-tip{position:fixed;z-index:999998;background:rgba(10,21,32,.95);border:1px solid rgba(${CYAN_RGB},.3);color:#e0e8f0;padding:6px 12px;border-radius:8px;font-size:12px;pointer-events:none;max-width:220px;}
      @keyframes ${PFX}pulse-ring{0%,100%{box-shadow:0 0 8px rgba(${CYAN_RGB},.3)}50%{box-shadow:0 0 20px rgba(${CYAN_RGB},.6)}}
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
      if (this.open) this._showPanel();
    }

    /* ── auth + identity ──────────────────────────────────────── */
    async _initAuth() {
      const token = localStorage.getItem(LS_TOKEN);
      if (!token) return;
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) { localStorage.removeItem(LS_TOKEN); return; }
        const data = await res.json();
        if (data.ok && data.user) {
          this.authUser = data.user;
          this.nurturePrompt = data.nurture_prompt || '';
          this.userData.name = data.user.name || this.userData.name;
          this.userData.email = data.user.email || this.userData.email;
          this.userData.funnel_stage = data.user.funnel_stage;
          this.userData.plan = data.user.plan;
          saveJSON(LS_USER, this.userData);
        }
      } catch (_) {}
    }

    async _autoRegister(email, name) {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: name || this.userData.name, password: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('') })
        });
        const data = await res.json();
        if (data.ok && data.token) {
          localStorage.setItem(LS_TOKEN, data.token);
          this.authUser = data.user;
          this.nurturePrompt = '';
          this.userData.email = email;
          saveJSON(LS_USER, this.userData);
        }
      } catch (_) {}
    }

    _getAuthHeaders() {
      const token = localStorage.getItem(LS_TOKEN);
      if (!token) return {};
      return { 'Authorization': 'Bearer ' + token };
    }

    async _recordConversation() {
      try {
        await fetch('/api/user/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this._getAuthHeaders() }
        });
      } catch (_) {}
    }

    /* ── journey tracking ──────────────────────────────────────── */
    _trackPage() {
      const path = location.pathname;
      const j = this.journey;
      if (!j.pages.find(p => p.path === path)) {
        j.pages.push({ path: path, entered: Date.now() });
      }
      saveJSON(LS_JOURNEY, j);
    }

    /* ── DOM construction ──────────────────────────────────────── */
    _buildDOM() {
      this.root = el('div', 'root');

      // orb
      this.orbWrap = el('div', 'orb-wrap');
      this.canvas = el('canvas', 'orb-canvas');
      this.canvas.width = ORB_SIZE * 2;
      this.canvas.height = ORB_SIZE * 2;
      this.ctx = this.canvas.getContext('2d');
      this.orbWrap.appendChild(this.canvas);
      this.orbWrap.addEventListener('click', () => this._toggle());

      // speech bubble
      this.bubble = el('div', 'bubble');
      this.bubble.textContent = 'Need help?';
      this.orbWrap.appendChild(this.bubble);
      this.root.appendChild(this.orbWrap);

      // panel
      this.panel = el('div', 'panel');
      this._buildPanel();
      this.root.appendChild(this.panel);

      document.body.appendChild(this.root);

      // mouse proximity
      document.addEventListener('mousemove', (e) => {
        const r = this.orbWrap.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        this.mouseNear = dist < 150;
      }, { passive: true });
    }

    _buildPanel() {
      // header
      const hdr = el('div', 'header');
      const title = el('span', 'header-title');
      title.textContent = 'Bridge AI';
      const closeBtn = el('button', 'header-close');
      closeBtn.textContent = '\u00D7';
      closeBtn.addEventListener('click', () => this._toggle());
      hdr.appendChild(title);
      hdr.appendChild(closeBtn);
      this.panel.appendChild(hdr);

      // messages area
      this.msgArea = el('div', 'messages');
      this.panel.appendChild(this.msgArea);

      // typing indicator
      this.typingEl = el('div', 'typing');
      for (let i = 0; i < 3; i++) this.typingEl.appendChild(document.createElement('span'));
      this.msgArea.appendChild(this.typingEl);

      // render stored messages
      this.messages.forEach(m => this._renderMsg(m.role, m.text, false));

      // input row
      const inputRow = el('div', 'input-row');
      this.input = el('input', 'input', { type: 'text', placeholder: 'Type a message...' });
      this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._send(); });
      const sendBtn = el('button', 'send-btn');
      sendBtn.textContent = '\u27A4';
      sendBtn.addEventListener('click', () => this._send());
      this.micBtn = el('button', 'mic-btn');
      this.micBtn.textContent = '\uD83C\uDF99';
      this.micBtn.addEventListener('click', () => this._toggleVoice());
      inputRow.appendChild(this.input);
      inputRow.appendChild(sendBtn);
      inputRow.appendChild(this.micBtn);
      this.panel.appendChild(inputRow);
    }

    /* ── open / close ──────────────────────────────────────────── */
    _toggle() {
      this.open = !this.open;
      saveJSON(LS_OPEN, this.open);
      if (this.open) this._showPanel(); else this._hidePanel();
    }

    _showPanel() {
      this.open = true;
      this.panel.classList.add(PFX + 'open');
      this.orbWrap.style.display = 'none';
      this.input.focus();
      this._scrollBottom();
      if (this.messages.length === 0) {
        this._addAIMsg('Hey there! I\'m Bridge, your AI assistant. How can I help you today?');
      }
    }

    _hidePanel() {
      this.open = false;
      this.panel.classList.remove(PFX + 'open');
      this.orbWrap.style.display = '';
    }

    /* ── messaging ─────────────────────────────────────────────── */
    _send() {
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this._addMsg('user', text);
      this._captureLeadInfo(text);
      this._callLLM(text);
      this._recordConversation();
      this.journey.interactions++;
      saveJSON(LS_JOURNEY, this.journey);
    }

    _addMsg(role, text) {
      this.messages.push({ role, text, ts: Date.now() });
      if (this.messages.length > MAX_MSGS) this.messages = this.messages.slice(-MAX_MSGS);
      saveJSON(LS_CHAT, this.messages);
      this._renderMsg(role, text, true);
    }

    _addAIMsg(text) {
      this._addMsg('ai', text);
    }

    _renderMsg(role, text, scroll) {
      const m = el('div', 'msg msg-' + role);
      m.textContent = text;
      this.msgArea.insertBefore(m, this.typingEl);
      if (scroll) this._scrollBottom();
    }

    _scrollBottom() {
      requestAnimationFrame(() => { this.msgArea.scrollTop = this.msgArea.scrollHeight; });
    }

    _showTyping(show) {
      this.typingEl.style.display = show ? 'flex' : 'none';
      if (show) this._scrollBottom();
    }

    /* ── LLM call ──────────────────────────────────────────────── */
    async _callLLM(userText) {
      this._showTyping(true);
      const path = location.pathname;
      const pageCtx = PAGE_CONTEXT[path] || 'The user is browsing Bridge AI OS.';
      const journeyDesc = this.journey.pages.map(p => p.path).join(' -> ');
      const history = this.messages.slice(-10).map(m => (m.role === 'user' ? 'User' : 'Bridge') + ': ' + m.text).join('\n');

      const userCtx = this.authUser
        ? `Authenticated user: ${this.authUser.name || 'unnamed'} (${this.authUser.email}), plan: ${this.authUser.plan || 'visitor'}, funnel: ${this.authUser.funnel_stage || 'visitor'}, score: ${this.authUser.lead_score || 0}`
        : `Anonymous visitor. User info: ${JSON.stringify(this.userData)}`;
      const nurtureAddon = this.nurturePrompt ? `\nNurture guidance: ${this.nurturePrompt}` : '';

      const systemPrompt = `${SYSTEM_KB}

Current page: ${path}
Page context: ${pageCtx}
User journey: ${journeyDesc}
Pages visited: ${this.journey.pages.length}
${userCtx}${nurtureAddon}

Recent conversation:
${history}

Respond concisely (2-3 sentences max). Be helpful and guide the user. If you mention a UI element they should click, wrap it like [click: selector] e.g. [click: .nav-cta] so the widget can highlight it.`;

      try {
        const res = await fetch('/api/llm/infer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system: systemPrompt, prompt: userText, max_tokens: 200 })
        });

        this._showTyping(false);

        if (!res.ok) {
          this._addAIMsg(this._fallbackResponse(userText));
          return;
        }

        const data = await res.json();
        const reply = (data.response || data.text || data.content || '').trim();
        if (!reply) { this._addAIMsg(this._fallbackResponse(userText)); return; }

        // check for highlight directives
        const highlightMatch = reply.match(/\[click:\s*([^\]]+)\]/);
        const cleanReply = reply.replace(/\[click:\s*[^\]]+\]/g, '').trim();
        this._addAIMsg(cleanReply);
        if (highlightMatch) {
          this.highlightElement(highlightMatch[1].trim(), 'Click here');
        }
      } catch (e) {
        this._showTyping(false);
        this._addAIMsg(this._fallbackResponse(userText));
      }
    }

    _fallbackResponse(text) {
      const t = text.toLowerCase();
      if (t.includes('price') || t.includes('cost') || t.includes('plan'))
        return 'We offer three plans: Starter (free), Pro at R499/mo, and Enterprise at R2,499/mo. The Pro plan is the most popular! Visit our checkout page for details.';
      if (t.includes('token') || t.includes('brdg') || t.includes('economy'))
        return 'BRDG tokens power our agent economy. Agents earn tokens by completing tasks, and 1% of every transaction is burned to keep the economy deflationary. Check the Economy dashboard for live stats.';
      if (t.includes('help') || t.includes('how'))
        return 'I can help you navigate Bridge AI OS! Try asking about pricing, features, the agent economy, or how to get started.';
      if (t.includes('hello') || t.includes('hi ') || t === 'hi')
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
        outerGrad.addColorStop(0, `rgba(${CYAN_RGB},${0.12 * glow})`);
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
          ctx.strokeStyle = `rgba(${CYAN_RGB},${alpha})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // core orb gradient
        const coreGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
        coreGrad.addColorStop(0, `rgba(${CYAN_RGB},0.9)`);
        coreGrad.addColorStop(0.5, `rgba(0,160,220,0.7)`);
        coreGrad.addColorStop(1, `rgba(0,80,140,0.3)`);
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
          ctx.fillStyle = `rgba(${CYAN_RGB},${alpha * 0.8})`;
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
