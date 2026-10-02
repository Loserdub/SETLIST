import { describe, it, expect } from 'vitest';
import {
  getCompatibleCamelotKeys,
  isHarmonicallyCompatible,
  parseCamelotKey,
  getCamelotDistance,
} from './harmonic';
import { filterTracks, getTrackCamelotKey } from './filters';
import { sortTracks } from './sorting';
import { generateMockTracks } from './mock5000';
import { DEFAULT_FILTERS } from './types';
import type { Track } from '../../bindings/Track';

// Helper to construct minimalist mock track
function makeTestTrack(
  id: string,
  title: string,
  artist: string,
  bpm: number,
  camelotNum: number,
  camelotLetter: 'A' | 'B',
  energy: number,
  lufs: number,
  durationSecs: number
): Track {
  return {
    id,
    path: `/music/${artist}_${title}.mp3`,
    hash: `hash-${id}`,
    duration_ms: durationSecs * 1000,
    tags: { title, artist, album: 'Test Album' },
    analyzed_at: '2026-10-01T20:00:00Z',
    analysis_version: '1.0.0',
    analysis: {
      loudness: { integrated_lufs: lufs, loudness_range: 4.0, true_peak: -0.1 },
      rhythm: {
        grid: {
          first_downbeat_ms: 0,
          bpm,
          beats_ms: [0, 60000 / bpm],
          downbeat_flags: [true, false],
          steady: true,
        },
        bpm_alternates: [bpm * 2, bpm * 0.5],
      },
      key: {
        pitch_class: (camelotNum * 7) % 12,
        mode: camelotLetter === 'A' ? 'Minor' : 'Major',
        camelot: { number: camelotNum, letter: camelotLetter },
        tuning_cents: 0,
      },
      dynamics: {
        frame_rate: 86.13,
        rms_curve: [0.5],
        low_ratio_curve: [0.5],
        centroid_curve: [1000],
      },
      energy_score: energy,
      energy_curve: { per_bar: [energy] },
      segments: [],
      cue_points: [],
      waveform: {
        points_per_sec: 150,
        low: { peak: [100], rms: [50] },
        mid: { peak: [80], rms: [40] },
        high: { peak: [60], rms: [30] },
      },
    },
  };
}

describe('Camelot Harmonic Key Compatibility (pure functions)', () => {
  it('parses valid Camelot keys and rejects invalid formats', () => {
    expect(parseCamelotKey('8A')).toEqual({ number: 8, letter: 'A' });
    expect(parseCamelotKey('11B')).toEqual({ number: 11, letter: 'B' });
    expect(parseCamelotKey('  1a  ')).toEqual({ number: 1, letter: 'A' });
    expect(parseCamelotKey('12b')).toEqual({ number: 12, letter: 'B' });

    expect(parseCamelotKey('0A')).toBeNull();
    expect(parseCamelotKey('13B')).toBeNull();
    expect(parseCamelotKey('8C')).toBeNull();
    expect(parseCamelotKey('random')).toBeNull();
  });

  it('computes exact, relative, and 5th harmonic neighbors for 8A', () => {
    const compatible = getCompatibleCamelotKeys('8A');

    // Exact match: 8A
    expect(compatible).toContain('8A');
    // Relative switch: 8B
    expect(compatible).toContain('8B');
    // Subdominant (-1 fifth): 7A
    expect(compatible).toContain('7A');
    // Dominant (+1 fifth): 9A
    expect(compatible).toContain('9A');
    // Relative subdominant and dominant
    expect(compatible).toContain('7B');
    expect(compatible).toContain('9B');

    // Should NOT contain far dissonance
    expect(compatible).not.toContain('2A'); // Tritone (+6)
    expect(compatible).not.toContain('5A');
  });

  it('correctly handles Camelot wheel wrap-around (1A <-> 12A, 1B <-> 12B)', () => {
    // 1A down a fifth wraps to 12A
    const comp1A = getCompatibleCamelotKeys('1A');
    expect(comp1A).toContain('12A');
    expect(comp1A).toContain('2A');
    expect(comp1A).toContain('1B');
    expect(comp1A).toContain('12B');
    expect(comp1A).toContain('2B');

    // 12B up a fifth wraps to 1B
    const comp12B = getCompatibleCamelotKeys('12B');
    expect(comp12B).toContain('1B');
    expect(comp12B).toContain('11B');
    expect(comp12B).toContain('12A');
    expect(comp12B).toContain('1A');
    expect(comp12B).toContain('11A');
  });

  it('evaluates isHarmonicallyCompatible correctly', () => {
    expect(isHarmonicallyCompatible('8A', '8A')).toBe(true);
    expect(isHarmonicallyCompatible('8A', '8B')).toBe(true);
    expect(isHarmonicallyCompatible('8A', '9A')).toBe(true);
    expect(isHarmonicallyCompatible('8A', '7A')).toBe(true);

    // Tritone (distance 6) is completely incompatible
    expect(isHarmonicallyCompatible('8A', '2A')).toBe(false);
    expect(isHarmonicallyCompatible('8A', '3B')).toBe(false);
  });

  it('computes circular distance on Camelot wheel', () => {
    expect(getCamelotDistance('8A', '8A')).toBe(0);
    expect(getCamelotDistance('8A', '9B')).toBe(1);
    expect(getCamelotDistance('1A', '12A')).toBe(1); // wrap distance
    expect(getCamelotDistance('1A', '7A')).toBe(6);  // maximum distance
    expect(getCamelotDistance('2A', '8A')).toBe(6);  // tritone
  });
});

describe('Track Filtering (filterTracks pure function)', () => {
  const tracks: Track[] = [
    makeTestTrack('1', 'Solaris', 'Eric Prydz', 126.0, 8, 'A', 7, -8.5, 300),
    makeTestTrack('2', 'Opus', 'Eric Prydz', 128.0, 8, 'B', 9, -7.0, 360),
    makeTestTrack('3', 'Glue', 'Bicep', 130.0, 9, 'A', 6, -9.0, 280),
    makeTestTrack('4', 'Strobe', 'Deadmau5', 128.0, 11, 'B', 8, -6.5, 420),
    makeTestTrack('5', 'Halcyon', 'Orbital', 122.0, 2, 'A', 4, -12.0, 240),
  ];

  it('filters by text search across title, artist, and key', () => {
    const resultTitle = filterTracks(tracks, { ...DEFAULT_FILTERS, searchQuery: 'solaris' });
    expect(resultTitle).toHaveLength(1);
    expect(resultTitle[0].id).toBe('1');

    const resultArtist = filterTracks(tracks, { ...DEFAULT_FILTERS, searchQuery: 'eric prydz' });
    expect(resultArtist).toHaveLength(2);

    const resultKey = filterTracks(tracks, { ...DEFAULT_FILTERS, searchQuery: '11B' });
    expect(resultKey).toHaveLength(1);
    expect(resultKey[0].tags.title).toBe('Strobe');
  });

  it('filters by BPM range', () => {
    const result = filterTracks(tracks, {
      ...DEFAULT_FILTERS,
      minBpm: 126.0,
      maxBpm: 128.0,
    });
    // Should include Solaris (126), Opus (128), Strobe (128)
    expect(result.map((t) => t.tags.title)).toEqual(['Solaris', 'Opus', 'Strobe']);
  });

  it('filters by Camelot key exact match', () => {
    const result = filterTracks(tracks, {
      ...DEFAULT_FILTERS,
      selectedKey: '8A',
      includeCompatibleKeys: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].tags.title).toBe('Solaris');
  });

  it('filters by Camelot key with harmonic compatibility enabled', () => {
    // 8A compatible with 8A (Solaris), 8B (Opus), 9A (Glue). 11B (Strobe) and 2A (Halcyon) are not.
    const result = filterTracks(tracks, {
      ...DEFAULT_FILTERS,
      selectedKey: '8A',
      includeCompatibleKeys: true,
    });
    expect(result.map((t) => t.tags.title)).toEqual(['Solaris', 'Opus', 'Glue']);
  });

  it('filters by energy range', () => {
    const result = filterTracks(tracks, {
      ...DEFAULT_FILTERS,
      minEnergy: 8,
      maxEnergy: 10,
    });
    expect(result.map((t) => t.tags.title)).toEqual(['Opus', 'Strobe']);
  });

  it('combines multiple filters simultaneously', () => {
    const result = filterTracks(tracks, {
      ...DEFAULT_FILTERS,
      searchQuery: 'Eric',
      minBpm: 127.0,
      maxBpm: 132.0,
      selectedKey: '8B',
      includeCompatibleKeys: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].tags.title).toBe('Opus');
  });
});

describe('Track Sorting (sortTracks pure function)', () => {
  const tracks: Track[] = [
    makeTestTrack('1', 'Charlie', 'Delta Artist', 130.0, 9, 'A', 6, -9.0, 200),
    makeTestTrack('2', 'Alpha', 'Beta Artist', 125.0, 8, 'A', 9, -7.0, 300),
    makeTestTrack('3', 'Bravo', 'Alpha Artist', 128.0, 2, 'B', 3, -11.0, 150),
  ];

  it('sorts by title asc and desc', () => {
    const asc = sortTracks(tracks, 'title', 'asc');
    expect(asc.map((t) => t.tags.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    const desc = sortTracks(tracks, 'title', 'desc');
    expect(desc.map((t) => t.tags.title)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by artist asc and desc', () => {
    const asc = sortTracks(tracks, 'artist', 'asc');
    expect(asc.map((t) => t.tags.artist)).toEqual(['Alpha Artist', 'Beta Artist', 'Delta Artist']);
  });

  it('sorts by BPM asc and desc', () => {
    const asc = sortTracks(tracks, 'bpm', 'asc');
    expect(asc.map((t) => t.analysis?.rhythm.grid.bpm)).toEqual([125.0, 128.0, 130.0]);

    const desc = sortTracks(tracks, 'bpm', 'desc');
    expect(desc.map((t) => t.analysis?.rhythm.grid.bpm)).toEqual([130.0, 128.0, 125.0]);
  });

  it('sorts by Camelot key in harmonic order (1A..12B)', () => {
    const asc = sortTracks(tracks, 'key', 'asc');
    // 2B < 8A < 9A
    expect(asc.map((t) => getTrackCamelotKey(t))).toEqual(['2B', '8A', '9A']);
  });

  it('sorts by energy score', () => {
    const asc = sortTracks(tracks, 'energy', 'asc');
    expect(asc.map((t) => t.analysis?.energy_score)).toEqual([3, 6, 9]);
  });

  it('sorts by LUFS integrated loudness', () => {
    const asc = sortTracks(tracks, 'lufs', 'asc');
    // Quieter (-11.0) to louder (-7.0)
    expect(asc.map((t) => t.analysis?.loudness.integrated_lufs)).toEqual([-11.0, -9.0, -7.0]);
  });

  it('sorts by duration', () => {
    const asc = sortTracks(tracks, 'duration', 'asc');
    expect(asc.map((t) => t.duration_ms)).toEqual([150000, 200000, 300000]);
  });

  it('does not mutate the original array (pure function)', () => {
    const originalClone = [...tracks];
    sortTracks(tracks, 'bpm', 'asc');
    expect(tracks).toEqual(originalClone);
  });
});

describe('5,000 Mock Track Generation & Virtualization Data Benchmark', () => {
  it('generates 5,000 complete tracks deterministically and fast', () => {
    const startTime = performance.now();
    const tracks5k = generateMockTracks(5000);
    const duration = performance.now() - startTime;

    expect(tracks5k).toHaveLength(5000);
    expect(duration).toBeLessThan(500); // Must be under 500ms for 5,000 items

    // Spot-check first and last tracks
    const first = tracks5k[0];
    expect(first.id).toBe('mock-track-1');
    expect(first.tags.title).toBeDefined();
    expect(first.analysis?.rhythm.grid.bpm).toBeGreaterThan(100);
    expect(first.analysis?.key.camelot.number).toBeGreaterThanOrEqual(1);
    expect(first.analysis?.key.camelot.number).toBeLessThanOrEqual(12);

    const last = tracks5k[4999];
    expect(last.id).toBe('mock-track-5000');
    expect(last.tags.artist).toBeDefined();

    // Verify all 24 Camelot keys are represented across the 5,000 tracks
    const keysPresent = new Set<string>();
    for (const t of tracks5k) {
      const k = getTrackCamelotKey(t);
      if (k) keysPresent.add(k);
    }
    expect(keysPresent.size).toBe(24);
  });

  it('filters and sorts 5,000 tracks under 50ms', () => {
    const tracks5k = generateMockTracks(5000);

    const startFilter = performance.now();
    const filtered = filterTracks(tracks5k, {
      ...DEFAULT_FILTERS,
      minBpm: 125,
      maxBpm: 135,
      selectedKey: '8A',
      includeCompatibleKeys: true,
    });
    const filterTime = performance.now() - startFilter;

    expect(filterTime).toBeLessThan(50);
    expect(filtered.length).toBeGreaterThan(0);

    const startSort = performance.now();
    const sorted = sortTracks(filtered, 'bpm', 'asc');
    const sortTime = performance.now() - startSort;

    expect(sortTime).toBeLessThan(50);
    expect(sorted.length).toBe(filtered.length);
  });
});
