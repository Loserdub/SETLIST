import type { Backend, ProgressEvent } from '../api';
import type { PlayerState } from '../api/playback';
import type { Track } from '../bindings/Track';
import type { SetlistEntry } from '../bindings/SetlistEntry';
import type { EnergyProfile } from '../bindings/EnergyProfile';
import type { CostWeights } from '../bindings/CostWeights';
import type { ExportTarget } from '../bindings/ExportTarget';
import type { ExportResult } from '../bindings/ExportResult';
import type { AppSettings } from '../bindings/AppSettings';
import type { SetlistPins } from '../features/setlist/types';

export type Route = 'library' | 'discovery' | 'track' | 'setlist' | 'settings' | 'stage' | 'performance';

export interface SetlistSnapshot {
  setlist: SetlistEntry[];
  pins: SetlistPins;
  energyProfile: EnergyProfile;
  setlistName: string;
}

export interface SetlistHistory {
  past: SetlistSnapshot[];
  future: SetlistSnapshot[];
}

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

export interface UiSlice {
  currentRoute: Route;
  setRoute: (route: Route) => void;
  useMockBackend: boolean;
  setUseMockBackend: (useMock: boolean) => void;
  progress: ProgressEvent | null;
  setProgress: (progress: ProgressEvent | null) => void;
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  appSettings: AppSettings;
  isLoadingSettings: boolean;
  settingsError: string | null;
  loadSettings: (backend?: Backend) => Promise<void>;
  saveSettings: (settings: AppSettings, backend?: Backend) => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => void;
  isStageMode: boolean;
  stageCurrentIndex: number;
  stageStartTime: number | null;
  enterStageMode: () => void;
  exitStageMode: () => void;
  stageNext: () => void;
  stagePrev: () => void;
  stageGoTo: (index: number) => void;
  stageRestart: () => void;
  pingResult: string | null;
  isLoading: boolean;
  error: string | null;
  fetchPing: (backend?: Backend) => Promise<void>;
  performancePhase: number;
  setPerformancePhase: (phase: number) => void;
}

export interface LibrarySlice {
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
  scanPaths: (paths: string[], backend?: Backend) => Promise<void>;
  selectTrack: (id: string | null) => void;
  refreshTrackInSetlist: (freshTrack: Track, backend?: Backend) => Promise<void>;
}

export interface SetlistSlice {
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
  setlistHistory: SetlistHistory;
  canUndoSetlist: boolean;
  canRedoSetlist: boolean;
  undoSetlist: (backend?: Backend) => void;
  redoSetlist: (backend?: Backend) => void;
}

export interface PlaybackSlice {
  auditionTrackId: string | null;
  auditionState: PlayerState;
  auditionPositionMs: number;
  auditionDurationMs: number;
  auditionSpeed: number;
  masterVolume: number;
  setMasterVolume: (volume: number) => Promise<void>;
  toggleAudition: (trackId?: string | null) => Promise<void>;
  seekAudition: (positionMs: number) => Promise<void>;
  setAuditionSpeed: (speed: number) => Promise<void>;
  stopAudition: () => Promise<void>;
  syncAuditionPosition: (payload: {
    state: PlayerState;
    position_ms: number;
    duration_ms: number;
    speed?: number;
    volume?: number;
  }) => void;
}

export interface OverridesSlice {
  trackTitleOverrides: Record<string, string>;
  trackArtistOverrides: Record<string, string>;
  setTrackTitleOverride: (trackId: string, title?: string | null) => void;
  setTrackArtistOverride: (trackId: string, artist?: string | null) => void;
}

export type AppState = UiSlice & LibrarySlice & SetlistSlice & PlaybackSlice & OverridesSlice;
