import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { SetlistPins } from './types';

/**
 * Validates and normalizes anchor pins for a setlist of a given length.
 * Pinning requires at least 2 tracks.
 * If totalCount <= 1, pins cannot apply and are reset to false.
 */
export function validatePins(totalCount: number, pins: SetlistPins): SetlistPins {
  if (totalCount <= 1) {
    return { lockFirst: false, lockLast: false };
  }
  return {
    lockFirst: Boolean(pins.lockFirst),
    lockLast: Boolean(pins.lockLast),
  };
}

/**
 * Standard array move helper (pure function).
 */
export function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const result = [...array];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

/**
 * Validates whether a drag-and-drop or manual move is permitted under active anchor pins.
 * Obeying the same rules across manual moves, drag reorder, and Suggest Order.
 */
export function isMovePermitted(
  fromIndex: number,
  toIndex: number,
  totalCount: number,
  pins: SetlistPins
): boolean {
  if (totalCount <= 1 || fromIndex === toIndex) return true;
  const validPins = validatePins(totalCount, pins);

  // Lock-first constraint: index 0 cannot be moved, and nothing can be moved into index 0
  if (validPins.lockFirst) {
    if (fromIndex === 0 || toIndex === 0) return false;
  }

  // Lock-last constraint: index totalCount - 1 cannot be moved, and nothing can be moved into it
  if (validPins.lockLast) {
    const lastIdx = totalCount - 1;
    if (fromIndex === lastIdx || toIndex === lastIdx) return false;
  }

  return true;
}

/**
 * Reorders setlist entries respecting lock-first and lock-last anchor pins.
 * Reassigns 1-based `position` values.
 */
export function reorderSetlistEntries(
  entries: SetlistEntry[],
  fromIndex: number,
  toIndex: number,
  pins: SetlistPins = { lockFirst: false, lockLast: false }
): SetlistEntry[] {
  if (entries.length <= 1 || fromIndex === toIndex) return entries;
  const validPins = validatePins(entries.length, pins);
  if (!isMovePermitted(fromIndex, toIndex, entries.length, validPins)) {
    return entries; // Move disallowed by pins, return unchanged
  }

  const moved = arrayMove(entries, fromIndex, toIndex);

  // Re-index position fields
  return moved.map((entry, index) => ({
    ...entry,
    position: index + 1,
  }));
}

/**
 * Applies pin constraints to suggested track IDs from the sequencer solver.
 *
 * If `lockFirst` is enabled, the original first track is forced to position 0.
 * If `lockLast` is enabled, the original last track is forced to position N-1.
 * The remaining tracks retain their relative order from `suggestedIds`.
 */
export function applyPinsToOrderedIds(
  originalIds: string[],
  suggestedIds: string[],
  pins: SetlistPins
): string[] {
  const n = originalIds.length;
  const validPins = validatePins(n, pins);
  const pinnedIds = validPins.pinnedIds ?? [];

  if (!validPins.lockFirst && !validPins.lockLast && pinnedIds.length === 0) {
    return [...suggestedIds];
  }

  // If arbitrary pinned tracks are specified, fix them at their original indices
  if (pinnedIds.length > 0) {
    const pinnedSet = new Set(pinnedIds);
    if (validPins.lockFirst && originalIds.length > 0) pinnedSet.add(originalIds[0]);
    if (validPins.lockLast && originalIds.length > 1) pinnedSet.add(originalIds[originalIds.length - 1]);

    const result: (string | null)[] = new Array(n).fill(null);
    originalIds.forEach((id, idx) => {
      if (pinnedSet.has(id)) {
        result[idx] = id;
      }
    });

    const unpinnedSuggested = suggestedIds.filter((id) => !pinnedSet.has(id));
    let uIdx = 0;
    for (let i = 0; i < n; i++) {
      if (result[i] === null && uIdx < unpinnedSuggested.length) {
        result[i] = unpinnedSuggested[uIdx++];
      }
    }
    return result.filter((id): id is string => Boolean(id));
  }

  const firstId = validPins.lockFirst ? originalIds[0] : null;
  const lastId = validPins.lockLast ? originalIds[n - 1] : null;

  // Filter out the pinned tracks from the suggested list
  const innerSuggested = suggestedIds.filter(
    (id) => id !== firstId && id !== lastId
  );

  const result: string[] = [];

  // Anchor first
  if (firstId) {
    result.push(firstId);
  }

  // Insert middle tracks in suggested order
  result.push(...innerSuggested);

  // Anchor last
  if (lastId) {
    result.push(lastId);
  }

  return result;
}

