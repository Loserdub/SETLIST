import { useState, useMemo, useRef, useEffect } from 'react';
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

const columnHelper = createColumnHelper<Track>();

export function LibraryView() {
  const {
    tracks: storeTracks,
    loadTracks,
    scanFolder,
    isLoadingTracks,
    tracksError,
    selectTrack,
    setRoute,
    addToSetlist,
    setlist,
    progress,
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
  const [folderPathInput, setFolderPathInput] = useState('/Music/DJ_Collection');
  const [isAddingBatch, setIsAddingBatch] = useState(false);

  // Sorting state (single column sort for high-performance virtualizer)
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Auto-load store tracks if empty
  useEffect(() => {
    if (!isBenchmarkMode && storeTracks.length === 0 && !isLoadingTracks && !tracksError) {
      void loadTracks();
    }
  }, [isBenchmarkMode, storeTracks.length, isLoadingTracks, tracksError, loadTracks]);

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
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
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
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
            />
          </div>
        ),
        size: 40,
      }),

      // Title & Path
      columnHelper.accessor((row: Track) => row.tags.title ?? 'Untitled', {
        id: 'title',
        header: 'Title',
        cell: (info) => {
          const track = info.row.original;
          return (
            <div className="flex flex-col min-w-0 pr-3">
              <span className="font-semibold text-slate-100 truncate text-sm leading-snug">
                {track.tags.title ?? 'Untitled'}
              </span>
              <span className="text-[11px] text-slate-500 truncate font-mono">
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
          <span className="text-slate-300 truncate text-sm font-medium pr-3">
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
          return (
            <span className="font-mono text-sm font-semibold text-slate-200">
              {bpm > 0 ? bpm.toFixed(1) : '—'}
            </span>
          );
        },
        size: 80,
      }),

      // Camelot Key
      columnHelper.accessor((row: Track) => getTrackCamelotKey(row) ?? '', {
        id: 'key',
        header: 'Key',
        cell: (info) => {
          const keyStr = info.getValue();
          if (!keyStr) {
            return <span className="text-slate-500 text-xs">—</span>;
          }
          const bg = camelotColor(keyStr);
          const fg = camelotTextColor(keyStr);
          return (
            <span
              className="inline-flex items-center justify-center font-mono font-bold text-xs px-2.5 py-0.5 rounded-full shadow-xs tracking-tight"
              style={{ backgroundColor: bg, color: fg }}
            >
              {keyStr}
            </span>
          );
        },
        size: 80,
      }),

      // Energy
      columnHelper.accessor((row: Track) => row.analysis?.energy_score ?? 0, {
        id: 'energy',
        header: 'Energy',
        cell: (info) => {
          const energy = info.getValue();
          return (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-slate-300 w-4">
                {energy > 0 ? energy : '—'}
              </span>
              <div className="w-12 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${energy * 10}%`,
                    backgroundColor:
                      energy >= 8 ? '#f43f5e' : energy >= 5 ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
            </div>
          );
        },
        size: 100,
      }),

      // LUFS
      columnHelper.accessor((row: Track) => row.analysis?.loudness.integrated_lufs ?? -99, {
        id: 'lufs',
        header: 'LUFS',
        cell: (info) => {
          const val = info.getValue();
          return (
            <span className="font-mono text-xs text-slate-400">
              {val > -90 ? `${val.toFixed(1)} dB` : '—'}
            </span>
          );
        },
        size: 90,
      }),

      // Duration
      columnHelper.accessor((row: Track) => row.duration_ms, {
        id: 'duration',
        header: 'Duration',
        cell: (info) => (
          <span className="font-mono text-xs text-slate-400">
            {formatDuration(info.getValue())}
          </span>
        ),
        size: 80,
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
              className="flex items-center justify-end gap-2 pr-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => void addToSetlist(track.id)}
                disabled={isInSetlist}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  isInSetlist
                    ? 'bg-slate-800/80 text-emerald-400 border border-emerald-500/30 cursor-default'
                    : 'bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-xs'
                }`}
                title={isInSetlist ? 'Already in active setlist' : 'Add track to setlist'}
              >
                {isInSetlist ? '✓ Queued' : '+ Setlist'}
              </button>
            </div>
          );
        },
        size: 100,
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

  // Virtualizer instance with initialRect for SSR and headless testing
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 52, // 52px per row
    overscan: 12,
    initialRect: { width: 1000, height: 800 },
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // In headless testing or unmeasured containers, fallback to top slice
  const itemsToRender = useMemo(() => {
    if (virtualRows.length > 0) {
      return virtualRows.map((vr) => ({ row: rows[vr.index], index: vr.index }));
    }
    return rows.slice(0, 40).map((row, idx) => ({ row, index: idx }));
  }, [virtualRows, rows]);

  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end || 0)
      : 0;

  // Selected tracks count
  const selectedTrackIds = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((idx) => rowSelection[idx])
      .map((idx) => rows[parseInt(idx, 10)]?.original.id)
      .filter(Boolean);
  }, [rowSelection, rows]);

  // Batch add selected tracks to setlist
  const handleAddSelectedToSetlist = async () => {
    setIsAddingBatch(true);
    for (const trackId of selectedTrackIds) {
      await addToSetlist(trackId);
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

  // Row click handler to open Track route
  const handleRowClick = (trackId: string) => {
    selectTrack(trackId);
    setRoute('track');
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* ── Top Header & Folder Scanner ── */}
      <header className="p-5 border-b border-slate-800/80 bg-slate-900/60 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-white">Music Library</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {rows.length.toLocaleString()} {rows.length === 1 ? 'track' : 'tracks'}
                {rows.length !== activeDataset.length && (
                  <span className="text-slate-500 ml-1">
                    (of {activeDataset.length.toLocaleString()})
                  </span>
                )}
              </span>
              {isBenchmarkMode && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold animate-pulse">
                  ⚡ 5,000 Tracks Benchmark
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Virtualized high-performance library table with multi-criteria filtering and harmonic Camelot mixing.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Benchmark Toggle Button */}
            <button
              type="button"
              onClick={toggleBenchmarkMode}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                isBenchmarkMode
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {isBenchmarkMode ? 'Exit 5K Benchmark' : 'Load 5K Mock Tracks'}
            </button>

            {/* Scan Folder Input & Button */}
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-700/80 rounded-lg p-1">
              <input
                type="text"
                value={folderPathInput}
                onChange={(e) => setFolderPathInput(e.target.value)}
                placeholder="/path/to/music"
                className="bg-transparent px-2 text-xs font-mono text-slate-200 focus:outline-none w-36 sm:w-44"
              />
              <button
                type="button"
                onClick={() => void scanFolder(folderPathInput)}
                disabled={isLoadingTracks}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>📂</span>
                <span>{isLoadingTracks ? 'Scanning...' : 'Scan'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Progress Bar (During Scanning / Decoding) */}
        {progress && (
          <div className="p-3 bg-slate-900/90 border border-emerald-500/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-400 capitalize">
                {progress.stage}...
              </span>
              <span className="text-slate-400 font-mono">
                {progress.current} / {progress.total} (
                {Math.round((progress.current / (progress.total || 1)) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((progress.current / (progress.total || 1)) * 100)}%`,
                }}
              />
            </div>
            {progress.message && (
              <p className="text-[11px] text-slate-400 truncate">{progress.message}</p>
            )}
          </div>
        )}

        {/* ── Multi-Criteria Filter Bar ── */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          {/* Text Search */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <input
              type="search"
              value={filters.searchQuery}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
              placeholder="Search title, artist, album, key..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
            <span className="absolute left-2.5 top-2 text-slate-500 pointer-events-none">🔍</span>
          </div>

          {/* BPM Filter */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2.5 py-1">
            <span className="text-slate-400 font-medium">BPM:</span>
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
              className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-center font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-slate-600">-</span>
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
              className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-center font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Camelot Key Filter */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2.5 py-1">
            <span className="text-slate-400 font-medium">Key:</span>
            <select
              value={filters.selectedKey ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  selectedKey: e.target.value || null,
                }))
              }
              aria-label="Filter by Camelot Key"
              className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
            >
              <option value="">All Keys</option>
              {ALL_CAMELOT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            {filters.selectedKey && (
              <label className="flex items-center gap-1 cursor-pointer select-none text-slate-300 ml-1">
                <input
                  type="checkbox"
                  checked={filters.includeCompatibleKeys}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      includeCompatibleKeys: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500 w-3.5 h-3.5"
                />
                <span className="text-[11px] text-slate-400 font-medium">
                  Harmonic (+/-1, relative)
                </span>
              </label>
            )}
          </div>

          {/* Energy Filter */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2.5 py-1">
            <span className="text-slate-400 font-medium">Energy:</span>
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
              className="w-10 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-center font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-slate-600">-</span>
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
              className="w-10 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-center font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
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
              className="text-xs text-slate-400 hover:text-slate-200 underline transition-colors cursor-pointer px-1"
            >
              Reset Filters
            </button>
          )}

          {/* Multi-Select Batch Add Action */}
          {selectedTrackIds.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-emerald-400 font-medium font-mono">
                {selectedTrackIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => void handleAddSelectedToSetlist()}
                disabled={isAddingBatch}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>+</span>
                <span>Add to Setlist</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Virtualized Table Container ── */}
      <div
        ref={tableContainerRef}
        data-testid="virtual-table-container"
        className="flex-1 overflow-y-auto relative scroll-smooth focus:outline-none"
      >
        {rows.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800 rounded-xl bg-slate-900/20 m-6">
            <span className="text-4xl mb-3">📂</span>
            <h3 className="text-base font-semibold text-slate-300">
              {activeDataset.length === 0 ? 'Your library is empty' : 'No matching tracks'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
              {activeDataset.length === 0
                ? 'Scan a music folder above to analyze and populate tracks.'
                : 'Try adjusting your search query, BPM range, or Camelot key filter.'}
            </p>
            {activeDataset.length === 0 ? (
              <button
                type="button"
                onClick={() => void scanFolder(folderPathInput)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Scan Folder
              </button>
            ) : (
              <button
                type="button"
                onClick={resetFilters}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse text-left select-none text-xs">
            {/* Sticky Table Header */}
            <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 shadow-md">
              {table.getHeaderGroups().map((headerGroup: HeaderGroup<Track>) => (
                <tr key={headerGroup.id} className="h-10">
                  {headerGroup.headers.map((header: Header<Track, unknown>) => {
                    const canSort = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        onClick={header.column.getToggleSortingHandler()}
                        className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 ${
                          canSort ? 'cursor-pointer hover:text-slate-100 select-none' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {canSort && (
                            <span className="text-[10px] text-slate-500 font-mono">
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
                    className={`h-[52px] border-b border-slate-900/80 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    {row.getVisibleCells().map((cell: Cell<Track, unknown>) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="px-3 py-2 text-xs text-slate-300 align-middle"
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
      <footer className="px-5 py-2.5 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <div>
          Showing {rows.length.toLocaleString()} tracks | Virtualizer window:{' '}
          {virtualRows.length} rendered rows
        </div>
        <div className="flex items-center gap-3">
          <span>Click row to inspect</span>
          <span>•</span>
          <span>Checkboxes to batch queue</span>
        </div>
      </footer>
    </div>
  );
}

export default LibraryView;
