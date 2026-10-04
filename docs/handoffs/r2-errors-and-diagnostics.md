# r2-errors-and-diagnostics Friendly Errors, Scan Summary, and System Diagnostics

Status: done
Changed:
- `src-tauri/src/diagnostics.rs` (new): Tauri commands `get_diagnostics` and `open_log_folder`, report formatter, path sanitization
- `src-tauri/src/lib.rs`: Registered `diagnostics` module and IPC command handlers
- `ui/src/utils/errors.ts` (new): Backend error mapping table to plain words with actionable next steps, toast conversion, and details copying
- `ui/src/utils/errors.test.ts` (new): Unit tests for all error categories and copy details behavior
- `ui/src/features/diagnostics/scanSummary.ts` (new): Scan event parser, state reducer, and failed files clipboard formatter
- `ui/src/features/diagnostics/ScanSummaryPanel.tsx` (new): Component presenting analyzed, skipped, and failed metrics, failed files list, and Copy list button
- `ui/src/features/diagnostics/scanSummary.test.tsx` (new): Unit and component integration tests for scan summary logic
- `ui/src/features/diagnostics/diagnosticsClient.ts` (new): Diagnostics IPC client, privacy redaction of external paths, report formatting, clipboard copy
- `ui/src/features/diagnostics/DiagnosticsHelpPanel.tsx` (new): Help panel in Settings displaying version, track count, log/db paths, include external paths checkbox, copy diagnostics, and open log folder actions
- `ui/src/features/diagnostics/diagnostics.test.tsx` (new): Privacy tests ensuring diagnostics reports contain no secrets or audio data, path redaction, and UI panel interaction tests
- `ui/src/features/diagnostics/index.ts` (new): Feature exports
- `ui/src/api/index.ts`: Integrated backend error conversion to toasts (`invokeSafe`, `turnBackendErrorToToast`, `emitBackendErrorToast`, `setBackendToastHandler`) and progress listener hooking for scan summary tracking
- `ui/src/api/index.test.ts`: Integration tests for backend error toast mapping and invocation failure handling
- `ui/src/components/routes/SettingsRoute.tsx`: Mounted `DiagnosticsHelpPanel`

Added deps: none. (Used standard library `std::process::Command` in Rust for opening explorer across Windows, macOS, and Linux without external dependencies).

Public API:
- Rust IPC commands:
  - `diagnostics::get_diagnostics` -> `DiagnosticsInfo { app_version, log_file_path, database_path, track_count, app_data_dir, os, arch }`
  - `diagnostics::open_log_folder` -> opens `resolve_app_data_dir()` in native OS file manager
- TypeScript APIs:
  - `mapBackendError(error: unknown): FriendlyError`
  - `formatFriendlyToast(error: unknown): { type: 'error', message: string, details: string, friendly: FriendlyError }`
  - `copyErrorDetails(error: unknown | FriendlyError): Promise<boolean>`
  - `turnBackendErrorToToast(error: unknown): { type: 'error', message: string, details: string, friendly: FriendlyError }`
  - `emitBackendErrorToast(error: unknown): FriendlyError`
  - `setBackendToastHandler(handler: ToastHandler | null): void`
  - `fetchDiagnostics(): Promise<DiagnosticsInfo>`
  - `openLogFolder(): Promise<void>`
  - `copyDiagnosticsReport(info: DiagnosticsInfo, includePaths: boolean): Promise<boolean>`
  - `formatDiagnosticsReport(info: DiagnosticsInfo, includePaths: boolean): string`
  - `formatFailedFilesText(failedFiles: FailedScanFile[]): string`
  - `copyFailedFilesList(failedFiles: FailedScanFile[]): Promise<boolean>`

Tests:
- `ui/src/utils/errors.test.ts`: Verified exact mapping of all 8 core backend error kinds (decode failure, unsupported format, empty folder, folder not found, not enough tracks, file already exists, export failed, playback failed, database error) to short messages and actionable next steps; verified unknown errors produce generic messages with copy details enabled.
- `ui/src/features/diagnostics/scanSummary.test.tsx`: Verified scanner progress message parsing, accumulated analyzed/skipped/failed metrics, failed file lists with plain reasons, and Copy list button clipboard functionality.
- `ui/src/features/diagnostics/diagnostics.test.tsx`: Verified that diagnostics reports strictly contain no audio data (no waveforms, samples, cue points, beat grids) and redact paths outside the app data folder when `includePaths` is false.
- `ui/src/api/index.test.ts`: Verified backend error conversion to friendly toasts when `tauriBackend` calls fail.
- `src-tauri/src/diagnostics.rs`: Unit tests for `DiagnosticsInfo` serialization, path redaction, and report generation without audio secrets.

Test Results:
- Rust tests: 297 passed (baseline: 294; +3 new diagnostics tests).
- UI tests: 409 passed (baseline: 317; all 34 test suites passing).
- `cargo fmt --check`: passed.
- `cargo clippy --workspace -- -D warnings`: passed.
- `pnpm --dir ui typecheck`: passed.

Known gaps: none.
Needs from others: none.
