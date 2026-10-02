import type { Track } from '../../bindings/Track';
import type { SortDirection, SortField } from './types';

/**
 * Compare two tracks by their Camelot key.
 * Order: 1A, 1B, 2A, 2B, ..., 12A, 12B.
 */
function compareCamelotKeys(a: Track, b: Track): number {
  const camelotA = a.analysis?.key?.camelot;
  const camelotB = b.analysis?.key?.camelot;

  if (!camelotA && !camelotB) return 0;
  if (!camelotA) return 1;
  if (!camelotB) return -1;

  if (camelotA.number !== camelotB.number) {
    return camelotA.number - camelotB.number;
  }
  return camelotA.letter.localeCompare(camelotB.letter);
}

/**
 * Pure function to sort tracks by a specified field and direction.
 * Returns a new array, does not mutate the original.
 */
export function sortTracks(
  tracks: Track[],
  field: SortField,
  direction: SortDirection
): Track[] {
  const multiplier = direction === 'asc' ? 1 : -1;
  const copy = [...tracks];

  return copy.sort((a, b) => {
    let comparison = 0;

    switch (field) {
      case 'title': {
        const titleA = a.tags.title ?? '';
        const titleB = b.tags.title ?? '';
        comparison = titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
        break;
      }
      case 'artist': {
        const artistA = a.tags.artist ?? '';
        const artistB = b.tags.artist ?? '';
        comparison = artistA.localeCompare(artistB, undefined, { sensitivity: 'base' });
        break;
      }
      case 'bpm': {
        const bpmA = a.analysis?.rhythm?.grid?.bpm ?? 0;
        const bpmB = b.analysis?.rhythm?.grid?.bpm ?? 0;
        comparison = bpmA - bpmB;
        break;
      }
      case 'key': {
        comparison = compareCamelotKeys(a, b);
        break;
      }
      case 'energy': {
        const energyA = a.analysis?.energy_score ?? 0;
        const energyB = b.analysis?.energy_score ?? 0;
        comparison = energyA - energyB;
        break;
      }
      case 'lufs': {
        const lufsA = a.analysis?.loudness?.integrated_lufs ?? -999;
        const lufsB = b.analysis?.loudness?.integrated_lufs ?? -999;
        comparison = lufsA - lufsB;
        break;
      }
      case 'duration': {
        const durA = a.duration_ms ?? 0;
        const durB = b.duration_ms ?? 0;
        comparison = durA - durB;
        break;
      }
    }

    if (comparison === 0) {
      // Stable tie-breaker by ID
      return a.id.localeCompare(b.id) * multiplier;
    }

    return comparison * multiplier;
  });
}
