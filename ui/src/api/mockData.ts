import type { Track } from '../bindings/Track';
import type { TrackAnalysis } from '../bindings/TrackAnalysis';
import type { CamelotLetter } from '../bindings/CamelotLetter';
import type { Song } from '../bindings/Song';
import type { Setlist } from '../bindings/Setlist';
import type { ProgressEvent, ProgressCallback } from './types';
import { trackToSong } from './converters';

export const MOCK_ARTISTS = [
  'Daft Punk', 'Bicep', 'Eric Prydz', 'Deadmau5', 'Disclosure',
  'Four Tet', 'Bonobo', 'Caribou', 'Jon Hopkins', 'Chemical Brothers',
  'Justice', 'Overmono', 'Fred again..', 'Jamie xx', 'Lane 8',
  'Moderat', 'Stephan Bodzin', 'Kolsch', 'Tale Of Us', 'Floating Points',
];

export const MOCK_TITLES = [
  'One More Time', 'Glue', 'Opus', 'Strobe', 'Latch',
  'Baby', 'Kerala', 'Can\'t Do Without You', 'Collider', 'Galvanize',
  'Genesis', 'Bicep - Apricots', 'Marea (We\'ve Lost Dancing)', 'Gosh', 'Brightest Lights',
  'Bad Kingdom', 'Singularity', 'Grey', 'North Star', 'Vocoder',
  'Around the World', 'Aura', 'Generate', 'Ghosts \'n\' Stuff', 'White Noise',
  'Sing', 'Cirrus', 'Never Come Back', 'Emerald Rush', 'Star Guitar',
  'Phantom Pt. II', 'Good Lies', 'Danielle (smile on my face)', 'Idontknow', 'Sunday Song',
  'A New Error', 'Strand', 'Opa', 'Time', 'Silhouettes',
];

export function generateMockWaveform(pointsCount: number = 80) {
  const lowPeak: number[] = [];
  const lowRms: number[] = [];
  const midPeak: number[] = [];
  const midRms: number[] = [];
  const highPeak: number[] = [];
  const highRms: number[] = [];

  for (let i = 0; i < pointsCount; i++) {
    const t = i / pointsCount;
    const beatPulse = Math.sin(t * Math.PI * 16) > 0 ? 0.35 : 0.05;
    const envelope = Math.sin(t * Math.PI);

    const lPeak = Math.min(255, Math.floor((envelope * 0.6 + beatPulse + 0.1) * 255));
    const lRms = Math.floor(lPeak * 0.65);
    const mPeak = Math.min(255, Math.floor((envelope * 0.7 + Math.cos(t * 12) * 0.2 + 0.15) * 255));
    const mRms = Math.floor(mPeak * 0.6);
    const hPeak = Math.min(255, Math.floor((envelope * 0.5 + (i % 2 === 0 ? 0.3 : 0.1)) * 255));
    const hRms = Math.floor(hPeak * 0.55);

    lowPeak.push(Math.max(0, lPeak));
    lowRms.push(Math.max(0, lRms));
    midPeak.push(Math.max(0, mPeak));
    midRms.push(Math.max(0, mRms));
    highPeak.push(Math.max(0, hPeak));
    highRms.push(Math.max(0, hRms));
  }

  return {
    points_per_sec: 10,
    low: { peak: lowPeak, rms: lowRms },
    mid: { peak: midPeak, rms: midRms },
    high: { peak: highPeak, rms: highRms },
  };
}

export function generateMockTracks(): Track[] {
  const tracks: Track[] = [];

  for (let i = 0; i < 40; i++) {
    const trackId = `track-${String(i + 1).padStart(3, '0')}`;
    const artist = MOCK_ARTISTS[i % MOCK_ARTISTS.length];
    const title = MOCK_TITLES[i % MOCK_TITLES.length];
    const durationMs = 180000 + (i * 4731) % 180000;
    const bpm = 120 + ((i * 2.5) % 14);

    const camelotNum = (i % 12) + 1;
    const camelotLetter: CamelotLetter = i < 12 ? 'A' : i < 24 ? 'B' : i % 2 === 0 ? 'A' : 'B';
    const pitchClass = (camelotNum * 7 + (camelotLetter === 'A' ? 0 : 3)) % 12;
    const energyScore = ((i * 3) % 10) + 1;

    const analysis: TrackAnalysis = {
      loudness: {
        integrated_lufs: -14.0 + (i % 6) * 0.4,
        loudness_range: 5.5 + (i % 5) * 0.5,
        true_peak: -0.8 - (i % 4) * 0.2,
      },
      rhythm: {
        grid: {
          first_downbeat_ms: 120.0 + (i % 5) * 30.0,
          bpm,
          beats_ms: [120, 120 + 60000 / bpm, 120 + 120000 / bpm, 120 + 180000 / bpm],
          downbeat_flags: [true, false, false, false],
          steady: true,
        },
        bpm_alternates: [bpm * 0.5, bpm * 2.0],
      },
      key: {
        pitch_class: pitchClass,
        mode: camelotLetter === 'A' ? 'Minor' : 'Major',
        camelot: {
          number: camelotNum,
          letter: camelotLetter,
        },
        tuning_cents: ((i * 7) % 21) - 10,
      },
      dynamics: {
        frame_rate: 86.13,
        rms_curve: Array.from({ length: 32 }, (_, idx) => 0.2 + 0.6 * Math.sin((idx / 32) * Math.PI)),
        low_ratio_curve: Array.from({ length: 32 }, (_, idx) => 0.3 + 0.4 * Math.cos((idx / 32) * Math.PI)),
        centroid_curve: Array.from({ length: 32 }, (_, idx) => 1200 + 800 * Math.sin((idx / 16) * Math.PI)),
      },
      energy_score: energyScore,
      energy_curve: {
        per_bar: Array.from({ length: 16 }, (_, idx) =>
          Math.max(1, Math.min(10, Math.round(energyScore * (0.5 + 0.5 * Math.sin((idx / 16) * Math.PI)))))
        ),
      },
      segments: [
        { label: 'intro', start_ms: 0, end_ms: durationMs * 0.15, energy: Math.max(1, energyScore - 3) },
        { label: 'verse', start_ms: durationMs * 0.15, end_ms: durationMs * 0.35, energy: Math.max(2, energyScore - 2) },
        { label: 'buildup', start_ms: durationMs * 0.35, end_ms: durationMs * 0.45, energy: Math.min(9, energyScore + 1) },
        { label: 'drop', start_ms: durationMs * 0.45, end_ms: durationMs * 0.70, energy: Math.min(10, energyScore + 2) },
        { label: 'breakdown', start_ms: durationMs * 0.70, end_ms: durationMs * 0.82, energy: Math.max(1, energyScore - 3) },
        { label: 'outro', start_ms: durationMs * 0.82, end_ms: durationMs, energy: Math.max(1, energyScore - 4) },
      ],
      cue_points: [
        { index: 0, time_ms: 120, label: 'First downbeat', color_hex: '#FF5500', kind: 'HotCue', loop_end_ms: null },
        { index: 1, time_ms: durationMs * 0.15, label: 'Intro End', color_hex: '#00FF00', kind: 'HotCue', loop_end_ms: null },
        { index: 2, time_ms: durationMs * 0.35, label: 'First Breakdown', color_hex: '#0088FF', kind: 'HotCue', loop_end_ms: null },
        { index: 3, time_ms: durationMs * 0.45, label: 'First Drop', color_hex: '#FF0055', kind: 'HotCue', loop_end_ms: null },
        { index: 4, time_ms: durationMs * 0.70, label: 'Second Breakdown', color_hex: '#AA00FF', kind: 'HotCue', loop_end_ms: null },
        { index: 5, time_ms: durationMs * 0.75, label: 'Second Drop', color_hex: '#FFCC00', kind: 'HotCue', loop_end_ms: null },
        { index: 6, time_ms: durationMs * 0.82, label: 'Mix-Out', color_hex: '#FFFFFF', kind: 'HotCue', loop_end_ms: null },
        { index: 7, time_ms: durationMs * 0.90, label: 'Outro Loop', color_hex: '#00FFFF', kind: 'Loop', loop_end_ms: durationMs * 0.95 },
      ],
      waveform: generateMockWaveform(80),
    };

    tracks.push({
      id: trackId,
      path: `C:/Music/Electronic/${artist.replace(/[^a-zA-Z0-9]/g, '_')}_-_${title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`,
      hash: `hash_${trackId}_${i.toString(16)}`,
      tags: {
        title,
        artist,
        album: `${artist} - Essentials`,
      },
      duration_ms: durationMs,
      analysis,
      analyzed_at: new Date(Date.now() - (40 - i) * 86400000).toISOString(),
      analysis_version: 'v1.0.0',
    });
  }

  return tracks;
}

export const MOCK_TRACKS_STORE = generateMockTracks();

export function updateMockTrack(track: Track): void {
  const idx = MOCK_TRACKS_STORE.findIndex((t) => t.id === track.id);
  if (idx !== -1) {
    MOCK_TRACKS_STORE[idx] = JSON.parse(JSON.stringify(track));
  }
}

function initMockSongs(): Map<string, Song> {
  const map = new Map<string, Song>();
  for (const track of MOCK_TRACKS_STORE) {
    map.set(track.id, trackToSong(track));
  }
  return map;
}

export const mockSongsStore: Map<string, Song> = initMockSongs();
export const mockSetlistsStore: Map<string, Setlist> = new Map();
let mockActiveSetlistStore: Setlist | null = null;

export function getMockActiveSetlist(): Setlist | null {
  return mockActiveSetlistStore ? JSON.parse(JSON.stringify(mockActiveSetlistStore)) : null;
}

export function setMockActiveSetlist(setlist: Setlist | null): void {
  mockActiveSetlistStore = setlist ? JSON.parse(JSON.stringify(setlist)) : null;
}

export const mockProgressListeners: Set<ProgressCallback> = new Set();

export function emitMockProgress(event: ProgressEvent): void {
  for (const listener of mockProgressListeners) {
    try {
      listener(event);
    } catch (e) {
      console.error('Error in progress listener:', e);
    }
  }
}
