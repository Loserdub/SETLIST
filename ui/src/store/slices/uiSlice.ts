import type { StateCreator } from 'zustand';
import type { AppState, UiSlice, Toast } from '../types';
import { DEFAULT_APP_SETTINGS } from '../types';
import { getBackend, isTauriEnvironment } from '../../api';

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  currentRoute: 'library',
  setRoute: (currentRoute) => {
    if (currentRoute === 'track' && !get().selectedTrackId && !get().selectedTrack) {
      return;
    }
    set({ currentRoute });
  },

  useMockBackend: false,
  setUseMockBackend: (useMockBackend) => {
    const showDevTools =
      typeof import.meta !== 'undefined' &&
      Boolean(
        import.meta.env?.VITE_SHOW_DEV_TOOLS &&
          import.meta.env.VITE_SHOW_DEV_TOOLS !== 'false' &&
          import.meta.env.VITE_SHOW_DEV_TOOLS !== '0'
      );
    if (isTauriEnvironment() && !showDevTools && useMockBackend) {
      return;
    }
    set({ useMockBackend, hasLoadedTracks: false });
    get().addToast({
      type: 'info',
      message: useMockBackend ? 'Switched to Mock Backend' : 'Switched to Tauri Native Backend',
    });
  },

  progress: null,
  setProgress: (progress) => set({ progress }),

  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: Toast = { id, ...toast };
    set((state) => ({ toasts: [...state.toasts, newToast] }));

    setTimeout(() => {
      get().removeToast(id);
    }, 5000);

    return id;
  },
  removeToast: (id: string) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

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

  performancePhase: 0,
  setPerformancePhase: (phase) => set({ performancePhase: phase }),
});
