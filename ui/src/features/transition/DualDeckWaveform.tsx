import React from 'react';
import type { Track } from '../../bindings/Track';
import { extractStructuralMarkers, formatTime } from './transitionPlan';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { getPlaybackClient } from '../../api/playback';
import { FourPointCueChips, FOUR_POINT_CUE_CONFIG } from '../track/cues';

interface DualDeckWaveformProps {
  trackA: Track | null;
  trackB: Track | null;
  posA?: number;
  posB?: number;
  auditionTrackId: string | null;
  auditionState: 'stopped' | 'playing' | 'paused';
  auditionSpeed: number;
  onToggleAudition: (trackId: string) => void;
  onSetSpeed: (speed: number) => void;
  className?: string;
}

export const DualDeckWaveform: React.FC<DualDeckWaveformProps> = ({
  trackA,
  trackB,
  posA,
  posB,
  auditionTrackId,
  auditionState,
  auditionSpeed,
  onToggleAudition,
  onSetSpeed,
  className = '',
}) => {
  const markersA = extractStructuralMarkers(trackA);
  const markersB = extractStructuralMarkers(trackB);

  const durA = trackA?.duration_ms ?? 1;
  const durB = trackB?.duration_ms ?? 1;

  const keyAStr = trackA?.analysis?.key.camelot
    ? `${trackA.analysis.key.camelot.number}${trackA.analysis.key.camelot.letter}`
    : '-';
  const keyBStr = trackB?.analysis?.key.camelot
    ? `${trackB.analysis.key.camelot.number}${trackB.analysis.key.camelot.letter}`
    : '-';

  const bgA = keyAStr !== '-' ? camelotColor(keyAStr) : '#22222a';
  const fgA = keyAStr !== '-' ? camelotTextColor(keyAStr) : '#9898a4';
  const bgB = keyBStr !== '-' ? camelotColor(keyBStr) : '#22222a';
  const fgB = keyBStr !== '-' ? camelotTextColor(keyBStr) : '#9898a4';

  const handleJumpToTime = async (trackId: string, timeMs: number) => {
    const client = getPlaybackClient();
    if (auditionTrackId !== trackId) {
      await client.load(trackId);
      await client.play();
    }
    await client.seek(timeMs);
    if (auditionState !== 'playing') {
      await client.play();
    }
  };

  return (
    <div className={`space-y-4 bg-[#0a0a0a] border border-[#1f1f1f] p-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#38bdf8]">
            Dual-Deck Transition Alignment
          </span>
          <span className="text-xs font-mono text-[#a8a8a8]">
            Click any marker to audition mix point
          </span>
        </div>
        {/* Audition Speed */}
        {auditionTrackId && (
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-[#a8a8a8]">Audition Speed:</span>
            {[0.8, 1.0, 1.2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSetSpeed(s)}
                className={`px-1.5 py-0.5 border text-xs cursor-pointer ${
                  Math.abs(auditionSpeed - s) < 0.05
                    ? 'border-[#38bdf8] bg-[#142332] text-[#38bdf8] font-bold'
                    : 'border-[#222222] bg-[#121212] text-[#a8a8a8] hover:text-[#ededed]'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Deck A: Outgoing */}
      <div className="space-y-2 p-3 bg-[#0d0d0d] border border-[#1c1c1c]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-[#181818] border border-[#2b2b2b] text-[#cfcfcf]">
              DECK A · OUTGOING {posA ? `(#${String(posA).padStart(2, '0')})` : ''}
            </span>
            <span className="font-semibold text-xs text-[#ededed] truncate max-w-[200px] sm:max-w-xs">
              {trackA?.tags.title ?? 'Unknown Track'}
            </span>
            <span className="text-xs text-[#a8a8a8] truncate max-w-[150px]">
              {trackA?.tags.artist ?? 'Unknown Artist'}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span
              className="px-1.5 py-0.5 rounded-none font-mono font-bold text-xs te-num border border-black/30"
              style={{ backgroundColor: bgA, color: fgA }}
            >
              {keyAStr}
            </span>
            <span className="text-[#cfcfcf] te-num tabular-nums">
              {trackA?.analysis?.rhythm.grid.bpm ? Math.round(trackA.analysis.rhythm.grid.bpm) : '-'} <span className="te-unit text-[#71717a]">BPM</span>
            </span>
            <span className="text-[#a8a8a8] te-num">E{trackA?.analysis?.energy_score ?? '-'}</span>

            {trackA && (
              <FourPointCueChips
                track={trackA}
                onCueClick={(_slot, timeMs) => void handleJumpToTime(trackA.id, timeMs)}
                size="sm"
              />
            )}

            {trackA && (
              <button
                type="button"
                onClick={() => onToggleAudition(trackA.id)}
                className={`ml-2 px-2 py-0.5 text-xs font-mono uppercase tracking-wider border flex items-center gap-1 transition-colors cursor-pointer ${
                  auditionTrackId === trackA.id && auditionState === 'playing'
                    ? 'border-[#38bdf8] bg-[#142332] text-[#38bdf8] font-bold'
                    : 'border-[#27272a] bg-[#141414] hover:bg-[#202020] text-[#cfcfcf]'
                }`}
                title="Audition Outgoing Track A"
              >
                <span>{auditionTrackId === trackA.id && auditionState === 'playing' ? '⏸' : '▶'}</span>
                <span>{auditionTrackId === trackA.id && auditionState === 'playing' ? 'PAUSE' : 'AUDITION'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Structural Waveform Track A */}
        <div className="relative h-12 bg-[#121212] border border-[#242424] rounded-none overflow-hidden select-none">
          {/* Segments representation */}
          {trackA?.analysis?.segments.map((seg, idx) => {
            const segDuration = Math.max(0, seg.end_ms - seg.start_ms);
            const leftPct = (seg.start_ms / durA) * 100;
            const widthPct = Math.max(1, (segDuration / durA) * 100);

            const segColor =
              seg.label.toLowerCase() === 'outro'
                ? '#059669' // Emerald
                : seg.label.toLowerCase() === 'breakdown'
                ? '#7c3aed' // Purple
                : seg.label.toLowerCase() === 'drop'
                ? '#dc2626' // Red
                : seg.label.toLowerCase() === 'buildup'
                ? '#ea580c' // Orange
                : seg.label.toLowerCase() === 'intro'
                ? '#0284c7' // Sky Blue
                : '#4f46e5'; // Indigo

            return (
              <div
                key={`segA-${idx}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: segColor,
                  opacity: 0.25,
                }}
                className="absolute inset-y-0 border-r border-[#0a0a0a]/60 hover:opacity-40 transition-opacity cursor-pointer"
                title={`${seg.label.toUpperCase()} (${formatTime(seg.start_ms)} - ${formatTime(seg.end_ms)})`}
                onClick={() => void handleJumpToTime(trackA.id, seg.start_ms)}
              >
                <span className="absolute top-1 left-1 text-[9px] font-mono uppercase font-bold text-white/90 truncate pointer-events-none">
                  {seg.label}
                </span>
              </div>
            );
          })}

          {/* Cues overlay */}
          {trackA?.analysis?.cue_points.map((cue) => {
            const leftPct = (cue.time_ms / durA) * 100;
            const cueLetter = String.fromCharCode(65 + (cue.index % 8));
            const fourConfig = FOUR_POINT_CUE_CONFIG[cueLetter as keyof typeof FOUR_POINT_CUE_CONFIG];
            const cueColor = fourConfig?.colorHex ?? cue.color_hex ?? '#38bdf8';

            return (
              <button
                key={`cueA-${cueLetter}-${cue.index}`}
                type="button"
                style={{ left: `${leftPct}%`, backgroundColor: cueColor }}
                onClick={() => void handleJumpToTime(trackA.id, cue.time_ms)}
                className="absolute top-0 bottom-0 -ml-[1px] w-[3px] transition-transform hover:scale-x-150 cursor-pointer focus:outline-none z-10"
                title={`Cue ${cueLetter}: ${fourConfig?.role ?? cue.label} (${formatTime(cue.time_ms)})`}
              >
                <div
                  className="absolute -top-0.5 -left-2 px-1 text-[8px] font-mono font-bold leading-tight text-black shadow-sm"
                  style={{ backgroundColor: cueColor }}
                >
                  {cueLetter}
                </div>
              </button>
            );
          })}

          {/* Mix-Out Highlight Zone (typically last 30-45s) */}
          <div
            style={{
              left: `${Math.max(0, (durA - 45000) / durA) * 100}%`,
              right: 0,
            }}
            className="absolute inset-y-0 bg-[#10b981]/10 border-l border-dashed border-[#10b981]/80 pointer-events-none flex items-center justify-end pr-2"
          >
            <span className="text-xs font-mono font-bold text-[#10b981] uppercase tracking-wider">
              MIX-OUT ZONE
            </span>
          </div>
        </div>

        {/* Marker Quick Jumps for Deck A */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs font-mono">
          <span className="text-[#a8a8a8]">Jump to:</span>
          {markersA.slice(0, 5).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => void handleJumpToTime(trackA!.id, m.timeMs)}
              className="px-1.5 py-0.5 bg-[#141414] hover:bg-[#202020] border border-[#242424] hover:border-[#38bdf8] text-[#cfcfcf] hover:text-[#38bdf8] transition-colors cursor-pointer"
            >
              {m.label} ({formatTime(m.timeMs)})
            </button>
          ))}
        </div>
      </div>

      {/* Deck B: Incoming */}
      <div className="space-y-2 p-3 bg-[#0d0d0d] border border-[#1c1c1c]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-[#181818] border border-[#2b2b2b] text-[#cfcfcf]">
              DECK B · INCOMING {posB ? `(#${String(posB).padStart(2, '0')})` : ''}
            </span>
            <span className="font-semibold text-xs text-[#ededed] truncate max-w-[200px] sm:max-w-xs">
              {trackB?.tags.title ?? 'Unknown Track'}
            </span>
            <span className="text-xs text-[#a8a8a8] truncate max-w-[150px]">
              {trackB?.tags.artist ?? 'Unknown Artist'}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span
              className="px-1.5 py-0.5 rounded-none font-mono font-bold text-xs te-num border border-black/30"
              style={{ backgroundColor: bgB, color: fgB }}
            >
              {keyBStr}
            </span>
            <span className="text-[#cfcfcf] te-num tabular-nums">
              {trackB?.analysis?.rhythm.grid.bpm ? Math.round(trackB.analysis.rhythm.grid.bpm) : '-'} <span className="te-unit text-[#71717a]">BPM</span>
            </span>
            <span className="text-[#a8a8a8] te-num">E{trackB?.analysis?.energy_score ?? '-'}</span>

            {trackB && (
              <FourPointCueChips
                track={trackB}
                onCueClick={(_slot, timeMs) => void handleJumpToTime(trackB.id, timeMs)}
                size="sm"
              />
            )}

            {trackB && (
              <button
                type="button"
                onClick={() => onToggleAudition(trackB.id)}
                className={`ml-2 px-2 py-0.5 text-xs font-mono uppercase tracking-wider border flex items-center gap-1 transition-colors cursor-pointer ${
                  auditionTrackId === trackB.id && auditionState === 'playing'
                    ? 'border-[#38bdf8] bg-[#142332] text-[#38bdf8] font-bold'
                    : 'border-[#27272a] bg-[#141414] hover:bg-[#202020] text-[#cfcfcf]'
                }`}
                title="Audition Incoming Track B"
              >
                <span>{auditionTrackId === trackB.id && auditionState === 'playing' ? '⏸' : '▶'}</span>
                <span>{auditionTrackId === trackB.id && auditionState === 'playing' ? 'PAUSE' : 'AUDITION'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Structural Waveform Track B */}
        <div className="relative h-12 bg-[#121212] border border-[#242424] rounded-none overflow-hidden select-none">
          {/* Segments representation */}
          {trackB?.analysis?.segments.map((seg, idx) => {
            const segDuration = Math.max(0, seg.end_ms - seg.start_ms);
            const leftPct = (seg.start_ms / durB) * 100;
            const widthPct = Math.max(1, (segDuration / durB) * 100);

            const segColor =
              seg.label.toLowerCase() === 'breakdown'
                ? '#7c3aed'
                : seg.label.toLowerCase() === 'drop'
                ? '#dc2626'
                : seg.label.toLowerCase() === 'buildup'
                ? '#ea580c'
                : seg.label.toLowerCase() === 'intro'
                ? '#0284c7'
                : seg.label.toLowerCase() === 'outro'
                ? '#059669'
                : '#4f46e5';

            return (
              <div
                key={`segB-${idx}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: segColor,
                  opacity: 0.25,
                }}
                className="absolute inset-y-0 border-r border-[#0a0a0a]/60 hover:opacity-40 transition-opacity cursor-pointer"
                title={`${seg.label.toUpperCase()} (${formatTime(seg.start_ms)} - ${formatTime(seg.end_ms)})`}
                onClick={() => void handleJumpToTime(trackB.id, seg.start_ms)}
              >
                <span className="absolute top-1 left-1 text-[9px] font-mono uppercase font-bold text-white/90 truncate pointer-events-none">
                  {seg.label}
                </span>
              </div>
            );
          })}

          {/* Cues overlay */}
          {trackB?.analysis?.cue_points.map((cue) => {
            const leftPct = (cue.time_ms / durB) * 100;
            const cueLetter = String.fromCharCode(65 + (cue.index % 8));
            const fourConfig = FOUR_POINT_CUE_CONFIG[cueLetter as keyof typeof FOUR_POINT_CUE_CONFIG];
            const cueColor = fourConfig?.colorHex ?? cue.color_hex ?? '#38bdf8';

            return (
              <button
                key={`cueB-${cueLetter}-${cue.index}`}
                type="button"
                style={{ left: `${leftPct}%`, backgroundColor: cueColor }}
                onClick={() => void handleJumpToTime(trackB.id, cue.time_ms)}
                className="absolute top-0 bottom-0 -ml-[1px] w-[3px] transition-transform hover:scale-x-150 cursor-pointer focus:outline-none z-10"
                title={`Cue ${cueLetter}: ${fourConfig?.role ?? cue.label} (${formatTime(cue.time_ms)})`}
              >
                <div
                  className="absolute -top-0.5 -left-2 px-1 text-[8px] font-mono font-bold leading-tight text-black shadow-sm"
                  style={{ backgroundColor: cueColor }}
                >
                  {cueLetter}
                </div>
              </button>
            );
          })}

          {/* Mix-In Highlight Zone (typically first 45s) */}
          <div
            style={{
              left: 0,
              width: `${Math.min(100, (45000 / durB) * 100)}%`,
            }}
            className="absolute inset-y-0 bg-[#38bdf8]/10 border-r border-dashed border-[#38bdf8]/80 pointer-events-none flex items-center justify-start pl-2"
          >
            <span className="text-xs font-mono font-bold text-[#38bdf8] uppercase tracking-wider">
              MIX-IN ENTRY ZONE
            </span>
          </div>
        </div>

        {/* Marker Quick Jumps for Deck B */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs font-mono">
          <span className="text-[#a8a8a8]">Jump to:</span>
          {markersB.slice(0, 5).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => void handleJumpToTime(trackB!.id, m.timeMs)}
              className="px-1.5 py-0.5 bg-[#141414] hover:bg-[#202020] border border-[#242424] hover:border-[#38bdf8] text-[#cfcfcf] hover:text-[#38bdf8] transition-colors cursor-pointer"
            >
              {m.label} ({formatTime(m.timeMs)})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
