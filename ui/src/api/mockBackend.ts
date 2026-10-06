import type { Backend, ProgressCallback } from './types';
import type { Track } from '../bindings/Track';
import type { TrackAnalysis } from '../bindings/TrackAnalysis';
import type { SetlistEntry } from '../bindings/SetlistEntry';
import type { TransitionAdvice } from '../bindings/TransitionAdvice';
import type { ExportTarget } from '../bindings/ExportTarget';
import type { ExportResult } from '../bindings/ExportResult';
import type { EnergyProfile } from '../bindings/EnergyProfile';
import type { CostWeights } from '../bindings/CostWeights';
import type { AppSettings } from '../bindings/AppSettings';
import type { Song } from '../bindings/Song';
import type { Setlist } from '../bindings/Setlist';
import type { SetlistItem } from '../bindings/SetlistItem';
import type { SongRelationship } from '../bindings/SongRelationship';
import type { CatalogOutlier } from '../bindings/CatalogOutlier';
import type { CatalogSummaryStats } from '../bindings/CatalogSummaryStats';
import type { DiscoveryCandidatePath } from '../bindings/DiscoveryCandidatePath';
import type { DiscoveryConstraints } from '../bindings/DiscoveryConstraints';
import { validateSong, validateSetlist } from '../utils/validation';
import { getTargetEnergy } from '../features/setlist/energyCurve';
import {
  MOCK_TRACKS_STORE,
  mockSongsStore,
  mockSetlistsStore,
  getMockActiveSetlist,
  setMockActiveSetlist,
  mockProgressListeners,
  emitMockProgress,
} from './mockData';
import {
  computeTransitionAdvice,
} from './mockDiscovery';
import {
  getMockSongRelationships,
  getMockSongRelationship,
  getMockPotentialBridges,
  getMockCatalogClusters,
  getMockCatalogOpenersAndClosers,
  getMockCatalogOutliers,
  getMockUnusualTransitions,
  getMockCatalogSummaryStats,
  exploreMockCandidatePaths,
} from './mockCatalog';
import { setLatestScanSummary } from '../features/diagnostics/scanSummary';

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

export const mockBackend: Backend = {
  ping: async (): Promise<string> => {
    return 'pong (mock)';
  },

  scanFolder: async (path: string): Promise<Track[]> => {
    emitMockProgress({
      stage: 'scanning',
      current: 0,
      total: 40,
      message: `Scanning ${path}...`,
      fileName: path.split(/[/\\]/).pop() || 'catalog_source',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    emitMockProgress({
      stage: 'decoding',
      current: 12,
      total: 40,
      message: 'Decoding audio streams...',
      bpm: 124.0,
      key: 'G minor',
      camelot: '6A',
      energy: 6.5,
      lufs: -9.2,
      fileName: '01_deep_pulse.wav',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    emitMockProgress({
      stage: 'analyzing',
      current: 28,
      total: 40,
      message: 'Extracting rhythm, key, and dynamics...',
      bpm: 126.4,
      key: 'A minor',
      camelot: '8A',
      energy: 7.2,
      lufs: -8.4,
      fileName: '02_midnight_resonance.flac',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    emitMockProgress({
      stage: 'analyzing',
      current: 40,
      total: 40,
      message: 'Scan complete!',
      bpm: 128.0,
      key: 'C major',
      camelot: '8B',
      energy: 8.0,
      lufs: -7.5,
      fileName: '03_apex_drop_master.wav',
    });
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

  scanPaths: async (paths: string[]): Promise<Track[]> => {
    return mockBackend.scanFolder(paths[0] || 'catalog_batch');
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
      const diff = eb - ea;
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });

    const merged = [...sorted, ...unanalyzed];
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
    return getMockActiveSetlist();
  },

  saveActiveSetlist: async (setlist: Setlist): Promise<void> => {
    const errors = validateSetlist(setlist);
    if (errors.length > 0) {
      throw new Error(`Validation failed for ${errors[0].field}: ${errors[0].message} (value: ${errors[0].invalid_value})`);
    }
    const cloned: Setlist = JSON.parse(JSON.stringify(setlist));
    setMockActiveSetlist(cloned);
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
    const active = getMockActiveSetlist();
    if (active?.id === id) {
      setMockActiveSetlist(null);
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

  getSongRelationships: getMockSongRelationships,

  getSongRelationship: getMockSongRelationship,

  getPotentialBridges: getMockPotentialBridges,

  getCatalogClusters: getMockCatalogClusters,

  getCatalogOpenersAndClosers: getMockCatalogOpenersAndClosers,

  getCatalogOutliers: async (): Promise<CatalogOutlier[]> => {
    const songs = await mockBackend.listSongs();
    return getMockCatalogOutliers(songs);
  },

  getUnusualTransitions: async (
    songId: string,
    limit?: number
  ): Promise<SongRelationship[]> => {
    const songs = await mockBackend.listSongs();
    return getMockUnusualTransitions(songId, songs, limit);
  },

  getCatalogSummaryStats: async (): Promise<CatalogSummaryStats> => {
    const songs = await mockBackend.listSongs();
    const clusters = await mockBackend.getCatalogClusters();
    const outliers = await mockBackend.getCatalogOutliers();
    return getMockCatalogSummaryStats(songs, clusters, outliers);
  },

  exploreCandidatePaths: async (
    constraints: DiscoveryConstraints
  ): Promise<DiscoveryCandidatePath[]> => {
    const songs = await mockBackend.listSongs();
    const { openers } = await mockBackend.getCatalogOpenersAndClosers();
    return exploreMockCandidatePaths(constraints, songs, openers);
  },
};
