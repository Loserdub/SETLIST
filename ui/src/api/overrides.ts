import { invoke } from '@tauri-apps/api/core';
import type { Track } from '../bindings/Track';
import type { CuePoint } from '../bindings/CuePoint';
import type { Mode } from '../bindings/Mode';
import type { Camelot } from '../bindings/Camelot';
import type { CamelotLetter } from '../bindings/CamelotLetter';
import type { BeatGrid } from '../bindings/BeatGrid';
import { isTauriEnvironment, USE_MOCK_BACKEND, mockBackend, updateMockTrack } from './index';

/**
 * Patch payload for setting or updating user analysis overrides on a track.
 */
export interface TrackOverridePatch {
  bpm?: number;
  first_downbeat_ms?: number;
  key_camelot?: string;
  cues_json?: string;
  cues?: CuePoint[];
  title?: string;
  artist?: string;
}

/**
 * Flags indicating which analysis fields have active user overrides.
 */
export interface TrackOverrideFlags {
  bpm: boolean;
  first_downbeat_ms: boolean;
  key_camelot: boolean;
  cues: boolean;
  title?: boolean;
  artist?: boolean;
}

/**
 * Database record representing stored overrides for a track.
 */
export interface TrackOverride {
  track_id: string;
  bpm?: number | null;
  first_downbeat_ms?: number | null;
  key_camelot?: string | null;
  cues_json?: string | null;
  title?: string | null;
  artist?: string | null;
  updated_at?: string | null;
}

/**
 * Track combined with field-level override indicators.
 */
export type TrackWithOverrides = Track & {
  overrides?: TrackOverrideFlags;
};

/**
 * Client interface for managing track analysis overrides.
 */
export interface OverridesClient {
  setTrackOverride(trackId: string, patch: TrackOverridePatch): Promise<void>;
  clearTrackOverride(trackId: string, fields?: string[]): Promise<void>;
  getTrackOverride(trackId: string): Promise<TrackOverride | null>;
  getTrackOverrideFlags(trackId: string): Promise<TrackOverrideFlags>;
  getTrackWithOverrides(trackId: string): Promise<TrackWithOverrides | null>;
}

/**
 * Rebuilds a constant 4/4 beat grid matching Rust's library_db::rebuild_beat_grid.
 */
export function rebuildBeatGrid(bpm: number, firstDownbeatMs: number, durationMs: number): BeatGrid {
  if (bpm <= 0 || durationMs <= 0) {
    return {
      first_downbeat_ms: firstDownbeatMs,
      bpm,
      beats_ms: [],
      downbeat_flags: [],
      steady: true,
    };
  }

  const beatPeriodMs = 60_000.0 / bpm;
  const beatsMs: number[] = [];
  const downbeatFlags: boolean[] = [];

  // Walk backward from firstDownbeatMs to include any beats before it (>= 0 ms)
  let currentMs = firstDownbeatMs;
  while (currentMs - beatPeriodMs >= 0.0) {
    currentMs -= beatPeriodMs;
  }

  let beatCount = 0;
  const beatZeroMs = currentMs;
  const offsetBeatsToFirstDb = Math.round((firstDownbeatMs - beatZeroMs) / beatPeriodMs);

  while (currentMs < durationMs) {
    beatsMs.push(Math.round(currentMs * 100) / 100);
    const relative = beatCount - offsetBeatsToFirstDb;
    const isDownbeat = ((relative % 4) + 4) % 4 === 0;
    downbeatFlags.push(isDownbeat);
    currentMs += beatPeriodMs;
    beatCount += 1;
  }

  const actualFirstDbIdx = downbeatFlags.findIndex((db) => db);
  const actualFirstDownbeatMs = actualFirstDbIdx >= 0 ? beatsMs[actualFirstDbIdx] : firstDownbeatMs;

  return {
    first_downbeat_ms: actualFirstDownbeatMs,
    bpm,
    beats_ms: beatsMs,
    downbeat_flags: downbeatFlags,
    steady: true,
  };
}

/**
 * Parses a Camelot code (e.g. "8A", "11B") into pitch class, mode, and Camelot object.
 */
export function parseCamelotKey(keyStr: string): { pitch_class: number; mode: Mode; camelot: Camelot } | null {
  const match = keyStr.trim().match(/^(\d{1,2})([ABab])$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (num < 1 || num > 12) return null;
  const letter = match[2].toUpperCase() as CamelotLetter;
  const mode: Mode = letter === 'A' ? 'Minor' : 'Major';
  const pc =
    letter === 'A'
      ? (((7 * (num - 5)) % 12) + 12) % 12
      : (((7 * (num - 8)) % 12) + 12) % 12;

  return {
    pitch_class: pc,
    mode,
    camelot: {
      number: num,
      letter,
    },
  };
}

interface AnalyzedBackup {
  bpm: number;
  first_downbeat_ms: number;
  key: {
    pitch_class: number;
    mode: Mode;
    camelot: Camelot;
    tuning_cents: number;
  };
  cues: CuePoint[];
  title?: string | null;
  artist?: string | null;
}

/**
 * In-memory mock overrides engine for Vitest and browser mock mode.
 */
export class MockOverridesClient implements OverridesClient {
  private overrides = new Map<string, TrackOverride>();
  private backups = new Map<string, AnalyzedBackup>();
  private mockTrackCache = new Map<string, TrackWithOverrides>();

  /**
   * Resets mock state (useful for tests).
   */
  public reset(): void {
    for (const id of Array.from(this.backups.keys())) {
      this.revertCachedTrack(id, ['all']);
    }
    this.overrides.clear();
    this.backups.clear();
    this.mockTrackCache.clear();
  }

  private async getSourceTrack(trackId: string): Promise<Track | null> {
    if (this.mockTrackCache.has(trackId)) {
      return this.mockTrackCache.get(trackId)!;
    }
    const t = await mockBackend.getTrack(trackId);
    return t ? JSON.parse(JSON.stringify(t)) : null;
  }

  public async setTrackOverride(trackId: string, patch: TrackOverridePatch): Promise<void> {
    const track = await this.getSourceTrack(trackId);
    if (!track) {
      throw new Error(`Track with id '${trackId}' not found`);
    }

    // Save initial backup if not already present
    if (!this.backups.has(trackId)) {
      this.backups.set(trackId, {
        bpm: track.analysis?.rhythm.grid.bpm ?? 120,
        first_downbeat_ms: track.analysis?.rhythm.grid.first_downbeat_ms ?? 0,
        key: track.analysis
          ? JSON.parse(JSON.stringify(track.analysis.key))
          : { pitch_class: 0, mode: 'Minor', camelot: { number: 8, letter: 'A' }, tuning_cents: 0 },
        cues: track.analysis ? JSON.parse(JSON.stringify(track.analysis.cue_points)) : [],
        title: track.tags?.title ?? null,
        artist: track.tags?.artist ?? null,
      });
    }

    const existing = this.overrides.get(trackId) ?? { track_id: trackId };
    const updated: TrackOverride = {
      track_id: trackId,
      bpm: patch.bpm !== undefined ? patch.bpm : existing.bpm,
      first_downbeat_ms:
        patch.first_downbeat_ms !== undefined ? patch.first_downbeat_ms : existing.first_downbeat_ms,
      key_camelot:
        patch.key_camelot !== undefined ? patch.key_camelot : existing.key_camelot,
      cues_json:
        patch.cues_json !== undefined
          ? patch.cues_json
          : patch.cues
          ? JSON.stringify(patch.cues)
          : existing.cues_json,
      title: patch.title !== undefined ? patch.title : existing.title,
      artist: patch.artist !== undefined ? patch.artist : existing.artist,
      updated_at: new Date().toISOString(),
    };

    this.overrides.set(trackId, updated);
    this.applyToCachedTrack(trackId, updated);
  }

  public async clearTrackOverride(trackId: string, fields?: string[]): Promise<void> {
    const existing = this.overrides.get(trackId);
    if (!existing) return;

    const clearAll = !fields || fields.length === 0 || fields.some((f) => f.toLowerCase() === 'all');
    if (clearAll) {
      this.overrides.delete(trackId);
      this.revertCachedTrack(trackId, ['bpm', 'first_downbeat_ms', 'key_camelot', 'cues_json', 'title', 'artist']);
    } else {
      for (const field of fields) {
        const lower = field.toLowerCase();
        if (lower === 'bpm') existing.bpm = null;
        if (lower === 'first_downbeat_ms' || lower === 'downbeat') existing.first_downbeat_ms = null;
        if (lower === 'key_camelot' || lower === 'key' || lower === 'camelot') existing.key_camelot = null;
        if (lower === 'cues_json' || lower === 'cues') existing.cues_json = null;
        if (lower === 'title') existing.title = null;
        if (lower === 'artist') existing.artist = null;
      }

      if (
        !existing.bpm &&
        !existing.first_downbeat_ms &&
        !existing.key_camelot &&
        !existing.cues_json &&
        !existing.title &&
        !existing.artist
      ) {
        this.overrides.delete(trackId);
      } else {
        existing.updated_at = new Date().toISOString();
        this.overrides.set(trackId, existing);
      }
      this.revertCachedTrack(trackId, fields);
    }
  }

  public async getTrackOverride(trackId: string): Promise<TrackOverride | null> {
    return this.overrides.get(trackId) ?? null;
  }

  public async getTrackOverrideFlags(trackId: string): Promise<TrackOverrideFlags> {
    const ov = this.overrides.get(trackId);
    return {
      bpm: Boolean(ov?.bpm != null),
      first_downbeat_ms: Boolean(ov?.first_downbeat_ms != null),
      key_camelot: Boolean(ov?.key_camelot != null),
      cues: Boolean(ov?.cues_json != null),
      title: Boolean(ov?.title != null),
      artist: Boolean(ov?.artist != null),
    };
  }

  public async getTrackWithOverrides(trackId: string): Promise<TrackWithOverrides | null> {
    const track = await this.getSourceTrack(trackId);
    if (!track) return null;

    const flags = await this.getTrackOverrideFlags(trackId);
    const ov = this.overrides.get(trackId);
    if (ov) {
      this.applyOverridesToTrackObj(track, ov);
    }

    const result: TrackWithOverrides = {
      ...track,
      overrides: flags,
    };
    this.mockTrackCache.set(trackId, result);
    return result;
  }

  private applyOverridesToTrackObj(track: Track, ov: TrackOverride): void {
    if (ov.title !== undefined && ov.title !== null) {
      track.tags.title = ov.title;
    }
    if (ov.artist !== undefined && ov.artist !== null) {
      track.tags.artist = ov.artist;
    }

    if (!track.analysis) return;

    const backup = this.backups.get(track.id);
    const baseBpm = backup ? backup.bpm : track.analysis.rhythm.grid.bpm;
    const baseDownbeat = backup ? backup.first_downbeat_ms : track.analysis.rhythm.grid.first_downbeat_ms;

    const effectiveBpm = ov.bpm != null ? ov.bpm : baseBpm;
    const effectiveDownbeat = ov.first_downbeat_ms != null ? ov.first_downbeat_ms : baseDownbeat;

    if (ov.bpm != null || ov.first_downbeat_ms != null) {
      track.analysis.rhythm.grid = rebuildBeatGrid(effectiveBpm, effectiveDownbeat, track.duration_ms);
    }

    if (ov.key_camelot) {
      const parsed = parseCamelotKey(ov.key_camelot);
      if (parsed) {
        track.analysis.key = {
          pitch_class: parsed.pitch_class,
          mode: parsed.mode,
          camelot: parsed.camelot,
          tuning_cents: track.analysis.key.tuning_cents,
        };
      }
    }

    if (ov.cues_json) {
      try {
        track.analysis.cue_points = JSON.parse(ov.cues_json);
      } catch {
        // ignore invalid JSON in mock
      }
    }
  }

  private applyToCachedTrack(trackId: string, ov: TrackOverride): void {
    const cached = this.mockTrackCache.get(trackId);
    if (cached) {
      this.applyOverridesToTrackObj(cached, ov);
      cached.overrides = {
        bpm: Boolean(ov.bpm != null),
        first_downbeat_ms: Boolean(ov.first_downbeat_ms != null),
        key_camelot: Boolean(ov.key_camelot != null),
        cues: Boolean(ov.cues_json != null),
        title: Boolean(ov.title != null),
        artist: Boolean(ov.artist != null),
      };
      updateMockTrack(cached);
    }
  }

  private revertCachedTrack(trackId: string, fields: string[]): void {
    const cached = this.mockTrackCache.get(trackId);
    const backup = this.backups.get(trackId);
    if (!cached || !backup) return;

    const ov = this.overrides.get(trackId);
    const clearAll = fields.some((f) => f.toLowerCase() === 'all') || fields.length === 0;

    if (clearAll || fields.some((f) => f.toLowerCase() === 'title')) {
      cached.tags.title = ov?.title != null ? ov.title : (backup.title ?? null);
    }

    if (clearAll || fields.some((f) => f.toLowerCase() === 'artist')) {
      cached.tags.artist = ov?.artist != null ? ov.artist : (backup.artist ?? null);
    }

    if (cached.analysis) {
      if (clearAll || fields.some((f) => f.toLowerCase() === 'bpm')) {
        const effBpm = ov?.bpm != null ? ov.bpm : backup.bpm;
        const effDownbeat = ov?.first_downbeat_ms != null ? ov.first_downbeat_ms : backup.first_downbeat_ms;
        cached.analysis.rhythm.grid = rebuildBeatGrid(effBpm, effDownbeat, cached.duration_ms);
      }

      if (clearAll || fields.some((f) => ['first_downbeat_ms', 'downbeat'].includes(f.toLowerCase()))) {
        const effBpm = ov?.bpm != null ? ov.bpm : backup.bpm;
        const effDownbeat = ov?.first_downbeat_ms != null ? ov.first_downbeat_ms : backup.first_downbeat_ms;
        cached.analysis.rhythm.grid = rebuildBeatGrid(effBpm, effDownbeat, cached.duration_ms);
      }

      if (clearAll || fields.some((f) => ['key_camelot', 'key', 'camelot'].includes(f.toLowerCase()))) {
        if (ov?.key_camelot) {
          const parsed = parseCamelotKey(ov.key_camelot);
          if (parsed) {
            cached.analysis.key = {
              pitch_class: parsed.pitch_class,
              mode: parsed.mode,
              camelot: parsed.camelot,
              tuning_cents: backup.key.tuning_cents,
            };
          }
        } else {
          cached.analysis.key = JSON.parse(JSON.stringify(backup.key));
        }
      }

      if (clearAll || fields.some((f) => ['cues_json', 'cues'].includes(f.toLowerCase()))) {
        if (ov?.cues_json) {
          try {
            cached.analysis.cue_points = JSON.parse(ov.cues_json);
          } catch {
            // ignore
          }
        } else {
          cached.analysis.cue_points = JSON.parse(JSON.stringify(backup.cues));
        }
      }
    }

    cached.overrides = {
      bpm: Boolean(ov?.bpm != null),
      first_downbeat_ms: Boolean(ov?.first_downbeat_ms != null),
      key_camelot: Boolean(ov?.key_camelot != null),
      cues: Boolean(ov?.cues_json != null),
      title: Boolean(ov?.title != null),
      artist: Boolean(ov?.artist != null),
    };
    updateMockTrack(cached);
  }
}

/**
 * Native desktop implementation invoking Tauri backend commands.
 */
export class TauriOverridesClient implements OverridesClient {
  public async setTrackOverride(trackId: string, patch: TrackOverridePatch): Promise<void> {
    return invoke<void>('set_track_override', { track_id: trackId, patch });
  }

  public async clearTrackOverride(trackId: string, fields?: string[]): Promise<void> {
    return invoke<void>('clear_track_override', { track_id: trackId, fields: fields ?? null });
  }

  public async getTrackOverride(trackId: string): Promise<TrackOverride | null> {
    return invoke<TrackOverride | null>('get_track_override', { track_id: trackId });
  }

  public async getTrackOverrideFlags(trackId: string): Promise<TrackOverrideFlags> {
    return invoke<TrackOverrideFlags>('get_track_override_flags', { track_id: trackId });
  }

  public async getTrackWithOverrides(trackId: string): Promise<TrackWithOverrides | null> {
    return invoke<TrackWithOverrides | null>('get_track', { id: trackId });
  }
}

// Singletons
export const mockOverridesClient = new MockOverridesClient();
export const tauriOverridesClient = new TauriOverridesClient();

/**
 * Returns active overrides client depending on mock mode or Tauri runtime.
 */
export function getOverridesClient(useMock?: boolean): OverridesClient {
  const shouldUseMock = useMock ?? (USE_MOCK_BACKEND || !isTauriEnvironment());
  return shouldUseMock ? mockOverridesClient : tauriOverridesClient;
}

// Standalone function wrappers
export const setTrackOverride = (trackId: string, patch: TrackOverridePatch): Promise<void> =>
  getOverridesClient().setTrackOverride(trackId, patch);

export const clearTrackOverride = (trackId: string, fields?: string[]): Promise<void> =>
  getOverridesClient().clearTrackOverride(trackId, fields);

export const getTrackOverride = (trackId: string): Promise<TrackOverride | null> =>
  getOverridesClient().getTrackOverride(trackId);

export const getTrackOverrideFlags = (trackId: string): Promise<TrackOverrideFlags> =>
  getOverridesClient().getTrackOverrideFlags(trackId);

export const getTrackWithOverrides = (trackId: string): Promise<TrackWithOverrides | null> =>
  getOverridesClient().getTrackWithOverrides(trackId);

export interface MigrationResult {
  migratedTitles: number;
  migratedArtists: number;
  failedTitles: number;
  failedArtists: number;
}

/**
 * Performs a one-time migration of custom title and artist overrides from browser localStorage
 * to the SQLite database via the overrides client.
 *
 * Guaranteed safe to run multiple times. Successfully migrated entries are removed from
 * localStorage, while any failed entries are preserved and logged.
 */
export async function migrateLocalStorageOverrides(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = typeof window !== 'undefined'
    ? window.localStorage
    : null,
  client: OverridesClient = getOverridesClient()
): Promise<MigrationResult> {
  const result: MigrationResult = {
    migratedTitles: 0,
    migratedArtists: 0,
    failedTitles: 0,
    failedArtists: 0,
  };

  if (!storage) {
    return result;
  }

  // 1. Process Title Overrides
  const rawTitle = storage.getItem('setlist_track_title_overrides');
  if (rawTitle) {
    let titleRecord: Record<string, string> = {};
    try {
      titleRecord = JSON.parse(rawTitle);
    } catch (e) {
      console.error('Failed to parse setlist_track_title_overrides JSON:', e);
    }

    const failedTitleEntries: Record<string, string> = {};
    const titleEntries = Object.entries(titleRecord);

    for (const [trackId, title] of titleEntries) {
      if (typeof title === 'string' && title.trim().length > 0) {
        try {
          await client.setTrackOverride(trackId, { title: title.trim() });
          result.migratedTitles += 1;
        } catch (err) {
          console.error(`Failed to migrate title override for track ${trackId}:`, err);
          failedTitleEntries[trackId] = title;
          result.failedTitles += 1;
        }
      }
    }

    if (Object.keys(failedTitleEntries).length > 0) {
      try {
        storage.setItem('setlist_track_title_overrides', JSON.stringify(failedTitleEntries));
      } catch (err) {
        console.error('Failed to update localStorage with remaining failed title overrides:', err);
      }
    } else {
      try {
        storage.removeItem('setlist_track_title_overrides');
      } catch (err) {
        console.error('Failed to remove setlist_track_title_overrides key:', err);
      }
    }
  }

  // 2. Process Artist Overrides
  const rawArtist = storage.getItem('setlist_track_artist_overrides');
  if (rawArtist) {
    let artistRecord: Record<string, string> = {};
    try {
      artistRecord = JSON.parse(rawArtist);
    } catch (e) {
      console.error('Failed to parse setlist_track_artist_overrides JSON:', e);
    }

    const failedArtistEntries: Record<string, string> = {};
    const artistEntries = Object.entries(artistRecord);

    for (const [trackId, artist] of artistEntries) {
      if (typeof artist === 'string' && artist.trim().length > 0) {
        try {
          await client.setTrackOverride(trackId, { artist: artist.trim() });
          result.migratedArtists += 1;
        } catch (err) {
          console.error(`Failed to migrate artist override for track ${trackId}:`, err);
          failedArtistEntries[trackId] = artist;
          result.failedArtists += 1;
        }
      }
    }

    if (Object.keys(failedArtistEntries).length > 0) {
      try {
        storage.setItem('setlist_track_artist_overrides', JSON.stringify(failedArtistEntries));
      } catch (err) {
        console.error('Failed to update localStorage with remaining failed artist overrides:', err);
      }
    } else {
      try {
        storage.removeItem('setlist_track_artist_overrides');
      } catch (err) {
        console.error('Failed to remove setlist_track_artist_overrides key:', err);
      }
    }
  }

  return result;
}
