import type { AppState } from '../types';
import type { Backend } from '../../api';
import type { Setlist } from '../../bindings/Setlist';
import { getBackend, entryToSetlistItem } from '../../api';

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
