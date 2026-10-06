# fix-release-binary-db-and-window-scaling
Status: done
Changed: 
- `scripts/rebuild.ps1`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`
- `crates/library-db/src/lib.rs`
- `ui/src/store/useAppStore.ts`
- `ui/src/components/Sidebar.tsx`
- `ui/src/components/routes/SettingsRoute.tsx`
- `ui/src/features/library/EmptyLibraryView.tsx`
- `ui/src/features/library/LibraryView.tsx`
- `ui/src/features/library/LibraryView.test.tsx`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/features/start/StartScreen.tsx`
- `ui/src/features/track/TrackView.tsx`
Added deps: none
Public API: none changed
Tests: 
- `cargo test -p library-db` passed (27 tests, including `test_real_db_if_present` verifying 587 tracks from SQLite DB).
- `pnpm --dir ui test` passed (495 tests across 46 test suites).
- `pnpm --dir ui typecheck` passed with 0 errors.
Known gaps: none
Needs from others: none
