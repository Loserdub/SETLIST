# h1-backend-reliability Scan Guard, Worker Concurrency, and Order Pinning
Status: done
Changed:
- `src-tauri/src/state.rs`
- `src-tauri/src/commands.rs`
- `crates/sequencer/src/solve.rs`
- `ui/src/features/setlist/reorder.ts`
- `ui/src/features/setlist/pinLifecycle.test.ts`
Added deps:
- None (uses existing `std::sync`, `rusqlite`, and workspace crates)
Public API:
- `app_lib::state::AppState::acquire_scan_guard(&self) -> Result<ScanGuard, AppError>`: ensures only one library scanning session runs concurrently; drops cleanly on completion or error
- `app_lib::commands::scan_folder(app: tauri::AppHandle, state: State<'_, AppState>, path: String)`: scans folder with worker concurrency configured from settings, streams progress events, isolates worker failures
- `app_lib::commands::suggest_order(state: State<'_, AppState>, track_ids: Vec<String>, profile: EnergyProfile, weights: Option<CostWeights>, first_id: Option<String>, last_id: Option<String>) -> Result<Vec<SetlistEntry>, AppError>`: solves optimal track ordering with optional start (`first_id`) and end (`last_id`) constraints while preserving unanalyzed tracks
Tests:
- `src-tauri/src/state.rs`:
  - `test_scan_guard_lifecycle_and_concurrent_prevention`: validates mutex-backed guard acquisition, rejection of concurrent scan requests with `AppError::ScanInProgress`, and clean release on completion
  - `test_scan_cancellation`: validates atomic cancellation token propagation to workers
- `src-tauri/src/commands.rs`:
  - `test_scan_settings_num_workers_and_failure_recovery`: verifies settings-driven worker thread pool configuration and corrupt-file failure recovery without crashing the scan pipeline
  - `test_suggest_order_pins_anchor_placement`: asserts `first_id` is locked to index 0 and `last_id` is locked to final index in solver output
  - `test_suggest_order_pins_with_unanalyzed_tracks`: asserts pinned tracks remain anchored even when mixed with unanalyzed stub entries
- `crates/sequencer/src/solve.rs`:
  - `test_anchors_always_hold`: verifies exact anchor constraints in Held-Karp dynamic programming and 2-opt search
- `ui/src/features/setlist/pinLifecycle.test.ts`:
  - Frontend lifecycle tests verifying `applyPinsToOrderedIds` safety net persists pinned tracks across reorders, drag-and-drop, and solver operations
Known gaps:
- None.
Needs from others:
- None.
