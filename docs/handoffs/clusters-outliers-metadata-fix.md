# clusters-outliers-metadata-fix Catalog Outliers Card Display & Metadata Resolution Fix
Status: done
Changed:
- `ui/src/features/discovery/CatalogClustersView.tsx`
- `ui/src/features/discovery/CatalogClustersView.test.tsx`
- `crates/core-types/src/types.rs`
- `crates/library-db/src/repo.rs`
- `crates/library-db/src/lib.rs`
- `src-tauri/src/commands.rs`
- `crates/sequencer/src/relationship.rs`
Added deps: none
Public API:
- `Song::from(&Track)`: now extracts clean fallback title and artist from path file stem when ID3/container tags are absent or "Unknown Title"/"Unknown Artist".
- `library_db::list_songs`: now extracts filename stem fallback via `t.path` when songs table titles/artists are unpopulated or default placeholders.
- `load_catalog_songs`: hydrates catalog songs loaded from SQLite with track table analysis (BPM, Camelot code, musical key, energy score) and clean title/artist metadata.
- `CatalogClustersView`: resolves title, artist, Camelot key badge, BPM, and energy rating using matched `fullSong` domain model whenever outlier fields are missing or unanalyzed.
Tests:
- `CatalogClustersView.test.tsx`: verifies outlier cards fall back to `fullSong` metadata when outlier title/artist/bpm/key are unknown or missing.
- `types::tests::test_track_to_song_with_explicit_tags`: tests tag preservation.
- `types::tests::test_track_to_song_fallback_filename_stem`: tests filename stem extraction.
- `types::tests::test_track_to_song_fallback_artist_dash_title`: tests "Artist - Title" filename parsing.
- `library-db::tests::test_list_songs_resolves_filename_when_tags_unknown`: tests SQL `list_songs` resolving filename when ID3 tags are missing or default.
- Rust tests: 301 passed (0 failed).
- UI tests: 387 passed across 32 test files (0 failed).
- `cargo fmt --check`, `cargo clippy --workspace -- -D warnings`, and `pnpm --dir ui typecheck` passing with zero warnings or errors.
Known gaps: none
Needs from others: none
