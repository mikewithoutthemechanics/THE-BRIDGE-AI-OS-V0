import { useEffect, useRef, useState } from "react";

export interface SimulationState {
  neuro: {
    dopamine: number;
    serotonin: number;
    oxytocin: number;
    endorphins: number;
    cognition: number;
    psi: string;
  };
  economy: {
    treasury: number;
    leads: number;
    opportunities: number;
    executions: number;
    cycle: number;
  };
  cycle: number;
  serverTime?: number;
}

export function useSimulationWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<SimulationState | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  async function syncTime(worker: Worker) {
    const res = await fetch("/api/system/time");
    const data = await res.json();

    worker.postMessage({
      type: "sync",
      payload: { serverTimeMs: data.serverTimeMs || data.serverTime || Date.now() }
    });
  }

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/simulation.worker.js", import.meta.url),
      { type: "module" }
    );

    workerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === "tick") {
        setState({
          neuro: msg.neuro,
          economy: msg.economy,
          cycle: msg.cycle,
          serverTime: msg.serverTime,
        });
        setIsConnected(true);
      } else if (msg.type === "error") {
        setIsConnected(false);
      } else if (msg.type === "ready" || msg.type === "synced") {
        setIsConnected(true);
      }
    };

    syncTime(worker).catch(() => setIsConnected(false));

    const handleVisibility = async () => {
      if (document.visibilityState === "visible") {
        const res = await fetch("/api/system/time");
        const data = await res.json();

        worker.postMessage({
          type: "resync",
          payload: { serverTimeMs: data.serverTimeMs || data.serverTime || Date.now() }
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      worker.terminate();
      setIsConnected(false);
    };
  }, []);

  const sendCommand = (command: string) => {
    const worker = workerRef.current;
    if (!worker) return;
    if (command === "boost") {
      worker.postMessage({ type: "get-state" });
    } else if (command === "evolve" || command === "trigger-intelligence") {
      worker.postMessage({ type: "resync", payload: { serverTimeMs: Date.now() } });
    }
  };

  return { state, isConnected, sendCommand };
}