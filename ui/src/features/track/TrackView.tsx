import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { WaveformContainer, formatTimeMs } from '../../components/waveform';
import { useTrackState } from './useTrackState';
import { usePlayback } from './usePlayback';
import { PlaybackBar, SPEED_OPTIONS } from './PlaybackBar';
import { handleTrackKeyDown } from './playbackMath';
import { FourPointCueDeck } from './cues/FourPointCueDeck';
import { resolveFourPointCues, type PerformanceCueSlot } from './cues/fourPointCues';
import { isFieldOverridden } from './overrides/EditedBadge';
import { TrackHeader } from './TrackHeader';
import { TrackTelemetryStrip } from './TrackTelemetryStrip';

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
  } = useAppStore(
    useShallow((s) => ({
      selectedTrack: s.selectedTrack,
      setRoute: s.setRoute,
      addToSetlist: s.addToSetlist,
      setlist: s.setlist,
      trackTitleOverrides: s.trackTitleOverrides,
      trackArtistOverrides: s.trackArtistOverrides,
      setTrackTitleOverride: s.setTrackTitleOverride,
      setTrackArtistOverride: s.setTrackArtistOverride,
    }))
  );
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
        } else if (action.type === 'jump_cue') {
          const slots: PerformanceCueSlot[] = ['A', 'B', 'C', 'D'];
          const fourPointCues = resolveFourPointCues(selectedTrack);
          const slot = slots[action.cueIndex];
          const resolvedCue = slot ? fourPointCues[slot] : null;
          if (resolvedCue) {
            handleJumpAndSeekRef.current(resolvedCue.timeMs);
          } else {
            const targetCue = selectedTrack.analysis?.cue_points.find(
              (c) => c.index === action.cueIndex
            );
            if (targetCue) {
              handleJumpAndSeekRef.current(targetCue.time_ms);
            }
          }
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
      <div className="flex-1 flex flex-col items-center justify-center h-full w-full bg-surface-deep text-content-primary p-8 text-center select-none font-mono">
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-content-secondary">No Track Selected</h2>
        <p className="text-xs text-content-muted max-w-sm mt-1.5 mb-6 font-sans">
          Select a track from your library to inspect its beat grid, 3-band waveform, cue points, and structural segments.
        </p>
        <button
          type="button"
          onClick={() => setRoute('library')}
          className="px-3.5 py-1.5 bg-surface-elevated hover:bg-surface-hover text-content-primary text-xs font-mono uppercase tracking-wider border border-border-base transition-colors cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
        >
          Browse Library
        </button>
      </div>
    );
  }

  const analysis = selectedTrack.analysis;
  const camelot = analysis?.key.camelot;
  const keyStr = camelot ? `${camelot.number}${camelot.letter}` : '-';
  const bg = camelot ? camelotColor(camelot) : '#22222a';
  const fg = camelot ? camelotTextColor(camelot) : '#9898a4';
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

  const customTitle = trackTitleOverrides[selectedTrack.id];
  const customArtist = trackArtistOverrides[selectedTrack.id];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-deep text-content-primary">
      {/* ── Scrollable Track Inspection Area ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* ── Top Header Card ────────────────────────────────────────────────── */}
        <TrackHeader
          selectedTrack={selectedTrack}
          inSetlist={inSetlist}
          customTitle={customTitle}
          customArtist={customArtist}
          onAddToSetlist={() => void addToSetlist(selectedTrack.id)}
          onBackToLibrary={() => setRoute('library')}
          onSaveMetadata={(title, artist) => {
            setTrackTitleOverride(selectedTrack.id, title);
            setTrackArtistOverride(selectedTrack.id, artist);
          }}
          onResetMetadata={() => {
            setTrackTitleOverride(selectedTrack.id, null);
            setTrackArtistOverride(selectedTrack.id, null);
          }}
          bg={bg}
          fg={fg}
          keyStr={keyStr}
        />

        {/* ── Studio Hardware Telemetry Strip (Tempo, Key, Energy, Loudness) ──── */}
        <TrackTelemetryStrip analysis={analysis} keyStr={keyStr} />

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
          isCuesOverridden={isFieldOverridden(selectedTrack, 'cues')}
        />
      )}

      {/* ── Playhead Scrubbing Status Bar ──────────────────────────────────── */}
      <div className="p-2.5 bg-surface-panel border border-border-subtle flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-accent-blue" />
            <span className="text-content-muted">PLAYHEAD:</span>
            <span className="font-bold text-content-primary">{formatTimeMs(playheadPositionMs ?? 0)}</span>
          </div>

          {activeSegment && (
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5"
                style={{ backgroundColor: SEGMENT_COLORS[activeSegment.label.toLowerCase()] }}
              />
              <span className="text-content-muted">SECTION:</span>
              <span className="font-bold text-white uppercase">{activeSegment.label}</span>
            </div>
          )}

          {activeBeat && (
            <div className="hidden sm:flex items-center gap-1.5 text-content-muted">
              <span>BEAT:</span>
              <span className="text-content-primary">#{activeBeat.index}</span>
              {activeBeat.isDownbeat && (
                <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-accent-blue-subtle text-accent-blue border border-accent-blue-dim">
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
            className="px-2.5 py-1 bg-surface-raised hover:bg-surface-elevated text-content-muted hover:text-white border border-border-base text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
          >
            Jump to Start (0:00)
          </button>
        </div>
      </div>

      {/* ── Hardware Performance Cue Deck (Standard A – D) ────────────────── */}
      <FourPointCueDeck
        track={selectedTrack}
        playheadPositionMs={playheadPositionMs}
        isPlaying={playback.state === 'playing'}
        onJumpToCue={(timeMs, autoPlay) => {
          handleJumpAndSeek(timeMs);
          if (autoPlay && playback.state !== 'playing') {
            void playback.play();
          }
        }}
      />

      {/* ── Structural Segments Timeline ────────────────────────────────────── */}
      <div className="p-4 bg-surface-panel border border-border-subtle space-y-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-content-secondary border-b border-border-subtle pb-2">
          Structural Segments
        </h3>

        {/* Timeline Bar */}
        <div className="w-full h-7 bg-surface-deep flex border border-border-base overflow-hidden">
          {analysis?.segments.map((seg, idx) => {
            const segDuration = seg.end_ms - seg.start_ms;
            const pct = Math.max(1, (segDuration / selectedTrack.duration_ms) * 100);
            const color = SEGMENT_COLORS[seg.label.toLowerCase()] ?? '#64748b';

            return (
              <div
                key={idx}
                onClick={() => handleJumpAndSeek(seg.start_ms)}
                className="h-full flex items-center justify-center text-xs font-mono font-bold text-white uppercase tracking-wider overflow-hidden px-1 border-r border-border-subtle/60 transition-opacity hover:opacity-80 cursor-pointer"
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
              className="p-2 bg-surface-panel border border-border-subtle text-xs flex flex-col gap-0.5 hover:border-border-base cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5 font-mono font-semibold text-content-primary uppercase text-xs">
                <span
                  className="w-1.5 h-1.5"
                  style={{ backgroundColor: SEGMENT_COLORS[seg.label.toLowerCase()] }}
                />
                {seg.label}
              </div>
              <div className="font-mono text-xs text-content-muted">
                {formatTimeMs(seg.start_ms)}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* ── Permanently Docked Bottom Transport Bar ────────────────────────── */}
      <div className="shrink-0 p-3 bg-surface-panel/98 backdrop-blur-md border-t border-border-base shadow-[0_-8px_24px_rgba(0,0,0,0.9)] z-30">
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
