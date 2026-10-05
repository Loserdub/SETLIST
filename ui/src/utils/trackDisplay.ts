import type { Track } from '../bindings/Track';

export interface ParsedTrackMetadata {
  title: string;
  artist: string;
}

/**
 * Extracts a clean title and artist from a track, falling back intelligently to
 * the audio file's name and directory when ID3/container tags are absent.
 */
export function getTrackDisplayMetadata(
  track?: Track | null,
  customTitle?: string | null,
  customArtist?: string | null
): ParsedTrackMetadata {
  if (!track) {
    return { title: 'Untitled Track', artist: 'Unknown Artist' };
  }

  // 1. Explicit user override takes top priority
  if (customTitle && customTitle.trim().length > 0) {
    const artist = customArtist?.trim() || track.tags.artist?.trim() || 'Unknown Artist';
    return { title: customTitle.trim(), artist };
  }

  // 2. Extracted metadata tag title
  const tagTitle = track.tags.title?.trim();
  const tagArtist = track.tags.artist?.trim();

  if (tagTitle && tagTitle.length > 0) {
    return {
      title: tagTitle,
      artist: customArtist?.trim() || tagArtist || 'Unknown Artist',
    };
  }

  // 3. Fallback: Parse filename stem
  const rawFilename = track.path.split(/[/\\]/).pop() || '';
  const lastDot = rawFilename.lastIndexOf('.');
  const stem = lastDot > 0 ? rawFilename.slice(0, lastDot) : rawFilename;

  // Clean leading track sequence numbers (e.g. "01 - ", "02. ", "03_")
  const strippedStem = stem.replace(/^\d+[\s._-]+/, '').trim();

  // Check for "Artist - Title" or "BPM - Key - Artist - Title" patterns
  if (strippedStem.includes(' - ')) {
    const parts = strippedStem.split(' - ').map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length >= 2) {
      const parsedTitle = parts[parts.length - 1];
      const parsedArtist = parts[parts.length - 2];
      return {
        title: parsedTitle || stem || 'Untitled Track',
        artist: customArtist?.trim() || tagArtist || parsedArtist || 'Unknown Artist',
      };
    }
  }

  return {
    title: strippedStem || stem || 'Untitled Track',
    artist: customArtist?.trim() || tagArtist || 'Unknown Artist',
  };
}

/**
 * Convenient helper to retrieve the display title of a track.
 */
export function getTrackDisplayTitle(
  track?: Track | null,
  customTitle?: string | null
): string {
  return getTrackDisplayMetadata(track, customTitle).title;
}

/**
 * Convenient helper to retrieve the display artist of a track.
 */
export function getTrackDisplayArtist(
  track?: Track | null,
  customArtist?: string | null
): string {
  return getTrackDisplayMetadata(track, null, customArtist).artist;
}
