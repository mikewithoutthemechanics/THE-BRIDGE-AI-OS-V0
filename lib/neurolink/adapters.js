'use strict';
/**
 * lib/neurolink/adapters.js — Device Adapters for EEG Hardware
 *
 * Pluggable adapter interface for different BCI devices.
 * Each adapter implements: connect(), disconnect(), stream(), metadata().
 *
 * Included adapters:
 *   SimulatedAdapter  — generates physiologically realistic EEG (always available)
 *   BrainFlowAdapter  — OpenBCI via BrainFlow SDK (requires brainflow npm)
 *   MuseAdapter       — Muse headband via bluetooth (requires noble/web-bluetooth)
 *   EmotivAdapter     — Emotiv EPOC X via Cortex API (requires WebSocket)
 *
 * The SimulatedAdapter generates signals that match real EEG statistical
 * properties (1/f spectral slope, 10Hz alpha peak, realistic amplitudes)
 * so the entire pipeline runs identically in both modes.
 */

// ── Adapter Interface ────────────────────────────────────────────────────────

class NeuroDeviceAdapter {
  async connect() { throw new Error('Not implemented'); }
  async disconnect() { throw new Error('Not implemented'); }
  async *stream() { throw new Error('Not implemented'); }
  metadata() { return { device: 'unknown', channels: 0, sampleRate: 0, connected: false }; }
}

// ── Simulated Adapter (always available) ─────────────────────────────────────

class SimulatedAdapter extends NeuroDeviceAdapter {
  constructor(opts = {}) {
    super();
    this.channels = opts.channels || 4;
    this.sampleRate = opts.sampleRate || 256;
    this.windowSize = opts.windowSize || 512; // ~2 seconds at 256Hz
    this.connected = false;
    this._running = false;

    // Simulated user state (drifts slowly to create realistic patterns)
    this._state = {
      alertness: 0.6 + Math.random() * 0.3,  // base alertness
      relaxation: 0.3 + Math.random() * 0.2,  // base relaxation
      drift: 0,
    };
  }

  async connect() {
    this.connected = true;
    this._running = true;
  }

  async disconnect() {
    this._running = false;
    this.connected = false;
  }

  metadata() {
    return {
      device: 'SimulatedEEG',
      deviceType: 'simulated',
      channels: this.channels,
      sampleRate: this.sampleRate,
      connected: this.connected,
      interface: 'internal',
      note: 'Physiologically realistic simulated EEG for pipeline testing',
    };
  }

  async *stream() {
    while (this._running) {
      const channels = [];
      for (let ch = 0; ch < this.channels; ch++) {
        channels.push(this._generateChannel(ch));
      }
      yield channels;

      // ~2 seconds between windows (matches real EEG window rate)
      await new Promise(r => setTimeout(r, (this.windowSize / this.sampleRate) * 1000));
    }
  }

  /**
   * Generate a single channel of physiologically realistic EEG.
   * Uses 1/f noise base + alpha/beta oscillatory peaks + random artifacts.
   */
  _generateChannel(channelIdx) {
    const signal = new Float64Array(this.windowSize);

    // Slowly drift simulated state (creates natural fluctuations)
    this._state.drift += (Math.random() - 0.5) * 0.02;
    this._state.alertness = Math.max(0.1, Math.min(0.95,
      this._state.alertness + (Math.random() - 0.5) * 0.01 + this._state.drift * 0.1
    ));
    this._state.relaxation = Math.max(0.1, Math.min(0.9,
      1 - this._state.alertness + (Math.random() - 0.5) * 0.1
    ));

    const alertness = this._state.alertness;
    const relaxation = this._state.relaxation;

    for (let i = 0; i < this.windowSize; i++) {
      const t = i / this.sampleRate;

      // 1/f pink noise base (realistic EEG background)
      let sample = this._pinkNoise() * 15;

      // Alpha peak (8-12 Hz) — stronger when relaxed, suppressed when alert
      sample += Math.sin(2 * Math.PI * 10 * t + channelIdx) * relaxation * 12;

      // Beta activity (18-25 Hz) — stronger when focused/alert
      sample += Math.sin(2 * Math.PI * 20 * t + channelIdx * 0.5) * alertness * 6;

      // Theta (6 Hz) — increases with drowsiness
      sample += Math.sin(2 * Math.PI * 6 * t) * (1 - alertness) * 8;

      // Gamma bursts (40 Hz) — brief, during insight moments
      if (Math.random() < 0.01) {
        sample += Math.sin(2 * Math.PI * 40 * t) * 4;
      }

      // Occasional eye-blink artifact (large spike)
      if (Math.random() < 0.002) {
        sample += (Math.random() > 0.5 ? 1 : -1) * 80;
      }

      signal[i] = sample;
    }

    return signal;
  }

  // Simple pink noise approximation (Voss-McCartney algorithm)
  _pinkNoise() {
    if (!this._pinkState) {
      this._pinkState = new Float64Array(16);
      this._pinkKey = 0;
    }
    const key = ++this._pinkKey;
    let sum = 0;
    for (let i = 0; i < 16; i++) {
      if ((key & (1 << i)) !== 0) {
        this._pinkState[i] = (Math.random() - 0.5) * 2;
      }
      sum += this._pinkState[i];
    }
    return sum / 4;
  }
}

// ── BrainFlow Adapter (OpenBCI) ──────────────────────────────────────────────

class BrainFlowAdapter extends NeuroDeviceAdapter {
  constructor(opts = {}) {
    super();
    this.boardId = opts.boardId || 0; // 0 = Cyton, 2 = Ganglion
    this.serialPort = opts.serialPort || '';
    this.sampleRate = 250;
    this.channels = opts.boardId === 2 ? 4 : 8;
    this.connected = false;
    this._board = null;
  }

  async connect() {
    try {
      const brainflow = require('brainflow');
      const params = new brainflow.BrainFlowInputParams();
      if (this.serialPort) params.serial_port = this.serialPort;
      this._board = new brainflow.BoardShim(this.boardId, params);
      this._board.prepare_session();
      this._board.start_stream();
      this.connected = true;
    } catch (e) {
      throw new Error('BrainFlow connect failed: ' + e.message + ' (npm install brainflow)');
    }
  }

  async disconnect() {
    if (this._board) {
      this._board.stop_stream();
      this._board.release_session();
    }
    this.connected = false;
  }

  metadata() {
    return {
      device: 'OpenBCI',
      deviceType: 'brainflow',
      channels: this.channels,
      sampleRate: this.sampleRate,
      connected: this.connected,
      interface: 'serial/bluetooth',
      boardId: this.boardId,
    };
  }

  async *stream() {
    if (!this._board) throw new Error('Not connected');
    const brainflow = require('brainflow');
    const eegChannels = brainflow.BoardShim.get_eeg_channels(this.boardId);

    while (this.connected) {
      await new Promise(r => setTimeout(r, 1000)); // 1s windows
      const data = this._board.get_board_data();
      if (data.length === 0) continue;

      const channels = eegChannels.map(ch => {
        const raw = new Float64Array(data[ch].length);
        for (let i = 0; i < raw.length; i++) raw[i] = data[ch][i];
        return raw;
      });

      yield channels;
    }
  }
}

// ── Muse Adapter ─────────────────────────────────────────────────────────────

class MuseAdapter extends NeuroDeviceAdapter {
  constructor() {
    super();
    this.channels = 4; // TP9, AF7, AF8, TP10
    this.sampleRate = 256;
    this.connected = false;
    this._buffer = [[], [], [], []];
    this._windowSize = 512;
  }

  async connect() {
    // Muse requires Web Bluetooth (browser) or muse-js (Node with noble)
    try {
      const { MuseClient } = require('muse-js');
      this._client = new MuseClient();
      await this._client.connect();
      await this._client.start();
      this._client.eegReadings.subscribe(reading => {
        // reading.electrode: 0-3, reading.samples: Float64Array
        if (reading.electrode < 4) {
          this._buffer[reading.electrode].push(...reading.samples);
        }
      });
      this.connected = true;
    } catch (e) {
      throw new Error('Muse connect failed: ' + e.message + ' (npm install muse-js)');
    }
  }

  async disconnect() {
    if (this._client) await this._client.disconnect();
    this.connected = false;
  }

  metadata() {
    return {
      device: 'Muse',
      deviceType: 'muse',
      channels: this.channels,
      sampleRate: this.sampleRate,
      connected: this.connected,
      interface: 'bluetooth',
      electrodes: ['TP9', 'AF7', 'AF8', 'TP10'],
    };
  }

  async *stream() {
    while (this.connected) {
      await new Promise(r => setTimeout(r, 2000));
      const ready = this._buffer.every(b => b.length >= this._windowSize);
      if (!ready) continue;

      const channels = this._buffer.map(b => {
        const window = new Float64Array(b.splice(0, this._windowSize));
        return window;
      });

      yield channels;
    }
  }
}

// ── Emotiv Adapter ───────────────────────────────────────────────────────────

class EmotivAdapter extends NeuroDeviceAdapter {
  constructor(opts = {}) {
    super();
    this.clientId = opts.clientId || process.env.EMOTIV_CLIENT_ID || '';
    this.clientSecret = opts.clientSecret || process.env.EMOTIV_CLIENT_SECRET || '';
    this.channels = 14; // EPOC X: 14 channels
    this.sampleRate = 128;
    this.connected = false;
  }

  async connect() {
    // Emotiv uses Cortex API via WebSocket
    throw new Error('Emotiv adapter requires Cortex API credentials (EMOTIV_CLIENT_ID, EMOTIV_CLIENT_SECRET). See https://emotiv.gitbook.io/cortex-api/');
  }

  async disconnect() { this.connected = false; }

  metadata() {
    return {
      device: 'Emotiv EPOC X',
      deviceType: 'emotiv',
      channels: this.channels,
      sampleRate: this.sampleRate,
      connected: this.connected,
      interface: 'bluetooth/usb',
      api: 'Cortex WebSocket',
    };
  }

  async *stream() {
    throw new Error('Emotiv streaming not yet implemented');
  }
}

// ── Ambient Adapter (no hardware — behavioral inference) ─────────────────────

class AmbientAdapter extends NeuroDeviceAdapter {
  constructor() {
    super();
    this.channels = 5; // virtual channels: cpu, memory, network, activity, time
    this.sampleRate = 256;
    this.connected = false;
    this._running = false;
    this._inputMetrics = { eventsPerSec: 0, idleMs: 0, errorRate: 0 };
    this._history = [];
  }

  async connect() {
    this.connected = true;
    this._running = true;
  }

  async disconnect() {
    this._running = false;
    this.connected = false;
  }

  metadata() {
    return {
      device: 'Ambient pBCI',
      deviceType: 'ambient',
      channels: this.channels,
      sampleRate: this.sampleRate,
      connected: this.connected,
      interface: 'system-telemetry',
      note: 'Behavioral inference from CPU/memory/network/time — no hardware required',
    };
  }

  async *stream() {
    const os = require('os');

    while (this._running) {
      // Collect ambient signals
      const cpuLoad = os.loadavg()[0] / Math.max(os.cpus().length, 1);
      const memUsed = 1 - (os.freemem() / os.totalmem());
      const uptime = os.uptime();
      const hour = new Date().getHours();

      // Time-of-day fatigue curve (circadian rhythm approximation)
      // Peak alertness: 10am and 3pm. Lowest: 3am and 2pm (post-lunch dip)
      const circadian = 0.5 + 0.4 * Math.sin((hour - 10) * Math.PI / 12)
                       - 0.15 * Math.exp(-Math.pow(hour - 14, 2) / 2); // post-lunch dip

      // Network activity as proxy for cognitive engagement
      let networkActivity = 0;
      try {
        const nets = os.networkInterfaces();
        let totalBytes = 0;
        for (const iface of Object.values(nets)) {
          for (const info of iface) {
            if (!info.internal) totalBytes++;
          }
        }
        networkActivity = Math.min(totalBytes / 10, 1);
      } catch (_) {}

      // Convert to pseudo-EEG channels (scaled to match real EEG amplitudes)
      // Each "channel" encodes a different ambient signal as oscillatory patterns
      const channels = [];
      for (let ch = 0; ch < this.channels; ch++) {
        const signal = new Float64Array(this.sampleRate * 2); // 2-second window
        for (let i = 0; i < signal.length; i++) {
          const t = i / this.sampleRate;

          switch (ch) {
            case 0: // CPU channel → maps to beta/gamma (cognitive load)
              signal[i] = Math.sin(2 * Math.PI * 20 * t) * cpuLoad * 15
                        + Math.sin(2 * Math.PI * 40 * t) * cpuLoad * 5
                        + this._pinkNoise() * 3;
              break;
            case 1: // Memory channel → maps to theta (working memory load)
              signal[i] = Math.sin(2 * Math.PI * 6 * t) * memUsed * 12
                        + Math.sin(2 * Math.PI * 10 * t) * (1 - memUsed) * 8
                        + this._pinkNoise() * 3;
              break;
            case 2: // Network channel → maps to beta (engagement)
              signal[i] = Math.sin(2 * Math.PI * 18 * t) * networkActivity * 10
                        + this._pinkNoise() * 4;
              break;
            case 3: // Circadian channel → maps to alpha (alertness/relaxation)
              signal[i] = Math.sin(2 * Math.PI * 10 * t) * circadian * 14
                        + Math.sin(2 * Math.PI * 4 * t) * (1 - circadian) * 10
                        + this._pinkNoise() * 3;
              break;
            case 4: // Activity channel → composite engagement signal
              const activity = (cpuLoad + memUsed + networkActivity) / 3;
              signal[i] = Math.sin(2 * Math.PI * 15 * t) * activity * 12
                        + Math.sin(2 * Math.PI * 8 * t) * (1 - activity) * 8
                        + this._pinkNoise() * 2;
              break;
          }
        }
        channels.push(signal);
      }

      yield channels;
      await new Promise(r => setTimeout(r, 2000)); // 2-second windows
    }
  }

  _pinkNoise() {
    if (!this._pinkState) { this._pinkState = new Float64Array(8); this._pinkKey = 0; }
    const key = ++this._pinkKey;
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      if ((key & (1 << i)) !== 0) this._pinkState[i] = (Math.random() - 0.5) * 2;
      sum += this._pinkState[i];
    }
    return sum / 4;
  }
}

// ── Adapter Factory ──────────────────────────────────────────────────────────

/**
 * Create the best available adapter.
 * Priority: BrainFlow > Muse > Emotiv > Simulated
 */
function createAdapter(preferredType) {
  // Ambient is the default — no hardware required, uses system telemetry
  if (preferredType === 'ambient' || !preferredType) return new AmbientAdapter();
  if (preferredType === 'simulated') return new SimulatedAdapter();

  // Try real devices in priority order
  if (preferredType === 'brainflow') {
    try { require('brainflow'); return new BrainFlowAdapter(); } catch (_) {}
  }

  if (preferredType === 'muse') {
    try { require('muse-js'); return new MuseAdapter(); } catch (_) {}
  }

  if (preferredType === 'emotiv') {
    if (process.env.EMOTIV_CLIENT_ID) return new EmotivAdapter();
  }

  // Fallback: ambient (always works)
  return new AmbientAdapter();
}

module.exports = {
  NeuroDeviceAdapter,
  SimulatedAdapter,
  AmbientAdapter,
  BrainFlowAdapter,
  MuseAdapter,
  EmotivAdapter,
  createAdapter,
};
