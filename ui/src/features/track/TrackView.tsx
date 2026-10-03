import React, { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { WaveformContainer, formatTimeMs } from '../../components/waveform';
import { useTrackState } from './useTrackState';

const SEGMENT_COLORS: Record<string, string> = {
  intro: '#0284c7', // Sky Blue
  verse: '#4f46e5', // Indigo
  buildup: '#ea580c', // Orange
  drop: '#dc2626', // Red
  breakdown: '#7c3aed', // Purple
  outro: '#059669', // Emerald
};

export const TrackView: React.FC = () => {
  const { selectedTrack, setRoute, addToSetlist, setlist } = useAppStore();
  const {
    zoomLevel,
    scrollOffsetMs,
    playheadPositionMs,
    setZoomLevel,
    setScrollOffsetMs,
    setPlayheadPositionMs,
    jumpToTime,
  } = useTrackState();

  if (!selectedTrack) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-[#080808] text-[#ededed] p-8 text-center select-none font-mono">
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-[#cccccc]">No Track Selected</h2>
        <p className="text-xs text-[#666666] max-w-sm mt-1.5 mb-6 font-sans">
          Select a track from your library to inspect its beat grid, 3-band waveform, cue points, and structural segments.
        </p>
        <button
          type="button"
          onClick={() => setRoute('library')}
          className="px-3.5 py-1.5 bg-[#181818] hover:bg-[#222222] text-[#ededed] text-xs font-mono uppercase tracking-wider border border-[#2b2b2b] transition-colors cursor-pointer rounded-none"
        >
          Browse Library
        </button>
      </div>
    );
  }

  const analysis = selectedTrack.analysis;
  const camelot = analysis?.key.camelot;
  const keyStr = camelot ? `${camelot.number}${camelot.letter}` : '—';
  const bg = camelot ? camelotColor(camelot) : '#475569';
  const fg = camelot ? camelotTextColor(camelot) : '#ffffff';
  const inSetlist = setlist.some((e) => e.track_id === selectedTrack.id);

  // Determine which segment the current playhead is positioned in
  const activeSegment = useMemo(() => {
    if (!analysis || playheadPositionMs === null) return null;
    return analysis.segments.find(
      (s) => playheadPositionMs >= s.start_ms && playheadPositionMs <= s.end_ms
    );
  }, [analysis, playheadPositionMs]);

  // Determine the nearest beat
  const activeBeat = useMemo(() => {
    if (!analysis || playheadPositionMs === null) return null;
    const { beats_ms, downbeat_flags } = analysis.rhythm.grid;
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < beats_ms.length; i++) {
      const diff = Math.abs(beats_ms[i] - playheadPositionMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    return {
      index: closestIdx + 1,
      beatMs: beats_ms[closestIdx],
      isDownbeat: Boolean(downbeat_flags[closestIdx]),
    };
  }, [analysis, playheadPositionMs]);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-[#080808] text-[#ededed] p-5 space-y-4">
      {/* ── Top Header Card ────────────────────────────────────────────────── */}
      <div className="p-4 bg-[#0a0a0a] border border-[#1c1c1c] flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-none">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span
              className="px-2 py-0.5 rounded-[2px] font-mono text-xs font-bold border border-black/30"
              style={{ backgroundColor: bg, color: fg }}
              data-testid="track-key-badge"
            >
              {keyStr}
            </span>
            <h2 className="text-lg font-bold tracking-tight text-white truncate max-w-lg">
              {selectedTrack.tags.title ?? 'Untitled Track'}
            </h2>
          </div>
          <p className="text-xs text-[#888888]">
            {selectedTrack.tags.artist ?? 'Unknown Artist'} • {selectedTrack.tags.album ?? 'Single / Unassigned'}
          </p>
          <p className="text-[10px] font-mono text-[#555555] truncate max-w-xl">
            {selectedTrack.path}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={inSetlist}
            onClick={() => void addToSetlist(selectedTrack.id)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer border rounded-none ${
              inSetlist
                ? 'bg-[#111111] text-[#666666] border-[#222222] cursor-default'
                : 'bg-[#181818] hover:bg-[#242424] text-white border-[#2b2b2b]'
            }`}
          >
            {inSetlist ? '✓ In Active Setlist' : '+ Add to Setlist'}
          </button>
          <button
            type="button"
            onClick={() => setRoute('library')}
            className="px-3 py-1.5 bg-[#101010] hover:bg-[#1a1a1a] text-[#888888] hover:text-white text-xs font-mono uppercase tracking-wider border border-[#222222] transition-colors cursor-pointer rounded-none"
          >
            Back to Library
          </button>
        </div>
      </div>

      {/* ── Metrics Row (Key, BPM, Energy, Loudness) ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" data-testid="track-metrics-row">
        {/* BPM */}
        <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666]">
            Tempo (BPM)
          </div>
          <div className="text-xl font-mono font-bold text-white mt-0.5 tabular-nums" data-testid="track-bpm-value">
            {analysis?.rhythm.grid.bpm.toFixed(1) ?? '—'}
          </div>
          <div className="text-[10px] font-mono text-[#71717a] mt-0.5">
            {analysis?.rhythm.grid.steady ? 'Steady grid' : 'Variable tempo'}
          </div>
        </div>

        {/* Camelot Key & Tuning */}
        <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666]">
            Key & Mode
          </div>
          <div className="text-xl font-mono font-bold text-white mt-0.5 flex items-center gap-2">
            <span>{keyStr}</span>
            <span className="text-xs font-normal text-[#71717a]">({analysis?.key.mode ?? '—'})</span>
          </div>
          <div className="text-[10px] font-mono text-[#71717a] mt-0.5">
            {analysis?.key.tuning_cents !== undefined
              ? `${analysis.key.tuning_cents > 0 ? '+' : ''}${analysis.key.tuning_cents.toFixed(1)} cents`
              : '440.0 Hz'}
          </div>
        </div>

        {/* Energy Rating */}
        <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666]">
            Energy Rating
          </div>
          <div className="text-xl font-mono font-bold text-[#ededed] mt-0.5" data-testid="track-energy-value">
            {analysis?.energy_score ?? '—'}<span className="text-xs text-[#555555] font-sans">/10</span>
          </div>
          <div className="w-full bg-[#181818] h-1 mt-2 overflow-hidden border border-[#222222]">
            <div
              className="bg-[#ededed] h-full"
              style={{ width: `${((analysis?.energy_score ?? 5) / 10) * 100}%` }}
            />
          </div>
        </div>

        {/* Integrated Loudness */}
        <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666]">
            Loudness
          </div>
          <div className="text-xl font-mono font-bold text-white mt-0.5 tabular-nums">
            {analysis?.loudness.integrated_lufs.toFixed(1) ?? '—'}{' '}
            <span className="text-xs font-normal text-[#71717a]">LUFS</span>
          </div>
          <div className="text-[10px] font-mono text-[#71717a] mt-0.5">
            LRA: {analysis?.loudness.loudness_range.toFixed(1) ?? '—'} LU • Peak: {analysis?.loudness.true_peak.toFixed(1) ?? '—'} dBTP
          </div>
        </div>
      </div>

      {/* ── Interactive 3-Band Waveform Container ──────────────────────────── */}
      {analysis && (
        <WaveformContainer
          analysis={analysis}
          durationMs={selectedTrack.duration_ms}
          zoomLevel={zoomLevel}
          scrollOffsetMs={scrollOffsetMs}
          playheadPositionMs={playheadPositionMs}
          onZoomChange={setZoomLevel}
          onScrollChange={setScrollOffsetMs}
          onSetPlayhead={setPlayheadPositionMs}
        />
      )}

      {/* ── Playhead Scrubbing Status Bar ──────────────────────────────────── */}
      <div className="p-2.5 bg-[#0a0a0a] border border-[#1c1c1c] flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#38bdf8]" />
            <span className="text-[#666666]">PLAYHEAD:</span>
            <span className="font-bold text-[#ededed]">{formatTimeMs(playheadPositionMs ?? 0)}</span>
          </div>

          {activeSegment && (
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5"
                style={{ backgroundColor: SEGMENT_COLORS[activeSegment.label.toLowerCase()] }}
              />
              <span className="text-[#666666]">SECTION:</span>
              <span className="font-bold text-white uppercase">{activeSegment.label}</span>
            </div>
          )}

          {activeBeat && (
            <div className="hidden sm:flex items-center gap-1.5 text-[#666666]">
              <span>BEAT:</span>
              <span className="text-[#ededed]">#{activeBeat.index}</span>
              {activeBeat.isDownbeat && (
                <span className="px-1 py-0.5 text-[9px] font-mono font-bold bg-[#142332] text-[#38bdf8] border border-[#1e3a5f]">
                  DOWNBEAT
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => jumpToTime(0, selectedTrack.duration_ms)}
            className="px-2.5 py-1 bg-[#141414] hover:bg-[#1e1e1e] text-[#a1a1aa] hover:text-white border border-[#27272a] text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
          >
            Jump to Start (0:00)
          </button>
        </div>
      </div>

      {/* ── Cue Points Registers A to H ────────────────────────────────────── */}
      <div className="p-4 bg-[#0a0a0a] border border-[#1c1c1c] space-y-3">
        <div className="flex items-center justify-between border-b border-[#181818] pb-2">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#a1a1aa]">
            Cue Points (Registers A – H)
          </h3>
          <span className="text-[11px] font-mono text-[#555555]">
            Click cue to jump playhead and zoom focus
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2" data-testid="cues-list">
          {analysis?.cue_points.map((cue) => {
            const letter = String.fromCharCode(65 + cue.index);
            const isNearPlayhead =
              playheadPositionMs !== null && Math.abs(playheadPositionMs - cue.time_ms) < 500;

            return (
              <div
                key={cue.index}
                onClick={() => jumpToTime(cue.time_ms, selectedTrack.duration_ms)}
                className={`p-2.5 border flex items-start gap-2.5 transition-colors cursor-pointer select-none ${
                  isNearPlayhead
                    ? 'bg-[#181818] border-[#38bdf8]'
                    : 'bg-[#0e0e0e] border-[#1c1c1c] hover:bg-[#141414] hover:border-[#2a2a2a]'
                }`}
                title={`Jump to ${letter}: ${cue.label}`}
                data-testid={`cue-card-${letter}`}
              >
                <span
                  className="w-6 h-6 flex items-center justify-center font-mono font-bold text-xs text-white shrink-0"
                  style={{ backgroundColor: cue.color_hex }}
                >
                  {letter}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs text-white truncate font-mono">
                    {cue.label}
                  </div>
                  <div className="font-mono text-[11px] text-[#4ade80] mt-0.5">
                    {formatTimeMs(cue.time_ms)}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] text-[#888888] uppercase font-mono px-1 py-0.5 bg-[#141414] border border-[#222222]">
                      {cue.kind}
                    </span>
                    {cue.loop_end_ms && (
                      <span className="text-[10px] text-[#22d3ee] font-mono">
                        +{formatTimeMs(cue.loop_end_ms - cue.time_ms)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Structural Segments Timeline ────────────────────────────────────── */}
      <div className="p-4 bg-[#0a0a0a] border border-[#1c1c1c] space-y-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#a1a1aa] border-b border-[#181818] pb-2">
          Structural Segments
        </h3>

        {/* Timeline Bar */}
        <div className="w-full h-7 bg-[#050505] flex border border-[#242424] overflow-hidden">
          {analysis?.segments.map((seg, idx) => {
            const segDuration = seg.end_ms - seg.start_ms;
            const pct = Math.max(1, (segDuration / selectedTrack.duration_ms) * 100);
            const color = SEGMENT_COLORS[seg.label.toLowerCase()] ?? '#64748b';

            return (
              <div
                key={idx}
                onClick={() => jumpToTime(seg.start_ms, selectedTrack.duration_ms)}
                className="h-full flex items-center justify-center text-[9px] font-mono font-bold text-white uppercase tracking-wider overflow-hidden px-1 border-r border-[#000000]/60 transition-opacity hover:opacity-80 cursor-pointer"
                style={{ width: `${pct}%`, backgroundColor: color }}
                title={`${seg.label}: ${formatTimeMs(seg.start_ms)} - ${formatTimeMs(seg.end_ms)} (Energy ${seg.energy})`}
              >
                <span className="truncate">{seg.label}</span>
              </div>
            );
          })}
        </div>

        {/* Segments Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {analysis?.segments.map((seg, idx) => (
            <div
              key={idx}
              onClick={() => jumpToTime(seg.start_ms, selectedTrack.duration_ms)}
              className="p-2 bg-[#0e0e0e] border border-[#1c1c1c] text-xs flex flex-col gap-0.5 hover:border-[#2a2a2a] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 font-mono font-semibold text-[#ededed] uppercase text-[10px]">
                <span
                  className="w-1.5 h-1.5"
                  style={{ backgroundColor: SEGMENT_COLORS[seg.label.toLowerCase()] }}
                />
                {seg.label}
              </div>
              <div className="font-mono text-[10px] text-[#71717a]">
                {formatTimeMs(seg.start_ms)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
