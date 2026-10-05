import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { TrackAnalysis } from '../../bindings/TrackAnalysis';
import {
  timeToPixel,
  pixelToTime,
  sliceWaveformWindow,
  filterVisibleBeats,
  filterVisibleSegments,
  filterVisibleCues,
  formatTimeMs,
} from './waveformMath';
import { FOUR_POINT_CUE_CONFIG, type PerformanceCueSlot } from '../../features/track/cues/fourPointCues';

export interface CanvasHoverInfo {
  timeMs: number;
  pixelX: number;
  cue?: {
    letter: string;
    label: string;
    kind: string;
    colorHex: string;
    timeMs: number;
    loopEndMs?: number | null;
    isSuggested?: boolean;
  } | null;
  segment?: {
    label: string;
    colorHex: string;
    startMs: number;
    endMs: number;
    energy: number;
  } | null;
  beat?: {
    index: number;
    isDownbeat: boolean;
    timeMs: number;
  } | null;
  isLingering?: boolean;
}

export interface WaveformCanvasProps {
  analysis: TrackAnalysis;
  durationMs: number;
  startTimeMs: number;
  visibleDurationMs: number;
  playheadPositionMs: number | null;
  onSetPlayhead: (timeMs: number) => void;
  onPan: (newStartTimeMs: number) => void;
  onZoomAtTime: (newZoomLevel: number, anchorTimeMs: number) => void;
  zoomLevel: number;
  isCuesOverridden?: boolean;
  className?: string;
}

const SEGMENT_COLORS: Record<string, string> = {
  intro: '#0284c7', // Sky Blue
  verse: '#4f46e5', // Indigo
  buildup: '#ea580c', // Orange
  drop: '#dc2626', // Red
  breakdown: '#7c3aed', // Purple
  outro: '#059669', // Emerald
};

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  analysis,
  durationMs,
  startTimeMs,
  visibleDurationMs,
  playheadPositionMs,
  onSetPlayhead,
  onPan,
  onZoomAtTime,
  zoomLevel,
  isCuesOverridden = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 240 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTimeMs, setHoverTimeMs] = useState<number | null>(null);
  const [hoverPixelX, setHoverPixelX] = useState<number | null>(null);
  const [hoverInfo, setHoverInfo] = useState<CanvasHoverInfo | null>(null);

  // 2-second hover linger timer ref (Teenage Engineering hardware style decay)
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag interaction tracking refs
  const dragRef = useRef({
    isDown: false,
    hasMoved: false,
    startX: 0,
    startOffsetMs: 0,
  });

  // Cleanup linger timer on unmount
  useEffect(() => {
    return () => {
      if (hoverLeaveTimerRef.current) {
        clearTimeout(hoverLeaveTimerRef.current);
      }
    };
  }, []);

  // Track container dimensions with ResizeObserver
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
          height: Math.max(180, Math.floor(height)),
        });
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // High Performance 60 FPS Canvas Rendering
  // ───────────────────────────────────────────────────────────────────────────
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    // Adjust canvas buffer resolution for high-DPI crispness
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#050505'; // Studio black
    ctx.fillRect(0, 0, width, height);

    const endTimeMs = startTimeMs + visibleDurationMs;

    // Layout bands
    const segmentBarHeight = 22;
    const cueFlagHeight = 20;
    const headerHeight = segmentBarHeight + cueFlagHeight;
    const waveformBottom = height - 6;
    const waveformAreaHeight = waveformBottom - headerHeight;
    const centerY = headerHeight + waveformAreaHeight / 2;
    const maxHalfH = (waveformAreaHeight / 2) * 0.95;

    // ── 1. SEGMENT OVERLAYS (Top Banner & Subtle Shading) ─────────────────────
    const visibleSegments = filterVisibleSegments(analysis.segments, startTimeMs, endTimeMs);
    for (const seg of visibleSegments) {
      const x1 = Math.max(0, timeToPixel(seg.start_ms, startTimeMs, visibleDurationMs, width));
      const x2 = Math.min(width, timeToPixel(seg.end_ms, startTimeMs, visibleDurationMs, width));
      const segWidth = Math.max(1, x2 - x1);
      const color = SEGMENT_COLORS[seg.label.toLowerCase()] || '#64748b';

      // Segment Top Header Bar
      ctx.fillStyle = color;
      ctx.fillRect(x1, 0, segWidth, segmentBarHeight);

      // Subtle vertical segment tint behind waveform
      ctx.fillStyle = `${color}10`; // ~6% opacity
      ctx.fillRect(x1, headerHeight, segWidth, waveformAreaHeight);

      // Segment Boundary Line
      ctx.strokeStyle = `${color}60`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, height);
      ctx.stroke();

      // Segment Label Text
      if (segWidth > 36) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const labelText = seg.label.toUpperCase();
        ctx.fillText(labelText, x1 + 6, segmentBarHeight / 2);
      }
    }

    // ── 2. CUE LOOPS & SHADING ────────────────────────────────────────────────
    const visibleCues = filterVisibleCues(analysis.cue_points, startTimeMs, endTimeMs);
    for (const cue of visibleCues) {
      if (cue.loop_end_ms !== null) {
        const loopStartPx = timeToPixel(cue.time_ms, startTimeMs, visibleDurationMs, width);
        const loopEndPx = timeToPixel(cue.loop_end_ms, startTimeMs, visibleDurationMs, width);
        const lX1 = Math.max(0, loopStartPx);
        const lX2 = Math.min(width, loopEndPx);
        if (lX2 > lX1) {
          ctx.fillStyle = `${cue.color_hex}25`; // translucent fill
          ctx.fillRect(lX1, headerHeight, lX2 - lX1, waveformAreaHeight);

          // Loop region hatched borders
          ctx.strokeStyle = cue.color_hex;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(loopEndPx, headerHeight);
          ctx.lineTo(loopEndPx, height);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ── 3. BEAT TICKS & STRONGER DOWNBEAT LINES ───────────────────────────────
    const { beats_ms, downbeat_flags } = analysis.rhythm.grid;
    const visibleBeats = filterVisibleBeats(beats_ms, downbeat_flags, startTimeMs, endTimeMs, width);

    for (const beat of visibleBeats) {
      const bx = beat.pixelX;
      if (bx < -2 || bx > width + 2) continue;

      if (beat.isDownbeat) {
        // Stronger Downbeat Line (White / Bright Accent)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, segmentBarHeight);
        ctx.lineTo(bx, height);
        ctx.stroke();

        // Downbeat marker pip at top
        ctx.fillStyle = '#38bdf8'; // Sky 400
        ctx.fillRect(bx - 1.5, segmentBarHeight + 1, 3, 4);
      } else {
        // Regular beat tick (subtle tick line)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx, centerY - maxHalfH * 0.4);
        ctx.lineTo(bx, centerY + maxHalfH * 0.4);
        ctx.stroke();
      }
    }

    // ── 4. 3-BAND WAVEFORM (Low: Blue, Mid: Amber, High: White) ───────────────
    const slice = sliceWaveformWindow(analysis.waveform, startTimeMs, endTimeMs, durationMs);
    const { low, mid, high } = analysis.waveform;
    const totalPoints = low.peak.length;

    if (totalPoints > 0 && slice.pointCount > 0) {
      // Direct column-by-column rendering
      const numCols = Math.min(width, 1600);
      const colWidth = width / numCols;

      for (let c = 0; c < numCols; c++) {
        const colPixelX = c * colWidth;
        const colTimeStart = pixelToTime(colPixelX, startTimeMs, visibleDurationMs, width);
        const colTimeEnd = pixelToTime(colPixelX + colWidth, startTimeMs, visibleDurationMs, width);

        // Map column time to sample index range
        const idxStart = Math.max(0, Math.min(Math.floor((colTimeStart / durationMs) * totalPoints), totalPoints - 1));
        const idxEnd = Math.max(idxStart + 1, Math.min(Math.ceil((colTimeEnd / durationMs) * totalPoints), totalPoints));

        // Find max peak & rms in this column bucket
        let lowP = 0;
        let lowR = 0;
        let midP = 0;
        let midR = 0;
        let highP = 0;
        let highR = 0;

        for (let idx = idxStart; idx < idxEnd; idx++) {
          if (low.peak[idx] > lowP) lowP = low.peak[idx];
          if (low.rms[idx] > lowR) lowR = low.rms[idx];
          if (mid.peak[idx] > midP) midP = mid.peak[idx];
          if (mid.rms[idx] > midR) midR = mid.rms[idx];
          if (high.peak[idx] > highP) highP = high.peak[idx];
          if (high.rms[idx] > highR) highR = high.rms[idx];
        }

        const barX = Math.floor(colPixelX);
        const barW = Math.max(1, Math.ceil(colWidth));

        // 1. LOW BAND (Blue) - Outer base envelope
        if (lowP > 0) {
          const halfH = Math.max(1, (lowP / 255) * maxHalfH);
          ctx.fillStyle = '#2563eb'; // Vibrant Blue
          ctx.fillRect(barX, centerY - halfH, barW, halfH * 2);

          if (lowR > 0) {
            const rmsHalfH = Math.max(1, (lowR / 255) * maxHalfH);
            ctx.fillStyle = '#1d4ed8'; // Deeper solid blue for RMS body
            ctx.fillRect(barX, centerY - rmsHalfH, barW, rmsHalfH * 2);
          }
        }

        // 2. MID BAND (Amber) - Core melody / vocal layer
        if (midP > 0) {
          const halfH = Math.max(1, (midP / 255) * (maxHalfH * 0.72));
          ctx.fillStyle = '#f59e0b'; // Warm Amber
          ctx.fillRect(barX, centerY - halfH, barW, halfH * 2);

          if (midR > 0) {
            const rmsHalfH = Math.max(1, (midR / 255) * (maxHalfH * 0.72));
            ctx.fillStyle = '#d97706'; // Deeper Amber for RMS body
            ctx.fillRect(barX, centerY - rmsHalfH, barW, rmsHalfH * 2);
          }
        }

        // 3. HIGH BAND (White) - Crisp tops / transients
        if (highP > 0) {
          const halfH = Math.max(1, (highP / 255) * (maxHalfH * 0.45));
          ctx.fillStyle = '#ffffff'; // Brilliant White
          ctx.fillRect(barX, centerY - halfH, barW, halfH * 2);
        }
      }
    }

    // ── 5. CUE MARKERS A TO H (CANONICAL FOUR-POINT + REGISTERS) ───────────
    for (const cue of visibleCues) {
      const cx = timeToPixel(cue.time_ms, startTimeMs, visibleDurationMs, width);
      const letter = String.fromCharCode(65 + cue.index); // 'A', 'B', 'C'...
      const slot = (['A', 'B', 'C', 'D'] as PerformanceCueSlot[])[cue.index];
      const cfg = slot ? FOUR_POINT_CUE_CONFIG[slot] : null;
      const color = cfg ? cfg.colorHex : cue.color_hex;

      // Vertical Cue Line: Solid line if confirmed by user; dashed if suggested by analysis
      ctx.strokeStyle = color;
      ctx.lineWidth = isCuesOverridden ? 2 : 1.5;
      if (isCuesOverridden) {
        ctx.setLineDash([]);
      } else {
        ctx.setLineDash([4, 3]);
      }
      ctx.beginPath();
      ctx.moveTo(cx, segmentBarHeight);
      ctx.lineTo(cx, height);
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // Cue Flag / Badge
      const flagW = 22;
      const flagH = 18;
      const flagX = cx - flagW / 2;
      const flagY = segmentBarHeight + 2;

      // Flag Pill Background
      ctx.fillStyle = isCuesOverridden ? color : 'rgba(10, 10, 10, 0.9)';
      ctx.beginPath();
      ctx.roundRect(flagX, flagY, flagW, flagH, 3);
      ctx.fill();

      // Flag border
      ctx.strokeStyle = color;
      ctx.lineWidth = isCuesOverridden ? 1.5 : 1;
      if (!isCuesOverridden) {
        ctx.setLineDash([2, 2]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Cue Letter
      ctx.fillStyle = isCuesOverridden ? '#ffffff' : color;
      ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, cx, flagY + flagH / 2);
    }

    // ── 6. PLAYHEAD LINE & INDICATOR ─────────────────────────────────────────
    if (playheadPositionMs !== null && playheadPositionMs >= startTimeMs && playheadPositionMs <= endTimeMs) {
      const px = timeToPixel(playheadPositionMs, startTimeMs, visibleDurationMs, width);

      // Playhead vertical needle
      ctx.strokeStyle = '#38bdf8'; // Sky Blue 400
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();

      // Needle Head (Downward pointing triangle at top)
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(px - 5, 0);
      ctx.lineTo(px + 5, 0);
      ctx.lineTo(px, 8);
      ctx.closePath();
      ctx.fill();

      // Needle Base (Upward pointing triangle at bottom)
      ctx.beginPath();
      ctx.moveTo(px - 5, height);
      ctx.lineTo(px + 5, height);
      ctx.lineTo(px, height - 8);
      ctx.closePath();
      ctx.fill();
    }

    // ── 7. MOUSE HOVER TIME CURSOR ───────────────────────────────────────────
    if (hoverPixelX !== null && hoverTimeMs !== null && !isDragging) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hoverPixelX, 0);
      ctx.lineTo(hoverPixelX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [
    dimensions,
    analysis,
    durationMs,
    startTimeMs,
    visibleDurationMs,
    playheadPositionMs,
    hoverPixelX,
    hoverTimeMs,
    isDragging,
  ]);

  // Repaint canvas via requestAnimationFrame only when render dependencies update
  useEffect(() => {
    const animId = requestAnimationFrame(() => {
      renderCanvas();
    });
    return () => cancelAnimationFrame(animId);
  }, [renderCanvas]);

  // ───────────────────────────────────────────────────────────────────────────
  // Mouse & Gesture Handlers: Wheel Zoom & Pan, Click & Drag Scrub
  // ───────────────────────────────────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const anchorTimeMs = pixelToTime(mouseX, startTimeMs, visibleDurationMs, dimensions.width);

    // Horizontal wheel or Shift+Wheel: Pan
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const deltaX = e.shiftKey ? e.deltaY : e.deltaX;
      const panDeltaMs = (deltaX / dimensions.width) * visibleDurationMs;
      onPan(startTimeMs + panDeltaMs);
      return;
    }

    // Vertical wheel: Zoom centered on mouse cursor position
    const zoomMultiplier = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoomLevel = Math.max(1.0, Math.min(64.0, zoomLevel * zoomMultiplier));
    onZoomAtTime(newZoomLevel, anchorTimeMs);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left click only
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragRef.current = {
      isDown: true,
      hasMoved: false,
      startX: e.clientX,
      startOffsetMs: startTimeMs,
    };
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Reset any lingering 2-second hover decay
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }

    const mouseX = e.clientX - rect.left;
    const timeAtMouse = pixelToTime(mouseX, startTimeMs, visibleDurationMs, dimensions.width);
    const clampedTime = Math.max(0, Math.min(durationMs, timeAtMouse));
    setHoverPixelX(mouseX);
    setHoverTimeMs(clampedTime);

    // Identify active structural segment at cursor
    const segment = analysis.segments.find(
      (s) => clampedTime >= s.start_ms && clampedTime <= s.end_ms
    );

    // Identify nearby Cue point (within 18px horizontal proximity)
    let matchedCue: CanvasHoverInfo['cue'] = null;
    let minCueDist = 18;
    for (const c of analysis.cue_points) {
      const cx = timeToPixel(c.time_ms, startTimeMs, visibleDurationMs, dimensions.width);
      const dist = Math.abs(mouseX - cx);
      if (dist < minCueDist) {
        minCueDist = dist;
        const letter = String.fromCharCode(65 + c.index);
        const slot = (['A', 'B', 'C', 'D'] as PerformanceCueSlot[])[c.index];
        const cfg = slot ? FOUR_POINT_CUE_CONFIG[slot] : null;
        matchedCue = {
          letter,
          label: cfg ? `${letter}: ${cfg.role}` : c.label,
          kind: c.kind,
          colorHex: cfg ? cfg.colorHex : c.color_hex,
          timeMs: c.time_ms,
          loopEndMs: c.loop_end_ms,
          isSuggested: !isCuesOverridden,
        };
      }
    }

    // Identify nearest beat tick in grid (within 14px proximity)
    let matchedBeat: CanvasHoverInfo['beat'] = null;
    const { beats_ms, downbeat_flags } = analysis.rhythm.grid;
    if (beats_ms && beats_ms.length > 0) {
      let minBeatDist = 14;
      for (let i = 0; i < beats_ms.length; i++) {
        const bx = timeToPixel(beats_ms[i], startTimeMs, visibleDurationMs, dimensions.width);
        const dist = Math.abs(mouseX - bx);
        if (dist < minBeatDist) {
          minBeatDist = dist;
          matchedBeat = {
            index: i + 1,
            isDownbeat: Boolean(downbeat_flags[i]),
            timeMs: beats_ms[i],
          };
        }
      }
    }

    setHoverInfo({
      timeMs: clampedTime,
      pixelX: mouseX,
      cue: matchedCue,
      segment: segment
        ? {
            label: segment.label,
            colorHex: SEGMENT_COLORS[segment.label.toLowerCase()] || '#64748b',
            startMs: segment.start_ms,
            endMs: segment.end_ms,
            energy: segment.energy,
          }
        : null,
      beat: matchedBeat,
      isLingering: false,
    });

    if (dragRef.current.isDown) {
      const deltaX = e.clientX - dragRef.current.startX;
      if (Math.abs(deltaX) > 3) {
        dragRef.current.hasMoved = true;
      }

      if (dragRef.current.hasMoved) {
        // Pan viewport
        const deltaMs = (deltaX / dimensions.width) * visibleDurationMs;
        onPan(dragRef.current.startOffsetMs - deltaMs);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.isDown) {
      if (!dragRef.current.hasMoved) {
        // User clicked without dragging -> Set playhead!
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const clickX = e.clientX - rect.left;
          const clickedTimeMs = pixelToTime(clickX, startTimeMs, visibleDurationMs, dimensions.width);
          onSetPlayhead(Math.max(0, Math.min(durationMs, clickedTimeMs)));
        }
      }
    }
    dragRef.current.isDown = false;
    dragRef.current.hasMoved = false;
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    dragRef.current.isDown = false;
    setIsDragging(false);

    // Keep hover tooltip pinned for 2 seconds (Teenage Engineering hardware style linger)
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
    }

    setHoverInfo((prev) => (prev ? { ...prev, isLingering: true } : null));

    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoverInfo(null);
      setHoverPixelX(null);
      setHoverTimeMs(null);
      hoverLeaveTimerRef.current = null;
    }, 2000);
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      className={`relative select-none overflow-hidden cursor-crosshair ${className}`}
      data-testid="waveform-canvas-container"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Teenage Engineering Style Thin Hover Tooltip (with 2-second linger) */}
      {hoverInfo && !isDragging && (
        <div
          className={`absolute top-1 pointer-events-none transform -translate-x-1/2 z-20 flex flex-col items-center transition-opacity duration-300 ${
            hoverInfo.isLingering ? 'opacity-90' : 'opacity-100'
          }`}
          style={{
            left: `${Math.max(130, Math.min(dimensions.width - 130, hoverInfo.pixelX))}px`,
          }}
          data-testid="waveform-te-tooltip"
        >
          <div className="bg-[#0c0c0c]/95 backdrop-blur-sm border border-[#333333] px-2.5 py-1.5 text-xs font-mono tracking-wide uppercase text-[#ededed] shadow-[0_4px_16px_rgba(0,0,0,0.85)] flex flex-col gap-1 rounded-none">
            {/* Primary Telemetry Line */}
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-[#38bdf8] font-bold">
                {formatTimeMs(hoverInfo.timeMs)}
              </span>
              <span className="text-[#666666] font-light">//</span>
              {hoverInfo.cue ? (
                <span className="flex items-center gap-1 font-bold" style={{ color: hoverInfo.cue.colorHex }}>
                  <span>CUE {hoverInfo.cue.letter}</span>
                  <span className="text-[#a8a8a8] font-normal">[{hoverInfo.cue.label}]</span>
                  <span
                    className={`text-xs uppercase px-1.5 py-0.5 rounded-none font-mono font-bold border ${
                      hoverInfo.cue.isSuggested
                        ? 'border-cyan-500/40 text-cyan-300 bg-cyan-950/20'
                        : 'border-emerald-500/50 text-emerald-300 bg-emerald-950/30'
                    }`}
                  >
                    {hoverInfo.cue.isSuggested ? 'SUGGESTED' : 'CONFIRMED'}
                  </span>
                </span>
              ) : hoverInfo.segment ? (
                <span className="flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 inline-block rounded-none"
                    style={{ backgroundColor: hoverInfo.segment.colorHex }}
                  />
                  <span className="font-bold text-white">{hoverInfo.segment.label}</span>
                </span>
              ) : (
                <span className="text-[#a8a8a8]">TRACK POSITION</span>
              )}

              {hoverInfo.isLingering && (
                <span className="ml-1 text-xs text-[#fbbf24] border border-[#fbbf24]/50 px-1.5 py-0.5 tracking-normal bg-[#ca8a04]/20 rounded-none">
                  HOLD 2S
                </span>
              )}
            </div>

            {/* Secondary Metadata Readout */}
            <div className="flex items-center gap-2 text-[#a8a8a8] text-xs tracking-wide border-t border-[#2e2e2e] pt-1 leading-normal">
              {hoverInfo.beat && (
                <span>
                  BEAT #{hoverInfo.beat.index}
                  {hoverInfo.beat.isDownbeat && (
                    <span className="text-[#38bdf8] ml-1 font-bold">[DB]</span>
                  )}
                </span>
              )}
              {hoverInfo.segment && (
                <>
                  <span className="text-[#555555]">//</span>
                  <span>ENERGY {hoverInfo.segment.energy}/10</span>
                </>
              )}
              {hoverInfo.cue?.loopEndMs && (
                <>
                  <span className="text-[#555555]">//</span>
                  <span className="text-[#22d3ee]">LOOP +{formatTimeMs(hoverInfo.cue.loopEndMs - hoverInfo.cue.timeMs)}</span>
                </>
              )}
            </div>
          </div>
          {/* Hairline guide indicator */}
          <div className="w-[1px] h-1.5 bg-[#38bdf8]/60" />
        </div>
      )}
    </div>
  );
};
