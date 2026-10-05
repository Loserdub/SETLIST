import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { EnergyProfile } from '../../bindings/EnergyProfile';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { EditedBadge, isFieldOverridden } from '../track/overrides';
import { useAppStore } from '../../store/useAppStore';
import {
  IconGripVertical,
  IconPlay,
  IconPause,
  IconClose,
  IconPin,
  IconArrowUp,
  IconArrowDown,
} from '../../components/icons';
import { computeTrackRole, formatDurationMs, type TimelineInterval } from './roles';
import { FourPointCueChips, type PerformanceCueSlot } from '../track/cues';
import { getPlaybackClient } from '../../api/playback';

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
  // Extended physical sequence properties
  timelineInterval?: TimelineInterval;
  isPinned?: boolean;
  onTogglePin?: () => void;
  isExcluded?: boolean;
  onToggleExclude?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onResequenceFromHere?: () => void;
  totalTracks?: number;
  activeProfile?: EnergyProfile;
  prevEnergy?: number;
  isBridge?: boolean;
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
  timelineInterval,
  isPinned = false,
  onTogglePin,
  isExcluded = false,
  onToggleExclude,
  onMoveUp,
  onMoveDown,
  onResequenceFromHere,
  totalTracks = 1,
  activeProfile = 'PeakPlateau',
  prevEnergy,
  isBridge = false,
}: SortableTrackItemProps) {
  const auditionTrackId = useAppStore((s) => s.auditionTrackId);
  const auditionState = useAppStore((s) => s.auditionState);
  const toggleAudition = useAppStore((s) => s.toggleAudition);
  const isAuditioning = auditionTrackId === entry.track_id && auditionState === 'playing';

  const isLocked = (isFirst && lockFirst) || (isLast && lockLast) || isPinned;

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
    : '-';
  const bpm = track?.analysis?.rhythm.grid.bpm ? Math.round(track.analysis.rhythm.grid.bpm) : 0;
  const energy = track?.analysis?.energy_score ?? entry.target_energy ?? 5;

  const bg = keyStr !== '-' ? camelotColor(keyStr) : '#22222a';
  const fg = keyStr !== '-' ? camelotTextColor(keyStr) : '#9898a4';

  // Compute musical role in sequence
  const roleInfo = computeTrackRole(
    entry.position - 1,
    totalTracks,
    energy,
    entry.target_energy ?? 5,
    activeProfile,
    isFirst,
    isLast,
    isBridge,
    prevEnergy
  );

  const handleAuditionCue = async (_slot: PerformanceCueSlot, timeMs: number) => {
    if (!track) return;
    try {
      const client = getPlaybackClient();
      if (auditionTrackId !== track.id) {
        await client.load(track.id);
      }
      await client.seek(timeMs);
      await client.play();
    } catch (err) {
      console.error('Failed to audition cue:', err);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-center justify-between px-3.5 py-2.5 bg-[#0b0b0b] border-b border-[#181818] hw-track-card select-none ${
        isDragging
          ? 'z-40 bg-[#14141e] border border-[#38bdf8] shadow-[0_12px_28px_rgba(0,0,0,0.85)] scale-[1.01] ring-1 ring-[#38bdf8]/40'
          : isLocked
          ? 'border-l-3 border-l-amber-500 bg-[#0e0e12]'
          : isExcluded
          ? 'opacity-40 border-l-3 border-l-neutral-600 bg-[#080808]'
          : 'border-l-3 border-l-transparent hover:border-l-[#38bdf8]/40 hover:bg-[#111116]'
      }`}
    >
      {/* Left: Drag Handle, Position Badge, Role & Track Identity */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Tactile Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className={`flex items-center justify-center p-1 text-[#a8a8a8] hover:text-white transition-colors select-none ${
            isLocked ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'
          }`}
          title={isLocked ? 'Track is pinned/locked in place' : 'Drag to reorder track position'}
        >
          <IconGripVertical size={13} className="text-[#a8a8a8] hover:text-white" />
        </div>

        {/* Visually Meaningful Position Badge & Timeline Window */}
        <div className="flex flex-col items-center justify-center shrink-0 w-8 text-center font-mono">
          <span className="text-xs font-bold text-white te-num tabular-nums tracking-tighter">
            {String(entry.position).padStart(2, '0')}
          </span>
          {timelineInterval && (
            <span
              className="text-xs text-[#71717a] te-num tabular-nums leading-none tracking-tight"
              title={`Active from ${timelineInterval.startFormatted} to ${timelineInterval.endFormatted}`}
            >
              {timelineInterval.startFormatted}
            </span>
          )}
        </div>

        {/* Pin Opener / Closer Button (Preserving exact titles and text for existing tests) */}
        {isFirst && (
          <button
            type="button"
            onClick={onToggleLockFirst}
            className={`px-1.5 py-0.5 text-xs font-mono tracking-wider uppercase cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] shrink-0 hw-btn ${
              lockFirst
                ? 'border-amber-500/70 bg-amber-500/15 text-amber-300 font-semibold'
                : 'border-[#262626] bg-[#121212] text-[#a8a8a8] hover:text-[#ededed]'
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
            className={`px-1.5 py-0.5 text-xs font-mono tracking-wider uppercase cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] shrink-0 hw-btn ${
              lockLast
                ? 'border-amber-500/70 bg-amber-500/15 text-amber-300 font-semibold'
                : 'border-[#262626] bg-[#121212] text-[#a8a8a8] hover:text-[#ededed]'
            }`}
            title="Lock closing track as fixed setlist anchor"
          >
            <span>{lockLast ? 'LOCK CLOSER' : 'PIN CLOSER'}</span>
          </button>
        )}

        {/* Individual Pin Toggle (Middle Tracks) */}
        {!isFirst && !isLast && onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            className={`p-1 text-xs font-mono border transition-colors cursor-pointer rounded-none shrink-0 ${
              isPinned
                ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                : 'border-transparent text-[#555555] hover:text-[#aaaaaa]'
            }`}
            title={isPinned ? 'Unpin track position' : 'Pin track at this position during re-sequencing'}
          >
            <IconPin size={11} className={isPinned ? 'fill-current' : ''} />
          </button>
        )}

        {/* ROLE Badge */}
        <span
          className={`text-xs font-mono px-2 py-0.5 border uppercase font-bold tracking-wider shrink-0 rounded-none ${roleInfo.badgeClass}`}
          title={roleInfo.description}
        >
          {roleInfo.role}
        </span>

        {/* TRACK: Title & Artist */}
        <div
          onClick={() => onInspect(entry.track_id)}
          className="flex flex-col min-w-0 cursor-pointer pr-2 hover:opacity-90 transition-opacity"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white hover:text-[#38bdf8] truncate transition-colors">
              {track?.tags.title ?? 'Untitled Track'}
            </span>
            {isFieldOverridden(track, 'title') && (
              <EditedBadge field="title" title="Title overridden" />
            )}
            {isExcluded && (
              <span className="text-xs font-mono px-1.5 py-0.5 bg-neutral-800 text-neutral-300 uppercase rounded-none">
                Excluded
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#a8a8a8] truncate font-normal">
              {track?.tags.artist ?? 'Unknown Artist'}
            </span>
            {isFieldOverridden(track, 'artist') && (
              <EditedBadge field="artist" title="Artist overridden" />
            )}
          </div>
        </div>
      </div>

      {/* Right: CUES, KEY, BPM, ENERGY, DURATION & ACTION CONTROLS */}
      <div className="flex items-center gap-3.5 pl-2 shrink-0">
        {/* Four-Point Performance Cue Framework Strip */}
        {track && (
          <div className="hidden lg:flex items-center" data-testid={`track-cues-${entry.track_id}`}>
            <FourPointCueChips
              track={track}
              size="xs"
              onCueClick={handleAuditionCue}
            />
          </div>
        )}

        {/* KEY: Camelot Key Chip with Override Indicator */}
        <div className="inline-flex items-center gap-1 shrink-0">
          <span
            className="font-mono font-bold text-xs px-2 py-0.5 rounded-none te-num tracking-tight text-center min-w-8 border border-black/30 shadow-xs"
            style={{ backgroundColor: bg, color: fg }}
            title={track?.analysis?.key.camelot ? `Key: ${keyStr}` : 'Key unanalyzed'}
          >
            {keyStr}
          </span>
          {isFieldOverridden(track, 'key_camelot') && (
            <EditedBadge field="key_camelot" title="Key analysis overridden" />
          )}
        </div>

        {/* BPM: Crisp Monospace Number */}
        <div className="font-mono text-xs text-right te-num tabular-nums min-w-16 flex items-center justify-end gap-1">
          {bpm > 0 ? (
            <>
              <span className="font-semibold text-white">{bpm}</span>
              <span className="te-unit text-[#71717a]">BPM</span>
            </>
          ) : (
            <span className="text-[#646472]">-</span>
          )}
          {isFieldOverridden(track, 'bpm') && (
            <EditedBadge field="bpm" title="BPM analysis overridden" />
          )}
        </div>

        {/* ENERGY: Numeric + Tactile 10-bar Micro-Gauge */}
        <div
          className="flex items-center gap-1.5 min-w-16 shrink-0"
          title={`Energy Rating: ${energy}/10 (Target: ${entry.target_energy?.toFixed(1) ?? '-'})`}
        >
          <span className="font-mono text-xs font-bold text-[#e0e0e0] te-num w-3 text-right tabular-nums">
            {energy}
          </span>
          <div className="w-10 h-1.5 flex items-center gap-[2px]">
            {Array.from({ length: 10 }).map((_, barIdx) => {
              const active = barIdx < energy;
              return (
                <div
                  key={barIdx}
                  className={`flex-1 h-full rounded-[1px] transition-colors ${
                    active
                      ? energy >= 8
                        ? 'bg-rose-500'
                        : energy >= 5
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                      : 'bg-[#222228]'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* DURATION */}
        <span className="font-mono text-xs text-[#9898a4] te-num w-11 text-right tabular-nums">
          {track ? formatDurationMs(track.duration_ms) : '-'}
        </span>

        {/* AUDITION QUICK PLAY */}
        {track && (
          <button
            type="button"
            onClick={() => void toggleAudition(entry.track_id)}
            className={`p-1 text-xs font-mono tracking-wider uppercase border cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] flex items-center justify-center w-6 h-6 hw-btn ${
              isAuditioning
                ? 'border-[#38bdf8] bg-[#142332] text-[#38bdf8] font-bold shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                : 'border-[#262626] bg-[#121212] hover:bg-[#1e1e1e] text-[#cfcfcf] hover:text-white'
            }`}
            title={isAuditioning ? 'Pause audition' : 'Audition track audio'}
            data-testid={`audition-setlist-btn-${entry.track_id}`}
          >
            {isAuditioning ? <IconPause size={10} /> : <IconPlay size={10} />}
          </button>
        )}

        {/* MANUAL MOVE UP / DOWN CONTROLS */}
        <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst || lockFirst}
              className="p-1 text-[#888888] hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed hw-btn"
              title="Move track up one position"
              aria-label="Move track up"
            >
              <IconArrowUp size={11} />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast || lockLast}
              className="p-1 text-[#888888] hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed hw-btn"
              title="Move track down one position"
              aria-label="Move track down"
            >
              <IconArrowDown size={11} />
            </button>
          )}
        </div>

        {/* SELECTIVE RE-SEQUENCE ACTION */}
        {onResequenceFromHere && !isLast && (
          <button
            type="button"
            onClick={onResequenceFromHere}
            className="hidden xl:inline-block px-1.5 py-0.5 text-xs font-mono uppercase text-[#a8a8a8] hover:text-[#38bdf8] border border-transparent hover:border-[#38bdf8]/40 transition-colors cursor-pointer hw-btn"
            title="Keep tracks up to this position locked and re-sequence remaining set"
          >
            Solve From Here →
          </button>
        )}

        {/* EXCLUDE TOGGLE */}
        {onToggleExclude && (
          <button
            type="button"
            onClick={onToggleExclude}
            className={`text-xs font-mono px-1.5 py-0.5 border cursor-pointer transition-colors hw-btn ${
              isExcluded
                ? 'border-neutral-600 bg-neutral-800 text-neutral-300'
                : 'border-transparent text-[#666666] hover:text-[#a8a8a8]'
            }`}
            title={isExcluded ? 'Include track in solver' : 'Exclude track from solver sequence'}
          >
            {isExcluded ? 'Ignored' : 'Skip'}
          </button>
        )}

        {/* REMOVE BUTTON */}
        <button
          type="button"
          onClick={() => onRemove(entry.position)}
          className="text-[#a8a8a8] hover:text-rose-400 p-1 cursor-pointer text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 flex items-center justify-center hw-btn"
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
