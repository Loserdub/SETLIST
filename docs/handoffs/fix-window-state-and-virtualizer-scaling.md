# fix-window-state-and-virtualizer-scaling: Window Geometry Persistence & Resizing Stabilization

Status: done
Changed:
- src-tauri/src/window_state.rs
- src-tauri/src/lib.rs
- src-tauri/tauri.conf.json
- ui/src/features/library/LibraryView.tsx
Added deps: none
Public API:
- `pub fn load_window_state(app_data_dir: &std::path::Path) -> Option<WindowState>`
- `pub fn save_window_state(app_data_dir: &std::path::Path, state: &WindowState) -> std::io::Result<()>`
- `pub fn apply_saved_state_or_defaults(window: &tauri::WebviewWindow, app_data_dir: &std::path::Path)`
- `pub fn setup_window_state_tracking(window: &tauri::WebviewWindow, app_data_dir: std::path::PathBuf)`
Tests:
- Unit tests for WindowState serialization roundtrip and JSON file persistence (`test_window_state_serialization_roundtrip`, `test_window_state_file_save_and_load`)
- All 506 UI tests and 296+ Rust workspace tests passing cleanly
- Clippy and formatting checks passing with 0 warnings
Known gaps: none
Needs from others: Step 2 library loading performance optimization (stripping heavy waveform data from `list_tracks` IPC payload, background task worker synchronization).
