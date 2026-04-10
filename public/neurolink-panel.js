/**
 * NeuroLink Panel Component
 * Real-time cognitive state visualization
 * Metrics: focus, stress, fatigue, emotion (VAD), intent, signal quality
 */

class NeuroLinkPanel {
  constructor(containerId = 'neuro-panel', wsUrl = null) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.warn(`NeuroLink: Container #${containerId} not found`);
      return;
    }

    this.wsUrl = wsUrl || this._getWsUrl();
    this.ws = null;
    this.currentState = null;
    this.history = [];
    this.maxHistoryPoints = 120; // 2 minutes at 1Hz

    this.init();
  }

  /**
   * Get WebSocket URL based on current location
   */
  _getWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/neurolink`;
  }

  /**
   * Initialize panel and connect WebSocket
   */
  async init() {
    this.render();
    this.connectWebSocket();
  }

  /**
   * Render initial HTML structure
   */
  render() {
    this.container.innerHTML = `
      <div class="neuro-panel">
        <div class="neuro-header">
          <div class="neuro-title">
            <span class="neuro-icon">🧠</span>
            <span class="neuro-label">NeuroLink</span>
          </div>
          <div class="neuro-status">
            <span class="neuro-mode-badge" id="neuro-mode">AMBIENT</span>
            <span class="neuro-connection-indicator" id="neuro-connection">●</span>
          </div>
        </div>

        <div class="neuro-metrics">
          <div class="neuro-metric">
            <div class="neuro-metric-label">
              <span>Focus</span>
              <span class="neuro-value" id="neuro-focus-value">—</span>
            </div>
            <div class="neuro-meter">
              <div class="neuro-bar" id="neuro-focus-bar" style="width: 0%; background: linear-gradient(90deg, #ff6b6b, #ffd93d, #6bcf7f);"></div>
            </div>
            <div class="neuro-confidence" id="neuro-focus-confidence">conf: —</div>
          </div>

          <div class="neuro-metric">
            <div class="neuro-metric-label">
              <span>Stress</span>
              <span class="neuro-value" id="neuro-stress-value">—</span>
            </div>
            <div class="neuro-meter">
              <div class="neuro-bar" id="neuro-stress-bar" style="width: 0%; background: linear-gradient(90deg, #6bcf7f, #ffd93d, #ff6b6b);"></div>
            </div>
            <div class="neuro-confidence" id="neuro-stress-confidence">conf: —</div>
          </div>

          <div class="neuro-metric">
            <div class="neuro-metric-label">
              <span>Fatigue</span>
              <span class="neuro-value" id="neuro-fatigue-value">—</span>
            </div>
            <div class="neuro-meter">
              <div class="neuro-bar" id="neuro-fatigue-bar" style="width: 0%; background: linear-gradient(90deg, #6bcf7f, #4d96ff, #9b6fff);"></div>
            </div>
            <div class="neuro-confidence" id="neuro-fatigue-confidence">conf: —</div>
            <div class="neuro-warning" id="neuro-fatigue-warning" style="display:none;">⚠️ High fatigue</div>
          </div>
        </div>

        <div class="neuro-section">
          <div class="neuro-section-title">Emotion</div>
          <div class="neuro-emotion">
            <canvas id="neuro-emotion-radar" width="200" height="200"></canvas>
            <div class="neuro-emotion-label" id="neuro-emotion-label">—</div>
          </div>
        </div>

        <div class="neuro-section">
          <div class="neuro-section-title">Intent</div>
          <div class="neuro-intent">
            <div class="neuro-intent-label" id="neuro-intent-label">—</div>
            <div class="neuro-intent-confidence" id="neuro-intent-confidence">conf: —</div>
          </div>
        </div>

        <div class="neuro-section">
          <div class="neuro-section-title">Signal Quality</div>
          <div class="neuro-signal-quality">
            <div class="neuro-meter">
              <div class="neuro-bar" id="neuro-signal-bar" style="width: 0%; background: #4d96ff;"></div>
            </div>
            <div class="neuro-signal-value" id="neuro-signal-value">—</div>
          </div>
        </div>

        <div class="neuro-section neuro-trust">
          <div class="neuro-section-title">Why?</div>
          <button class="neuro-explain-btn" id="neuro-explain-btn">Show Explanation</button>
          <div class="neuro-explanation" id="neuro-explanation" style="display:none;">
            <div id="neuro-explanation-content"></div>
          </div>
        </div>

        <div class="neuro-section">
          <div class="neuro-section-title">Last 2 Minutes</div>
          <div class="neuro-history">
            <canvas id="neuro-history-canvas" width="300" height="80"></canvas>
          </div>
        </div>

        <div class="neuro-section neuro-settings">
          <button class="neuro-settings-btn" id="neuro-settings-btn">⚙️</button>
          <div class="neuro-settings-panel" id="neuro-settings-panel" style="display:none;">
            <label>
              <input type="checkbox" id="neuro-auto-mode" checked />
              Auto Mode Switching
            </label>
            <label>
              <input type="checkbox" id="neuro-enable-hooks" checked />
              Enable Revenue Hooks
            </label>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    document.getElementById('neuro-explain-btn').addEventListener('click', () => {
      const panel = document.getElementById('neuro-explanation');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('neuro-settings-btn').addEventListener('click', () => {
      const panel = document.getElementById('neuro-settings-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  }

  /**
   * Connect to NeuroLink WebSocket
   */
  connectWebSocket() {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[NeuroLink] WebSocket connected');
        this.updateConnection(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (err) {
          console.error('[NeuroLink] WebSocket parse error:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[NeuroLink] WebSocket error:', err);
        this.updateConnection(false);
      };

      this.ws.onclose = () => {
        console.log('[NeuroLink] WebSocket closed, reconnecting...');
        this.updateConnection(false);
        setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch (err) {
      console.error('[NeuroLink] WebSocket connection failed:', err);
      this.updateConnection(false);
    }
  }

  /**
   * Handle WebSocket messages
   */
  handleMessage(message) {
    if (message.type === 'NEUROLINK_STATE_UPDATE') {
      this.setState(message.data);
    } else if (message.type === 'NEUROLINK_EVENT') {
      this.handleEvent(message.data);
    }
  }

  /**
   * Update state and refresh UI
   */
  setState(state) {
    this.currentState = state;
    this.history.push(state);
    if (this.history.length > this.maxHistoryPoints) {
      this.history.shift();
    }

    this.updateMetrics(state);
    this.updateEmotion(state);
    this.updateIntent(state);
    this.updateSignalQuality(state);
    this.updateExplanation(state);
    this.updateHistory();
  }

  /**
   * Update metric displays
   */
  updateMetrics(state) {
    const focusPercent = Math.round(state.focus.value * 100);
    document.getElementById('neuro-focus-value').textContent = focusPercent + '%';
    document.getElementById('neuro-focus-bar').style.width = focusPercent + '%';
    document.getElementById('neuro-focus-confidence').textContent = `conf: ${Math.round(state.focus.confidence * 100)}%`;

    const stressPercent = Math.round(state.stress.value * 100);
    document.getElementById('neuro-stress-value').textContent = stressPercent + '%';
    document.getElementById('neuro-stress-bar').style.width = stressPercent + '%';
    document.getElementById('neuro-stress-confidence').textContent = `conf: ${Math.round(state.stress.confidence * 100)}%`;

    const fatiguePercent = Math.round(state.fatigue.value * 100);
    document.getElementById('neuro-fatigue-value').textContent = fatiguePercent + '%';
    document.getElementById('neuro-fatigue-bar').style.width = fatiguePercent + '%';
    document.getElementById('neuro-fatigue-confidence').textContent = `conf: ${Math.round(state.fatigue.confidence * 100)}%`;

    const warning = document.getElementById('neuro-fatigue-warning');
    warning.style.display = state.fatigue.value > 0.75 ? 'block' : 'none';
  }

  /**
   * Update emotion radar
   */
  updateEmotion(state) {
    const canvas = document.getElementById('neuro-emotion-radar');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 70;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;

    const angle1 = -Math.PI / 2;
    const angle2 = (Math.PI * 5) / 6;
    const angle3 = (-Math.PI * 5) / 6;

    const x1 = centerX + radius * Math.cos(angle1);
    const y1 = centerY + radius * Math.sin(angle1);
    const x2 = centerX + radius * Math.cos(angle2);
    const y2 = centerY + radius * Math.sin(angle2);
    const x3 = centerX + radius * Math.cos(angle3);
    const y3 = centerY + radius * Math.sin(angle3);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.stroke();

    const v = state.emotion.valence.value;
    const a = state.emotion.arousal.value;
    const d = state.emotion.dominance.value;

    const px = centerX + (v * Math.cos(angle1) + a * Math.cos(angle2) + d * Math.cos(angle3)) * radius / 3;
    const py = centerY + (v * Math.sin(angle1) + a * Math.sin(angle2) + d * Math.sin(angle3)) * radius / 3;

    ctx.fillStyle = '#4d96ff';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();

    document.getElementById('neuro-emotion-label').textContent = state.emotion.label || 'neutral';
  }

  /**
   * Update intent display
   */
  updateIntent(state) {
    const intentIcons = {
      deep_work: '🎯',
      context_switching: '🔄',
      winding_down: '🌙',
      explore: '🔍',
      idle: '⏸️',
      general: '▬'
    };

    const icon = intentIcons[state.intent.label] || '▬';
    document.getElementById('neuro-intent-label').textContent = `${icon} ${state.intent.label}`;
    document.getElementById('neuro-intent-confidence').textContent = `conf: ${Math.round(state.intent.confidence * 100)}%`;
  }

  /**
   * Update signal quality
   */
  updateSignalQuality(state) {
    const sqPercent = Math.round(state.signalQuality * 100);
    document.getElementById('neuro-signal-bar').style.width = sqPercent + '%';
    document.getElementById('neuro-signal-value').textContent = sqPercent + '%';
  }

  /**
   * Update explanation panel (safe DOM approach)
   */
  updateExplanation(state) {
    const container = document.getElementById('neuro-explanation-content');
    container.textContent = '';

    const ul = document.createElement('ul');
    const explanations = [
      ...state.focus.why.map(w => ({ type: 'Focus', text: w })),
      ...state.stress.why.map(w => ({ type: 'Stress', text: w })),
      ...state.fatigue.why.map(w => ({ type: 'Fatigue', text: w })),
      ...state.intent.why.map(w => ({ type: 'Intent', text: w }))
    ];

    explanations.forEach(({ type, text }) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = `${type}: `;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(text));
      ul.appendChild(li);
    });

    container.appendChild(ul);
  }

  /**
   * Draw history sparkline
   */
  updateHistory() {
    const canvas = document.getElementById('neuro-history-canvas');
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.history.length < 2) return;

    const width = canvas.width;
    const height = canvas.height;
    const pointWidth = width / this.history.length;

    ctx.strokeStyle = '#6bcf7f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.history.forEach((state, i) => {
      const x = i * pointWidth;
      const y = height - state.focus.value * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#ff6b6b';
    ctx.beginPath();
    this.history.forEach((state, i) => {
      const x = i * pointWidth;
      const y = height - state.stress.value * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  /**
   * Update connection indicator
   */
  updateConnection(connected) {
    const indicator = document.getElementById('neuro-connection');
    indicator.style.color = connected ? '#6bcf7f' : '#ff6b6b';
    indicator.style.animation = connected ? 'neuro-pulse 2s infinite' : 'none';
  }

  /**
   * Handle NeuroLink events
   */
  handleEvent(event) {
    console.log('[NeuroLink] Event:', event.event, event);
  }

  /**
   * Record user input for ambient adapter training
   */
  recordInput(params = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'RECORD_INPUT',
        data: params
      }));
    }
  }

  /**
   * Record window switch
   */
  recordWindowSwitch() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'RECORD_WINDOW_SWITCH'
      }));
    }
  }
}

// Auto-initialize if element exists
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('neuro-panel')) {
      window.neuroLink = new NeuroLinkPanel('neuro-panel');
    }
  });
} else {
  if (document.getElementById('neuro-panel')) {
    window.neuroLink = new NeuroLinkPanel('neuro-panel');
  }
}
