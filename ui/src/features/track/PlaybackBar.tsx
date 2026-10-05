import React from 'react';
import type { PlayerState } from '../../api/playback';
import { formatTimeMs } from '../../components/waveform';
import { useAppStore } from '../../store/useAppStore';

export const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;

export interface PlaybackBarProps {
  state: PlayerState;
  positionMs: number;
  durationMs: number;
  clickEnabled: boolean;
  speed?: number;
  volume?: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (positionMs: number) => void;
  onToggleClick: () => void;
  onSetSpeed?: (speed: number) => void;
  onSetVolume?: (volume: number) => void;
  className?: string;
}

export const PlaybackBar: React.FC<PlaybackBarProps> = ({
  state,
  positionMs,
  durationMs,
  clickEnabled,
  speed = 1.0,
  volume,
  onPlay,
  onPause,
  onSeek,
  onToggleClick,
  onSetSpeed,
  onSetVolume,
  className = '',
}) => {
  const storeVolume = useAppStore((s) => s.masterVolume);
  const storeSetVolume = useAppStore((s) => s.setMasterVolume);
  const currentVolume = volume ?? storeVolume;
  const handleVolumeChange = onSetVolume ?? storeSetVolume;

  const [prevVolume, setPrevVolume] = React.useState(1.0);

  const toggleMute = () => {
    if (currentVolume > 0) {
      setPrevVolume(currentVolume);
      void handleVolumeChange(0);
    } else {
      void handleVolumeChange(prevVolume > 0 ? prevVolume : 1.0);
    }
  };

  const isPlaying = state === 'playing';

  const handlePlayPause = () => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  const handleSeekDelta = (deltaMs: number) => {
    onSeek(Math.max(0, Math.min(durationMs, positionMs + deltaMs)));
  };

  return (
    <div
      className={`p-3 bg-[#0a0a0d] border border-[#191922] flex flex-wrap items-center justify-between gap-4 select-none ${className}`}
      data-testid="playback-bar"
    >
      {/* ── Left Section: Transport & Time Readout ─────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Play / Pause Toggle Button */}
        <button
          type="button"
          onClick={handlePlayPause}
          className={`hw-btn flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none active:translate-y-[1px] ${
            isPlaying
              ? 'bg-[#1e3a5f] hover:bg-[#254b7a] text-[#38bdf8] border-[#38bdf8]'
              : 'bg-[#141418] hover:bg-[#202026] text-white border-[#272732]'
          }`}
          data-testid="playback-play-pause-btn"
          title={isPlaying ? 'Pause [Space]' : 'Play [Space]'}
        >
          {isPlaying ? (
            <>
              <span className="text-sm leading-none">⏸</span>
              <span>PAUSE</span>
            </>
          ) : (
            <>
              <span className="text-sm leading-none">▶</span>
              <span>PLAY</span>
            </>
          )}
        </button>

        {/* Quick Jump to Start */}
        <button
          type="button"
          onClick={() => onSeek(0)}
          className="hw-btn px-2.5 py-1.5 bg-[#111114] hover:bg-[#1a1a1e] text-[#a1a1aa] hover:text-white border border-[#22222c] font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none active:translate-y-[1px]"
          title="Jump to Start (0:00)"
          data-testid="playback-jump-start-btn"
        >
          ⏮ 0:00
        </button>

        {/* Seek Backward 5s */}
        <button
          type="button"
          onClick={() => handleSeekDelta(-5000)}
          className="hw-btn px-2.5 py-1.5 bg-[#111114] hover:bg-[#1a1a1e] text-[#a1a1aa] hover:text-white border border-[#22222c] font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none active:translate-y-[1px]"
          title="Seek -5s [←]"
          data-testid="playback-seek-back-5s"
        >
          -5s
        </button>

        {/* Seek Forward 5s */}
        <button
          type="button"
          onClick={() => handleSeekDelta(5000)}
          className="hw-btn px-2.5 py-1.5 bg-[#111114] hover:bg-[#1a1a1e] text-[#a1a1aa] hover:text-white border border-[#22222c] font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none active:translate-y-[1px]"
          title="Seek +5s [→]"
          data-testid="playback-seek-fwd-5s"
        >
          +5s
        </button>

        {/* High Precision Time Readout */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 font-mono select-text"
          data-testid="playback-time-readout"
        >
          <span className="text-sm font-bold text-white te-num tabular-nums tracking-wide">
            {formatTimeMs(positionMs)}
          </span>
          <span className="text-[#555566] text-xs">/</span>
          <span className="text-xs text-[#9898a4] te-num tabular-nums">
            {formatTimeMs(durationMs)}
          </span>
        </div>

        {/* State Badge */}
        <div
          className={`px-2 py-0.5 text-xs font-mono font-bold uppercase tracking-wider border rounded-[2px] flex items-center gap-1.5 ${
            isPlaying
              ? 'bg-[#064e3b] text-[#34d399] border-[#059669]'
              : state === 'paused'
              ? 'bg-[#451a03] text-[#fbbf24] border-[#d97706]'
              : 'bg-[#181818] text-[#a8a8a8] border-[#27272a]'
          }`}
          data-testid="playback-status-badge"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isPlaying ? 'bg-[#34d399] shadow-[0_0_4px_#34d399]' : state === 'paused' ? 'bg-[#fbbf24]' : 'bg-[#555555]'
            }`}
          />
          <span>{state}</span>
        </div>
      </div>

      {/* ── Right Section: Speed Controls, Click Track Toggle & Shortcuts ─── */}
      <div className="flex items-center gap-3">
        {/* Play Speed Controls */}
        <div
          className="flex items-center gap-0.5 bg-[#050505] p-1 border border-[#222222]"
          data-testid="playback-speed-controls"
        >
          <span className="text-xs font-mono text-[#a8a8a8] px-1 uppercase tracking-wider hidden sm:inline">
            Speed:
          </span>
          {SPEED_OPTIONS.map((rate) => {
            const isActive = Math.abs(speed - rate) < 0.01;
            return (
              <button
                key={rate}
                type="button"
                onClick={() => onSetSpeed?.(rate)}
                className={`hw-btn px-1.5 py-0.5 font-mono text-xs uppercase transition-colors cursor-pointer border rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none active:translate-y-[1px] ${
                  isActive
                    ? 'bg-[#1e3a5f] text-[#38bdf8] border-[#38bdf8] font-bold'
                    : 'bg-[#101010] hover:bg-[#1a1a1a] text-[#a8a8a8] hover:text-white border-transparent'
                }`}
                data-testid={`playback-speed-${rate}`}
                title={`Set playback speed to ${rate}x`}
              >
                {rate}x
              </button>
            );
          })}
        </div>

        {/* Click Track (Metronome) Toggle */}
        <button
          type="button"
          onClick={onToggleClick}
          className={`hw-btn flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer border rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none active:translate-y-[1px] ${
            clickEnabled
              ? 'bg-[#142332] text-[#38bdf8] border-[#1e3a5f]'
              : 'bg-[#101010] hover:bg-[#181818] text-[#a8a8a8] border-[#222222]'
          }`}
          data-testid="playback-click-toggle"
          title="Toggle beat grid click track (metronome)"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              clickEnabled ? 'bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]' : 'bg-[#666666]'
            }`}
          />
          <span>Click: {clickEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* Master Volume Controls */}
        <div
          className="flex items-center gap-2 bg-[#050505] px-2.5 py-1 border border-[#222222]"
          data-testid="playback-volume-controls"
        >
          <button
            type="button"
            onClick={toggleMute}
            className="hw-btn text-xs hover:text-white transition-colors cursor-pointer text-[#a8a8a8] focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
            title={currentVolume === 0 ? 'Unmute' : 'Mute'}
            aria-label={currentVolume === 0 ? 'Unmute' : 'Mute'}
            data-testid="playback-mute-toggle"
          >
            {currentVolume === 0 ? '🔇' : currentVolume < 0.5 ? '🔉' : '🔊'}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={currentVolume}
            onChange={(e) => void handleVolumeChange(parseFloat(e.target.value))}
            className="w-16 sm:w-20 h-1 bg-[#1a1a22] accent-[#38bdf8] cursor-pointer"
            title={`Volume: ${Math.round(currentVolume * 100)}%`}
            aria-label="Master volume slider"
            data-testid="playback-volume-slider"
          />
          <span className="text-xs font-mono text-[#a8a8a8] w-7 text-right tabular-nums">
            {Math.round(currentVolume * 100)}%
          </span>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="hidden xl:flex items-center gap-2 text-xs font-mono text-[#a8a8a8]">
          <span>[Space] Play/Pause</span>
          <span>•</span>
          <span>[←/→] ±5s</span>
          <span>•</span>
          <span>[Shift+←/→] ±1 Bar</span>
          <span>•</span>
          <span>[1-8] Cues</span>
          <span>•</span>
          <span>[[ / ]] Speed</span>
        </div>
      </div>
    </div>
  );
};
