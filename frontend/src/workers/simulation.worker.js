// simulation-worker.js - Deterministic Simulation Engine
// PURE FUNCTIONAL: All state derived from server time, no mutation
// - neuroState = f(serverTime)   → pure, deterministic
// - economyState = g(serverTime, neuroState) → pure, no accumulation
// - cycle = floor(elapsed / TICK_MS) → derived from time
// - Time-driven: setTimeout sleep loop (not frame-driven)

const TICK_MS = 1000;
const NEURO_TICK_MS = 1500;
const EMIT_THROTTLE_MS = 16;

const CONST = {
  ALPHA: 0.4, BETA: 0.2, GAMMA: 0.25, DELTA: 0.15,
  BASE_TASK: 15000, INIT_TREASURY: 45680, INIT_LEADS: 1247,
  CONV_RATE: 0.3, SUCCESS_RATE: 0.4
};

class DeterministicSimulationWorker {
  constructor() {
    this.serverStartTime = null;
    this.localSyncPoint = null;
    this.isRunning = false;
    this.nextEmitTime = 0;
  }

  sync(serverTimeMs) {
    this.serverStartTime = serverTimeMs;
    this.localSyncPoint = Date.now();
  }

  now() {
    if (!this.serverStartTime || !this.localSyncPoint) return Date.now();
    return this.serverStartTime + (Date.now() - this.localSyncPoint);
  }

  // PURE: neuroState = f(serverTime)
  computeNeuro(serverTimeMs) {
    if (!this.serverStartTime) return this.getDefaultNeuro();

    const elapsed = (serverTimeMs - this.serverStartTime) / 1000;
    const tick = Math.floor(elapsed / (NEURO_TICK_MS / 1000));

    const mix = (s, i) => {
      const x = Math.sin(s + i * 12345) * 123456;
      return x - Math.floor(x);
    };

    const seeds = {
      intel: mix(serverTimeMs, 0),
      lead: mix(serverTimeMs, 1),
      opp: mix(serverTimeMs, 2),
      exec: mix(serverTimeMs, 3),
      market: 1.0 + (mix(serverTimeMs, 4) - 0.5) * 0.2,
      taskVal: 1.0 + (mix(serverTimeMs, 5) - 0.5) * 0.1
    };

    const cognition = Math.min(5, 1 + Math.log10(elapsed + 1) * 0.5);

    const reward = 0.3 + seeds.intel * 0.7;
    const novelty = Math.sin(cognition * 0.1 + elapsed * 0.001) * 0.5 + 0.5;
    const progress = Math.min(1, cognition / 5);
    const D = reward * novelty * progress;

    const stability = 0.7 + Math.sin(elapsed * 0.0003) * 0.2;
    const S = stability * progress * 0.9;

    const network = 0.5 + seeds.lead * 0.4;
    const O = 0.7 * network * (0.6 + seeds.opp * 0.4);

    const E = (1 - seeds.exec * 0.3) * 0.5;

    const C = CONST.ALPHA * D + CONST.BETA * S + CONST.GAMMA * O + CONST.DELTA * E;
    const cognitionFinal = Math.min(5, C);

    const probs = { D: D**2, S: S**2, O: O**2, E: E**2 };
    const total = Object.values(probs).reduce((a, b) => a + b, 0);
    const rand = seeds.intel * total;
    let acc = 0, psi = 'D';
    for (const [k, v] of Object.entries(probs)) {
      acc += v;
      if (rand <= acc) { psi = k; break; }
    }

    const decay = 0.01;
    const pathway = {
      D: 1 + (1 - decay) * 2,
      S: 1 + (1 - decay) * 2,
      O: 1 + (1 - decay) * 2,
      E: 1 + (1 - decay) * 2
    };

    return {
      dopamine: Math.min(1, D),
      serotonin: Math.min(1, S),
      oxytocin: Math.min(1, O),
      endorphins: Math.min(1, E),
      cognition: cognitionFinal,
      psi,
      pathway_strength: pathway
    };
  }

  getDefaultNeuro() {
    return {
      dopamine: 0.5, serotonin: 0.5, oxytocin: 0.5, endorphins: 0.3,
      cognition: 1.0, psi: 'D',
      pathway_strength: { D: 1, S: 1, O: 1, E: 1 }
    };
  }

  // PURE: economyState = g(serverTime, neuroState)
  computeEconomy(serverTimeMs, neuroState) {
    if (!this.serverStartTime) return this.getDefaultEconomy();

    const elapsed = (serverTimeMs - this.serverStartTime) / 1000;

    const mix = (s, i) => {
      const x = Math.sin(s + i * 12345) * 123456;
      return x - Math.floor(x);
    };
    const seeds = {
      intel: mix(serverTimeMs, 0),
      lead: mix(serverTimeMs, 1),
      opp: mix(serverTimeMs, 2),
      exec: mix(serverTimeMs, 3),
      market: 1.0 + (mix(serverTimeMs, 4) - 0.5) * 0.2,
      taskVal: 1.0 + (mix(serverTimeMs, 5) - 0.5) * 0.1
    };

    const leads = CONST.INIT_LEADS + Math.floor(elapsed * 0.1) + Math.floor(neuroState.cognition * 5);

    const convRate = CONST.CONV_RATE + (seeds.lead % 1) * 0.3;
    const opportunities = Math.floor(leads * convRate);

    const success = CONST.SUCCESS_RATE + (seeds.exec % 1) * 0.3;
    const executions = Math.floor(opportunities * success);

    const taskValue = CONST.BASE_TASK * seeds.market * seeds.taskVal;
    const revenue = executions * taskValue * (0.8 + (seeds.exec % 1) * 0.4);
    const treasury = CONST.INIT_TREASURY + Math.floor(revenue);

    const cycle = Math.floor(elapsed / TICK_MS);

    return {
      treasury: Math.max(0, treasury),
      leads: Math.max(0, leads),
      opportunities: Math.max(0, opportunities),
      executions: Math.max(0, executions),
      cycle
    };
  }

  getDefaultEconomy() {
    return {
      treasury: CONST.INIT_TREASURY,
      leads: CONST.INIT_LEADS,
      opportunities: 0,
      executions: 0,
      cycle: 0
    };
  }

  async run() {
    if (!this.serverStartTime) throw new Error('Must sync before starting');
    this.isRunning = true;
    this.nextEmitTime = 0;

    while (this.isRunning) {
      const serverNow = this.now();
      const localNow = Date.now();

      if (localNow >= this.nextEmitTime) {
        const neuroState = this.computeNeuro(serverNow);
        const economyState = this.computeEconomy(serverNow, neuroState);
        const cycle = economyState.cycle;

        self.postMessage({
          type: 'tick',
          neuro: neuroState,
          economy: economyState,
          cycle,
          serverTime: serverNow
        });

        this.nextEmitTime = localNow + EMIT_THROTTLE_MS;
      }

      const sleepMs = Math.max(1, 16 - (Date.now() - localNow));
      await new Promise(resolve => setTimeout(resolve, sleepMs));
    }
  }

  stop() {
    this.isRunning = false;
  }

  getState() {
    const serverNow = this.now();
    const neuro = this.computeNeuro(serverNow);
    const economy = this.computeEconomy(serverNow, neuro);
    return { neuro, economy, cycle: economy.cycle };
  }
}

const worker = new DeterministicSimulationWorker();

self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'sync':
      worker.sync(payload.serverTimeMs);
      if (!worker.isRunning) {
        worker.run().catch(err => {
          console.error('[Worker] Run error:', err);
          self.postMessage({ type: 'error', error: err.message });
        });
      }
      self.postMessage({ type: 'synced' });
      break;

    case 'get-state':
      self.postMessage({
        type: 'state',
        payload: worker.getState()
      });
      break;

    case 'stop':
      worker.stop();
      self.postMessage({ type: 'stopped' });
      break;

    case 'reset':
      const newWorker = new DeterministicSimulationWorker();
      if (payload?.serverTimeMs) newWorker.sync(payload.serverTimeMs);
      self.postMessage({ type: 'reset' });
      break;
  }
});

fetch('/api/system/time')
  .then(r => r.json())
  .then(data => {
    worker.sync(data.serverTimeMs);
    worker.run().catch(err => {
      console.error('[Worker] Run error:', err);
      self.postMessage({ type: 'error', error: err.message });
    });
    self.postMessage({ type: 'ready' });
  })
  .catch(err => {
    self.postMessage({ type: 'error', error: err.message });
  });
