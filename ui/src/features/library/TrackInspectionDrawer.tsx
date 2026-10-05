import React, { useEffect, useRef } from 'react';
import type { Track } from '../../bindings/Track';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { useAppStore } from '../../store/useAppStore';
import { SEGMENT_COLORS } from './StructuralMiniMap';

interface TrackInspectionDrawerProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullDetail: (trackId: string) => void;
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const TrackInspectionDrawer: React.FC<TrackInspectionDrawerProps> = ({
  track,
  isOpen,
  onClose,
  onOpenFullDetail,
}) => {
  const {
    auditionTrackId,
    auditionState,
    toggleAudition,
    addToSetlist,
    setlist,
    trackTitleOverrides,
    trackArtistOverrides,
  } = useAppStore();

  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Render 3-band mini waveform
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !track?.analysis?.waveform) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const wf = track.analysis.waveform;
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, width, height);

    const length = Math.min(wf.low.peak.length, wf.mid.peak.length, wf.high.peak.length);
    if (length === 0) return;

    const step = length / width;

    for (let x = 0; x < width; x++) {
      const idx = Math.floor(x * step);
      const lowVal = (wf.low.peak[idx] ?? 0) / 255;
      const midVal = (wf.mid.peak[idx] ?? 0) / 255;
      const highVal = (wf.high.peak[idx] ?? 0) / 255;

      const totalH = Math.max(2, Math.max(lowVal, midVal, highVal) * (height / 2));

      // Draw composite frequency bar in boutique warm studio tones
      if (lowVal > 0.3) {
        ctx.fillStyle = '#f59e0b'; // Low / Sub Bass (Studio Amber)
      } else if (midVal > 0.3) {
        ctx.fillStyle = '#e4e4e7'; // Vocals / Mid (Chalk White)
      } else {
        ctx.fillStyle = '#ea580c'; // Highs (Terracotta)
      }

      ctx.fillRect(x, centerY - totalH, 1, totalH * 2);
    }
  }, [track]);

  if (!isOpen || !track) return null;

  const title = trackTitleOverrides[track.id] ?? track.tags.title ?? track.path.split(/[/\\]/).pop() ?? 'Untitled';
  const artist = trackArtistOverrides[track.id] ?? track.tags.artist ?? 'Unknown Artist';
  const album = track.tags.album ?? '';
  const isAuditioning = auditionTrackId === track.id && auditionState === 'playing';
  const isInSetlist = setlist.some((e) => e.track_id === track.id);

  const analysis = track.analysis;
  const bpm = analysis?.rhythm.grid.bpm;
  const camelot = analysis?.key?.camelot;
  const camelotStr = camelot ? `${camelot.number}${camelot.letter}` : null;
  const energy = analysis?.energy_score ?? null;
  const lufs = analysis?.loudness.integrated_lufs ?? null;
  const lra = analysis?.loudness.loudness_range ?? null;
  const truePeak = analysis?.loudness.true_peak ?? null;
  const tuningCents = analysis?.key?.tuning_cents ?? 0;
  const segments = analysis?.segments ?? [];
  const cues = analysis?.cue_points ?? [];

  const camBg = camelotStr ? camelotColor(camelotStr) : '#222222';
  const camFg = camelotStr ? camelotTextColor(camelotStr) : '#cccccc';

  return (
    <aside
      role="complementary"
      aria-label="Track Inspection Panel"
      data-testid="track-inspection-drawer"
      className="w-80 sm:w-96 border-l border-[#27272a] bg-[#0c0c0f] flex flex-col h-full overflow-hidden select-text font-mono z-30 shrink-0 shadow-2xl"
    >
      {/* Top Header */}
      <div className="p-3.5 border-b border-[#27272a] bg-[#09090b] flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-amber-400 uppercase tracking-wider font-bold">
            <span>● TRACK INSPECTOR</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">{track.id.slice(0, 8)}</span>
          </div>
          <h3 className="text-sm font-bold text-zinc-100 truncate mt-1 leading-snug">
            {title}
          </h3>
          <p className="text-xs text-zinc-400 truncate mt-0.5">
            {artist} {album ? `• ${album}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white border border-[#27272a] bg-[#121215] hover:bg-[#1a1a1f] text-xs transition-colors cursor-pointer shrink-0 rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
          aria-label="Close inspector"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      {/* Action Toolbar */}
      <div className="px-3.5 py-2.5 border-b border-[#27272a] bg-[#09090b] flex items-center gap-2">
        <button
          type="button"
          onClick={() => void toggleAudition(track.id)}
          className={`hw-btn px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer rounded-none flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px] ${
            isAuditioning
              ? 'border-amber-500 bg-amber-950/40 text-amber-300 font-bold'
              : 'border-[#27272a] bg-[#121215] hover:bg-[#1a1a1f] text-zinc-300 hover:text-white'
          }`}
          data-testid="inspector-audition-btn"
        >
          <span>{isAuditioning ? '⏸' : '▶'}</span>
          <span>{isAuditioning ? 'Auditioning' : 'Audition'}</span>
        </button>

        <button
          type="button"
          onClick={() => void addToSetlist(track.id)}
          disabled={isInSetlist}
          className={`hw-btn px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px] ${
            isInSetlist
              ? 'border-[#1e1e24] bg-[#101014] text-zinc-600 cursor-default'
              : 'border-[#27272a] bg-[#121215] hover:bg-[#1a1a1f] text-zinc-300 hover:text-white'
          }`}
          data-testid="inspector-add-setlist-btn"
        >
          {isInSetlist ? 'In Set' : '+ Setlist'}
        </button>

        <button
          type="button"
          onClick={() => onOpenFullDetail(track.id)}
          className="hw-btn ml-auto px-2 py-1 text-xs font-mono font-bold uppercase tracking-wider border border-[#27272a] bg-[#121215] hover:bg-[#1a1a1f] text-zinc-300 hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
          title="Open in full Track Editor view"
        >
          Editor ↗
        </button>
      </div>

      {/* Main Drawer Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* 3-Band Waveform Canvas */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-bold uppercase tracking-wider font-mono">
            <span>3-BAND OVERVIEW WAVEFORM</span>
            <span className="text-zinc-200 te-num tabular-nums">{formatDuration(track.duration_ms)}</span>
          </div>
          <div className="h-16 w-full bg-[#08080a] border border-[#27272a] overflow-hidden relative">
            <canvas
              ref={waveformCanvasRef}
              width={340}
              height={64}
              className="w-full h-full block"
            />
          </div>
        </div>

        {/* Acoustic Metrics Hardware Grid */}
        <div className="space-y-1.5">
          <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider font-mono">
            ACOUSTICS & HARMONICS
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* BPM */}
            <div className="p-2.5 bg-[#09090b] border border-[#27272a]">
              <span className="text-xs text-zinc-400 uppercase font-mono">BPM</span>
              <div className="text-base font-bold text-zinc-100 mt-0.5 tabular-nums te-num font-mono">
                {bpm ? bpm.toFixed(1) : '-'}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5 font-mono">
                {analysis?.rhythm.grid.steady ? 'Steady 4/4 Grid' : 'Variable Tempo'}
              </div>
            </div>

            {/* Key & Camelot */}
            <div className="p-2.5 bg-[#09090b] border border-[#27272a]">
              <span className="text-xs text-zinc-400 uppercase font-mono">Key / Camelot</span>
              <div className="mt-1 flex items-center gap-1.5 font-mono">
                {camelotStr ? (
                  <span
                    className="inline-flex items-center justify-center font-bold text-xs te-num px-2 py-0.5 rounded-[2px]"
                    style={{ backgroundColor: camBg, color: camFg }}
                  >
                    {camelotStr}
                  </span>
                ) : (
                  <span className="text-zinc-400">-</span>
                )}
                <span className="text-xs text-zinc-300 font-bold">
                  {analysis?.key?.mode ? `${analysis.key.mode}` : ''}
                </span>
              </div>
              <div className="text-xs text-zinc-400 mt-0.5 font-mono">
                {tuningCents !== 0 ? `${tuningCents > 0 ? '+' : ''}${tuningCents.toFixed(1)}¢ tuning` : 'Standard 440 Hz'}
              </div>
            </div>

            {/* Energy */}
            <div className="p-2.5 bg-[#09090b] border border-[#27272a]">
              <span className="text-xs text-zinc-400 uppercase font-mono">Energy Rating</span>
              <div className="text-base font-bold text-zinc-100 mt-0.5 tabular-nums te-num font-mono">
                {energy !== null ? `${energy} / 10` : '-'}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5 font-mono">
                Dynamic dancefloor density
              </div>
            </div>

            {/* Loudness LUFS */}
            <div className="p-2.5 bg-[#09090b] border border-[#27272a]">
              <span className="text-xs text-zinc-400 uppercase font-mono">Loudness (LUFS)</span>
              <div className="text-base font-bold text-zinc-100 mt-0.5 tabular-nums te-num font-mono">
                {lufs !== null && lufs > -90 ? `${lufs.toFixed(1)} dB` : '-'}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5 font-mono">
                {lra !== null ? `LRA: ${lra.toFixed(1)} LU` : ''}
                {truePeak !== null ? ` · Peak: ${truePeak.toFixed(1)} dBTP` : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Structural Segments Map */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-bold uppercase tracking-wider font-mono">
            <span>{`STRUCTURAL SEGMENTS (${segments.length})`}</span>
          </div>
          {segments.length === 0 ? (
            <div className="p-2.5 bg-[#09090b] border border-[#27272a] text-xs text-zinc-400 font-mono">
              No structural segments detected.
            </div>
          ) : (
            <div className="space-y-1 bg-[#09090b] border border-[#27272a] p-2 font-mono">
              {segments.map((s, idx) => {
                const conf = SEGMENT_COLORS[s.label] ?? {
                  bg: '#334155',
                  label: s.label,
                };
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-0.5 border-b border-[#18181b] last:border-b-0"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-[2px] inline-block"
                        style={{ backgroundColor: conf.bg }}
                      />
                      <span className="font-bold text-zinc-200 uppercase">{conf.label}</span>
                    </div>
                    <div className="text-zinc-400 tabular-nums te-num text-xs font-mono">
                      {formatDuration(s.start_ms)} - {formatDuration(s.end_ms)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cue Points Registers (0-7) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-bold uppercase tracking-wider font-mono">
            <span>{`HOT CUE REGISTERS (${cues.length})`}</span>
          </div>
          {cues.length === 0 ? (
            <div className="p-2.5 bg-[#09090b] border border-[#27272a] text-xs text-zinc-400 font-mono">
              No hot cues placed.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 font-mono">
              {cues.map((cue) => (
                <div
                  key={cue.index}
                  className="p-1.5 bg-[#09090b] border border-[#27272a] flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="w-2 h-2 rounded-full inline-block shrink-0"
                      style={{ backgroundColor: cue.color_hex || '#f59e0b' }}
                    />
                    <span className="text-xs font-bold text-zinc-200 truncate">
                      {String.fromCharCode(65 + cue.index)}: {cue.label || 'Cue'}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums te-num shrink-0 ml-1 font-mono">
                    {formatDuration(cue.time_ms)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* File & Container Metadata Specs */}
        <div className="space-y-1.5 pt-1">
          <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider font-mono">
            FILE SPECIFICATIONS
          </div>
          <div className="p-2.5 bg-[#09090b] border border-[#27272a] space-y-1 text-xs text-zinc-400 break-all font-mono">
            <div>
              <span className="text-zinc-500">PATH:</span> {track.path}
            </div>
            <div>
              <span className="text-zinc-500">BLAKE3 HASH:</span> {track.hash.slice(0, 16)}...
            </div>
            <div>
              <span className="text-zinc-500">PIPELINE:</span> {track.analysis_version ?? 'v1'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
