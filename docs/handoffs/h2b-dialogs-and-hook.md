# h2b-dialogs-and-hook Native Dialogs, Thread-Scoped Panic Hook, and Pin Forwarding
Status: done
Changed:
- `src-tauri/Cargo.toml`
- `src-tauri/capabilities/default.json`
- `src-tauri/src/lib.rs`
- `docs/BUILD_WINDOWS.md`
- `ui/package.json`
- `pnpm-lock.yaml`
- `ui/src/api/index.ts`
- `ui/src/api/index.test.ts`
- `ui/src/features/library/LibraryView.tsx`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/store/useAppStore.ts`
- `ui/src/features/nativeDialogs.test.tsx`
- Deleted: `ui/README.md`, `ui/src/assets/react.svg`, `ui/src/assets/vite.svg`

Added deps:
- `tauri-plugin-dialog = "2"` (Rust crate) and `@tauri-apps/plugin-dialog = "^2.8.1"` (npm package): provides native folder picker and file save dialogs; granted `"dialog:default"` in `src-tauri/capabilities/default.json`.

Public API:
- `app_lib::handle_panic_scoped<D, E, R>(panic_info: &std::panic::PanicHookInfo<'_>, show_dialog: D, exit_fn: E)`: thread-aware panic handler that acts only when the panicking thread is named `"main"`. Any non-main thread (e.g., scan worker or analysis thread) logs `[WORKER PANIC]` and returns cleanly without opening a dialog or terminating the process.
- `Backend.suggestOrder(trackIds, profile, weights?, firstId?, lastId?)`: extended signature supporting optional `firstId` and `lastId` track pins. Forwarded over Tauri IPC to `suggest_order` command with `firstId: string | null, lastId: string | null`, and mirrored in `mockBackend` with deterministic start/end anchoring.
- `getDefaultExportFileName(target: ExportTarget): string`: formats default export file name based on target format (`setlist_rekordbox.xml`, `setlist_playlist.m3u8`, `setlist_sheet.csv`, `setlist_sheet.md`).
- `getExportDialogFilters(target: ExportTarget)`: generates platform file dialog filter descriptors for each export format.

Tests:
- Rust unit tests in `src-tauri/src/lib.rs`:
  - `test_panic_in_spawned_thread_does_not_call_exit`: verifies that a panic on a thread named `"scan-worker-test"` is isolated, does not invoke the native dialog, and does not invoke the exit function.
  - `test_panic_in_main_thread_calls_dialog_and_exit`: verifies that a panic on a thread named `"main"` invokes both the native dialog and process exit.
- Frontend unit tests:
  - `src/features/nativeDialogs.test.tsx` (7 tests):
    - Tests `getDefaultExportFileName` and `getExportDialogFilters` for all 4 export targets.
    - Tests `LibraryView` "Choose Folder" button triggering `@tauri-apps/plugin-dialog` `open({ directory: true, multiple: false })`, updating the input value on selection and preserving state on cancellation.
    - Tests `SetlistView` export invoking `@tauri-apps/plugin-dialog` `save(...)` with target-specific default file name and extensions, passing the selected path as `outputPath` to `exportSet`, and aborting export cleanly when cancelled.
    - Tests Browse button in export options modal.
  - `src/api/index.test.ts`:
    - Verifies `tauriBackend.suggestOrder` passes `{ trackIds, profile, weights, firstId, lastId }` via `invoke`.
    - Verifies `mockBackend.suggestOrder` anchors `firstId` to index 0 and `lastId` to the final index while preserving unanalyzed tracks and 1..N contiguous positions.

## Test Count Comparison (`cargo test --workspace`)
The workspace test suite reports **284 passed tests** across all crates (0 failed; 0 ignored; 0 measured):

| Crate | Passed Tests | Description |
|---|---|---|
| `app_lib` / `src-tauri` | 40 | 15 unit tests + 25 integration tests (domain persistence, export safety, settings wiring, regression, catalog relationships) |
| `crates/audio-analysis` | 48 | Rhythm, onset, tempo, beats, downbeats, tonal chroma, dynamics, waveform 3-band, cues |
| `crates/audio-io` | 12 | Symphonia decoding, tags extraction, resampling, LUFS loudness |
| `crates/core-types` | 77 | Camelot math, bindings generation, song validation, catalog relationship contracts |
| `crates/exporters` | 17 | Rekordbox XML, M3U8, CSV/MD set sheets, CLI runner |
| `crates/library-db` | 22 | SQLite repository, schema migrations, track persistence, overrides, grid rebuild, scanner |
| `crates/playback` | 7 | Audio clock, state machine, click track synthesis, rodio sink controls |
| `crates/sequencer` | 54 | Held-Karp / 2-opt solver, energy profiles, transition advisor, bridge discovery, catalog clusters |
| `crates/validate` | 7 | Ground truth evaluation harness, CLI verification |
| **Total** | **284** | **All tests passing** |

### Difference vs. Earlier 203 Test Baseline:
The previous manifest reported 203 tests prior to recent feature and reliability additions:
1. `src-tauri` / `app_lib` expanded from 14 to 40 tests (+26 tests) due to catalog relationship integration tests, export safety tests, settings wiring tests, thread-scoped panic tests, and pin placement regression tests.
2. `core-types` expanded from 57 to 77 tests (+20 tests) for newly generated TypeScript bindings (`SongRelationship`, `CatalogCluster`, `OpenerCandidate`, `CloserCandidate`, `BridgeCandidateAnalysis`, etc.).
3. `sequencer` expanded from 38 to 54 tests (+16 tests) with the catalog relationship scoring engine, bridge discovery, and clustering logic.
4. `library-db` expanded from 17 to 22 tests (+5 tests) with analysis overrides, grid rebuild, and migration tests.
5. Added `playback` crate (+7 tests) for the local audio engine and click track.
6. Added `validate` crate (+7 tests) for ground truth dataset verification.

Net change: 203 + 81 = 284 passed tests.

## Frontend Quality Checks
- `cargo clippy --workspace -- -D warnings`: passed (0 warnings)
- `cargo fmt --check`: passed (0 formatting issues)
- `pnpm --dir ui typecheck`: passed (0 TypeScript errors)
- `pnpm --dir ui test`: passed (213 passed across 20 test files)

## Manual Test Checklist

### 1. Deliberate Startup Error Test (`SETLIST_TEST_STARTUP_ERROR=1`)
1. In PowerShell:
   ```powershell
   $env:SETLIST_TEST_STARTUP_ERROR = "1"
   .\target\release\SETLIST.exe
   ```
2. Verify:
   - Native Windows message dialog appears: `"SETLIST - Fatal Startup Error: Deliberate startup error triggered by SETLIST_TEST_STARTUP_ERROR=1"`.
   - Process terminates with exit code 1.
   - Inspect `%APPDATA%\com.setlist.desktop\setlist.log` and verify the log line:
     `[TEST ERROR] Deliberate startup error triggered by SETLIST_TEST_STARTUP_ERROR=1`.
3. Reset variable:
   ```powershell
   $env:SETLIST_TEST_STARTUP_ERROR = $null
   ```

### 2. Library Folder Picker Test
1. Start the app.
2. Navigate to the **Library** view.
3. Observe the input field has placeholder `"Choose folder or paste path..."` (empty by default, no hardcoded `/Music/DJ_Collection`).
4. Click **"Choose Folder"**.
5. Select a music directory in the native folder picker.
6. Verify the selected path populates the input field.
7. Click **"Scan"** to start indexing.

### 3. Native Save Dialog for Setlist Export
1. Add tracks to the active setlist in the **Setlist** view.
2. Click **"Export"**.
3. Verify a native Windows Save File dialog opens with:
   - Default filename `setlist_rekordbox.xml` (or `setlist_playlist.m3u8` if M3U8 is selected).
   - Format filter pre-selected (`*.xml`, `*.m3u8`, `*.csv`, `*.md`).
4. Choose a destination file and click Save.
5. Verify success toast displays with track count and exported file path.
6. Test cancellation: click **"Export"**, then Cancel in the dialog. Verify no file is written and no error toast appears.

### 4. Pinned Tracks Test
1. In the setlist, lock track 1 (Opener) and track N (Closer) using the lock icons.
2. Click **"Suggest Order"**.
3. Verify track 1 remains at position 1 and track N remains at the final position.
