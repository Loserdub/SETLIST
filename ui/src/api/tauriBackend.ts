import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Backend, ProgressEvent, ToastHandler } from './types';
import type { Track } from '../bindings/Track';
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
import type { SongRelationshipsResponse } from '../bindings/SongRelationshipsResponse';
import type { BridgeCandidateAnalysis } from '../bindings/BridgeCandidateAnalysis';
import type { CatalogCluster } from '../bindings/CatalogCluster';
import type { CatalogOpenersAndClosers } from '../bindings/CatalogOpenersAndClosers';
import type { CatalogOutlier } from '../bindings/CatalogOutlier';
import type { CatalogSummaryStats } from '../bindings/CatalogSummaryStats';
import type { DiscoveryCandidatePath } from '../bindings/DiscoveryCandidatePath';
import type { DiscoveryConstraints } from '../bindings/DiscoveryConstraints';
import { formatFriendlyToast, type FriendlyError } from '../utils/errors';
import {
  recordScanMessage,
  getLatestScanSummary,
  setLatestScanSummary,
  createEmptyScanSummary,
} from '../features/diagnostics/scanSummary';

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

  scanPaths: async (paths: string[]): Promise<Track[]> => {
    setLatestScanSummary(createEmptyScanSummary());
    return invokeSafe<Track[]>('scan_paths', { paths });
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
