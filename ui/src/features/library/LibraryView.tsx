import { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
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
import { filterTracks, getTrackCamelotKey, getTrackMusicalKeyName, isTrackNeedsReview, isTrackEdited } from './filters';
import { subscribeToReviewFilter, consumeInitialNeedsReview } from './navigation';
import { sortTracks } from './sorting';
import { generateMockTracks } from './mock5000';
import { DEFAULT_FILTERS, type LibraryFilters, type SortField } from './types';
import { EditedBadge, isFieldOverridden } from '../track/overrides';
import { IconArrowUp, IconArrowDown, IconArrowUpDown } from '../../components/icons';
import { getTrackDisplayTitle, getTrackDisplayArtist } from '../../utils/trackDisplay';
import { StructuralMiniMap } from './StructuralMiniMap';
import { IngestionInstrumentDisplay } from './IngestionInstrumentDisplay';
import { DropZoneOverlay } from './DropZoneOverlay';
import { ScanReportModal } from './ScanReportModal';
import { TrackInspectionDrawer } from './TrackInspectionDrawer';
import { EmptyLibraryView } from './EmptyLibraryView';

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
  } = useAppStore();

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

  // Inspected Track lookup
  const inspectedTrack = useMemo(() => {
    if (!inspectedTrackId) return null;
    return activeDataset.find((t) => t.id === inspectedTrackId) ?? null;
  }, [activeDataset, inspectedTrackId]);

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
                  <span className="font-medium text-[#ececec] truncate text-xs leading-tight">
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
                      className="inline-flex items-center px-1.5 py-0.5 text-xs font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/40 rounded-[2px] select-none shrink-0"
                      title="Needs review: analysis failed or BPM/Key missing"
                      data-testid={`needs-review-badge-${track.id}`}
                    >
                      NEEDS REVIEW
                    </span>
                  )}
                  {isCustom && !isEdited && (
                    <span
                      className="text-xs font-mono px-1.5 py-0.5 bg-[#18181b] text-zinc-300 border border-zinc-700 shrink-0"
                      title="Custom in-app title"
                    >
                      Custom
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-400 truncate font-mono">
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
                <span className="text-zinc-400 truncate text-xs font-normal">
                  {displayArtist}
                </span>
                {isCustom && (
                  <span
                    className="text-xs font-mono px-1.5 py-0.5 bg-[#18181b] text-zinc-300 border border-zinc-700 shrink-0"
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

      // BPM
      columnHelper.accessor((row: Track) => row.analysis?.rhythm.grid.bpm ?? 0, {
        id: 'bpm',
        header: 'BPM',
        cell: (info) => {
          const bpm = info.getValue();
          const isOverridden = isFieldOverridden(info.row.original, 'bpm');
          return (
            <span className="font-mono text-xs te-num tabular-nums text-[#ededed] inline-flex items-center gap-1.5">
              <span>{bpm > 0 ? bpm.toFixed(1) : '-'}</span>
              {bpm > 0 && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_4px_#34d399]"
                  title="Steady beat grid detected"
                />
              )}
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
            return <span className="text-[#646472] font-mono text-xs te-num">-</span>;
          }
          const isOverridden = isFieldOverridden(info.row.original, 'key_camelot');
          const bg = camelotColor(keyStr);
          const fg = camelotTextColor(keyStr);
          const musicalName = getTrackMusicalKeyName(info.row.original);
          return (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex items-center justify-center font-mono font-bold text-xs te-num px-1.5 py-0.5 rounded-[2px] tracking-tight shrink-0 border border-black/30"
                style={{ backgroundColor: bg, color: fg }}
              >
                {keyStr}
              </span>
              {musicalName && (
                <span className="text-xs font-mono text-[#94a3b8] truncate">
                  {musicalName}
                </span>
              )}
              {isOverridden && <EditedBadge field="key_camelot" title="Key analysis overridden" />}
            </span>
          );
        },
        size: 110,
      }),

      // Energy
      columnHelper.accessor((row: Track) => row.analysis?.energy_score ?? 0, {
        id: 'energy',
        header: 'Energy',
        cell: (info) => {
          const energy = info.getValue();
          return (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-[#ededed] font-semibold w-3 te-num tabular-nums">
                {energy > 0 ? energy : '-'}
              </span>
              <div className="w-10 bg-[#191922] h-1 overflow-hidden">
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
            <span className="font-mono text-xs text-[#9898a4] te-num tabular-nums">
              {val > -90 ? `${val.toFixed(1)} dB` : '-'}
            </span>
          );
        },
        size: 85,
      }),

      // Structure
      columnHelper.display({
        id: 'structure',
        header: 'Structure',
        cell: ({ row }) => (
          <div className="py-1">
            <StructuralMiniMap
              segments={row.original.analysis?.segments}
              durationMs={row.original.duration_ms}
              width={96}
              height={12}
            />
          </div>
        ),
        size: 110,
      }),

      // Duration
      columnHelper.accessor((row: Track) => row.duration_ms, {
        id: 'duration',
        header: 'Duration',
        cell: (info) => (
          <span className="font-mono text-xs text-[#9898a4] te-num tabular-nums">
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
          const isAuditioning = auditionTrackId === track.id && auditionState === 'playing';
          const isInspected = inspectedTrackId === track.id;

          return (
            <div
              className={`flex items-center justify-end gap-1.5 pr-2 transition-opacity ${
                isAuditioning || isInspected
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Play preview */}
              <button
                type="button"
                onClick={() => void handleToggleAudition(track.id)}
                className={`hw-btn px-2 py-0.5 text-xs font-mono tracking-wider uppercase border transition-colors cursor-pointer rounded-none flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px] ${
                  isAuditioning
                    ? 'border-amber-500 bg-amber-950/40 text-amber-300 font-bold'
                    : 'border-[#27272a] bg-[#121215] hover:bg-[#1c1c20] text-zinc-300 hover:text-white'
                }`}
                title={isAuditioning ? 'Pause preview' : 'Play preview'}
                aria-label={isAuditioning ? 'Pause preview' : 'Play preview'}
                data-testid={`preview-btn-${track.id}`}
              >
                <span>{isAuditioning ? '⏸' : '▶'}</span>
                <span>{isAuditioning ? 'AUDITIONING' : 'PREVIEW'}</span>
              </button>

              {/* Instant Inspection Drawer Toggle */}
              <button
                type="button"
                onClick={() => setInspectedTrackId(isInspected ? null : track.id)}
                className={`hw-btn px-2 py-0.5 text-xs font-mono tracking-wider uppercase border transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px] ${
                  isInspected
                    ? 'border-zinc-300 bg-[#27272a] text-white font-bold'
                    : 'border-[#27272a] bg-[#121215] hover:bg-[#1c1c20] text-zinc-300 hover:text-white'
                }`}
                title="Instant track analysis inspector (press I)"
                aria-label="Inspect track"
                data-testid={`inspect-btn-${track.id}`}
              >
                INSPECT
              </button>

              {/* Open detail */}
              <button
                type="button"
                onClick={() => handleRowClick(track.id)}
                className="hw-btn px-2 py-0.5 text-xs font-mono tracking-wider uppercase border border-[#27272a] bg-[#121215] hover:bg-[#1c1c20] text-zinc-300 hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
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
                className={`hw-btn px-2 py-0.5 text-xs font-mono tracking-wider uppercase border transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px] ${
                  isInSetlist
                    ? 'border-[#1e1e24] bg-[#101014] text-zinc-600 cursor-default'
                    : 'border-[#323238] bg-[#16161b] hover:bg-[#222228] text-zinc-200 hover:text-white'
                }`}
                title={isInSetlist ? 'Already in set' : 'Add to set'}
                aria-label={isInSetlist ? 'Already in set' : 'Add to set'}
                data-testid={`add-to-set-btn-${track.id}`}
              >
                {isInSetlist ? 'QUEUED' : '+ SET'}
              </button>
            </div>
          );
        },
        size: 260,
      }),
    ],
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
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#09090b] text-[#f4f4f5]">
      {/* ── Top Header & Studio Console ── */}
      <header className="px-5 py-3 border-b border-[#27272a] bg-[#0c0c0f] flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-100">
                Music Library
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 border border-[#27272a] bg-[#121215] text-zinc-300">
                {rows.length.toLocaleString()} {rows.length === 1 ? 'track' : 'tracks'}
                {rows.length !== activeDataset.length && (
                  <span className="text-zinc-500 ml-1">
                    (of {activeDataset.length.toLocaleString()})
                  </span>
                )}
              </span>
              {isBenchmarkMode && (
                <span className="text-xs font-mono px-2 py-0.5 border border-zinc-600 bg-[#18181b] text-zinc-300 uppercase tracking-wide">
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
              className="hw-btn px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-[#27272a] bg-[#121215] hover:bg-[#1c1c20] text-zinc-300 hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
            >
              {isBenchmarkMode ? 'Exit 5K Benchmark' : 'Load 5K Mock Tracks'}
            </button>

            {/* Choose Folder Button */}
            <button
              type="button"
              onClick={() => void handleChooseFolder()}
              className="hw-btn px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-[#27272a] bg-[#121215] hover:bg-[#1c1c20] text-zinc-300 hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
            >
              Choose Folder
            </button>

            {/* Choose Files Button */}
            <button
              type="button"
              onClick={() => void handleChooseFiles()}
              className="hw-btn px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-[#27272a] bg-[#121215] hover:bg-[#1c1c20] text-zinc-300 hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
            >
              Choose Files
            </button>

            {/* Ingestion Report Button if failures or skipped duplicates exist */}
            {(failedFiles.length > 0 || skippedDuplicates.length > 0) && (
              <button
                type="button"
                onClick={() => setIsScanReportOpen(true)}
                className="hw-btn px-2.5 py-1 text-xs font-mono tracking-wider uppercase border border-rose-500/50 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none flex items-center gap-1.5 active:translate-y-[1px]"
                data-testid="ingestion-report-toolbar-btn"
              >
                <span>REPORT</span>
                <span className="px-1 py-0.2 bg-rose-500/20 text-xs font-bold te-num">
                  {failedFiles.length > 0 ? `${failedFiles.length} FAILED` : `${skippedDuplicates.length} SKIPPED`}
                </span>
              </button>
            )}

            {/* Scan Folder Input & Button */}
            <div className="flex items-center border border-[#27272a] bg-[#09090b]">
              <input
                type="text"
                value={folderPathInput}
                onChange={(e) => setFolderPathInput(e.target.value)}
                placeholder="Choose folder or paste path..."
                className="bg-transparent px-2.5 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 w-52 placeholder-zinc-600"
              />
              <button
                type="button"
                onClick={() => void scanFolder(folderPathInput)}
                disabled={isLoadingTracks || !folderPathInput.trim()}
                className="hw-btn px-3 py-1 bg-[#18181b] hover:bg-[#222226] disabled:opacity-40 border-l border-[#27272a] text-zinc-200 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 active:translate-y-[1px]"
              >
                {isLoadingTracks ? 'Scanning...' : 'Scan'}
              </button>
            </div>
          </div>
        </div>

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
              className="w-full px-2.5 py-1 bg-[#09090b] border border-[#27272a] text-zinc-200 placeholder-zinc-600 text-xs font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
            />
          </div>

          {/* BPM Filter */}
          <div className="flex items-center gap-1 bg-[#09090b] border border-[#27272a] px-2 py-1">
            <span className="text-zinc-400 uppercase text-xs">BPM:</span>
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
              className="w-12 bg-[#121215] border border-[#27272a] text-center font-mono text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
            />
            <span className="text-zinc-600">-</span>
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
              className="w-12 bg-[#121215] border border-[#27272a] text-center font-mono text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
            />
          </div>

          {/* Camelot Key Filter */}
          <div className="flex items-center gap-1.5 bg-[#09090b] border border-[#27272a] px-2 py-1">
            <span className="text-zinc-400 uppercase text-xs">Key:</span>
            <select
              value={filters.selectedKey ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  selectedKey: e.target.value || null,
                }))
              }
              aria-label="Filter by Camelot Key"
              className="bg-[#121215] border border-[#27272a] text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400 font-mono cursor-pointer"
            >
              <option value="">All Keys</option>
              {ALL_CAMELOT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            {filters.selectedKey && (
              <label className="flex items-center gap-1 cursor-pointer select-none text-zinc-400 ml-1">
                <input
                  type="checkbox"
                  checked={filters.includeCompatibleKeys}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      includeCompatibleKeys: e.target.checked,
                    }))
                  }
                  className="rounded-none border-[#3f3f46] bg-[#121215] accent-amber-500 cursor-pointer w-3 h-3 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
                />
                <span className="text-xs text-zinc-400">
                  Harmonic (±1)
                </span>
              </label>
            )}
          </div>

          {/* Energy Filter */}
          <div className="flex items-center gap-1 bg-[#09090b] border border-[#27272a] px-2 py-1">
            <span className="text-zinc-400 uppercase text-xs">Energy:</span>
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
              className="w-8 bg-[#121215] border border-[#27272a] text-center font-mono text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
            />
            <span className="text-zinc-600">-</span>
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
              className="w-8 bg-[#121215] border border-[#27272a] text-center font-mono text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
            />
          </div>

          {/* Needs Review Filter Chip */}
          <button
            type="button"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                needsReviewOnly: !prev.needsReviewOnly,
              }))
            }
            aria-pressed={Boolean(filters.needsReviewOnly)}
            data-testid="needs-review-toggle"
            className={`hw-btn px-2.5 py-1 text-xs font-mono tracking-wider border transition-colors cursor-pointer rounded-none flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px] ${
              filters.needsReviewOnly
                ? 'border-amber-500/80 bg-amber-950/40 text-amber-300 font-bold'
                : 'border-[#27272a] bg-[#09090b] hover:bg-[#141418] text-zinc-400 hover:text-zinc-200'
            }`}
            title={
              filters.needsReviewOnly
                ? 'Showing tracks that need review'
                : 'Filter to tracks needing review'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                needsReviewCount > 0 ? 'bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.6)]' : 'bg-zinc-600'
              }`}
            />
            <span>Needs review ({needsReviewCount})</span>
          </button>

          {/* Reset Filters Button */}
          {(filters.searchQuery ||
            filters.minBpm !== null ||
            filters.maxBpm !== null ||
            filters.selectedKey !== null ||
            filters.minEnergy !== null ||
            filters.maxEnergy !== null ||
            filters.needsReviewOnly) && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-mono text-zinc-400 hover:text-white underline transition-colors cursor-pointer px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              Reset Filters
            </button>
          )}

          {/* Multi-Select Batch Add Action */}
          {selectedTrackIds.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-zinc-300 font-mono te-num">
                {selectedTrackIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => void handleAddSelectedToSetlist()}
                disabled={isAddingBatch}
                className="hw-btn px-2.5 py-1 bg-[#18181b] hover:bg-[#222226] disabled:opacity-50 text-zinc-100 font-mono text-xs uppercase border border-[#3f3f46] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
              >
                Add to Setlist
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Count Line, Hardware Keycap Guide & Legend Bar ── */}
      <div className="px-5 py-2 border-b border-[#27272a] bg-[#0c0c0f] flex items-center justify-between text-xs font-mono">
        <div data-testid="library-count-line" className="text-xs font-mono text-zinc-400">
          <span>{rows.length} {rows.length === 1 ? 'track' : 'tracks'}, {setlist.length} in your set</span>
        </div>

        {/* Hardware Keyboard Keycap Guide Ribbon */}
        <div className="hidden md:flex items-center gap-2.5 text-xs font-mono text-zinc-400 select-none">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 border border-[#3f3f46] bg-[#18181b] text-zinc-200 font-mono text-[10px] rounded-[2px] shadow-[0_1px_0_1px_rgba(0,0,0,0.5)] font-bold">SPACE</kbd>
            <span className="text-zinc-400">AUDITION</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 border border-[#3f3f46] bg-[#18181b] text-zinc-200 font-mono text-[10px] rounded-[2px] shadow-[0_1px_0_1px_rgba(0,0,0,0.5)] font-bold">ENTER</kbd>
            <span className="text-zinc-400">+ SET</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 border border-[#3f3f46] bg-[#18181b] text-zinc-200 font-mono text-[10px] rounded-[2px] shadow-[0_1px_0_1px_rgba(0,0,0,0.5)] font-bold">I</kbd>
            <span className="text-zinc-400">INSPECT</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 border border-[#3f3f46] bg-[#18181b] text-zinc-200 font-mono text-[10px] rounded-[2px] shadow-[0_1px_0_1px_rgba(0,0,0,0.5)] font-bold">↑/↓</kbd>
            <span className="text-zinc-400">NAVIGATE</span>
          </span>
        </div>

        <div className="relative flex items-center gap-2">
          <span className="text-xs text-zinc-500 hidden sm:inline font-mono">Guide:</span>
          <button
            type="button"
            onClick={() => setIsLegendOpen((prev) => !prev)}
            className="w-5 h-5 flex items-center justify-center rounded-full border border-[#3f3f46] hover:border-zinc-400 bg-[#121215] hover:bg-[#18181b] text-zinc-300 hover:text-white font-mono text-xs font-bold transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
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
              className="absolute right-0 top-7 z-30 w-80 sm:w-96 p-3 bg-[#0c0c0f] border border-[#27272a] shadow-2xl text-xs font-mono space-y-2 select-text"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-[#27272a]">
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
      </div>

      {/* ── Center Content: Virtualized Table & Slide-Out Inspection Drawer ── */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        <div
          ref={tableContainerRef}
          data-testid="virtual-table-container"
          tabIndex={0}
          onKeyDown={handleTableKeyDown}
          className="flex-1 overflow-y-auto relative focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          role="region"
          aria-label="Track list"
        >
        {isLoadingTracks && activeDataset.length === 0 ? (
          <div
            data-testid="library-loading"
            className="h-96 flex flex-col items-center justify-center text-center p-8 m-6"
          >
            <div className="w-6 h-6 border border-[#3f3f46] border-t-white rounded-none animate-spin mb-4" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
              {progress
                ? `${progress.stage.toUpperCase()}: ${progress.message ?? 'Analyzing tracks...'}`
                : 'Loading Library...'}
            </h3>
            <p className="text-xs font-mono text-zinc-400 mt-1 max-w-sm">
              Connecting to local SQLite database and reading audio analysis metadata.
            </p>
          </div>
        ) : activeDataset.length === 0 ? (
          <EmptyLibraryView
            onChooseFolder={handleChooseFolder}
            onScanFolder={(path) => void scanFolder(path)}
            onLoadDemo={() => {
              setUseMockBackend(true);
              void loadTracks();
            }}
            onLoadBenchmark={toggleBenchmarkMode}
            onReload={() => void loadTracks()}
            isLoading={isLoadingTracks}
          />
        ) : rows.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-8 border border-[#27272a] bg-[#0c0c0f] m-6">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
              No matching tracks
            </h3>
            <p className="text-xs font-mono text-zinc-400 max-w-sm mt-1 mb-4">
              Adjust search query, BPM range, or Camelot key filter.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="hw-btn px-3 py-1 bg-[#121215] hover:bg-[#1c1c20] border border-[#27272a] text-zinc-300 hover:text-white text-xs font-mono uppercase transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <table className="w-full border-collapse text-left select-none text-xs bg-[#09090b]">
            {/* Sticky Table Header */}
            <thead className="sticky top-0 z-10 bg-[#0c0c0f] border-b border-[#27272a]">
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
                        className={`px-3 py-1.5 text-xs font-mono font-medium uppercase tracking-wider text-zinc-300 ${
                          canSort ? 'cursor-pointer hover:text-white select-none' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {canSort && (
                            <span className="text-xs text-zinc-400 font-mono flex items-center">
                              {sortDirection === 'asc' ? (
                                <IconArrowUp size={11} className="text-zinc-200" />
                              ) : sortDirection === 'desc' ? (
                                <IconArrowDown size={11} className="text-zinc-200" />
                              ) : (
                                <IconArrowUpDown size={11} className="text-zinc-500" />
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

            {/* Virtualized Body with dynamic padding offsets */}
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
                    className={`hw-row group h-[52px] border-b border-[#18181b] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset ${
                      isFocused
                        ? 'bg-[#18181b] border-l-2 border-l-zinc-300 ring-1 ring-inset ring-zinc-600/50 is-active'
                        : isSelected
                        ? 'bg-[#141417] border-l-2 border-l-amber-500'
                        : 'hover:bg-[#121215]'
                    }`}
                  >
                    {row.getVisibleCells().map((cell: Cell<Track, unknown>) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="px-3 py-1.5 text-xs text-zinc-300 align-middle"
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
      <footer className="px-5 py-2 border-t border-[#27272a] bg-[#0c0c0f] flex items-center justify-between text-xs text-zinc-400 font-mono">
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
