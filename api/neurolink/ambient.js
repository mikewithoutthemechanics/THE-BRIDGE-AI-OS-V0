/**
 * NeuroLink Ambient Adapter
 * Collects system + behavioral signals without hardware
 */

const os = require('os');

class AmbientAdapter {
  constructor() {
    this.lastInputTime = Date.now();
    this.inputCount = 0;
    this.errorCount = 0;
    this.lastTypingSpeed = 0;
    this.windowSwitches = 0;
    this.lastWindowCheck = Date.now();
    this.startTime = Date.now();
  }

  /**
   * Simulates keyboard input tracking
   * Real implementation would hook into OS-level input monitoring
   */
  recordInput(params = {}) {
    this.inputCount++;
    this.lastInputTime = Date.now();
    this.lastTypingSpeed = params.typingSpeed || Math.random() * 10;
    if (params.isError) this.errorCount++;
  }

  recordWindowSwitch() {
    this.windowSwitches++;
  }

  /**
   * Collect system metrics (CPU, memory, thermal)
   */
  getSystemMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptime = os.uptime();

    // Simple CPU usage estimation (simplified for cross-platform)
    const avgLoad = os.loadavg()[0];
    const cpuUsage = normalize(avgLoad / cpus.length);

    return {
      cpu: cpuUsage,
      memory: normalize(1 - freeMem / totalMem),
      thermal: 0.5, // Placeholder; would need system-specific code
      uptime
    };
  }

  /**
   * Estimate input metrics from session
   */
  getInputMetrics() {
    const now = Date.now();
    const idleTime = now - this.lastInputTime;
    const sessionDuration = now - this.startTime;
    const typingSpeed = Math.min(this.lastTypingSpeed, 50) / 50; // Normalize to 0–1
    const errorRate = this.inputCount > 0 ? this.errorCount / this.inputCount : 0;

    return {
      typingSpeed: normalize(typingSpeed),
      pauses: Math.min(idleTime, 30000) / 30000, // Normalize idle time
      errors: normalize(errorRate),
      idleTime: Math.min(idleTime, 60000), // in ms
      inputDensity: normalize(this.inputCount / Math.max(1, sessionDuration / 1000 / 60)) // inputs/min
    };
  }

  /**
   * Simulate network metrics
   */
  getNetworkMetrics() {
    // In production, would measure actual ping/jitter
    return {
      latency: 20 + Math.random() * 60, // ms, 20–80ms range
      jitter: Math.random() * 20 // ms
    };
  }

  /**
   * Simulate WiFi metrics
   */
  getWiFiMetrics() {
    return {
      deviceCount: Math.floor(Math.random() * 10) + 1,
      signalNoise: Math.random() * 0.3 // 0–0.3 normalized
    };
  }

  /**
   * Collect all ambient inputs
   */
  async collect() {
    return {
      system: this.getSystemMetrics(),
      input: this.getInputMetrics(),
      network: this.getNetworkMetrics(),
      wifi: this.getWiFiMetrics(),
      bluetooth: {
        proximity: Math.random() * 0.5, // 0–0.5 normalized
        movement: Math.random() * 0.4
      },
      time: Date.now()
    };
  }

  async health() {
    return {
      ok: true,
      signalQuality: 0.85
    };
  }

  mode() {
    return 'AMBIENT';
  }
}

function normalize(x) {
  return Math.max(0, Math.min(1, x));
}

module.exports = {
  AmbientAdapter
};
