# l2-override-ui Track Analysis Overrides UI

Status: done

## Changed
- `ui/src/api/overrides.ts`: Created typed client wrappers for native Tauri override commands (`set_track_override`, `clear_track_override`, `get_track_override`, `get_track_override_flags`) and `get_track` (`getTrackWithOverrides`), plus a complete in-memory `MockOverridesClient` with deterministic beat grid recalculation and Camelot key reconstruction for web/mock testing. The `Backend` interface in `ui/src/api/index.ts` was untouched.
- `ui/src/features/track/overrides/overrideMath.ts`: Implemented pure mathematical functions for tempo halving (`halfBpm`), doubling (`doubleBpm`), fractional nudging (`nudgeBpm`), downbeat timestamp shifting (`nudgeDownbeat`, `shiftBeat`), and Camelot key validation/normalization.
- `ui/src/features/track/overrides/EditedBadge.tsx`: Created reusable visual indicator (`EditedBadge`) and helper functions (`isFieldOverridden`, `hasAnyOverride`) for displaying "EDITED" badges on modified analysis values.
- `ui/src/features/track/overrides/OverridePanel.tsx`: Created the interactive correction panel containing BPM controls (½, 2×, ±0.1, direct input), first downbeat nudge controls (-10 ms, +10 ms, Shift 1 Beat, direct input), full 24-key Camelot wheel matrix (1A–12A, 1B–12B) with active indicators and harmonic colors, field-level reset buttons, and a global "Reset All" action. All mutations persist immediately and refresh the app state.
- `ui/src/features/track/overrides/index.ts`: Re-exported components and pure math utilities.
- `ui/src/components/routes/TrackRoute.tsx`: Mounted `OverridePanel` below the track view in a responsive vertical layout.
- `ui/src/features/library/LibraryView.tsx`: Integrated `EditedBadge` onto overridden BPM and Camelot key columns in the library table.
- `ui/src/features/setlist/SortableTrackItem.tsx`: Integrated `EditedBadge` onto overridden BPM and Camelot key chips in setlist rows.
- `ui/src/features/stage/StageMode.tsx`: Integrated `EditedBadge` onto overridden BPM and Camelot key in both the active track's primary metadata pills and the quick-jump list.
- `ui/src/features/track/overrides/overrideMath.test.ts`: Added unit tests covering tempo halving/doubling, boundary clamping, floating-point drift prevention, downbeat nudge math, beat shifting, and Camelot key normalization.
- `ui/src/features/track/overrides/OverridePanel.test.tsx`: Added component tests verifying ½ and 2× buttons, ±0.1 BPM nudging, ±10 ms downbeat nudging, beat shifting, 24-key selection, field-level resets, and "Reset All".
- `ui/src/features/track/overrides/badgeIntegration.test.tsx`: Added integration tests verifying "EDITED" badge rendering in library table, setlist rows, and stage mode.
- `docs/handoffs/l2-override-ui.md`: This handoff document.

## Added deps
- None (uses existing React, Zustand, `@tauri-apps/api`, and Vitest).

## Public API

### `ui/src/api/overrides.ts`
```ts
export interface TrackOverridePatch {
  bpm?: number;
  first_downbeat_ms?: number;
  key_camelot?: string;
  cues_json?: string;
  cues?: CuePoint[];
}

export interface TrackOverrideFlags {
  bpm: boolean;
  first_downbeat_ms: boolean;
  key_camelot: boolean;
  cues: boolean;
}

export interface TrackOverride {
  track_id: string;
  bpm?: number | null;
  first_downbeat_ms?: number | null;
  key_camelot?: string | null;
  cues_json?: string | null;
  updated_at?: string | null;
}

export type TrackWithOverrides = Track & {
  overrides?: TrackOverrideFlags;
};

export interface OverridesClient {
  setTrackOverride(trackId: string, patch: TrackOverridePatch): Promise<void>;
  clearTrackOverride(trackId: string, fields?: string[]): Promise<void>;
  getTrackOverride(trackId: string): Promise<TrackOverride | null>;
  getTrackOverrideFlags(trackId: string): Promise<TrackOverrideFlags>;
  getTrackWithOverrides(trackId: string): Promise<TrackWithOverrides | null>;
}

export const mockOverridesClient: MockOverridesClient;
export const tauriOverridesClient: TauriOverridesClient;
export function getOverridesClient(useMock?: boolean): OverridesClient;

export function setTrackOverride(trackId: string, patch: TrackOverridePatch): Promise<void>;
export function clearTrackOverride(trackId: string, fields?: string[]): Promise<void>;
export function getTrackOverride(trackId: string): Promise<TrackOverride | null>;
export function getTrackOverrideFlags(trackId: string): Promise<TrackOverrideFlags>;
export function getTrackWithOverrides(trackId: string): Promise<TrackWithOverrides | null>;
```

### `ui/src/features/track/overrides/`
```ts
export const OverridePanel: React.FC<OverridePanelProps>;
export const EditedBadge: React.FC<EditedBadgeProps>;
export function isFieldOverridden(track: Track | null | undefined, field: keyof TrackOverrideFlags): boolean;
export function hasAnyOverride(track: Track | null | undefined): boolean;
export function halfBpm(bpm: number, minBpm?: number, maxBpm?: number): number;
export function doubleBpm(bpm: number, minBpm?: number, maxBpm?: number): number;
export function nudgeBpm(bpm: number, delta: number, minBpm?: number, maxBpm?: number): number;
export function clampBpm(bpm: number, minBpm?: number, maxBpm?: number): number;
export function nudgeDownbeat(currentMs: number, deltaMs: number, maxMs?: number): number;
export function shiftBeat(currentMs: number, bpm: number, direction?: 1 | -1, maxMs?: number): number;
```

## Tests
- `overrideMath.test.ts`:
  - Clamping numbers and BPMs to valid boundaries.
  - BPM halving and doubling with edge-case clamping.
  - ±0.1 BPM nudging without IEEE-754 floating point precision errors.
  - Downbeat timestamp nudging (forward/backward) clamped to `>= 0` and `<= duration_ms`.
  - Beat grid shifting forward/backward by beat period (`60_000 / BPM`).
  - Camelot key 24-key array validation and case normalization.
- `OverridePanel.test.tsx`:
  - Renders all three correction sections (BPM, Downbeat, 24-Key Camelot Wheel).
  - Half (`½`) and Double (`2×`) buttons correctly mutate tempo and trigger store update.
  - ±0.1 BPM and ±10 ms downbeat nudge buttons update values immediately.
  - Shift 1 Beat recalculates and saves grid alignment.
  - Camelot key buttons update key and mode.
  - Field-level reset buttons clear respective overrides and revert values.
  - "Reset All" clears all active overrides.
- `badgeIntegration.test.tsx`:
  - Verifies "EDITED" badge is rendered in `LibraryView` on overridden BPM and Key.
  - Verifies "EDITED" badge is rendered in `SortableTrackItem` setlist rows on overridden BPM and Key.
  - Verifies "EDITED" badge is rendered in `StageMode` on overridden BPM and Key.

## Known gaps
- Cue dragging and interactive cue placement will be implemented in a subsequent prompt as specified.

## Needs from others
- None. Waveform components were left untouched.
