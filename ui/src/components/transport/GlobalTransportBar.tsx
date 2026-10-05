import React, { useEffect, useState } from 'react';
import { Play, Pause, Square, ExternalLink, Volume2, Volume1, VolumeX } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { formatDuration } from '../../features/stage/usePerformanceClock';
import { getTrackCamelotKey } from '../../features/library/filters';
import { getTrackDisplayTitle, getTrackDisplayArtist } from '../../utils/trackDisplay';
import { getPlaybackClient } from '../../api/playback';
import { Button, ToggleKey, Segmented, Readout, KeyTile } from '../ui';

export const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;

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

  // Active position event listener for reliable playhead tracking
  useEffect(() => {
    if (!auditionTrackId || auditionState === 'stopped') return;
    const client = getPlaybackClient();
    const unsubscribe = client.onPosition((payload) => {
      syncAuditionPosition(payload);
    });
    return () => {
      unsubscribe();
    };
  }, [auditionTrackId, auditionState, syncAuditionPosition]);

  if (!auditionTrackId || auditionState === 'stopped') {
    return null;
  }

  const track = tracks.find((t) => t.id === auditionTrackId) ?? null;
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

  const speedOptions = SPEED_PRESETS.map((rate) => ({
    value: rate,
    label: `${rate}x`,
  }));

  return (
    <aside
      className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface-panel)] border-t border-[var(--surface-hairline)] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono select-none"
      data-testid="global-transport-bar"
      aria-label="Global Audio Transport"
    >
      {/* ── Left: Track Metadata, Camelot Key, BPM ── */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[var(--surface-app)] border border-[var(--surface-hairline)] rounded-[2px] shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-[1px] led-instant shrink-0 ${
              isPlaying ? 'bg-[var(--accent)]' : 'bg-[var(--surface-strong)]'
            }`}
            aria-hidden="true"
          />
          <span className="text-xs font-mono font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            AUDITION
          </span>
        </div>

        <div className="flex items-center gap-2 truncate max-w-xs md:max-w-md">
          <span className="font-semibold text-[var(--text-primary)] truncate text-xs" title={displayTitle}>
            {displayTitle}
          </span>
          <span className="text-[var(--text-muted)] text-xs shrink-0">by</span>
          <span className="text-[var(--text-secondary)] text-xs truncate" title={displayArtist}>
            {displayArtist}
          </span>
        </div>

        {camelotKey && <KeyTile camelotKey={camelotKey} size="sm" />}

        {bpm !== null && (
          <Readout caption="BPM" value={bpm.toFixed(1)} size="sm" className="hidden sm:inline-flex" />
        )}
      </div>

      {/* ── Center: Transport Controls & Scrubber ── */}
      <div className="flex items-center gap-3">
        <ToggleKey
          active={isPlaying}
          ledColor="accent"
          size="md"
          data-testid="global-play-pause-btn"
          title={isPlaying ? 'Pause audition' : 'Play audition'}
          aria-label={isPlaying ? 'Pause audition' : 'Play audition'}
          icon={isPlaying ? <Pause size={12} className="shrink-0" /> : <Play size={12} className="shrink-0" />}
          label={isPlaying ? 'Pause' : 'Play'}
          onToggle={() => void toggleAudition(auditionTrackId)}
        />

        <Readout
          caption="PLAYHEAD"
          value={`${formatDuration(auditionPositionMs)} / ${formatDuration(auditionDurationMs)}`}
          size="sm"
          className="min-w-[110px]"
        />

        <input
          type="range"
          min={0}
          max={Math.max(1, auditionDurationMs)}
          value={Math.min(auditionPositionMs, auditionDurationMs)}
          onChange={(e) => void seekAudition(Number(e.target.value))}
          className="w-28 sm:w-44 md:w-56 h-1 bg-[var(--surface-hairline)] appearance-none cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--surface-raised)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[var(--accent)] [&::-webkit-slider-thumb]:rounded-[1px] [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-[var(--surface-raised)] [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[var(--accent)] [&::-moz-range-thumb]:rounded-[1px]"
          aria-label="Audition playback position"
          data-testid="global-position-scrubber"
        />
      </div>

      {/* ── Right: Speed Presets, Volume, Inspect & Stop ── */}
      <div className="flex items-center gap-2.5">
        {/* Speed Segmented Control */}
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-[0.08em] silkscreen">
            SPEED:
          </span>
          <Segmented
            options={speedOptions}
            value={auditionSpeed}
            onChange={(val) => void setAuditionSpeed(val as number)}
            size="sm"
            ariaLabel="Audition playback speed"
          />
        </div>

        {/* Master Volume Control */}
        <div
          className="flex items-center gap-1.5 bg-[var(--surface-app)] px-2 py-1 border border-[var(--surface-hairline)] rounded-[2px]"
          data-testid="global-volume-container"
        >
          <button
            type="button"
            onClick={() => void handleToggleMute()}
            className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors cursor-pointer text-xs focus-visible:outline-2 focus-visible:outline-[var(--accent)] p-0.5 rounded-[1px]"
            title={masterVolume === 0 ? 'Unmute' : 'Mute'}
            aria-label={masterVolume === 0 ? 'Unmute volume' : 'Mute volume'}
            data-testid="global-volume-mute-btn"
          >
            {masterVolume === 0 ? (
              <VolumeX size={13} className="shrink-0" />
            ) : masterVolume < 0.5 ? (
              <Volume1 size={13} className="shrink-0" />
            ) : (
              <Volume2 size={13} className="shrink-0" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => void setMasterVolume(Number(e.target.value))}
            className="w-14 sm:w-18 h-1 bg-[var(--surface-hairline)] appearance-none cursor-pointer rounded-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-[var(--surface-raised)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[var(--surface-strong)] [&::-webkit-slider-thumb]:rounded-[1px] [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:bg-[var(--surface-raised)] [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[var(--surface-strong)] [&::-moz-range-thumb]:rounded-[1px]"
            aria-label="Master volume"
            data-testid="global-volume-slider"
          />
          <span className="text-xs text-[var(--text-muted)] tabular-nums font-mono w-7 text-right">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleInspect}
          icon={<ExternalLink size={12} className="shrink-0" />}
          data-testid="global-inspect-btn"
          title="Open detailed track inspector with waveform"
        >
          Inspect
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void stopAudition()}
          icon={<Square size={10} fill="currentColor" className="shrink-0" />}
          data-testid="global-stop-btn"
          title="Stop audition"
        >
          Stop
        </Button>
      </div>
    </aside>
  );
};

export default GlobalTransportBar;
