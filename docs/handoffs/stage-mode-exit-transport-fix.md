# stage-mode-exit-transport-fix Stage Mode Exit Button & Transport Wiring
Status: done
Changed:
- `ui/src/features/stage/StageMode.tsx`
- `ui/src/features/stage/components/PerformanceControls.tsx`
- `ui/src/features/stage/store/useStageControlsStore.ts`
- `ui/src/features/stage/StageMode.test.tsx`

Added deps: none

Public API:
- `StageMode`: Added prominent `[ ← Exit to Menu ]` button in the top header (`stage-header-exit-btn`) with confirmation protection, and wired playhead synchronization from `getPlaybackClient().onPosition` to `TimelineVisualizer`.
- `useStageControlsStore`:
  - `loadTrack(track: StageTrackLike | null): Promise<void>`
  - `togglePlay(): Promise<void>`
  - `beatJump(beats: number, currentBpm?: number): Promise<void>`
  - `triggerHotCue(id: string): Promise<void>`
  - `toggleSlipMode(): Promise<void>`
  - Connected state machine directly to `getPlaybackClient()` (`play`, `pause`, `seek`, `load`).
- `PerformanceControls`:
  - Wired Play/Pause button (`stage-play-pause-btn`) to toggle playback on active track.
  - Wired Beat Jump buttons (`stage-beat-jump-plus-4`, etc.) to jump ±N beats.
  - Wired Hot Cue pads (`stage-cue-pad-a`, etc.) to jump to analyzed cue point timestamps and display cue time.
  - Wired Slip Mode button (`stage-slip-mode-btn`) with background virtual timeline preservation and resume upon disengagement.

Tests:
- `StageMode.test.tsx`:
  - Verified `stage-header-exit-btn` opens confirmation modal and confirms clean navigation back to setlist (`isStageMode: false, currentRoute: 'setlist'`).
  - Verified Play/Pause button toggles audio playback engine between `'playing'` and `'paused'`.
  - Verified Beat Jump seeks audio forward/backward according to track BPM.
  - Verified Hot Cue pads trigger seeks to cue timestamps.
  - Verified Slip Mode toggling and state preservation.
- Full UI suite: 389 passing tests across 32 test files.
- Full Rust suite: 294 passing tests, clippy passing with 0 warnings, fmt passing.

Known gaps: none

Needs from others: none
