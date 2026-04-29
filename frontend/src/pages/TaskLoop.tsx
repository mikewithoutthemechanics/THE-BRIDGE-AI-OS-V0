import { useEffect, useState } from 'react';
import { useSimulationWorker } from '../hooks/useSimulationWorker';

export default function TaskLoop() {
  const { state, isConnected, sendCommand } = useSimulationWorker();
  const [metrics, setMetrics] = useState({
    throughput: 0,
    avgLatency: 0,
    successRate: 100,
    cycle: 0
  });

  // Update metrics from simulation state
  useEffect(() => {
    if (state) {
      setMetrics({
        throughput: state.economy.executions,
        avgLatency: 120 + Math.random() * 80, // Simulated latency
        successRate: 85 + Math.random() * 14,
        cycle: state.cycle
      });
    }
  }, [state]);

  // Health status
  const healthColor = isConnected ? 'text-green-400' : 'text-red-400';
  const healthLabel = isConnected ? 'Healthy' : 'Disconnected';

  return (
    <div className="min-h-screen bg-surface text-on-surface p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-primary">Task Loop</h1>
          <div className={`flex items-center space-x-2 ${healthColor}`}>
            <span className="w-3 h-3 rounded-full bg-current animate-pulse"></span>
            <span>{healthLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Cycle Counter */}
          <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30">
            <div className="text-outline-variant text-sm mb-2">Current Cycle</div>
            <div className="text-4xl font-bold text-on-surface">
              {state?.cycle || 0}
            </div>
          </div>

          {/* Throughput */}
          <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30">
            <div className="text-outline-variant text-sm mb-2">Throughput</div>
            <div className="text-4xl font-bold text-primary">
              {metrics.throughput.toLocaleString()}
            </div>
            <div className="text-outline-variant text-xs mt-1">tasks/s</div>
          </div>

          {/* Latency */}
          <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30">
            <div className="text-outline-variant text-sm mb-2">Avg Latency</div>
            <div className="text-4xl font-bold text-secondary">
              {Math.round(metrics.avgLatency)}ms
            </div>
          </div>

          {/* Success Rate */}
          <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30">
            <div className="text-outline-variant text-sm mb-2">Success Rate</div>
            <div className="text-4xl font-bold text-tertiary">
              {metrics.successRate.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Live State Visualization */}
        <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/30 mb-8">
          <h2 className="text-2xl font-semibold text-on-surface mb-4">Live Simulation State</h2>

          {state ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Neuro-Cognitive State */}
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-on-surface">Neuro-Cognitive Engine</h3>
                <div className="space-y-2">
                  <MetricBar label="Dopamine" value={state.neuro.dopamine} color="#00ff9c" />
                  <MetricBar label="Serotonin" value={state.neuro.serotonin} color="#00bfff" />
                  <MetricBar label="Oxytocin" value={state.neuro.oxytocin} color="#ff6688" />
                  <MetricBar label="Endorphins" value={state.neuro.endorphins} color="#ffcc00" />
                </div>
                <div className="mt-4 p-3 bg-surface-container-high rounded-lg">
                  <div className="text-sm text-outline-variant">Cognition C(t)</div>
                  <div className="text-2xl font-bold text-primary">{state.neuro.cognition.toFixed(4)}</div>
                </div>
                <div className="p-3 bg-surface-container-high rounded-lg">
                  <div className="text-sm text-outline-variant">Dominant State |Ψ⟩</div>
                  <div className="text-lg font-semibold text-on-surface">{state.neuro.psi}</div>
                </div>
              </div>

              {/* Economy State */}
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-on-surface">Economy Engine</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-surface-container-high rounded-lg">
                    <div className="text-sm text-outline-variant">Treasury</div>
                    <div className="text-xl font-bold text-tertiary">
                      ${state.economy.treasury.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-surface-container-high rounded-lg">
                    <div className="text-sm text-outline-variant">Leads</div>
                    <div className="text-xl font-bold text-secondary">
                      {state.economy.leads.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-surface-container-high rounded-lg">
                    <div className="text-sm text-outline-variant">Pipeline</div>
                    <div className="text-xl font-bold text-primary">
                      {state.economy.opportunities.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-surface-container-high rounded-lg">
                    <div className="text-sm text-outline-variant">Executions</div>
                    <div className="text-xl font-bold text-on-surface">
                      {state.economy.executions.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-outline-variant">
              Waiting for simulation worker to initialize...
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => sendCommand('boost')}
            className="px-6 py-3 bg-primary text-on-primary rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Boost Cognition
          </button>
          <button
            onClick={() => sendCommand('evolve')}
            className="px-6 py-3 bg-secondary text-on-secondary rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Evolve System
          </button>
          <button
            onClick={() => sendCommand('trigger-intelligence')}
            className="px-6 py-3 bg-tertiary text-on-tertiary rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Run Agents
          </button>
        </div>

        {/* Status Bar */}
        <div className="mt-8 p-4 bg-surface-container-low rounded-lg border border-outline-variant/20">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-6">
              <span className="text-outline-variant">Deterministic Worker</span>
              <span className={healthColor}>{isConnected ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="text-outline-variant">
              Tick: 1.5s neuro | 2s economy
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for metric bars
function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  const percentage = Math.min(value * 100, 100);

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-outline-variant">{label}</span>
        <span className="text-on-surface font-mono">{value.toFixed(3)}</span>
      </div>
      <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
