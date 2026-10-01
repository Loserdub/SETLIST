import { invoke } from '@tauri-apps/api/core';

export interface Backend {
  ping(): Promise<string>;
}

export const tauriBackend: Backend = {
  ping: async (): Promise<string> => {
    return invoke<string>('ping');
  },
};
