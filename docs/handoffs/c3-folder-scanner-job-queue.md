# c3-folder-scanner-job-queue Background Folder Scanner and Analysis Job Queue
Status: done
Changed:
- crates/library-db/Cargo.toml
- crates/library-db/src/error.rs
- crates/library-db/src/lib.rs
- crates/library-db/src/scan/mod.rs
- docs/handoffs/c3-folder-scanner-job-queue.md

Added deps:
- `walkdir = "2"` in `library-db` (recursive directory traversal for scanning folder hierarchies)
- `blake3 = "1"` in `library-db` (fast cryptographic hashing over file size, head 1 MB, and tail 1 MB)
- `tempfile = "3"` in `library-db` (dev-dependency for unit tests with temporary folders and files)

Public API:
- `library_db::scan`:
  - `pub trait Analyzer: Send + Sync + 'static { fn analyze(&self, path: &Path) -> Result<TrackAnalysis, String>; }`
  - `pub enum ScanEvent`:
    - `Queued { path: PathBuf, total_found: usize }`
    - `Started { path: PathBuf }`
    - `Done { path: PathBuf, track_id: String }`
    - `Failed { path: PathBuf, error: String }`
    - `Skipped { path: PathBuf, reason: String }`
  - `pub struct CancellationToken`:
    - `pub fn new() -> Self`
    - `pub fn cancel(&self)`
    - `pub fn is_cancelled(&self) -> bool`
  - `pub struct ScanConfig`:
    - `pub num_workers: usize` (defaults to available hardware concurrency - 1, min 1)
    - `pub analysis_version: String` (defaults to "v1")
    - `pub fn default_worker_count() -> usize`
  - `pub struct ScanSummary`:
    - `pub total_found: usize`
    - `pub queued: usize`
    - `pub skipped: usize`
    - `pub succeeded: usize`
    - `pub failed: usize`
    - `pub cancelled: bool`
  - `pub fn compute_file_hash(path: &Path) -> Result<String, DbError>`
  - `pub fn is_supported_audio_file(path: &Path) -> bool`
  - `pub fn scan_folder<A, F>(folder: &Path, conn: &Connection, analyzer: Arc<A>, config: ScanConfig, cancel_token: CancellationToken, on_event: F) -> Result<ScanSummary, DbError> where A: Analyzer, F: Fn(ScanEvent) + Send + 'static`
  - `pub struct Scanner<A: Analyzer>`:
    - `pub fn new(analyzer: Arc<A>, config: ScanConfig) -> Self`
    - `pub fn scan<F>(&self, folder: &Path, conn: &Connection, cancel_token: CancellationToken, on_event: F) -> Result<ScanSummary, DbError> where F: Fn(ScanEvent) + Send + 'static`
    - `pub fn scan_with_channel(&self, folder: &Path, conn: &Connection, cancel_token: CancellationToken) -> Result<(ScanSummary, mpsc::Receiver<ScanEvent>), DbError>`

Tests:
- `test_compute_file_hash_small_and_large`: verifies correct BLAKE3 hash computation for small files (< 2 MB) and large files (> 2 MB) checking size prefix + head 1 MB + tail 1 MB logic and determinism.
- `test_skip_logic`: tests that files with hashes already present in the database at the current `analysis_version` are skipped and emit `ScanEvent::Skipped`, while unanalyzed or outdated versions are processed.
- `test_failure_isolation`: verifies that a file which fails analysis or has a corrupt structure does not stop subsequent files in the queue from succeeding; emits `ScanEvent::Failed` with error text and logs failure in summary without aborting.
- `test_cancellation`: verifies cooperative cancellation via `CancellationToken`, stopping work queue dequeueing and marking `ScanSummary::cancelled = true`.
- `test_temp_folder_with_mixed_files`: verifies directory walk with `walkdir`, ignoring unsupported extensions (.txt, .jpg, .DS_Store, .pdf) and processing supported audio extensions (.mp3, .flac, .wav, .m4a, etc.) across nested directories.

Known gaps:
- Concrete integration with `audio-analysis` is omitted by design (trait-based `Analyzer` decouples `library-db` from `audio-analysis`). Workgroup Integration will wire `audio-analysis` through an `Analyzer` implementation.

Needs from others:
- Tauri command handlers in `src-tauri` can instantiate `Scanner` with concrete audio decoding/analysis implementations and pipe `ScanEvent`s across the Tauri frontend event bridge.
