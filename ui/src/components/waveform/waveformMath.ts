import type { Waveform3Band } from '../../bindings/Waveform3Band';
import type { Segment } from '../../bindings/Segment';
import type { CuePoint } from '../../bindings/CuePoint';

export interface VisibleWindow {
  startTimeMs: number;
  endTimeMs: number;
  visibleDurationMs: number;
}

export interface WaveformSlice {
  startIndex: number;
  endIndex: number;
  pointCount: number;
}

export interface VisibleBeat {
  index: number;
  beatMs: number;
  isDownbeat: boolean;
  pixelX: number;
}

/**
 * Maps a millisecond timestamp to a horizontal canvas pixel position.
 * Pure function: deterministic and zero side effects.
 */
export function timeToPixel(
  timeMs: number,
  startTimeMs: number,
  visibleDurationMs: number,
  canvasWidth: number
): number {
  if (visibleDurationMs <= 0 || canvasWidth <= 0) return 0;
  return ((timeMs - startTimeMs) / visibleDurationMs) * canvasWidth;
}

/**
 * Maps a horizontal canvas pixel position to a millisecond timestamp.
 * Pure function: deterministic and zero side effects.
 */
export function pixelToTime(
  pixelX: number,
  startTimeMs: number,
  visibleDurationMs: number,
  canvasWidth: number
): number {
  if (canvasWidth <= 0) return startTimeMs;
  return startTimeMs + (pixelX / canvasWidth) * visibleDurationMs;
}

/**
 * Clamps the viewport start time so that the visible window cannot scroll
 * before 0 ms or past the total duration of the track.
 */
export function clampViewport(
  startTimeMs: number,
  visibleDurationMs: number,
  totalDurationMs: number
): number {
  if (totalDurationMs <= 0) return 0;
  if (visibleDurationMs >= totalDurationMs) return 0;
  const maxStart = Math.max(0, totalDurationMs - visibleDurationMs);
  return Math.max(0, Math.min(startTimeMs, maxStart));
}

/**
 * Computes the visible time window given total duration, zoom level (>= 1.0),
 * and an ideal scroll offset in milliseconds.
 */
export function getVisibleWindow(
  totalDurationMs: number,
  zoomLevel: number,
  scrollOffsetMs: number
): VisibleWindow {
  const safeDuration = Math.max(1, totalDurationMs);
  const safeZoom = Math.max(1, zoomLevel);
  const visibleDurationMs = safeDuration / safeZoom;
  const startTimeMs = clampViewport(scrollOffsetMs, visibleDurationMs, safeDuration);
  const endTimeMs = Math.min(safeDuration, startTimeMs + visibleDurationMs);

  return {
    startTimeMs,
    endTimeMs,
    visibleDurationMs,
  };
}

/**
 * Calculates start and end indices into the waveform sample arrays (peak/rms)
 * that correspond to the visible time window.
 * Supports both fixed points_per_sec rate and proportional total-length mapping.
 */
export function sliceWaveformWindow(
  waveform: Waveform3Band,
  startTimeMs: number,
  endTimeMs: number,
  totalDurationMs: number
): WaveformSlice {
  const totalPoints = waveform.low.peak.length;
  if (totalPoints === 0 || totalDurationMs <= 0) {
    return { startIndex: 0, endIndex: 0, pointCount: 0 };
  }

  let startIndex = 0;
  let endIndex = 0;

  // Check if points_per_sec accurately describes the array length
  const expectedPoints = (totalDurationMs / 1000) * waveform.points_per_sec;
  const isDirectRate =
    waveform.points_per_sec > 0 &&
    Math.abs(expectedPoints - totalPoints) <= Math.max(2, totalPoints * 0.05);

  if (isDirectRate) {
    startIndex = Math.floor((startTimeMs / 1000) * waveform.points_per_sec);
    endIndex = Math.ceil((endTimeMs / 1000) * waveform.points_per_sec);
  } else {
    // Proportional fallback (e.g. for condensed mock waveforms)
    startIndex = Math.floor((startTimeMs / totalDurationMs) * totalPoints);
    endIndex = Math.ceil((endTimeMs / totalDurationMs) * totalPoints);
  }

  // Include 1 extra point buffer on each side for smooth edge transitions
  startIndex = Math.max(0, Math.min(startIndex - 1, totalPoints - 1));
  endIndex = Math.max(startIndex, Math.min(endIndex + 1, totalPoints));

  return {
    startIndex,
    endIndex,
    pointCount: Math.max(0, endIndex - startIndex),
  };
}

/**
 * Filters beat timestamps that fall within the visible window, including
 * their downbeat status and pixel coordinates.
 */
export function filterVisibleBeats(
  beatsMs: number[],
  downbeatFlags: boolean[],
  startTimeMs: number,
  endTimeMs: number,
  canvasWidth: number,
  paddingMs: number = 100
): VisibleBeat[] {
  const visible: VisibleBeat[] = [];
  const minTime = startTimeMs - paddingMs;
  const maxTime = endTimeMs + paddingMs;
  const visibleDuration = endTimeMs - startTimeMs;

  for (let i = 0; i < beatsMs.length; i++) {
    const t = beatsMs[i];
    if (t >= minTime && t <= maxTime) {
      visible.push({
        index: i,
        beatMs: t,
        isDownbeat: Boolean(downbeatFlags[i]),
        pixelX: timeToPixel(t, startTimeMs, visibleDuration, canvasWidth),
      });
    }
  }

  return visible;
}

/**
 * Filters structural segments that intersect with the visible window.
 */
export function filterVisibleSegments(
  segments: Segment[],
  startTimeMs: number,
  endTimeMs: number
): Segment[] {
  return segments.filter((seg) => seg.end_ms >= startTimeMs && seg.start_ms <= endTimeMs);
}

/**
 * Filters cue points that are visible or whose loop spans into the visible window.
 */
export function filterVisibleCues(
  cues: CuePoint[],
  startTimeMs: number,
  endTimeMs: number,
  paddingMs: number = 200
): CuePoint[] {
  const minT = startTimeMs - paddingMs;
  const maxT = endTimeMs + paddingMs;

  return cues.filter((cue) => {
    if (cue.time_ms >= minT && cue.time_ms <= maxT) return true;
    if (cue.loop_end_ms !== null && cue.loop_end_ms >= startTimeMs && cue.time_ms <= endTimeMs) {
      return true;
    }
    return false;
  });
}

/**
 * Formats milliseconds into mm:ss.ms string for DJ display.
 */
export function formatTimeMs(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return '0:00.0';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}
