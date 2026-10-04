# r1-title-artist-to-db Store Title and Artist Edits in Database

Status: done
Changed:
- crates/library-db/migrations/0006_title_artist_overrides.sql
- crates/library-db/src/migrate.rs
- crates/library-db/src/lib.rs
- crates/library-db/src/overrides.rs
- crates/library-db/src/repo.rs
- src-tauri/src/overrides.rs
- ui/src/api/overrides.ts
- ui/src/api/overrides.test.ts
- ui/src/store/useAppStore.ts
Added deps: none
Public API:
- `TrackOverridePatch`: added `title: Option<String>` and `artist: Option<String>` in Rust and TypeScript
- `TrackOverrideFlags`: added `title: bool` and `artist: bool` in Rust and TypeScript
- `TrackOverride`: added `title: Option<String>` and `artist: Option<String>` in Rust and TypeScript
- `migrateLocalStorageOverrides(storage?, client?)`: one-time migration helper in `ui/src/api/overrides.ts`
Tests:
- Rust (297 tests passed):
  - `overrides::tests::test_title_and_artist_overrides_round_trip`: verify setting and clearing title/artist overrides, flags reporting, effective values returned from `get_track` and `list_tracks`, and text search matching overridden titles
  - `overrides::tests::test_reanalysis_keeps_title_and_artist_edits`: verify re-analysis preserves custom title and artist edits
  - `overrides::tests::test_overridden_title_and_artist_changes_all_exports`: verify Rekordbox XML, M3U8, CSV set sheet, and Markdown set sheet use effective title and artist, and revert when cleared
  - `tests::test_apply_migrations_in_memory`: verified migration 0006 applies cleanly in SQLite schema
- UI (365 tests passed):
  - `MockOverridesClient Round Trip`: verify client setting, retrieving, and clearing title and artist overrides
  - `migrateLocalStorageOverrides`: verified one-time import with mocked localStorage, removes keys on success
  - `migrateLocalStorageOverrides safe to run twice`: verified idempotency when executed multiple times
  - `migrateLocalStorageOverrides error preservation`: verified partial failures preserve failing entries in localStorage without data loss and log errors
Known gaps: none
Needs from others: none
