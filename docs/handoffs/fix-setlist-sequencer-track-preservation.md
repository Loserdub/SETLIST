# fix-setlist-sequencer-track-preservation Setlist Sequencing Track Preservation Bugfix
Status: done
Changed:
- `src-tauri/src/commands.rs`
- `src-tauri/tests/suggest_order_regression_test.rs`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/api/index.ts`
- `ui/src/api/index.test.ts`
- `ui/src/features/setlist/SetlistView.test.tsx`
Added deps:
- None
Public API:
- `app_lib::commands::suggest_order_core`: Updated contract to guarantee that every track supplied in `track_ids` is preserved in the output setlist. Analyzed tracks are sequenced, unanalyzed tracks are merged deterministically at the end, 1-based positions are contiguous 1..N, transitions are computed between adjacent tracks where both have analysis (None otherwise), and target energy is computed from profile and final position.
Tests:
- Rust regression test suite (`src-tauri/tests/suggest_order_regression_test.rs`):
  - `test_regression_4_tracks_3_analyzed_1_unanalyzed`: Verifies that 3 analyzed tracks are sequenced, 1 unanalyzed track is preserved and merged at position 4, positions are 1..4, transitions between analyzed tracks exist, transition into unanalyzed is None, and target energy matches final positions.
  - `test_regression_4_tracks_1_analyzed_3_unanalyzed`: Verifies that 1 analyzed track is at position 1, 3 unanalyzed tracks are preserved at positions 2..4 in original relative order, transitions are all None, and target energy corresponds to final positions.
  - `test_regression_all_tracks_unanalyzed`: Verifies Requirement 13 (returns original order with all tracks intact, positions 1..N, transitions None, target energy by position).
  - `test_regression_all_tracks_analyzed`: Verifies that when all tracks are analyzed, all are sequenced, transitions computed for all adjacent pairs, and positions contiguous 1..N.
  - `test_regression_duplicate_ids_are_never_introduced`: Verifies that duplicate input IDs are deduplicated preserving uniqueness, no duplicate IDs in output.
- TypeScript regression tests:
  - `ui/src/api/index.test.ts`: Added unit tests for mockBackend covering 3-analyzed + 1-unanalyzed, 1-analyzed + 3-unanalyzed, all-unanalyzed, and target energy calculation.
  - `ui/src/features/setlist/SetlistView.test.tsx`: Added integration test verifying that unanalyzed tracks in the UI setlist are never dropped when "Suggest Order" is clicked.
Known gaps:
- None
Needs from others:
- None
