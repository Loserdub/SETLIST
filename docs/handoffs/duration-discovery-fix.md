# duration-discovery-fix Fix Setlist Generation by Duration Empty Suggestions
Status: done
Changed:
- `crates/sequencer/src/relationship.rs`
- `crates/library-db/src/repo.rs`
- `crates/library-db/src/lib.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `ui/src/api/index.ts`
- `ui/src/store/useAppStore.ts`
- `ui/src/features/track/TrackView.tsx`
- `ui/src/features/track/TrackView.test.tsx`
- `ui/src/features/stage/components/TimelineVisualizer.tsx`
- `ui/src/components/icons/Icons.tsx`
- `ui/src/components/icons/index.ts`
- `ui/src/utils/trackDisplay.ts`
- `ui/src/utils/trackDisplay.test.ts`
Added deps: none
Public API:
- `CatalogGraph::find_candidate_paths(&self, constraints: &DiscoveryConstraints) -> Vec<DiscoveryCandidatePath>`: now accumulates track duration against `target_duration_minutes`, respects `duration_tolerance_minutes` window, and maintains high-scoring fallback paths to prevent empty suggestion lists on smaller/moderate catalogs.
- `load_catalog_songs(conn: &Connection) -> Result<Vec<Song>, CommandError>`: resiliently queries `list_songs` with fallback conversion from `list_tracks_with_overrides`.
- `mockBackend.exploreCandidatePaths(constraints: DiscoveryConstraints) -> Promise<DiscoveryCandidatePath[]>`: mirrored duration accumulation, tolerance window, and fallback path retention.
Tests:
- `relationship::tests::test_candidate_path_duration_awareness`: tests target duration matching.
- `relationship::tests::test_candidate_path_small_catalog_large_duration`: tests small catalog with large target duration returns non-empty fallback paths.
- `relationship::tests::test_candidate_path_duration_tolerance_completion`: tests early completion on target duration minus tolerance.
- `library-db::tests::test_upsert_track_persists_to_songs_table`: tests upsert track and save analysis properly persist to `songs` table with BPM, key, camelot code, and energy rating.
- Rust tests: 297 passed (0 failed).
- UI tests: 386 passed across 31 test files (0 failed).
- `cargo fmt --check`, `cargo clippy --workspace -- -D warnings`, and `pnpm --dir ui typecheck` passing with zero warnings or errors.
Known gaps: none
Needs from others: none
