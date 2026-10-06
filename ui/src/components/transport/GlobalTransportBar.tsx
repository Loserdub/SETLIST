import React, { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { formatDuration } from '../../features/stage/usePerformanceClock';
import { getTrackCamelotKey } from '../../features/library/filters';
import { getTrackDisplayTitle, getTrackDisplayArtist } from '../../utils/trackDisplay';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { getPlaybackClient, type PlaybackPositionPayload } from '../../api/playback';
import {
  IconPlay,
  IconPause,
  IconStop,
  IconPrev,
  IconExternalLink,
} from '../icons/Icons';

export const SPEED_PRESETS = [0.8, 1.0, 1.2] as const;

export const GlobalTransportBar: React.FC = () => {
  const auditionTrackId = useAppStore((s) => s.auditionTrackId);
  const auditionState = useAppStore((s) => s.auditionState);
  const auditionPositionMs = useAppStore((s) => s.auditionPositionMs);
  const auditionDurationMs = useAppStore((s) => s.auditionDurationMs);
  const auditionSpeed = useAppStore((s) => s.auditionSpeed);
  const masterVolume = useAppStore((s) => s.masterVolume);
  const setMasterVolume = useAppStore((s) => s.setMasterVolume);
  const trackTitleOverrides = useAppStore((s) => s.trackTitleOverrides);
  const trackArtistOverrides = useAppStore((s) => s.trackArtistOverrides);
  const toggleAudition = useAppStore((s) => s.toggleAudition);
  const seekAudition = useAppStore((s) => s.seekAudition);
  const setAuditionSpeed = useAppStore((s) => s.setAuditionSpeed);
  const stopAudition = useAppStore((s) => s.stopAudition);
  const syncAuditionPosition = useAppStore((s) => s.syncAuditionPosition);
  const tracks = useAppStore((s) => s.tracks);
  const selectTrack = useAppStore((s) => s.selectTrack);
  const setRoute = useAppStore((s) => s.setRoute);

  const [prevVolume, setPrevVolume] = useState(1.0);
  const [clickEnabled, setClickEnabled] = useState(false);
  const [hoverTimeMs, setHoverTimeMs] = useState<number | null>(null);

  // Active position event listener for reliable playhead tracking with requestAnimationFrame batching
  useEffect(() => {
    if (!auditionTrackId || auditionState === 'stopped') return;
    const client = getPlaybackClient();
    let pendingPayload: PlaybackPositionPayload | null = null;
    let rafId: number | null = null;

    const flush = () => {
      if (pendingPayload) {
        syncAuditionPosition(pendingPayload);
        pendingPayload = null;
      }
      rafId = null;
    };

    const unsubscribe = client.onPosition((payload) => {
      pendingPayload = payload;
      if (payload.state === 'stopped' || payload.state !== auditionState) {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        syncAuditionPosition(payload);
        pendingPayload = null;
        return;
      }
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
      }
    });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      unsubscribe();
    };
  }, [auditionTrackId, auditionState, syncAuditionPosition]);

  const track = useMemo(
    () => (auditionTrackId ? tracks.find((t) => t.id === auditionTrackId) ?? null : null),
    [tracks, auditionTrackId]
  );

  if (!auditionTrackId || auditionState === 'stopped') {
    return null;
  }

  const isPlaying = auditionState === 'playing';
  const camelotKey = track ? getTrackCamelotKey(track) : null;
  const bpm = track?.analysis?.rhythm.grid.bpm ?? null;

  const displayTitle = getTrackDisplayTitle(
    track,
    auditionTrackId ? trackTitleOverrides[auditionTrackId] : null
  );
  const displayArtist = getTrackDisplayArtist(
    track,
    auditionTrackId ? trackArtistOverrides[auditionTrackId] : null
  );

  const handleInspect = () => {
    selectTrack(auditionTrackId);
    setRoute('track');
  };

  const handleToggleMute = async () => {
    if (masterVolume > 0) {
      setPrevVolume(masterVolume);
      await setMasterVolume(0);
    } else {
      await setMasterVolume(prevVolume > 0 ? prevVolume : 1.0);
    }
  };

  const handleToggleClick = async () => {
    const next = !clickEnabled;
    setClickEnabled(next);
    const client = getPlaybackClient();
    await client.setClick(next);
  };

  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTimeMs(Math.round(ratio * auditionDurationMs));
  };

  const handleScrubberMouseLeave = () => {
    setHoverTimeMs(null);
  };

  const progressPercent =
    auditionDurationMs > 0
      ? Math.min(100, Math.max(0, (auditionPositionMs / auditionDurationMs) * 100))
      : 0;

  return (
    <aside
      className="fixed bottom-0 left-56 right-0 h-14 bg-surface-panel border-t border-border-subtle z-40 px-4 flex items-center justify-between gap-3 text-xs font-mono select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      data-testid="global-transport-bar"
      aria-label="Global Audio Transport"
    >
      {/* ── 1. Track Readout: Title, Artist, Camelot Key, BPM ── */}
      <div className="flex items-center gap-2.5 min-w-0 max-w-[28%] shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-raised border border-border-base rounded-[2px] shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-[1px] shrink-0 ${
              isPlaying ? 'bg-accent-amber shadow-[0_0_6px_rgba(245,158,11,0.6)]' : 'bg-accent-amber-hover'
            }`}
            aria-hidden="true"
          />
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-content-muted">
            AUDITION
          </span>
        </div>

        <div className="flex items-center gap-1.5 truncate min-w-0">
          <span
            className="font-semibold text-white truncate text-xs"
            title={displayTitle}
          >
            {displayTitle}
          </span>
          <span className="text-content-dim text-xs shrink-0">by</span>
          <span
            className="text-content-muted text-xs truncate"
            title={displayArtist}
          >
            {displayArtist}
          </span>
        </div>

        {camelotKey && (
          <span
            className="px-1.5 py-0.5 text-[11px] font-bold rounded-[2px] shrink-0 font-mono tracking-wider border border-black/20"
            style={{
              backgroundColor: camelotColor(camelotKey),
              color: camelotTextColor(camelotKey),
            }}
            title={`Camelot key ${camelotKey}`}
          >
            {camelotKey}
          </span>
        )}

        {bpm !== null && (
          <span
            className="text-xs text-content-muted font-mono shrink-0 hidden sm:inline"
            title={`${bpm.toFixed(1)} BPM`}
          >
            {bpm.toFixed(1)} <span className="text-content-muted text-[11px] uppercase tracking-wider">BPM</span>
          </span>
        )}
      </div>

      {/* ── 2. Transport Deck & 3. Interactive Scrub Bar ── */}
      <div className="flex items-center gap-3 flex-1 max-w-xl min-w-0 px-2">
        {/* Rewind (⏮) */}
        <button
          type="button"
          onClick={() => void seekAudition(0)}
          className="hw-btn p-1.5 bg-surface-raised hover:bg-surface-hover text-content-muted hover:text-white border border-border-base rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:translate-y-[1px] cursor-pointer"
          title="Rewind to start (0:00)"
          aria-label="Rewind to start"
          data-testid="global-rewind-btn"
        >
          <IconPrev size={12} className="shrink-0" />
        </button>

        {/* Play/Pause (▶ / ⏸) */}
        <button
          type="button"
          onClick={() => void toggleAudition(auditionTrackId)}
          className={`hw-btn flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider rounded-[2px] border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:translate-y-[1px] ${
            isPlaying
              ? 'bg-accent-amber-subtle text-accent-amber border-accent-amber'
              : 'bg-surface-elevated text-white hover:bg-surface-hover border-border-base'
          }`}
          data-testid="global-play-pause-btn"
          title={isPlaying ? 'Pause audition' : 'Play audition'}
          aria-label={isPlaying ? 'Pause audition' : 'Play audition'}
        >
          {isPlaying ? (
            <IconPause size={12} className="shrink-0" />
          ) : (
            <IconPlay size={12} className="shrink-0" />
          )}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        {/* Stop (⏹) */}
        <button
          type="button"
          onClick={() => void stopAudition()}
          className="hw-btn p-1.5 bg-surface-raised hover:bg-surface-hover text-content-muted hover:text-red-400 border border-border-base rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:translate-y-[1px] cursor-pointer"
          data-testid="global-stop-btn"
          title="Stop audition"
          aria-label="Stop audition"
        >
          <IconStop size={12} className="shrink-0" />
        </button>

        {/* Interactive Scrub Bar with hover timestamp */}
        <div
          className="flex-1 flex flex-col justify-center min-w-[120px] relative group"
          onMouseMove={handleScrubberMouseMove}
          onMouseLeave={handleScrubberMouseLeave}
        >
          <div className="flex items-center justify-between text-xs font-mono text-content-muted mb-1 tabular-nums">
            <span className="text-white font-medium">
              {formatDuration(auditionPositionMs)}
            </span>
            {hoverTimeMs !== null && (
              <span className="text-amber-400 font-semibold absolute left-1/2 -translate-x-1/2 -top-3.5 bg-surface-raised px-1 py-0.5 border border-border-base text-[11px] font-mono rounded-[1px] shadow-sm pointer-events-none">
                {formatDuration(hoverTimeMs)}
              </span>
            )}
            <span className="text-content-dim">
              {formatDuration(auditionDurationMs)}
            </span>
          </div>

          <div className="relative h-2 w-full flex items-center">
            {/* Visual buffered / progress background */}
            <div className="absolute inset-y-0.5 inset-x-0 bg-surface-elevated rounded-none overflow-hidden pointer-events-none">
              <div
                className="h-full bg-amber-500/80 transition-[width] duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* Range input for accessible and mouse drag scrubbing */}
            <input
              type="range"
              min={0}
              max={Math.max(1, auditionDurationMs)}
              value={Math.min(auditionPositionMs, auditionDurationMs)}
              onChange={(e) => void seekAudition(Number(e.target.value))}
              className="w-full h-full opacity-0 absolute inset-0 cursor-pointer z-10"
              aria-label="Audition playback position"
              data-testid="global-position-scrubber"
            />
          </div>
        </div>
      </div>

      {/* ── 4. Metronome Click, 5. Speed Multiplier, 6. Master Volume, Inspect ── */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Metronome Click Toggle */}
        <button
          type="button"
          onClick={() => void handleToggleClick()}
          className={`hw-btn flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono uppercase tracking-wider rounded-[2px] border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:translate-y-[1px] ${
            clickEnabled
              ? 'bg-accent-amber-subtle text-accent-amber border-accent-amber'
              : 'bg-surface-raised hover:bg-surface-elevated text-content-muted border-border-base'
          }`}
          data-testid="global-click-toggle"
          title="Toggle beat click metronome"
          aria-label="Toggle beat click metronome"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              clickEnabled ? 'bg-accent-amber shadow-[0_0_4px_rgba(245,158,11,0.6)]' : 'bg-content-dim'
            }`}
          />
          <span>CLICK</span>
        </button>

        {/* Speed Multiplier Pills */}
        <div
          className="hidden md:flex items-center gap-1 bg-surface-raised p-0.5 border border-border-base rounded-[2px]"
          data-testid="global-speed-controls"
        >
          {SPEED_PRESETS.map((rate) => {
            const isActive = Math.abs(auditionSpeed - rate) < 0.01;
            return (
              <button
                key={rate}
                type="button"
                onClick={() => void setAuditionSpeed(rate)}
                className={`hw-btn px-1.5 py-0.5 text-[11px] font-mono tracking-wider rounded-[1px] border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 active:translate-y-[1px] ${
                  isActive
                    ? 'bg-accent-amber-subtle text-accent-amber border-accent-amber font-bold'
                    : 'bg-transparent hover:bg-surface-elevated text-content-muted border-transparent'
                }`}
                data-testid={`global-speed-${rate}`}
                title={`Set speed to ${rate}x`}
              >
                {rate.toFixed(1)}x
              </button>
            );
          })}
        </div>

        {/* Master Volume Fader */}
        <div
          className="flex items-center gap-1.5 bg-surface-raised px-2 py-1 border border-border-base rounded-[2px]"
          data-testid="global-volume-container"
        >
          <button
            type="button"
            onClick={() => void handleToggleMute()}
            className="text-content-muted hover:text-accent-amber transition-colors cursor-pointer text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 p-0.5"
            title={masterVolume === 0 ? 'Unmute volume' : 'Mute volume'}
            aria-label={masterVolume === 0 ? 'Unmute volume' : 'Mute volume'}
            data-testid="global-volume-mute-btn"
          >
            {masterVolume === 0 ? '🔇' : masterVolume < 0.5 ? '🔉' : '🔊'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => void setMasterVolume(Number(e.target.value))}
            className="w-14 sm:w-20 h-1 bg-surface-elevated accent-amber-500 cursor-pointer"
            aria-label="Master volume"
            data-testid="global-volume-slider"
          />
          <span className="text-xs text-content-muted tabular-nums font-mono w-7 text-right">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>

        {/* Inspect in Track View Button */}
        <button
          type="button"
          onClick={handleInspect}
          className="hw-btn flex items-center gap-1 px-2.5 py-1 text-xs font-mono uppercase tracking-wider bg-surface-raised hover:bg-surface-elevated text-content-muted hover:text-white border border-border-base rounded-[2px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:translate-y-[1px]"
          data-testid="global-inspect-btn"
          title="Open track detail view"
        >
          <IconExternalLink size={12} className="shrink-0" />
          <span className="hidden xl:inline">INSPECT</span>
        </button>
      </div>
    </aside>
  );
};

export default GlobalTransportBar;
