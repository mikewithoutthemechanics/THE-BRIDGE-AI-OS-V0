import { useEffect, useRef, useState } from "react";

export function useSimulationWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<any>(null);

  async function syncTime(worker: Worker) {
    const res = await fetch("/api/system/time");
    const data = await res.json();

    worker.postMessage({
      type: "sync",
      payload: { serverTime: data.time }
    });
  }

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/simulation.worker.js", import.meta.url),
      { type: "module" }
    );

    workerRef.current = worker;

    worker.onmessage = (e) => {
      setState(e.data);
    };

    syncTime(worker);

    const handleVisibility = async () => {
      if (document.visibilityState === "visible") {
        const res = await fetch("/api/system/time");
        const data = await res.json();

        worker.postMessage({
          type: "resync",
          payload: { serverTime: data.time }
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      worker.terminate();
    };
  }, []);

  return state;
}