# opt-1-batch-list-tracks Batch Loading for Tracks and Overrides

Status: done
Changed:
- `crates/library-db/src/repo.rs`: Replaced iterative $1 + 6N$ query loop in `list_tracks` and `list_tracks_with_overrides` with batch chunking (`chunks(500)`) and joined overrides. Added pure helper functions `parse_segment_label`, `parse_cue_kind`, `parse_analysis_blobs`, and `assemble_track_analysis`.
- `crates/library-db/src/lib.rs`: Added `test_list_tracks_batching_efficiency` to test batch-loaded track integrity, override applications, and flag accuracy.
Added deps: none
Public API: signatures other agents may call:
- `pub fn list_tracks(conn: &rusqlite::Connection, filter: &TrackFilter) -> Result<Vec<Track>, DbError>` (preserved signature, now executes in batch)
- `pub fn list_tracks_with_overrides(conn: &rusqlite::Connection, filter: &TrackFilter) -> Result<Vec<TrackWithOverrides>, DbError>` (preserved signature, now executes in batch)
Tests:
- `crates/library-db/src/lib.rs::tests::test_list_tracks_batching_efficiency`: Validates batch-loading across 10 fully analyzed tracks, testing overrides on individual fields, full restoration of segments, cues, energy curve, and 3-band waveforms.
- All 26 library-db tests pass.
- Full workspace: 295 Rust tests pass, 484 UI tests pass, clippy and fmt clean, typecheck clean.
Known gaps: none
Needs from others: none
