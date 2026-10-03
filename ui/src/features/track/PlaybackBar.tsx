import React from 'react';
import type { PlayerState } from '../../api/playback';
import { formatTimeMs } from '../../components/waveform';

export interface PlaybackBarProps {
  state: PlayerState;
  positionMs: number;
  durationMs: number;
  clickEnabled: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (positionMs: number) => void;
  onToggleClick: () => void;
  className?: string;
}

export const PlaybackBar: React.FC<PlaybackBarProps> = ({
  state,
  positionMs,
  durationMs,
  clickEnabled,
  onPlay,
  onPause,
  onSeek,
  onToggleClick,
  className = '',
}) => {
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
      className={`p-3 bg-[#0a0a0a] border border-[#1c1c1c] flex flex-wrap items-center justify-between gap-4 select-none ${className}`}
      data-testid="playback-bar"
    >
      {/* ── Left Section: Transport & Time Readout ─────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Play / Pause Toggle Button */}
        <button
          type="button"
          onClick={handlePlayPause}
          className={`flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border rounded-none ${
            isPlaying
              ? 'bg-[#1e3a5f] hover:bg-[#254b7a] text-[#38bdf8] border-[#38bdf8]'
              : 'bg-[#181818] hover:bg-[#242424] text-white border-[#2b2b2b]'
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
          className="px-2.5 py-2 bg-[#121212] hover:bg-[#1c1c1c] text-[#a1a1aa] hover:text-white border border-[#222222] font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer rounded-none"
          title="Jump to Start (0:00)"
          data-testid="playback-jump-start-btn"
        >
          ⏮ 0:00
        </button>

        {/* Seek Backward 5s */}
        <button
          type="button"
          onClick={() => handleSeekDelta(-5000)}
          className="px-2.5 py-2 bg-[#121212] hover:bg-[#1c1c1c] text-[#a1a1aa] hover:text-white border border-[#222222] font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer rounded-none"
          title="Seek -5s [←]"
          data-testid="playback-seek-back-5s"
        >
          -5s
        </button>

        {/* Seek Forward 5s */}
        <button
          type="button"
          onClick={() => handleSeekDelta(5000)}
          className="px-2.5 py-2 bg-[#121212] hover:bg-[#1c1c1c] text-[#a1a1aa] hover:text-white border border-[#222222] font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer rounded-none"
          title="Seek +5s [→]"
          data-testid="playback-seek-fwd-5s"
        >
          +5s
        </button>

        {/* High Precision Time Readout */}
        <div
          className="flex items-center gap-2 bg-[#050505] px-3 py-1.5 border border-[#222222] rounded-none font-mono"
          data-testid="playback-time-readout"
        >
          <span className="text-sm font-bold text-white tabular-nums tracking-wide">
            {formatTimeMs(positionMs)}
          </span>
          <span className="text-[#555555] font-sans">/</span>
          <span className="text-xs text-[#71717a] tabular-nums">
            {formatTimeMs(durationMs)}
          </span>
        </div>

        {/* State Badge */}
        <div
          className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider border rounded-[2px] ${
            isPlaying
              ? 'bg-[#064e3b] text-[#34d399] border-[#059669]'
              : state === 'paused'
              ? 'bg-[#451a03] text-[#fbbf24] border-[#d97706]'
              : 'bg-[#181818] text-[#71717a] border-[#27272a]'
          }`}
          data-testid="playback-status-badge"
        >
          {state}
        </div>
      </div>

      {/* ── Right Section: Click Track Toggle & Keyboard Shortcuts Hint ───── */}
      <div className="flex items-center gap-4">
        {/* Click Track (Metronome) Toggle */}
        <button
          type="button"
          onClick={onToggleClick}
          className={`flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer border rounded-none ${
            clickEnabled
              ? 'bg-[#142332] text-[#38bdf8] border-[#1e3a5f]'
              : 'bg-[#101010] hover:bg-[#181818] text-[#71717a] border-[#222222]'
          }`}
          data-testid="playback-click-toggle"
          title="Toggle beat grid click track (metronome)"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              clickEnabled ? 'bg-[#38bdf8] animate-pulse' : 'bg-[#444444]'
            }`}
          />
          <span>Click: {clickEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* Keyboard Shortcuts Hint */}
        <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono text-[#555555]">
          <span>[Space] Play/Pause</span>
          <span>•</span>
          <span>[←/→] ±5s</span>
          <span>•</span>
          <span>[Shift+←/→] ±1 Bar</span>
        </div>
      </div>
    </div>
  );
};
