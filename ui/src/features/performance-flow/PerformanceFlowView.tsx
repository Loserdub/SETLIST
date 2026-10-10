import { useAppStore } from '../../store/useAppStore';
import { CatalogExplorerView as DiscoveryView } from '../discovery';
import { SetlistView } from '../setlist/SetlistView';
import { PreFlightView } from './PreFlightView';

export function PerformanceFlowView() {
  const phase = useAppStore((s) => s.performancePhase);
  const setPhase = useAppStore((s) => s.setPerformancePhase);

  const steps = [
    { label: '1. Discover', phase: 0 },
    { label: '2. Build Set', phase: 1 },
    { label: '3. Pre-Flight', phase: 2 },
  ];

  return (
    <div className="flex flex-col h-full bg-surface-deep text-content-primary">
      {/* Stepper Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-surface-panel shrink-0">
        <h2 className="text-sm font-mono font-bold tracking-widest uppercase text-white">
          Performance Flow
        </h2>
        <div className="flex space-x-2">
          {steps.map((step) => (
            <button
              key={step.phase}
              onClick={() => setPhase(step.phase)}
              className={`px-3 py-1 text-xs font-mono border ${
                phase === step.phase
                  ? 'bg-surface-elevated text-white border-amber-500/40'
                  : 'bg-surface-raised text-content-muted border-border-base hover:text-white'
              }`}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative">
        {phase === 0 && (
          <div className="absolute inset-0 flex flex-col">
            <DiscoveryView />
            <div className="p-4 bg-surface-panel border-t border-border-subtle flex justify-end">
              <button
                className="px-4 py-2 bg-amber-500 text-black font-mono font-bold tracking-wider uppercase text-sm hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                onClick={() => setPhase(1)}
              >
                Next: Build Set &rarr;
              </button>
            </div>
          </div>
        )}
        {phase === 1 && (
          <div className="absolute inset-0 flex flex-col">
            <SetlistView />
            <div className="p-4 bg-surface-panel border-t border-border-subtle flex justify-between">
              <button
                className="px-4 py-2 bg-surface-raised text-white border border-border-base font-mono tracking-wider uppercase text-sm hover:bg-surface-elevated"
                onClick={() => setPhase(0)}
              >
                &larr; Back to Discover
              </button>
              <button
                className="px-4 py-2 bg-amber-500 text-black font-mono font-bold tracking-wider uppercase text-sm hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                onClick={() => setPhase(2)}
              >
                Lock Set & Continue &rarr;
              </button>
            </div>
          </div>
        )}
        {phase === 2 && (
          <div className="absolute inset-0 flex flex-col">
            <PreFlightView onBack={() => setPhase(1)} />
          </div>
        )}
      </div>
    </div>
  );
}
