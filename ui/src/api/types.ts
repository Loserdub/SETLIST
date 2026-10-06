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
import type { FriendlyError } from '../utils/errors';

/**
 * Progress event payload emitted during background tasks.
 */
export interface ProgressEvent {
  stage: 'scanning' | 'decoding' | 'analyzing' | 'sequencing' | 'exporting';
  current: number;
  total: number;
  message?: string;
  trackId?: string;
  bpm?: number;
  key?: string;
  camelot?: string;
  energy?: number;
  lufs?: number;
  fileName?: string;
  file_name?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export type ToastHandler = (toast: {
  type: 'error';
  message: string;
  details: string;
  friendly: FriendlyError;
}) => void;

/**
 * Typed backend interface for local-first desktop DJ assistance.
 */
export interface Backend {
  ping(): Promise<string>;
  scanFolder(path: string): Promise<Track[]>;
  scanPaths?(paths: string[]): Promise<Track[]>;
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
