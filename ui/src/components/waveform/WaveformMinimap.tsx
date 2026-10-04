import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { TrackAnalysis } from '../../bindings/TrackAnalysis';
import { formatTimeMs } from './waveformMath';

export interface MinimapHoverInfo {
  timeMs: number;
  pixelX: number;
  cue?: {
    letter: string;
    label: string;
    colorHex: string;
  } | null;
  segment?: {
    label: string;
    colorHex: string;
    energy: number;
  } | null;
  isLingering?: boolean;
}

export interface WaveformMinimapProps {
  analysis: TrackAnalysis;
  durationMs: number;
  startTimeMs: number;
  visibleDurationMs: number;
  playheadPositionMs: number | null;
  onSeek: (newStartTimeMs: number) => void;
  onSetPlayhead: (timeMs: number) => void;
  className?: string;
}

const SEGMENT_COLORS: Record<string, string> = {
  intro: '#0284c7',
  verse: '#4f46e5',
  buildup: '#ea580c',
  drop: '#dc2626',
  breakdown: '#7c3aed',
  outro: '#059669',
};

export const WaveformMinimap: React.FC<WaveformMinimapProps> = ({
  analysis,
  durationMs,
  startTimeMs,
  visibleDurationMs,
  playheadPositionMs,
  onSeek,
  onSetPlayhead,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 44 });
  const [hoverInfo, setHoverInfo] = useState<MinimapHoverInfo | null>(null);
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingViewportRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);

  useEffect(() => {
    return () => {
      if (hoverLeaveTimerRef.current) {
        clearTimeout(hoverLeaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setDimensions({
          width: Math.floor(width),
          height: Math.floor(height),
        });
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const renderMinimap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Dark Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    const segmentHeight = 6;
    const waveformAreaHeight = height - segmentHeight;
    const centerY = segmentHeight + waveformAreaHeight / 2;
    const maxHalfH = waveformAreaHeight / 2;

    // 1. Segments strip at top
    for (const seg of analysis.segments) {
      const x1 = (seg.start_ms / durationMs) * width;
      const x2 = (seg.end_ms / durationMs) * width;
      const w = Math.max(1, x2 - x1);
      ctx.fillStyle = SEGMENT_COLORS[seg.label.toLowerCase()] || '#64748b';
      ctx.fillRect(x1, 0, w, segmentHeight);
    }

    // 2. Condensed 3-band waveform
    const { low, mid, high } = analysis.waveform;
    const totalPoints = low.peak.length;

    if (totalPoints > 0) {
      for (let x = 0; x < width; x++) {
        const t1 = (x / width) * durationMs;
        const t2 = ((x + 1) / width) * durationMs;
        const idx1 = Math.min(totalPoints - 1, Math.floor((t1 / durationMs) * totalPoints));
        const idx2 = Math.min(totalPoints, Math.ceil((t2 / durationMs) * totalPoints));

        let maxL = 0;
        let maxM = 0;
        let maxH = 0;
        for (let i = idx1; i < idx2; i++) {
          if (low.peak[i] > maxL) maxL = low.peak[i];
          if (mid.peak[i] > maxM) maxM = mid.peak[i];
          if (high.peak[i] > maxH) maxH = high.peak[i];
        }

        // Low band
        if (maxL > 0) {
          const hL = (maxL / 255) * maxHalfH;
          ctx.fillStyle = '#1e40af';
          ctx.fillRect(x, centerY - hL, 1, hL * 2);
        }
        // Mid band
        if (maxM > 0) {
          const hM = (maxM / 255) * (maxHalfH * 0.7);
          ctx.fillStyle = '#d97706';
          ctx.fillRect(x, centerY - hM, 1, hM * 2);
        }
        // High band
        if (maxH > 0) {
          const hH = (maxH / 255) * (maxHalfH * 0.45);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, centerY - hH, 1, hH * 2);
        }
      }
    }

    // 3. Cue points marker dots
    for (const cue of analysis.cue_points) {
      const cx = (cue.time_ms / durationMs) * width;
      ctx.fillStyle = cue.color_hex;
      ctx.beginPath();
      ctx.arc(cx, centerY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Viewport Window Highlight (Rectangle)
    const viewX1 = (startTimeMs / durationMs) * width;
    const viewW = Math.max(8, (visibleDurationMs / durationMs) * width);

    // Dim regions outside viewport
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, viewX1, height);
    ctx.fillRect(viewX1 + viewW, 0, width - (viewX1 + viewW), height);

    // Viewport box border & light highlight
    ctx.strokeStyle = '#38bdf8'; // Sky blue border
    ctx.lineWidth = 1.5;
    ctx.strokeRect(viewX1, 0, viewW, height);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.fillRect(viewX1, 0, viewW, height);

    // 5. Playhead indicator
    if (playheadPositionMs !== null && playheadPositionMs >= 0 && playheadPositionMs <= durationMs) {
      const px = (playheadPositionMs / durationMs) * width;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }

    // 6. Hover guide line
    if (hoverInfo) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hoverInfo.pixelX, 0);
      ctx.lineTo(hoverInfo.pixelX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [dimensions, analysis, durationMs, startTimeMs, visibleDurationMs, playheadPositionMs, hoverInfo]);

  useEffect(() => {
    renderMinimap();
  }, [renderMinimap]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / dimensions.width));
    const clickTimeMs = clickRatio * durationMs;

    const viewX1 = (startTimeMs / durationMs) * dimensions.width;
    const viewW = (visibleDurationMs / durationMs) * dimensions.width;

    if (clickX >= viewX1 && clickX <= viewX1 + viewW) {
      // Clicked inside viewport window: Start drag
      isDraggingViewportRef.current = true;
      dragStartXRef.current = e.clientX;
      dragStartOffsetRef.current = startTimeMs;
    } else {
      // Clicked outside: center viewport around click position
      const newStart = Math.max(0, Math.min(durationMs - visibleDurationMs, clickTimeMs - visibleDurationMs / 2));
      onSeek(newStart);
      onSetPlayhead(clickTimeMs);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      // Cancel lingering countdown
      if (hoverLeaveTimerRef.current) {
        clearTimeout(hoverLeaveTimerRef.current);
        hoverLeaveTimerRef.current = null;
      }

      const mouseX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, mouseX / dimensions.width));
      const hoverTime = ratio * durationMs;

      // Identify nearby cue
      let matchedCue: MinimapHoverInfo['cue'] = null;
      let minCueDist = 10;
      for (const cue of analysis.cue_points) {
        const cx = (cue.time_ms / durationMs) * dimensions.width;
        const dist = Math.abs(mouseX - cx);
        if (dist < minCueDist) {
          minCueDist = dist;
          matchedCue = {
            letter: String.fromCharCode(65 + cue.index),
            label: cue.label,
            colorHex: cue.color_hex,
          };
        }
      }

      // Identify active segment
      const seg = analysis.segments.find(
        (s) => hoverTime >= s.start_ms && hoverTime <= s.end_ms
      );

      setHoverInfo({
        timeMs: hoverTime,
        pixelX: mouseX,
        cue: matchedCue,
        segment: seg
          ? {
              label: seg.label,
              colorHex: SEGMENT_COLORS[seg.label.toLowerCase()] || '#64748b',
              energy: seg.energy,
            }
          : null,
        isLingering: false,
      });
    }

    if (!isDraggingViewportRef.current) return;
    const deltaX = e.clientX - dragStartXRef.current;
    const deltaMs = (deltaX / dimensions.width) * durationMs;
    const newStart = Math.max(0, Math.min(durationMs - visibleDurationMs, dragStartOffsetRef.current + deltaMs));
    onSeek(newStart);
  };

  const handleMouseUp = () => {
    isDraggingViewportRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingViewportRef.current = false;

    // Start 2-second hover linger decay (Teenage Engineering hardware style)
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
    }
    setHoverInfo((prev) => (prev ? { ...prev, isLingering: true } : null));

    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoverInfo(null);
      hoverLeaveTimerRef.current = null;
    }, 2000);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      className={`relative select-none h-10 bg-[#050505] rounded-none overflow-visible border border-[#242424] cursor-pointer ${className}`}
      data-testid="waveform-minimap"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Teenage Engineering Minimap Hover Tooltip (2s linger) */}
      {hoverInfo && !isDraggingViewportRef.current && (
        <div
          className={`absolute -top-7 pointer-events-none transform -translate-x-1/2 z-20 flex flex-col items-center transition-opacity duration-300 ${
            hoverInfo.isLingering ? 'opacity-90' : 'opacity-100'
          }`}
          style={{
            left: `${Math.max(70, Math.min(dimensions.width - 70, hoverInfo.pixelX))}px`,
          }}
          data-testid="minimap-te-tooltip"
        >
          <div className="bg-[#0c0c0c]/95 backdrop-blur-sm border border-[#333333] px-2 py-0.5 text-xs font-mono tracking-wide uppercase text-[#ededed] shadow-[0_2px_8px_rgba(0,0,0,0.8)] flex items-center gap-1.5 rounded-none leading-none">
            <span className="text-[#38bdf8] font-bold">{formatTimeMs(hoverInfo.timeMs)}</span>
            {hoverInfo.cue ? (
              <>
                <span className="text-[#666666]">//</span>
                <span className="font-bold" style={{ color: hoverInfo.cue.colorHex }}>
                  CUE {hoverInfo.cue.letter}
                </span>
              </>
            ) : hoverInfo.segment ? (
              <>
                <span className="text-[#666666]">//</span>
                <span className="font-bold text-white">{hoverInfo.segment.label}</span>
              </>
            ) : null}
            {hoverInfo.isLingering && (
              <span className="text-xs text-[#fbbf24] border border-[#fbbf24]/50 px-1.5 py-0.5 tracking-normal bg-[#ca8a04]/20 rounded-none ml-0.5">
                2S
              </span>
            )}
          </div>
          <div className="w-[1px] h-1 bg-[#38bdf8]/60" />
        </div>
      )}
    </div>
  );
};
