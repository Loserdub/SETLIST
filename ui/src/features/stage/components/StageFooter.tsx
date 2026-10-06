import React from 'react';
import { IconPrev, IconNext, IconPlay, IconPause } from '../../../components/icons';

export interface StageFooterProps {
  stagePrev: () => void;
  stageNext: () => void;
  stageCurrentIndex: number;
  setlistLength: number;
  handleToggleAudition: () => Promise<void>;
  auditionState: string;
  stageRestart: () => void;
  showSetlist: boolean;
  setShowSetlist: (show: boolean) => void;
  handleExitRequest: () => void;
}

export const StageFooter: React.FC<StageFooterProps> = ({
  stagePrev,
  stageNext,
  stageCurrentIndex,
  setlistLength,
  handleToggleAudition,
  auditionState,
  stageRestart,
  showSetlist,
  setShowSetlist,
  handleExitRequest,
}) => {
  return (
    <footer className="flex items-center justify-between px-6 py-3 bg-surface-deep border-t border-border-subtle shrink-0 font-mono gap-4">
      {/* Left: Previous Song Button */}
      <div>
        <button
          type="button"
          onClick={stagePrev}
          disabled={stageCurrentIndex <= 0}
          className="hw-btn min-h-[56px] px-6 py-2 border border-border-base bg-surface-raised text-content-secondary hover:bg-surface-elevated hover:text-white hover:border-border-strong disabled:opacity-20 disabled:cursor-not-allowed transition-all text-xs font-bold uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none active:translate-y-[1px]"
          data-testid="stage-prev-btn"
          title="Jump to previous track [ArrowLeft / PageUp]"
        >
          <IconPrev className="w-4 h-4 shrink-0" />
          <span>[ PREV ]</span>
        </button>
      </div>

      {/* Center: Rehearsal Transport, Keyboard Guide & Stage Utilities */}
      <div className="flex items-center gap-4">
        {/* Rehearse / Audition Play-Pause Button */}
        <button
          type="button"
          onClick={handleToggleAudition}
          className="hw-btn min-h-[56px] px-6 py-2 border border-border-strong bg-surface-raised hover:bg-surface-elevated text-white transition-all text-xs font-bold uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none active:translate-y-[1px]"
          data-testid="stage-audition-btn"
          title="Play or pause audio audition [Space]"
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              auditionState === 'playing'
                ? 'bg-emerald-400 ring-2 ring-emerald-500/40 animate-pulse'
                : 'bg-amber-400/80'
            }`}
          />
          {auditionState === 'playing' ? (
            <IconPause size={14} className="shrink-0 text-white" />
          ) : (
            <IconPlay size={14} className="shrink-0 text-white" />
          )}
          <span>{auditionState === 'playing' ? '[ PAUSE ]' : '[ PLAY ]'}</span>
        </button>

        {/* Restart Setlist Button */}
        <button
          type="button"
          onClick={stageRestart}
          className="hw-btn h-10 px-4 border border-border-base bg-surface-raised text-content-muted hover:text-white hover:bg-surface-elevated transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none active:translate-y-[1px]"
          data-testid="stage-restart-btn"
          title="Restart setlist from beginning [Home]"
        >
          <span>[ RESTART ]</span>
        </button>

        {/* Keyboard Shortcut Ribbon */}
        <div className="hidden 2xl:flex items-center gap-3 text-xs text-content-muted border-l border-r border-border-base px-4 h-10">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 border border-border-base bg-surface-panel text-white font-bold rounded-none">
              SPACE
            </kbd>
            <span>AUDITION</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 border border-border-base bg-surface-panel text-white font-bold rounded-none">
              ENTER
            </kbd>
            <span>NEXT</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 border border-border-base bg-surface-panel text-white font-bold rounded-none">
              1-4
            </kbd>
            <span>CUES A-D</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowSetlist(!showSetlist)}
          className="hw-btn h-10 px-4 border border-border-base bg-surface-raised text-content-secondary hover:text-white hover:bg-surface-elevated transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none active:translate-y-[1px]"
          data-testid="stage-setlist-toggle"
          title="Toggle full setlist overview drawer [S]"
        >
          <span>[ SETLIST ]</span>
        </button>

        <button
          type="button"
          onClick={handleExitRequest}
          className="hw-btn h-10 px-4 border border-border-base bg-surface-raised text-content-muted hover:text-rose-400 hover:border-rose-900/60 transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none active:translate-y-[1px]"
          data-testid="stage-exit-btn"
          title="Exit stage performance mode [Escape]"
        >
          <span>[ EXIT STAGE ]</span>
        </button>
      </div>

      {/* Right: Next Song Button (Prominent Action Target) */}
      <div>
        <button
          type="button"
          onClick={stageNext}
          disabled={stageCurrentIndex >= setlistLength - 1}
          className="hw-btn min-h-[56px] px-8 py-2 border border-border-strong bg-surface-elevated hover:bg-surface-hover text-content-primary hover:text-white border-r-2 border-r-amber-500/80 shadow-[0_0_12px_rgba(0,0,0,0.5)] disabled:opacity-20 disabled:border-border-base disabled:bg-surface-raised disabled:text-content-dim disabled:cursor-not-allowed transition-all text-sm font-black uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-3 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none active:translate-y-[1px]"
          data-testid="stage-next-btn"
          title="Advance to next track [Enter / ArrowRight / PageDown]"
        >
          <span>[ NEXT ]</span>
          <IconNext className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </footer>
  );
};
