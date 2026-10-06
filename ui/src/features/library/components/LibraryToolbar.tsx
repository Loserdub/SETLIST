import React from 'react';

export interface LibraryToolbarProps {
  rowCount: number;
  totalTrackCount: number;
  isBenchmarkMode: boolean;
  toggleBenchmarkMode: () => void;
  handleChooseFolder: () => void;
  handleChooseFiles: () => void;
  failedFilesCount: number;
  skippedDuplicatesCount: number;
  onOpenReport: () => void;
  folderPathInput: string;
  setFolderPathInput: (value: string) => void;
  onScanFolder: (path: string) => void;
  isLoadingTracks: boolean;
}

export const LibraryToolbar: React.FC<LibraryToolbarProps> = ({
  rowCount,
  totalTrackCount,
  isBenchmarkMode,
  toggleBenchmarkMode,
  handleChooseFolder,
  handleChooseFiles,
  failedFilesCount,
  skippedDuplicatesCount,
  onOpenReport,
  folderPathInput,
  setFolderPathInput,
  onScanFolder,
  isLoadingTracks,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-100">
            Music Library
          </h2>
          <span className="text-xs font-mono px-2 py-0.5 border border-border-base bg-surface-raised text-zinc-300">
            {rowCount.toLocaleString()} {rowCount === 1 ? 'track' : 'tracks'}
            {rowCount !== totalTrackCount && (
              <span className="text-zinc-500 ml-1">
                (of {totalTrackCount.toLocaleString()})
              </span>
            )}
          </span>
          {isBenchmarkMode && (
            <span className="text-xs font-mono px-2 py-0.5 border border-zinc-600 bg-surface-elevated text-zinc-300 uppercase tracking-wide">
              5,000 Tracks Benchmark
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-400 font-mono mt-0.5">
          Deterministic DSP audio analysis repository • 24-key harmonic Camelot indexing
        </p>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Benchmark Toggle Button */}
        <button
          type="button"
          onClick={toggleBenchmarkMode}
          className="hw-btn px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-border-base bg-surface-raised hover:bg-surface-elevated text-zinc-300 hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
        >
          {isBenchmarkMode ? 'Exit 5K Benchmark' : 'Load 5K Mock Tracks'}
        </button>

        {/* Choose Folder Button */}
        <button
          type="button"
          onClick={handleChooseFolder}
          className="hw-btn px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-border-base bg-surface-raised hover:bg-surface-elevated text-zinc-300 hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
        >
          Choose Folder
        </button>

        {/* Choose Files Button */}
        <button
          type="button"
          onClick={handleChooseFiles}
          className="hw-btn px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-border-base bg-surface-raised hover:bg-surface-elevated text-zinc-300 hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
        >
          Choose Files
        </button>

        {/* Ingestion Report Button if failures or skipped duplicates exist */}
        {(failedFilesCount > 0 || skippedDuplicatesCount > 0) && (
          <button
            type="button"
            onClick={onOpenReport}
            className="hw-btn px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-rose-500/50 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none flex items-center gap-1.5 active:translate-y-[1px]"
            data-testid="ingestion-report-toolbar-btn"
          >
            <span>REPORT</span>
            <span className="px-1 py-0.2 bg-rose-500/20 text-xs font-bold te-num">
              {failedFilesCount > 0 ? `${failedFilesCount} FAILED` : `${skippedDuplicatesCount} SKIPPED`}
            </span>
          </button>
        )}

        {/* Scan Folder Input & Button */}
        <div className="flex items-center border border-border-base bg-surface-deep">
          <input
            type="text"
            value={folderPathInput}
            onChange={(e) => setFolderPathInput(e.target.value)}
            placeholder="Choose folder or paste path..."
            className="bg-transparent px-2.5 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 w-52 placeholder-zinc-600"
          />
          <button
            type="button"
            onClick={() => onScanFolder(folderPathInput)}
            disabled={isLoadingTracks || !folderPathInput.trim()}
            className="hw-btn px-3 py-1 bg-surface-elevated hover:bg-surface-hover disabled:opacity-40 border-l border-border-base text-zinc-200 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 active:translate-y-[1px]"
          >
            {isLoadingTracks ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </div>
    </div>
  );
};
