# k2-playback-ui Track View Audio Playback Controls and Waveform Interpolation

Status: done

## Changed
- `ui/src/api/playback.ts`: Added typed client wrappers for native Tauri playback commands (`playback_load`, `playback_play`, `playback_pause`, `playback_seek`, `playback_state`, `playback_set_click`) and position event listener (`playback-position`), plus a full in-memory `MockPlaybackClient` for browser mock mode and Vitest. Did not touch `Backend` in `api/index.ts`.
- `ui/src/features/track/playbackMath.ts`: Added pure mathematical functions for 1-bar beat grid seeks (`calculateBarSeek`), 60 fps position interpolation (`interpolatePosition`), and pure keyboard shortcuts handler (`handleTrackKeyDown`).
- `ui/src/features/track/PlaybackBar.tsx`: Created playback control bar component featuring play/pause toggle button, high-resolution time readout, playback state badge, beat grid click track (metronome) toggle button, ±5s jump buttons, and shortcut legends.
- `ui/src/features/track/usePlayback.ts`: Created React hook managing the playback lifecycle, subscribing to position events, and running a 60 fps `requestAnimationFrame` loop that smoothly interpolates playhead movement between 50 ms backend events.
- `ui/src/features/track/TrackView.tsx`: Integrated `usePlayback`, `PlaybackBar`, waveform clicking for seeking, keyboard navigation (Space, Arrow keys, Shift+Arrow keys), and automatic pause/stop when switching tracks or unmounting the track route.
- `ui/src/features/track/index.ts`: Re-exported `usePlayback`, `PlaybackBar`, and `playbackMath`.
- `ui/src/features/track/playbackMath.test.ts`: Added unit tests covering time-to-pixel coordinate math, position interpolation, bar seek math, and keyboard shortcut handler.
- `ui/src/features/track/TrackView.test.tsx`: Added component tests verifying PlaybackBar controls, play/pause toggling, click track toggling, keyboard space/arrow shortcuts, cue point seeking, and unmount stopping.
- `docs/handoffs/k2-playback-ui.md`: This handoff document.

## Added deps
- None (uses existing React, Zustand, `@tauri-apps/api`, and Vitest).

## Public API

### `ui/src/api/playback.ts`
```ts
export type PlayerState = 'stopped' | 'playing' | 'paused';

export interface PlaybackLoadResult {
  duration_ms: number;
}

export interface PlaybackStateResult {
  state: PlayerState;
  position_ms: number;
}

export interface PlaybackPositionPayload {
  position_ms: number;
  duration_ms: number;
  state: PlayerState;
}

export interface PlaybackClient {
  load(trackId: string): Promise<PlaybackLoadResult>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  getState(): Promise<PlaybackStateResult>;
  setClick(enabled: boolean): Promise<void>;
  stop(): Promise<void>;
  onPosition(callback: (payload: PlaybackPositionPayload) => void): () => void;
}

export const mockPlaybackClient: MockPlaybackClient;
export const tauriPlaybackClient: TauriPlaybackClient;
export function getPlaybackClient(useMock?: boolean): PlaybackClient;

export function playbackLoad(trackId: string): Promise<PlaybackLoadResult>;
export function playbackPlay(): Promise<void>;
export function playbackPause(): Promise<void>;
export function playbackSeek(positionMs: number): Promise<void>;
export function playbackState(): Promise<PlaybackStateResult>;
export function playbackSetClick(enabled: boolean): Promise<void>;
export function playbackStop(): Promise<void>;
export function onPlaybackPosition(callback: (payload: PlaybackPositionPayload) => void): () => void;
```

### `ui/src/features/track/playbackMath.ts`
```ts
export type TrackKeyboardAction =
  | { type: 'toggle_play_pause' }
  | { type: 'seek'; targetMs: number };

export interface KeyboardActionInput {
  key: string;
  code?: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  targetTagName?: string;
  isContentEditable?: boolean;
}

export interface KeyboardActionContext {
  currentPositionMs: number;
  durationMs: number;
  grid?: BeatGrid | null;
}

export function calculateBarSeek(
  currentMs: number,
  direction: 'forward' | 'backward',
  grid: BeatGrid | null | undefined,
  totalDurationMs?: number
): number;

export function interpolatePosition(
  lastPositionMs: number,
  lastEventTimestamp: number,
  nowTimestamp: number,
  state: PlayerState,
  durationMs: number
): number;

export function handleTrackKeyDown(
  input: KeyboardActionInput,
  context: KeyboardActionContext
): TrackKeyboardAction | null;
```

### `ui/src/features/track/usePlayback.ts`
```ts
export interface UsePlaybackOptions {
  trackId?: string;
  durationMs: number;
}

export interface UsePlaybackReturn {
  state: PlayerState;
  positionMs: number;
  durationMs: number;
  clickEnabled: boolean;
  isLoading: boolean;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seek: (targetMs: number) => Promise<void>;
  setClick: (enabled: boolean) => Promise<void>;
  toggleClick: () => Promise<void>;
  stop: () => Promise<void>;
}

export function usePlayback(options: UsePlaybackOptions): UsePlaybackReturn;
```

### `ui/src/features/track/PlaybackBar.tsx`
```tsx
export interface PlaybackBarProps {
  state: PlayerState;
  positionMs: number;
  durationMs: number;
  clickEnabled: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (positionMs: number) => void;
  onToggleClick: () => void;
  className?: string;
}

export const PlaybackBar: React.FC<PlaybackBarProps>;
```

## Tests
- `ui/src/features/track/playbackMath.test.ts`:
  - Time-to-pixel coordinate transforms across various widths, zoom levels, out-of-bounds times, and bidirectional roundtrips.
  - Position interpolation during playing at 60 fps cadence, boundary clamping to duration, and frozen state when paused/stopped.
  - 1-bar seek calculations forward and backward with downbeats, exact downbeat steps without threshold sticking, fallback to 4 beats at BPM when downbeat flags are absent, fallback to 120 BPM when grid is missing, and duration boundary clamping.
  - Pure keyboard handler for Space (toggle play/pause), ArrowLeft (-5s), ArrowRight (+5s), Shift+ArrowLeft (-1 bar), Shift+ArrowRight (+1 bar), form field input suppression, and modifier key suppression.
- `ui/src/features/track/TrackView.test.tsx`:
  - Rendering PlaybackBar with play/pause, time readout, status badge, click track toggle, and jump buttons.
  - Toggling play and pause updates mock player state and UI badges.
  - Toggling click track updates metronome state.
  - Keyboard Space and Arrow key triggers in TrackView.
  - Clicking waveform cue points updates playhead and seeks player.
  - Component unmounting automatically stops audio playback.

## Known gaps
- None.

## Needs from others
- None. Backend K1 audio player and commands are fully integrated and functional.
