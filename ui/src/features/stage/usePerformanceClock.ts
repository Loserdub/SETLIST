import { useEffect, useRef, useState } from 'react';

/**
 * Performance clock hook for Stage Mode.
 * Provides elapsed time since start, estimated remaining, and per-song stats.
 * Updates every second while active.
 */
export function usePerformanceClock(
  active: boolean,
  startTime: number | null,
  totalDurationMs: number | null,
  currentSongDurationMs: number | null,
  elapsedSongsMs: number
) {
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || startTime === null) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setNow(Date.now());
    intervalRef.current = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, startTime]);

  const elapsedMs = active && startTime !== null ? now - startTime : 0;

  const remainingMs =
    totalDurationMs !== null ? Math.max(0, totalDurationMs - elapsedSongsMs) : null;

  return {
    /** Wall-clock elapsed since Stage Mode started (ms) */
    elapsedMs,
    /** Estimated remaining set time based on track durations (ms), null if durations missing */
    remainingMs,
    /** Total set duration from track metadata (ms), null if any track is missing duration */
    totalDurationMs,
    /** Current song duration (ms), null if unknown */
    currentSongDurationMs,
  };
}

/**
 * Formats milliseconds into MM:SS or HH:MM:SS string.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Formats milliseconds into a compact "Xh Ym" or "Xm" string.
 */
export function formatDurationCompact(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${totalMinutes}m`;
}
