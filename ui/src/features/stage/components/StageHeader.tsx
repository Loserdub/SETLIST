import React from 'react';
import { formatDuration, formatDurationCompact } from '../usePerformanceClock';

export interface StageHeaderProps {
  setlistName: string;
  stageCurrentIndex: number;
  totalTracks: number;
  clock: { elapsedMs: number; remainingMs: number | null };
  totalDurationMs: number | null;
  wakeLockActive: boolean;
  wakeLockSupported: boolean;
  masterVolume: number;
  setMasterVolume: (v: number) => Promise<void>;
  isFullscreen: boolean;
  handleToggleFullscreen: () => Promise<void>;
}

export const StageHeader: React.FC<StageHeaderProps> = ({
  setlistName,
  stageCurrentIndex,
  totalTracks,
  clock,
  totalDurationMs,
  wakeLockActive,
  wakeLockSupported,
  masterVolume,
  setMasterVolume,
  isFullscreen,
  handleToggleFullscreen,
}) => {
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-surface-deep border-b border-border-subtle shrink-0 font-mono">
      <div className="flex items-center gap-3">
        <span className="text-sm font-black uppercase tracking-wider text-white">
          {setlistName}
        </span>
        <span className="text-xs text-white bg-surface-raised border border-border-base px-2.5 py-1 font-bold">
          {stageCurrentIndex + 1} / {totalTracks}
        </span>
      </div>

      <div className="flex items-center gap-6 text-xs text-content-muted">
        {/* Elapsed Set Time */}
        <div className="flex items-center gap-2">
          <span className="text-content-muted uppercase tracking-wider font-semibold">ELAPSED:</span>
          <span
            className="text-base font-bold text-white tabular-nums tracking-tight"
            data-testid="stage-elapsed"
          >
            {formatDuration(clock.elapsedMs)}
          </span>
        </div>

        {/* Remaining Set Time */}
        {clock.remainingMs !== null && (
          <div className="flex items-center gap-2">
            <span className="text-content-muted uppercase tracking-wider font-semibold">REMAINING:</span>
            <span
              className="text-base font-bold text-amber-400 tabular-nums tracking-tight"
              data-testid="stage-remaining"
            >
              −{formatDurationCompact(clock.remainingMs)}
            </span>
          </div>
        )}

        {/* Total Duration */}
        {totalDurationMs !== null && (
          <span className="text-content-muted font-bold text-xs" data-testid="stage-total">
            [{formatDurationCompact(totalDurationMs)} TOTAL]
          </span>
        )}

        {/* Wake Lock Active Indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              wakeLockActive
                ? 'bg-emerald-400 ring-2 ring-emerald-500/30'
                : wakeLockSupported
                ? 'bg-amber-400'
                : 'bg-surface-hover'
            }`}
            title={
              wakeLockActive
                ? 'Screen wake lock active'
                : wakeLockSupported
                ? 'Screen wake lock released'
                : 'Screen wake lock not supported'
            }
          />
          <span className="text-xs uppercase tracking-wider text-content-muted">
            {wakeLockActive ? 'WAKE LOCK' : 'NO LOCK'}
          </span>
        </div>

        {/* Master Volume Controller */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-surface-raised border border-border-base text-xs">
          <button
            type="button"
            onClick={() => void setMasterVolume(masterVolume > 0 ? 0 : 1.0)}
            className="hover:text-white cursor-pointer text-content-muted"
            title={masterVolume === 0 ? 'Unmute' : 'Mute'}
            data-testid="stage-mute-btn"
          >
            {masterVolume === 0 ? '🔇' : masterVolume < 0.5 ? '🔉' : '🔊'}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={masterVolume}
            onChange={(e) => void setMasterVolume(parseFloat(e.target.value))}
            className="w-16 h-1 bg-surface-hover accent-emerald-400 cursor-pointer"
            title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
            data-testid="stage-volume-slider"
          />
          <span className="tabular-nums text-white w-7 text-right">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>

        {/* Fullscreen Toggle Button */}
        <button
          type="button"
          onClick={() => void handleToggleFullscreen()}
          className={`hw-btn flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer border rounded-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none ${
            isFullscreen
              ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-bold'
              : 'border-border-base bg-surface-raised hover:bg-surface-hover text-content-primary'
          }`}
          title="Toggle fullscreen window [F11]"
          data-testid="stage-fullscreen-btn"
        >
          <span>{isFullscreen ? '⤢ EXIT FULL' : '⤢ FULLSCREEN'}</span>
        </button>
      </div>
    </header>
  );
};
