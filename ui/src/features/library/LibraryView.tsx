import { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  useReactTable,
  getCoreRowModel,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import type { Track } from '../../bindings/Track';
import { getBackend } from '../../api';
import { filterTracks, isTrackNeedsReview } from './filters';
import { subscribeToReviewFilter, consumeInitialNeedsReview } from './navigation';
import { sortTracks } from './sorting';
import { generateMockTracks } from './mock5000';
import { DEFAULT_FILTERS, type LibraryFilters, type SortField } from './types';
import { IngestionInstrumentDisplay } from './IngestionInstrumentDisplay';
import { DropZoneOverlay } from './DropZoneOverlay';
import { ScanReportModal } from './ScanReportModal';
import { TrackInspectionDrawer } from './TrackInspectionDrawer';
import {
  createLibraryColumns,
  LibraryToolbar,
  LibraryFilterBar,
  LibraryLegendModal,
  LibraryTable,
} from './components';

export function LibraryView() {
  const {
    tracks: storeTracks,
    loadTracks,
    scanFolder,
    scanPaths,
    isLoadingTracks,
    hasLoadedTracks,
    tracksError,
    selectTrack,
    setRoute,
    addToSetlist,
    setlist,
    progress,
    setProgress,
    setUseMockBackend,
    trackTitleOverrides,
    trackArtistOverrides,
  } = useAppStore(
    useShallow((s) => ({
      tracks: s.tracks,
      loadTracks: s.loadTracks,
      scanFolder: s.scanFolder,
      scanPaths: s.scanPaths,
      isLoadingTracks: s.isLoadingTracks,
      hasLoadedTracks: s.hasLoadedTracks,
      tracksError: s.tracksError,
      selectTrack: s.selectTrack,
      setRoute: s.setRoute,
      addToSetlist: s.addToSetlist,
      setlist: s.setlist,
      progress: s.progress,
      setProgress: s.setProgress,
      setUseMockBackend: s.setUseMockBackend,
      trackTitleOverrides: s.trackTitleOverrides,
      trackArtistOverrides: s.trackArtistOverrides,
    }))
  );

  // Inspection Drawer & Scan Report State
  const [inspectedTrackId, setInspectedTrackId] = useState<string | null>(null);
  const [isScanReportOpen, setIsScanReportOpen] = useState(false);
  const [skippedDuplicates, setSkippedDuplicates] = useState<Array<{ path: string; reason?: string }>>([]);
  const [failedFiles, setFailedFiles] = useState<Array<{ path: string; error: string }>>([]);

  // Local state for benchmark 5,000 tracks mode
  const [benchmarkTracks, setBenchmarkTracks] = useState<Track[] | null>(null);
  const isBenchmarkMode = benchmarkTracks !== null;

  // Active dataset
  const activeDataset = useMemo(() => {
    return isBenchmarkMode ? benchmarkTracks : storeTracks;
  }, [isBenchmarkMode, benchmarkTracks, storeTracks]);

  // Ingestion summary computed for diagnostics review
  const scanSummary = useMemo(() => {
    return {
      analyzed: activeDataset.length,
      skipped: skippedDuplicates.length,
      failed: failedFiles.length,
      totalFound: activeDataset.length + skippedDuplicates.length + failedFiles.length,
      failedFiles: failedFiles.map((f) => ({
        path: f.path,
        fileName: f.path.split(/[/\\]/).pop() ?? f.path,
        reason: f.error,
        rawError: f.error,
      })),
      completedAt: new Date().toLocaleTimeString(),
    };
  }, [activeDataset.length, skippedDuplicates.length, failedFiles]);

  // Filters state
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [folderPathInput, setFolderPathInput] = useState('');
  const [isAddingBatch, setIsAddingBatch] = useState(false);

  // Legend Popover state
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);

  // Sorting state (single column sort for high-performance virtualizer)
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  // Audio Playback Auditioning State from Global Store
  const auditionTrackId = useAppStore((s) => s.auditionTrackId);
  const auditionState = useAppStore((s) => s.auditionState);
  const toggleAudition = useAppStore((s) => s.toggleAudition);

  const handleToggleAudition = async (trackId: string) => {
    await toggleAudition(trackId);
  };

  // Row click handler to open Track route
  const handleRowClick = (trackId: string) => {
    selectTrack(trackId);
    setRoute('track');
  };

  // Inspected Track lookup with on-demand detail loading
  const baseInspectedTrack = useMemo(() => {
    if (!inspectedTrackId) return null;
    return activeDataset.find((t) => t.id === inspectedTrackId) ?? null;
  }, [activeDataset, inspectedTrackId]);

  const [inspectedTrackDetail, setInspectedTrackDetail] = useState<Track | null>(null);

  useEffect(() => {
    if (!baseInspectedTrack) {
      setInspectedTrackDetail(null);
      return;
    }
    setInspectedTrackDetail(baseInspectedTrack);
    if (
      !baseInspectedTrack.analysis?.waveform ||
      baseInspectedTrack.analysis.waveform.low.peak.length === 0
    ) {
      const backend = getBackend(useAppStore.getState().useMockBackend);
      void backend
        .getTrack(baseInspectedTrack.id)
        .then((fullTrack) => {
          if (fullTrack && fullTrack.id === baseInspectedTrack.id) {
            setInspectedTrackDetail(fullTrack);
          }
        })
        .catch(() => {});
    }
  }, [baseInspectedTrack]);

  const inspectedTrack = inspectedTrackDetail ?? baseInspectedTrack;

  // Native folder picker
  const handleChooseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Choose Music Folder',
      });
      if (selected && typeof selected === 'string') {
        setFolderPathInput(selected);
        setSkippedDuplicates([]);
        setFailedFiles([]);
        void scanFolder(selected);
      }
    } catch (err) {
      console.warn('Native folder picker not available:', err);
    }
  };

  // Native audio file picker for multi-file ingestion
  const handleChooseFiles = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: true,
        title: 'Select Audio Files to Ingest',
        filters: [
          {
            name: 'Audio Files',
            extensions: ['mp3', 'wav', 'flac', 'aif', 'aiff', 'm4a', 'ogg'],
          },
        ],
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        if (paths.length > 0) {
          setSkippedDuplicates([]);
          setFailedFiles([]);
          if (paths.length === 1) {
            void scanFolder(paths[0]);
          } else {
            void scanPaths(paths);
          }
        }
      }
    } catch (err) {
      console.warn('Native file picker not available:', err);
    }
  };

  // Universal ingest handler for dropped paths
  const handleIngestPaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    setSkippedDuplicates([]);
    setFailedFiles([]);
    if (paths.length === 1) {
      setFolderPathInput(paths[0]);
      await scanFolder(paths[0]);
    } else {
      await scanPaths(paths);
    }
  };

  // Monitor progress for skipped duplicates and failed files telemetry
  useEffect(() => {
    if (!progress) return;
    if (progress.message?.includes('Skipped')) {
      const filePath =
        progress.file_name ??
        progress.message.replace(/^Skipped \(already analyzed\)\s*/i, '');
      setSkippedDuplicates((prev) => {
        if (prev.some((p) => p.path === filePath)) return prev;
        return [
          ...prev,
          {
            path: filePath,
            reason: 'Identical BLAKE3 hash already cataloged. Zero redundant DSP compute.',
          },
        ];
      });
    } else if (progress.message?.includes('Failed')) {
      const match = progress.message.match(/Failed (.*?):\s*(.*)/);
      const filePath = match ? match[1] : (progress.file_name ?? 'Audio file');
      const error = match ? match[2] : progress.message;
      setFailedFiles((prev) => {
        if (prev.some((p) => p.path === filePath)) return prev;
        return [...prev, { path: filePath, error }];
      });
    }
  }, [progress]);

  // Close legend popover on outside click or Escape key
  useEffect(() => {
    if (!isLegendOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLegendOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) {
        setIsLegendOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLegendOpen]);

  // Handle external review filter triggers (e.g. from Start screen)
  useEffect(() => {
    if (consumeInitialNeedsReview()) {
      setFilters((prev) => ({ ...prev, needsReviewOnly: true }));
    }
    const unsubscribe = subscribeToReviewFilter((active) => {
      setFilters((prev) => ({ ...prev, needsReviewOnly: active }));
    });
    return unsubscribe;
  }, []);

  // Tracks needing review count
  const needsReviewCount = useMemo(() => {
    return activeDataset.filter(isTrackNeedsReview).length;
  }, [activeDataset]);

  // Auto-load store tracks once on mount if not yet attempted
  useEffect(() => {
    if (!isBenchmarkMode && !hasLoadedTracks && !isLoadingTracks && !tracksError) {
      void loadTracks();
    }
  }, [isBenchmarkMode, hasLoadedTracks, isLoadingTracks, tracksError, loadTracks]);

  // 1. Filter tracks with pure filterTracks function
  const deferredSearchQuery = useDeferredValue(filters.searchQuery);
  const effectiveFilters = useMemo(() => {
    return { ...filters, searchQuery: deferredSearchQuery };
  }, [filters, deferredSearchQuery]);

  const filteredData = useMemo(() => {
    return filterTracks(activeDataset, effectiveFilters);
  }, [activeDataset, effectiveFilters]);

  // 2. Sort tracks with pure sortTracks function
  const sortedData = useMemo(() => {
    if (sorting.length === 0) return filteredData;
    const { id, desc } = sorting[0];
    return sortTracks(filteredData, id as SortField, desc ? 'desc' : 'asc');
  }, [filteredData, sorting]);

  // Setlist track IDs set for instant lookup
  const setlistTrackIds = useMemo(
    () => new Set(setlist.map((e) => e.track_id)),
    [setlist]
  );

  // TanStack Table Column Definitions
  const columns = useMemo(
    () =>
      createLibraryColumns({
        setlistTrackIds,
        addToSetlist,
        auditionTrackId,
        auditionState,
        handleToggleAudition,
        trackTitleOverrides,
        trackArtistOverrides,
        inspectedTrackId,
        setInspectedTrackId,
        handleRowClick,
      }),
    [
      setlistTrackIds,
      addToSetlist,
      auditionTrackId,
      auditionState,
      trackTitleOverrides,
      trackArtistOverrides,
      inspectedTrackId,
    ]
  );

  // TanStack Table Instance
  const table = useReactTable<Track>({
    data: sortedData,
    columns,
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
  });

  const { rows } = table.getRowModel();

  // Scroll Container ref for Virtualizer
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Virtualizer instance
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end || 0)
      : 0;

  // In headless testing or unmeasured containers, fallback to top slice
  const itemsToRender = useMemo(() => {
    if (virtualRows.length > 0) {
      return virtualRows.map((vr) => ({ row: rows[vr.index], index: vr.index }));
    }
    return rows.slice(0, 40).map((row, idx) => ({ row, index: idx }));
  }, [virtualRows, rows]);

  // Selected tracks count for batch operations
  const selectedTrackIds = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((idx) => rowSelection[idx])
      .map((idx) => rows[parseInt(idx, 10)]?.original.id)
      .filter(Boolean);
  }, [rowSelection, rows]);

  // Batch add selected tracks
  const handleAddSelectedToSetlist = async () => {
    if (selectedTrackIds.length === 0 || isAddingBatch) return;
    setIsAddingBatch(true);
    for (const trackId of selectedTrackIds) {
      if (!setlistTrackIds.has(trackId)) {
        await addToSetlist(trackId);
      }
    }
    setRowSelection({});
    setIsAddingBatch(false);
  };

  // Toggle 5,000 mock tracks benchmark
  const toggleBenchmarkMode = () => {
    if (isBenchmarkMode) {
      setBenchmarkTracks(null);
    } else {
      const fiveThousand = generateMockTracks(5000);
      setBenchmarkTracks(fiveThousand);
    }
    setRowSelection({});
  };

  // Reset filters
  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // Keyboard navigation handler for rapid DJ curation
  const handleTableKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rows.length === 0) return;
      const nextIndex =
        focusedRowIndex === null ? 0 : Math.min(rows.length - 1, focusedRowIndex + 1);
      setFocusedRowIndex(nextIndex);
      rowVirtualizer.scrollToIndex(nextIndex, { align: 'auto' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length === 0) return;
      const prevIndex =
        focusedRowIndex === null ? 0 : Math.max(0, focusedRowIndex - 1);
      setFocusedRowIndex(prevIndex);
      rowVirtualizer.scrollToIndex(prevIndex, { align: 'auto' });
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (focusedRowIndex !== null && rows[focusedRowIndex]) {
        void handleToggleAudition(rows[focusedRowIndex].original.id);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedRowIndex !== null && rows[focusedRowIndex]) {
        const trackId = rows[focusedRowIndex].original.id;
        if (!setlistTrackIds.has(trackId)) {
          void addToSetlist(trackId);
        }
      }
    } else if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      if (focusedRowIndex !== null && rows[focusedRowIndex]) {
        const id = rows[focusedRowIndex].original.id;
        setInspectedTrackId((prev) => (prev === id ? null : id));
      }
    } else if (e.key === 'Escape') {
      if (inspectedTrackId !== null) {
        e.preventDefault();
        setInspectedTrackId(null);
      }
    }
  };

  return (
    <DropZoneOverlay onDropPaths={handleIngestPaths}>
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-deep text-content-primary">
        {/* ── Top Header & Studio Console ── */}
        <header className="px-5 py-3 border-b border-border-base bg-surface-panel flex flex-col gap-3">
          <LibraryToolbar
            rowCount={rows.length}
            totalTrackCount={activeDataset.length}
            isBenchmarkMode={isBenchmarkMode}
            toggleBenchmarkMode={toggleBenchmarkMode}
            handleChooseFolder={() => void handleChooseFolder()}
            handleChooseFiles={() => void handleChooseFiles()}
            failedFilesCount={failedFiles.length}
            skippedDuplicatesCount={skippedDuplicates.length}
            onOpenReport={() => setIsScanReportOpen(true)}
            folderPathInput={folderPathInput}
            setFolderPathInput={setFolderPathInput}
            onScanFolder={(path) => void scanFolder(path)}
            isLoadingTracks={isLoadingTracks}
          />

          {/* Live Ingestion Instrument Display */}
          {progress && (
            <div className="mt-1">
              <IngestionInstrumentDisplay
                progress={progress}
                onCancel={() => setProgress(null)}
                onOpenReport={() => setIsScanReportOpen(true)}
                skippedCount={skippedDuplicates.length}
                failedCount={failedFiles.length}
              />
            </div>
          )}

          {/* ── Multi-Criteria Filter Bar ── */}
          <LibraryFilterBar
            filters={filters}
            setFilters={setFilters}
            needsReviewCount={needsReviewCount}
            resetFilters={resetFilters}
            selectedTrackIds={selectedTrackIds}
            isAddingBatch={isAddingBatch}
            handleAddSelectedToSetlist={() => void handleAddSelectedToSetlist()}
          />
        </header>

        {/* ── Count Line, Hardware Keycap Guide & Legend Bar ── */}
        <div className="px-5 py-2 border-b border-border-base bg-surface-panel flex items-center justify-between text-xs font-mono">
          <div data-testid="library-count-line" className="text-xs font-mono text-zinc-400">
            <span>{rows.length} {rows.length === 1 ? 'track' : 'tracks'}, {setlist.length} in your set</span>
          </div>

          {/* Hardware Keyboard Keycap Guide Ribbon */}
          <div className="hidden md:flex items-center gap-2.5 text-xs font-mono text-zinc-400 select-none">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 border border-border-strong bg-surface-elevated text-zinc-200 font-mono text-[11px] uppercase tracking-wider rounded-[2px] shadow-[0_1px_0_1px_rgba(0,0,0,0.5)] font-bold">SPACE</kbd>
              <span className="text-zinc-400">AUDITION</span>
            </span>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 border border-border-strong bg-surface-elevated text-zinc-200 font-mono text-[11px] uppercase tracking-wider rounded-[2px] shadow-[0_1px_0_1px_rgba(0,0,0,0.5)] font-bold">ENTER</kbd>
              <span className="text-zinc-400">+ SET</span>
            </span>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 border border-border-strong bg-surface-elevated text-zinc-200 font-mono text-[11px] uppercase tracking-wider rounded-[2px] shadow-[0_1px_0_1px_rgba(0,0,0,0.5)] font-bold">I</kbd>
              <span className="text-zinc-400">INSPECT</span>
            </span>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 border border-border-strong bg-surface-elevated text-zinc-200 font-mono text-[11px] uppercase tracking-wider rounded-[2px] shadow-[0_1px_0_1px_rgba(0,0,0,0.5)] font-bold">↑/↓</kbd>
              <span className="text-zinc-400">NAVIGATE</span>
            </span>
          </div>

          <LibraryLegendModal
            isLegendOpen={isLegendOpen}
            setIsLegendOpen={setIsLegendOpen}
            legendRef={legendRef}
          />
        </div>

        {/* ── Center Content: Virtualized Table & Slide-Out Inspection Drawer ── */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          <LibraryTable
            tableContainerRef={tableContainerRef}
            handleTableKeyDown={handleTableKeyDown}
            isLoadingTracks={isLoadingTracks}
            activeDatasetLength={activeDataset.length}
            progress={progress}
            handleChooseFolder={() => void handleChooseFolder()}
            scanFolder={(path) => void scanFolder(path)}
            setUseMockBackend={setUseMockBackend}
            loadTracks={() => void loadTracks()}
            toggleBenchmarkMode={toggleBenchmarkMode}
            rowsLength={rows.length}
            resetFilters={resetFilters}
            table={table}
            columnsLength={columns.length}
            paddingTop={paddingTop}
            paddingBottom={paddingBottom}
            itemsToRender={itemsToRender}
            focusedRowIndex={focusedRowIndex}
            setFocusedRowIndex={setFocusedRowIndex}
            handleRowClick={handleRowClick}
          />

          {/* Slide-out Track Inspection Drawer */}
          {inspectedTrack && (
            <TrackInspectionDrawer
              track={inspectedTrack}
              isOpen={Boolean(inspectedTrack)}
              onClose={() => setInspectedTrackId(null)}
              onOpenFullDetail={(trackId) => handleRowClick(trackId)}
            />
          )}
        </div>

        {/* Footer Status Bar */}
        <footer className="px-5 py-2 border-t border-border-base bg-surface-panel flex items-center justify-between text-xs text-zinc-400 font-mono">
          <div>
            TRACKS: {rows.length.toLocaleString()} | WINDOW: {virtualRows.length} RENDERED
          </div>
          <div className="flex items-center gap-3">
            <span>CLICK ROW TO INSPECT (OR PRESS I)</span>
            <span>•</span>
            <span>CHECKBOXES TO BATCH QUEUE</span>
          </div>
        </footer>

        {/* Scan & Ingestion Diagnostics Report Modal */}
        <ScanReportModal
          isOpen={isScanReportOpen}
          onClose={() => setIsScanReportOpen(false)}
          summary={scanSummary}
          onClearErrors={() => setFailedFiles([])}
        />
      </div>
    </DropZoneOverlay>
  );
}

export default LibraryView;
