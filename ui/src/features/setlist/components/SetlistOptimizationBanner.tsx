import React from 'react';

export interface SetlistOptimizationBannerProps {
  onRevert: () => void;
  onDismiss: () => void;
}

export const SetlistOptimizationBanner: React.FC<SetlistOptimizationBannerProps> = ({
  onRevert,
  onDismiss,
}) => {
  return (
    <div
      className="p-3 bg-accent-blue-subtle border border-accent-blue-dim text-white text-xs font-mono flex items-center justify-between gap-3 animate-fade-in"
      data-testid="solver-revert-banner"
    >
      <div className="flex items-center gap-2">
        <span className="text-accent-blue font-bold">✨ SEQUENCE OPTIMIZED</span>
        <span className="text-content-secondary text-xs">
          Arranged by classical DSP solver for optimal harmonic flow and target energy arc.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onRevert}
          className="px-2.5 py-1 bg-surface-elevated hover:bg-surface-hover text-accent-blue border border-accent-blue/60 text-xs uppercase font-mono transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          data-testid="revert-suggested-order-btn"
        >
          ↶ Revert to Previous Order
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-content-muted hover:text-white px-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          title="Dismiss notice"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
