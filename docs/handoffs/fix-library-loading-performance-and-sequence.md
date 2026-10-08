# fix-library-loading-performance-and-sequence: Library Loading Performance & Startup Sequencing

Status: done
Changed:
- src-tauri/src/commands.rs
- ui/src/App.tsx
- ui/src/store/slices/librarySlice.ts
- ui/src/features/library/LibraryView.tsx
Added deps: none
Public API:
- `commands::list_tracks`: now executes asynchronously via `tokio::task::spawn_blocking`, reads via non-blocking read-only WAL connection, and strips heavy waveform byte vectors from whole-library IPC payloads.
- `commands::get_track`: now executes asynchronously via `tokio::task::spawn_blocking`, reads via non-blocking read-only WAL connection, returning full track detail with intact 3-band waveforms.
- `useAppStore.getState().loadTracks`: now guarded against duplicate concurrent invocations via `isLoadingTracks`.
- `useAppStore.getState().selectTrack`: now lazily hydrates full waveform details via `getTrack` on-demand if not present in memory.
Tests:
- All 506 UI tests and 296+ Rust workspace tests passing cleanly
- `cargo clippy --workspace -- -D warnings` passing with 0 warnings
- `cargo fmt --check` passing with 0 diffs
- `pnpm --dir ui typecheck` passing with 0 errors
Known gaps: none
Needs from others: none
