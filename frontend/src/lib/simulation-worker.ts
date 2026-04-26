// Web Worker loader with type safety
export function createWorker(path: string): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Workers are not supported in this environment');
  }
  return new Worker(path);
}

// Message types for simulation worker
export interface SimulationTickMessage {
  type: 'simulation-tick';
  neuro: NeuroState;
  economy: EconomyState;
  cycle: number;
  timestamp: number;
}

export interface NeuroState {
  dopamine: number;
  serotonin: number;
  oxytocin: number;
  endorphins: number;
  cognition: number;
  psi: 'D' | 'S' | 'O' | 'E';
  pathway_strength: Record<string, number>;
}

export interface EconomyState {
  treasury: number;
  leads: number;
  opportunities: number;
  executions: number;
  cycle: number;
}

// Worker manager with reconnection and error handling
export class SimulationWorkerManager {
  private worker: Worker | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private isRunning = false;

  async connect(timeSync: boolean = true): Promise<void> {
    if (this.worker) {
      this.disconnect();
    }

    try {
      // Vite will bundle the JS worker; in dev it serves from memory, in build from dist
      this.worker = new Worker(new URL('../workers/simulation.worker.js', import.meta.url), { type: 'module' });

      this.worker.onmessage = (event) => {
        const { type, ...rest } = event.data;
        this.emit(type, rest);
      };

      this.worker.onerror = (error) => {
        console.error('[SimulationWorker] Error:', error);
        this.emit('error', error);
      };

      this.worker.addEventListener('close', () => {
        if (this.isRunning) {
          this.attemptReconnect();
        }
      });

      this.isRunning = true;

      if (timeSync) {
        const timeResp = await fetch('/api/system/time');
        const timeData = await timeResp.json();
        this.worker.postMessage({
          type: 'sync-time',
          payload: { serverTimeMs: timeData.serverTimeMs }
        });
      }

      this.reconnectAttempts = 0;
      this.emit('connected', {});
    } catch (error) {
      console.error('[SimulationWorker] Connection failed:', error);
      throw error;
    }
  }

  disconnect() {
    this.isRunning = false;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  sendCommand(command: string, payload?: any) {
    if (this.worker) {
      this.worker.postMessage({ type: command, payload });
    }
  }

  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: any) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SimulationWorker] Max reconnection attempts reached');
      this.emit('disconnected', { reason: 'max-reconnect-attempts' });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      console.log(`[SimulationWorker] Reconnecting... attempt ${this.reconnectAttempts}`);
      this.connect(false).catch(console.error);
    }, delay);
  }
}
