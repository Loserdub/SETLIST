import type { Track } from '../../bindings/Track';
import type { CamelotLetter } from '../../bindings/CamelotLetter';

const MOCK_GENRES = ['Techno', 'House', 'Deep House', 'Trance', 'DnB', 'Electro', 'Progressive', 'Dubstep'];
const ARTIST_FIRST = ['DJ', 'Solar', 'Velvet', 'Quantum', 'Echo', 'Neon', 'Starlight', 'Hyper', 'Bass', 'Midnight', 'Apex', 'Cyber'];
const ARTIST_LAST = ['Pulse', 'Rhythm', 'Wave', 'Storm', 'Phase', 'Static', 'Drift', 'Groove', 'Frequency', 'Vibe', 'Core', 'Vortex'];
const TRACK_WORDS = ['Horizon', 'Echoes', 'Odyssey', 'Dimension', 'Mirage', 'Continuum', 'Aurora', 'Vortex', 'Euphoria', 'Velocity', 'Resonance', 'Spectrum', 'Nexus', 'Illusion', 'Infinity', 'Starlight'];

/**
 * Deterministically generates `count` realistic mock tracks for stress-testing
 * table virtualization and smooth 60fps scrolling.
 */
export function generateMockTracks(count: number = 5000): Track[] {
  const tracks: Track[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const artistA = ARTIST_FIRST[i % ARTIST_FIRST.length];
    const artistB = ARTIST_LAST[(i * 7) % ARTIST_LAST.length];
    const artist = `${artistA} ${artistB}`;

    const wordA = TRACK_WORDS[i % TRACK_WORDS.length];
    const wordB = TRACK_WORDS[(i * 3 + 1) % TRACK_WORDS.length];
    const title = `${wordA} ${wordB} #${i + 1}`;

    const genre = MOCK_GENRES[i % MOCK_GENRES.length];
    const album = `${genre} Vol. ${(i % 10) + 1}`;

    // Camelot key: numbers 1..12, letters A or B
    const camelotNumber = (i % 12) + 1;
    const camelotLetter: CamelotLetter = i % 24 < 12 ? 'A' : 'B';
    const pitchClass = (camelotNumber * 7) % 12;

    // BPM: 118 to 174
    const bpm = 118 + ((i * 37) % 57) + ((i % 10) * 0.1);
    const durationSecs = 180 + ((i * 19) % 240); // 3 to 7 mins
    const durationMs = durationSecs * 1000;
    const energyScore = (i % 10) + 1;
    const lufs = -14.0 + ((i % 80) * 0.1); // -14.0 to -6.0

    tracks[i] = {
      id: `mock-track-${i + 1}`,
      path: `/music/collection/${genre.toLowerCase().replace(' ', '_')}/${artist.replace(' ', '_')}_${i + 1}.mp3`,
      hash: `hash-${i + 1}`,
      duration_ms: durationMs,
      tags: {
        title,
        artist,
        album,
      },
      analyzed_at: '2026-10-01T20:00:00Z',
      analysis_version: '1.0.0',
      analysis: {
        loudness: {
          integrated_lufs: Math.round(lufs * 10) / 10,
          loudness_range: 4.5,
          true_peak: -0.2,
        },
        rhythm: {
          grid: {
            first_downbeat_ms: 250,
            bpm: Math.round(bpm * 10) / 10,
            beats_ms: [250, 250 + 60000 / bpm],
            downbeat_flags: [true, false],
            steady: true,
          },
          bpm_alternates: [bpm * 2, bpm * 0.5],
        },
        key: {
          pitch_class: pitchClass,
          mode: camelotLetter === 'A' ? 'Minor' : 'Major',
          camelot: {
            number: camelotNumber,
            letter: camelotLetter,
          },
          tuning_cents: 0.0,
        },
        dynamics: {
          frame_rate: 86.13,
          rms_curve: [0.3, 0.6, 0.8],
          low_ratio_curve: [0.4, 0.5, 0.3],
          centroid_curve: [1200, 1500, 1400],
        },
        energy_score: energyScore,
        energy_curve: {
          per_bar: [4.0, 5.0, 6.5, 8.0, 7.5, 6.0],
        },
        segments: [],
        cue_points: [],
        waveform: {
          points_per_sec: 150,
          low: { peak: [50, 100, 200], rms: [30, 60, 120] },
          mid: { peak: [30, 80, 150], rms: [20, 50, 90] },
          high: { peak: [20, 50, 100], rms: [10, 30, 60] },
        },
      },
    };
  }

  return tracks;
}
