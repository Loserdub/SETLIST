import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import type { Track } from '../../../bindings/Track';
import { camelotColor, camelotTextColor } from '../../../utils/camelotColor';
import { getEnergyColor } from '../../../utils/energyColor';
import { getTrackCamelotKey, getTrackMusicalKeyName, isTrackNeedsReview, isTrackEdited } from '../filters';
import { EditedBadge, isFieldOverridden } from '../../track/overrides';
import { getTrackDisplayTitle, getTrackDisplayArtist } from '../../../utils/trackDisplay';
import { StructuralMiniMap } from '../StructuralMiniMap';

const columnHelper = createColumnHelper<Track>();

const formatDuration = (ms: number): string => {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export interface LibraryColumnsOptions {
  setlistTrackIds: Set<string>;
  addToSetlist: (id: string) => Promise<void>;
  auditionTrackId: string | null;
  auditionState: string;
  handleToggleAudition: (id: string) => Promise<void>;
  trackTitleOverrides: Record<string, string>;
  trackArtistOverrides: Record<string, string>;
  inspectedTrackId: string | null;
  setInspectedTrackId: (id: string | null | ((prev: string | null) => string | null)) => void;
  handleRowClick: (id: string) => void;
}

export function createLibraryColumns(options: LibraryColumnsOptions): ColumnDef<Track, unknown>[] {
  const {
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
  } = options;

  return [
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
            className="w-3.5 h-3.5 rounded-none border-border-strong bg-surface-raised accent-border-focus cursor-pointer"
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
            className="w-3.5 h-3.5 rounded-none border-border-strong bg-surface-raised accent-border-focus cursor-pointer"
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
                <span className="font-medium text-content-primary truncate text-xs leading-tight">
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
                    className="text-xs font-mono px-1.5 py-0.5 bg-surface-elevated text-zinc-300 border border-zinc-700 shrink-0"
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
                  className="text-xs font-mono px-1.5 py-0.5 bg-surface-elevated text-zinc-300 border border-zinc-700 shrink-0"
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
          <span className="font-mono text-xs te-num tabular-nums text-content-primary inline-flex items-center gap-1.5">
            <span>{bpm > 0 ? bpm.toFixed(1) : '-'}</span>
            {bpm > 0 && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_4px_rgba(16,185,129,0.6)]"
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
          return <span className="text-content-dim font-mono text-xs te-num">-</span>;
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
              <span className="text-xs font-mono text-content-muted truncate">
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
            <span className="font-mono text-xs text-content-primary font-semibold w-3 te-num tabular-nums">
              {energy > 0 ? energy : '-'}
            </span>
            <div className="w-10 bg-surface-elevated h-1 overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${energy * 10}%`,
                  backgroundColor: getEnergyColor(energy),
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
          <span className="font-mono text-xs text-content-muted te-num tabular-nums">
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
        <span className="font-mono text-xs text-content-muted te-num tabular-nums">
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
                  : 'border-border-base bg-surface-raised hover:bg-surface-elevated text-zinc-300 hover:text-white'
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
              onClick={() => setInspectedTrackId((prev) => (prev === track.id ? null : track.id))}
              className={`hw-btn px-2 py-0.5 text-xs font-mono tracking-wider uppercase border transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px] ${
                isInspected
                  ? 'border-zinc-300 bg-surface-hover text-white font-bold'
                  : 'border-border-base bg-surface-raised hover:bg-surface-elevated text-zinc-300 hover:text-white'
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
              className="hw-btn px-2 py-0.5 text-xs font-mono tracking-wider uppercase border border-border-base bg-surface-raised hover:bg-surface-elevated text-zinc-300 hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
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
                  ? 'border-border-subtle bg-surface-panel text-zinc-600 cursor-default'
                  : 'border-border-strong bg-surface-raised hover:bg-surface-hover text-zinc-200 hover:text-white'
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
  ] as ColumnDef<Track, unknown>[];
}
