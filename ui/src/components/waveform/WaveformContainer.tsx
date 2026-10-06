import React, { useCallback } from 'react';
import type { TrackAnalysis } from '../../bindings/TrackAnalysis';
import { WaveformCanvas } from './WaveformCanvas';
import { WaveformMinimap } from './WaveformMinimap';
import { formatTimeMs, getVisibleWindow, clampViewport } from './waveformMath';

export interface WaveformContainerProps {
  analysis: TrackAnalysis;
  durationMs: number;
  zoomLevel: number;
  scrollOffsetMs: number;
  playheadPositionMs: number | null;
  isPlaying?: boolean;
  onTogglePlayPause?: () => void;
  onZoomChange: (newZoom: number) => void;
  onScrollChange: (newOffsetMs: number) => void;
  onSetPlayhead: (newTimeMs: number) => void;
  isCuesOverridden?: boolean;
  className?: string;
}

const ZOOM_PRESETS = [
  { label: 'Fit', value: 1.0 },
  { label: '2x', value: 2.0 },
  { label: '4x', value: 4.0 },
  { label: '8x', value: 8.0 },
  { label: '16x', value: 16.0 },
  { label: '32x', value: 32.0 },
];

export const WaveformContainer: React.FC<WaveformContainerProps> = ({
  analysis,
  durationMs,
  zoomLevel,
  scrollOffsetMs,
  playheadPositionMs,
  isPlaying = false,
  onTogglePlayPause,
  onZoomChange,
  onScrollChange,
  onSetPlayhead,
  isCuesOverridden = false,
  className = '',
}) => {
  const visible = getVisibleWindow(durationMs, zoomLevel, scrollOffsetMs);

  const handlePan = useCallback(
    (newStartMs: number) => {
      const clamped = clampViewport(newStartMs, visible.visibleDurationMs, durationMs);
      onScrollChange(clamped);
    },
    [visible.visibleDurationMs, durationMs, onScrollChange]
  );

  const handleZoomAtTime = useCallback(
    (newZoom: number, anchorTimeMs: number) => {
      const newVisibleDuration = durationMs / newZoom;
      // Keep anchor time proportionally at the same position relative to view
      const anchorRatio = (anchorTimeMs - visible.startTimeMs) / visible.visibleDurationMs;
      const newStartMs = anchorTimeMs - anchorRatio * newVisibleDuration;
      const clampedStart = clampViewport(newStartMs, newVisibleDuration, durationMs);

      onZoomChange(newZoom);
      onScrollChange(clampedStart);
    },
    [durationMs, visible.startTimeMs, visible.visibleDurationMs, onZoomChange, onScrollChange]
  );

  const handleZoomIn = () => {
    const nextZoom = Math.min(64.0, zoomLevel * 1.5);
    const anchor = playheadPositionMs ?? (visible.startTimeMs + visible.visibleDurationMs / 2);
    handleZoomAtTime(nextZoom, anchor);
  };

  const handleZoomOut = () => {
    const nextZoom = Math.max(1.0, zoomLevel / 1.5);
    const anchor = playheadPositionMs ?? (visible.startTimeMs + visible.visibleDurationMs / 2);
    handleZoomAtTime(nextZoom, anchor);
  };

  return (
    <div className={`flex flex-col bg-surface-panel border border-border-subtle rounded-none p-3 space-y-2.5 ${className}`}>
      {/* Waveform Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Playhead & Time Info + Quick Transport Button */}
        <div className="flex items-center gap-2.5">
          {onTogglePlayPause && (
            <button
              type="button"
              onClick={onTogglePlayPause}
              className={`flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border rounded-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none ${
                isPlaying
                  ? 'bg-accent-blue-dim hover:bg-accent-blue-dim text-accent-blue border-accent-blue'
                  : 'bg-surface-raised hover:bg-surface-hover text-white border-border-base'
              }`}
              title={isPlaying ? 'Pause [Space]' : 'Play [Space]'}
              data-testid="waveform-quick-play-pause-btn"
            >
              <span>{isPlaying ? '⏸' : '▶'}</span>
              <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
              <span className="text-xs text-content-muted font-normal">[SPACE]</span>
            </button>
          )}

          <div className="flex items-center gap-2 bg-surface-deep px-2.5 py-1 rounded-none border border-border-base">
            <span className="text-xs font-mono uppercase tracking-wider text-content-muted">Playhead</span>
            <span className="font-mono text-xs font-bold text-content-primary">
              {formatTimeMs(playheadPositionMs ?? 0)}
            </span>
            <span className="text-content-dim font-mono">/</span>
            <span className="font-mono text-xs text-content-muted">
              {formatTimeMs(durationMs)}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-content-muted font-mono text-xs">
            <span className="text-content-muted">Visible:</span>
            <span>{formatTimeMs(visible.startTimeMs)} – {formatTimeMs(visible.endTimeMs)}</span>
          </div>
        </div>

        {/* Zoom Controls & Presets */}
        <div className="flex items-center gap-2">
          {/* Zoom In / Out Buttons */}
          <div className="flex items-center bg-surface-deep border border-border-base rounded-none p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1.01}
              className="px-2 py-0.5 hover:bg-surface-elevated text-content-primary disabled:opacity-30 disabled:hover:bg-transparent font-mono font-bold cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
              title="Zoom Out"
            >
              −
            </button>
            <span className="px-2 py-0.5 font-mono text-xs text-content-primary select-none">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 64.0}
              className="px-2 py-0.5 hover:bg-surface-elevated text-content-primary disabled:opacity-30 disabled:hover:bg-transparent font-mono font-bold cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
              title="Zoom In"
            >
              +
            </button>
          </div>

          {/* Quick Presets */}
          <div className="hidden md:flex items-center gap-1 bg-surface-deep p-0.5 rounded-none border border-border-base">
            {ZOOM_PRESETS.map((preset) => {
              const isActive = Math.abs(zoomLevel - preset.value) < 0.2;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const anchor = playheadPositionMs ?? (visible.startTimeMs + visible.visibleDurationMs / 2);
                    handleZoomAtTime(preset.value, anchor);
                  }}
                  className={`px-2 py-0.5 rounded-none text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none ${
                    isActive
                      ? 'bg-surface-hover text-white border border-accent-blue/40'
                      : 'text-content-muted hover:text-white hover:bg-surface-raised'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Band Legend */}
          <div className="hidden lg:flex items-center gap-2.5 ml-2 pl-3 border-l border-border-base text-xs font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-accent-blue">
              <span className="w-1.5 h-1.5 rounded-none bg-accent-blue" /> Low
            </span>
            <span className="flex items-center gap-1.5 text-accent-amber-glow">
              <span className="w-1.5 h-1.5 rounded-none bg-accent-amber" /> Mid
            </span>
            <span className="flex items-center gap-1.5 text-content-primary">
              <span className="w-1.5 h-1.5 rounded-none bg-white" /> High
            </span>
          </div>
        </div>
      </div>

      {/* Main Interactive 3-Band Waveform Canvas */}
      <div className="h-48 sm:h-56 bg-surface-deep rounded-none overflow-hidden border border-border-base">
        <WaveformCanvas
          analysis={analysis}
          durationMs={durationMs}
          startTimeMs={visible.startTimeMs}
          visibleDurationMs={visible.visibleDurationMs}
          playheadPositionMs={playheadPositionMs}
          onSetPlayhead={onSetPlayhead}
          onPan={handlePan}
          onZoomAtTime={handleZoomAtTime}
          zoomLevel={zoomLevel}
          isCuesOverridden={isCuesOverridden}
          className="w-full h-full"
        />
      </div>

      {/* Track Overview Minimap */}
      <WaveformMinimap
        analysis={analysis}
        durationMs={durationMs}
        startTimeMs={visible.startTimeMs}
        visibleDurationMs={visible.visibleDurationMs}
        playheadPositionMs={playheadPositionMs}
        onSeek={handlePan}
        onSetPlayhead={onSetPlayhead}
      />
    </div>
  );
};
