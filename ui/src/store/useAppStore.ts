import { create } from 'zustand';
import { getBackend, type Backend, type ProgressEvent } from '../api';
import type { Track } from '../bindings/Track';
import type { SetlistEntry } from '../bindings/SetlistEntry';
import type { EnergyProfile } from '../bindings/EnergyProfile';
import type { CostWeights } from '../bindings/CostWeights';
import type { ExportTarget } from '../bindings/ExportTarget';

export type Route = 'library' | 'track' | 'setlist' | 'settings';

export interface AppState {
  // Navigation
  currentRoute: Route;
  setRoute: (route: Route) => void;

  // Backend selection
  useMockBackend: boolean;
  setUseMockBackend: (useMock: boolean) => void;

  // Tracks State
  tracks: Track[];
  selectedTrackId: string | null;
  selectedTrack: Track | null;
  isLoadingTracks: boolean;
  tracksError: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  loadTracks: (backend?: Backend) => Promise<void>;
  scanFolder: (path: string, backend?: Backend) => Promise<void>;
  selectTrack: (id: string | null) => void;

  // Active Setlist State
  setlist: SetlistEntry[];
  setlistName: string;
  energyProfile: EnergyProfile;
  costWeights: CostWeights;
  isSuggestingOrder: boolean;
  setlistError: string | null;
  exportStatus: string | null;
  addToSetlist: (trackId: string) => Promise<void>;
  removeFromSetlist: (position: number) => Promise<void>;
  clearSetlist: () => void;
  suggestOrder: (backend?: Backend) => Promise<void>;
  setEnergyProfile: (profile: EnergyProfile) => void;
  setCostWeights: (weights: Partial<CostWeights>) => void;
  setSetlistName: (name: string) => void;
  exportSetlist: (target: ExportTarget, backend?: Backend) => Promise<string>;

  // Background Progress
  progress: ProgressEvent | null;
  setProgress: (progress: ProgressEvent | null) => void;

  // Legacy Ping Support
  pingResult: string | null;
  isLoading: boolean;
  error: string | null;
  fetchPing: (backend?: Backend) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  currentRoute: 'library',
  setRoute: (currentRoute) => set({ currentRoute }),

  // Backend selection
  useMockBackend: true,
  setUseMockBackend: (useMockBackend) => set({ useMockBackend }),

  // Tracks State
  tracks: [],
  selectedTrackId: null,
  selectedTrack: null,
  isLoadingTracks: false,
  tracksError: null,
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  loadTracks: async (customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    set({ isLoadingTracks: true, tracksError: null });
    try {
      const tracks = await backend.listTracks();
      const currentSelectedId = get().selectedTrackId;
      const updatedSelected = tracks.find((t) => t.id === currentSelectedId) ?? (tracks[0] ?? null);
      set({
        tracks,
        isLoadingTracks: false,
        selectedTrackId: updatedSelected?.id ?? null,
        selectedTrack: updatedSelected,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ tracksError: msg, isLoadingTracks: false });
    }
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
        selectedTrackId: updatedSelected?.id ?? null,
        selectedTrack: updatedSelected,
        progress: null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ tracksError: msg, isLoadingTracks: false, progress: null });
    } finally {
      unsubscribe();
    }
  },

  selectTrack: (id: string | null) => {
    const track = id ? (get().tracks.find((t) => t.id === id) ?? null) : null;
    set({ selectedTrackId: id, selectedTrack: track });
  },

  // Active Setlist State
  setlist: [],
  setlistName: 'Main Room Set',
  energyProfile: 'PeakPlateau',
  costWeights: {
    tempo: 0.3,
    key: 0.35,
    energy: 0.35,
    timbre: 0.0,
  },
  isSuggestingOrder: false,
  setlistError: null,
  exportStatus: null,

  addToSetlist: async (trackId: string) => {
    const { tracks, setlist, useMockBackend } = get();
    const trackToAdd = tracks.find((t) => t.id === trackId);
    if (!trackToAdd) return;

    // If already in setlist, ignore duplicate
    if (setlist.some((e) => e.track_id === trackId)) return;

    const newPosition = setlist.length + 1;
    const prevEntry = setlist.length > 0 ? setlist[setlist.length - 1] : null;

    let transition = null;
    if (prevEntry && prevEntry.track) {
      try {
        const backend = getBackend(useMockBackend);
        transition = await backend.getAdvice(prevEntry.track_id, trackId);
      } catch {
        // fallback if transition advice fails
      }
    }

    const newEntry: SetlistEntry = {
      position: newPosition,
      track_id: trackId,
      track: trackToAdd,
      transition,
      target_energy: trackToAdd.analysis?.energy_score ?? 5,
    };

    set({ setlist: [...setlist, newEntry] });
  },

  removeFromSetlist: async (position: number) => {
    const { setlist, useMockBackend } = get();
    const filtered = setlist.filter((e) => e.position !== position);
    const backend = getBackend(useMockBackend);

    // Re-index and recalculate transitions
    const updated: SetlistEntry[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      let transition = null;
      if (i > 0 && updated[i - 1].track) {
        try {
          transition = await backend.getAdvice(updated[i - 1].track_id, entry.track_id);
        } catch {
          // fallback
        }
      }
      updated.push({
        ...entry,
        position: i + 1,
        transition,
      });
    }

    set({ setlist: updated });
  },

  clearSetlist: () => set({ setlist: [], setlistError: null, exportStatus: null }),

  suggestOrder: async (customBackend) => {
    const { setlist, energyProfile, costWeights, useMockBackend } = get();
    if (setlist.length < 2) return;

    const backend = customBackend ?? getBackend(useMockBackend);
    set({ isSuggestingOrder: true, setlistError: null });

    const trackIds = setlist.map((e) => e.track_id);
    try {
      const orderedEntries = await backend.suggestOrder(trackIds, energyProfile, costWeights);
      set({ setlist: orderedEntries, isSuggestingOrder: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ setlistError: msg, isSuggestingOrder: false });
    }
  },

  setEnergyProfile: (energyProfile) => set({ energyProfile }),

  setCostWeights: (weights) => {
    set((state) => ({
      costWeights: { ...state.costWeights, ...weights },
    }));
  },

  setSetlistName: (setlistName) => set({ setlistName }),

  exportSetlist: async (target: ExportTarget, customBackend) => {
    const { setlist, useMockBackend } = get();
    const backend = customBackend ?? getBackend(useMockBackend);
    set({ exportStatus: 'Exporting...' });
    try {
      const result = await backend.exportSet(setlist, target);
      set({ exportStatus: result });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ exportStatus: `Export failed: ${msg}` });
      throw err;
    }
  },

  // Progress
  progress: null,
  setProgress: (progress) => set({ progress }),

  // Legacy Ping
  pingResult: null,
  isLoading: false,
  error: null,
  fetchPing: async (customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    set({ isLoading: true, error: null });
    try {
      const result = await backend.ping();
      set({ pingResult: result, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isLoading: false });
    }
  },
}));
