# fix-active-setlist-startup-hydration Active Setlist Startup Hydration & Track Re-linking

Status: done

Changed:
- `ui/src/App.tsx`: Added top-level `useEffect` mounting hook to invoke `loadTracks()` and `loadActiveSetlist()` on startup if not yet loaded.
- `ui/src/features/setlist/SetlistView.tsx`: Added mount `useEffect` hook to ensure `loadActiveSetlist(backend)` is triggered if user navigates to the setlist route before initial hydration.
- `ui/src/store/useAppStore.ts`:
  - `loadActiveSetlist`: Automatically fetches track collection if active setlist items exist and tracks have not been loaded, preventing unmapped "Untitled Track" fallback states.
  - `loadTracks`: Re-links track metadata for any existing setlist items that had `entry.track == null`, preventing race condition data loss.
  - `reorderSetlist`: Schedules debounced SQLite persistence after newly calculated adjacent transition advice is computed.
  - `suggestOrder`: Asynchronously computes missing adjacent transitions for reordered/pinned tracks and schedules persistence.
- `ui/src/utils/validation.test.ts`: Added unit test verifying that `loadTracks` properly re-links track metadata for setlist items loaded prior to track library completion.

Added deps: none

Public API: no breaking changes; leverages existing `loadActiveSetlist` and `loadTracks` APIs.

Tests:
- Unit tests: `ui/src/utils/validation.test.ts` verifying setlist hydration, debounce timing, and track re-linking.
- All workspace checks passing:
  - `cargo test --workspace` (all 180+ tests pass)
  - `cargo clippy --workspace -- -D warnings` (clean)
  - `cargo fmt --check` (clean)
  - `pnpm --dir ui typecheck` (clean)
  - `pnpm --dir ui test --run` (24 test files, 286 tests pass)

Known gaps: none

Needs from others: none
