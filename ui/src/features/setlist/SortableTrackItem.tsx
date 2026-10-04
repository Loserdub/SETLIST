import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { EditedBadge, isFieldOverridden } from '../track/overrides';
import { useAppStore } from '../../store/useAppStore';
import { IconGripVertical, IconPlay, IconPause, IconClose } from '../../components/icons';

interface SortableTrackItemProps {
  entry: SetlistEntry;
  isFirst: boolean;
  isLast: boolean;
  lockFirst: boolean;
  lockLast: boolean;
  onToggleLockFirst: () => void;
  onToggleLockLast: () => void;
  onRemove: (position: number) => void;
  onInspect: (trackId: string) => void;
}

export function SortableTrackItem({
  entry,
  isFirst,
  isLast,
  lockFirst,
  lockLast,
  onToggleLockFirst,
  onToggleLockLast,
  onRemove,
  onInspect,
}: SortableTrackItemProps) {
  const auditionTrackId = useAppStore((s) => s.auditionTrackId);
  const auditionState = useAppStore((s) => s.auditionState);
  const toggleAudition = useAppStore((s) => s.toggleAudition);
  const isAuditioning = auditionTrackId === entry.track_id && auditionState === 'playing';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entry.track_id,
    disabled: (isFirst && lockFirst) || (isLast && lockLast),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const track = entry.track;
  const keyStr = track?.analysis?.key.camelot
    ? `${track.analysis.key.camelot.number}${track.analysis.key.camelot.letter}`
    : '—';
  const bpm = track?.analysis?.rhythm.grid.bpm ? Math.round(track.analysis.rhythm.grid.bpm) : 0;
  const energy = track?.analysis?.energy_score ?? entry.target_energy ?? 5;

  const bg = keyStr !== '—' ? camelotColor(keyStr) : '#262626';
  const fg = keyStr !== '—' ? camelotTextColor(keyStr) : '#999999';

  const formatDuration = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const isLocked = (isFirst && lockFirst) || (isLast && lockLast);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-center justify-between px-3.5 py-2.5 bg-[#0b0b0b] border-b border-[#181818] transition-colors select-none ${
        isDragging
          ? 'z-30 bg-[#161616] border border-[#383838] shadow-2xl'
          : isLocked
          ? 'border-l-2 border-l-amber-500/80 bg-[#0e0e0e]'
          : 'border-l-2 border-l-transparent hover:bg-[#111111]'
      }`}
    >
      {/* Left: Drag Handle, Position & Lock Pin */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className={`flex items-center justify-center p-1 text-[#a8a8a8] hover:text-white transition-colors select-none ${
            isLocked ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'
          }`}
          title={isLocked ? 'Track is pinned/locked' : 'Drag to reorder track'}
        >
          <IconGripVertical size={13} className="text-[#a8a8a8] hover:text-white" />
        </div>

        {/* Position Number */}
        <div className="w-5 text-right font-mono text-xs font-semibold text-[#a8a8a8] tabular-nums">
          {String(entry.position).padStart(2, '0')}
        </div>

        {/* Anchor Pin Button (First / Last) */}
        {isFirst && (
          <button
            type="button"
            onClick={onToggleLockFirst}
            className={`px-1.5 py-0.5 text-xs font-mono tracking-wider uppercase transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
              lockFirst
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 font-semibold'
                : 'border-[#222222] bg-[#111111] text-[#a8a8a8] hover:text-[#ededed]'
            }`}
            title="Lock opening track as fixed setlist anchor"
          >
            <span>{lockFirst ? 'LOCK OPENER' : 'PIN OPENER'}</span>
          </button>
        )}

        {isLast && !isFirst && (
          <button
            type="button"
            onClick={onToggleLockLast}
            className={`px-1.5 py-0.5 text-xs font-mono tracking-wider uppercase transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
              lockLast
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 font-semibold'
                : 'border-[#222222] bg-[#111111] text-[#a8a8a8] hover:text-[#ededed]'
            }`}
            title="Lock closing track as fixed setlist anchor"
          >
            <span>{lockLast ? 'LOCK CLOSER' : 'PIN CLOSER'}</span>
          </button>
        )}

        {/* Track Title & Artist */}
        <div
          onClick={() => onInspect(entry.track_id)}
          className="flex items-baseline gap-2 min-w-0 cursor-pointer pr-3"
        >
          <span className="text-xs font-semibold text-[#f0f0f0] hover:text-white truncate transition-colors">
            {track?.tags.title ?? 'Untitled Track'}
          </span>
          <span className="text-xs text-[#a8a8a8] truncate font-normal">
            {track?.tags.artist ?? 'Unknown Artist'}
          </span>
        </div>
      </div>

      {/* Right: Key, BPM, Energy, Duration & Remove */}
      <div className="flex items-center gap-4 pl-2 shrink-0">
        {/* BPM */}
        <span className="font-mono text-xs font-medium text-[#cfcfcf] text-right tabular-nums inline-flex items-center gap-1">
          <span>{bpm > 0 ? `${bpm} BPM` : '—'}</span>
          {isFieldOverridden(track, 'bpm') && <EditedBadge field="bpm" title="BPM analysis overridden" />}
        </span>

        {/* Camelot Key Chip */}
        <span className="inline-flex items-center gap-1">
          <span
            className="font-mono font-bold text-xs px-1.5 py-0.5 rounded-[2px] tracking-tight w-7 text-center"
            style={{ backgroundColor: bg, color: fg }}
          >
            {keyStr}
          </span>
          {isFieldOverridden(track, 'key_camelot') && <EditedBadge field="key_camelot" title="Key analysis overridden" />}
        </span>

        {/* Energy */}
        <div className="flex items-center gap-1.5" title={`Energy Score: ${energy}/10`}>
          <span className="font-mono text-xs text-[#cfcfcf] w-3 text-right tabular-nums">
            {energy}
          </span>
          <div className="w-8 bg-[#181818] h-1 overflow-hidden">
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

        {/* Duration */}
        <span className="font-mono text-xs text-[#a8a8a8] w-10 text-right tabular-nums">
          {track ? formatDuration(track.duration_ms) : '—'}
        </span>

        {/* Quick Audition Button */}
        {track && (
          <button
            type="button"
            onClick={() => void toggleAudition(entry.track_id)}
            className={`p-1 text-xs font-mono tracking-wider uppercase border transition-colors cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] flex items-center justify-center w-6 h-6 ${
              isAuditioning
                ? 'border-[#38bdf8] bg-[#142332] text-[#38bdf8] font-bold'
                : 'border-[#262626] bg-[#121212] hover:bg-[#1e1e1e] text-[#cfcfcf] hover:text-white'
            }`}
            title={isAuditioning ? 'Pause audition' : 'Audition track audio'}
            data-testid={`audition-setlist-btn-${entry.track_id}`}
          >
            {isAuditioning ? <IconPause size={10} /> : <IconPlay size={10} />}
          </button>
        )}

        {/* Remove Button */}
        <button
          type="button"
          onClick={() => onRemove(entry.position)}
          className="text-[#a8a8a8] hover:text-rose-400 transition-colors p-1 cursor-pointer text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 flex items-center justify-center"
          title="Remove track from setlist"
          aria-label="Remove track"
        >
          <IconClose size={12} />
        </button>
      </div>
    </div>
  );
}

export default SortableTrackItem;
