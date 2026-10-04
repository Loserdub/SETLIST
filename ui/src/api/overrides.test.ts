import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mockOverridesClient,
  migrateLocalStorageOverrides,
  type OverridesClient,
  type TrackOverridePatch,
} from './overrides';
import { mockBackend } from './index';
import type { Track } from '../bindings/Track';

describe('Track Title and Artist Overrides API', () => {
  let sampleTrack: Track;

  beforeEach(async () => {
    mockOverridesClient.reset();
    const tracks = await mockBackend.listTracks();
    sampleTrack = JSON.parse(JSON.stringify(tracks[0]));
  });

  describe('MockOverridesClient Round Trip', () => {
    it('sets, retrieves, and clears title and artist overrides', async () => {
      const trackId = sampleTrack.id;

      // Initially no flags
      const initialFlags = await mockOverridesClient.getTrackOverrideFlags(trackId);
      expect(initialFlags.title).toBe(false);
      expect(initialFlags.artist).toBe(false);

      // Set overrides
      await mockOverridesClient.setTrackOverride(trackId, {
        title: 'Custom Title Banger',
        artist: 'Custom Artist DJ',
      });

      // Get stored override
      const stored = await mockOverridesClient.getTrackOverride(trackId);
      expect(stored).not.toBeNull();
      expect(stored?.title).toBe('Custom Title Banger');
      expect(stored?.artist).toBe('Custom Artist DJ');

      // Flags updated
      const updatedFlags = await mockOverridesClient.getTrackOverrideFlags(trackId);
      expect(updatedFlags.title).toBe(true);
      expect(updatedFlags.artist).toBe(true);

      // Track with overrides has effective values in tags
      const effectiveTrack = await mockOverridesClient.getTrackWithOverrides(trackId);
      expect(effectiveTrack).not.toBeNull();
      expect(effectiveTrack?.tags.title).toBe('Custom Title Banger');
      expect(effectiveTrack?.tags.artist).toBe('Custom Artist DJ');

      // Clear title only
      await mockOverridesClient.clearTrackOverride(trackId, ['title']);
      const afterTitleClear = await mockOverridesClient.getTrackWithOverrides(trackId);
      expect(afterTitleClear?.tags.title).toBe(sampleTrack.tags.title);
      expect(afterTitleClear?.tags.artist).toBe('Custom Artist DJ');
      const flagsAfterTitle = await mockOverridesClient.getTrackOverrideFlags(trackId);
      expect(flagsAfterTitle.title).toBe(false);
      expect(flagsAfterTitle.artist).toBe(true);

      // Clear artist
      await mockOverridesClient.clearTrackOverride(trackId, ['artist']);
      const afterBothClear = await mockOverridesClient.getTrackWithOverrides(trackId);
      expect(afterBothClear?.tags.artist).toBe(sampleTrack.tags.artist);
      const flagsFinal = await mockOverridesClient.getTrackOverrideFlags(trackId);
      expect(flagsFinal.title).toBe(false);
      expect(flagsFinal.artist).toBe(false);
    });
  });

  describe('migrateLocalStorageOverrides', () => {
    function createMockStorage(initialData: Record<string, string> = {}) {
      const store = new Map<string, string>(Object.entries(initialData));
      return {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, val: string) => {
          store.set(key, val);
        }),
        removeItem: vi.fn((key: string) => {
          store.delete(key);
        }),
        _store: store,
      };
    }

    it('performs one-time import with mocked localStorage and removes keys on success', async () => {
      const storage = createMockStorage({
        setlist_track_title_overrides: JSON.stringify({
          'track-1': 'Imported Title 1',
          'track-2': 'Imported Title 2',
        }),
        setlist_track_artist_overrides: JSON.stringify({
          'track-1': 'Imported Artist 1',
          'track-3': 'Imported Artist 3',
        }),
      });

      const migratedCalls: Array<{ trackId: string; patch: TrackOverridePatch }> = [];
      const fakeClient: OverridesClient = {
        setTrackOverride: vi.fn(async (trackId, patch) => {
          migratedCalls.push({ trackId, patch });
        }),
        clearTrackOverride: vi.fn(),
        getTrackOverride: vi.fn(),
        getTrackOverrideFlags: vi.fn(),
        getTrackWithOverrides: vi.fn(),
      };

      const result = await migrateLocalStorageOverrides(storage, fakeClient);

      expect(result.migratedTitles).toBe(2);
      expect(result.migratedArtists).toBe(2);
      expect(result.failedTitles).toBe(0);
      expect(result.failedArtists).toBe(0);

      expect(fakeClient.setTrackOverride).toHaveBeenCalledTimes(4);
      expect(migratedCalls).toContainEqual({
        trackId: 'track-1',
        patch: { title: 'Imported Title 1' },
      });
      expect(migratedCalls).toContainEqual({
        trackId: 'track-2',
        patch: { title: 'Imported Title 2' },
      });
      expect(migratedCalls).toContainEqual({
        trackId: 'track-1',
        patch: { artist: 'Imported Artist 1' },
      });
      expect(migratedCalls).toContainEqual({
        trackId: 'track-3',
        patch: { artist: 'Imported Artist 3' },
      });

      // Keys must be removed after successful migration
      expect(storage.removeItem).toHaveBeenCalledWith('setlist_track_title_overrides');
      expect(storage.removeItem).toHaveBeenCalledWith('setlist_track_artist_overrides');
      expect(storage.getItem('setlist_track_title_overrides')).toBeNull();
      expect(storage.getItem('setlist_track_artist_overrides')).toBeNull();
    });

    it('is safe to run twice (idempotent)', async () => {
      const storage = createMockStorage({
        setlist_track_title_overrides: JSON.stringify({ 'track-1': 'Title One' }),
        setlist_track_artist_overrides: JSON.stringify({ 'track-1': 'Artist One' }),
      });

      const fakeClient: OverridesClient = {
        setTrackOverride: vi.fn(async () => {}),
        clearTrackOverride: vi.fn(),
        getTrackOverride: vi.fn(),
        getTrackOverrideFlags: vi.fn(),
        getTrackWithOverrides: vi.fn(),
      };

      // First run: migrates
      const res1 = await migrateLocalStorageOverrides(storage, fakeClient);
      expect(res1.migratedTitles).toBe(1);
      expect(res1.migratedArtists).toBe(1);

      // Second run: localStorage keys are gone, does nothing and returns 0 migrated
      const res2 = await migrateLocalStorageOverrides(storage, fakeClient);
      expect(res2.migratedTitles).toBe(0);
      expect(res2.migratedArtists).toBe(0);
      expect(res2.failedTitles).toBe(0);
      expect(res2.failedArtists).toBe(0);
      // No additional backend calls on second run
      expect(fakeClient.setTrackOverride).toHaveBeenCalledTimes(2);
    });

    it('preserves failing entries in localStorage and logs error without losing data', async () => {
      const storage = createMockStorage({
        setlist_track_title_overrides: JSON.stringify({
          'track-ok': 'Good Title',
          'track-fail': 'Failing Title',
        }),
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const fakeClient: OverridesClient = {
        setTrackOverride: vi.fn(async (trackId) => {
          if (trackId === 'track-fail') {
            throw new Error('Database locked or connection lost');
          }
        }),
        clearTrackOverride: vi.fn(),
        getTrackOverride: vi.fn(),
        getTrackOverrideFlags: vi.fn(),
        getTrackWithOverrides: vi.fn(),
      };

      const result = await migrateLocalStorageOverrides(storage, fakeClient);

      expect(result.migratedTitles).toBe(1);
      expect(result.failedTitles).toBe(1);

      // setlist_track_title_overrides must NOT have been removed; it must retain the failing entry
      expect(storage.removeItem).not.toHaveBeenCalledWith('setlist_track_title_overrides');
      const remainingRaw = storage.getItem('setlist_track_title_overrides');
      expect(remainingRaw).not.toBeNull();
      const remaining = JSON.parse(remainingRaw!);
      expect(remaining).toEqual({ 'track-fail': 'Failing Title' });

      // Error must have been logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
