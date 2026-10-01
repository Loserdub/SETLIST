# 002-contracts-v1 Fixed Contracts and Shared Types
Status: done
Changed:
- .cargo/config.toml
- crates/core-types/Cargo.toml
- crates/core-types/src/lib.rs
- crates/core-types/src/camelot.rs
- crates/core-types/src/types.rs
- crates/audio-analysis/Cargo.toml
- crates/audio-analysis/src/lib.rs
- crates/audio-analysis/src/rhythm/mod.rs
- crates/audio-analysis/src/tonal/mod.rs
- crates/audio-analysis/src/dynamics/mod.rs
- crates/audio-analysis/src/structure/mod.rs
- crates/audio-analysis/src/waveform/mod.rs
- crates/audio-io/Cargo.toml
- crates/audio-io/src/lib.rs
- crates/sequencer/Cargo.toml
- crates/sequencer/src/lib.rs
- crates/exporters/Cargo.toml
- crates/exporters/src/lib.rs
- crates/library-db/Cargo.toml
- crates/library-db/src/lib.rs
- crates/library-db/migrations/0001_init.sql
- ui/src/bindings/*.ts (27 generated TypeScript contract definitions)

Added deps:
- `ts-rs` v12 with `serde-compat` in `core-types` (TypeScript binding generation)
- `serde` and `serde_json` in `core-types` (serialization for all domain types)
- `thiserror` v2 in `core-types`, `audio-analysis`, `audio-io`, `sequencer`, `exporters`, `library-db` (standard error types)
- `rusqlite` v0.40 with `bundled` in `library-db` (embedded SQLite database and migration execution)

Public API:
- `core_types`:
  - `Camelot`: `new`, `from_key`, `to_standard_name`, `shift_by_semitones`, `distance`
  - `AudioBuffer`, `LoudnessInfo`, `TrackTags`, `DecodedAudio`
  - `BeatGrid`, `RhythmAnalysis`, `RhythmConfig`
  - `Key`, `Mode`, `CamelotLetter`
  - `DynamicsAnalysis`, `EnergyCurve`
  - `Segment`, `SegmentLabel`
  - `CuePoint`, `CueKind`
  - `WaveformBand`, `Waveform3Band`
  - `TrackAnalysis`, `Track`
  - `CostWeights`, `EnergyProfile`, `TransitionType`, `TransitionAdvice`, `SetlistEntry`, `ExportTarget`
- `audio_analysis`:
  - `rhythm::analyze_rhythm(&AudioBuffer, &RhythmConfig) -> Result<RhythmAnalysis, AnalysisError>`
  - `tonal::analyze_key(&AudioBuffer) -> Result<Key, AnalysisError>`
  - `dynamics::analyze_dynamics(&AudioBuffer) -> Result<DynamicsAnalysis, AnalysisError>`
  - `dynamics::energy_score(&DynamicsAnalysis, &BeatGrid) -> Result<u8, AnalysisError>`
  - `dynamics::energy_curve(&DynamicsAnalysis, &BeatGrid) -> Result<EnergyCurve, AnalysisError>`
  - `structure::segment(&AudioBuffer, &BeatGrid, &EnergyCurve) -> Result<Vec<Segment>, AnalysisError>`
  - `structure::place_cues(&[Segment], &BeatGrid) -> Result<Vec<CuePoint>, AnalysisError>`
  - `waveform::compute_waveform(&AudioBuffer) -> Result<Waveform3Band, AnalysisError>`
- `audio_io`:
  - `decode_file<P: AsRef<Path>>(path: P) -> Result<DecodedAudio, AudioIoError>`
- `sequencer`:
  - `evaluate_transition_cost(&TrackAnalysis, &TrackAnalysis, &CostWeights) -> Result<f32, SequencerError>`
  - `advise_transition(&TrackAnalysis, &TrackAnalysis) -> Result<TransitionAdvice, SequencerError>`
  - `sequence_tracks(&[Track], EnergyProfile, &CostWeights) -> Result<Vec<SetlistEntry>, SequencerError>`
- `exporters`:
  - `export_rekordbox_xml(&[SetlistEntry], P) -> Result<(), ExportError>`
  - `export_m3u8(&[SetlistEntry], P) -> Result<(), ExportError>`
  - `export_set_sheet_csv(&[SetlistEntry], P) -> Result<(), ExportError>`
  - `export_set_sheet_markdown(&[SetlistEntry], P) -> Result<(), ExportError>`
- `library_db`:
  - `apply_migrations(&rusqlite::Connection) -> Result<(), DbError>`

Tests:
- Every row of AGENTS.md Table 6.1 tested in `camelot::tests::test_table_6_1_all_rows`
- Shift math tested in `camelot::tests::test_shift_math_6_1` (+2 whole step, +7 half step, +6 tritone, negative shifts, circular wrap-around)
- Distance calculation tested in `camelot::tests::test_distance` (same key, mode flip, fifth, tritone, circle wrap)
- Parse and display tested in `camelot::tests::test_display_and_parse`
- All 27 ts-rs export tests verify automatic generation into `ui/src/bindings/`
- All crate stub signatures tested asserting `NotImplemented` errors
- In-memory SQLite migration test in `library_db` validating schema, beat grid columns, and segment label CHECK constraints including 'buildup'

Known gaps:
- None for the contracts definition phase; function bodies return `NotImplemented` ready for downstream workgroups

Needs from others:
- Downstream workgroups (A, B, C, D, E, F) implement logic satisfying these fixed contracts
