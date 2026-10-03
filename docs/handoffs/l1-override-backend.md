# l1-override-backend Track Analysis Overrides

Status: done

## Changed
- `crates/library-db/migrations/0005_track_overrides.sql`: Added `track_overrides` table with nullable fields (`bpm`, `first_downbeat_ms`, `key_camelot`, `cues_json`, `updated_at`) and foreign key referencing `tracks(id) ON DELETE CASCADE`.
- `crates/library-db/Cargo.toml`: Added `serde` with `derive` feature for JSON cue serialization and override patch/flag models.
- `crates/library-db/src/migrate.rs`: Registered migration `0005_track_overrides.sql`.
- `crates/library-db/src/overrides.rs`: Implemented override mutations, flag calculation, effective value application, and deterministic beat grid reconstruction.
- `crates/library-db/src/repo.rs`: Updated `get_track` and `list_tracks` to apply effective overrides; added `get_track_with_overrides` and `list_tracks_with_overrides`. Added `pub use upsert_track as insert_track;` compatibility re-export.
- `crates/library-db/src/lib.rs`: Re-exported override structs and helper functions; updated migration assertion count to 5.
- `src-tauri/src/overrides.rs`: Added Tauri commands (`set_track_override`, `clear_track_override`, `get_track_override`, `get_track_override_flags`) and core helpers with comprehensive integration tests for cost matrix recalculation and Rekordbox XML export.
- `src-tauri/src/commands.rs`: Updated `get_track` to return `TrackWithOverrides` with per-field override flags.
- `src-tauri/src/lib.rs`: Registered `pub mod overrides;` and commands in `generate_handler!`.

## Added deps
- `crates/library-db`: `serde = { version = "1.0", features = ["derive"] }` for serialization of override payloads, cue point lists, and override flag structures.

## Public API

### `library-db` (`crates/library-db`)
```rust
pub struct TrackOverridePatch {
    pub bpm: Option<f64>,
    pub first_downbeat_ms: Option<f64>,
    pub key_camelot: Option<String>,
    pub cues: Option<Vec<CuePoint>>,
}

pub struct TrackOverride {
    pub track_id: String,
    pub bpm: Option<f64>,
    pub first_downbeat_ms: Option<f64>,
    pub key_camelot: Option<String>,
    pub cues_json: Option<String>,
    pub updated_at: Option<String>,
}

pub struct TrackOverrideFlags {
    pub bpm: bool,
    pub first_downbeat_ms: bool,
    pub key_camelot: bool,
    pub cues: bool,
}

pub struct TrackWithOverrides {
    pub track: Track,
    pub overrides: TrackOverrideFlags,
}

pub fn set_override(conn: &Connection, track_id: &str, patch: &TrackOverridePatch) -> Result<(), LibraryError>;
pub fn clear_override(conn: &Connection, track_id: &str, fields: &[String]) -> Result<(), LibraryError>;
pub fn get_override(conn: &Connection, track_id: &str) -> Result<Option<TrackOverride>, LibraryError>;
pub fn get_override_flags(conn: &Connection, track_id: &str) -> Result<TrackOverrideFlags, LibraryError>;
pub fn rebuild_beat_grid(duration_ms: f64, bpm: f64, first_downbeat_ms: f64) -> BeatGrid;
pub fn apply_overrides_to_track(track: &mut Track, ov: &TrackOverride);
pub fn get_track(conn: &Connection, id: &str) -> Result<Option<Track>, LibraryError>;
pub fn list_tracks(conn: &Connection, filter: &TrackFilter) -> Result<Vec<Track>, LibraryError>;
pub fn get_track_with_overrides(conn: &Connection, id: &str) -> Result<Option<TrackWithOverrides>, LibraryError>;
pub fn list_tracks_with_overrides(conn: &Connection, filter: &TrackFilter) -> Result<Vec<TrackWithOverrides>, LibraryError>;
```

### Tauri Commands (`src-tauri`)
```rust
#[tauri::command]
pub async fn set_track_override(
    state: State<'_, AppState>,
    track_id: Option<String>,
    id: Option<String>,
    patch: TrackOverridePatch,
) -> Result<(), String>;

#[tauri::command]
pub async fn clear_track_override(
    state: State<'_, AppState>,
    track_id: Option<String>,
    id: Option<String>,
    fields: Vec<String>,
) -> Result<(), String>;

#[tauri::command]
pub async fn get_track_override(
    state: State<'_, AppState>,
    track_id: Option<String>,
    id: Option<String>,
) -> Result<Option<TrackOverride>, String>;

#[tauri::command]
pub async fn get_track_override_flags(
    state: State<'_, AppState>,
    track_id: Option<String>,
    id: Option<String>,
) -> Result<TrackOverrideFlags, String>;

#[tauri::command]
pub fn get_track(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<TrackWithOverrides>, String>;
```

## Tests
- `crates/library-db/src/overrides.rs`:
  - `test_round_trip`: Verifies inserting and reading back partial and complete override records.
  - `test_merge`: Confirms effective value merging on `Track` without losing unchanged analyzed fields.
  - `test_grid_rebuild`: Tests constant beat grid recalculation from overridden BPM and first downbeat, backward grid extension to time >= 0, and 4/4 downbeat alignment.
  - `test_reanalysis_keeps_overrides`: Simulates re-analyzing a track and verifies that the `track_overrides` record remains intact and continues to take precedence.
  - `test_cascade_delete`: Ensures that deleting a track removes corresponding rows in `track_overrides`.
- `src-tauri/src/overrides.rs`:
  - `test_overridden_bpm_changes_sequencer_cost_matrix`: Verifies that an override on BPM directly modifies the transition costs computed by `CostMatrix` without any code changes in `sequencer`.
  - `test_overridden_bpm_changes_rekordbox_export`: Verifies that Rekordbox XML export reflects the overridden BPM without any code changes in `exporters`.
  - `test_set_and_clear_override_helpers`: Confirms setting and selectively clearing individual override fields.

## Known gaps
- None.

## Needs from others
- Frontend (Workgroup F) can now invoke `set_track_override` and `clear_track_override`, and use `track.overrides.{bpm, first_downbeat_ms, key_camelot, cues}` returned by `get_track` to display badges or indicators for corrected values.
