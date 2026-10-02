import type { Camelot } from '../bindings/Camelot';
import type { CamelotLetter } from '../bindings/CamelotLetter';

/**
 * Standard harmonic Camelot Wheel color palette.
 * Each of the 12 wheel positions has paired shades for A (minor) and B (major).
 */
export const CAMELOT_COLOR_MAP: Record<string, string> = {
  // 1: Aqua / Light Cyan
  '1A': '#0ea5e9', // Ab minor
  '1B': '#38bdf8', // B major

  // 2: Blue-Cyan
  '2A': '#0284c7', // Eb minor
  '2B': '#0ea5e9', // F# major

  // 3: Blue
  '3A': '#2563eb', // Bb minor
  '3B': '#3b82f6', // Db major

  // 4: Royal Blue / Indigo
  '4A': '#4f46e5', // F minor
  '4B': '#6366f1', // Ab major

  // 5: Purple / Violet
  '5A': '#7c3aed', // C minor
  '5B': '#8b5cf6', // Eb major

  // 6: Deep Purple / Magenta
  '6A': '#9333ea', // G minor
  '6B': '#a855f7', // Bb major

  // 7: Pink / Rose
  '7A': '#db2777', // D minor
  '7B': '#ec4899', // F major

  // 8: Red
  '8A': '#dc2626', // A minor
  '8B': '#ef4444', // C major

  // 9: Red-Orange / Coral
  '9A': '#ea580c', // E minor
  '9B': '#f97316', // G major

  // 10: Orange / Amber
  '10A': '#d97706', // B minor
  '10B': '#f59e0b', // D major

  // 11: Yellow-Gold
  '11A': '#ca8a04', // F# minor
  '11B': '#eab308', // A major

  // 12: Emerald / Green
  '12A': '#059669', // C# minor
  '12B': '#10b981', // E major
};

/**
 * Normalizes any Camelot representation into a standard "8A", "11B", etc. string.
 */
export function normalizeCamelotKey(
  input: Camelot | string | { number: number; letter: CamelotLetter } | null | undefined
): string {
  if (!input) return '';
  if (typeof input === 'string') {
    const trimmed = input.trim().toUpperCase();
    return trimmed;
  }
  return `${input.number}${input.letter}`;
}

/**
 * Returns the hex color string for any given Camelot key.
 * Supports Camelot object or string format (e.g. "8A", "11B").
 * Covers all 24 keys (1A through 12A, 1B through 12B).
 *
 * @param input - Camelot object or key string
 * @returns Hex color string (e.g. "#dc2626")
 */
export function camelotColor(
  input: Camelot | string | { number: number; letter: CamelotLetter } | null | undefined
): string {
  const key = normalizeCamelotKey(input);
  return CAMELOT_COLOR_MAP[key] ?? '#64748b'; // default slate-500
}

/**
 * Returns appropriate text contrast color (white or dark) for the given Camelot key background.
 */
export function camelotTextColor(
  input: Camelot | string | { number: number; letter: CamelotLetter } | null | undefined
): string {
  const key = normalizeCamelotKey(input);
  // Light yellows get dark text, deeper tones get white text
  if (['10B', '11A', '11B'].includes(key)) {
    return '#0f172a'; // slate-900
  }
  return '#ffffff';
}

/**
 * Returns the list of all 24 valid Camelot key strings.
 */
export const ALL_CAMELOT_KEYS: string[] = [
  '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B',
  '5A', '5B', '6A', '6B', '7A', '7B', '8A', '8B',
  '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B',
];
