import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

interface PreFlightViewProps {
  onBack: () => void;
}

export function PreFlightView({ onBack }: PreFlightViewProps) {
  const { setlist, enterStageMode, setRoute } = useAppStore(
    useShallow((s) => ({
      setlist: s.setlist,
      enterStageMode: s.enterStageMode,
      setRoute: s.setRoute,
    }))
  );

  const totalSetDurationMs = setlist.reduce((acc, e) => acc + (e.track?.duration_ms ?? 0), 0);
  const totalMinutes = Math.round(totalSetDurationMs / 60000);

  // Check for tracks missing cues or analysis (simplified)
  const missingAnalysisCount = setlist.filter((e) => e.track && (!e.track.analysis?.rhythm?.grid?.bpm || !e.track.analysis?.key?.camelot)).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-deep">
      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
        
        <div className="w-full max-w-2xl space-y-8 mt-12">
          
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-mono font-extrabold tracking-widest text-white uppercase">Pre-Flight Check</h2>
            <p className="text-content-muted font-mono text-sm">Review your active setlist before entering Stage Mode.</p>
          </div>

          {/* Metrics Dashboard */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-panel p-6 border border-border-subtle flex flex-col items-center justify-center space-y-2">
              <span className="text-content-muted text-xs font-mono tracking-widest uppercase">Total Tracks</span>
              <span className="text-4xl text-white font-mono font-bold">{setlist.length}</span>
            </div>
            
            <div className="bg-surface-panel p-6 border border-border-subtle flex flex-col items-center justify-center space-y-2">
              <span className="text-content-muted text-xs font-mono tracking-widest uppercase">Est. Duration</span>
              <span className="text-4xl text-amber-500 font-mono font-bold">{totalMinutes} <span className="text-xl">min</span></span>
            </div>
          </div>

          {/* Warnings */}
          {missingAnalysisCount > 0 && (
            <div className="p-4 bg-status-danger-dim border border-status-danger text-status-danger font-mono text-sm flex items-center justify-between">
              <span>Warning: {missingAnalysisCount} track(s) missing BPM/Key analysis.</span>
            </div>
          )}
          {setlist.length === 0 && (
            <div className="p-4 bg-surface-raised border border-border-base text-content-muted font-mono text-sm flex items-center justify-between">
              <span>Your setlist is empty. Go back and build your set first.</span>
            </div>
          )}

          {/* Stage Mode Button */}
          <div className="pt-8">
            <button
              disabled={setlist.length === 0}
              onClick={enterStageMode}
              className={`w-full py-6 text-2xl font-mono font-black tracking-widest uppercase transition-colors shadow-lg ${
                setlist.length === 0 
                  ? 'bg-surface-raised text-content-dim cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20 active:translate-y-1 cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/50'
              }`}
            >
              [ Enter Stage Mode ]
            </button>
          </div>
          
          <div className="text-center pt-4">
             <button
              onClick={() => setRoute('setlist')}
              className="text-content-muted hover:text-white font-mono text-xs uppercase tracking-wider underline decoration-border-subtle hover:decoration-white transition-colors cursor-pointer"
            >
              Export Options Available in "My Set" Tab
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 bg-surface-panel border-t border-border-subtle flex justify-start shrink-0">
        <button
          className="px-4 py-2 bg-surface-raised text-white border border-border-base font-mono tracking-wider uppercase text-sm hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-zinc-400 cursor-pointer"
          onClick={onBack}
        >
          &larr; Back to Build Set
        </button>
      </div>
    </div>
  );
}
