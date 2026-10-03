import { create } from 'zustand';
import {
  getBackend,
  type Backend,
  type ProgressEvent,
  entryToSetlistItem,
  setlistItemToEntry,
} from '../api';
import type { Track } from '../bindings/Track';
import type { SetlistEntry } from '../bindings/SetlistEntry';
import type { Setlist } from '../bindings/Setlist';
import type { EnergyProfile } from '../bindings/EnergyProfile';
import type { CostWeights } from '../bindings/CostWeights';
import type { ExportTarget } from '../bindings/ExportTarget';
import type { ExportResult } from '../bindings/ExportResult';
import type { AppSettings } from '../bindings/AppSettings';
import {
  recalculateSetlistTargetEnergy,
  getTargetEnergy,
} from '../features/setlist/energyCurve';
import {
  reorderSetlistEntries,
  validatePins,
  applyPinsToOrderedIds,
} from '../features/setlist/reorder';
import type { SetlistPins } from '../features/setlist/types';

export type Route = 'library' | 'discovery' | 'track' | 'setlist' | 'settings' | 'stage';

export const DEFAULT_APP_SETTINGS: AppSettings = {
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

export interface Toast {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
  details?: string;
}

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
  hasLoadedTracks: boolean;
  tracksError: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  loadTracks: (backend?: Backend) => Promise<void>;
  scanFolder: (path: string, backend?: Backend) => Promise<void>;
  selectTrack: (id: string | null) => void;

  // Active Setlist State
  activeSetlistId: string | null;
  hasLoadedActiveSetlist: boolean;
  setlist: SetlistEntry[];
  setlistVersion: number;
  pins: SetlistPins;
  setPins: (pins: SetlistPins | ((prev: SetlistPins) => SetlistPins)) => void;
  setlistName: string;
  energyProfile: EnergyProfile;
  costWeights: CostWeights;
  isSuggestingOrder: boolean;
  setlistError: string | null;
  exportStatus: string | null;
  loadActiveSetlist: (backend?: Backend) => Promise<void>;
  persistActiveSetlist: (backend?: Backend) => Promise<void>;
  addToSetlist: (trackId: string, backend?: Backend) => Promise<void>;
  removeFromSetlist: (position: number, backend?: Backend) => Promise<void>;
  reorderSetlist: (
    fromIndex: number,
    toIndex: number,
    pins?: SetlistPins,
    backend?: Backend
  ) => Promise<void>;
  clearSetlist: () => void;
  loadSetlist: (entries: SetlistEntry[], profile?: EnergyProfile) => void;
  suggestOrder: (backend?: Backend) => Promise<void>;
  setEnergyProfile: (profile: EnergyProfile) => void;
  setCostWeights: (weights: Partial<CostWeights>) => void;
  setSetlistName: (name: string) => void;
  exportSetlist: (
    target: ExportTarget,
    outputPath?: string,
    overwrite?: boolean,
    backend?: Backend
  ) => Promise<ExportResult>;

  // Background Progress
  progress: ProgressEvent | null;
  setProgress: (progress: ProgressEvent | null) => void;

  // Toast Notifications
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;

  // Settings State & Persistence
  appSettings: AppSettings;
  isLoadingSettings: boolean;
  settingsError: string | null;
  loadSettings: (backend?: Backend) => Promise<void>;
  saveSettings: (settings: AppSettings, backend?: Backend) => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => void;

  // Stage Mode
  isStageMode: boolean;
  stageCurrentIndex: number;
  stageStartTime: number | null;
  enterStageMode: () => void;
  exitStageMode: () => void;
  stageNext: () => void;
  stagePrev: () => void;
  stageGoTo: (index: number) => void;
  stageRestart: () => void;

  // Legacy Ping Support
  pingResult: string | null;
  isLoading: boolean;
  error: string | null;
  fetchPing: (backend?: Backend) => Promise<void>;
}

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleActiveSetlistPersistence(get: () => AppState, backendArg?: Backend): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  saveDebounceTimer = setTimeout(async () => {
    const state = get();
    const backend = backendArg ?? getBackend(state.useMockBackend);
    if (!backend || typeof backend.saveActiveSetlist !== 'function') return;

    const items = state.setlist.map(entryToSetlistItem);
    const activeDoc: Setlist = {
      id: state.activeSetlistId ?? 'default-active-setlist',
      name: state.setlistName,
      energy_profile: state.energyProfile,
      items,
      created_at: null,
      updated_at: new Date().toISOString(),
    };

    try {
      await backend.saveActiveSetlist(activeDoc);
    } catch {
      // In tests or non-Tauri environments where invoke is unmocked, fail silently
    }
  }, 300);
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  currentRoute: 'library',
  setRoute: (currentRoute) => set({ currentRoute }),

  // Backend selection (default: native Tauri backend)
  useMockBackend: false,
  setUseMockBackend: (useMockBackend) => {
    set({ useMockBackend, hasLoadedTracks: false });
    get().addToast({
      type: 'info',
      message: useMockBackend ? 'Switched to Mock Backend' : 'Switched to Tauri Native Backend',
    });
  },

  // Tracks State
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
    try {
      const tracks = await backend.listTracks();
      const currentSelectedId = get().selectedTrackId;
      const updatedSelected = tracks.find((t) => t.id === currentSelectedId) ?? (tracks[0] ?? null);
      set({
        tracks,
        isLoadingTracks: false,
        hasLoadedTracks: true,
        selectedTrackId: updatedSelected?.id ?? null,
        selectedTrack: updatedSelected,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ tracksError: msg, isLoadingTracks: false, hasLoadedTracks: true });
      get().addToast({
        type: 'error',
        message: 'Failed to load tracks from library',
        details: msg,
      });
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

  selectTrack: (id: string | null) => {
    const track = id ? (get().tracks.find((t) => t.id === id) ?? null) : null;
    set({ selectedTrackId: id, selectedTrack: track });
  },

  // Active Setlist State
  activeSetlistId: null,
  hasLoadedActiveSetlist: false,
  setlist: [],
  setlistVersion: 0,
  pins: { lockFirst: false, lockLast: false },
  setPins: (pinsOrUpdater) => {
    set((state) => {
      const nextPins =
        typeof pinsOrUpdater === 'function' ? pinsOrUpdater(state.pins) : pinsOrUpdater;
      return {
        pins: validatePins(state.setlist.length, nextPins),
      };
    });
  },
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

  loadActiveSetlist: async (customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    if (!backend || typeof backend.getActiveSetlist !== 'function') {
      set({ hasLoadedActiveSetlist: true });
      return;
    }

    try {
      const active = await backend.getActiveSetlist();
      if (!active) {
        set({ hasLoadedActiveSetlist: true });
        return;
      }

      const tracks = get().tracks;
      const tracksMap = new Map<string, Track>(tracks.map((t) => [t.id, t]));
      const entries = active.items.map((item) => setlistItemToEntry(item, tracksMap));

      set((state) => ({
        activeSetlistId: active.id,
        setlistName: active.name,
        energyProfile: active.energy_profile,
        setlist: recalculateSetlistTargetEnergy(entries, active.energy_profile),
        pins: validatePins(entries.length, state.pins),
        hasLoadedActiveSetlist: true,
        setlistVersion: (state.setlistVersion ?? 0) + 1,
      }));
    } catch (err: unknown) {
      console.error('Failed to load active setlist from database:', err);
      set({ hasLoadedActiveSetlist: true });
    }
  },

  persistActiveSetlist: async (customBackend) => {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    const state = get();
    const backend = customBackend ?? getBackend(state.useMockBackend);
    if (!backend || typeof backend.saveActiveSetlist !== 'function') return;

    const items = state.setlist.map(entryToSetlistItem);
    const activeDoc: Setlist = {
      id: state.activeSetlistId ?? 'default-active-setlist',
      name: state.setlistName,
      energy_profile: state.energyProfile,
      items,
      created_at: null,
      updated_at: new Date().toISOString(),
    };

    try {
      await backend.saveActiveSetlist(activeDoc);
    } catch (err: unknown) {
      console.error('Failed to persist active setlist:', err);
    }
  },

  addToSetlist: async (trackId: string, customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    let capturedVersion = 0;
    let prevTrackId: string | null = null;
    let profile: EnergyProfile = get().energyProfile;
    let weights: CostWeights = get().costWeights;
    let currentLen = 0;

    set((state) => {
      if (state.setlist.some((e) => e.track_id === trackId)) return state;
      const trackToAdd = state.tracks.find((t) => t.id === trackId);
      if (!trackToAdd) return state;

      const prev = state.setlist.length > 0 ? state.setlist[state.setlist.length - 1] : null;
      prevTrackId = prev?.track_id ?? null;
      profile = state.energyProfile;
      weights = state.costWeights;
      capturedVersion = (state.setlistVersion ?? 0) + 1;

      const newEntry: SetlistEntry = {
        position: state.setlist.length + 1,
        track_id: trackId,
        track: trackToAdd,
        transition: null,
        target_energy: null,
      };

      const nextList = recalculateSetlistTargetEnergy([...state.setlist, newEntry], profile);
      currentLen = nextList.length;
      return {
        setlist: nextList,
        setlistVersion: capturedVersion,
      };
    });

    if (capturedVersion === 0) return;
    scheduleActiveSetlistPersistence(get, customBackend);
    if (!prevTrackId) return;

    // Asynchronously fetch transition advice in background
    try {
      const de =
        getTargetEnergy(profile, currentLen - 1, currentLen) -
        getTargetEnergy(profile, currentLen - 2, currentLen);
      const transition = await backend.getAdvice(
        prevTrackId,
        trackId,
        profile,
        weights,
        de
      );

      // Only apply if these two tracks are still adjacent in the current setlist
      set((state) => {
        const currList = state.setlist;
        const targetIdx = currList.findIndex((e) => e.track_id === trackId);
        if (targetIdx > 0 && currList[targetIdx - 1].track_id === prevTrackId) {
          const updated = [...currList];
          updated[targetIdx] = { ...updated[targetIdx], transition };
          return { setlist: updated };
        }
        return state;
      });
    } catch {
      // ignore
    }
  },

  removeFromSetlist: async (position: number, customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    let affectedPair: { prevId: string; nextId: string; index: number } | null = null;
    let profile: EnergyProfile = get().energyProfile;
    let weights: CostWeights = get().costWeights;
    let remainingLen = 0;

    set((state) => {
      const idx = state.setlist.findIndex((e) => e.position === position);
      if (idx === -1) return state;

      const filtered = state.setlist.filter((_, i) => i !== idx);
      if (idx > 0 && idx < state.setlist.length - 1) {
        affectedPair = {
          prevId: state.setlist[idx - 1].track_id,
          nextId: state.setlist[idx + 1].track_id,
          index: idx,
        };
      }

      profile = state.energyProfile;
      weights = state.costWeights;
      const nextVersion = (state.setlistVersion ?? 0) + 1;

      const reindexed = filtered.map((e, i) => ({
        ...e,
        position: i + 1,
        transition: i === idx ? null : e.transition,
      }));

      const nextList = recalculateSetlistTargetEnergy(reindexed, profile);
      remainingLen = nextList.length;

      // Correct Pin Lifecycle:
      let nextPins = { ...state.pins };
      if (position === 1 && nextPins.lockFirst) {
        nextPins.lockFirst = false;
      }
      if (position === state.setlist.length && nextPins.lockLast) {
        nextPins.lockLast = false;
      }
      nextPins = validatePins(remainingLen, nextPins);

      return {
        setlist: nextList,
        pins: nextPins,
        setlistVersion: nextVersion,
      };
    });

    scheduleActiveSetlistPersistence(get, customBackend);

    if (!affectedPair) return;

    const { prevId, nextId, index } = affectedPair;
    try {
      const de =
        getTargetEnergy(profile, index, remainingLen) -
        getTargetEnergy(profile, index - 1, remainingLen);
      const transition = await backend.getAdvice(prevId, nextId, profile, weights, de);

      // Only apply if prevId and nextId are still adjacent
      set((state) => {
        const currList = state.setlist;
        const targetIdx = currList.findIndex((e) => e.track_id === nextId);
        if (targetIdx > 0 && currList[targetIdx - 1].track_id === prevId) {
          const updated = [...currList];
          updated[targetIdx] = { ...updated[targetIdx], transition };
          return { setlist: updated };
        }
        return state;
      });
    } catch {
      // ignore
    }
  },

  reorderSetlist: async (
    fromIndex: number,
    toIndex: number,
    pinsOverride?: SetlistPins,
    customBackend?: Backend
  ) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    let capturedVersion = 0;
    let reorderedList: SetlistEntry[] = [];
    let profile: EnergyProfile = get().energyProfile;
    let weights: CostWeights = get().costWeights;

    set((state) => {
      const activePins = validatePins(state.setlist.length, pinsOverride ?? state.pins);
      const reordered = reorderSetlistEntries(state.setlist, fromIndex, toIndex, activePins);
      if (reordered === state.setlist) return state; // Move prohibited

      profile = state.energyProfile;
      weights = state.costWeights;
      capturedVersion = (state.setlistVersion ?? 0) + 1;

      // Keep transition if pair is unchanged, null if adjacent pair is new
      const updated = reordered.map((entry, i) => {
        if (i === 0) return { ...entry, position: 1, transition: null };
        const prev = reordered[i - 1];
        const oldEntry = state.setlist.find((e) => e.track_id === entry.track_id);
        const oldPrevIndex = state.setlist.findIndex((e) => e.track_id === prev.track_id);
        const oldEntryIndex = state.setlist.findIndex((e) => e.track_id === entry.track_id);
        const isSamePair = oldEntryIndex === oldPrevIndex + 1;

        return {
          ...entry,
          position: i + 1,
          transition: isSamePair ? oldEntry?.transition ?? null : null,
        };
      });

      const nextList = recalculateSetlistTargetEnergy(updated, profile);
      reorderedList = nextList;
      return {
        setlist: nextList,
        setlistVersion: capturedVersion,
      };
    });

    if (capturedVersion === 0) return;
    scheduleActiveSetlistPersistence(get, customBackend);

    // Asynchronously compute missing transitions for newly adjacent pairs
    try {
      const withTransitions = [...reorderedList];
      let hasNewTransitions = false;

      for (let i = 1; i < withTransitions.length; i++) {
        // If setlist changed since drag was committed, abort immediately
        if (get().setlistVersion !== capturedVersion) return;

        const prev = withTransitions[i - 1];
        const curr = withTransitions[i];
        if (!curr.transition && prev.track && curr.track) {
          try {
            const de =
              getTargetEnergy(profile, i, withTransitions.length) -
              getTargetEnergy(profile, i - 1, withTransitions.length);
            const transition = await backend.getAdvice(
              prev.track_id,
              curr.track_id,
              profile,
              weights,
              de
            );

            if (get().setlistVersion !== capturedVersion) return;

            withTransitions[i] = { ...curr, transition };
            hasNewTransitions = true;
          } catch {
            // ignore
          }
        }
      }

      if (hasNewTransitions && get().setlistVersion === capturedVersion) {
        set({ setlist: withTransitions });
      }
    } catch {
      // ignore
    }
  },

  clearSetlist: () => {
    set((state) => ({
      setlist: [],
      pins: { lockFirst: false, lockLast: false },
      setlistError: null,
      exportStatus: null,
      setlistVersion: (state.setlistVersion ?? 0) + 1,
    }));
    scheduleActiveSetlistPersistence(get);
  },

  loadSetlist: (entries: SetlistEntry[], profile?: EnergyProfile) => {
    const activeProfile = profile ?? get().energyProfile;
    set((state) => ({
      setlist: recalculateSetlistTargetEnergy(entries, activeProfile),
      pins: { lockFirst: false, lockLast: false },
      setlistError: null,
      exportStatus: null,
      setlistVersion: (state.setlistVersion ?? 0) + 1,
    }));
    scheduleActiveSetlistPersistence(get);
  },

  suggestOrder: async (customBackend) => {
    const { setlist, energyProfile, costWeights, useMockBackend, setlistVersion, pins } = get();
    if (setlist.length < 2) return;

    const capturedVersion = setlistVersion ?? 0;
    const backend = customBackend ?? getBackend(useMockBackend);
    set({ isSuggestingOrder: true, setlistError: null });

    const trackIds = setlist.map((e) => e.track_id);
    try {
      const solverResult = await backend.suggestOrder(trackIds, energyProfile, costWeights);

      // Discard stale result if setlist mutated during solver execution
      if (get().setlistVersion !== capturedVersion) {
        set({ isSuggestingOrder: false });
        return;
      }

      const suggestedIds = solverResult.map((e) => e.track_id);
      const suggestedIdSet = new Set(suggestedIds);
      const missingIds = trackIds.filter((id) => !suggestedIdSet.has(id));
      const fullSuggestedIds = missingIds.length > 0 ? [...suggestedIds, ...missingIds] : suggestedIds;

      const validPins = validatePins(trackIds.length, pins);
      const constrainedIds = applyPinsToOrderedIds(trackIds, fullSuggestedIds, validPins);

      const updatedEntries: SetlistEntry[] = [];
      for (let i = 0; i < constrainedIds.length; i++) {
        const id = constrainedIds[i];
        const existingEntry = setlist.find((e) => e.track_id === id);
        const solverEntry = solverResult.find((e) => e.track_id === id);
        const track = existingEntry?.track ?? solverEntry?.track ?? (await backend.getTrack(id));

        let transition = null;
        if (i > 0) {
          const prevEntry = updatedEntries[i - 1];
          const solverPairIdx = solverResult.findIndex((e) => e.track_id === id);
          if (
            solverPairIdx > 0 &&
            solverResult[solverPairIdx - 1]?.track_id === prevEntry.track_id &&
            solverResult[solverPairIdx]?.transition
          ) {
            transition = solverResult[solverPairIdx].transition;
          }
        }

        updatedEntries.push({
          position: i + 1,
          track_id: id,
          track: track ?? null,
          transition,
          target_energy: getTargetEnergy(energyProfile, i, constrainedIds.length),
        });
      }

      if (get().setlistVersion !== capturedVersion) {
        set({ isSuggestingOrder: false });
        return;
      }

      set({
        setlist: recalculateSetlistTargetEnergy(updatedEntries, energyProfile),
        setlistVersion: capturedVersion + 1,
        isSuggestingOrder: false,
      });
      scheduleActiveSetlistPersistence(get, customBackend);
      get().addToast({
        type: 'success',
        message: 'Sequence optimized',
        details: `Harmonic transition order computed for ${updatedEntries.length} tracks.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (get().setlistVersion === capturedVersion) {
        set({ setlistError: msg, isSuggestingOrder: false });
        get().addToast({
          type: 'error',
          message: 'Order suggestion failed',
          details: msg,
        });
      } else {
        set({ isSuggestingOrder: false });
      }
    }
  },

  setEnergyProfile: (energyProfile) => {
    set((state) => ({
      energyProfile,
      setlist: recalculateSetlistTargetEnergy(state.setlist, energyProfile),
      setlistVersion: (state.setlistVersion ?? 0) + 1,
    }));
    scheduleActiveSetlistPersistence(get);
  },

  setCostWeights: (weights) => {
    set((state) => ({
      costWeights: { ...state.costWeights, ...weights },
    }));
  },

  setSetlistName: (setlistName) => {
    set({ setlistName });
    scheduleActiveSetlistPersistence(get);
  },

  exportSetlist: async (
    target: ExportTarget,
    outputPath?: string,
    overwrite?: boolean,
    customBackend?: Backend
  ) => {
    const { setlist, useMockBackend } = get();
    const backend = customBackend ?? getBackend(useMockBackend);
    set({ exportStatus: 'Exporting...' });
    try {
      const result = await backend.exportSet(setlist, target, outputPath, overwrite);
      set({ exportStatus: `Exported ${result.track_count} tracks to ${result.format}` });
      get().addToast({
        type: 'success',
        message: 'Export successful',
        details: `${result.format} saved to ${result.path}`,
      });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ exportStatus: `Export failed: ${msg}` });
      get().addToast({
        type: 'error',
        message: 'Setlist export failed',
        details: msg,
      });
      throw err;
    }
  },

  // Progress
  progress: null,
  setProgress: (progress) => set({ progress }),

  // Toast Notifications
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: Toast = { id, ...toast };
    set((state) => ({ toasts: [...state.toasts, newToast] }));

    // Auto-remove after 5 seconds
    setTimeout(() => {
      get().removeToast(id);
    }, 5000);

    return id;
  },
  removeToast: (id: string) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  // Settings State & Persistence
  appSettings: DEFAULT_APP_SETTINGS,
  isLoadingSettings: false,
  settingsError: null,

  loadSettings: async (customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    set({ isLoadingSettings: true, settingsError: null });
    try {
      const settings = await backend.getSettings();
      set({
        appSettings: settings,
        costWeights: settings.cost_weights,
        isLoadingSettings: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ settingsError: msg, isLoadingSettings: false });
    }
  },

  saveSettings: async (settings, customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    set({ isLoadingSettings: true, settingsError: null });
    try {
      await backend.saveSettings(settings);
      set({
        appSettings: settings,
        costWeights: settings.cost_weights,
        isLoadingSettings: false,
      });
      get().addToast({
        type: 'success',
        message: 'Settings saved to database',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ settingsError: msg, isLoadingSettings: false });
      get().addToast({
        type: 'error',
        message: 'Failed to save settings',
        details: msg,
      });
      throw err;
    }
  },

  updateSettings: (partial) => {
    set((state) => {
      const updated = { ...state.appSettings, ...partial };
      return {
        appSettings: updated,
        costWeights: updated.cost_weights ?? state.costWeights,
      };
    });
  },

  // Stage Mode
  isStageMode: false,
  stageCurrentIndex: 0,
  stageStartTime: null,

  enterStageMode: () => {
    const { setlist } = get();
    if (setlist.length === 0) return;
    set({
      isStageMode: true,
      stageCurrentIndex: 0,
      stageStartTime: Date.now(),
      currentRoute: 'stage',
    });
  },

  exitStageMode: () => {
    set({
      isStageMode: false,
      stageStartTime: null,
      currentRoute: 'setlist',
    });
  },

  stageNext: () => {
    set((state) => {
      if (!state.isStageMode) return state;
      const next = state.stageCurrentIndex + 1;
      if (next >= state.setlist.length) return state;
      return { stageCurrentIndex: next };
    });
  },

  stagePrev: () => {
    set((state) => {
      if (!state.isStageMode) return state;
      const prev = state.stageCurrentIndex - 1;
      if (prev < 0) return state;
      return { stageCurrentIndex: prev };
    });
  },

  stageGoTo: (index: number) => {
    set((state) => {
      if (!state.isStageMode) return state;
      if (index < 0 || index >= state.setlist.length) return state;
      return { stageCurrentIndex: index };
    });
  },

  stageRestart: () => {
    set((state) => {
      if (!state.isStageMode) return state;
      return { stageCurrentIndex: 0, stageStartTime: Date.now() };
    });
  },

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
