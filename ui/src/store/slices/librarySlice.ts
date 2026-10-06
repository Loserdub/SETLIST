import type { StateCreator } from 'zustand';
import type { AppState, LibrarySlice } from '../types';
import type { Track } from '../../bindings/Track';
import type { Backend } from '../../api';
import { getBackend } from '../../api';
import { getTargetEnergy } from '../../features/setlist/energyCurve';
import { scheduleActiveSetlistPersistence } from './setlistPersistence';

export const createLibrarySlice: StateCreator<AppState, [], [], LibrarySlice> = (set, get) => ({
  tracks: [],
  selectedTrackId: null,
  selectedTrack: null,
  isLoadingTracks: false,
  hasLoadedTracks: false,
  tracksError: null,
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  loadTracks: async (customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    set({ isLoadingTracks: true, tracksError: null });

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const tracks = await backend.listTracks();
        const currentSelectedId = get().selectedTrackId;
        const updatedSelected = tracks.find((t) => t.id === currentSelectedId) ?? (tracks[0] ?? null);
        const tracksMap = new Map<string, Track>(tracks.map((t) => [t.id, t]));
        set((state) => ({
          tracks,
          isLoadingTracks: false,
          hasLoadedTracks: true,
          selectedTrackId: updatedSelected?.id ?? null,
          selectedTrack: updatedSelected,
          setlist: state.setlist.map((entry) => {
            if (!entry.track && tracksMap.has(entry.track_id)) {
              return { ...entry, track: tracksMap.get(entry.track_id) ?? null };
            }
            return entry;
          }),
        }));
        return;
      } catch (err: unknown) {
        lastError = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        }
      }
    }

    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    set({ tracksError: msg, isLoadingTracks: false, hasLoadedTracks: true });
    get().addToast({
      type: 'error',
      message: 'Failed to load tracks from library',
      details: msg,
    });
  },

  scanFolder: async (path: string, customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    set({ isLoadingTracks: true, tracksError: null });

    const unsubscribe = backend.subscribeProgress((p) => {
      set({ progress: p });
    });

    try {
      const tracks = await backend.scanFolder(path);
      const updatedSelected = tracks.find((t) => t.id === get().selectedTrackId) ?? (tracks[0] ?? null);
      set({
        tracks,
        isLoadingTracks: false,
        hasLoadedTracks: true,
        selectedTrackId: updatedSelected?.id ?? null,
        selectedTrack: updatedSelected,
        progress: null,
      });
      get().addToast({
        type: 'success',
        message: 'Folder scan complete',
        details: `Discovered and analyzed ${tracks.length} track${tracks.length === 1 ? '' : 's'}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ tracksError: msg, isLoadingTracks: false, progress: null });
      get().addToast({
        type: 'error',
        message: 'Folder scan failed',
        details: msg,
      });
    } finally {
      unsubscribe();
    }
  },

  scanPaths: async (paths: string[], customBackend) => {
    if (paths.length === 0) return;
    const backend = customBackend ?? getBackend(get().useMockBackend);
    set({ isLoadingTracks: true, tracksError: null });

    const unsubscribe = backend.subscribeProgress((p) => {
      set({ progress: p });
    });

    try {
      const tracks = backend.scanPaths ? await backend.scanPaths(paths) : await backend.scanFolder(paths[0]);
      const updatedSelected = tracks.find((t) => t.id === get().selectedTrackId) ?? (tracks[0] ?? null);
      set({
        tracks,
        isLoadingTracks: false,
        hasLoadedTracks: true,
        selectedTrackId: updatedSelected?.id ?? null,
        selectedTrack: updatedSelected,
        progress: null,
      });
      get().addToast({
        type: 'success',
        message: 'Ingestion and analysis complete',
        details: `Discovered and cataloged ${tracks.length} track${tracks.length === 1 ? '' : 's'}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ tracksError: msg, isLoadingTracks: false, progress: null });
      get().addToast({
        type: 'error',
        message: 'Audio ingestion failed',
        details: msg,
      });
    } finally {
      unsubscribe();
    }
  },

  selectTrack: (id: string | null) => {
    const track = id ? (get().tracks.find((t) => t.id === id) ?? null) : null;
    set({ selectedTrackId: id, selectedTrack: track });
  },

  refreshTrackInSetlist: async (freshTrack: Track, customBackend?: Backend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    let inSetlist = false;
    const capturedVersion = (get().setlistVersion ?? 0) + 1;
    let profile = get().energyProfile;
    let weights = get().costWeights;

    set((state) => {
      inSetlist = state.setlist.some((e) => e.track_id === freshTrack.id);
      profile = state.energyProfile;
      weights = state.costWeights;
      return {
        tracks: state.tracks.map((t) => (t.id === freshTrack.id ? freshTrack : t)),
        selectedTrack:
          state.selectedTrackId === freshTrack.id ? freshTrack : state.selectedTrack,
        setlist: inSetlist
          ? state.setlist.map((e) =>
              e.track_id === freshTrack.id ? { ...e, track: freshTrack } : e
            )
          : state.setlist,
        setlistVersion: inSetlist ? capturedVersion : state.setlistVersion,
      };
    });

    if (!inSetlist) return;

    scheduleActiveSetlistPersistence(get, customBackend);

    const currentSetlist = get().setlist;
    const targetIndices = currentSetlist
      .map((e, idx) => (e.track_id === freshTrack.id ? idx : -1))
      .filter((idx) => idx !== -1);

    if (targetIndices.length === 0) return;

    try {
      const updatedSetlist = [...get().setlist];
      let hasChanges = false;

      for (const idx of targetIndices) {
        if (get().setlistVersion !== capturedVersion) return;

        if (idx > 0) {
          const prev = updatedSetlist[idx - 1];
          const curr = updatedSetlist[idx];
          if (prev.track && curr.track) {
            try {
              const de =
                getTargetEnergy(profile, idx, updatedSetlist.length) -
                getTargetEnergy(profile, idx - 1, updatedSetlist.length);
              const transition = await backend.getAdvice(
                prev.track_id,
                curr.track_id,
                profile,
                weights,
                de
              );
              if (get().setlistVersion !== capturedVersion) return;
              updatedSetlist[idx] = { ...updatedSetlist[idx], transition };
              hasChanges = true;
            } catch {
              // ignore advice error
            }
          }
        }

        if (idx < updatedSetlist.length - 1) {
          const curr = updatedSetlist[idx];
          const next = updatedSetlist[idx + 1];
          if (curr.track && next.track) {
            try {
              const de =
                getTargetEnergy(profile, idx + 1, updatedSetlist.length) -
                getTargetEnergy(profile, idx, updatedSetlist.length);
              const transition = await backend.getAdvice(
                curr.track_id,
                next.track_id,
                profile,
                weights,
                de
              );
              if (get().setlistVersion !== capturedVersion) return;
              updatedSetlist[idx + 1] = { ...updatedSetlist[idx + 1], transition };
              hasChanges = true;
            } catch {
              // ignore advice error
            }
          }
        }
      }

      if (hasChanges && get().setlistVersion === capturedVersion) {
        set({ setlist: updatedSetlist });
        scheduleActiveSetlistPersistence(get, customBackend);
      }
    } catch {
      // ignore
    }
  },
});
