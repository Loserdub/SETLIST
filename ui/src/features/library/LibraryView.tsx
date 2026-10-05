import React, { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
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
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { Track } from '../../bindings/Track';
import { filterTracks, getTrackCamelotKey, isTrackNeedsReview, isTrackEdited } from './filters';
import { subscribeToReviewFilter, consumeInitialNeedsReview } from './navigation';
import { sortTracks } from './sorting';
import { generateMockTracks } from './mock5000';
import { DEFAULT_FILTERS, type LibraryFilters, type SortField } from './types';
import { EditedBadge, isFieldOverridden } from '../track/overrides';
import { getTrackDisplayTitle, getTrackDisplayArtist } from '../../utils/trackDisplay';
import { Button, KeyTile, Meter } from '../../components/ui';

const columnHelper = createColumnHelper<Track>();

const formatDuration = (ms: number): string => {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export function LibraryView() {
  const {
    tracks: storeTracks,
    loadTracks,
    scanFolder,
    isLoadingTracks,
    selectTrack,
    setRoute,
    addToSetlist,
    setlist,
    progress,
    setUseMockBackend,
    trackTitleOverrides,
    trackArtistOverrides,
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
        await scanFolder(selected);
      }
    } catch {
      // Fallback gracefully if dialog is unavailable or cancelled
    }
  };

  // Close legend on Escape or click outside
  useEffect(() => {
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
    if (isLegendOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLegendOpen]);

  // Subscribe to external needs-review filter navigation events
  useEffect(() => {
    if (consumeInitialNeedsReview()) {
      setFilters((prev) => ({ ...prev, needsReviewOnly: true }));
    }
    const unsubscribe = subscribeToReviewFilter(() => {
      setFilters((prev) => ({ ...prev, needsReviewOnly: true }));
    });
    return unsubscribe;
  }, []);

  // Compute needsReview count across active dataset
  const needsReviewCount = useMemo(() => {
    let count = 0;
    for (const t of activeDataset) {
      if (isTrackNeedsReview(t)) count++;
    }
    return count;
  }, [activeDataset]);

  // Deferred filter value to keep UI responsive with large datasets
  const deferredSearch = useDeferredValue(filters.searchQuery);
  const effectiveFilters = useMemo(
    () => ({ ...filters, searchQuery: deferredSearch }),
    [filters, deferredSearch]
  );

  // Setlist track ids lookup
  const setlistTrackIds = useMemo(() => {
    return new Set(setlist.map((e) => e.track_id));
  }, [setlist]);

  // Filter tracks
  const filteredTracks = useMemo(() => {
    return filterTracks(activeDataset, effectiveFilters);
  }, [activeDataset, effectiveFilters]);

  // Sort tracks
  const sortedTracks = useMemo(() => {
    if (sorting.length === 0) return filteredTracks;
    const sort = sorting[0];
    const field = sort.id as SortField;
    const direction = sort.desc ? 'desc' : 'asc';
    return sortTracks(filteredTracks, field, direction);
  }, [filteredTracks, sorting]);

  // Table Columns Definition
  const columns = useMemo(
    () => [
      // Checkbox multi-select
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              aria-label="Select all tracks"
              checked={table.getIsAllPageRowsSelected()}
              ref={(el) => {
                if (el) el.indeterminate = table.getIsSomePageRowsSelected();
              }}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              className="w-3.5 h-3.5 rounded-[1px] border-[var(--surface-strong)] bg-[var(--surface-app)] accent-[var(--accent)] cursor-pointer"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div
            className="flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              aria-label={`Select track ${row.original.tags.title ?? 'untitled'}`}
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onChange={row.getToggleSelectedHandler()}
              className="w-3.5 h-3.5 rounded-[1px] border-[var(--surface-strong)] bg-[var(--surface-app)] accent-[var(--accent)] cursor-pointer"
            />
          </div>
        ),
        size: 34,
      }),

      // Title & Path
      columnHelper.accessor(
        (row: Track) => getTrackDisplayTitle(row, trackTitleOverrides[row.id]),
        {
          id: 'title',
          header: 'Title',
          cell: (info) => {
            const track = info.row.original;
            const displayTitle = getTrackDisplayTitle(track, trackTitleOverrides[track.id]);
            const isCustom = Boolean(trackTitleOverrides[track.id]);
            const isEdited = isTrackEdited(track, trackTitleOverrides, trackArtistOverrides);
            const needsReview = isTrackNeedsReview(track);
            const filename = track.path.split(/[/\\]/).pop();
            const subtext = track.tags.album ?? (track.tags.title ? filename : track.tags.artist ?? filename);

            return (
              <div className="flex flex-col min-w-0 pr-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <span className="font-medium text-[var(--text-primary)] truncate text-xs leading-tight">
                    {displayTitle}
                  </span>
                  {isEdited && (
                    <EditedBadge
                      title="Track metadata or analysis has been edited"
                      className="shrink-0"
                    />
                  )}
                  {needsReview && (
                    <span
                      className="inline-flex items-center px-1.5 py-0.2 text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--status-danger)]/15 text-[var(--status-danger)] border border-[var(--status-danger)]/40 rounded-[2px] select-none shrink-0"
                      title="Needs review: analysis failed or BPM/Key missing"
                      data-testid={`needs-review-badge-${track.id}`}
                    >
                      NEEDS REVIEW
                    </span>
                  )}
                  {isCustom && !isEdited && (
                    <span
                      className="text-[10px] font-mono px-1 py-0.2 bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--surface-hairline)] rounded-[1px] shrink-0"
                      title="Custom in-app title"
                    >
                      Custom
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-[var(--text-muted)] truncate font-mono">
                  {subtext}
                </span>
              </div>
            );
          },
          size: 260,
        }
      ),

      // Artist
      columnHelper.accessor(
        (row: Track) => getTrackDisplayArtist(row, trackArtistOverrides[row.id]),
        {
          id: 'artist',
          header: 'Artist',
          cell: (info) => {
            const track = info.row.original;
            const displayArtist = getTrackDisplayArtist(track, trackArtistOverrides[track.id]);
            const isCustom = Boolean(trackArtistOverrides[track.id]);
            return (
              <div className="flex items-center gap-1.5 min-w-0 pr-2">
                <span className="text-[var(--text-secondary)] truncate text-xs font-normal">
                  {displayArtist}
                </span>
                {isCustom && (
                  <span
                    className="text-[10px] font-mono px-1 py-0.2 bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--surface-hairline)] rounded-[1px] shrink-0"
                    title="Custom in-app artist"
                  >
                    Custom
                  </span>
                )}
              </div>
            );
          },
          size: 180,
        }
      ),

      // BPM (Mono figures)
      columnHelper.accessor((row: Track) => row.analysis?.rhythm.grid.bpm ?? 0, {
        id: 'bpm',
        header: 'BPM',
        cell: (info) => {
          const bpm = info.getValue();
          const isOverridden = isFieldOverridden(info.row.original, 'bpm');
          return (
            <span className="font-mono text-xs tabular-nums text-[var(--text-primary)] inline-flex items-center gap-1">
              <span>{bpm > 0 ? bpm.toFixed(1) : '—'}</span>
              {isOverridden && <EditedBadge field="bpm" title="BPM analysis overridden" />}
            </span>
          );
        },
        size: 90,
      }),

      // Camelot Key (KeyTile primitive)
      columnHelper.accessor((row: Track) => getTrackCamelotKey(row) ?? '', {
        id: 'key',
        header: 'Key',
        cell: (info) => {
          const keyStr = info.getValue();
          if (!keyStr) {
            return <span className="text-[var(--text-muted)] font-mono text-xs">—</span>;
          }
          const isOverridden = isFieldOverridden(info.row.original, 'key_camelot');
          return (
            <span className="inline-flex items-center gap-1">
              <KeyTile camelotKey={keyStr} size="sm" overridden={isOverridden} />
              {isOverridden && <EditedBadge field="key_camelot" title="Key analysis overridden" />}
            </span>
          );
        },
        size: 85,
      }),

      // Energy (10-block Meter primitive)
      columnHelper.accessor((row: Track) => row.analysis?.energy_score ?? 0, {
        id: 'energy',
        header: 'Energy',
        cell: (info) => {
          const energy = info.getValue();
          return (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-[var(--text-muted)] w-3 tabular-nums">
                {energy > 0 ? energy : '—'}
              </span>
              <Meter value={energy} max={10} segments={10} size="sm" ariaLabel={`Energy ${energy} of 10`} />
            </div>
          );
        },
        size: 95,
      }),

      // LUFS
      columnHelper.accessor((row: Track) => row.analysis?.loudness.integrated_lufs ?? -99, {
        id: 'lufs',
        header: 'LUFS',
        cell: (info) => {
          const val = info.getValue();
          return (
            <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
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
          <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
            {formatDuration(info.getValue())}
          </span>
        ),
        size: 75,
      }),

      // Row Actions
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const track = row.original;
          const isInSetlist = setlistTrackIds.has(track.id);
          const isAuditioning = auditionTrackId === track.id && auditionState === 'playing';

          return (
            <div
              className={`flex items-center justify-end gap-1.5 pr-2 transition-opacity duration-100 ${
                isAuditioning
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Play preview */}
              <button
                type="button"
                onClick={() => void handleToggleAudition(track.id)}
                className={`px-2 py-0.5 text-xs font-mono tracking-wider uppercase border transition-colors duration-100 cursor-pointer rounded-[2px] flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                  isAuditioning
                    ? 'border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--accent)] font-bold'
                    : 'border-[var(--surface-hairline)] bg-[var(--surface-panel)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title={isAuditioning ? 'Pause preview' : 'Play preview'}
                aria-label={isAuditioning ? 'Pause preview' : 'Play preview'}
                data-testid={`preview-btn-${track.id}`}
              >
                <span>{isAuditioning ? <Pause size={10} /> : <Play size={10} />}</span>
                <span>{isAuditioning ? 'AUDITIONING' : 'PREVIEW'}</span>
              </button>

              {/* Open detail */}
              <button
                type="button"
                onClick={() => handleRowClick(track.id)}
                className="px-2 py-0.5 text-xs font-mono tracking-wider uppercase border border-[var(--surface-hairline)] bg-[var(--surface-panel)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-100 cursor-pointer rounded-[2px] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                title="Open track detail"
                aria-label="Open track detail"
                data-testid={`detail-btn-${track.id}`}
              >
                DETAIL
              </button>

              {/* Add to set */}
              <button
                type="button"
                onClick={() => void addToSetlist(track.id)}
                disabled={isInSetlist}
                className={`px-2 py-0.5 text-xs font-mono tracking-wider uppercase border transition-colors duration-100 cursor-pointer rounded-[2px] focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                  isInSetlist
                    ? 'border-transparent bg-transparent text-[var(--status-success)] cursor-default'
                    : 'border-[var(--surface-hairline)] bg-[var(--surface-panel)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title={isInSetlist ? 'Already added to setlist' : 'Add to setlist'}
                aria-label={isInSetlist ? 'In Setlist' : 'Add to Setlist'}
                data-testid={`add-to-set-btn-${track.id}`}
              >
                <span>{isInSetlist ? 'QUEUED' : '+ SET'}</span>
              </button>
            </div>
          );
        },
        size: 190,
      }),
    ],
    [
      trackTitleOverrides,
      trackArtistOverrides,
      setlistTrackIds,
      auditionTrackId,
      auditionState,
    ]
  );

  // TanStack Table instance
  const table = useReactTable({
    data: sortedTracks,
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

  // Virtualizer instance with 36px row height
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 16,
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
        const trk = rows[focusedRowIndex].original;
        if (!setlistTrackIds.has(trk.id)) {
          void addToSetlist(trk.id);
        }
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--surface-app)] text-[var(--text-primary)]">
      {/* ── Top Header & Folder Scanner ── */}
      <header className="px-5 py-3 border-b border-[var(--surface-hairline)] bg-[var(--surface-panel)] flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-primary)] silkscreen">
                Music Library
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 border border-[var(--surface-hairline)] bg-[var(--surface-app)] text-[var(--text-secondary)] rounded-[2px]">
                {rows.length.toLocaleString()} {rows.length === 1 ? 'track' : 'tracks'}
                {rows.length !== activeDataset.length && (
                  <span className="text-[var(--text-muted)] ml-1">
                    (of {activeDataset.length.toLocaleString()})
                  </span>
                )}
              </span>
              {isBenchmarkMode && (
                <span className="text-xs font-mono px-2 py-0.5 border border-[var(--surface-hairline)] bg-[var(--surface-raised)] text-[var(--text-primary)] uppercase tracking-wide rounded-[2px]">
                  5,000 Tracks Benchmark
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
              Deterministic DSP audio analysis repository • 24-key harmonic Camelot indexing
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Benchmark Toggle Button */}
            <Button variant="secondary" size="sm" onClick={toggleBenchmarkMode}>
              {isBenchmarkMode ? 'Exit 5K Benchmark' : 'Load 5K Mock Tracks'}
            </Button>

            {/* Choose Folder Button */}
            <Button variant="secondary" size="sm" onClick={() => void handleChooseFolder()}>
              Choose Folder
            </Button>

            {/* Scan Folder Input & Button */}
            <div className="flex items-center border border-[var(--surface-hairline)] bg-[var(--surface-app)] rounded-[2px]">
              <input
                type="text"
                value={folderPathInput}
                onChange={(e) => setFolderPathInput(e.target.value)}
                placeholder="Choose folder or paste path..."
                className="bg-transparent px-2.5 py-1 text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none w-52"
              />
              <button
                type="button"
                onClick={() => void scanFolder(folderPathInput)}
                disabled={isLoadingTracks || !folderPathInput.trim()}
                className="px-3 py-1 bg-[var(--surface-raised)] hover:bg-[var(--surface-strong)] disabled:opacity-40 border-l border-[var(--surface-hairline)] text-[var(--text-primary)] text-xs font-mono uppercase tracking-wider hw-transition cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                {isLoadingTracks ? 'Scanning...' : 'Scan'}
              </button>
            </div>
          </div>
        </div>

        {/* Live Progress Bar (LED state indicator) */}
        {progress && (
          <div className="p-2 bg-[var(--surface-app)] border border-[var(--surface-hairline)] rounded-[2px] space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[var(--text-primary)] uppercase tracking-wide font-semibold">
                <span className="w-1.5 h-1.5 rounded-[1px] bg-[var(--accent)] animate-pulse led-instant" />
                <span>{progress.stage}...</span>
              </span>
              <span className="text-[var(--text-secondary)]">
                {progress.current} / {progress.total} (
                {Math.round((progress.current / (progress.total || 1)) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-[var(--surface-raised)] h-1 overflow-hidden">
              <div
                className="bg-[var(--accent)] h-1 hw-transition"
                style={{
                  width: `${Math.round((progress.current / (progress.total || 1)) * 100)}%`,
                }}
              />
            </div>
            {progress.message && (
              <p className="text-xs font-mono text-[var(--text-muted)] truncate">{progress.message}</p>
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
              className="w-full px-2.5 py-1 bg-[var(--surface-app)] border border-[var(--surface-hairline)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-xs font-mono rounded-[2px] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
          </div>

          {/* BPM Filter */}
          <div className="flex items-center gap-1 bg-[var(--surface-app)] border border-[var(--surface-hairline)] px-2 py-1 rounded-[2px]">
            <span className="text-[var(--text-muted)] uppercase text-xs font-mono font-semibold tracking-[0.08em] silkscreen">BPM:</span>
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
              className="w-12 bg-[var(--surface-panel)] border border-[var(--surface-hairline)] text-center font-mono text-xs text-[var(--text-primary)] rounded-[2px] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
            <span className="text-[var(--text-muted)]">-</span>
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
              className="w-12 bg-[var(--surface-panel)] border border-[var(--surface-hairline)] text-center font-mono text-xs text-[var(--text-primary)] rounded-[2px] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
          </div>

          {/* Camelot Key Filter */}
          <div className="flex items-center gap-1.5 bg-[var(--surface-app)] border border-[var(--surface-hairline)] px-2 py-1 rounded-[2px]">
            <span className="text-[var(--text-muted)] uppercase text-xs font-mono font-semibold tracking-[0.08em] silkscreen">Key:</span>
            <select
              value={filters.selectedKey ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  selectedKey: e.target.value || null,
                }))
              }
              aria-label="Filter by Camelot Key"
              className="bg-[var(--surface-panel)] border border-[var(--surface-hairline)] text-xs text-[var(--text-primary)] rounded-[2px] font-mono cursor-pointer focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              <option value="" className="bg-[var(--surface-panel)] text-[var(--text-primary)]">All Keys</option>
              {['1A','1B','2A','2B','3A','3B','4A','4B','5A','5B','6A','6B','7A','7B','8A','8B','9A','9B','10A','10B','11A','11B','12A','12B'].map((k) => (
                <option key={k} value={k} className="bg-[var(--surface-panel)] text-[var(--text-primary)]">
                  {k}
                </option>
              ))}
            </select>
          </div>

          {/* Energy Filter */}
          <div className="flex items-center gap-1 bg-[var(--surface-app)] border border-[var(--surface-hairline)] px-2 py-1 rounded-[2px]">
            <span className="text-[var(--text-muted)] uppercase text-xs font-mono font-semibold tracking-[0.08em] silkscreen">Energy:</span>
            <input
              type="number"
              min={1}
              max={10}
              placeholder="1"
              value={filters.minEnergy ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  minEnergy: e.target.value ? parseInt(e.target.value, 10) : null,
                }))
              }
              className="w-8 bg-[var(--surface-panel)] border border-[var(--surface-hairline)] text-center font-mono text-xs text-[var(--text-primary)] rounded-[2px] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
            <span className="text-[var(--text-muted)]">-</span>
            <input
              type="number"
              min={1}
              max={10}
              placeholder="10"
              value={filters.maxEnergy ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  maxEnergy: e.target.value ? parseInt(e.target.value, 10) : null,
                }))
              }
              className="w-8 bg-[var(--surface-panel)] border border-[var(--surface-hairline)] text-center font-mono text-xs text-[var(--text-primary)] rounded-[2px] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            />
          </div>

          {/* Needs Review Filter Toggle (Live LED error state) */}
          <button
            type="button"
            data-testid="needs-review-toggle"
            aria-pressed={filters.needsReviewOnly}
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                needsReviewOnly: !prev.needsReviewOnly,
              }))
            }
            className={`px-2.5 py-1 text-xs font-mono tracking-wider border rounded-[2px] hw-transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
              filters.needsReviewOnly
                ? 'border-[var(--status-warning)] bg-[var(--surface-raised)] text-[var(--status-warning)] font-semibold'
                : 'border-[var(--surface-hairline)] bg-[var(--surface-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Filter to tracks needing review"
          >
            <span
              className={`w-1.5 h-1.5 rounded-[1px] led-instant shrink-0 ${
                needsReviewCount > 0 ? 'bg-[var(--status-warning)]' : 'bg-[var(--surface-strong)]'
              }`}
            />
            <span>Needs review ({needsReviewCount})</span>
          </button>

          {/* Reset Filters */}
          {(filters.searchQuery ||
            filters.minBpm !== null ||
            filters.maxBpm !== null ||
            filters.selectedKey !== null ||
            filters.minEnergy !== null ||
            filters.maxEnergy !== null ||
            filters.needsReviewOnly) && (
            <Button variant="ghost" size="sm" onClick={resetFilters} icon={<RotateCcw size={11} />}>
              Reset Filters
            </Button>
          )}

          {/* Multi-Selection Batch Actions */}
          {selectedTrackIds.length > 0 && (
            <div className="flex items-center gap-2 pl-2 border-l border-[var(--surface-hairline)]">
              <span className="text-xs font-mono text-[var(--accent)] font-semibold">
                {selectedTrackIds.length} selected
              </span>
              <Button
                variant="primary"
                size="sm"
                disabled={isAddingBatch}
                onClick={() => void handleAddSelectedToSetlist()}
              >
                Add to Setlist
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* ── Count Line & Analysis Legend Bar ── */}
      <div className="px-5 py-2 border-b border-[var(--surface-hairline)] bg-[var(--surface-app)] flex items-center justify-between text-xs font-mono">
        <div data-testid="library-count-line" className="text-xs font-mono text-[var(--text-secondary)]">
          <span>{rows.length} {rows.length === 1 ? 'track' : 'tracks'}, {setlist.length} in your set</span>
        </div>
        <div className="relative flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] hidden sm:inline">Guide:</span>
          <button
            type="button"
            onClick={() => setIsLegendOpen((prev) => !prev)}
            className="w-5 h-5 flex items-center justify-center rounded-[2px] border border-[var(--surface-hairline)] bg-[var(--surface-panel)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono text-xs font-bold hw-transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
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
              className="absolute right-0 top-7 z-30 w-80 sm:w-96 p-3 bg-[var(--surface-panel)] border border-[var(--surface-hairline)] rounded-[4px] text-xs font-mono space-y-2 select-text"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-[var(--surface-hairline)]">
                <span className="font-bold text-[var(--text-primary)] uppercase tracking-wider text-xs">
                  Audio Analysis Legend
                </span>
                <button
                  type="button"
                  onClick={() => setIsLegendOpen(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer px-1 text-xs"
                  aria-label="Close legend"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1.5 text-xs leading-snug">
                <p className="text-[var(--text-secondary)]">
                  <strong className="text-[var(--text-primary)]">BPM:</strong> Track tempo in beats per minute, determining playback speed and beatmatching compatibility.
                </p>
                <p className="text-[var(--text-secondary)]">
                  <strong className="text-[var(--text-primary)]">Key (Camelot):</strong> Harmonic code (1A–12B) on the Camelot wheel; adjacent numbers or mode switches mix harmoniously.
                </p>
                <p className="text-[var(--text-secondary)]">
                  <strong className="text-[var(--text-primary)]">Energy (1 to 10):</strong> Perceived dancefloor energy rating computed from dynamics, spectral density, and loudness.
                </p>
                <p className="text-[var(--text-secondary)]">
                  <strong className="text-[var(--text-primary)]">LUFS:</strong> Integrated loudness in LUFS standardizing perceived volume to prevent volume jumps during mixing.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Virtualized Table Container ── */}
      <div
        ref={tableContainerRef}
        data-testid="virtual-table-container"
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
        className="flex-1 overflow-y-auto relative focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        role="region"
        aria-label="Track list"
      >
        {isLoadingTracks && activeDataset.length === 0 ? (
          <div
            data-testid="library-loading"
            className="h-96 flex flex-col items-center justify-center text-center p-8 m-6"
          >
            <div className="w-6 h-6 border-2 border-[var(--surface-hairline)] border-t-[var(--accent)] rounded-none animate-spin mb-4" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-[var(--text-primary)]">
              {progress
                ? `${progress.stage.toUpperCase()}: ${progress.message ?? 'Analyzing tracks...'}`
                : 'Loading Library...'}
            </h3>
            <p className="text-xs font-mono text-[var(--text-muted)] mt-1 max-w-sm">
              Connecting to local SQLite database and reading audio analysis metadata.
            </p>
          </div>
        ) : activeDataset.length === 0 ? (
          <div className="max-w-xl mx-auto my-12 p-8 border border-[var(--surface-hairline)] bg-[var(--surface-panel)] rounded-[4px] text-center flex flex-col items-center">
            <h3 className="text-sm font-mono font-bold tracking-widest text-[var(--text-primary)] uppercase">
              Your library is empty
            </h3>
            <div className="text-xs font-mono text-[var(--text-secondary)] max-w-md mt-3 space-y-1 leading-relaxed">
              <p>SETLIST is your local-first DJ set preparation co-pilot.</p>
              <p>Your audio files are strictly read-only and never modified.</p>
              <p>Scan a music folder to analyze tempo, Camelot keys, and energy.</p>
            </div>

            {/* Large Choose Folder Action */}
            <button
              type="button"
              onClick={() => void handleChooseFolder()}
              className="mt-6 px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] text-[var(--accent-text)] text-xs font-mono font-bold uppercase tracking-wider transition-colors duration-100 cursor-pointer rounded-[2px] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              data-testid="empty-choose-folder-btn"
              aria-label="Choose Music Folder"
            >
              <span className="text-base" aria-hidden="true">📁</span>
              <span>Choose Folder</span>
            </button>

            {/* Folder Input & Scan Action */}
            <div className="w-full max-w-md mt-4 flex flex-col sm:flex-row items-center gap-1.5">
              <input
                type="text"
                value={folderPathInput}
                onChange={(e) => setFolderPathInput(e.target.value)}
                placeholder="C:/Music or /path/to/tracks"
                aria-label="Music folder path"
                className="flex-1 w-full px-3 py-1.5 bg-[var(--surface-app)] border border-[var(--surface-hairline)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] placeholder-[var(--text-muted)] rounded-[2px]"
              />
              <button
                type="button"
                onClick={() => void scanFolder(folderPathInput)}
                disabled={isLoadingTracks || !folderPathInput.trim()}
                aria-label="Scan Folder"
                className="w-full sm:w-auto px-4 py-1.5 bg-[var(--surface-raised)] hover:bg-[var(--surface-strong)] disabled:opacity-40 border border-[var(--surface-hairline)] text-[var(--text-primary)] text-xs font-mono uppercase tracking-wider hw-transition cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded-[2px]"
              >
                {isLoadingTracks ? 'Scanning...' : 'Scan Folder'}
              </button>
            </div>

            {/* Quick Demo Mode */}
            <div className="mt-4 flex items-center gap-2 text-xs font-mono text-[var(--text-muted)]">
              <span>Or explore features immediately:</span>
              <button
                type="button"
                onClick={() => {
                  setUseMockBackend(true);
                  void loadTracks();
                }}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                Load Demo Library (40 Tracks)
              </button>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full mt-8 text-left border-t border-[var(--surface-hairline)] pt-5 font-mono">
              <div className="p-3 bg-[var(--surface-app)] border border-[var(--surface-hairline)] rounded-[2px]">
                <div className="text-[var(--text-primary)] font-semibold text-xs">
                  Local & Read-Only
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-snug">
                  Zero cloud telemetry. Audio files are strictly read-only.
                </p>
              </div>

              <div className="p-3 bg-[var(--surface-app)] border border-[var(--surface-hairline)] rounded-[2px]">
                <div className="text-[var(--text-primary)] font-semibold text-xs">
                  Pure Rust DSP
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-snug">
                  Deterministic analysis: beat tracking, Camelot keys, energy.
                </p>
              </div>

              <div className="p-3 bg-[var(--surface-app)] border border-[var(--surface-hairline)] rounded-[2px]">
                <div className="text-[var(--text-primary)] font-semibold text-xs">
                  Hardware Ready
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-snug">
                  Exports to Rekordbox XML, M3U8, and markdown/CSV set sheets.
                </p>
              </div>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-8 border border-[var(--surface-hairline)] bg-[var(--surface-panel)] m-6 rounded-[4px]">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[var(--text-primary)]">
              No matching tracks
            </h3>
            <p className="text-xs font-mono text-[var(--text-muted)] max-w-sm mt-1 mb-4">
              Adjust search query, BPM range, or Camelot key filter.
            </p>
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              Clear Filters
            </Button>
          </div>
        ) : (
          <table className="w-full border-collapse text-left select-none text-xs">
            {/* Sticky Table Header with Silkscreen Caption styling */}
            <thead className="sticky top-0 z-10 bg-[var(--surface-panel)] border-b border-[var(--surface-hairline)]">
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
                        className={`px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] select-none silkscreen ${
                          canSort ? 'cursor-pointer hover:text-[var(--text-primary)]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {canSort && (
                            <span className="text-xs text-[var(--text-muted)] font-mono flex items-center">
                              {sortDirection === 'asc' ? (
                                <ArrowUp size={11} className="text-[var(--accent)]" />
                              ) : sortDirection === 'desc' ? (
                                <ArrowDown size={11} className="text-[var(--accent)]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-[var(--text-muted)]" />
                              )}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            {/* Virtualized Body with 36px row height */}
            <tbody>
              {paddingTop > 0 && (
                <tr>
                  <td style={{ height: `${paddingTop}px` }} colSpan={columns.length} />
                </tr>
              )}

              {itemsToRender.map(({ row, index }) => {
                const isSelected = row.getIsSelected();
                const isFocused = focusedRowIndex === index;

                return (
                  <tr
                    key={row.id}
                    data-index={index}
                    tabIndex={0}
                    role="row"
                    aria-selected={isFocused || isSelected}
                    onClick={() => {
                      setFocusedRowIndex(index);
                      handleRowClick(row.original.id);
                    }}
                    onFocus={() => setFocusedRowIndex(index)}
                    className={`group h-[36px] border-b border-[var(--surface-hairline)] hw-transition cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                      isFocused || isSelected
                        ? 'bg-[var(--surface-raised)] border-l-2 border-l-[var(--accent)] text-[var(--text-primary)]'
                        : 'hover:bg-[var(--surface-raised)]/40 text-[var(--text-primary)]'
                    }`}
                  >
                    {row.getVisibleCells().map((cell: Cell<Track, unknown>) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="px-3 py-1 text-xs text-[var(--text-primary)] align-middle truncate"
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
      <footer className="px-5 py-2 border-t border-[var(--surface-hairline)] bg-[var(--surface-panel)] flex items-center justify-between text-xs text-[var(--text-muted)] font-mono select-none">
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
