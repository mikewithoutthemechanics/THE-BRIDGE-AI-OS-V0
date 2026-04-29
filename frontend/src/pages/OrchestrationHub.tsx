import React, { useEffect, useState } from 'react';
import { useSimulationWorker } from '../hooks/useSimulationWorker';

export default function OrchestrationHub() {
  const { state, isConnected, sendCommand } = useSimulationWorker();
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // Generate event log from simulation cycles
  useEffect(() => {
    if (state) {
      const newEvent = {
        cycle: state.cycle,
        timestamp: Date.now(),
        type: 'intelligence_cycle_complete',
        intelligence_score: state.neuro.cognition,
        leads_generated: Math.floor(state.neuro.cognition * 10),
        revenue: state.economy.treasury
      };
      
      setEvents(prev => [newEvent, ...prev.slice(0, 49)]); // Keep last 50 events
    }
  }, [state?.cycle]);

  const eventTypes = {
    'intelligence_cycle_complete': { color: 'bg-primary/20 text-primary', icon: '🧠' },
    'leads_generated': { color: 'bg-secondary/20 text-secondary', icon: '👥' },
    'opportunities_created': { color: 'bg-tertiary/20 text-tertiary', icon: '💼' },
    'executions_completed': { color: 'bg-success/20 text-success', icon: '⚡' },
    'revenue_realized': { color: 'bg-warning/20 text-warning', icon: '💰' }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-primary">Orchestration Hub</h1>
          <div className={`flex items-center space-x-2 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            <span className="w-2 h-2 rounded-full bg-current"></span>
            <span className="text-sm">{isConnected ? 'Event Bus Active' : 'Disconnected'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Event Stream */}
          <div className="lg:col-span-2 bg-surface-container rounded-xl p-6 border border-outline-variant/30">
            <h2 className="text-xl font-semibold text-on-surface mb-4">Event Bus Stream</h2>
            
            {events.length === 0 ? (
              <div className="text-center py-8 text-outline-variant">
                Waiting for events...
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {events.map((event, idx) => {
                  const style = eventTypes[event.type as keyof typeof eventTypes] || { color: 'bg-surface-container-high', icon: '•' };
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedEvent(event)}
                      className={`p-3 rounded-lg cursor-pointer transition-all ${selectedEvent === event ? 'ring-2 ring-primary' : ''} hover:bg-surface-container-high`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-lg">{style.icon}</span>
                          <div>
                            <div className="font-medium text-on-surface">{event.type}</div>
                            <div className="text-xs text-outline-variant">
                              Cycle {event.cycle} • {new Date(event.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm font-mono text-on-surface/60">
                          {typeof event.revenue === 'number' && `$${(event.revenue/1000).toFixed(1)}k`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Event Details */}
          <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/30">
            <h2 className="text-xl font-semibold text-on-surface mb-4">Event Details</h2>
            
            {selectedEvent ? (
              <div className="space-y-4">
                <div>
                  <div className="text-outline-variant text-sm mb-1">Type</div>
                  <div className="font-mono text-on-surface">{selectedEvent.type}</div>
                </div>
                <div>
                  <div className="text-outline-variant text-sm mb-1">Cycle</div>
                  <div className="text-2xl font-bold text-primary">{selectedEvent.cycle}</div>
                </div>
                <div>
                  <div className="text-outline-variant text-sm mb-1">Timestamp</div>
                  <div className="text-sm text-on-surface font-mono">
                    {new Date(selectedEvent.timestamp).toISOString()}
                  </div>
                </div>
                <div className="border-t border-outline-variant/20 pt-4">
                  <div className="text-outline-variant text-sm mb-2">Payload</div>
                  <pre className="text-xs font-mono bg-surface-container-high p-3 rounded overflow-x-auto text-on-surface/80">
                    {JSON.stringify(selectedEvent, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-outline-variant">
                Select an event to view details
              </div>
            )}
          </div>
        </div>

        {/* Causal Chain Visualization */}
        <div className="mt-6 bg-surface-container rounded-xl p-6 border border-outline-variant/30">
          <h2 className="text-xl font-semibold text-on-surface mb-4">Causal Event Chain</h2>
          
          <div className="flex items-center justify-between overflow-x-auto pb-4">
            {['Intelligence', 'Leads', 'Opportunities', 'Executions', 'Treasury'].map((stage, idx) => {
              const isActive = state?.economy.cycle > idx;
              return (
                <React.Fragment key={stage}>
                  <div className={`flex-shrink-0 flex items-center justify-center w-16 h-16 rounded-full ${isActive ? 'bg-primary/20 border-2 border-primary' : 'bg-surface-container-high border border-outline-variant/30'}`}>
                    <span className="text-2xl">
                      {idx === 0 ? '🧠' : idx === 1 ? '👥' : idx === 2 ? '💼' : idx === 3 ? '⚡' : '💰'}
                    </span>
                  </div>
                  <div className="mx-4 min-w-[80px]">
                    <div className="text-center font-medium text-on-surface mb-1">{stage}</div>
                    {isActive && (
                      <div className="text-xs text-center text-outline-variant">
                        {idx === 0 && state?.neuro.cognition.toFixed(3)}
                        {idx === 1 && state?.economy.leads}
                        {idx === 2 && state?.economy.opportunities}
                        {idx === 3 && state?.economy.executions}
                        {idx === 4 && `$${(state?.economy.treasury/1000).toFixed(1)}k`}
                      </div>
                    )}
                  </div>
                  {idx < 4 && (
                    <div className={`flex-1 h-1 mx-2 rounded ${isActive ? 'bg-primary' : 'bg-surface-container-high'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Control Actions */}
        <div className="mt-6 p-6 bg-surface-container rounded-xl border border-outline-variant/30">
          <h2 className="text-xl font-semibold text-on-surface mb-4">Event Bus Controls</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => sendCommand('trigger-intelligence')}
              className="px-5 py-2.5 bg-primary text-on-primary rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Emit Intelligence Cycle
            </button>
            <button
              onClick={() => sendCommand('boost')}
              className="px-5 py-2.5 bg-secondary text-on-secondary rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Boost Cognition
            </button>
            <button
              onClick={() => {
                setEvents([]);
                if (state?.economy) {
                  state.economy.leads = 0;
                  state.economy.opportunities = 0;
                  state.economy.executions = 0;
                }
              }}
              className="px-5 py-2.5 bg-surface-container-high text-outline-variant border border-outline-variant/30 rounded-lg font-medium hover:bg-surface-container-low transition-colors"
            >
              Reset Simulation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
