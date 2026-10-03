# k1-playback-backend Audio Playback Engine and Tauri Commands

Status: done
Changed:
- `Cargo.toml`
- `crates/playback/Cargo.toml`
- `crates/playback/src/lib.rs`
- `crates/playback/src/clock.rs`
- `crates/playback/src/state_machine.rs`
- `crates/playback/src/click.rs`
- `crates/playback/src/player.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/src/playback.rs`
- `docs/handoffs/k1-playback-backend.md`

Added deps:
- `rodio = { version = "0.20", features = ["symphonia-all"] }` in `crates/playback` (handles playback, streaming, seeking, and sample-level mixing using the same symphonia codecs as `audio-io`)
- `core-types = { path = "../core-types" }` in `crates/playback` (provides shared domain types including `BeatGrid`)
- `serde = { version = "1.0", features = ["derive"] }` in `crates/playback` (JSON serialization for player status and payloads)
- `thiserror = "2"` in `crates/playback` (standard typed errors via `PlaybackError`)
- `log = "0.4"` in `crates/playback` (diagnostic warnings for headless audio device availability)
- `playback = { path = "../crates/playback" }` in `src-tauri` (integrates audio engine into Tauri desktop commands)

Public API:
- `playback::clock`:
  - `pub trait Clock: Send + Sync + 'static { fn now(&self) -> Duration; }`
  - `pub struct SystemClock`: Real-time clock using `Instant`.
  - `pub struct FakeClock`: Deterministic clock with `advance`, `advance_ms`, and `set_micros` for testing.
- `playback::state_machine`:
  - `pub enum PlayerState`: `Stopped`, `Playing`, `Paused` (serialized lowercase with PascalCase deserialization alias support).
  - `pub trait PlaybackStateMachine`: Trait defining `load`, `play`, `pause`, `stop`, `seek`, `state`, `position_ms`, and `duration_ms`.
  - `pub struct StateMachine<C: Clock>`: Pure timing and state machine with strict seek clamping to `[0.0, duration_ms]`, auto-stop at duration, and position freezing on pause.
- `playback::click`:
  - `pub struct ClickTrackSource`: Synthesizes short 15 ms decayed sine clicks on each beat of the track's beat grid (1760 Hz for downbeats, 880 Hz for regular beats). Supports real-time enabling/disabling via `Arc<AtomicBool>` and seeking.
- `playback::player`:
  - `pub struct AudioPlayer`: Single-instance audio player with rodio Symphonia decoder, integrated click mixing via `.mix()`, and fallbacks for headless/no-device environments.
  - `pub struct PlaybackLoadResult { pub duration_ms: f64 }`
  - `pub struct PlaybackStateResult { pub state: PlayerState, pub position_ms: f64 }`
  - `pub struct PlaybackPositionPayload { pub position_ms: f64, pub duration_ms: f64, pub state: PlayerState }`
- Tauri Commands in `src-tauri/src/playback.rs`:
  - `#[tauri::command] pub async fn playback_load(app: AppHandle, state: State<'_, AppState>, track_id: Option<String>, trackId: Option<String>) -> Result<PlaybackLoadResult, String>`: Loads library track by ID, extracts audio file path and beat grid, resets position to 0.0, and returns `{ duration_ms }`.
  - `#[tauri::command] pub async fn playback_play(app: AppHandle) -> Result<(), String>`: Starts or resumes audio playback and starts the 50 ms position ticker.
  - `#[tauri::command] pub async fn playback_pause(app: AppHandle) -> Result<(), String>`: Suspends playback at current position.
  - `#[tauri::command] pub async fn playback_seek(app: AppHandle, position_ms: Option<f64>, positionMs: Option<f64>) -> Result<(), String>`: Seeks playback to position clamped to `[0.0, duration_ms]`.
  - `#[tauri::command] pub async fn playback_state() -> Result<PlaybackStateResult, String>`: Returns current `{ state, position_ms }`.
  - `#[tauri::command] pub async fn playback_set_click(enabled: bool) -> Result<(), String>`: Enables or disables beat grid click mixing.
- Tauri Event:
  - Event name: `"playback-position"`
  - Cadence: Emitted every 50 ms during active playback, plus immediately on `playback_load`, `playback_seek`, `playback_pause`, and `playback_play`.
  - JSON Payload:
    ```json
    {
      "position_ms": 1250.0,
      "duration_ms": 180000.0,
      "state": "playing"
    }
    ```
    (Both `position_ms`/`positionMs` and `duration_ms`/`durationMs` keys are supported during deserialization.)

Tests:
- `crates/playback/src/clock.rs`: SystemClock advancement, FakeClock manual advances and explicit timestamp setting.
- `crates/playback/src/state_machine.rs`:
  - `test_initial_state_is_stopped`: Verifies initial state is `Stopped`, position 0.0, duration 0.0.
  - `test_state_transitions`: Verifies Stopped -> Playing -> Paused -> Playing -> Stopped transitions and automatic stop at track completion.
  - `test_seek_clamping`: Tests negative seek clamping to 0.0, seek beyond duration clamping to `duration_ms`, seeking during playback, and seeking during pause.
  - `test_position_after_pause_and_resume`: Verifies position holds steady across large fake clock jumps while paused, resumes from exact paused position, and advances accurately.
- `crates/playback/src/click.rs`:
  - `test_click_track_synthesis_and_toggling`: Tests sample generation at beat boundaries, real-time muting when disabled, and seek realignment.
- `src-tauri/src/playback.rs`:
  - `test_playback_controls_lifecycle_with_db_track`: End-to-end test with synthetic WAV file and SQLite database entry: tests loading, playing, pausing, seeking, clamping, and click toggling.
  - `test_playback_load_missing_track_returns_error`: Validates error handling when track ID does not exist.

Known gaps:
- None.

Needs from others:
- Frontend UI can invoke `playback_load`, `playback_play`, `playback_pause`, `playback_seek`, `playback_state`, and `playback_set_click` and subscribe to `"playback-position"` via `@tauri-apps/api/event`.
