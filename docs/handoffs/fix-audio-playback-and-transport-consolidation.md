# fix-audio-playback-and-transport-consolidation
Status: done
Changed:
  - `crates/playback/src/player.rs`
  - `src-tauri/src/playback.rs`
  - `src-tauri/src/lib.rs`
  - `ui/src/api/playback.ts`
  - `ui/src/App.tsx`
  - `ui/src/features/library/LibraryView.tsx`
  - `ui/src/features/track/TrackView.tsx`
  - `ui/src/features/track/usePlayback.ts`
  - `ui/src/components/waveform/WaveformCanvas.tsx`
Added deps: none
Public API:
  - `playback_set_volume(volume: f64) -> Result<PlaybackStateResult, String>`
  - `playback_get_volume() -> Result<f64, String>`
  - `playbackSetVolume(volume: number) -> Promise<PlaybackStateResult>`
  - `playbackGetVolume() -> Promise<number>`
Tests:
  - `player::tests::test_player_volume_setting_and_clamping`
  - `player::tests::test_seek_retains_position_without_resetting_to_zero`
  - UI regression test suites across 27 test files (all 310 tests passing)
Known gaps: none
Needs from others: none

## Summary of Fixes

### Phase 1: Audio Engine Robustness, Device Error Reporting & Volume Controls
- Added on-demand `OutputStream::try_default()` re-acquisition on a dedicated thread in `AudioPlayer::play()`. If an audio device is unavailable, explicit `PlaybackError::DeviceError` is returned instead of failing silently.
- Added master volume control (`0.0` to `2.0`) to `AudioPlayer`, rodio Sinks, Tauri command bindings, and frontend API clients.
- Fixed `seek()` bug in `AudioPlayer` that reset position to 0.0 by draining sink without state machine reset.
- Tuned position ticker interval in `src-tauri/src/playback.rs` from 50ms to 100ms (10 Hz) to cut WebView2 IPC event traffic in half.

### Phase 2: Frontend Performance & UI Freeze Resolution
- Decoupled `auditionPositionMs` from `LibraryView.tsx` table component to eliminate 587-row TanStack table re-rendering on every audio position update tick.
- Eliminated keydown event listener re-binding churn in `TrackView.tsx` by reading playhead position via `useTrackState.getState()`.
- Replaced unconditional 60 FPS `requestAnimationFrame` loop in `WaveformCanvas.tsx` with dirty-scheduled RAF on render dependency change, reducing idle CPU usage to 0%.
- Throttled `usePlayback.ts` RAF state updates to ~30 FPS (~33ms intervals) to avoid React reconciliation queue exhaustion.

### Phase 3: Playback Transport Consolidation
- Removed duplicate inline `library-audition-bar` from `LibraryView.tsx`.
- Elevated track row audition button to display `AUDITIONING` state cleanly.
- Added dynamic bottom padding (`pb-14`) to `App.tsx` `<main>` container whenever `GlobalTransportBar` is active, ensuring table footers and bottom rows remain fully accessible and never obscured.
