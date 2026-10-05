import type { BeatGrid } from '../../bindings/BeatGrid';
import type { PlayerState } from '../../api/playback';

export type TrackKeyboardAction =
  | { type: 'toggle_play_pause' }
  | { type: 'seek'; targetMs: number }
  | { type: 'step_speed'; direction: 'up' | 'down' }
  | { type: 'jump_cue'; cueIndex: number };

export interface KeyboardActionInput {
  key: string;
  code?: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  targetTagName?: string;
  isContentEditable?: boolean;
}

export interface KeyboardActionContext {
  currentPositionMs: number;
  durationMs: number;
  grid?: BeatGrid | null;
}

/**
 * Computes the target timestamp for a 1-bar seek forward or backward.
 * Uses detected downbeats from the beat grid when available;
 * falls back to 4 beats based on BPM.
 *
 * Pure function: deterministic and zero side effects.
 */
export function calculateBarSeek(
  currentMs: number,
  direction: 'forward' | 'backward',
  grid: BeatGrid | null | undefined,
  totalDurationMs: number = Infinity
): number {
  const safeDuration = Math.max(0, totalDurationMs);
  if (safeDuration === 0) return 0;

  const bpm = grid && grid.bpm > 0 ? grid.bpm : 120;
  // 1 bar in 4/4 is 4 beats
  const barDurationMs = (60_000 / bpm) * 4;

  if (grid && Array.isArray(grid.beats_ms) && grid.beats_ms.length > 0) {
    const downbeats: number[] = [];
    if (Array.isArray(grid.downbeat_flags) && grid.downbeat_flags.length === grid.beats_ms.length) {
      for (let i = 0; i < grid.beats_ms.length; i++) {
        if (Boolean(grid.downbeat_flags[i])) {
          downbeats.push(grid.beats_ms[i]);
        }
      }
    }

    const EPSILON_MS = 25; // Tolerance threshold when already at a downbeat

    if (direction === 'forward') {
      if (downbeats.length > 0) {
        const nextDownbeat = downbeats.find((db) => db > currentMs + EPSILON_MS);
        if (nextDownbeat !== undefined) {
          return Math.min(safeDuration, nextDownbeat);
        }
      }
      return Math.min(safeDuration, currentMs + barDurationMs);
    } else {
      // 'backward'
      if (downbeats.length > 0) {
        for (let i = downbeats.length - 1; i >= 0; i--) {
          if (downbeats[i] < currentMs - EPSILON_MS) {
            return Math.max(0, downbeats[i]);
          }
        }
      }
      return Math.max(0, currentMs - barDurationMs);
    }
  }

  // Fallback using BPM when beat array is absent
  if (direction === 'forward') {
    return Math.min(safeDuration, currentMs + barDurationMs);
  } else {
    return Math.max(0, currentMs - barDurationMs);
  }
}

/**
 * Interpolates playback position between 50 ms events using real-time elapsed clock and speed multiplier.
 *
 * Pure function: deterministic and zero side effects.
 */
export function interpolatePosition(
  lastPositionMs: number,
  lastEventTimestamp: number,
  nowTimestamp: number,
  state: PlayerState,
  durationMs: number,
  speed: number = 1.0
): number {
  const safeDuration = Math.max(0, durationMs);
  if (safeDuration === 0) return 0;

  if (state !== 'playing') {
    return Math.max(0, Math.min(safeDuration, lastPositionMs));
  }

  const safeSpeed = Math.max(0.1, Math.min(4.0, Number.isFinite(speed) ? speed : 1.0));
  const elapsed = Math.max(0, nowTimestamp - lastEventTimestamp) * safeSpeed;
  return Math.max(0, Math.min(safeDuration, lastPositionMs + elapsed));
}

/**
 * Pure keyboard event handler for the Track View:
 * - Space: toggles play and pause
 * - Left Arrow: seek 5 seconds backward
 * - Right Arrow: seek 5 seconds forward
 * - Shift + Left Arrow: seek 1 bar backward using beat grid
 * - Shift + Right Arrow: seek 1 bar forward using beat grid
 *
 * Ignores keystrokes if the user is typing in a form input or holding modifier keys.
 *
 * Pure function: deterministic and zero side effects.
 */
export function handleTrackKeyDown(
  input: KeyboardActionInput,
  context: KeyboardActionContext
): TrackKeyboardAction | null {
  // If focused on an interactive input element, never intercept keystrokes
  if (
    input.targetTagName === 'INPUT' ||
    input.targetTagName === 'TEXTAREA' ||
    input.targetTagName === 'SELECT' ||
    input.isContentEditable
  ) {
    return null;
  }

  // Ignore keyboard shortcuts if modifier keys like Ctrl, Alt, Meta are held
  if (input.ctrlKey || input.altKey || input.metaKey) {
    return null;
  }

  const { currentPositionMs, durationMs, grid } = context;

  // Space toggles play and pause
  if (input.code === 'Space' || input.key === ' ' || input.key === 'Spacebar') {
    return { type: 'toggle_play_pause' };
  }

  // Left Arrow: seek backward
  if (input.key === 'ArrowLeft') {
    if (input.shiftKey) {
      // Shift + Left Arrow: seek 1 bar backward
      const targetMs = calculateBarSeek(currentPositionMs, 'backward', grid, durationMs);
      return { type: 'seek', targetMs };
    } else {
      // Left Arrow: seek 5 seconds backward
      const targetMs = Math.max(0, currentPositionMs - 5000);
      return { type: 'seek', targetMs };
    }
  }

  // Right Arrow: seek forward
  if (input.key === 'ArrowRight') {
    if (input.shiftKey) {
      // Shift + Right Arrow: seek 1 bar forward
      const targetMs = calculateBarSeek(currentPositionMs, 'forward', grid, durationMs);
      return { type: 'seek', targetMs };
    } else {
      // Right Arrow: seek 5 seconds forward
      const targetMs = Math.min(durationMs, currentPositionMs + 5000);
      return { type: 'seek', targetMs };
    }
  }

  // Speed adjustments: [ or < to decrease, ] or > to increase
  if (input.key === '[' || (input.shiftKey && (input.key === '<' || input.key === ','))) {
    return { type: 'step_speed', direction: 'down' };
  }

  if (input.key === ']' || (input.shiftKey && (input.key === '>' || input.key === '.'))) {
    return { type: 'step_speed', direction: 'up' };
  }

  // Number keys 1-8: Trigger Hot Cue jump to Cue A-H (registers 0-7)
  if (!input.shiftKey && input.key >= '1' && input.key <= '8') {
    const cueIndex = parseInt(input.key, 10) - 1;
    return { type: 'jump_cue', cueIndex };
  }

  return null;
}
