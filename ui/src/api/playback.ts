import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauriEnvironment, USE_MOCK_BACKEND } from './index';

export type PlayerState = 'stopped' | 'playing' | 'paused';

export interface PlaybackLoadResult {
  duration_ms: number;
}

export interface PlaybackStateResult {
  state: PlayerState;
  position_ms: number;
  speed?: number;
  volume?: number;
}

export interface PlaybackPositionPayload {
  position_ms: number;
  duration_ms: number;
  state: PlayerState;
  speed?: number;
  volume?: number;
}

/**
 * Interface defining client-side audio playback operations.
 */
export interface PlaybackClient {
  load(trackId: string): Promise<PlaybackLoadResult>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  getState(): Promise<PlaybackStateResult>;
  setClick(enabled: boolean): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  getSpeed(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  getVolume(): Promise<number>;
  stop(): Promise<void>;
  onPosition(callback: (payload: PlaybackPositionPayload) => void): () => void;
}

/**
 * In-memory mock audio playback engine for deterministic testing and web mock mode.
 */
export class MockPlaybackClient implements PlaybackClient {
  private currentTrackId: string | null = null;
  private currentPositionMs = 0;
  private currentDurationMs = 180_000; // Default 3 minutes
  private currentState: PlayerState = 'stopped';
  private currentSpeed = 1.0;
  private currentVolume = 1.0;
  private clickEnabled = false;
  private listeners = new Set<(payload: PlaybackPositionPayload) => void>();
  private tickerId: ReturnType<typeof setInterval> | null = null;
  private lastTickTime = 0;

  public setMockDuration(durationMs: number): void {
    this.currentDurationMs = Math.max(0, durationMs);
    this.emit();
  }

  public getMockState(): {
    trackId: string | null;
    positionMs: number;
    durationMs: number;
    state: PlayerState;
    speed: number;
    volume: number;
    clickEnabled: boolean;
  } {
    return {
      trackId: this.currentTrackId,
      positionMs: this.currentPositionMs,
      durationMs: this.currentDurationMs,
      state: this.currentState,
      speed: this.currentSpeed,
      volume: this.currentVolume,
      clickEnabled: this.clickEnabled,
    };
  }

  public reset(): void {
    this.pauseSync();
    this.currentTrackId = null;
    this.currentPositionMs = 0;
    this.currentState = 'stopped';
    this.currentSpeed = 1.0;
    this.currentVolume = 1.0;
    this.clickEnabled = false;
    this.listeners.clear();
  }

  private emit(): void {
    const payload: PlaybackPositionPayload = {
      position_ms: this.currentPositionMs,
      duration_ms: this.currentDurationMs,
      state: this.currentState,
      speed: this.currentSpeed,
      volume: this.currentVolume,
    };
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('Error in playback listener:', err);
      }
    }
  }

  private pauseSync(): void {
    if (this.tickerId !== null) {
      clearInterval(this.tickerId);
      this.tickerId = null;
    }
    if (this.currentState === 'playing') {
      this.currentState = 'paused';
    }
  }

  public async load(trackId: string): Promise<PlaybackLoadResult> {
    this.pauseSync();
    this.currentTrackId = trackId;
    this.currentPositionMs = 0;
    this.currentState = 'stopped';
    this.emit();
    return { duration_ms: this.currentDurationMs };
  }

  public async play(): Promise<void> {
    if (this.currentState === 'playing') return;
    this.currentState = 'playing';
    this.lastTickTime = Date.now();
    this.emit();

    if (this.tickerId !== null) {
      clearInterval(this.tickerId);
    }

    this.tickerId = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.lastTickTime) * this.currentSpeed;
      this.lastTickTime = now;

      this.currentPositionMs = Math.min(this.currentDurationMs, this.currentPositionMs + elapsed);

      if (this.currentPositionMs >= this.currentDurationMs) {
        this.currentState = 'stopped';
        if (this.tickerId !== null) {
          clearInterval(this.tickerId);
          this.tickerId = null;
        }
      }

      this.emit();
    }, 50);
  }

  public async pause(): Promise<void> {
    this.pauseSync();
    this.emit();
  }

  public async seek(positionMs: number): Promise<void> {
    this.currentPositionMs = Math.max(0, Math.min(this.currentDurationMs, positionMs));
    this.lastTickTime = Date.now();
    this.emit();
  }

  public async getState(): Promise<PlaybackStateResult> {
    return {
      state: this.currentState,
      position_ms: this.currentPositionMs,
      speed: this.currentSpeed,
      volume: this.currentVolume,
    };
  }

  public async setClick(enabled: boolean): Promise<void> {
    this.clickEnabled = enabled;
  }

  public async setSpeed(speed: number): Promise<void> {
    const clamped = Math.max(0.1, Math.min(4.0, speed));
    this.currentSpeed = clamped;
    this.lastTickTime = Date.now();
    this.emit();
  }

  public async getSpeed(): Promise<number> {
    return this.currentSpeed;
  }

  public async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0.0, Math.min(2.0, volume));
    this.currentVolume = clamped;
    this.emit();
  }

  public async getVolume(): Promise<number> {
    return this.currentVolume;
  }

  public async stop(): Promise<void> {
    this.pauseSync();
    this.currentState = 'stopped';
    this.currentPositionMs = 0;
    this.emit();
  }

  public onPosition(callback: (payload: PlaybackPositionPayload) => void): () => void {
    this.listeners.add(callback);
    // Send immediate initial position
    callback({
      position_ms: this.currentPositionMs,
      duration_ms: this.currentDurationMs,
      state: this.currentState,
      volume: this.currentVolume,
    });
    return () => {
      this.listeners.delete(callback);
    };
  }
}

/**
 * Tauri desktop implementation invoking the native Rust audio playback commands.
 */
export class TauriPlaybackClient implements PlaybackClient {
  public async load(trackId: string): Promise<PlaybackLoadResult> {
    return invoke<PlaybackLoadResult>('playback_load', { trackId });
  }

  public async play(): Promise<void> {
    return invoke<void>('playback_play');
  }

  public async pause(): Promise<void> {
    return invoke<void>('playback_pause');
  }

  public async seek(positionMs: number): Promise<void> {
    return invoke<void>('playback_seek', { positionMs });
  }

  public async getState(): Promise<PlaybackStateResult> {
    return invoke<PlaybackStateResult>('playback_state');
  }

  public async setClick(enabled: boolean): Promise<void> {
    return invoke<void>('playback_set_click', { enabled });
  }

  public async setSpeed(speed: number): Promise<void> {
    return invoke<void>('playback_set_speed', { speed });
  }

  public async getSpeed(): Promise<number> {
    return invoke<number>('playback_get_speed');
  }

  public async setVolume(volume: number): Promise<void> {
    return invoke<void>('playback_set_volume', { volume });
  }

  public async getVolume(): Promise<number> {
    return invoke<number>('playback_get_volume');
  }

  public async stop(): Promise<void> {
    try {
      await invoke('playback_stop');
    } catch {
      await this.pause();
      await this.seek(0);
    }
  }

  public onPosition(callback: (payload: PlaybackPositionPayload) => void): () => void {
    let unlisten: (() => void) | null = null;
    let isActive = true;

    listen<PlaybackPositionPayload>('playback-position', (event) => {
      if (isActive) {
        callback(event.payload);
      }
    })
      .then((cleanup) => {
        if (isActive) {
          unlisten = cleanup;
        } else {
          cleanup();
        }
      })
      .catch((err) => {
        console.error('Failed to listen to playback-position event:', err);
      });

    return () => {
      isActive = false;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }
}

// Singleton instances
export const mockPlaybackClient = new MockPlaybackClient();
export const tauriPlaybackClient = new TauriPlaybackClient();

/**
 * Resolves the active playback client depending on mock mode or Tauri runtime presence.
 */
export function getPlaybackClient(useMock?: boolean): PlaybackClient {
  const shouldUseMock = useMock ?? (USE_MOCK_BACKEND || !isTauriEnvironment());
  return shouldUseMock ? mockPlaybackClient : tauriPlaybackClient;
}

// Standalone typed wrapper functions
export const playbackLoad = (trackId: string): Promise<PlaybackLoadResult> =>
  getPlaybackClient().load(trackId);

export const playbackPlay = (): Promise<void> => getPlaybackClient().play();

export const playbackPause = (): Promise<void> => getPlaybackClient().pause();

export const playbackSeek = (positionMs: number): Promise<void> =>
  getPlaybackClient().seek(positionMs);

export const playbackState = (): Promise<PlaybackStateResult> =>
  getPlaybackClient().getState();

export const playbackSetClick = (enabled: boolean): Promise<void> =>
  getPlaybackClient().setClick(enabled);

export const playbackSetSpeed = (speed: number): Promise<void> =>
  getPlaybackClient().setSpeed(speed);

export const playbackGetSpeed = (): Promise<number> =>
  getPlaybackClient().getSpeed();

export const playbackSetVolume = (volume: number): Promise<void> =>
  getPlaybackClient().setVolume(volume);

export const playbackGetVolume = (): Promise<number> =>
  getPlaybackClient().getVolume();

export const playbackStop = (): Promise<void> => getPlaybackClient().stop();

export const onPlaybackPosition = (
  callback: (payload: PlaybackPositionPayload) => void
): (() => void) => getPlaybackClient().onPosition(callback);
