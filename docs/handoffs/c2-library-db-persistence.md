# C2 SQLite Repository
Status: done
Changed:
- crates/library-db/Cargo.toml
- crates/library-db/migrations/0002_analysis_extensions.sql
- crates/library-db/src/lib.rs
- crates/library-db/src/blob.rs
- crates/library-db/src/error.rs
- crates/library-db/src/filter.rs
- crates/library-db/src/migrate.rs
- crates/library-db/src/repo.rs
- crates/library-db/src/setlist.rs

Added deps:
- `serde_json = "1.0"` in `library-db` (serialization and deserialization of beats timestamps, downbeat flags, BPM alternates, dynamics curves, and transition notes)
- `uuid = { version = "1", features = ["v4"] }` in `library-db` (generation of unique track and setlist UUIDs)

Public API:
- `library_db`:
  - `pub fn apply_migrations(conn: &rusqlite::Connection) -> Result<(), DbError>`
  - `pub fn get_schema_version(conn: &rusqlite::Connection) -> Result<i64, DbError>`
  - `pub fn upsert_track(conn: &rusqlite::Connection, track: &Track) -> Result<String, DbError>`
  - `pub fn save_analysis(conn: &rusqlite::Connection, track_id: &str, analysis: &TrackAnalysis, analysis_version: &str) -> Result<(), DbError>`
  - `pub fn replace_cues(conn: &rusqlite::Connection, track_id: &str, cues: &[CuePoint]) -> Result<(), DbError>`
  - `pub fn get_track(conn: &rusqlite::Connection, id: &str) -> Result<Option<Track>, DbError>`
  - `pub fn list_tracks(conn: &rusqlite::Connection, filter: &TrackFilter) -> Result<Vec<Track>, DbError>`
  - `pub fn delete_track(conn: &rusqlite::Connection, id: &str) -> Result<bool, DbError>`
  - `pub fn save_setlist(conn: &rusqlite::Connection, setlist: &Setlist) -> Result<(), DbError>`
  - `pub fn load_setlist(conn: &rusqlite::Connection, id: &str) -> Result<Option<Setlist>, DbError>`
  - `pub fn encode_f32_blob(values: &[f32]) -> Vec<u8>`
  - `pub fn decode_f32_blob(bytes: &[u8]) -> Vec<f32>`
  - `pub fn encode_waveform_band(band: &WaveformBand) -> (&[u8], &[u8])`
  - `pub fn decode_waveform_band(peak: Vec<u8>, rms: Vec<u8>) -> WaveformBand`
  - `pub struct TrackFilter`: `new`, `with_bpm_range`, `with_camelot_keys`, `with_energy_range`, `with_text_search`
  - `pub struct Setlist`: `new`, public fields `id`, `name`, `energy_profile`, `entries`, `created_at`, `updated_at`
  - `pub enum DbError`: `Sqlite`, `Migration`, `Json`, `TrackNotFound`, `SetlistNotFound`, `DataIntegrity`

Tests:
- `test_apply_migrations_in_memory`: applies `0001_init.sql` and `0002_analysis_extensions.sql`, tracks schema version with `PRAGMA user_version` (returns 2), ensures idempotency on repeated calls, and verifies CHECK constraints.
- `test_f32_blob_roundtrip`: verifies little-endian encoding and decoding for floating-point energy curve arrays.
- `test_waveform_band_helpers`: verifies zero-copy byte extraction and reconstruction of waveform band peak and RMS byte vectors.
- `test_roundtrip_full_track_analysis`: stores and retrieves a complete `TrackAnalysis`, validating all subfields (loudness, rhythm grid, downbeats, alternates, key, tuning cents, dynamics curves, energy score, per-bar energy curve, 6 segments, 8 cue points A-H, and 3-band waveform BLOBs).
- `test_reimport_moved_file_keeps_analysis`: verifies that re-importing a moved file matching an existing content hash updates its path while preserving its existing track ID and all analysis data.
- `test_filter_queries`: verifies querying tracks by BPM range, Camelot keys (single or multiple), energy range, substring text search on artist/title/album, and combined filters.
- `test_cascade_delete`: verifies that deleting a track from `tracks` automatically cascades deletion across `structural_segments`, `cue_points`, and `analysis_blobs` via foreign keys.
- `test_replace_cues`: verifies atomic replacement of cue points for an existing track.
- `test_setlist_roundtrip`: saves and retrieves a setlist with ordered entries, target energy, transition advice, and resolved track details.

Known gaps:
- None for v1 classical DSP library database persistence.

Needs from others:
- Workgroup Integration (Tauri) and Workgroup C scanner to use `library_db` for library population and setlist retrieval.
