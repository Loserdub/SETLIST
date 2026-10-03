import { useState, useMemo, useRef, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type RowSelectionState,
  type HeaderGroup,
  type Header,
  type Cell,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../../store/useAppStore';
import { camelotColor, camelotTextColor, ALL_CAMELOT_KEYS } from '../../utils/camelotColor';
import type { Track } from '../../bindings/Track';
import { filterTracks, getTrackCamelotKey } from './filters';
import { sortTracks } from './sorting';
import { generateMockTracks } from './mock5000';
import { DEFAULT_FILTERS, type LibraryFilters, type SortField } from './types';
import { EditedBadge, isFieldOverridden } from '../track/overrides';

const columnHelper = createColumnHelper<Track>();

export function LibraryView() {
  const {
    tracks: storeTracks,
    loadTracks,
    scanFolder,
    isLoadingTracks,
    hasLoadedTracks,
    tracksError,
    selectTrack,
    setRoute,
    addToSetlist,
    setlist,
    progress,
    setUseMockBackend,
  } = useAppStore();

  // Local state for benchmark 5,000 tracks mode
  const [benchmarkTracks, setBenchmarkTracks] = useState<Track[] | null>(null);
  const isBenchmarkMode = benchmarkTracks !== null;

  // Active dataset
  const activeDataset = useMemo(() => {
    return isBenchmarkMode ? benchmarkTracks : storeTracks;
  }, [isBenchmarkMode, benchmarkTracks, storeTracks]);

  // Filters state
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [folderPathInput, setFolderPathInput] = useState('');
  const [isAddingBatch, setIsAddingBatch] = useState(false);

  // Sorting state (single column sort for high-performance virtualizer)
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Auto-load store tracks once on mount if not yet attempted
  useEffect(() => {
    if (!isBenchmarkMode && !hasLoadedTracks && !isLoadingTracks && !tracksError) {
      void loadTracks();
    }
  }, [isBenchmarkMode, hasLoadedTracks, isLoadingTracks, tracksError, loadTracks]);

  // 1. Filter tracks with pure filterTracks function
  const filteredData = useMemo(() => {
    return filterTracks(activeDataset, filters);
  }, [activeDataset, filters]);

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

  // Time formatting helper
  const formatDuration = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // TanStack Table Column Definitions
  const columns = useMemo(
    () => [
      // Multi-select Checkbox
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <div className="flex items-center justify-center px-1">
            <input
              type="checkbox"
              aria-label="Select all tracks"
              checked={table.getIsAllRowsSelected()}
              ref={(input) => {
                if (input) {
                  input.indeterminate = table.getIsSomeRowsSelected();
                }
              }}
              onChange={table.getToggleAllRowsSelectedHandler()}
              className="w-3.5 h-3.5 rounded-none border-[#333333] bg-[#111111] accent-[#888888] cursor-pointer"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div
            className="flex items-center justify-center px-1"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              aria-label={`Select track ${row.original.tags.title ?? 'untitled'}`}
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onChange={row.getToggleSelectedHandler()}
              className="w-3.5 h-3.5 rounded-none border-[#333333] bg-[#111111] accent-[#888888] cursor-pointer"
            />
          </div>
        ),
        size: 36,
      }),

      // Title & Path
      columnHelper.accessor((row: Track) => row.tags.title ?? 'Untitled', {
        id: 'title',
        header: 'Title',
        cell: (info) => {
          const track = info.row.original;
          return (
            <div className="flex flex-col min-w-0 pr-2">
              <span className="font-medium text-[#ececec] truncate text-xs leading-tight">
                {track.tags.title ?? 'Untitled'}
              </span>
              <span className="text-[10px] text-[#666666] truncate font-mono">
                {track.tags.album ?? track.path.split(/[/\\]/).pop()}
              </span>
            </div>
          );
        },
        size: 260,
      }),

      // Artist
      columnHelper.accessor((row: Track) => row.tags.artist ?? 'Unknown Artist', {
        id: 'artist',
        header: 'Artist',
        cell: (info) => (
          <span className="text-[#a0a0a0] truncate text-xs font-normal pr-2">
            {info.getValue()}
          </span>
        ),
        size: 180,
      }),

      // BPM
      columnHelper.accessor((row: Track) => row.analysis?.rhythm.grid.bpm ?? 0, {
        id: 'bpm',
        header: 'BPM',
        cell: (info) => {
          const bpm = info.getValue();
          const isOverridden = isFieldOverridden(info.row.original, 'bpm');
          return (
            <span className="font-mono text-xs tabular-nums text-[#d0d0d0] inline-flex items-center gap-1">
              <span>{bpm > 0 ? bpm.toFixed(1) : '—'}</span>
              {isOverridden && <EditedBadge field="bpm" title="BPM analysis overridden" />}
            </span>
          );
        },
        size: 90,
      }),

      // Camelot Key
      columnHelper.accessor((row: Track) => getTrackCamelotKey(row) ?? '', {
        id: 'key',
        header: 'Key',
        cell: (info) => {
          const keyStr = info.getValue();
          if (!keyStr) {
            return <span className="text-[#555555] font-mono text-[11px]">—</span>;
          }
          const isOverridden = isFieldOverridden(info.row.original, 'key_camelot');
          const bg = camelotColor(keyStr);
          const fg = camelotTextColor(keyStr);
          return (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-flex items-center justify-center font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-[2px] tracking-tight"
                style={{ backgroundColor: bg, color: fg }}
              >
                {keyStr}
              </span>
              {isOverridden && <EditedBadge field="key_camelot" title="Key analysis overridden" />}
            </span>
          );
        },
        size: 85,
      }),

      // Energy
      columnHelper.accessor((row: Track) => row.analysis?.energy_score ?? 0, {
        id: 'energy',
        header: 'Energy',
        cell: (info) => {
          const energy = info.getValue();
          return (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-[#888888] w-3 tabular-nums">
                {energy > 0 ? energy : '—'}
              </span>
              <div className="w-10 bg-[#1c1c1c] h-1 overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${energy * 10}%`,
                    backgroundColor:
                      energy >= 8 ? '#e11d48' : energy >= 5 ? '#d97706' : '#059669',
                  }}
                />
              </div>
            </div>
          );
        },
        size: 80,
      }),

      // LUFS
      columnHelper.accessor((row: Track) => row.analysis?.loudness.integrated_lufs ?? -99, {
        id: 'lufs',
        header: 'LUFS',
        cell: (info) => {
          const val = info.getValue();
          return (
            <span className="font-mono text-[11px] text-[#777777] tabular-nums">
              {val > -90 ? `${val.toFixed(1)} dB` : '—'}
            </span>
          );
        },
        size: 85,
      }),

      // Duration
      columnHelper.accessor((row: Track) => row.duration_ms, {
        id: 'duration',
        header: 'Duration',
        cell: (info) => (
          <span className="font-mono text-[11px] text-[#777777] tabular-nums">
            {formatDuration(info.getValue())}
          </span>
        ),
        size: 75,
      }),

      // Actions
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const track = row.original;
          const isInSetlist = setlistTrackIds.has(track.id);

          return (
            <div
              className="flex items-center justify-end gap-1.5 pr-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => void addToSetlist(track.id)}
                disabled={isInSetlist}
                className={`px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase border transition-colors cursor-pointer rounded-none ${
                  isInSetlist
                    ? 'border-[#222222] bg-[#111111] text-[#555555] cursor-default'
                    : 'border-[#333333] bg-[#161616] hover:bg-[#222222] text-[#d4d4d4]'
                }`}
                title={isInSetlist ? 'Already in active setlist' : 'Add track to setlist'}
              >
                {isInSetlist ? 'Queued' : '+ Setlist'}
              </button>
            </div>
          );
        },
        size: 85,
      }),
    ],
    [setlistTrackIds, addToSetlist]
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
    initialRect: { width: 1000, height: 800 },
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
      }
    } catch (err) {
      console.warn('Native folder picker not available:', err);
    }
  };

  // Row click handler to open Track route
  const handleRowClick = (trackId: string) => {
    selectTrack(trackId);
    setRoute('track');
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#080808] text-[#e2e2e2]">
      {/* ── Top Header & Folder Scanner ── */}
      <header className="px-5 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a] flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#f0f0f0]">
                Music Library
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 border border-[#222222] bg-[#111111] text-[#777777]">
                {rows.length.toLocaleString()} {rows.length === 1 ? 'track' : 'tracks'}
                {rows.length !== activeDataset.length && (
                  <span className="text-[#555555] ml-1">
                    (of {activeDataset.length.toLocaleString()})
                  </span>
                )}
              </span>
              {isBenchmarkMode && (
                <span className="text-[10px] font-mono px-2 py-0.5 border border-[#404040] bg-[#181818] text-[#cccccc] uppercase tracking-wide">
                  5,000 Tracks Benchmark
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#666666] font-mono mt-0.5">
              Deterministic DSP audio analysis repository • 24-key harmonic Camelot indexing
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Benchmark Toggle Button */}
            <button
              type="button"
              onClick={toggleBenchmarkMode}
              className="px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-[#2b2b2b] bg-[#121212] hover:bg-[#1a1a1a] text-[#b8b8b8] transition-colors cursor-pointer rounded-none"
            >
              {isBenchmarkMode ? 'Exit 5K Benchmark' : 'Load 5K Mock Tracks'}
            </button>

            {/* Choose Folder Button */}
            <button
              type="button"
              onClick={() => void handleChooseFolder()}
              className="px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-[#2b2b2b] bg-[#121212] hover:bg-[#1a1a1a] text-[#b8b8b8] transition-colors cursor-pointer rounded-none"
            >
              Choose Folder
            </button>

            {/* Scan Folder Input & Button */}
            <div className="flex items-center border border-[#262626] bg-[#0e0e0e]">
              <input
                type="text"
                value={folderPathInput}
                onChange={(e) => setFolderPathInput(e.target.value)}
                placeholder="Choose folder or paste path..."
                className="bg-transparent px-2.5 py-1 text-xs font-mono text-[#d0d0d0] focus:outline-none w-52 placeholder-[#555555]"
              />
              <button
                type="button"
                onClick={() => void scanFolder(folderPathInput)}
                disabled={isLoadingTracks || !folderPathInput.trim()}
                className="px-3 py-1 bg-[#181818] hover:bg-[#222222] disabled:opacity-40 border-l border-[#262626] text-[#e0e0e0] text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer shrink-0"
              >
                {isLoadingTracks ? 'Scanning...' : 'Scan'}
              </button>
            </div>
          </div>
        </div>

        {/* Live Progress Bar */}
        {progress && (
          <div className="p-2 bg-[#0e0e0e] border border-[#242424] space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#cccccc] uppercase tracking-wide">
                {progress.stage}...
              </span>
              <span className="text-[#666666]">
                {progress.current} / {progress.total} (
                {Math.round((progress.current / (progress.total || 1)) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-[#181818] h-1 overflow-hidden">
              <div
                className="bg-[#d0d0d0] h-1 transition-all duration-200"
                style={{
                  width: `${Math.round((progress.current / (progress.total || 1)) * 100)}%`,
                }}
              />
            </div>
            {progress.message && (
              <p className="text-[10px] font-mono text-[#666666] truncate">{progress.message}</p>
            )}
          </div>
        )}

        {/* ── Multi-Criteria Filter Bar ── */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
          {/* Text Search */}
          <div className="min-w-[200px] flex-1 sm:max-w-xs">
            <input
              type="search"
              value={filters.searchQuery}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
              placeholder="Search title, artist, album, key..."
              className="w-full px-2.5 py-1 bg-[#0e0e0e] border border-[#222222] text-[#d0d0d0] placeholder-[#555555] text-xs font-mono focus:outline-none focus:border-[#404040]"
            />
          </div>

          {/* BPM Filter */}
          <div className="flex items-center gap-1 bg-[#0e0e0e] border border-[#222222] px-2 py-1">
            <span className="text-[#666666] uppercase text-[10px]">BPM:</span>
            <input
              type="number"
              placeholder="Min"
              value={filters.minBpm ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  minBpm: e.target.value ? parseFloat(e.target.value) : null,
                }))
              }
              className="w-12 bg-[#090909] border border-[#1a1a1a] text-center font-mono text-xs text-[#d0d0d0] focus:outline-none"
            />
            <span className="text-[#444444]">-</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.maxBpm ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  maxBpm: e.target.value ? parseFloat(e.target.value) : null,
                }))
              }
              className="w-12 bg-[#090909] border border-[#1a1a1a] text-center font-mono text-xs text-[#d0d0d0] focus:outline-none"
            />
          </div>

          {/* Camelot Key Filter */}
          <div className="flex items-center gap-1.5 bg-[#0e0e0e] border border-[#222222] px-2 py-1">
            <span className="text-[#666666] uppercase text-[10px]">Key:</span>
            <select
              value={filters.selectedKey ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  selectedKey: e.target.value || null,
                }))
              }
              aria-label="Filter by Camelot Key"
              className="bg-[#090909] border border-[#1a1a1a] text-xs text-[#d0d0d0] focus:outline-none font-mono cursor-pointer"
            >
              <option value="">All Keys</option>
              {ALL_CAMELOT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            {filters.selectedKey && (
              <label className="flex items-center gap-1 cursor-pointer select-none text-[#888888] ml-1">
                <input
                  type="checkbox"
                  checked={filters.includeCompatibleKeys}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      includeCompatibleKeys: e.target.checked,
                    }))
                  }
                  className="rounded-none border-[#333333] bg-[#111111] accent-[#888888] cursor-pointer w-3 h-3"
                />
                <span className="text-[10px] text-[#666666]">
                  Harmonic (±1)
                </span>
              </label>
            )}
          </div>

          {/* Energy Filter */}
          <div className="flex items-center gap-1 bg-[#0e0e0e] border border-[#222222] px-2 py-1">
            <span className="text-[#666666] uppercase text-[10px]">Energy:</span>
            <input
              type="number"
              min="1"
              max="10"
              placeholder="1"
              value={filters.minEnergy ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  minEnergy: e.target.value ? parseInt(e.target.value, 10) : null,
                }))
              }
              className="w-8 bg-[#090909] border border-[#1a1a1a] text-center font-mono text-xs text-[#d0d0d0] focus:outline-none"
            />
            <span className="text-[#444444]">-</span>
            <input
              type="number"
              min="1"
              max="10"
              placeholder="10"
              value={filters.maxEnergy ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  maxEnergy: e.target.value ? parseInt(e.target.value, 10) : null,
                }))
              }
              className="w-8 bg-[#090909] border border-[#1a1a1a] text-center font-mono text-xs text-[#d0d0d0] focus:outline-none"
            />
          </div>

          {/* Reset Filters Button */}
          {(filters.searchQuery ||
            filters.minBpm !== null ||
            filters.maxBpm !== null ||
            filters.selectedKey !== null ||
            filters.minEnergy !== null ||
            filters.maxEnergy !== null) && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-mono text-[#777777] hover:text-[#cccccc] underline transition-colors cursor-pointer px-1"
            >
              Reset Filters
            </button>
          )}

          {/* Multi-Select Batch Add Action */}
          {selectedTrackIds.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-[#d0d0d0] font-mono">
                {selectedTrackIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => void handleAddSelectedToSetlist()}
                disabled={isAddingBatch}
                className="px-2.5 py-1 bg-[#181818] hover:bg-[#222222] disabled:opacity-50 text-[#f0f0f0] font-mono text-xs uppercase border border-[#333333] transition-colors cursor-pointer"
              >
                Add to Setlist
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Virtualized Table Container ── */}
      <div
        ref={tableContainerRef}
        data-testid="virtual-table-container"
        className="flex-1 overflow-y-auto relative focus:outline-none"
      >
        {isLoadingTracks && activeDataset.length === 0 ? (
          <div
            data-testid="library-loading"
            className="h-96 flex flex-col items-center justify-center text-center p-8 m-6"
          >
            <div className="w-6 h-6 border border-[#555555] border-t-[#ffffff] rounded-none animate-spin mb-4" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#cccccc]">
              {progress
                ? `${progress.stage.toUpperCase()}: ${progress.message ?? 'Analyzing tracks...'}`
                : 'Loading Library...'}
            </h3>
            <p className="text-[11px] font-mono text-[#666666] mt-1 max-w-sm">
              Connecting to local SQLite database and reading audio analysis metadata.
            </p>
          </div>
        ) : activeDataset.length === 0 ? (
          <div className="max-w-xl mx-auto my-12 p-8 border border-[#1e1e1e] bg-[#0a0a0a] text-center flex flex-col items-center">
            <h3 className="text-sm font-mono font-bold tracking-widest text-[#f0f0f0] uppercase">
              Your library is empty
            </h3>
            <p className="text-xs font-mono text-[#777777] max-w-md mt-2 leading-relaxed">
              DJ Set Assistant is a local-first desktop co-pilot. Your audio files are strictly read-only and never modified. Scan a music folder to extract tempo, Camelot keys, energy ratings, and cue points using pure CPU Rust DSP.
            </p>

            {/* Folder Input & Scan Action */}
            <div className="w-full max-w-md mt-6 flex flex-col sm:flex-row items-center gap-1.5">
              <input
                type="text"
                value={folderPathInput}
                onChange={(e) => setFolderPathInput(e.target.value)}
                placeholder="C:/Music or /path/to/tracks"
                aria-label="Music folder path"
                className="flex-1 w-full px-3 py-1.5 bg-[#0e0e0e] border border-[#262626] text-xs font-mono text-[#d0d0d0] focus:outline-none focus:border-[#444444] placeholder-[#555555]"
              />
              <button
                type="button"
                onClick={() => void scanFolder(folderPathInput)}
                disabled={isLoadingTracks}
                aria-label="Scan Folder"
                className="w-full sm:w-auto px-4 py-1.5 bg-[#181818] hover:bg-[#222222] disabled:opacity-40 border border-[#333333] text-[#e0e0e0] text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer shrink-0"
              >
                {isLoadingTracks ? 'Scanning...' : 'Scan Folder'}
              </button>
            </div>

            {/* Quick Demo Mode */}
            <div className="mt-4 flex items-center gap-2 text-xs font-mono text-[#666666]">
              <span>Or explore features immediately:</span>
              <button
                type="button"
                onClick={() => {
                  setUseMockBackend(true);
                  void loadTracks();
                }}
                className="text-[#aaaaaa] hover:text-white underline cursor-pointer"
              >
                Load Demo Library (40 Tracks)
              </button>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full mt-8 text-left border-t border-[#1a1a1a] pt-5 font-mono">
              <div className="p-3 bg-[#0d0d0d] border border-[#1c1c1c]">
                <div className="text-[#d0d0d0] font-semibold text-xs">
                  Local & Read-Only
                </div>
                <p className="text-[10px] text-[#666666] mt-1 leading-snug">
                  Zero cloud telemetry. Audio files are strictly read-only.
                </p>
              </div>

              <div className="p-3 bg-[#0d0d0d] border border-[#1c1c1c]">
                <div className="text-[#d0d0d0] font-semibold text-xs">
                  Pure Rust DSP
                </div>
                <p className="text-[10px] text-[#666666] mt-1 leading-snug">
                  Deterministic analysis: beat tracking, Camelot keys, energy.
                </p>
              </div>

              <div className="p-3 bg-[#0d0d0d] border border-[#1c1c1c]">
                <div className="text-[#d0d0d0] font-semibold text-xs">
                  Hardware Ready
                </div>
                <p className="text-[10px] text-[#666666] mt-1 leading-snug">
                  Exports to Rekordbox XML, M3U8, and markdown/CSV set sheets.
                </p>
              </div>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-8 border border-[#1a1a1a] bg-[#0c0c0c] m-6">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#cccccc]">
              No matching tracks
            </h3>
            <p className="text-[11px] font-mono text-[#666666] max-w-sm mt-1 mb-4">
              Adjust search query, BPM range, or Camelot key filter.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-1 bg-[#161616] hover:bg-[#202020] border border-[#2e2e2e] text-[#cccccc] text-xs font-mono uppercase transition-colors cursor-pointer rounded-none"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <table className="w-full border-collapse text-left select-none text-xs">
            {/* Sticky Table Header */}
            <thead className="sticky top-0 z-10 bg-[#0a0a0a] border-b border-[#202020]">
              {table.getHeaderGroups().map((headerGroup: HeaderGroup<Track>) => (
                <tr key={headerGroup.id} className="h-9">
                  {headerGroup.headers.map((header: Header<Track, unknown>) => {
                    const canSort = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        onClick={header.column.getToggleSortingHandler()}
                        className={`px-3 py-1.5 text-[10px] font-mono font-medium uppercase tracking-wider text-[#666666] ${
                          canSort ? 'cursor-pointer hover:text-[#d0d0d0] select-none' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {canSort && (
                            <span className="text-[9px] text-[#555555] font-mono">
                              {sortDirection === 'asc'
                                ? '▲'
                                : sortDirection === 'desc'
                                ? '▼'
                                : '⇅'}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            {/* Virtualized Body with dynamic padding offsets */}
            <tbody>
              {paddingTop > 0 && (
                <tr>
                  <td style={{ height: `${paddingTop}px` }} colSpan={columns.length} />
                </tr>
              )}

              {itemsToRender.map(({ row, index }) => {
                const isSelected = row.getIsSelected();

                return (
                  <tr
                    key={row.id}
                    data-index={index}
                    onClick={() => handleRowClick(row.original.id)}
                    className={`h-[52px] border-b border-[#141414] transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#161616] border-l-2 border-l-[#d0d0d0]'
                        : 'hover:bg-[#111111]'
                    }`}
                  >
                    {row.getVisibleCells().map((cell: Cell<Track, unknown>) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="px-3 py-1.5 text-xs text-[#b8b8b8] align-middle"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {paddingBottom > 0 && (
                <tr>
                  <td style={{ height: `${paddingBottom}px` }} colSpan={columns.length} />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Status Bar */}
      <footer className="px-5 py-2 border-t border-[#1a1a1a] bg-[#0a0a0a] flex items-center justify-between text-[10px] text-[#555555] font-mono">
        <div>
          TRACKS: {rows.length.toLocaleString()} | WINDOW: {virtualRows.length} RENDERED
        </div>
        <div className="flex items-center gap-3">
          <span>CLICK ROW TO INSPECT</span>
          <span>•</span>
          <span>CHECKBOXES TO BATCH QUEUE</span>
        </div>
      </footer>
    </div>
  );
}

export default LibraryView;
