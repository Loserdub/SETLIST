import { describe, it, expect } from 'vitest';
import {
  getTrackDisplayMetadata,
  getTrackDisplayTitle,
  getTrackDisplayArtist,
} from './trackDisplay';
import type { Track } from '../bindings/Track';

function createMockTrack(overrides: Partial<Track>): Track {
  return {
    id: 'track-1',
    path: 'C:\\Music\\Track.mp3',
    hash: 'hash-1',
    tags: {
      title: null,
      artist: null,
      album: null,
    },
    duration_ms: 180000,
    analysis: null,
    analyzed_at: null,
    analysis_version: null,
    ...overrides,
  };
}

describe('trackDisplay utilities', () => {
  it('uses embedded tags when present', () => {
    const track = createMockTrack({
      path: 'G:\\Songs\\128_bpm_track.wav',
      tags: {
        title: 'Solar Energy',
        artist: 'Lorde',
        album: 'Solar Energy LP',
      },
    });

    const meta = getTrackDisplayMetadata(track);
    expect(meta.title).toBe('Solar Energy');
    expect(meta.artist).toBe('Lorde');
    expect(getTrackDisplayTitle(track)).toBe('Solar Energy');
    expect(getTrackDisplayArtist(track)).toBe('Lorde');
  });

  it('falls back to filename stem when title tag is null or empty', () => {
    const track = createMockTrack({
      path: 'G:\\DJ Sets\\House\\Bicep - Glue.wav',
      tags: {
        title: null,
        artist: null,
        album: null,
      },
    });

    const meta = getTrackDisplayMetadata(track);
    expect(meta.title).toBe('Glue');
    expect(meta.artist).toBe('Bicep');
  });

  it('handles multi-segmented DJ filenames like "120 - 9A - Artist - Title.mp3"', () => {
    const track = createMockTrack({
      path: 'G:\\01_Songs_and_Exports\\03.01.26\\120 - 9A - Sante Sansone - Drop it.mp3',
      tags: {
        title: null,
        artist: null,
        album: null,
      },
    });

    const meta = getTrackDisplayMetadata(track);
    expect(meta.title).toBe('Drop it');
    expect(meta.artist).toBe('Sante Sansone');
  });

  it('strips leading track sequence numbers like "01 - My Song.aiff"', () => {
    const track = createMockTrack({
      path: 'C:\\Music\\04 - Summer Vibes.aiff',
      tags: {
        title: null,
        artist: null,
        album: null,
      },
    });

    const meta = getTrackDisplayMetadata(track);
    expect(meta.title).toBe('Summer Vibes');
  });

  it('prioritizes user custom overrides over tags and filenames', () => {
    const track = createMockTrack({
      path: 'C:\\Music\\raw_cut.wav',
      tags: {
        title: 'Draft 1',
        artist: 'Producer X',
        album: null,
      },
    });

    const meta = getTrackDisplayMetadata(track, 'Custom Master Edit', 'VIP Mix');
    expect(meta.title).toBe('Custom Master Edit');
    expect(meta.artist).toBe('VIP Mix');
  });

  it('handles null track gracefully', () => {
    expect(getTrackDisplayTitle(null)).toBe('Untitled Track');
    expect(getTrackDisplayArtist(null)).toBe('Unknown Artist');
  });
});
