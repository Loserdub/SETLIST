import type { StateCreator } from 'zustand';
import type { AppState, OverridesSlice } from '../types';

export const createOverridesSlice: StateCreator<
  AppState,
  [],
  [],
  OverridesSlice
> = (set) => ({
  trackTitleOverrides: (() => {
    let initial: Record<string, string> = {};
    try {
      const saved =
        typeof window !== 'undefined'
          ? window.localStorage?.getItem('setlist_track_title_overrides')
          : null;
      if (saved) initial = JSON.parse(saved);
    } catch {}
    void import('../../api/overrides')
      .then(({ migrateLocalStorageOverrides }) => {
        void migrateLocalStorageOverrides(
          typeof window !== 'undefined' ? window.localStorage : null
        );
      })
      .catch(() => {});
    return initial;
  })(),

  trackArtistOverrides: (() => {
    let initial: Record<string, string> = {};
    try {
      const saved =
        typeof window !== 'undefined'
          ? window.localStorage?.getItem('setlist_track_artist_overrides')
          : null;
      if (saved) initial = JSON.parse(saved);
    } catch {}
    return initial;
  })(),

  setTrackTitleOverride: (trackId: string, title?: string | null) => {
    const trimmed = title?.trim() || null;
    void import('../../api/overrides')
      .then(({ setTrackOverride, clearTrackOverride }) => {
        if (trimmed) {
          void setTrackOverride(trackId, { title: trimmed }).catch((err) => {
            console.error('Failed to set track title override in database:', err);
          });
        } else {
          void clearTrackOverride(trackId, ['title']).catch((err) => {
            console.error('Failed to clear track title override in database:', err);
          });
        }
      })
      .catch(console.error);

    set((state) => {
      const updated = { ...state.trackTitleOverrides };
      if (!trimmed) {
        delete updated[trackId];
      } else {
        updated[trackId] = trimmed;
      }
      return { trackTitleOverrides: updated };
    });
  },

  setTrackArtistOverride: (trackId: string, artist?: string | null) => {
    const trimmed = artist?.trim() || null;
    void import('../../api/overrides')
      .then(({ setTrackOverride, clearTrackOverride }) => {
        if (trimmed) {
          void setTrackOverride(trackId, { artist: trimmed }).catch((err) => {
            console.error('Failed to set track artist override in database:', err);
          });
        } else {
          void clearTrackOverride(trackId, ['artist']).catch((err) => {
            console.error('Failed to clear track artist override in database:', err);
          });
        }
      })
      .catch(console.error);

    set((state) => {
      const updated = { ...state.trackArtistOverrides };
      if (!trimmed) {
        delete updated[trackId];
      } else {
        updated[trackId] = trimmed;
      }
      return { trackArtistOverrides: updated };
    });
  },
});
