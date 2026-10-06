import { create } from 'zustand';
import { isTauriEnvironment } from '../api';
import { mockPlaybackClient, tauriPlaybackClient } from '../api/playback';
import type { AppState } from './types';
import { createUiSlice } from './slices/uiSlice';
import { createLibrarySlice } from './slices/librarySlice';
import { createSetlistSlice } from './slices/setlistSlice';
import { createPlaybackSlice } from './slices/playbackSlice';
import { createOverridesSlice } from './slices/overridesSlice';

export * from './types';
export { scheduleActiveSetlistPersistence } from './slices/setlistPersistence';

export const useAppStore = create<AppState>()((...a) => ({
  ...createUiSlice(...a),
  ...createLibrarySlice(...a),
  ...createSetlistSlice(...a),
  ...createPlaybackSlice(...a),
  ...createOverridesSlice(...a),
}));

// Wire playback client position broadcasts into store for global transport continuity
if (typeof window !== 'undefined') {
  try {
    mockPlaybackClient.onPosition((payload) => {
      useAppStore.getState().syncAuditionPosition(payload);
    });
    if (isTauriEnvironment()) {
      tauriPlaybackClient.onPosition((payload) => {
        useAppStore.getState().syncAuditionPosition(payload);
      });
    }
  } catch {
    // Ignore in non-browser or early-load test runs
  }
}
