import { create } from 'zustand';
import { tauriBackend, type Backend } from '../api';

export interface AppState {
  pingResult: string | null;
  isLoading: boolean;
  error: string | null;
  fetchPing: (backend?: Backend) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  pingResult: null,
  isLoading: false,
  error: null,
  fetchPing: async (backend: Backend = tauriBackend) => {
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
