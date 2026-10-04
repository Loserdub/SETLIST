import type { Track } from '../../bindings/Track';
import type { TrackWithOverrides } from '../../api/overrides';
import type { LibraryFilters } from './types';
import { isHarmonicallyCompatible } from './harmonic';

/**
 * Pure function to extract the Camelot key string representation from a Track.
 */
export function getTrackCamelotKey(track: Track): string | null {
  if (!track.analysis?.key?.camelot) return null;
  const { number, letter } = track.analysis.key.camelot;
  return `${number}${letter}`;
}

/**
 * Checks whether a track requires user review.
 * A track needs review when:
 * 1. Analysis failed completely (track.analysis is missing/null)
 * 2. BPM is missing or non-positive (bpm <= 0)
 * 3. Camelot musical key is missing
 * Note: Key has no confidence field in core-types/ts-rs bindings.
 */
export function isTrackNeedsReview(track: Track): boolean {
  if (!track.analysis) return true;
  const bpm = track.analysis.rhythm?.grid?.bpm;
  if (bpm === undefined || bpm === null || bpm <= 0) return true;
  const camelot = track.analysis.key?.camelot;
  if (!camelot || !camelot.number || !camelot.letter) return true;
  return false;
}

/**
 * Checks whether any metadata or analysis field on this track has been edited/overridden by the user.
 */
export function isTrackEdited(
  track: Track,
  titleOverrides?: Record<string, string>,
  artistOverrides?: Record<string, string>
): boolean {
  if (titleOverrides && titleOverrides[track.id]) return true;
  if (artistOverrides && artistOverrides[track.id]) return true;
  const flags = (track as TrackWithOverrides).overrides;
  if (flags) {
    if (
      flags.bpm ||
      flags.first_downbeat_ms ||
      flags.key_camelot ||
      flags.cues ||
      flags.title ||
      flags.artist
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Filter tracks using the provided library filters.
 * Pure function with no side-effects.
 */
export function filterTracks(tracks: Track[], filters: LibraryFilters): Track[] {
  const query = filters.searchQuery.trim().toLowerCase();
  const selectedKeyNormalized = filters.selectedKey ? filters.selectedKey.trim().toUpperCase() : null;

  return tracks.filter((track) => {
    // 0. Needs Review Filter
    if (filters.needsReviewOnly && !isTrackNeedsReview(track)) {
      return false;
    }

    // 1. Text Search Filter
    if (query) {
      const title = track.tags.title?.toLowerCase() ?? '';
      const artist = track.tags.artist?.toLowerCase() ?? '';
      const album = track.tags.album?.toLowerCase() ?? '';
      const filename = track.path.split(/[/\\]/).pop()?.toLowerCase() ?? '';
      const keyStr = getTrackCamelotKey(track)?.toLowerCase() ?? '';
      const bpm = track.analysis?.rhythm?.grid?.bpm;
      const bpmStr = bpm ? Math.round(bpm).toString() : '';

      const matchesSearch =
        title.includes(query) ||
        artist.includes(query) ||
        album.includes(query) ||
        filename.includes(query) ||
        keyStr.includes(query) ||
        bpmStr.includes(query);

      if (!matchesSearch) return false;
    }

    // 2. BPM Range Filter
    const bpm = track.analysis?.rhythm?.grid?.bpm ?? null;
    if (filters.minBpm !== null) {
      if (bpm === null || bpm < filters.minBpm) return false;
    }
    if (filters.maxBpm !== null) {
      if (bpm === null || bpm > filters.maxBpm) return false;
    }

    // 3. Camelot Key Filter
    if (selectedKeyNormalized) {
      const trackKey = getTrackCamelotKey(track);
      if (!trackKey) return false;

      if (filters.includeCompatibleKeys) {
        if (!isHarmonicallyCompatible(selectedKeyNormalized, trackKey)) {
          return false;
        }
      } else {
        if (trackKey.toUpperCase() !== selectedKeyNormalized) {
          return false;
        }
      }
    }

    // 4. Energy Range Filter
    const energy = track.analysis?.energy_score ?? null;
    if (filters.minEnergy !== null) {
      if (energy === null || energy < filters.minEnergy) return false;
    }
    if (filters.maxEnergy !== null) {
      if (energy === null || energy > filters.maxEnergy) return false;
    }

    return true;
  });
}
