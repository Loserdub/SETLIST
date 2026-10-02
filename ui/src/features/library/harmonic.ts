/**
 * Pure functions for Camelot harmonic key compatibility and relationships.
 * Follows the 12-hour Camelot wheel system:
 * - Numbers 1 through 12
 * - 'A' = Minor, 'B' = Major
 */

export interface ParsedCamelotKey {
  number: number;
  letter: 'A' | 'B';
}

/**
 * Parse a Camelot key string (e.g. "8A", "11B", "8a") into number and letter.
 * Returns null if the format is invalid.
 */
export function parseCamelotKey(key: string): ParsedCamelotKey | null {
  const trimmed = key.trim().toUpperCase();
  const match = /^([1-9]|1[0-2])([AB])$/.exec(trimmed);
  if (!match) return null;

  return {
    number: parseInt(match[1], 10),
    letter: match[2] as 'A' | 'B',
  };
}

/**
 * Get all harmonically compatible Camelot keys for a given key.
 *
 * Primary harmonic mixing relationships:
 * 1. Exact match (0 semitone shift / same key): e.g. 8A
 * 2. Relative Major/Minor swap: e.g. 8B (same number, mode flip)
 * 3. Dominant (+1 on wheel, perfect fifth up): e.g. 9A
 * 4. Subdominant (-1 on wheel, perfect fifth down): e.g. 7A
 * 5. Relative Dominant (+1 on wheel, relative mode): e.g. 9B
 * 6. Relative Subdominant (-1 on wheel, relative mode): e.g. 7B
 *
 * @param key The base Camelot key (e.g. "8A")
 * @param includeAdjacentRelatives Whether to include +/-1 relative keys (default true)
 * @returns Array of unique compatible Camelot key strings (e.g. ["8A", "8B", "9A", "7A", "9B", "7B"])
 */
export function getCompatibleCamelotKeys(
  key: string,
  includeAdjacentRelatives: boolean = true
): string[] {
  const parsed = parseCamelotKey(key);
  if (!parsed) return [key.trim().toUpperCase()];

  const { number, letter } = parsed;
  const oppositeLetter: 'A' | 'B' = letter === 'A' ? 'B' : 'A';

  // Wheel wrap around: 1 - 1 = 12, 12 + 1 = 1
  const upNumber = (number % 12) + 1;
  const downNumber = ((number - 2 + 12) % 12) + 1;

  const compatible = new Set<string>();

  // 1. Exact match
  compatible.add(`${number}${letter}`);

  // 2. Relative major/minor switch
  compatible.add(`${number}${oppositeLetter}`);

  // 3. Dominant (+1 fifth)
  compatible.add(`${upNumber}${letter}`);

  // 4. Subdominant (-1 fifth)
  compatible.add(`${downNumber}${letter}`);

  // 5. Adjacent relative keys
  if (includeAdjacentRelatives) {
    compatible.add(`${upNumber}${oppositeLetter}`);
    compatible.add(`${downNumber}${oppositeLetter}`);
  }

  return Array.from(compatible);
}

/**
 * Determine whether two Camelot keys are harmonically compatible.
 */
export function isHarmonicallyCompatible(
  keyA: string,
  keyB: string,
  includeAdjacentRelatives: boolean = true
): boolean {
  const normalizedB = keyB.trim().toUpperCase();
  const compatibleSet = new Set(getCompatibleCamelotKeys(keyA, includeAdjacentRelatives));
  return compatibleSet.has(normalizedB);
}

/**
 * Calculate circular distance on the Camelot wheel (0 to 6).
 */
export function getCamelotDistance(keyA: string, keyB: string): number | null {
  const pA = parseCamelotKey(keyA);
  const pB = parseCamelotKey(keyB);
  if (!pA || !pB) return null;

  const diff = Math.abs(pA.number - pB.number);
  return Math.min(diff, 12 - diff);
}
