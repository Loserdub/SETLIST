# w2-domain-persistence Domain and Persistence Foundation

Status: done

Changed:
- `DOMAIN_AND_PERSISTENCE_AUDIT.md`: Complete architectural audit of models, persistence, failure modes, and migration strategy.
- `crates/core-types/src/lib.rs`: Exposed `error` and `validation` modules.
- `crates/core-types/src/types.rs`: Added normalized domain models (`Song`, `Transition`, `SetlistItemType`, `SetlistItem`, updated `Setlist` with `items: Vec<SetlistItem>`), bidirectional conversions (`From<&Track> for Song`, `From<&SetlistEntry> for SetlistItem`, `From<&SetlistItem> for SetlistEntry`).
- `crates/core-types/src/validation.rs`: Strict domain validation for duration, BPM, energy rating, capo, key notation, mode, tuning, Song, and Setlist sequence contiguity.
- `crates/core-types/src/error.rs`: Structured `AppError` and `ValidationError` implementing `thiserror`, `serde::Serialize/Deserialize`, and `ts-rs::TS`.
- `crates/library-db/migrations/0004_domain_and_setlist_items.sql`: SQLite WAL migration introducing `songs`, `setlist_items`, `active_setlist` tables and backfilling from legacy tables with foreign keys and indices.
- `crates/library-db/src/migrate.rs`: Registered migration 4 with schema version bumping to 4.
- `crates/library-db/src/setlist.rs`: Re-exported normalized domain models from `core-types`.
- `crates/library-db/src/repo.rs`: Implemented atomic operations for songs (`upsert_song`, `get_song`, `list_songs`, `delete_song`), setlists (`save_setlist`, `load_setlist`, `list_setlists`, `delete_setlist`), active setlist tracking (`get_active_setlist`, `save_active_setlist`, `set_active_setlist_id`), and collision-safe fine-grained mutations (`add_setlist_item`, `remove_setlist_item`, `move_setlist_item`, `update_setlist_item`).
- `src-tauri/src/commands.rs`: Replaced `.unwrap()` in `suggest_order_core` with safe `filter_map`; introduced `map_db_error` mapping `DbError` into structured `AppError`; implemented and exported 15 Tauri commands for songs, setlists, and items.
- `src-tauri/src/lib.rs`: Registered all 15 commands in `tauri::generate_handler!`.
- `src-tauri/tests/domain_and_persistence_test.rs`: Integration tests for domain validation rejections and persistence across simulated restarts.
- `ui/src/bindings/*`: Auto-generated TypeScript definitions (`Song.ts`, `Setlist.ts`, `SetlistItem.ts`, `SetlistItemType.ts`, `Transition.ts`, `AppError.ts`, `ValidationError.ts`).
- `ui/src/utils/validation.ts`: Matching TypeScript validation mirroring Rust domain rules.
- `ui/src/utils/validation.test.ts`: 24 unit tests verifying domain validation, performance block conversions, and debounced store persistence.
- `ui/src/api/index.ts`: Extended `Backend` interface with all 15 domain methods; implemented conversions (`trackToSong`, `entryToSetlistItem`, `setlistItemToEntry`); implemented `tauriBackend` and `mockBackend` with validation.
- `ui/src/store/useAppStore.ts`: Hydrates active setlist on startup via `loadActiveSetlist`; executes 300ms debounced persistence on mutations (`addToSetlist`, `removeFromSetlist`, `reorderSetlist`, `clearSetlist`, `loadSetlist`, `suggestOrder`, `setEnergyProfile`, `setSetlistName`).

Added deps: none (leveraged existing `rusqlite`, `thiserror`, `serde`, `ts-rs`).

Public API:
- `core_types::Song`: Strongly typed song entity for performance and acoustics.
- `core_types::SetlistItem` & `core_types::SetlistItemType`: Flexible performance items (Song, Banter, Intermission, TuningChange, Custom).
- `core_types::Setlist`: Complete setlist document with `items: Vec<SetlistItem>`.
- `core_types::Transition`: Persistent transition score and parameters.
- `core_types::AppError` & `core_types::ValidationError`: Typed application errors replacing arbitrary strings.
- `core_types::validation::*`: Rust domain validators (`validate_song`, `validate_setlist`, `validate_bpm`, `validate_duration_seconds`, etc.).
- `library_db::repo::*`: CRUD and fine-grained mutation operations for songs, setlists, and active setlist in SQLite WAL.
- Tauri IPC Commands: `validate_song_input`, `upsert_song`, `get_song`, `list_songs`, `delete_song`, `get_active_setlist`, `save_active_setlist`, `load_setlist`, `list_setlists`, `save_setlist`, `delete_setlist`, `add_setlist_item`, `remove_setlist_item`, `move_setlist_item`, `update_setlist_item`.
- `Backend` (TypeScript): Frontend methods matching backend commands and mock implementations.
- `ui/src/utils/validation.ts`: TypeScript validation functions matching Rust rules.

Tests:
- `crates/core-types`: Unit tests for BPM range, duration non-negativity, energy 1-10, capo 0-24, key/Camelot notation, mode, tuning, and setlist sequence contiguity.
- `crates/library-db`: Roundtrip tests for songs, flexible setlist items, fine-grained additions, removals, reorderings, and active setlist persistence.
- `src-tauri`: Integration test suite `tests/domain_and_persistence_test.rs` validating malformed song rejection, malformed setlist rejection, and active setlist persistence across simulated app restarts.
- `ui`: 24 unit tests in `src/utils/validation.test.ts` covering domain validation, model conversions, non-song block representation, and debounced store persistence.
- All workspace checks passing:
  - `cargo test --workspace` (52 core-types + 12 exporters + 17 library-db + 28 sequencer + 48 audio-analysis + 7 validate + 14 app = 178 Rust tests pass)
  - `cargo clippy --workspace -- -D warnings` (clean)
  - `cargo fmt --check` (clean)
  - `pnpm --dir ui typecheck` (clean)
  - `pnpm --dir ui test --run` (17 test files, 184 tests pass)
  - `pnpm --dir ui build` (production build succeeds)

Known gaps:
- None. Full backward compatibility with existing library tables (`tracks`, `analyses`, `cues`, `setlist_entries`) is preserved.

Needs from others:
- Harmonic/stage feature workgroups can now build on top of `SetlistItem` variants (Banter, Intermission, TuningChange, Custom) and atomic SQLite setlist mutations.
