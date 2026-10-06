import type { Track } from '../bindings/Track';
import type { Song } from '../bindings/Song';
import type { SetlistEntry } from '../bindings/SetlistEntry';
import type { SetlistItem } from '../bindings/SetlistItem';

/**
 * Converts a Track entity into a normalized Song domain model.
 */
export function trackToSong(track: Track): Song {
  const bpm = track.analysis?.rhythm?.grid?.bpm ?? null;
  const camelot = track.analysis?.key?.camelot;
  const camelotCode = camelot ? `${camelot.number}${camelot.letter}` : null;
  const mode = track.analysis?.key?.mode ?? null;
  const energy = track.analysis?.energy_score ?? null;

  // Extract fallback title from path if title tag is missing
  const pathParts = track.path.split(/[/\\]/);
  const fallbackTitle = pathParts[pathParts.length - 1] || 'Untitled';

  return {
    id: track.id,
    title: track.tags?.title ?? fallbackTitle,
    artist: track.tags?.artist ?? 'Unknown Artist',
    duration_seconds: Math.max(0, track.duration_ms / 1000.0),
    bpm: bpm !== null && bpm >= 20 && bpm <= 300 ? Math.round(bpm * 10) / 10 : null,
    musical_key: camelotCode,
    mode,
    camelot_code: camelotCode,
    tuning: 'Standard',
    capo: 0,
    energy_rating: energy !== null && energy >= 1 && energy <= 10 ? energy : null,
    lead_performer: track.tags?.artist ?? null,
    tags: [],
    notes: null,
  };
}

/**
 * Converts a UI SetlistEntry into a normalized SetlistItem domain model.
 */
export function entryToSetlistItem(entry: SetlistEntry): SetlistItem {
  const song: Song | null = entry.track ? trackToSong(entry.track) : null;
  return {
    id: `item-${entry.position}-${entry.track_id}`,
    position: entry.position,
    item: {
      type: 'Song',
      data: {
        song_id: entry.track_id,
        song,
      },
    },
    transition: entry.transition,
    target_energy: entry.target_energy,
    notes: null,
  };
}

/**
 * Converts a SetlistItem into a UI SetlistEntry, resolving Track details if available.
 */
export function setlistItemToEntry(item: SetlistItem, tracksMap: Map<string, Track>): SetlistEntry {
  if (item.item.type === 'Song') {
    const trackId = item.item.data.song_id;
    const track = tracksMap.get(trackId) ?? null;
    return {
      position: item.position,
      track_id: trackId,
      track,
      transition: item.transition,
      target_energy: item.target_energy,
    };
  } else {
    const label =
      item.item.type === 'Banter'
        ? `Banter: ${item.item.data.topic}`
        : item.item.type === 'Intermission'
        ? `Intermission (${Math.round(item.item.data.duration_seconds / 60)}m)`
        : item.item.type === 'TuningChange'
        ? `Tuning: ${item.item.data.target_tuning}`
        : `Custom: ${item.item.data.title}`;

    return {
      position: item.position,
      track_id: item.id,
      track: {
        id: item.id,
        path: '',
        hash: `hash_${item.id}`,
        tags: {
          title: label,
          artist: item.item.type,
          album: null,
        },
        duration_ms: (item.item.type === 'Intermission' ? item.item.data.duration_seconds : 0) * 1000,
        analysis: null,
        analyzed_at: null,
        analysis_version: null,
      },
      transition: item.transition,
      target_energy: item.target_energy,
    };
  }
}
