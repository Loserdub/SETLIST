# g3-validation-harness Accuracy Validation Harness and Rekordbox Import Checklist
Status: done
Changed:
- `Cargo.toml`
- `tools/validate/Cargo.toml`
- `tools/validate/src/lib.rs`
- `tools/validate/src/main.rs`
- `tools/validate/tests/validate_test.rs`
- `docs/VALIDATION.md`
Added deps:
- `tools/validate/Cargo.toml`:
  - `audio-analysis = { path = "../../crates/audio-analysis" }`: for DSP analysis pipeline execution
  - `audio-io = { path = "../../crates/audio-io" }`: for decoding audio files across formats
  - `core-types = { path = "../../crates/core-types" }`: for Camelot, Mode, and TrackAnalysis data structures
  - `thiserror = "2"`: for structured `ValidateError` error handling
  - dev-dep `hound = "3.5"`: for synthesizing PCM WAV files in integration and CLI tests
  - dev-dep `tempfile = "3"`: for isolated temporary directory creation in tests
Public API:
- `pub enum ValidateError`: I/O, audio decoding, analysis, CSV parsing, and no audio files found errors
- `pub struct AnalysisRow`: File name, path, BPM, key name, Camelot key, LUFS, and energy rating
  - `pub fn to_csv_row(&self) -> String`
- `pub struct GroundTruthRow`: File identifier, BPM, and Camelot key
- `pub struct TrackComparison`: Per-track evaluation against ground truth (BPM diff, within 0.5, octave correct, key distance, mode flip, exact key, Camelot adjacent, error score)
- `pub struct ValidationReport`: Summary counts, percentages, harmonic breakdown, comparisons list, and worst 10 files ranked by error severity
  - Implements `std::fmt::Display` for formatted report generation
- `pub fn escape_csv(val: &str) -> String`: RFC 4180 CSV escaping
- `pub fn parse_key_flexible(raw: &str) -> Result<Camelot, ValidateError>`: Parses Camelot ("8A", "11B"), standard key names ("A minor", "C major"), or shorthand ("Am", "F#m", "C")
- `pub fn parse_ground_truth(csv_content: &str) -> Result<Vec<GroundTruthRow>, ValidateError>`: Parses ground-truth CSV with columns (file, bpm, key)
- `pub fn generate_csv(rows: &[AnalysisRow]) -> String`: Formats analyzed tracks to CSV string
- `pub fn evaluate_accuracy(analyzed: &[AnalysisRow], ground_truth: &[GroundTruthRow]) -> ValidationReport`: Evaluates accuracy and ranks worst 10 tracks using AGENTS.md 6.3 cost model
- `pub fn discover_audio_files<P: AsRef<Path>>(folder: P) -> Result<Vec<PathBuf>, ValidateError>`: Recursively discovers supported audio files (.wav, .mp3, .flac, .aif, .aiff, .ogg, .m4a, .aac, .wma)
- `pub fn analyze_single_file<P: AsRef<Path>>(path: P) -> Result<AnalysisRow, ValidateError>`: Decodes and analyzes single audio file
- `pub fn analyze_folder<P: AsRef<Path>>(folder: P) -> Result<Vec<AnalysisRow>, ValidateError>`: Recursively scans and analyzes all audio files in a folder
Tests:
- `tools/validate/src/lib.rs` (unit tests):
  - `test_parse_key_flexible_camelot`: Camelot key string parsing and normalization
  - `test_parse_key_flexible_standard_names`: Full major and minor key name parsing
  - `test_parse_key_flexible_shorthand`: Shorthand symbols ('Am', 'C#m', 'F#')
  - `test_parse_ground_truth_csv`: Header handling, quoted strings, and comments
  - `test_evaluate_accuracy_metrics`: Evaluation of exact BPM, octave doubling/halving, key distance, mode flip, and worst-10 ranking
  - `test_generate_csv`: Verification of RFC 4180 output formatting
- `tools/validate/tests/validate_test.rs` (integration tests):
  - `test_validation_report_on_20_files`: Synthesizes 20 distinct WAV audio files with varied BPM and chord progressions using `hound`, runs full DSP analysis, evaluates against ground-truth CSV, and asserts formatted accuracy report output and worst 10 ranking
  - `test_cli_binary_execution_on_folder`: Executes compiled `validate` binary with `--ground-truth` and `--output`, verifying process success, stdout summary, and CSV file persistence
- Workspace verification:
  - `cargo test --workspace`: All 158 tests passing
  - `cargo clippy --workspace -- -D warnings`: 0 warnings
  - `cargo fmt --check`: Clean formatting
  - `pnpm --dir ui typecheck`: 0 errors
  - `pnpm --dir ui test`: 120 tests passing
Known gaps:
- Timbre embeddings (`Phi_timbre`) are stubbed to 0.0 for v1 as specified in AGENTS.md 6.3.
Needs from others:
- None. The validation harness and Rekordbox manual import guide are complete and ready for benchmarking real music collections.
