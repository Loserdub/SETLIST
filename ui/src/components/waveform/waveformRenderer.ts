import type { TrackAnalysis } from '../../bindings/TrackAnalysis';
import {
  timeToPixel,
  pixelToTime,
  sliceWaveformWindow,
  filterVisibleBeats,
  filterVisibleSegments,
  filterVisibleCues,
} from './waveformMath';
import { FOUR_POINT_CUE_CONFIG, type PerformanceCueSlot } from '../../features/track/cues/fourPointCues';

export const SEGMENT_COLORS: Record<string, string> = {
  intro: '#0284c7', // Sky Blue
  verse: '#4f46e5', // Indigo
  buildup: '#ea580c', // Orange
  drop: '#dc2626', // Red
  breakdown: '#7c3aed', // Purple
  outro: '#059669', // Emerald
};

export interface RenderStaticWaveformOptions {
  dimensions: { width: number; height: number };
  analysis: TrackAnalysis;
  durationMs: number;
  startTimeMs: number;
  visibleDurationMs: number;
  isCuesOverridden?: boolean;
}

export interface RenderDynamicOverlaysOptions {
  dimensions: { width: number; height: number };
  startTimeMs: number;
  visibleDurationMs: number;
  playheadPositionMs: number | null;
  hoverPixelX: number | null;
  hoverTimeMs: number | null;
  isDragging: boolean;
}

export interface RenderWaveformOptions extends RenderStaticWaveformOptions, RenderDynamicOverlaysOptions {}

export function renderStaticWaveform(
  ctx: CanvasRenderingContext2D,
  options: RenderStaticWaveformOptions
): void {
  const {
    dimensions,
    analysis,
    durationMs,
    startTimeMs,
    visibleDurationMs,
    isCuesOverridden = false,
  } = options;

  const { width, height } = dimensions;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

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

  ctx.restore();
}

export function renderDynamicOverlays(
  ctx: CanvasRenderingContext2D,
  options: RenderDynamicOverlaysOptions
): void {
  const {
    dimensions,
    startTimeMs,
    visibleDurationMs,
    playheadPositionMs,
    hoverPixelX,
    hoverTimeMs,
    isDragging,
  } = options;

  const { width, height } = dimensions;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const endTimeMs = startTimeMs + visibleDurationMs;

  ctx.save();
  ctx.scale(dpr, dpr);

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
}

export function renderWaveformScene(
  ctx: CanvasRenderingContext2D,
  options: RenderWaveformOptions
): void {
  renderStaticWaveform(ctx, options);
  renderDynamicOverlays(ctx, options);
}
