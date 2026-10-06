import React from 'react';

export interface SetlistEmptyStateProps {
  onOpenTrackDrawer: () => void;
  onBrowseLibrary: () => void;
  onLoadSampleTracks: () => void;
}

export const SetlistEmptyState: React.FC<SetlistEmptyStateProps> = ({
  onOpenTrackDrawer,
  onBrowseLibrary,
  onLoadSampleTracks,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 border border-border-subtle bg-surface-panel max-w-xl mx-auto my-12">
      <h3 className="text-xs font-mono font-bold tracking-widest text-content-secondary uppercase">
        Your Setlist is Empty
      </h3>
      <p className="text-xs text-content-muted max-w-md mt-2 mb-6 leading-relaxed">
        Add tracks from the catalog to begin building a sequence. Optimize track order, adjust energy progression, and inspect transition advice.
      </p>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenTrackDrawer}
          className="px-3 py-1.5 bg-surface-elevated hover:bg-surface-hover text-accent-blue text-xs font-mono uppercase tracking-wider border border-accent-blue/40 transition-colors cursor-pointer rounded-none font-semibold"
        >
          + Select Tracks
        </button>
        <button
          type="button"
          onClick={onBrowseLibrary}
          className="px-3 py-1.5 bg-surface-elevated hover:bg-surface-hover text-content-primary text-xs font-mono uppercase tracking-wider border border-border-base transition-colors cursor-pointer rounded-none"
        >
          Browse Library
        </button>
        <button
          type="button"
          onClick={onLoadSampleTracks}
          className="px-3 py-1.5 bg-surface-raised hover:bg-surface-elevated text-content-muted hover:text-white text-xs font-mono uppercase tracking-wider border border-border-base transition-colors cursor-pointer rounded-none"
        >
          Load Sample Tracks
        </button>
      </div>
    </div>
  );
};
