# C1 SQLite Access Patterns

Status: done
Changed:
- `crates/library-db/migrations/0007_indexing_and_catalog_revision.sql`
- `crates/library-db/src/migrate.rs`
- `crates/library-db/src/repo.rs`
- `crates/library-db/src/lib.rs`

Added deps: none

Public API:
- `open_connection<P: AsRef<Path>>(path: P) -> Result<Connection, DbError>`: Centralized connection opener applying PRAGMA journal_mode=WAL, synchronous=NORMAL, busy_timeout=5000, foreign_keys=ON, cache_size=-64000.
- `open_read_only_connection<P: AsRef<Path>>(path: P) -> Result<Connection, DbError>`: Dedicated read-only SQLite connection opener for long-running compute operations without locking the write connection mutex.
- `get_catalog_revision(conn: &Connection) -> Result<u64, DbError>`: Monotonic counter for track/analysis/override mutations.
- `bump_catalog_revision(conn: &Connection) -> Result<u64, DbError>`: Atomically increments catalog revision.
- `list_song_summaries(conn: &Connection) -> Result<Vec<Song>, DbError>`: Lightweight listing omitting heavy blobs (waveform, per-bar energy, segments) for graph and virtual table operations.
- `check_library_availability(conn: &Connection) -> Result<usize, DbError>`: Verifies track paths on filesystem, marking unavailable without deleting analysis.

Index Manifest (Migration 0007):
1. `idx_songs_artist_title_nocase ON songs(artist COLLATE NOCASE, title COLLATE NOCASE)`: Serves library search and alphabetical sorting.
2. `idx_songs_bpm ON songs(bpm)`: Serves tempo filter and range queries.
3. `idx_songs_camelot ON songs(camelot_code)`: Serves harmonic filtering.
4. `idx_songs_energy ON songs(energy_rating)`: Serves energy slider and curve queries.
5. `idx_tracks_bpm ON tracks(bpm)`: Serves track table tempo sorting.
6. `idx_tracks_camelot ON tracks(camelot_number, camelot_letter)`: Serves track harmonic compatibility queries.
7. `idx_tracks_energy ON tracks(energy_score)`: Serves track energy queries.
8. `idx_tracks_artist_title_nocase ON tracks(artist COLLATE NOCASE, title COLLATE NOCASE)`: Serves track metadata searches.

Tests:
- All 31 library-db unit tests pass, verifying migrations apply cleanly in memory and on disk.
- Tested `list_song_summaries` vs `list_songs`.
- Tested `catalog_revision` incrementing on inserts/overrides.

Known gaps: None.
Needs from others: G1 will use `open_read_only_connection` and `get_catalog_revision` for caching the ScoreMatrix.
