/**
 * Pure mathematical functions for BPM manipulation, downbeat nudging,
 * beat shifting, and boundary clamping.
 */

export const MIN_BPM = 20.0;
export const MAX_BPM = 300.0;
export const MIN_DOWNBEAT_MS = 0.0;

export const ALL_CAMELOT_KEYS_24: readonly string[] = [
  '1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A',
  '1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '10B', '11B', '12B',
] as const;

/**
 * Clamps a number between min and max bounds.
 */
export function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Clamps and rounds a BPM value to one decimal place.
 */
export function clampBpm(bpm: number, minBpm: number = MIN_BPM, maxBpm: number = MAX_BPM): number {
  const clamped = clamp(bpm, minBpm, maxBpm);
  return Math.round(clamped * 10) / 10;
}

/**
 * Halves the tempo (divides by 2), clamped between min and max.
 */
export function halfBpm(bpm: number, minBpm: number = MIN_BPM, maxBpm: number = MAX_BPM): number {
  return clampBpm(bpm / 2.0, minBpm, maxBpm);
}

/**
 * Doubles the tempo (multiplies by 2), clamped between min and max.
 */
export function doubleBpm(bpm: number, minBpm: number = MIN_BPM, maxBpm: number = MAX_BPM): number {
  return clampBpm(bpm * 2.0, minBpm, maxBpm);
}

/**
 * Nudges the tempo by a delta (e.g. +0.1 or -0.1), preventing floating point drift.
 */
export function nudgeBpm(
  bpm: number,
  delta: number,
  minBpm: number = MIN_BPM,
  maxBpm: number = MAX_BPM
): number {
  return clampBpm(bpm + delta, minBpm, maxBpm);
}

/**
 * Calculates the duration of one beat in milliseconds from BPM.
 */
export function calculateBeatPeriodMs(bpm: number): number {
  if (bpm <= 0) return 0;
  return 60_000.0 / bpm;
}

/**
 * Nudges a timestamp in milliseconds by deltaMs, clamped to min >= 0 and optional max.
 */
export function nudgeDownbeat(
  currentMs: number,
  deltaMs: number,
  maxMs?: number
): number {
  const target = currentMs + deltaMs;
  const clamped = maxMs !== undefined
    ? clamp(target, MIN_DOWNBEAT_MS, maxMs)
    : Math.max(MIN_DOWNBEAT_MS, target);
  return Math.round(clamped * 10) / 10;
}

/**
 * Shifts downbeat position by one or more beats based on current BPM.
 * Positive shift moves forward in time, negative moves backward.
 */
export function shiftBeat(
  currentMs: number,
  bpm: number,
  direction: 1 | -1 = 1,
  maxMs?: number
): number {
  const periodMs = calculateBeatPeriodMs(bpm);
  return nudgeDownbeat(currentMs, direction * periodMs, maxMs);
}

/**
 * Checks if a string is a valid Camelot key code (1A-12A or 1B-12B).
 */
export function isValidCamelot(keyStr: string): boolean {
  if (!keyStr) return false;
  const match = keyStr.trim().match(/^(\d{1,2})([ABab])$/);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= 12;
}

/**
 * Normalizes Camelot code to uppercase (e.g. "8a" -> "8A").
 */
export function normalizeCamelot(keyStr: string): string | null {
  if (!isValidCamelot(keyStr)) return null;
  const match = keyStr.trim().match(/^(\d{1,2})([ABab])$/);
  if (!match) return null;
  return `${parseInt(match[1], 10)}${match[2].toUpperCase()}`;
}
