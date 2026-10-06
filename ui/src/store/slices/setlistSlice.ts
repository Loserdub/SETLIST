import type { StateCreator } from 'zustand';
import type { AppState, SetlistSlice } from '../types';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { CostWeights } from '../../bindings/CostWeights';
import type { ExportTarget } from '../../bindings/ExportTarget';
import type { Backend } from '../../api';
import type { Track } from '../../bindings/Track';
import { getBackend, setlistItemToEntry } from '../../api';
import {
  recalculateSetlistTargetEnergy,
  getTargetEnergy,
} from '../../features/setlist/energyCurve';
import {
  reorderSetlistEntries,
  validatePins,
  applyPinsToOrderedIds,
} from '../../features/setlist/reorder';
import type { SetlistPins } from '../../features/setlist/types';
import { scheduleActiveSetlistPersistence } from './setlistPersistence';
import {
  recordHistory,
  applyUndoSetlist,
  applyRedoSetlist,
} from './setlistHistory';
import { resolveMissingTransitions } from './setlistTransitions';

export const createSetlistSlice: StateCreator<AppState, [], [], SetlistSlice> = (set, get) => ({
  activeSetlistId: null,
  hasLoadedActiveSetlist: false,
  setlist: [],
  setlistVersion: 0,
  pins: { lockFirst: false, lockLast: false },
  setPins: (pinsOrUpdater) => {
    set((state) => {
      const historyUpdate = recordHistory(state);
      const nextPins =
        typeof pinsOrUpdater === 'function' ? pinsOrUpdater(state.pins) : pinsOrUpdater;
      return {
        pins: validatePins(state.setlist.length, nextPins),
        ...historyUpdate,
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

  setlistHistory: { past: [], future: [] },
  canUndoSetlist: false,
  canRedoSetlist: false,

  undoSetlist: (customBackend) => {
    applyUndoSetlist(get, set, customBackend);
  },

  redoSetlist: (customBackend) => {
    applyRedoSetlist(get, set, customBackend);
  },

  loadActiveSetlist: async (customBackend) => {
    const backend = customBackend ?? getBackend(get().useMockBackend);
    if (!backend || typeof backend.getActiveSetlist !== 'function') {
      set({ hasLoadedActiveSetlist: true });
      return;
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const active = await backend.getActiveSetlist();
        if (!active) {
          set({ hasLoadedActiveSetlist: true });
          return;
        }

        let tracks = get().tracks;
        if (
          active.items.length > 0 &&
          tracks.length === 0 &&
          !get().hasLoadedTracks &&
          !get().isLoadingTracks &&
          typeof backend.listTracks === 'function'
        ) {
          try {
            await get().loadTracks(backend);
            tracks = get().tracks;
          } catch {
            // Proceed with current state if track loading fails
          }
        }

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
        return;
      } catch (err: unknown) {
        lastError = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        }
      }
    }
    console.error('Failed to load active setlist from database:', lastError);
    set({ hasLoadedActiveSetlist: true });
  },

  persistActiveSetlist: async (customBackend) => {
    scheduleActiveSetlistPersistence(get, customBackend);
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

      const historyUpdate = recordHistory(state);
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
        ...historyUpdate,
      };
    });

    if (capturedVersion === 0) return;
    scheduleActiveSetlistPersistence(get, customBackend);
    if (!prevTrackId) return;

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

      const historyUpdate = recordHistory(state);
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
        ...historyUpdate,
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
      if (reordered === state.setlist) return state;

      const historyUpdate = recordHistory(state);
      profile = state.energyProfile;
      weights = state.costWeights;
      capturedVersion = (state.setlistVersion ?? 0) + 1;

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
        pins: activePins,
        setlistVersion: capturedVersion,
        ...historyUpdate,
      };
    });

    if (capturedVersion === 0) return;
    scheduleActiveSetlistPersistence(get, customBackend);

    void resolveMissingTransitions(
      reorderedList,
      capturedVersion,
      profile,
      weights,
      backend,
      get,
      set,
      customBackend
    );
  },

  clearSetlist: () => {
    set((state) => {
      if (state.setlist.length === 0) return state;
      const historyUpdate = recordHistory(state);
      return {
        setlist: [],
        pins: { lockFirst: false, lockLast: false },
        setlistError: null,
        exportStatus: null,
        setlistVersion: (state.setlistVersion ?? 0) + 1,
        ...historyUpdate,
      };
    });
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
    const firstId = pins.lockFirst && trackIds.length > 0 ? trackIds[0] : undefined;
    const lastId = pins.lockLast && trackIds.length > 1 ? trackIds[trackIds.length - 1] : undefined;
    try {
      const solverResult = await backend.suggestOrder(trackIds, energyProfile, costWeights, firstId, lastId);

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

      const finalVersion = capturedVersion + 1;
      set((state) => ({
        setlist: recalculateSetlistTargetEnergy(updatedEntries, energyProfile),
        setlistVersion: finalVersion,
        isSuggestingOrder: false,
        ...recordHistory(state),
      }));
      scheduleActiveSetlistPersistence(get, customBackend);

      void resolveMissingTransitions(
        updatedEntries,
        finalVersion,
        energyProfile,
        costWeights,
        backend,
        get,
        set,
        customBackend,
        true
      );
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
});
