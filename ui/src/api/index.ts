import { invoke } from '@tauri-apps/api/core';
import type { Track } from '../bindings/Track';
import type { TrackAnalysis } from '../bindings/TrackAnalysis';
import type { SetlistEntry } from '../bindings/SetlistEntry';
import type { TransitionAdvice } from '../bindings/TransitionAdvice';
import type { TransitionType } from '../bindings/TransitionType';
import type { ExportTarget } from '../bindings/ExportTarget';
import type { EnergyProfile } from '../bindings/EnergyProfile';
import type { CostWeights } from '../bindings/CostWeights';
import type { CamelotLetter } from '../bindings/CamelotLetter';

/**
 * Progress event payload emitted during background tasks.
 */
export interface ProgressEvent {
  stage: 'scanning' | 'decoding' | 'analyzing' | 'sequencing' | 'exporting';
  current: number;
  total: number;
  message?: string;
  trackId?: string;
}

/**
 * Typed backend interface for local-first desktop DJ assistance.
 */
export interface Backend {
  ping(): Promise<string>;
  scanFolder(path: string): Promise<Track[]>;
  listTracks(): Promise<Track[]>;
  getTrack(id: string): Promise<Track | null>;
  suggestOrder(
    trackIds: string[],
    profile?: EnergyProfile,
    weights?: CostWeights
  ): Promise<SetlistEntry[]>;
  getAdvice(trackAId: string, trackBId: string): Promise<TransitionAdvice>;
  exportSet(
    entries: SetlistEntry[],
    target: ExportTarget,
    outputPath?: string
  ): Promise<string>;
  subscribeProgress(callback: (event: ProgressEvent) => void): () => void;
  onProgress(callback: (event: ProgressEvent) => void): () => void;
}

// Global flag to select between mock and Tauri backends
export let USE_MOCK_BACKEND = true;

export function setUseMockBackend(useMock: boolean): void {
  USE_MOCK_BACKEND = useMock;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data Generation (40 Tracks with full analysis, waveforms, and cues)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ARTISTS = [
  'Daft Punk', 'Bicep', 'Eric Prydz', 'Deadmau5', 'Disclosure',
  'Four Tet', 'Bonobo', 'Caribou', 'Jon Hopkins', 'Chemical Brothers',
  'Justice', 'Overmono', 'Fred again..', 'Jamie xx', 'Lane 8',
  'Moderat', 'Stephan Bodzin', 'Kolsch', 'Tale Of Us', 'Floating Points',
];

const MOCK_TITLES = [
  'One More Time', 'Glue', 'Opus', 'Strobe', 'Latch',
  'Baby', 'Kerala', 'Can\'t Do Without You', 'Collider', 'Galvanize',
  'Genesis', 'Bicep - Apricots', 'Marea (We\'ve Lost Dancing)', 'Gosh', 'Brightest Lights',
  'Bad Kingdom', 'Singularity', 'Grey', 'North Star', 'Vocoder',
  'Around the World', 'Aura', 'Generate', 'Ghosts \'n\' Stuff', 'White Noise',
  'Sing', 'Cirrus', 'Never Come Back', 'Emerald Rush', 'Star Guitar',
  'Phantom Pt. II', 'Good Lies', 'Danielle (smile on my face)', 'Idontknow', 'Sunday Song',
  'A New Error', 'Strand', 'Opa', 'Time', 'Silhouettes',
];

function generateMockWaveform(pointsCount: number = 80) {
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

function generateMockTracks(): Track[] {
  const tracks: Track[] = [];

  for (let i = 0; i < 40; i++) {
    const trackId = `track-${String(i + 1).padStart(3, '0')}`;
    const artist = MOCK_ARTISTS[i % MOCK_ARTISTS.length];
    const title = MOCK_TITLES[i % MOCK_TITLES.length];
    const durationMs = 180000 + (i * 4731) % 180000; // 3 to 6 mins
    const bpm = 120 + ((i * 2.5) % 14); // 120 to 134 BPM

    // Ensure all 24 Camelot keys are covered (1A-12A for 0..11, 1B-12B for 12..23)
    const camelotNum = (i % 12) + 1;
    const camelotLetter: CamelotLetter = i < 12 ? 'A' : i < 24 ? 'B' : i % 2 === 0 ? 'A' : 'B';
    const pitchClass = (camelotNum * 7 + (camelotLetter === 'A' ? 0 : 3)) % 12;
    const energyScore = ((i * 3) % 10) + 1; // 1 to 10

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

const MOCK_TRACKS_STORE = generateMockTracks();

function computeTransitionAdvice(fromTrack: Track, toTrack: Track): TransitionAdvice {
  const fromBpm = fromTrack.analysis?.rhythm.grid.bpm ?? 124;
  const toBpm = toTrack.analysis?.rhythm.grid.bpm ?? 124;
  const bpmDelta = toBpm - fromBpm;

  const fromCam = fromTrack.analysis?.key.camelot ?? { number: 8, letter: 'A' as CamelotLetter };
  const toCam = toTrack.analysis?.key.camelot ?? { number: 8, letter: 'A' as CamelotLetter };

  const diffNum = Math.abs(toCam.number - fromCam.number);
  const circularDist = Math.min(diffNum, 12 - diffNum);
  const modeFlip = fromCam.letter !== toCam.letter;

  let transitionType: TransitionType = 'Other';
  const notes: string[] = [];

  if (circularDist === 0 && !modeFlip) {
    transitionType = 'ExactMatch';
    notes.push('Exact key match: harmonic blend with seamless bass swap.');
  } else if (circularDist === 0 && modeFlip) {
    transitionType = 'RelativeSwitch';
    notes.push('Relative major/minor shift: high consonance mood change.');
  } else if (circularDist === 1 && !modeFlip) {
    transitionType = 'Fifth';
    notes.push(toCam.number > fromCam.number ? 'Dominant fifth lift: subtle energy climb.' : 'Subdominant fifth: mellow resolution.');
  } else if (circularDist === 2 && !modeFlip) {
    transitionType = 'WholeStepLift';
    notes.push('Whole-step modulation: dramatic uplifting energy boost.');
  } else if (circularDist === 7 || (circularDist === 5 && !modeFlip)) {
    transitionType = 'HalfStepLift';
    notes.push('Half-step shift: high dissonance, use quick cut or phrase drop.');
  } else if (circularDist === 6) {
    transitionType = 'Tritone';
    notes.push('Tritone contrast: maximum dissonance, execute clean transition on breakdown.');
  } else {
    notes.push(`Harmonic distance d=${circularDist}${modeFlip ? ' with mode flip' : ''}.`);
  }

  const interventionRequired = Math.abs(bpmDelta) > 8 || circularDist > 3;
  if (Math.abs(bpmDelta) > 8) {
    notes.push(`Wide tempo gap (Δ${bpmDelta.toFixed(1)} BPM): ramp tempo during breakdown.`);
  }

  return {
    transition_type: transitionType,
    bpm_delta: Math.round(bpmDelta * 10) / 10,
    key_distance: circularDist,
    mode_flip: modeFlip,
    intervention_required: interventionRequired,
    loop_extension_recommended: (fromTrack.duration_ms * 0.18) < 25000,
    phrase_bars: 16,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// mockBackend Implementation
// ─────────────────────────────────────────────────────────────────────────────

type ProgressCallback = (event: ProgressEvent) => void;
const mockProgressListeners: Set<ProgressCallback> = new Set();

function emitMockProgress(event: ProgressEvent): void {
  for (const listener of mockProgressListeners) {
    try {
      listener(event);
    } catch (e) {
      console.error('Error in progress listener:', e);
    }
  }
}

export const mockBackend: Backend = {
  ping: async (): Promise<string> => {
    return 'pong (mock)';
  },

  scanFolder: async (path: string): Promise<Track[]> => {
    emitMockProgress({ stage: 'scanning', current: 0, total: 40, message: `Scanning ${path}...` });
    await new Promise((resolve) => setTimeout(resolve, 50));

    emitMockProgress({ stage: 'decoding', current: 15, total: 40, message: 'Decoding audio streams...' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    emitMockProgress({ stage: 'analyzing', current: 30, total: 40, message: 'Extracting rhythm, key, and dynamics...' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    emitMockProgress({ stage: 'analyzing', current: 40, total: 40, message: 'Scan complete!' });
    return [...MOCK_TRACKS_STORE];
  },

  listTracks: async (): Promise<Track[]> => {
    return [...MOCK_TRACKS_STORE];
  },

  getTrack: async (id: string): Promise<Track | null> => {
    const track = MOCK_TRACKS_STORE.find((t) => t.id === id);
    return track ?? null;
  },

  suggestOrder: async (
    trackIds: string[],
    profile: EnergyProfile = 'PeakPlateau',
    _weights?: CostWeights
  ): Promise<SetlistEntry[]> => {
    emitMockProgress({ stage: 'sequencing', current: 0, total: trackIds.length, message: `Sequencing ${trackIds.length} tracks with ${profile} profile...` });

    const selected = trackIds
      .map((id) => MOCK_TRACKS_STORE.find((t) => t.id === id))
      .filter((t): t is Track => t !== undefined);

    const pool = selected.length > 0 ? selected : MOCK_TRACKS_STORE.slice(0, 10);

    // Profile-aware sorting
    const sorted = [...pool].sort((a, b) => {
      const ea = a.analysis?.energy_score ?? 5;
      const eb = b.analysis?.energy_score ?? 5;
      if (profile === 'LinearRamp') {
        return ea - eb;
      }
      if (profile === 'Wave') {
        return (ea % 3) - (eb % 3);
      }
      // PeakPlateau: fast rise, stay high
      return eb - ea;
    });

    emitMockProgress({ stage: 'sequencing', current: sorted.length, total: sorted.length, message: 'Setlist optimization complete!' });

    const entries: SetlistEntry[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const track = sorted[i];
      const prevTrack = i > 0 ? sorted[i - 1] : null;
      const transition = prevTrack ? computeTransitionAdvice(prevTrack, track) : null;

      entries.push({
        position: i + 1,
        track_id: track.id,
        track,
        transition,
        target_energy: Math.min(10, Math.max(1, (track.analysis?.energy_score ?? 5))),
      });
    }

    return entries;
  },

  getAdvice: async (trackAId: string, trackBId: string): Promise<TransitionAdvice> => {
    const trackA = MOCK_TRACKS_STORE.find((t) => t.id === trackAId);
    const trackB = MOCK_TRACKS_STORE.find((t) => t.id === trackBId);

    if (!trackA || !trackB) {
      throw new Error(`Track not found: ${!trackA ? trackAId : trackBId}`);
    }

    return computeTransitionAdvice(trackA, trackB);
  },

  exportSet: async (
    entries: SetlistEntry[],
    target: ExportTarget,
    outputPath?: string
  ): Promise<string> => {
    emitMockProgress({ stage: 'exporting', current: 0, total: entries.length, message: `Exporting to ${target}...` });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const filename = outputPath ?? `setlist_export_${Date.now()}.${target === 'RekordboxXml' ? 'xml' : target === 'M3u8' ? 'm3u8' : target === 'SetSheetCsv' ? 'csv' : 'md'}`;
    emitMockProgress({ stage: 'exporting', current: entries.length, total: entries.length, message: `Successfully exported to ${filename}` });

    return `Exported ${entries.length} tracks to ${target} (${filename})`;
  },

  subscribeProgress: (callback: ProgressCallback): (() => void) => {
    mockProgressListeners.add(callback);
    return () => {
      mockProgressListeners.delete(callback);
    };
  },

  onProgress: (callback: ProgressCallback): (() => void) => {
    return mockBackend.subscribeProgress(callback);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// tauriBackend Implementation (throws "not wired")
// ─────────────────────────────────────────────────────────────────────────────

export const tauriBackend: Backend = {
  ping: async (): Promise<string> => {
    return invoke<string>('ping');
  },

  scanFolder: async (): Promise<Track[]> => {
    throw new Error('not wired');
  },

  listTracks: async (): Promise<Track[]> => {
    throw new Error('not wired');
  },

  getTrack: async (): Promise<Track | null> => {
    throw new Error('not wired');
  },

  suggestOrder: async (): Promise<SetlistEntry[]> => {
    throw new Error('not wired');
  },

  getAdvice: async (): Promise<TransitionAdvice> => {
    throw new Error('not wired');
  },

  exportSet: async (): Promise<string> => {
    throw new Error('not wired');
  },

  subscribeProgress: (): (() => void) => {
    throw new Error('not wired');
  },

  onProgress: (): (() => void) => {
    throw new Error('not wired');
  },
};

/**
 * Returns the active backend instance based on the selection flag.
 */
export function getBackend(useMock: boolean = USE_MOCK_BACKEND): Backend {
  return useMock ? mockBackend : tauriBackend;
}
