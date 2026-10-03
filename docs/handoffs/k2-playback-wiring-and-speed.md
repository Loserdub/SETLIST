# k2-playback-wiring-and-speed Playback Feature Wiring and Play Speed Optimization
Status: done
Changed:
- crates/playback/src/player.rs
- crates/playback/src/state_machine.rs
- src-tauri/src/playback.rs
- src-tauri/src/lib.rs
- ui/src/api/playback.ts
- ui/src/features/track/playbackMath.ts
- ui/src/features/track/playbackMath.test.ts
- ui/src/features/track/usePlayback.ts
- ui/src/features/track/PlaybackBar.tsx
- ui/src/features/track/TrackView.tsx
- ui/src/features/track/TrackView.test.tsx
- ui/src/features/library/LibraryView.tsx
- ui/src/features/setlist/TransitionAdviceModal.tsx

Added deps: none

Public API:
- `playback::AudioPlayer::set_speed(&self, speed: f32) -> Result<(), PlaybackError>`
- `playback::AudioPlayer::speed(&self) -> f32`
- `playback::StateMachine::set_speed(&mut self, speed: f64)`
- `playback::StateMachine::speed(&self) -> f64`
- `src-tauri::playback::playback_set_speed(app: AppHandle, speed: Option<f64>, playSpeed: Option<f64>) -> Result<(), String>`
- `src-tauri::playback::playback_get_speed() -> Result<f64, String>`
- `ui::PlaybackClient::setSpeed(speed: number) => Promise<void>`
- `ui::PlaybackClient::getSpeed() => Promise<number>`
- `ui::playbackSetSpeed(speed: number) => Promise<void>`
- `ui::playbackGetSpeed() => Promise<number>`
- `ui::interpolatePosition(lastPositionMs, lastEventTimestamp, nowTimestamp, state, durationMs, speed)`
- `ui::usePlayback({ trackId, durationMs }) => { ... speed, setSpeed, ... }`
- `ui::SPEED_OPTIONS: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]`

Tests:
- Rust `playback` crate: unit tests in `state_machine.rs` for speed scaling (2.0x, 0.5x, dynamic mid-stream rate change without position jump).
- Rust `src-tauri` (`app` crate): `test_playback_set_speed` verifying speed setter, getter, and reset.
- UI `playbackMath.test.ts`: test cases for `interpolatePosition` speed scaling (2.0x, 0.5x, rate clamping to [0.1, 4.0]).
- UI `TrackView.test.tsx`: tested rendering of speed preset controls on `PlaybackBar`, speed change on button click, keyboard shortcuts `[` and `]` to step speed.
- Verified test suite:
  - `cargo test --workspace`: all unit and integration tests passed.
  - `cargo clippy --workspace -- -D warnings`: passed with 0 warnings.
  - `cargo fmt --check`: passed with 0 formatting differences.
  - `pnpm --dir ui typecheck`: TypeScript compiler passed with 0 errors.
  - `pnpm --dir ui test`: 285 tests across 24 test suites passed.

Known gaps:
- Pitch-preserving time stretching (WSOLA / phase vocoder) is reserved for future neural/DSP enhancements; rodio's native `Sink::set_speed` resamples speed and pitch concurrently.

Needs from others:
- None
