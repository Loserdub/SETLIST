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
  onZoomChange: (newZoom: number) => void;
  onScrollChange: (newOffsetMs: number) => void;
  onSetPlayhead: (newTimeMs: number) => void;
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
  onZoomChange,
  onScrollChange,
  onSetPlayhead,
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
    <div className={`flex flex-col bg-[#0a0a0a] border border-[#1c1c1c] rounded-none p-3 space-y-2.5 ${className}`}>
      {/* Waveform Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Playhead & Time Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#050505] px-2.5 py-1 rounded-none border border-[#242424]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#666666]">Playhead</span>
            <span className="font-mono text-xs font-bold text-[#ededed]">
              {formatTimeMs(playheadPositionMs ?? 0)}
            </span>
            <span className="text-[#444444] font-mono">/</span>
            <span className="font-mono text-[11px] text-[#71717a]">
              {formatTimeMs(durationMs)}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[#71717a] font-mono text-[11px]">
            <span className="text-[#555555]">Visible:</span>
            <span>{formatTimeMs(visible.startTimeMs)} – {formatTimeMs(visible.endTimeMs)}</span>
          </div>
        </div>

        {/* Zoom Controls & Presets */}
        <div className="flex items-center gap-2">
          {/* Zoom In / Out Buttons */}
          <div className="flex items-center bg-[#050505] border border-[#242424] rounded-none p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1.01}
              className="px-2 py-0.5 hover:bg-[#181818] text-[#cccccc] disabled:opacity-30 disabled:hover:bg-transparent font-mono font-bold cursor-pointer transition-colors"
              title="Zoom Out"
            >
              −
            </button>
            <span className="px-2 py-0.5 font-mono text-[11px] text-[#ededed] select-none">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 64.0}
              className="px-2 py-0.5 hover:bg-[#181818] text-[#cccccc] disabled:opacity-30 disabled:hover:bg-transparent font-mono font-bold cursor-pointer transition-colors"
              title="Zoom In"
            >
              +
            </button>
          </div>

          {/* Quick Presets */}
          <div className="hidden md:flex items-center gap-1 bg-[#050505] p-0.5 rounded-none border border-[#242424]">
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
                  className={`px-2 py-0.5 rounded-none text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#242424] text-white border border-[#38bdf8]/40'
                      : 'text-[#71717a] hover:text-white hover:bg-[#141414]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Band Legend */}
          <div className="hidden lg:flex items-center gap-2.5 ml-2 pl-3 border-l border-[#242424] text-[10px] font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-[#60a5fa]">
              <span className="w-1.5 h-1.5 rounded-none bg-[#3b82f6]" /> Low
            </span>
            <span className="flex items-center gap-1.5 text-[#fbbf24]">
              <span className="w-1.5 h-1.5 rounded-none bg-[#f59e0b]" /> Mid
            </span>
            <span className="flex items-center gap-1.5 text-[#e4e4e7]">
              <span className="w-1.5 h-1.5 rounded-none bg-[#ffffff]" /> High
            </span>
          </div>
        </div>
      </div>

      {/* Main Interactive 3-Band Waveform Canvas */}
      <div className="h-48 sm:h-56 bg-[#050505] rounded-none overflow-hidden border border-[#242424]">
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
