import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Track } from '../bindings/Track';
import type { TrackAnalysis } from '../bindings/TrackAnalysis';
import type { SetlistEntry } from '../bindings/SetlistEntry';
import type { TransitionAdvice } from '../bindings/TransitionAdvice';
import type { TransitionType } from '../bindings/TransitionType';
import type { ExportTarget } from '../bindings/ExportTarget';
import type { ExportResult } from '../bindings/ExportResult';
import type { EnergyProfile } from '../bindings/EnergyProfile';
import type { CostWeights } from '../bindings/CostWeights';
import type { CamelotLetter } from '../bindings/CamelotLetter';
import type { AppSettings } from '../bindings/AppSettings';
import type { Song } from '../bindings/Song';
import type { Setlist } from '../bindings/Setlist';
import type { SetlistItem } from '../bindings/SetlistItem';
import type { SongRelationship } from '../bindings/SongRelationship';
import type { SongRelationshipsResponse } from '../bindings/SongRelationshipsResponse';
import type { BridgeCandidateAnalysis } from '../bindings/BridgeCandidateAnalysis';
import type { CatalogCluster } from '../bindings/CatalogCluster';
import type { CatalogOpenersAndClosers } from '../bindings/CatalogOpenersAndClosers';
import type { OpenerCandidate } from '../bindings/OpenerCandidate';
import type { CloserCandidate } from '../bindings/CloserCandidate';
import type { CatalogOutlier } from '../bindings/CatalogOutlier';
import type { CatalogSummaryStats } from '../bindings/CatalogSummaryStats';
import type { DiscoveryCandidatePath } from '../bindings/DiscoveryCandidatePath';
import type { DiscoveryConstraints } from '../bindings/DiscoveryConstraints';
import { validateSong, validateSetlist } from '../utils/validation';
import { getTargetEnergy } from '../features/setlist/energyCurve';
import { computeTransitionCost, DEFAULT_WEIGHTS } from '../features/setlist/costModel';
export { mapBackendError, formatFriendlyToast, type FriendlyError } from '../utils/errors';
import { formatFriendlyToast, type FriendlyError } from '../utils/errors';
import {
  recordScanMessage,
  getLatestScanSummary,
  setLatestScanSummary,
  createEmptyScanSummary,
} from '../features/diagnostics/scanSummary';

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
    weights?: CostWeights,
    firstId?: string,
    lastId?: string
  ): Promise<SetlistEntry[]>;
  getAdvice(
    trackAId: string,
    trackBId: string,
    profile?: EnergyProfile,
    weights?: CostWeights,
    deTarget?: number
  ): Promise<TransitionAdvice>;
  exportSet(
    entries: SetlistEntry[],
    target: ExportTarget,
    outputPath?: string,
    overwrite?: boolean
  ): Promise<ExportResult>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  subscribeProgress(callback: (event: ProgressEvent) => void): () => void;
  onProgress(callback: (event: ProgressEvent) => void): () => void;

  // Domain & Persistence Foundation methods
  validateSongInput(song: Song): Promise<void>;
  upsertSong(song: Song): Promise<string>;
  getSong(id: string): Promise<Song | null>;
  listSongs(): Promise<Song[]>;
  deleteSong(id: string): Promise<boolean>;
  getActiveSetlist(): Promise<Setlist | null>;
  saveActiveSetlist(setlist: Setlist): Promise<void>;
  loadSetlist(id: string): Promise<Setlist | null>;
  listSetlists(): Promise<Setlist[]>;
  saveSetlist(setlist: Setlist): Promise<void>;
  deleteSetlist(id: string): Promise<boolean>;
  addSetlistItem(setlistId: string, item: SetlistItem): Promise<void>;
  removeSetlistItem(setlistId: string, position: number): Promise<void>;
  moveSetlistItem(setlistId: string, fromPos: number, toPos: number): Promise<void>;
  updateSetlistItem(item: SetlistItem): Promise<void>;

  // Catalog Relationship Engine methods
  getSongRelationships(songId: string): Promise<SongRelationshipsResponse>;
  getSongRelationship(fromSongId: string, toSongId: string): Promise<SongRelationship>;
  getPotentialBridges(
    songAId: string,
    songBId: string,
    limit?: number
  ): Promise<BridgeCandidateAnalysis[]>;
  getCatalogClusters(): Promise<CatalogCluster[]>;
  getCatalogOpenersAndClosers(): Promise<CatalogOpenersAndClosers>;
  getCatalogOutliers(): Promise<CatalogOutlier[]>;
  getUnusualTransitions(songId: string, limit?: number): Promise<SongRelationship[]>;
  getCatalogSummaryStats(): Promise<CatalogSummaryStats>;
  exploreCandidatePaths(constraints: DiscoveryConstraints): Promise<DiscoveryCandidatePath[]>;
}

// Global flag to select between mock and Tauri backends (default: Tauri native)
export let USE_MOCK_BACKEND = false;

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

export function updateMockTrack(track: Track): void {
  const idx = MOCK_TRACKS_STORE.findIndex((t) => t.id === track.id);
  if (idx !== -1) {
    MOCK_TRACKS_STORE[idx] = JSON.parse(JSON.stringify(track));
  }
}

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

function initMockSongs(): Map<string, Song> {
  const map = new Map<string, Song>();
  for (const track of MOCK_TRACKS_STORE) {
    map.set(track.id, trackToSong(track));
  }
  return map;
}

const mockSongsStore: Map<string, Song> = initMockSongs();
const mockSetlistsStore: Map<string, Setlist> = new Map();
let mockActiveSetlistStore: Setlist | null = null;

function parseMockCamelot(keyStr?: string | null): { number: number; letter: 'A' | 'B' } | null {
  if (!keyStr) return null;
  const trimmed = keyStr.trim();
  const match = trimmed.match(/^(\d{1,2})([ABab])$/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 12) {
      return { number: num, letter: match[2].toUpperCase() as 'A' | 'B' };
    }
  }
  return null;
}

export function evaluateMockSongRelationship(from: Song, to: Song): SongRelationship {
  const bA = from.bpm;
  const bB = to.bpm;
  let bpmCompat: SongRelationship['explanation']['bpm']['compatibility'] = 'Unknown';
  let bpmFriction = 0.40;
  let bpmDelta: number | null = null;
  let bpmRatio: number | null = null;
  let bpmExp = 'Tempo metadata unanalyzed or missing.';

  if (bA != null && bB != null && bA > 0 && bB > 0) {
    bpmDelta = bB - bA;
    bpmRatio = bB / bA;
    const absDelta = Math.abs(bpmDelta);

    if (Math.abs(bpmRatio - 0.5) / 0.5 <= 0.03) {
      bpmCompat = 'HalfTime';
      bpmFriction = 0.20;
      bpmExp = `Half-time relationship (${bA.toFixed(1)} -> ${bB.toFixed(1)} BPM): Smooth rhythmic half-speed pulse.`;
    } else if (Math.abs(bpmRatio - 2.0) / 2.0 <= 0.03) {
      bpmCompat = 'DoubleTime';
      bpmFriction = 0.20;
      bpmExp = `Double-time relationship (${bA.toFixed(1)} -> ${bB.toFixed(1)} BPM): Driving double-speed tempo.`;
    } else if (absDelta < 0.2) {
      bpmCompat = 'Exact';
      bpmFriction = 0.0;
      bpmExp = `Identical tempo (${bA.toFixed(1)} BPM): Flawless beatmatching with zero pitch bend.`;
    } else if (absDelta <= 2.0) {
      bpmCompat = 'Close';
      bpmFriction = absDelta / 12.0;
      bpmExp = `${bpmDelta > 0 ? '+' : ''}${bpmDelta.toFixed(1)} BPM: Minimal tempo change; effortless blend.`;
    } else if (absDelta <= 6.0) {
      bpmCompat = 'Moderate';
      bpmFriction = absDelta / 8.0;
      bpmExp = `${bpmDelta > 0 ? '+' : ''}${bpmDelta.toFixed(1)} BPM: Moderate tempo shift; smooth pitch bend.`;
    } else {
      bpmCompat = 'Wide';
      bpmFriction = Math.min(1.0, Math.max(0.5, 0.5 + (absDelta - 6.0) / 24.0));
      bpmExp = `${bpmDelta > 0 ? '+' : ''}${bpmDelta.toFixed(1)} BPM: Wide tempo discrepancy; best transitioned during breakdown.`;
    }
  }

  const cA = parseMockCamelot(from.camelot_code || from.musical_key);
  const cB = parseMockCamelot(to.camelot_code || to.musical_key);
  let harmRel: SongRelationship['explanation']['harmony']['relation'] = 'Unknown';
  let harmFriction = 0.40;
  let camDist: number | null = null;
  let modeFlip: boolean | null = null;
  let harmExp = 'Musical key metadata unanalyzed for one or both tracks.';

  if (cA && cB) {
    const diff = Math.abs(cB.number - cA.number);
    camDist = Math.min(diff, 12 - diff);
    modeFlip = cA.letter !== cB.letter;

    if (camDist === 0 && !modeFlip) {
      harmRel = 'SameKey';
      harmFriction = 0.0;
      harmExp = `Exact key match (${cA.number}${cA.letter}): Perfect harmonic consonance.`;
    } else if (camDist === 0 && modeFlip) {
      harmRel = 'RelativeSwitch';
      harmFriction = 0.10;
      harmExp = `Relative major/minor shift (${cA.number}${cA.letter} <-> ${cB.number}${cB.letter}): High harmonic consonance with color shift.`;
    } else if (camDist === 1 && !modeFlip) {
      harmRel = 'Fifth';
      harmFriction = 0.10;
      harmExp = `Perfect fifth step (${cA.number}${cA.letter} -> ${cB.number}${cB.letter}): Smooth natural resolution.`;
    } else if (camDist === 2 && !modeFlip) {
      harmRel = 'WholeStepLift';
      harmFriction = 0.35;
      harmExp = `Whole-step lift (${cA.number}${cA.letter} -> ${cB.number}${cB.letter}): Moderate harmonic tension producing an energy lift.`;
    } else if (camDist === 5 && !modeFlip) {
      harmRel = 'HalfStepLift';
      harmFriction = 0.65;
      harmExp = `Half-step lift (+1 semitone, ${cA.number}${cA.letter} -> ${cB.number}${cB.letter}): Dissonant overlap, rapid cut recommended.`;
    } else if (camDist === 6) {
      harmRel = 'Tritone';
      harmFriction = 1.0;
      harmExp = `Tritone jump (${cA.number}${cA.letter} -> ${cB.number}${cB.letter}): Maximum harmonic dissonance; avoid overlapping tonal stems.`;
    } else {
      harmRel = 'Dissonant';
      harmFriction = 0.75;
      harmExp = `Harmonically distant keys (${cA.number}${cA.letter} -> ${cB.number}${cB.letter}, step ${camDist}): Tonal clash.`;
    }
  }

  const eA = from.energy_rating;
  const eB = to.energy_rating;
  let energyDelta: number | null = null;
  let energyMovement: SongRelationship['explanation']['energy']['movement'] = 'Unknown';
  let isReset = false;
  let isContrast = false;
  let energyFriction = 0.30;
  let energyExp = 'Energy rating not specified.';

  if (eA != null && eB != null) {
    energyDelta = eB - eA;
    energyMovement = energyDelta > 0 ? 'Rise' : energyDelta < 0 ? 'Fall' : 'Steady';

    if (eA >= 7 && eB <= 4) {
      isReset = true;
      energyFriction = 0.20;
      energyExp = `Intentional energy reset (drop from level ${eA} to ${eB}): Clears dancefloor intensity for a new buildup arc.`;
    } else if (Math.abs(energyDelta) >= 4) {
      isContrast = true;
      energyFriction = 0.35;
      energyExp = `Intentional dynamic contrast (shift from level ${eA} to ${eB}): Bold dramatic shift.`;
    } else if (energyDelta === 0) {
      energyFriction = 0.0;
      energyExp = `Maintains consistent energy plateau at intensity level ${eA}.`;
    } else if (energyDelta === 1 || energyDelta === 2) {
      energyFriction = energyDelta * 0.05;
      energyExp = `Smooth upward momentum (+${energyDelta} energy level): Naturally elevates energy.`;
    } else if (energyDelta === -1 || energyDelta === -2) {
      energyFriction = Math.abs(energyDelta) * 0.08;
      energyExp = `Gentle cool-down (${energyDelta} energy level): Smooth decrescendo.`;
    } else {
      energyFriction = 0.30;
      energyExp = `Substantial energy shift (${energyDelta > 0 ? '+' : ''}${energyDelta} levels).`;
    }
  }

  const tA = from.tuning || 'Standard';
  const tB = to.tuning || 'Standard';
  const cA_pos = from.capo || 0;
  const cB_pos = to.capo || 0;
  let tuningCompat: SongRelationship['explanation']['tuning']['compatibility'] = 'Identical';
  let tuningFriction = 0.0;
  let tuningExp = `Identical setup (${tA}, Capo ${cA_pos}).`;

  if (tA.toLowerCase() === tB.toLowerCase() && cA_pos === cB_pos) {
    tuningCompat = 'Identical';
    tuningFriction = 0.0;
    tuningExp = `Identical setup (${tA}, Capo ${cA_pos}).`;
  } else if (tA.toLowerCase() === tB.toLowerCase()) {
    tuningCompat = 'CapoShiftOnly';
    tuningFriction = 0.15;
    tuningExp = `Same tuning (${tA}), adjust capo from fret ${cA_pos} to ${cB_pos}.`;
  } else {
    tuningCompat = 'RetuneRequired';
    tuningFriction = 0.45;
    tuningExp = `Retuning or instrument change required (${tA} -> ${tB}).`;
  }

  const setA = new Set((from.tags || []).map((t) => t.toLowerCase()));
  const setB = new Set((to.tags || []).map((t) => t.toLowerCase()));
  const sharedTags: string[] = [];
  setA.forEach((tag) => {
    if (setB.has(tag)) sharedTags.push(tag);
  });
  const unionSize = new Set([...setA, ...setB]).size;
  const styleSim = unionSize > 0 ? sharedTags.length / unionSize : 0.5;
  const styleExp = sharedTags.length > 0
    ? `Shared stylistic elements: [${sharedTags.join(', ')}].`
    : 'Distinct stylistic palettes providing genre contrast.';

  const transitionFriction = Math.min(1.0, Math.max(0.0,
    0.35 * harmFriction + 0.35 * bpmFriction + 0.20 * energyFriction + 0.10 * tuningFriction
  ));
  const overallScore = Math.min(1.0, Math.max(0.0, 1.0 - transitionFriction));

  const compatibility = overallScore >= 0.85
    ? 'Excellent'
    : overallScore >= 0.70
    ? 'Good'
    : overallScore >= 0.50
    ? 'Viable'
    : overallScore >= 0.30
    ? 'Challenging'
    : 'Clashing';

  const classifications: SongRelationship['classifications'] = [];
  if (['Exact', 'Close'].includes(bpmCompat) && ['SameKey', 'RelativeSwitch', 'Fifth'].includes(harmRel) && (energyDelta == null || Math.abs(energyDelta) <= 2)) {
    classifications.push('Smooth');
  }
  if (energyDelta != null && energyDelta > 0) classifications.push('Rising');
  if (energyDelta != null && energyDelta < 0) classifications.push('Falling');
  if (['RelativeSwitch', 'Fifth', 'WholeStepLift', 'HalfStepLift'].includes(harmRel)) classifications.push('HarmonicTransition');
  if (['HalfTime', 'DoubleTime', 'Moderate'].includes(bpmCompat)) classifications.push('RhythmicTempoTransition');
  if (isReset) classifications.push('EnergyReset');
  if (isContrast) classifications.push('IntentionalContrast');
  if (harmRel === 'Tritone' || bpmCompat === 'Wide' || transitionFriction >= 0.75) classifications.push('PoorFit');
  if (classifications.length === 0) classifications.push('HardCut');

  const primaryClassification = isReset
    ? 'EnergyReset'
    : isContrast
    ? 'IntentionalContrast'
    : classifications.includes('PoorFit')
    ? 'PoorFit'
    : classifications.includes('Smooth')
    ? 'Smooth'
    : classifications.includes('Rising') && (energyDelta ?? 0) >= 2
    ? 'Rising'
    : classifications.includes('Falling') && (energyDelta ?? 0) <= -2
    ? 'Falling'
    : classifications.includes('HarmonicTransition')
    ? 'HarmonicTransition'
    : classifications.includes('RhythmicTempoTransition')
    ? 'RhythmicTempoTransition'
    : 'HardCut';

  const isSymmetric = energyDelta === 0 && (bpmDelta == null || Math.abs(bpmDelta) < 0.2) && harmRel === 'SameKey';
  const summary = `${bpmExp} ${harmExp} ${energyExp}`;

  return {
    from_song_id: from.id,
    to_song_id: to.id,
    from_title: from.title,
    to_title: to.title,
    from_key: from.camelot_code ?? from.musical_key ?? null,
    to_key: to.camelot_code ?? to.musical_key ?? null,
    from_bpm: from.bpm ?? null,
    to_bpm: to.bpm ?? null,
    from_energy: from.energy_rating ?? null,
    to_energy: to.energy_rating ?? null,
    compatibility,
    overall_score: overallScore,
    transition_friction: transitionFriction,
    primary_classification: primaryClassification,
    classifications,
    is_symmetric: isSymmetric,
    explanation: {
      bpm: {
        delta: bpmDelta,
        ratio: bpmRatio,
        compatibility: bpmCompat,
        friction: bpmFriction,
        explanation: bpmExp,
      },
      harmony: {
        relation: harmRel,
        camelot_distance: camDist,
        mode_flip: modeFlip,
        friction: harmFriction,
        explanation: harmExp,
      },
      energy: {
        delta: energyDelta,
        movement: energyMovement,
        is_reset: isReset,
        is_contrast: isContrast,
        friction: energyFriction,
        explanation: energyExp,
      },
      tuning: {
        compatibility: tuningCompat,
        friction: tuningFriction,
        explanation: tuningExp,
      },
      style: {
        shared_tags: sharedTags,
        similarity: styleSim,
        explanation: styleExp,
      },
      summary,
    },
  };
}

function computeTransitionAdvice(
  fromTrack: Track,
  toTrack: Track,
  profile?: EnergyProfile | null,
  weights?: CostWeights | null,
  deTarget?: number | null
): TransitionAdvice {
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

  const activeWeights = weights ?? DEFAULT_WEIGHTS;
  const activeDe = deTarget ?? 0;
  const costBreakdown = computeTransitionCost(
    fromTrack,
    toTrack,
    null,
    activeDe,
    activeWeights,
    profile ?? null
  );

  return {
    transition_type: transitionType,
    bpm_delta: Math.round(bpmDelta * 10) / 10,
    key_distance: circularDist,
    mode_flip: modeFlip,
    intervention_required: interventionRequired,
    loop_extension_recommended: (fromTrack.duration_ms * 0.18) < 25000,
    phrase_bars: 16,
    notes,
    total_cost: costBreakdown.isAvailable ? costBreakdown.total : null,
    tempo_cost: costBreakdown.isAvailable ? costBreakdown.phiTempo : null,
    key_cost: costBreakdown.isAvailable ? costBreakdown.phiKey : null,
    energy_cost: costBreakdown.isAvailable ? costBreakdown.phiEnergy : null,
    timbre_cost: costBreakdown.isAvailable ? costBreakdown.phiTimbre : null,
    de_target: costBreakdown.isAvailable ? activeDe : null,
    weights: costBreakdown.isAvailable ? activeWeights : null,
    profile: profile ?? null,
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
    setLatestScanSummary({
      analyzed: 40,
      skipped: 0,
      failed: 0,
      totalFound: 40,
      failedFiles: [],
      completedAt: new Date().toISOString(),
    });
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
    weights?: CostWeights,
    firstId?: string,
    lastId?: string
  ): Promise<SetlistEntry[]> => {
    emitMockProgress({ stage: 'sequencing', current: 0, total: trackIds.length, message: `Sequencing ${trackIds.length} tracks with ${profile} profile...` });

    // Deduplicate IDs while preserving input order, matching Rust sequencer
    const uniqueIds: string[] = [];
    const seen = new Set<string>();
    for (const id of trackIds) {
      if (!seen.has(id)) {
        seen.add(id);
        uniqueIds.push(id);
      }
    }

    const selected: Track[] = uniqueIds.map((id) => {
      const found = MOCK_TRACKS_STORE.find((t) => t.id === id);
      if (found) return found;
      return {
        id,
        path: '',
        hash: '',
        tags: { title: id, artist: null, album: null },
        duration_ms: 0,
        analysis: null as unknown as TrackAnalysis,
        analyzed_at: null,
        analysis_version: null,
      };
    });

    const pool = selected.length > 0 ? selected : MOCK_TRACKS_STORE.slice(0, 10);

    const analyzed = pool.filter((t) => t.analysis !== null && t.analysis !== undefined);
    const unanalyzed = pool.filter((t) => !t.analysis);

    // Profile-aware deterministic sorting for analyzed tracks
    const sorted = [...analyzed].sort((a, b) => {
      const ea = a.analysis?.energy_score ?? 5;
      const eb = b.analysis?.energy_score ?? 5;
      if (profile === 'LinearRamp') {
        const diff = ea - eb;
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      }
      if (profile === 'Wave') {
        const diff = (ea % 3) - (eb % 3);
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      }
      // PeakPlateau: fast rise, stay high
      const diff = eb - ea;
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });

    // Unanalyzed tracks are deterministically appended at the end in their original relative order
    const merged = [...sorted, ...unanalyzed];

    // If firstId or lastId are provided, anchor them to the start/end
    let finalMerged = merged;
    if (firstId || lastId) {
      const first = firstId ? merged.find((t) => t.id === firstId) : undefined;
      const last = lastId ? merged.find((t) => t.id === lastId) : undefined;
      const middle = merged.filter((t) => t.id !== firstId && t.id !== lastId);
      finalMerged = [
        ...(first ? [first] : []),
        ...middle,
        ...(last && last.id !== first?.id ? [last] : []),
      ];
    }

    emitMockProgress({ stage: 'sequencing', current: finalMerged.length, total: finalMerged.length, message: 'Setlist optimization complete!' });

    const entries: SetlistEntry[] = [];
    for (let i = 0; i < finalMerged.length; i++) {
      const track = finalMerged[i];
      const prevTrack = i > 0 ? finalMerged[i - 1] : null;
      let transition: TransitionAdvice | null = null;
      if (prevTrack && prevTrack.analysis && track.analysis) {
        const de = getTargetEnergy(profile, i, finalMerged.length) - getTargetEnergy(profile, i - 1, finalMerged.length);
        transition = computeTransitionAdvice(prevTrack, track, profile, weights, de);
      }

      entries.push({
        position: i + 1,
        track_id: track.id,
        track,
        transition,
        target_energy: getTargetEnergy(profile, i, finalMerged.length),
      });
    }

    return entries;
  },

  getAdvice: async (
    trackAId: string,
    trackBId: string,
    profile?: EnergyProfile,
    weights?: CostWeights,
    deTarget?: number
  ): Promise<TransitionAdvice> => {
    const trackA = MOCK_TRACKS_STORE.find((t) => t.id === trackAId);
    const trackB = MOCK_TRACKS_STORE.find((t) => t.id === trackBId);

    if (!trackA || !trackB) {
      throw new Error(`Track not found: ${!trackA ? trackAId : trackBId}`);
    }

    if (!trackA.analysis || !trackB.analysis) {
      throw new Error(`Analysis missing for track: ${!trackA.analysis ? trackAId : trackBId}`);
    }

    return computeTransitionAdvice(trackA, trackB, profile, weights, deTarget);
  },

  exportSet: async (
    entries: SetlistEntry[],
    target: ExportTarget,
    outputPath?: string,
    overwrite?: boolean
  ): Promise<ExportResult> => {
    emitMockProgress({ stage: 'exporting', current: 0, total: entries.length, message: `Exporting to ${target}...` });
    await new Promise((resolve) => setTimeout(resolve, 30));

    if (outputPath && outputPath.includes('existing') && !overwrite) {
      throw new Error(`Destination file already exists: ${outputPath}`);
    }

    const filename = outputPath ?? `setlist_export_${Date.now()}.${target === 'RekordboxXml' ? 'xml' : target === 'M3u8' ? 'm3u8' : target === 'SetSheetCsv' ? 'csv' : 'md'}`;
    emitMockProgress({ stage: 'exporting', current: entries.length, total: entries.length, message: `Successfully exported to ${filename}` });

    return {
      path: filename,
      format: target,
      track_count: entries.length,
    };
  },

  getSettings: async (): Promise<AppSettings> => {
    return JSON.parse(JSON.stringify(mockSettings));
  },

  saveSettings: async (settings: AppSettings): Promise<void> => {
    mockSettings = JSON.parse(JSON.stringify(settings));
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

  validateSongInput: async (song: Song): Promise<void> => {
    const errors = validateSong(song);
    if (errors.length > 0) {
      throw new Error(`Validation failed for ${errors[0].field}: ${errors[0].message} (value: ${errors[0].invalid_value})`);
    }
  },

  upsertSong: async (song: Song): Promise<string> => {
    const errors = validateSong(song);
    if (errors.length > 0) {
      throw new Error(`Validation failed for ${errors[0].field}: ${errors[0].message} (value: ${errors[0].invalid_value})`);
    }
    mockSongsStore.set(song.id, { ...song });
    return song.id;
  },

  getSong: async (id: string): Promise<Song | null> => {
    const song = mockSongsStore.get(id);
    return song ? { ...song } : null;
  },

  listSongs: async (): Promise<Song[]> => {
    return Array.from(mockSongsStore.values()).sort((a, b) =>
      a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)
    );
  },

  deleteSong: async (id: string): Promise<boolean> => {
    return mockSongsStore.delete(id);
  },

  getActiveSetlist: async (): Promise<Setlist | null> => {
    return mockActiveSetlistStore ? JSON.parse(JSON.stringify(mockActiveSetlistStore)) : null;
  },

  saveActiveSetlist: async (setlist: Setlist): Promise<void> => {
    const errors = validateSetlist(setlist);
    if (errors.length > 0) {
      throw new Error(`Validation failed for ${errors[0].field}: ${errors[0].message} (value: ${errors[0].invalid_value})`);
    }
    const cloned: Setlist = JSON.parse(JSON.stringify(setlist));
    mockActiveSetlistStore = cloned;
    mockSetlistsStore.set(setlist.id, cloned);
  },

  loadSetlist: async (id: string): Promise<Setlist | null> => {
    const s = mockSetlistsStore.get(id);
    return s ? JSON.parse(JSON.stringify(s)) : null;
  },

  listSetlists: async (): Promise<Setlist[]> => {
    return Array.from(mockSetlistsStore.values()).map((s) => JSON.parse(JSON.stringify(s)));
  },

  saveSetlist: async (setlist: Setlist): Promise<void> => {
    const errors = validateSetlist(setlist);
    if (errors.length > 0) {
      throw new Error(`Validation failed for ${errors[0].field}: ${errors[0].message} (value: ${errors[0].invalid_value})`);
    }
    mockSetlistsStore.set(setlist.id, JSON.parse(JSON.stringify(setlist)));
  },

  deleteSetlist: async (id: string): Promise<boolean> => {
    if (mockActiveSetlistStore?.id === id) {
      mockActiveSetlistStore = null;
    }
    return mockSetlistsStore.delete(id);
  },

  addSetlistItem: async (setlistId: string, item: SetlistItem): Promise<void> => {
    const setlist = mockSetlistsStore.get(setlistId);
    if (!setlist) throw new Error(`Setlist not found: ${setlistId}`);
    const insertPos = item.position;
    for (const existing of setlist.items) {
      if (existing.position >= insertPos) {
        existing.position += 1;
      }
    }
    setlist.items.push(JSON.parse(JSON.stringify(item)));
    setlist.items.sort((a, b) => a.position - b.position);
    setlist.updated_at = new Date().toISOString();
  },

  removeSetlistItem: async (setlistId: string, position: number): Promise<void> => {
    const setlist = mockSetlistsStore.get(setlistId);
    if (!setlist) throw new Error(`Setlist not found: ${setlistId}`);
    setlist.items = setlist.items.filter((item) => item.position !== position);
    setlist.items.sort((a, b) => a.position - b.position);
    setlist.items.forEach((item, idx) => {
      item.position = idx + 1;
    });
    setlist.updated_at = new Date().toISOString();
  },

  moveSetlistItem: async (setlistId: string, fromPos: number, toPos: number): Promise<void> => {
    const setlist = mockSetlistsStore.get(setlistId);
    if (!setlist) throw new Error(`Setlist not found: ${setlistId}`);
    const itemIdx = setlist.items.findIndex((i) => i.position === fromPos);
    if (itemIdx === -1) return;
    const [moved] = setlist.items.splice(itemIdx, 1);
    const targetIdx = Math.max(0, Math.min(toPos - 1, setlist.items.length));
    setlist.items.splice(targetIdx, 0, moved);
    setlist.items.forEach((item, idx) => {
      item.position = idx + 1;
    });
    setlist.updated_at = new Date().toISOString();
  },

  updateSetlistItem: async (item: SetlistItem): Promise<void> => {
    for (const setlist of mockSetlistsStore.values()) {
      const idx = setlist.items.findIndex((i) => i.id === item.id);
      if (idx !== -1) {
        setlist.items[idx] = JSON.parse(JSON.stringify(item));
        setlist.updated_at = new Date().toISOString();
        break;
      }
    }
  },

  getSongRelationships: async (songId: string): Promise<SongRelationshipsResponse> => {
    const target = mockSongsStore.get(songId);
    if (!target) {
      return { song_id: songId, outgoing: [], incoming: [] };
    }
    const all = Array.from(mockSongsStore.values()).filter((s) => s.id !== songId);
    const outgoing = all
      .map((s) => evaluateMockSongRelationship(target, s))
      .sort((a, b) => b.overall_score - a.overall_score);
    const incoming = all
      .map((s) => evaluateMockSongRelationship(s, target))
      .sort((a, b) => b.overall_score - a.overall_score);
    return { song_id: songId, outgoing, incoming };
  },

  getSongRelationship: async (fromSongId: string, toSongId: string): Promise<SongRelationship> => {
    const from = mockSongsStore.get(fromSongId);
    const to = mockSongsStore.get(toSongId);
    if (!from || !to) {
      throw new Error(`Song not found: ${!from ? fromSongId : toSongId}`);
    }
    return evaluateMockSongRelationship(from, to);
  },

  getPotentialBridges: async (
    songAId: string,
    songBId: string,
    limit = 5
  ): Promise<BridgeCandidateAnalysis[]> => {
    const songA = mockSongsStore.get(songAId);
    const songB = mockSongsStore.get(songBId);
    if (!songA || !songB) {
      return [];
    }
    const direct = evaluateMockSongRelationship(songA, songB);
    const candidates: BridgeCandidateAnalysis[] = [];

    for (const bridgeSong of mockSongsStore.values()) {
      if (bridgeSong.id === songAId || bridgeSong.id === songBId) continue;
      const relA = evaluateMockSongRelationship(songA, bridgeSong);
      const relB = evaluateMockSongRelationship(bridgeSong, songB);
      const combinedScore = Math.sqrt(relA.overall_score * relB.overall_score);

      const roles: ('HarmonicBridge' | 'TempoBridge' | 'EnergyBridge' | 'StyleBridge')[] = [];
      if (
        relA.explanation.harmony.friction < direct.explanation.harmony.friction &&
        relB.explanation.harmony.friction < direct.explanation.harmony.friction
      ) {
        roles.push('HarmonicBridge');
      }
      if (songA.bpm != null && songB.bpm != null && bridgeSong.bpm != null) {
        const gap = Math.abs(songB.bpm - songA.bpm);
        if (
          gap > 8 &&
          ((songA.bpm < bridgeSong.bpm && bridgeSong.bpm < songB.bpm) ||
            (songB.bpm < bridgeSong.bpm && bridgeSong.bpm < songA.bpm))
        ) {
          roles.push('TempoBridge');
        }
      }
      if (
        songA.energy_rating != null &&
        songB.energy_rating != null &&
        bridgeSong.energy_rating != null
      ) {
        const directE = Math.abs(songB.energy_rating - songA.energy_rating);
        if (
          directE >= 3 &&
          ((songA.energy_rating <= bridgeSong.energy_rating &&
            bridgeSong.energy_rating <= songB.energy_rating) ||
            (songB.energy_rating <= bridgeSong.energy_rating &&
              bridgeSong.energy_rating <= songA.energy_rating))
        ) {
          roles.push('EnergyBridge');
        }
      }

      if (combinedScore > direct.overall_score || roles.length > 0) {
        candidates.push({
          bridge_song: bridgeSong,
          from_a_relationship: relA,
          to_b_relationship: relB,
          combined_score: combinedScore,
          bridge_roles: roles,
          reason: `Connects '${songA.title}' and '${songB.title}' with combined score ${Math.round(
            combinedScore * 100
          )}%.`,
        });
      }
    }

    candidates.sort((a, b) => b.combined_score - a.combined_score);
    return candidates.slice(0, limit);
  },

  getCatalogClusters: async (): Promise<CatalogCluster[]> => {
    const songs = Array.from(mockSongsStore.values());
    if (songs.length < 2) return [];

    const adj = new Map<string, string[]>();
    for (const s of songs) adj.set(s.id, []);

    for (let i = 0; i < songs.length; i++) {
      for (let j = i + 1; j < songs.length; j++) {
        const relAB = evaluateMockSongRelationship(songs[i], songs[j]);
        const relBA = evaluateMockSongRelationship(songs[j], songs[i]);
        if (relAB.overall_score >= 0.68 && relBA.overall_score >= 0.68) {
          adj.get(songs[i].id)?.push(songs[j].id);
          adj.get(songs[j].id)?.push(songs[i].id);
        }
      }
    }

    const visited = new Set<string>();
    const clusters: CatalogCluster[] = [];
    let clusterIdx = 1;

    for (const song of songs) {
      if (visited.has(song.id)) continue;
      const component: string[] = [];
      const queue = [song.id];
      visited.add(song.id);

      while (queue.length > 0) {
        const curr = queue.pop()!;
        component.push(curr);
        for (const nbr of adj.get(curr) || []) {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        }
      }

      if (component.length >= 2) {
        const members = component.map((id) => mockSongsStore.get(id)!).filter(Boolean);
        const bpms = members.map((m) => m.bpm).filter((b): b is number => b != null);
        const center_bpm = bpms.length ? bpms.reduce((a, b) => a + b, 0) / bpms.length : null;
        const keys = Array.from(
          new Set(
            members
              .map((m) => m.camelot_code || m.musical_key)
              .filter((k): k is string => Boolean(k))
          )
        ).sort();
        const energies = members.map((m) => m.energy_rating).filter((e): e is number => e != null);
        const average_energy = energies.length
          ? energies.reduce((a, b) => a + b, 0) / energies.length
          : null;

        clusters.push({
          id: `cluster_${clusterIdx++}`,
          label: `Cluster #${clusterIdx - 1}: ${
            center_bpm ? `~${Math.round(center_bpm)} BPM` : 'Mixed'
          } (${keys.join(', ')})`,
          song_ids: component,
          center_bpm,
          camelot_keys: keys,
          average_energy,
          cohesion_score: 0.82,
          description: `Natural cluster of ${component.length} tracks with compatible tempo and harmonic progression.`,
        });
      }
    }

    return clusters.sort((a, b) => b.song_ids.length - a.song_ids.length);
  },

  getCatalogOpenersAndClosers: async (): Promise<CatalogOpenersAndClosers> => {
    const songs = Array.from(mockSongsStore.values());
    const openers: OpenerCandidate[] = [];
    const closers: CloserCandidate[] = [];

    for (const song of songs) {
      const others = songs.filter((s) => s.id !== song.id);
      const outRels = others.map((s) => evaluateMockSongRelationship(song, s));
      const inRels = others.map((s) => evaluateMockSongRelationship(s, song));

      const outCount = outRels.filter((r) => r.overall_score >= 0.7).length;
      const inCount = inRels.filter((r) => r.overall_score >= 0.7).length;

      const outRatio = others.length ? outCount / others.length : 1;
      const inRatio = others.length ? inCount / others.length : 1;

      const opScore =
        0.5 +
        outRatio * 0.35 +
        (song.energy_rating && song.energy_rating >= 4 && song.energy_rating <= 7 ? 0.15 : 0.0);
      const clScore =
        0.5 + inRatio * 0.35 + (song.energy_rating && song.energy_rating >= 8 ? 0.15 : 0.0);

      openers.push({
        song_id: song.id,
        title: song.title,
        artist: song.artist,
        opener_score: Math.min(1.0, opScore),
        compatible_outbound_count: outCount,
        energy_rating: song.energy_rating,
        bpm: song.bpm,
        reasons: [
          `Flows cleanly into ${outCount} catalog tracks (${Math.round(outRatio * 100)}% reachability).`,
        ],
      });

      closers.push({
        song_id: song.id,
        title: song.title,
        artist: song.artist,
        closer_score: Math.min(1.0, clScore),
        compatible_inbound_count: inCount,
        energy_rating: song.energy_rating,
        bpm: song.bpm,
        reasons: [
          `Approached smoothly by ${inCount} catalog tracks (${Math.round(inRatio * 100)}% reachability).`,
        ],
      });
    }

    openers.sort((a, b) => b.opener_score - a.opener_score);
    closers.sort((a, b) => b.closer_score - a.closer_score);

    return { openers, closers };
  },

  getCatalogOutliers: async (): Promise<CatalogOutlier[]> => {
    const songs = await mockBackend.listSongs();
    const outliers: CatalogOutlier[] = [];
    const avgBpm =
      songs.filter((s) => s.bpm).reduce((acc, s) => acc + (s.bpm ?? 0), 0) /
      (songs.filter((s) => s.bpm).length || 1);

    for (const song of songs) {
      const others = songs.filter((s) => s.id !== song.id);
      let maxScore = 0;
      let strongCount = 0;
      let viableCount = 0;

      for (const other of others) {
        const outRel = evaluateMockSongRelationship(song, other);
        const inRel = evaluateMockSongRelationship(other, song);
        const pairScore = Math.max(outRel.overall_score, inRel.overall_score);
        if (pairScore > maxScore) maxScore = pairScore;
        if (pairScore >= 0.7) strongCount++;
        if (pairScore >= 0.5) viableCount++;
      }

      const reasons: string[] = [];
      if (!song.bpm || (!song.camelot_code && !song.musical_key)) {
        reasons.push('Missing BPM or musical key analysis — track metadata incomplete.');
      }
      if (song.bpm && Math.abs(song.bpm - avgBpm) >= 18) {
        reasons.push(`Unusual tempo (${song.bpm.toFixed(1)} BPM vs catalog average ~${avgBpm.toFixed(1)} BPM).`);
      }
      if (song.energy_rating === 10) {
        reasons.push('Extreme maximum energy (rating 10/10); functions best as an explosive climax or hard drop.');
      } else if (song.energy_rating === 1) {
        reasons.push('Minimal acoustic energy (rating 1/10); functions best as a quiet intro or atmospheric encore.');
      }
      if (strongCount === 0) {
        reasons.push('No strong (≥70% compatibility) harmonic or tempo transitions found in the catalog.');
      } else if (strongCount === 1) {
        reasons.push('Only 1 strong connection found in the catalog.');
      }

      const isOutlier =
        strongCount <= 1 ||
        maxScore < 0.68 ||
        !song.bpm ||
        (!song.camelot_code && !song.musical_key);

      if (isOutlier) {
        reasons.push('Creative opportunity: suitable for intentional hard cuts, energy resets, or bridge-mediated transitions.');
        outliers.push({
          song_id: song.id,
          title: song.title,
          artist: song.artist,
          strong_connection_count: strongCount,
          total_viable_count: viableCount,
          max_compatibility_score: maxScore,
          bpm: song.bpm,
          camelot_code: song.camelot_code ?? song.musical_key,
          energy_rating: song.energy_rating,
          reasons,
        });
      }
    }

    outliers.sort((a, b) => a.max_compatibility_score - b.max_compatibility_score);
    return outliers;
  },

  getUnusualTransitions: async (
    songId: string,
    limit?: number
  ): Promise<SongRelationship[]> => {
    const songs = await mockBackend.listSongs();
    const fromSong = songs.find((s) => s.id === songId);
    if (!fromSong) return [];

    const others = songs.filter((s) => s.id !== songId);
    const rels = others.map((s) => evaluateMockSongRelationship(fromSong, s));

    const unusual = rels.filter(
      (r) =>
        r.explanation.energy.is_reset ||
        r.explanation.energy.is_contrast ||
        r.explanation.bpm.compatibility === 'HalfTime' ||
        r.explanation.bpm.compatibility === 'DoubleTime' ||
        r.explanation.bpm.compatibility === 'Wide' ||
        r.explanation.harmony.relation === 'WholeStepLift' ||
        r.explanation.harmony.relation === 'HalfStepLift' ||
        r.explanation.harmony.relation === 'Tritone' ||
        r.primary_classification === 'HardCut' ||
        r.primary_classification === 'EnergyReset' ||
        r.primary_classification === 'IntentionalContrast'
    );

    unusual.sort((a, b) => b.overall_score - a.overall_score);
    return unusual.slice(0, limit ?? 5);
  },

  getCatalogSummaryStats: async (): Promise<CatalogSummaryStats> => {
    const songs = await mockBackend.listSongs();
    const totalSongs = songs.length;
    if (totalSongs < 2) {
      return {
        total_songs: totalSongs,
        total_possible_transitions: 0,
        strong_transitions_count: 0,
        average_compatibility: 0,
        cluster_count: 0,
        outlier_count: totalSongs,
      };
    }

    const totalPossible = totalSongs * (totalSongs - 1);
    let strongCount = 0;
    let totalScore = 0;

    for (const from of songs) {
      for (const to of songs) {
        if (from.id === to.id) continue;
        const rel = evaluateMockSongRelationship(from, to);
        totalScore += rel.overall_score;
        if (rel.overall_score >= 0.7) strongCount++;
      }
    }

    const clusters = await mockBackend.getCatalogClusters();
    const outliers = await mockBackend.getCatalogOutliers();

    return {
      total_songs: totalSongs,
      total_possible_transitions: totalPossible,
      strong_transitions_count: strongCount,
      average_compatibility: totalScore / totalPossible,
      cluster_count: clusters.length,
      outlier_count: outliers.length,
    };
  },

  exploreCandidatePaths: async (
    constraints: DiscoveryConstraints
  ): Promise<DiscoveryCandidatePath[]> => {
    const songs = await mockBackend.listSongs();
    if (songs.length < 2) return [];

    const totalDur = songs.reduce((acc, s) => acc + s.duration_seconds, 0);
    const avgDuration = Math.max(60, totalDur / songs.length);

    let targetCount = 4;
    let targetSeconds: number | null = null;
    if (constraints.target_duration_minutes) {
      targetSeconds = constraints.target_duration_minutes * 60;
      targetCount = Math.min(songs.length, Math.max(2, Math.round(targetSeconds / avgDuration)));
    } else if (constraints.must_include_ids?.length) {
      targetCount = Math.min(songs.length, Math.max(2, constraints.must_include_ids.length + 2));
    }

    const startIds: string[] = [];
    if (constraints.start_song_id && songs.some((s) => s.id === constraints.start_song_id)) {
      startIds.push(constraints.start_song_id);
    } else {
      const { openers } = await mockBackend.getCatalogOpenersAndClosers();
      for (const op of openers.slice(0, 4)) {
        startIds.push(op.song_id);
      }
      if (!startIds.length) {
        startIds.push(...songs.slice(0, 4).map((s) => s.id));
      }
    }

    const rawPaths: string[][] = [];

    for (const startId of startIds) {
      let beam: { path: string[]; score: number }[] = [{ path: [startId], score: 1.0 }];

      while (beam.length > 0) {
        const nextBeam: { path: string[]; score: number }[] = [];

        for (const { path, score } of beam) {
          if (path.length >= targetCount) {
            rawPaths.push(path);
            continue;
          }

          const lastId = path[path.length - 1];
          const lastSong = songs.find((s) => s.id === lastId);
          if (!lastSong) continue;

          const isLastStep = path.length + 1 === targetCount;
          if (isLastStep && constraints.end_song_id && !path.includes(constraints.end_song_id)) {
            const endSong = songs.find((s) => s.id === constraints.end_song_id);
            if (endSong) {
              const rel = evaluateMockSongRelationship(lastSong, endSong);
              nextBeam.push({ path: [...path, endSong.id], score: score * rel.overall_score });
              continue;
            }
          }

          const candidates: { song: Song; candScore: number }[] = [];
          for (const nextSong of songs) {
            if (path.includes(nextSong.id)) continue;
            if (!isLastStep && constraints.end_song_id && nextSong.id === constraints.end_song_id) {
              continue;
            }
            const rel = evaluateMockSongRelationship(lastSong, nextSong);
            let cScore = rel.overall_score;
            if (constraints.must_include_ids?.includes(nextSong.id)) {
              cScore += 0.35;
            }
            candidates.push({ song: nextSong, candScore: cScore });
          }

          candidates.sort((a, b) => b.candScore - a.candScore);
          for (const { song: candSong, candScore } of candidates.slice(0, 3)) {
            nextBeam.push({ path: [...path, candSong.id], score: score * candScore });
          }
        }

        nextBeam.sort((a, b) => b.score - a.score);
        beam = nextBeam.slice(0, 10);
      }
    }

    const candidatePaths: DiscoveryCandidatePath[] = [];
    const seen = new Set<string>();

    for (const pIds of rawPaths) {
      const sig = pIds.join('->');
      if (seen.has(sig)) continue;
      seen.add(sig);

      if (constraints.end_song_id && pIds[pIds.length - 1] !== constraints.end_song_id) {
        continue;
      }

      const pathSongs = pIds.map((id) => songs.find((s) => s.id === id)!).filter(Boolean);
      if (pathSongs.length !== pIds.length) continue;

      const transitions: SongRelationship[] = [];
      for (let i = 0; i < pathSongs.length - 1; i++) {
        transitions.push(evaluateMockSongRelationship(pathSongs[i], pathSongs[i + 1]));
      }

      const pTotalDur = pathSongs.reduce((acc, s) => acc + s.duration_seconds, 0);
      const avgScore =
        transitions.reduce((acc, t) => acc + t.overall_score, 0) / (transitions.length || 1);
      const minScore = Math.min(...transitions.map((t) => t.overall_score));
      const energyProgression = pathSongs.map((s) => s.energy_rating ?? 5);

      const totalMins = Math.round(pTotalDur / 60);
      const summary = `A cohesive ${pathSongs.length}-track path (~${totalMins} min) moving from '${pathSongs[0].title}' to '${pathSongs[pathSongs.length - 1].title}' with ${Math.round(avgScore * 100)}% average harmonic/energy compatibility.`;

      candidatePaths.push({
        song_ids: pIds,
        songs: pathSongs,
        transitions,
        total_duration_seconds: pTotalDur,
        average_score: avgScore,
        min_score: minScore,
        energy_progression: energyProgression,
        summary,
      });
    }

    candidatePaths.sort((a, b) => b.average_score - a.average_score);
    return candidatePaths.slice(0, constraints.limit ?? 5);
  },
};

let mockSettings: AppSettings = {
  cost_weights: {
    tempo: 0.3,
    key: 0.35,
    energy: 0.35,
    timbre: 0.0,
  },
  key_penalties: [
    { distance: 0, same_mode: 0.0, mode_flip: 0.1 },
    { distance: 1, same_mode: 0.1, mode_flip: 0.4 },
    { distance: 2, same_mode: 0.35, mode_flip: 0.6 },
    { distance: 3, same_mode: 0.7, mode_flip: 0.8 },
    { distance: 4, same_mode: 0.85, mode_flip: 0.9 },
    { distance: 5, same_mode: 0.95, mode_flip: 0.95 },
    { distance: 6, same_mode: 1.0, mode_flip: 1.0 },
  ],
  energy_model: {
    divisor: 16.0,
    target_step: 1.5,
  },
  worker_count: 4,
};

// ─────────────────────────────────────────────────────────────────────────────
// tauriBackend Implementation (Native Tauri IPC & Events with Friendly Error Toasts)
// ─────────────────────────────────────────────────────────────────────────────

export type ToastHandler = (toast: { type: 'error'; message: string; details?: string }) => void;
let globalToastHandler: ToastHandler | null = null;

export function setBackendToastHandler(handler: ToastHandler | null): void {
  globalToastHandler = handler;
}

export function turnBackendErrorToToast(error: unknown): {
  type: 'error';
  message: string;
  details: string;
  friendly: FriendlyError;
} {
  return formatFriendlyToast(error);
}

export function emitBackendErrorToast(error: unknown): FriendlyError {
  const toast = turnBackendErrorToToast(error);
  if (globalToastHandler) {
    globalToastHandler(toast);
  } else if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('setlist:toast', { detail: toast }));
    } catch {
      // Ignore
    }
  }
  return toast.friendly;
}

export async function invokeSafe<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return args !== undefined ? await invoke<T>(cmd, args) : await invoke<T>(cmd);
  } catch (err: unknown) {
    const friendly = emitBackendErrorToast(err);
    const friendlyMsg = friendly.nextStep
      ? `${friendly.message} ${friendly.nextStep}`
      : friendly.message;
    const errorObj = new Error(friendlyMsg);
    (errorObj as unknown as { friendly: FriendlyError; rawError: unknown }).friendly = friendly;
    (errorObj as unknown as { rawError: unknown }).rawError = err;
    throw errorObj;
  }
}

export const tauriBackend: Backend = {
  ping: async (): Promise<string> => {
    return invokeSafe<string>('ping');
  },

  scanFolder: async (path: string): Promise<Track[]> => {
    setLatestScanSummary(createEmptyScanSummary());
    return invokeSafe<Track[]>('scan_folder', { path });
  },

  listTracks: async (): Promise<Track[]> => {
    return invokeSafe<Track[]>('list_tracks');
  },

  getTrack: async (id: string): Promise<Track | null> => {
    return invokeSafe<Track | null>('get_track', { id });
  },

  suggestOrder: async (
    trackIds: string[],
    profile?: EnergyProfile,
    weights?: CostWeights,
    firstId?: string,
    lastId?: string
  ): Promise<SetlistEntry[]> => {
    return invokeSafe<SetlistEntry[]>('suggest_order', {
      trackIds,
      profile: profile ?? null,
      weights: weights ?? null,
      firstId: firstId ?? null,
      lastId: lastId ?? null,
    });
  },

  getAdvice: async (
    trackAId: string,
    trackBId: string,
    profile?: EnergyProfile,
    weights?: CostWeights,
    deTarget?: number
  ): Promise<TransitionAdvice> => {
    return invokeSafe<TransitionAdvice>('get_advice', {
      trackAId,
      trackBId,
      profile: profile ?? null,
      weights: weights ?? null,
      deTarget: deTarget ?? null,
    });
  },

  exportSet: async (
    entries: SetlistEntry[],
    target: ExportTarget,
    outputPath?: string,
    overwrite?: boolean
  ): Promise<ExportResult> => {
    return invokeSafe<ExportResult>('export_set', {
      entries,
      target,
      outputPath: outputPath ?? null,
      overwrite: overwrite ?? null,
    });
  },

  getSettings: async (): Promise<AppSettings> => {
    return invokeSafe<AppSettings>('get_settings');
  },

  saveSettings: async (settings: AppSettings): Promise<void> => {
    return invokeSafe<void>('save_settings', { settings });
  },

  subscribeProgress: (callback: (event: ProgressEvent) => void): (() => void) => {
    let unlistenFn: (() => void) | null = null;
    let unsubscribed = false;

    listen<ProgressEvent>('progress', (event) => {
      if (!unsubscribed) {
        if (event.payload.message) {
          const current = getLatestScanSummary() ?? createEmptyScanSummary();
          setLatestScanSummary(recordScanMessage(current, event.payload.message));
        }
        callback(event.payload);
      }
    })
      .then((unlisten) => {
        if (unsubscribed) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to register progress event listener:', err);
      });

    return () => {
      unsubscribed = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  },

  onProgress: (callback: (event: ProgressEvent) => void): (() => void) => {
    return tauriBackend.subscribeProgress(callback);
  },

  validateSongInput: async (song: Song): Promise<void> => {
    return invokeSafe<void>('validate_song_input', { song });
  },

  upsertSong: async (song: Song): Promise<string> => {
    return invokeSafe<string>('upsert_song', { song });
  },

  getSong: async (id: string): Promise<Song | null> => {
    return invokeSafe<Song | null>('get_song', { id });
  },

  listSongs: async (): Promise<Song[]> => {
    return invokeSafe<Song[]>('list_songs');
  },

  deleteSong: async (id: string): Promise<boolean> => {
    return invokeSafe<boolean>('delete_song', { id });
  },

  getActiveSetlist: async (): Promise<Setlist | null> => {
    return invokeSafe<Setlist | null>('get_active_setlist');
  },

  saveActiveSetlist: async (setlist: Setlist): Promise<void> => {
    return invokeSafe<void>('save_active_setlist', { setlist });
  },

  loadSetlist: async (id: string): Promise<Setlist | null> => {
    return invokeSafe<Setlist | null>('load_setlist', { id });
  },

  listSetlists: async (): Promise<Setlist[]> => {
    return invokeSafe<Setlist[]>('list_setlists');
  },

  saveSetlist: async (setlist: Setlist): Promise<void> => {
    return invokeSafe<void>('save_setlist', { setlist });
  },

  deleteSetlist: async (id: string): Promise<boolean> => {
    return invokeSafe<boolean>('delete_setlist', { id });
  },

  addSetlistItem: async (setlistId: string, item: SetlistItem): Promise<void> => {
    return invokeSafe<void>('add_setlist_item', { setlistId, item });
  },

  removeSetlistItem: async (setlistId: string, position: number): Promise<void> => {
    return invokeSafe<void>('remove_setlist_item', { setlistId, position });
  },

  moveSetlistItem: async (setlistId: string, fromPos: number, toPos: number): Promise<void> => {
    return invokeSafe<void>('move_setlist_item', { setlistId, fromPos, toPos });
  },

  updateSetlistItem: async (item: SetlistItem): Promise<void> => {
    return invokeSafe<void>('update_setlist_item', { item });
  },

  getSongRelationships: async (songId: string): Promise<SongRelationshipsResponse> => {
    return invokeSafe<SongRelationshipsResponse>('get_song_relationships', { songId });
  },

  getSongRelationship: async (
    fromSongId: string,
    toSongId: string
  ): Promise<SongRelationship> => {
    return invokeSafe<SongRelationship>('get_song_relationship', { fromSongId, toSongId });
  },

  getPotentialBridges: async (
    songAId: string,
    songBId: string,
    limit?: number
  ): Promise<BridgeCandidateAnalysis[]> => {
    return invokeSafe<BridgeCandidateAnalysis[]>('get_potential_bridges', {
      songAId,
      songBId,
      limit,
    });
  },

  getCatalogClusters: async (): Promise<CatalogCluster[]> => {
    return invokeSafe<CatalogCluster[]>('get_catalog_clusters');
  },

  getCatalogOpenersAndClosers: async (): Promise<CatalogOpenersAndClosers> => {
    return invokeSafe<CatalogOpenersAndClosers>('get_catalog_openers_and_closers');
  },

  getCatalogOutliers: async (): Promise<CatalogOutlier[]> => {
    return invokeSafe<CatalogOutlier[]>('get_catalog_outliers');
  },

  getUnusualTransitions: async (
    songId: string,
    limit?: number
  ): Promise<SongRelationship[]> => {
    return invokeSafe<SongRelationship[]>('get_unusual_transitions', { songId, limit });
  },

  getCatalogSummaryStats: async (): Promise<CatalogSummaryStats> => {
    return invokeSafe<CatalogSummaryStats>('get_catalog_summary_stats');
  },

  exploreCandidatePaths: async (
    constraints: DiscoveryConstraints
  ): Promise<DiscoveryCandidatePath[]> => {
    return invokeSafe<DiscoveryCandidatePath[]>('explore_candidate_paths', { constraints });
  },
};

/**
 * Returns whether the application is running inside a native Tauri runtime window.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Returns the active backend instance based on the selection flag.
 */
export function getBackend(useMock: boolean = USE_MOCK_BACKEND): Backend {
  return useMock ? mockBackend : tauriBackend;
}

