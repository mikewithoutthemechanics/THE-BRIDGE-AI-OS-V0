import React, { useEffect, useState } from 'react';
import { useSimulationWorker } from '../hooks/useSimulationWorker';

export default function AIEngine() {
  const { state, isConnected, sendCommand } = useSimulationWorker();
  const [agentStatus, setAgentStatus] = useState({
    quoting: 'idle',
    finance: 'idle',
    growth: 'idle',
    closer: 'idle'
  });

  const handleRunAgents = async () => {
    try {
      await fetch('/api/ehsa/agents/run', { method: 'POST' });
      setAgentStatus({
        quoting: 'running',
        finance: 'running',
        growth: 'running',
        closer: 'running'
      });
      sendCommand('trigger-intelligence');
      
      // Simulate completion after 3s
      setTimeout(() => {
        setAgentStatus({
          quoting: 'completed',
          finance: 'completed',
          growth: 'completed',
          closer: 'completed'
        });
      }, 3000);
    } catch (err) {
      console.error('Failed to run agents:', err);
    }
  };

  const renderAgentCard = (name: string, status: string, description: string) => {
    const statusColors = {
      idle: 'bg-surface-container',
      running: 'bg-primary/20 border-primary',
      completed: 'bg-tertiary/20 border-tertiary'
    };
    const statusIndicator = status === 'running' ? 'animate-pulse' : '';

    return (
      <div className={`p-6 rounded-xl border ${statusColors[status as keyof typeof statusColors]} transition-all`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-on-surface">{name}</h3>
          <span className={`w-2 h-2 rounded-full ${status === 'running' ? 'bg-primary' : status === 'completed' ? 'bg-tertiary' : 'bg-outline-variant'} ${statusIndicator}`}></span>
        </div>
        <p className="text-outline-variant text-sm mb-4">{description}</p>
        <div className="text-xs text-on-surface/60 capitalize">{status}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-primary">AI Engine</h1>
          <div className={`flex items-center space-x-2 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            <span className="w-2 h-2 rounded-full bg-current"></span>
            <span className="text-sm">{isConnected ? 'Deterministic Worker Active' : 'Worker Disconnected'}</span>
          </div>
        </div>

        {/* Current Cycle Display */}
        {state && (
          <div className="mb-8 p-6 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl border border-primary/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-outline-variant text-sm mb-1">Current Cycle</div>
                <div className="text-5xl font-bold text-primary">{state.cycle}</div>
              </div>
              <div className="text-right">
                <div className="text-outline-variant text-sm mb-1">Cognition Level</div>
                <div className="text-3xl font-bold text-secondary">
                  {state.neuro.cognition.toFixed(4)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Agent Orchestration */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-on-surface mb-4">Agent Orchestration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderAgentCard('Quoting Agent', agentStatus.quoting, 'Generates and sends quotes to leads')}
            {renderAgentCard('Finance Agent', agentStatus.finance, 'Processes payments and invoices')}
            {renderAgentCard('Growth Intelligence', agentStatus.growth, 'Analyzes market data for opportunities')}
            {renderAgentCard('Closer Campaign', agentStatus.closer, 'Autonomous deal closure')}
          </div>
        </div>

        {/* Simulation Controls */}
        <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/30">
          <h2 className="text-xl font-semibold text-on-surface mb-4">Simulation Controls</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => sendCommand('boost')}
              className="px-5 py-2.5 bg-primary text-on-primary rounded-lg font-medium hover:opacity-90 transition-all"
            >
              Boost Cognition
            </button>
            <button
              onClick={() => sendCommand('evolve')}
              className="px-5 py-2.5 bg-secondary text-on-secondary rounded-lg font-medium hover:opacity-90 transition-all"
            >
              Evolve System
            </button>
            <button
              onClick={handleRunAgents}
              disabled={agentStatus.quoting === 'running'}
              className="px-5 py-2.5 bg-tertiary text-on-tertiary rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Run All Agents
            </button>
          </div>
        </div>

        {/* State Monitor */}
        {state && (
          <div className="mt-8 bg-surface-container rounded-xl p-6 border border-outline-variant/30">
            <h2 className="text-xl font-semibold text-on-surface mb-4">Live State</h2>
            <pre className="text-xs font-mono text-on-surface/80 overflow-x-auto">
              {JSON.stringify(state, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
