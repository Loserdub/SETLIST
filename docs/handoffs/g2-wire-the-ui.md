# g2-wire-the-ui Wire the UI to Tauri Backend
Status: done
Changed:
- `ui/src/api/index.ts`
- `ui/src/api/index.test.ts`
- `ui/src/store/useAppStore.ts`
- `ui/src/components/ToastContainer.tsx`
- `ui/src/components/ToastContainer.test.tsx`
- `ui/src/App.tsx`
- `ui/src/features/library/LibraryView.tsx`
- `ui/src/features/library/firstLaunch.test.tsx`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/components/routes/SettingsRoute.tsx`
Added deps: none
Public API:
- `export const tauriBackend: Backend` (implements `ping`, `scanFolder`, `listTracks`, `getTrack`, `suggestOrder`, `getAdvice`, `exportSet`, `subscribeProgress`, `onProgress` over Tauri IPC and progress events)
- `export let USE_MOCK_BACKEND = false` (defaulted to native Tauri backend; toggleable via `setUseMockBackend`)
- `export interface Toast`: `{ id: string; type: 'error' | 'success' | 'info'; message: string; details?: string }`
- Store actions: `addToast`, `removeToast`, `hasLoadedTracks`
Tests:
- `ui/src/api/index.test.ts`: Unit tests verifying `tauriBackend` invokes commands (`ping`, `scan_folder`, `list_tracks`, `get_track`, `suggest_order`, `get_advice`, `export_set`) with correct camelCase mapping, subscribes to progress events, and unlistens cleanly. Verifies `USE_MOCK_BACKEND` default is `false`.
- `ui/src/components/ToastContainer.test.tsx`: Tests rendering of error, success, and info toasts, manual dismissal, and timeout auto-dismissal.
- `ui/src/features/library/firstLaunch.test.tsx`: Tests rich first-launch onboarding empty state, scanning folder triggers, demo library mode button, and loading spinner during scanning.
- Ran `pnpm --dir ui test`: 120 tests passed across 11 test suites.
- Ran `pnpm --dir ui typecheck`: 0 errors.
- Ran `pnpm --dir ui build`: production bundle built successfully.
- Ran `cargo test --workspace`: all 151 workspace tests passed.
- Ran `cargo clippy --workspace -- -D warnings`: passed with 0 warnings.
- Ran `cargo fmt --check`: passed with no formatting differences.
Known gaps:
- None for v1.
Needs from others:
- None. Full end-to-end scanning, library listing, setlist sequencing, and export pipeline is wired.
