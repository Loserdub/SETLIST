import { StageMode } from '../../features/stage';
import { isStageModeEnabled } from '../../config/stageFeatureFlag';
import { useAppStore } from '../../store/useAppStore';

export function StageRoute() {
  const enabled = isStageModeEnabled();

  if (!enabled) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center p-8 bg-[#080808] text-[#ededed] font-mono select-none"
        data-testid="stage-quarantined"
      >
        <div className="max-w-md w-full p-6 bg-[#0e0e0e] border border-[#222222] text-center space-y-4">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#1c1408] border border-[#78350f] text-[#f59e0b] text-lg font-bold">
            ⚡
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Stage Mode Quarantined
            </h2>
            <p className="text-xs text-[#a8a8a8] leading-relaxed">
              The live performance deck engine is quarantined behind developer feature flags to protect static studio sequence integrity.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => useAppStore.getState().exitStageMode()}
              className="px-4 py-1.5 bg-[#181818] hover:bg-[#222222] text-[#cfcfcf] hover:text-white border border-[#333333] text-xs uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
              data-testid="quarantine-exit-btn"
            >
              Return to Studio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <StageMode />;
}

export default StageRoute;

