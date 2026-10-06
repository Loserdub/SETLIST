import type { AppState, SetlistSnapshot, SetlistHistory } from '../types';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { SetlistPins } from '../../features/setlist/types';
import type { Backend } from '../../api';
import { scheduleActiveSetlistPersistence } from './setlistPersistence';

export const MAX_SETLIST_HISTORY = 30;

export function createSnapshot(state: {
  setlist: SetlistEntry[];
  pins: SetlistPins;
  energyProfile: EnergyProfile;
  setlistName: string;
}): SetlistSnapshot {
  return {
    setlist: state.setlist,
    pins: { ...state.pins },
    energyProfile: state.energyProfile,
    setlistName: state.setlistName,
  };
}

export function recordHistory(state: AppState): {
  setlistHistory: SetlistHistory;
  canUndoSetlist: boolean;
  canRedoSetlist: boolean;
} {
  const currentSnapshot = createSnapshot(state);
  const nextPast = [...state.setlistHistory.past, currentSnapshot].slice(-MAX_SETLIST_HISTORY);
  return {
    setlistHistory: {
      past: nextPast,
      future: [],
    },
    canUndoSetlist: true,
    canRedoSetlist: false,
  };
}

export function applyUndoSetlist(
  get: () => AppState,
  set: (updater: (state: AppState) => Partial<AppState>) => void,
  customBackend?: Backend
): void {
  const { setlistHistory, setlist, pins, energyProfile, setlistName } = get();
  if (setlistHistory.past.length === 0) return;

  const previousSnapshot = setlistHistory.past[setlistHistory.past.length - 1];
  const newPast = setlistHistory.past.slice(0, -1);
  const currentSnapshot = createSnapshot({ setlist, pins, energyProfile, setlistName });
  const newFuture = [currentSnapshot, ...setlistHistory.future].slice(0, MAX_SETLIST_HISTORY);

  set((state) => ({
    setlist: previousSnapshot.setlist,
    pins: previousSnapshot.pins,
    energyProfile: previousSnapshot.energyProfile,
    setlistName: previousSnapshot.setlistName,
    setlistVersion: (state.setlistVersion ?? 0) + 1,
    setlistHistory: {
      past: newPast,
      future: newFuture,
    },
    canUndoSetlist: newPast.length > 0,
    canRedoSetlist: true,
  }));

  scheduleActiveSetlistPersistence(get, customBackend);
  get().addToast({
    type: 'info',
    message: 'Setlist action undone',
  });
}

export function applyRedoSetlist(
  get: () => AppState,
  set: (updater: (state: AppState) => Partial<AppState>) => void,
  customBackend?: Backend
): void {
  const { setlistHistory, setlist, pins, energyProfile, setlistName } = get();
  if (setlistHistory.future.length === 0) return;

  const nextSnapshot = setlistHistory.future[0];
  const newFuture = setlistHistory.future.slice(1);
  const currentSnapshot = createSnapshot({ setlist, pins, energyProfile, setlistName });
  const newPast = [...setlistHistory.past, currentSnapshot].slice(-MAX_SETLIST_HISTORY);

  set((state) => ({
    setlist: nextSnapshot.setlist,
    pins: nextSnapshot.pins,
    energyProfile: nextSnapshot.energyProfile,
    setlistName: nextSnapshot.setlistName,
    setlistVersion: (state.setlistVersion ?? 0) + 1,
    setlistHistory: {
      past: newPast,
      future: newFuture,
    },
    canUndoSetlist: true,
    canRedoSetlist: newFuture.length > 0,
  }));

  scheduleActiveSetlistPersistence(get, customBackend);
  get().addToast({
    type: 'info',
    message: 'Setlist action redone',
  });
}
