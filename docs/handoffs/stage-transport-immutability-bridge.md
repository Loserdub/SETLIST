# stage-transport-immutability-bridge Stage Mode Immutability Air-Gap and Tauri IPC Audio Transport Bridge
Status: done
Changed:
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `ui/src/store/useAppStore.ts`
- `ui/src/features/stage/store/useStageControlsStore.ts`
- `ui/src/features/stage/store/useStageControlsStore.test.ts`

Added deps: none

Public API:
- Rust backend IPC commands (`src-tauri/src/commands.rs` registered in `src-tauri/src/lib.rs`):
  - `stage_toggle_play(state: State<'_, AppState>) -> Result<StageTransportState, AppError>`
  - `stage_beat_jump(beats: f64, bpm: Option<f64>, state: State<'_, AppState>) -> Result<StageTransportState, AppError>`
  - `stage_trigger_hot_cue(cue_id: String, timestamp_ms: Option<f64>, state: State<'_, AppState>) -> Result<StageTransportState, AppError>`
  - `stage_toggle_slip_mode(state: State<'_, AppState>) -> Result<StageTransportState, AppError>`
  - `stage_get_transport_state(state: State<'_, AppState>) -> Result<StageTransportState, AppError>`
  - Rust types: `TransportContext` (`StudioPreview`, `LiveStage`), `StageTransportState`, `StageTransportController`.
- Frontend store modifications:
  - `ui/src/store/useAppStore.ts`:
    - Hard-forked setlist persistence: `scheduleActiveSetlistPersistence` checks `state.isStageMode` and immediately aborts if true, guaranteeing zero writes to SQLite `setlists`/`setlist_items` or active setlist during live stage mode.
    - `enterStageMode`: Initializes volatile `useStageControlsStore.getState().initLiveSetlist(state.setlist)` and sets `isStageMode = true`.
    - `exitStageMode`: Clears volatile live setlist (`clearLiveSetlist()`) and restores studio state cleanly.
    - `stageQueueTrackNext` & `stageReplaceNextTrack`: Intercepted so that mutations apply strictly to `useStageControlsStore.getState().liveSetlist`, leaving studio `setlist` completely untouched with zero persistence scheduled.
  - `ui/src/features/stage/store/useStageControlsStore.ts`:
    - `togglePlay`: Issues `invoke('stage_toggle_play')` in Tauri environment; falls back to playback client in web/mock environments.
    - `beatJump`: Issues `invoke('stage_beat_jump', { beats, bpm })` in Tauri environment; falls back to playback client in web/mock environments.
    - `triggerHotCue`: Issues `invoke('stage_trigger_hot_cue', { cueId, timestampMs })` in Tauri environment; falls back to playback client in web/mock environments.
    - `toggleSlipMode`: Issues `invoke('stage_toggle_slip_mode')` in Tauri environment; falls back to local slip mode state in web/mock environments.

Tests:
- Rust:
  - Added unit tests in `src-tauri/src/commands.rs` for `StageTransportController`:
    - `test_stage_transport_controller_play_pause_slip`
    - `test_stage_transport_controller_beat_jump`
    - `test_stage_transport_controller_hot_cue`
  - Ran `cargo test --workspace`: 297 tests passed.
  - Ran `cargo clippy --workspace -- -D warnings`: passed with 0 warnings.
  - Ran `cargo fmt --check`: passed.
- UI:
  - Added unit test suite `ui/src/features/stage/store/useStageControlsStore.test.ts`:
    - Verified `scheduleActiveSetlistPersistence` strictly skips writes during Stage Mode.
    - Verified `stageQueueTrackNext` strictly mutates volatile `liveSetlist` without mutating studio `setlist`.
    - Verified `stageReplaceNextTrack` strictly mutates volatile `liveSetlist` without mutating studio `setlist`.
    - Verified `togglePlay` invokes Tauri `stage_toggle_play`.
    - Verified `beatJump` invokes Tauri `stage_beat_jump` with parameters.
    - Verified `triggerHotCue` invokes Tauri `stage_trigger_hot_cue` with cue details.
    - Verified `toggleSlipMode` invokes Tauri `stage_toggle_slip_mode`.
  - Ran `pnpm --dir ui typecheck`: passed with 0 errors.
  - Ran `pnpm --dir ui test`: 440 tests passed across 43 test files.

Known gaps: none

Needs from others: none
