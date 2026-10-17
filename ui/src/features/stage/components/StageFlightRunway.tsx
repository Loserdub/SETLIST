import type { SetlistEntry } from '../../../bindings/SetlistEntry';
import { formatDuration } from '../usePerformanceClock';

export interface StageFlightRunwayProps {
  entries: SetlistEntry[];
  currentIndex: number;
  currentPositionMs: number;
  onSelectWaypoint?: (index: number) => void;
}

/**
 * StageFlightRunway — Horizontal Pro-Audio Waypoint Runway.
 *
 * Replaces traditional vinyl platters and spreadsheet tables with a
 * continuous performance runway showing past, active, and upcoming
 * musical waypoints (songs, instrument tunings, banter, breaks).
 *
 * Styled in Pioneer CDJ / Serato hardware aesthetic:
 * matte obsidian chassis, electric cyan active halos, and amber cues.
 */
export function StageFlightRunway({
  entries,
  currentIndex,
  currentPositionMs,
  onSelectWaypoint,
}: StageFlightRunwayProps) {
  if (entries.length === 0) {
    return null;
  }

  const currentEntry = entries[currentIndex] ?? null;
  const prevEntries = entries.slice(Math.max(0, currentIndex - 2), currentIndex);
  const nextEntries = entries.slice(currentIndex + 1, currentIndex + 4);

  // Helper to extract display metadata from SetlistEntry
  const getWaypointMeta = (entry: SetlistEntry) => {
    const track = entry.track;
    const title = track?.tags?.title ?? entry.track_id;
    const artist = track?.tags?.artist ?? '';
    const bpm = track?.analysis?.rhythm?.grid?.bpm;
    const key = track?.analysis?.key?.camelot
      ? `${track.analysis.key.camelot.number}${track.analysis.key.camelot.letter}`
      : null;
    const energy = track?.analysis?.energy_score ?? null;
    const durationMs = track?.duration_ms ?? 0;

    // Detect specialized non-song waypoints if encoded in track_id or metadata
    const isTuning = entry.track_id.startsWith('tuning:');
    const isBanter = entry.track_id.startsWith('banter:');
    const isIntermission = entry.track_id.startsWith('intermission');

    return {
      title,
      artist,
      bpm: bpm != null ? Math.round(bpm) : null,
      key,
      energy,
      durationMs,
      isTuning,
      isBanter,
      isIntermission,
    };
  };

  const activeMeta = currentEntry ? getWaypointMeta(currentEntry) : null;
  const currentSongDurationMs = currentEntry?.track?.duration_ms ?? 0;
  const timeRemainingInCurrentMs = Math.max(0, currentSongDurationMs - currentPositionMs);

  return (
    <div
      className="w-full bg-[#0d0e12] border border-[#22242c] rounded-sm p-4 flex flex-col gap-3 font-mono shadow-sm"
      data-testid="stage-flight-runway"
    >
      {/* Runway Header: Flight Mode & Horizon Indicator */}
      <div className="flex items-center justify-between text-xs text-[#94a3b8]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00b4d8] shadow-[0_0_8px_rgba(0,180,216,0.8)]" />
          <span className="font-bold uppercase tracking-wider text-[#cbd5e1]">
            FLIGHT RUNWAY
          </span>
          <span className="text-[#475569]">|</span>
          <span className="text-[#94a3b8]">
            WAYPOINT {currentIndex + 1} OF {entries.length}
          </span>
        </div>
        <div className="text-[11px] text-[#64748b]">
          HORIZONTAL NARRATIVE ARC
        </div>
      </div>

      {/* Runway Stream: Past [Left] ➔ Active [Center] ➔ Upcoming [Right] */}
      <div className="flex items-stretch gap-3 overflow-x-auto py-1 scrollbar-thin">
        {/* Past Waypoints (Dimmed Upstream) */}
        {prevEntries.map((entry, idx) => {
          const absoluteIdx = currentIndex - prevEntries.length + idx;
          const meta = getWaypointMeta(entry);
          return (
            <button
              key={`prev-${entry.position}-${entry.track_id}`}
              type="button"
              onClick={() => onSelectWaypoint?.(absoluteIdx)}
              data-testid={`stage-runway-prev-${absoluteIdx}`}
              className="flex-shrink-0 w-36 sm:w-44 p-3 bg-[#13141a] border border-[#1e2029] hover:border-[#334155] rounded-sm text-left opacity-45 hover:opacity-80 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
              title={`Jump to completed waypoint #${absoluteIdx + 1}: ${meta.title}`}
            >
              <div className="flex items-center justify-between text-[10px] text-[#64748b] mb-1">
                <span>#{absoluteIdx + 1} DONE</span>
                {meta.key && <span className="text-[#94a3b8] font-bold">{meta.key}</span>}
              </div>
              <p className="text-xs font-semibold text-[#cbd5e1] truncate">{meta.title}</p>
              {meta.artist && (
                <p className="text-[10px] text-[#64748b] truncate mt-0.5">{meta.artist}</p>
              )}
            </button>
          );
        })}

        {/* ====== ACTIVE WAYPOINT CAPSULE (CENTER ANCHOR) ====== */}
        {currentEntry && activeMeta && (
          <div
            className="flex-grow min-w-[280px] sm:min-w-[380px] max-w-2xl p-4 bg-[#161821] border-2 border-[#00b4d8] rounded-sm shadow-[0_0_20px_rgba(0,180,216,0.22)] relative overflow-hidden"
            data-testid="stage-runway-active-capsule"
          >
            {/* Top Indicator */}
            <div className="flex items-center justify-between text-[11px] font-bold text-[#00b4d8] mb-1.5 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-[#00b4d8] animate-ping" />
                ACTIVE WAYPOINT #{currentIndex + 1}
              </span>
              <span className="text-[#cbd5e1] tabular-nums">
                {currentSongDurationMs > 0 ? (
                  <>−{formatDuration(timeRemainingInCurrentMs)} REMAINING</>
                ) : (
                  'LIVE'
                )}
              </span>
            </div>

            {/* Title & Artist */}
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug line-clamp-1 break-words">
              {activeMeta.title}
            </h3>
            {activeMeta.artist && (
              <p className="text-sm text-[#94a3b8] font-medium truncate mt-0.5">
                {activeMeta.artist}
              </p>
            )}

            {/* Technical Badges */}
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-[#252834]">
              {activeMeta.key && (
                <span className="px-2 py-0.5 bg-[#0e2238] border border-[#00b4d8]/60 text-[#38bdf8] text-xs font-bold rounded-sm">
                  KEY {activeMeta.key}
                </span>
              )}
              {activeMeta.bpm !== null && (
                <span className="px-2 py-0.5 bg-[#181a24] border border-[#2b2e3d] text-[#cbd5e1] text-xs font-semibold rounded-sm">
                  {activeMeta.bpm} BPM
                </span>
              )}
              {activeMeta.energy !== null && (
                <span className="px-2 py-0.5 bg-[#261e12] border border-[#f59e0b]/50 text-[#fb923c] text-xs font-semibold rounded-sm">
                  ENERGY {activeMeta.energy}/10
                </span>
              )}
              {activeMeta.isTuning && (
                <span className="px-2 py-0.5 bg-[#2b1810] border border-[#f97316] text-[#fed7aa] text-xs font-bold rounded-sm">
                  🎸 TUNING CHANGE
                </span>
              )}
              {activeMeta.isBanter && (
                <span className="px-2 py-0.5 bg-[#2c1318] border border-[#ef4444] text-[#fecaca] text-xs font-bold rounded-sm">
                  🎙 SPOKEN BANTER
                </span>
              )}
            </div>
          </div>
        )}

        {/* Upcoming Waypoints (Downstream Horizon) */}
        {nextEntries.map((entry, idx) => {
          const absoluteIdx = currentIndex + 1 + idx;
          const meta = getWaypointMeta(entry);

          // Calculate estimated arrival offset
          let arrivalOffsetMs = timeRemainingInCurrentMs;
          for (let i = currentIndex + 1; i < absoluteIdx; i++) {
            const dur = entries[i]?.track?.duration_ms ?? 0;
            arrivalOffsetMs += dur;
          }

          return (
            <button
              key={`next-${entry.position}-${entry.track_id}`}
              type="button"
              onClick={() => onSelectWaypoint?.(absoluteIdx)}
              data-testid={`stage-runway-next-${absoluteIdx}`}
              className="flex-shrink-0 w-44 sm:w-56 p-3 bg-[#13141a] border border-[#22242f] hover:border-[#00b4d8]/60 hover:bg-[#181a23] rounded-sm text-left transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
              title={`Preview upcoming waypoint #${absoluteIdx + 1}: ${meta.title}`}
            >
              <div className="flex items-center justify-between text-[10px] text-[#94a3b8] mb-1 font-semibold">
                <span className="text-[#38bdf8]">+{idx + 1} UPCOMING</span>
                <span className="text-[#64748b]">in {formatDuration(arrivalOffsetMs)}</span>
              </div>
              <p className="text-xs font-bold text-[#e2e8f0] truncate">{meta.title}</p>
              {meta.artist && (
                <p className="text-[10px] text-[#94a3b8] truncate mt-0.5">{meta.artist}</p>
              )}

              <div className="flex items-center gap-1.5 mt-2 pt-1 border-t border-[#1e2029] text-[10px]">
                {meta.key && <span className="text-[#38bdf8] font-bold">{meta.key}</span>}
                {meta.bpm !== null && <span className="text-[#64748b]">• {meta.bpm} BPM</span>}
                {meta.isTuning && <span className="text-[#f59e0b] font-bold">• 🎸 TUNING</span>}
                {meta.isBanter && <span className="text-[#ef4444] font-bold">• 🎙 MIC</span>}
              </div>
            </button>
          );
        })}

        {/* End of Set Marker */}
        {nextEntries.length === 0 && (
          <div
            className="flex-shrink-0 w-36 sm:w-44 p-3 bg-[#14151b] border border-dashed border-[#2d3142] rounded-sm text-center flex flex-col items-center justify-center text-[#64748b]"
            data-testid="stage-runway-finale"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#f59e0b]">
              FINALE
            </span>
            <span className="text-xs mt-1">End of Setlist</span>
          </div>
        )}
      </div>
    </div>
  );
}
