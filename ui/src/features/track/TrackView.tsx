import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { WaveformContainer, formatTimeMs } from '../../components/waveform';
import { useTrackState } from './useTrackState';
import { usePlayback } from './usePlayback';
import { PlaybackBar, SPEED_OPTIONS } from './PlaybackBar';
import { handleTrackKeyDown } from './playbackMath';
import { getTrackDisplayTitle, getTrackDisplayArtist } from '../../utils/trackDisplay';

const SEGMENT_COLORS: Record<string, string> = {
  intro: '#0284c7', // Sky Blue
  verse: '#4f46e5', // Indigo
  buildup: '#ea580c', // Orange
  drop: '#dc2626', // Red
  breakdown: '#7c3aed', // Purple
  outro: '#059669', // Emerald
};

export const TrackView: React.FC = () => {
  const {
    selectedTrack,
    setRoute,
    addToSetlist,
    setlist,
    trackTitleOverrides,
    trackArtistOverrides,
    setTrackTitleOverride,
    setTrackArtistOverride,
  } = useAppStore();
  const {
    zoomLevel,
    scrollOffsetMs,
    playheadPositionMs,
    setZoomLevel,
    setScrollOffsetMs,
    setPlayheadPositionMs,
    jumpToTime,
  } = useTrackState();

  // Audio Playback Engine Hook with 60 FPS requestAnimationFrame Interpolation
  const playback = usePlayback({
    trackId: selectedTrack?.id,
    durationMs: selectedTrack?.duration_ms ?? 0,
  });

  // Unified Seek handler ensuring both audio playback and visual canvas state synchronize
  const handleSeek = useCallback(
    (timeMs: number) => {
      if (!selectedTrack) return;
      const clamped = Math.max(0, Math.min(selectedTrack.duration_ms, timeMs));
      setPlayheadPositionMs(clamped);
      void playback.seek(clamped);
    },
    [selectedTrack, setPlayheadPositionMs, playback]
  );

  // Jump viewport and seek audio
  const handleJumpAndSeek = useCallback(
    (timeMs: number) => {
      if (!selectedTrack) return;
      jumpToTime(timeMs, selectedTrack.duration_ms);
      void playback.seek(timeMs);
    },
    [selectedTrack, jumpToTime, playback]
  );

  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const handleSeekRef = useRef(handleSeek);
  handleSeekRef.current = handleSeek;

  const handleJumpAndSeekRef = useRef(handleJumpAndSeek);
  handleJumpAndSeekRef.current = handleJumpAndSeek;

  // ───────────────────────────────────────────────────────────────────────────
  // Keyboard Shortcuts (Track View Only):
  // [Space]: Toggle Play / Pause
  // [Left Arrow]: Seek -5 seconds
  // [Right Arrow]: Seek +5 seconds
  // [Shift + Left Arrow]: Seek 1 bar backward using beat grid
  // [Shift + Right Arrow]: Seek 1 bar forward using beat grid
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedTrack) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const currentPos = useTrackState.getState().playheadPositionMs ?? 0;
      const action = handleTrackKeyDown(
        {
          key: e.key,
          code: e.code,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          targetTagName: (e.target as HTMLElement)?.tagName,
          isContentEditable: (e.target as HTMLElement)?.isContentEditable,
        },
        {
          currentPositionMs: currentPos,
          durationMs: selectedTrack.duration_ms,
          grid: selectedTrack.analysis?.rhythm.grid,
        }
      );

      if (action) {
        e.preventDefault();
        if (action.type === 'toggle_play_pause') {
          void playbackRef.current.togglePlayPause();
        } else if (action.type === 'seek') {
          handleSeekRef.current(action.targetMs);
        } else if (action.type === 'step_speed') {
          const currentSpeed = playbackRef.current.speed;
          const currentIndex = SPEED_OPTIONS.findIndex((r) => Math.abs(r - currentSpeed) < 0.05);
          if (action.direction === 'up') {
            const nextIndex =
              currentIndex === -1 ? 2 : Math.min(SPEED_OPTIONS.length - 1, currentIndex + 1);
            void playbackRef.current.setSpeed(SPEED_OPTIONS[nextIndex]);
          } else {
            const prevIndex = currentIndex === -1 ? 2 : Math.max(0, currentIndex - 1);
            void playbackRef.current.setSpeed(SPEED_OPTIONS[prevIndex]);
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedTrack]);

  // Auto-follow playhead viewport during playback when zoomed in
  useEffect(() => {
    if (
      playback.state !== 'playing' ||
      zoomLevel <= 1.0 ||
      playheadPositionMs === null ||
      !selectedTrack
    ) {
      return;
    }

    const visibleDurationMs = selectedTrack.duration_ms / zoomLevel;
    const currentScrollOffset = useTrackState.getState().scrollOffsetMs;
    const rightThreshold = currentScrollOffset + visibleDurationMs * 0.85;
    const leftThreshold = currentScrollOffset;

    if (playheadPositionMs > rightThreshold || playheadPositionMs < leftThreshold) {
      // Keep playhead comfortably visible at ~20% into the viewport for forward context
      const targetOffset = playheadPositionMs - visibleDurationMs * 0.2;
      const clampedOffset = Math.max(
        0,
        Math.min(selectedTrack.duration_ms - visibleDurationMs, targetOffset)
      );
      setScrollOffsetMs(clampedOffset);
    }
  }, [
    playback.state,
    playheadPositionMs,
    zoomLevel,
    selectedTrack,
    setScrollOffsetMs,
  ]);

  if (!selectedTrack) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-[#080808] text-[#ededed] p-8 text-center select-none font-mono">
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-[#cccccc]">No Track Selected</h2>
        <p className="text-xs text-[#a8a8a8] max-w-sm mt-1.5 mb-6 font-sans">
          Select a track from your library to inspect its beat grid, 3-band waveform, cue points, and structural segments.
        </p>
        <button
          type="button"
          onClick={() => setRoute('library')}
          className="px-3.5 py-1.5 bg-[#181818] hover:bg-[#222222] text-[#ededed] text-xs font-mono uppercase tracking-wider border border-[#2b2b2b] transition-colors cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
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

  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');

  const customTitle = trackTitleOverrides[selectedTrack.id];
  const customArtist = trackArtistOverrides[selectedTrack.id];
  const displayTitle = getTrackDisplayTitle(selectedTrack, customTitle);
  const displayArtist = getTrackDisplayArtist(selectedTrack, customArtist);

  const startEditing = () => {
    setEditTitle(customTitle ?? displayTitle);
    setEditArtist(customArtist ?? (selectedTrack.tags.artist ?? ''));
    setIsEditingMetadata(true);
  };

  const saveEditing = () => {
    setTrackTitleOverride(selectedTrack.id, editTitle);
    setTrackArtistOverride(selectedTrack.id, editArtist);
    setIsEditingMetadata(false);
  };

  const resetToOriginal = () => {
    setTrackTitleOverride(selectedTrack.id, null);
    setTrackArtistOverride(selectedTrack.id, null);
    setIsEditingMetadata(false);
  };

  const cancelEditing = () => {
    setIsEditingMetadata(false);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#080808] text-[#ededed]">
      {/* ── Scrollable Track Inspection Area ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* ── Top Header Card ────────────────────────────────────────────────── */}
        <div className="p-4 bg-[#0a0a0a] border border-[#1c1c1c] flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-none">
          {isEditingMetadata ? (
            <div className="space-y-2.5 w-full max-w-xl bg-[#111111] p-3 border border-[#262626]">
              <div className="text-xs font-mono uppercase tracking-wider text-[#a8a8a8] flex items-center justify-between">
                <span>Edit In-App Track Metadata (Local Only)</span>
                <span className="text-[#a8a8a8] text-xs">Original audio file on disk will not be changed</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-xs font-mono text-[#a8a8a8] block mb-0.5">Track Title:</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Enter track title..."
                    className="w-full px-2.5 py-1 bg-[#090909] border border-[#2e2e2e] text-xs font-mono text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
                    data-testid="edit-title-input"
                    autoFocus
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-mono text-[#a8a8a8] block mb-0.5">Artist Name:</label>
                  <input
                    type="text"
                    value={editArtist}
                    onChange={(e) => setEditArtist(e.target.value)}
                    placeholder="Enter artist name..."
                    className="w-full px-2.5 py-1 bg-[#090909] border border-[#2e2e2e] text-xs font-mono text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
                    data-testid="edit-artist-input"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveEditing}
                  className="px-3 py-1 bg-[#38bdf8] text-black font-semibold text-xs font-mono uppercase tracking-wider hover:bg-[#7dd3fc] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                  data-testid="save-metadata-btn"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="px-3 py-1 bg-[#1a1a1a] hover:bg-[#252525] text-[#a8a8a8] hover:text-white border border-[#333333] text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                >
                  Cancel
                </button>
                {(customTitle || customArtist) && (
                  <button
                    type="button"
                    onClick={resetToOriginal}
                    className="px-3 py-1 bg-[#181818] hover:bg-[#222222] text-[#ef4444] border border-[#332222] text-xs font-mono uppercase tracking-wider transition-colors ml-auto cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                    title="Revert back to original tags / filename detection"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className="px-2 py-0.5 rounded-[2px] font-mono text-xs font-bold border border-black/30"
                  style={{ backgroundColor: bg, color: fg }}
                  data-testid="track-key-badge"
                >
                  {keyStr}
                </span>
                <h2 className="text-lg font-bold tracking-tight text-white truncate max-w-lg">
                  {displayTitle}
                </h2>
                {customTitle && (
                  <span
                    className="text-xs font-mono px-2 py-0.5 bg-[#1c2e3d] text-[#38bdf8] border border-[#234863]"
                    title="Custom in-app title override"
                  >
                    Custom Title
                  </span>
                )}
                <button
                  type="button"
                  onClick={startEditing}
                  className="px-2.5 py-1 bg-[#141414] hover:bg-[#1f1f1f] text-[#a8a8a8] hover:text-white border border-[#2a2a2a] text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                  title="Edit in-app title and artist"
                  data-testid="edit-track-metadata-btn"
                >
                  Edit Info
                </button>
              </div>
              <p className="text-xs text-[#a8a8a8] flex items-center gap-1.5 flex-wrap">
                <span>{displayArtist}</span>
                {customArtist && (
                  <span className="text-xs font-mono px-1.5 py-0.5 bg-[#1c2e3d] text-[#38bdf8] border border-[#234863]">
                    Custom Artist
                  </span>
                )}
                <span>•</span>
                <span>{selectedTrack.tags.album ?? 'Single / Unassigned'}</span>
              </p>
              <p className="text-xs font-mono text-[#a8a8a8] truncate max-w-xl">
                {selectedTrack.path}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={inSetlist}
              onClick={() => void addToSetlist(selectedTrack.id)}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer border rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none ${
                inSetlist
                  ? 'bg-[#111111] text-[#a8a8a8] border-[#222222] cursor-default'
                  : 'bg-[#181818] hover:bg-[#242424] text-white border-[#2b2b2b]'
              }`}
            >
              {inSetlist ? '✓ In Active Setlist' : '+ Add to Setlist'}
            </button>
            <button
              type="button"
              onClick={() => setRoute('library')}
              className="px-3 py-1.5 bg-[#101010] hover:bg-[#1a1a1a] text-[#a8a8a8] hover:text-white text-xs font-mono uppercase tracking-wider border border-[#222222] transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
            >
              Back to Library
            </button>
          </div>
        </div>

      {/* ── Metrics Row (Key, BPM, Energy, Loudness) ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" data-testid="track-metrics-row">
        {/* BPM */}
        <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#a8a8a8]">
            Tempo (BPM)
          </div>
          <div className="text-xl font-mono font-bold text-white mt-0.5 tabular-nums" data-testid="track-bpm-value">
            {analysis?.rhythm.grid.bpm.toFixed(1) ?? '—'}
          </div>
          <div className="text-xs font-mono text-[#a8a8a8] mt-0.5">
            {analysis?.rhythm.grid.steady ? 'Steady grid' : 'Variable tempo'}
          </div>
        </div>

        {/* Camelot Key & Tuning */}
        <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#a8a8a8]">
            Key & Mode
          </div>
          <div className="text-xl font-mono font-bold text-white mt-0.5 flex items-center gap-2">
            <span>{keyStr}</span>
            <span className="text-xs font-normal text-[#a8a8a8]">({analysis?.key.mode ?? '—'})</span>
          </div>
          <div className="text-xs font-mono text-[#a8a8a8] mt-0.5">
            {analysis?.key.tuning_cents !== undefined
              ? `${analysis.key.tuning_cents > 0 ? '+' : ''}${analysis.key.tuning_cents.toFixed(1)} cents`
              : '440.0 Hz'}
          </div>
        </div>

        {/* Energy Rating */}
        <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#a8a8a8]">
            Energy Rating
          </div>
          <div className="text-xl font-mono font-bold text-[#ededed] mt-0.5" data-testid="track-energy-value">
            {analysis?.energy_score ?? '—'}<span className="text-xs text-[#a8a8a8] font-sans">/10</span>
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
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#a8a8a8]">
            Loudness
          </div>
          <div className="text-xl font-mono font-bold text-white mt-0.5 tabular-nums">
            {analysis?.loudness.integrated_lufs.toFixed(1) ?? '—'}{' '}
            <span className="text-xs font-normal text-[#a8a8a8]">LUFS</span>
          </div>
          <div className="text-xs font-mono text-[#a8a8a8] mt-0.5">
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
          isPlaying={playback.state === 'playing'}
          onTogglePlayPause={playback.togglePlayPause}
          onZoomChange={setZoomLevel}
          onScrollChange={setScrollOffsetMs}
          onSetPlayhead={handleSeek}
        />
      )}

      {/* ── Playhead Scrubbing Status Bar ──────────────────────────────────── */}
      <div className="p-2.5 bg-[#0a0a0a] border border-[#1c1c1c] flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#38bdf8]" />
            <span className="text-[#a8a8a8]">PLAYHEAD:</span>
            <span className="font-bold text-[#ededed]">{formatTimeMs(playheadPositionMs ?? 0)}</span>
          </div>

          {activeSegment && (
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5"
                style={{ backgroundColor: SEGMENT_COLORS[activeSegment.label.toLowerCase()] }}
              />
              <span className="text-[#a8a8a8]">SECTION:</span>
              <span className="font-bold text-white uppercase">{activeSegment.label}</span>
            </div>
          )}

          {activeBeat && (
            <div className="hidden sm:flex items-center gap-1.5 text-[#a8a8a8]">
              <span>BEAT:</span>
              <span className="text-[#ededed]">#{activeBeat.index}</span>
              {activeBeat.isDownbeat && (
                <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-[#142332] text-[#38bdf8] border border-[#1e3a5f]">
                  DOWNBEAT
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleJumpAndSeek(0)}
            className="px-2.5 py-1 bg-[#141414] hover:bg-[#1e1e1e] text-[#a8a8a8] hover:text-white border border-[#27272a] text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
          >
            Jump to Start (0:00)
          </button>
        </div>
      </div>

      {/* ── Cue Points Registers A to H ────────────────────────────────────── */}
      <div className="p-4 bg-[#0a0a0a] border border-[#1c1c1c] space-y-3">
        <div className="flex items-center justify-between border-b border-[#181818] pb-2">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#cfcfcf]">
            Cue Points (Registers A – H)
          </h3>
          <span className="text-xs font-mono text-[#a8a8a8]">
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
                onClick={() => handleJumpAndSeek(cue.time_ms)}
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
                  <div className="font-mono text-xs text-[#4ade80] mt-0.5">
                    {formatTimeMs(cue.time_ms)}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs text-[#a8a8a8] uppercase font-mono px-1.5 py-0.5 bg-[#141414] border border-[#222222]">
                      {cue.kind}
                    </span>
                    {cue.loop_end_ms && (
                      <span className="text-xs text-[#22d3ee] font-mono">
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
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#cfcfcf] border-b border-[#181818] pb-2">
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
                onClick={() => handleJumpAndSeek(seg.start_ms)}
                className="h-full flex items-center justify-center text-xs font-mono font-bold text-white uppercase tracking-wider overflow-hidden px-1 border-r border-[#000000]/60 transition-opacity hover:opacity-80 cursor-pointer"
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
              onClick={() => handleJumpAndSeek(seg.start_ms)}
              className="p-2 bg-[#0e0e0e] border border-[#1c1c1c] text-xs flex flex-col gap-0.5 hover:border-[#2a2a2a] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 font-mono font-semibold text-[#ededed] uppercase text-xs">
                <span
                  className="w-1.5 h-1.5"
                  style={{ backgroundColor: SEGMENT_COLORS[seg.label.toLowerCase()] }}
                />
                {seg.label}
              </div>
              <div className="font-mono text-xs text-[#a8a8a8]">
                {formatTimeMs(seg.start_ms)}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* ── Permanently Docked Bottom Transport Bar ────────────────────────── */}
      <div className="shrink-0 p-3 bg-[#0a0a0a]/98 backdrop-blur-md border-t border-[#242424] shadow-[0_-8px_24px_rgba(0,0,0,0.9)] z-30">
        <PlaybackBar
          state={playback.state}
          positionMs={playheadPositionMs ?? playback.positionMs}
          durationMs={selectedTrack.duration_ms}
          clickEnabled={playback.clickEnabled}
          speed={playback.speed}
          onPlay={playback.play}
          onPause={playback.pause}
          onSeek={handleSeek}
          onToggleClick={playback.toggleClick}
          onSetSpeed={playback.setSpeed}
        />
      </div>
    </div>
  );
};
