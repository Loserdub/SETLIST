import React from 'react';

export interface LibraryLegendModalProps {
  isLegendOpen: boolean;
  setIsLegendOpen: React.Dispatch<React.SetStateAction<boolean>>;
  legendRef: React.RefObject<HTMLDivElement | null>;
}

export const LibraryLegendModal: React.FC<LibraryLegendModalProps> = ({
  isLegendOpen,
  setIsLegendOpen,
  legendRef,
}) => {
  return (
    <div className="relative flex items-center gap-2">
      <span className="text-xs text-zinc-500 hidden sm:inline font-mono">Guide:</span>
      <button
        type="button"
        onClick={() => setIsLegendOpen((prev) => !prev)}
        className="w-5 h-5 flex items-center justify-center rounded-full border border-border-strong hover:border-zinc-400 bg-surface-raised hover:bg-surface-elevated text-zinc-300 hover:text-white font-mono text-xs font-bold transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
        title="Audio analysis legend (?)"
        aria-label="Metadata Legend"
        aria-expanded={isLegendOpen}
        data-testid="legend-button"
      >
        ?
      </button>
      {isLegendOpen && (
        <div
          ref={legendRef}
          role="tooltip"
          data-testid="legend-popover"
          className="absolute right-0 top-7 z-30 w-80 sm:w-96 p-3 bg-surface-panel border border-border-base shadow-2xl text-xs font-mono space-y-2 select-text"
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-border-base">
            <span className="font-bold text-zinc-100 uppercase tracking-wider text-xs">
              Audio Analysis Legend
            </span>
            <button
              type="button"
              onClick={() => setIsLegendOpen(false)}
              className="text-zinc-400 hover:text-white cursor-pointer px-1 text-xs"
              aria-label="Close legend"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5 text-xs leading-snug">
            <p className="text-zinc-300">
              <strong className="text-white">BPM:</strong> Track tempo in beats per minute, determining playback speed and beatmatching compatibility.
            </p>
            <p className="text-zinc-300">
              <strong className="text-white">Key (Camelot):</strong> Harmonic code (1A-12B) on the Camelot wheel; adjacent numbers or mode switches (A↔B) mix harmoniously.
            </p>
            <p className="text-zinc-300">
              <strong className="text-white">Energy (1 to 10):</strong> Perceived dancefloor energy rating computed from dynamics, spectral density, and loudness.
            </p>
            <p className="text-zinc-300">
              <strong className="text-white">LUFS:</strong> Integrated loudness in LUFS standardizing perceived volume to prevent volume jumps during mixing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
