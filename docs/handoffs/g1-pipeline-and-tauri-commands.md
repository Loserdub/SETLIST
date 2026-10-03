# g1-pipeline-and-tauri-commands Connect Audio Engines to Tauri Desktop App
Status: done
Changed:
- crates/audio-analysis/Cargo.toml
- crates/audio-analysis/src/lib.rs
- crates/audio-analysis/src/pipeline.rs
- src-tauri/Cargo.toml
- src-tauri/src/commands.rs
- src-tauri/src/lib.rs
- src-tauri/src/state.rs
- src-tauri/tests/integration_test.rs
- docs/handoffs/g1-pipeline-and-tauri-commands.md

Added deps:
- `audio-io = { path = "../audio-io" }` in `audio-analysis` (decodes audio files to `DecodedAudio` for scanner `Analyzer` implementation)
- `library-db = { path = "../library-db" }` in `audio-analysis` (implements `library_db::scan::Analyzer` trait)
- `rayon = "1.10"` in `audio-analysis` (runs independent DSP analysis stages in parallel)
- `hound = "3.5"` in `audio-analysis` dev-dependencies (generates synthetic PCM WAV audio for unit tests)
- `tempfile = "3"` in `audio-analysis` dev-dependencies (provides temporary directories for unit tests)
- `audio-analysis`, `audio-io`, `core-types`, `exporters`, `library-db`, `rusqlite`, `sequencer`, `thiserror` in `src-tauri` (wires analysis, library storage, sequencing, and export engines into Tauri desktop commands)
- `hound = "3.5"`, `tempfile = "3"`, `tokio = { version = "1", features = ["rt-multi-thread", "macros"] }` in `src-tauri` dev-dependencies (drives asynchronous end-to-end integration test)

Public API:
- `audio_analysis::pipeline`:
  - `pub fn analyze_decoded(decoded: &DecodedAudio) -> Result<TrackAnalysis, AnalysisError>`: Runs rhythm, key, dynamics, structure, cues, and waveform in parallel across Rayon worker threads.
  - `pub fn analyze_decoded_with_config(decoded: &DecodedAudio, rhythm_config: &RhythmConfig) -> Result<TrackAnalysis, AnalysisError>`: Runs pipeline with custom rhythm configuration.
  - `pub struct AnalysisPipeline`: Implements `library_db::scan::Analyzer`, decoding audio from disk via `audio-io` and analyzing it.
  - `pub type AudioPipeline = AnalysisPipeline`
- `app_lib::state`:
  - `pub struct AppState`: Holds SQLite `Connection` wrapped in `Arc<Mutex<rusqlite::Connection>>`, `job_queue: Arc<JobQueue>`, and optional `db_path: Option<PathBuf>`. Supports persistent on-disk database via `AppState::new(db_path)` and in-memory via `AppState::in_memory()`.
  - `pub struct JobQueue`: Manages background `Scanner<AnalysisPipeline>`, `CancellationToken`, and active execution state.
  - `pub struct ProgressEvent`: Emitted payload with `stage` (`Scanning`, `Decoding`, `Analyzing`, `Sequencing`, `Exporting`), `current`, `total`, optional `message`, and optional `trackId`.
- `app_lib::commands`:
  - `#[tauri::command] pub async fn ping() -> &'static str`
  - `#[tauri::command] pub async fn scan_folder(app: AppHandle, state: State<AppState>, path: Option<String>, folder: Option<String>) -> Result<Vec<Track>, String>`
  - `#[tauri::command] pub async fn list_tracks(state: State<AppState>) -> Result<Vec<Track>, String>`
  - `#[tauri::command] pub async fn get_track(id: String, state: State<AppState>) -> Result<Option<Track>, String>`
  - `#[tauri::command] pub async fn suggest_order(app: AppHandle, state: State<AppState>, track_ids: Option<Vec<String>>, profile: Option<EnergyProfile>, weights: Option<CostWeights>) -> Result<Vec<SetlistEntry>, String>`
  - `#[tauri::command] pub async fn get_advice(state: State<AppState>, track_a_id: String, track_b_id: String) -> Result<TransitionAdvice, String>`
  - `#[tauri::command] pub async fn export_set(app: AppHandle, state: State<AppState>, entries: Vec<SetlistEntry>, target: ExportTarget, output_path: Option<String>) -> Result<String, String>`
  - Core testable functions: `scan_folder_core`, `list_tracks_core`, `get_track_core`, `suggest_order_core`, `get_advice_core`, `export_set_core`.

Tests:
- `audio_analysis::pipeline::tests`:
  - `test_analyze_decoded_synthetic_audio`: Generates synthetic multi-harmonic tone with beat clicks, verifies loudness pass-through, positive BPM, Camelot key, dynamics curves, energy score in 1..=10, structural segments, hot cues (Cue A at 0), and 3-band waveform overview.
  - `test_pipeline_empty_buffer_returns_error`: Validates `AnalysisError::InvalidInput` on empty audio buffer.
  - `test_analyzer_trait_implementation_on_wav_file`: Writes synthetic PCM WAV file using `hound`, executes `AnalysisPipeline::analyze`, and verifies complete `TrackAnalysis`.
- `src-tauri::tests::integration_test`:
  - `test_end_to_end_scan_database_list_sequence_export`: End-to-end test generating 3 synthetic WAV files in a temp folder (A major, C major, E minor at 120, 124, 128 BPM), initializes persistent SQLite database with migrations, runs `scan_folder_core`, verifies progress events emitted for scanning and analyzing stages, queries `list_tracks_core`, asserts complete analysis on all tracks, queries `get_track_core`, sequences tracks via `suggest_order_core` with `PeakPlateau` profile, evaluates transition advice via `get_advice_core`, exports setlist to all 4 formats (Rekordbox XML, M3U8, CSV, Markdown) via `export_set_core`, and verifies rescan skip logic.

Known gaps:
- None. Full pipeline and Tauri commands are implemented, fully tested, and compiled into the Tauri desktop application.

Needs from others:
- Task G2 (Wire the UI): Update `ui/src/api/index.ts` to implement `tauriBackend` by invoking the wired Tauri commands (`scan_folder`, `list_tracks`, `get_track`, `suggest_order`, `get_advice`, `export_set`) and listening to `"progress"` events via `@tauri-apps/api/event`.
