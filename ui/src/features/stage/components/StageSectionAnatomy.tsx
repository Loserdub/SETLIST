import { useMemo, useCallback } from 'react';
import type { Track } from '../../../bindings/Track';
import type { Segment } from '../../../bindings/Segment';
import type { SegmentLabel } from '../../../bindings/SegmentLabel';
import { formatDuration } from '../usePerformanceClock';

export interface StageSectionAnatomyProps {
  track: Track | null;
  positionMs: number;
  durationMs: number;
  onSeek?: (positionMs: number) => void;
}

/**
 * StageSectionAnatomy — Musical Structural Phrase Blocks Visualizer.
 *
 * Replaces the noisy raw waveform with clear, glanceable musical sections
 * (Intro, Verse, Buildup, Drop, Breakdown, Outro) snapped to bar boundaries.
 *
 * Styled in Pioneer CDJ / Serato pro-audio hardware colorway:
 * - Cyan for high-energy Drops & Playhead needle
 * - Amber for Buildup tension
 * - Serato Red for Outro mix-out points
 */
export function StageSectionAnatomy({
  track,
  positionMs,
  durationMs,
  onSeek,
}: StageSectionAnatomyProps) {
  if (!track || durationMs <= 0) {
    return null;
  }

  const bpm = track.analysis?.rhythm?.grid?.bpm ?? 120;
  const msPerBeat = 60000 / (bpm > 0 ? bpm : 120);
  const msPerBar = msPerBeat * 4;

  // 1. Resolve or synthesize structural segments
  const segments: Segment[] = useMemo(() => {
    if (track.analysis?.segments && track.analysis.segments.length > 0) {
      return track.analysis.segments;
    }

    // Dynamic fallback if explicit segments are absent
    const totalBars = Math.max(16, Math.floor(durationMs / msPerBar));
    const introBars = Math.min(16, Math.floor(totalBars * 0.15));
    const outroBars = Math.min(16, Math.floor(totalBars * 0.15));
    const midBars = totalBars - introBars - outroBars;
    const dropBars = Math.floor(midBars * 0.4);
    const verseBars = midBars - dropBars;

    const introMs = introBars * msPerBar;
    const verseMs = introMs + verseBars * msPerBar;
    const dropMs = verseMs + dropBars * msPerBar;

    return [
      { label: 'intro' as SegmentLabel, start_ms: 0, end_ms: introMs, energy: 3 },
      { label: 'verse' as SegmentLabel, start_ms: introMs, end_ms: verseMs, energy: 5 },
      { label: 'drop' as SegmentLabel, start_ms: verseMs, end_ms: dropMs, energy: 8 },
      { label: 'outro' as SegmentLabel, start_ms: dropMs, end_ms: durationMs, energy: 4 },
    ];
  }, [track.analysis?.segments, durationMs, msPerBar]);

  // 2. Identify active segment and compute progress
  const activeSegmentIndex = segments.findIndex(
    (s) => positionMs >= s.start_ms && positionMs < s.end_ms
  );
  const activeSegment =
    activeSegmentIndex >= 0
      ? segments[activeSegmentIndex]
      : segments[segments.length - 1] ?? null;

  const nextSegment =
    activeSegmentIndex >= 0 && activeSegmentIndex + 1 < segments.length
      ? segments[activeSegmentIndex + 1]
      : null;

  // Bars remaining in current segment
  const barsRemainingInSegment = activeSegment
    ? Math.max(0, Math.round((activeSegment.end_ms - positionMs) / msPerBar))
    : 0;

  // Progress percentage for playhead
  const playheadPercent = Math.min(100, Math.max(0, (positionMs / durationMs) * 100));

  // Visual styles per segment label
  const getSegmentStyle = (label: SegmentLabel, isActive: boolean) => {
    switch (label) {
      case 'intro':
        return isActive
          ? 'bg-[#1e293b] border-t-2 border-t-[#38bdf8] text-[#93c5fd]'
          : 'bg-[#0f172a] border-[#1e293b] text-[#64748b]';
      case 'verse':
        return isActive
          ? 'bg-[#172554] border-t-2 border-t-[#60a5fa] text-[#bfdbfe]'
          : 'bg-[#0b1329] border-[#1e293b] text-[#475569]';
      case 'buildup':
        return isActive
          ? 'bg-[#451a03] border-t-2 border-t-[#f59e0b] text-[#fcd34d]'
          : 'bg-[#291102] border-[#451a03] text-[#78350f]';
      case 'drop':
        return isActive
          ? 'bg-[#0c4a6e] border-t-2 border-t-[#00b4d8] text-[#e0f2fe] shadow-[0_0_12px_rgba(0,180,216,0.3)]'
          : 'bg-[#082f49] border-[#0c4a6e] text-[#38bdf8]';
      case 'breakdown':
        return isActive
          ? 'bg-[#2e1065] border-t-2 border-t-[#a855f7] text-[#e9d5ff]'
          : 'bg-[#1e0a45] border-[#2e1065] text-[#6b21a8]';
      case 'outro':
        return isActive
          ? 'bg-[#450a0a] border-t-2 border-t-[#ef4444] text-[#fca5a5]'
          : 'bg-[#2b0606] border-[#450a0a] text-[#991b1b]';
      default:
        return 'bg-[#13141a] border-[#1e2029] text-[#64748b]';
    }
  };

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
      onSeek(clickRatio * durationMs);
    },
    [onSeek, durationMs]
  );

  return (
    <div
      className="w-full bg-[#0d0e12] border border-[#22242c] rounded-sm p-3.5 flex flex-col gap-2.5 font-mono shadow-sm"
      data-testid="stage-section-anatomy"
    >
      {/* Header: Title & Telemetry */}
      <div
        className="flex flex-wrap items-center justify-between text-xs gap-2"
        data-testid="section-telemetry"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00b4d8]" />
          <span className="font-bold uppercase tracking-wider text-[#cbd5e1]">
            SECTION ANATOMY
          </span>
          {activeSegment && (
            <span className="px-2 py-0.5 bg-[#161821] border border-[#262837] text-white font-bold uppercase rounded-sm">
              {activeSegment.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-[#94a3b8]">
          <span>
            {barsRemainingInSegment} BARS UNTIL{' '}
            {nextSegment ? nextSegment.label.toUpperCase() : 'END'}
          </span>
          <span className="text-[#475569]">|</span>
          <span className="text-white font-bold tabular-nums">
            {formatDuration(positionMs)} / {formatDuration(durationMs)}
          </span>
        </div>
      </div>

      {/* Structural Segment Blocks Timeline */}
      <div
        className="relative h-12 w-full flex overflow-hidden rounded-sm cursor-pointer select-none border border-[#1e2029] bg-[#08090c]"
        onClick={handleBarClick}
        title="Click to seek within section anatomy"
      >
        {segments.map((seg, idx) => {
          const segDuration = Math.max(1, seg.end_ms - seg.start_ms);
          const widthPercent = (segDuration / durationMs) * 100;
          const isActive = idx === activeSegmentIndex;
          const segBars = Math.round(segDuration / msPerBar);

          return (
            <div
              key={`seg-${idx}-${seg.label}`}
              style={{ width: `${widthPercent}%` }}
              data-testid={`section-block-${seg.label}`}
              className={`h-full flex flex-col justify-between p-1.5 border-r border-[#1e2029] transition-all relative overflow-hidden ${getSegmentStyle(
                seg.label,
                isActive
              )}`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider leading-none">
                <span className="truncate">{seg.label}</span>
                {segBars > 0 && <span className="text-[9px] opacity-75">{segBars}b</span>}
              </div>

              {isActive && (
                <div className="text-[9px] font-bold uppercase tracking-wider text-[#38bdf8] leading-none">
                  ▶ ACTIVE
                </div>
              )}
            </div>
          );
        })}

        {/* Sweeping Pioneer CDJ Cyan Playhead Needle */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none transition-all z-20 flex flex-col items-center"
          style={{ left: `${playheadPercent}%` }}
          data-testid="section-playhead-needle"
        >
          {/* Top illuminated diamond */}
          <div className="w-2.5 h-2.5 bg-[#00b4d8] rotate-45 shadow-[0_0_8px_rgba(0,180,216,1)] -mt-1" />
          {/* Vertical needle line */}
          <div className="w-0.5 h-full bg-[#00b4d8] shadow-[0_0_6px_rgba(0,180,216,0.9)]" />
        </div>
      </div>
    </div>
  );
}
