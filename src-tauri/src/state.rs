//! Application state holding the SQLite database connection, scanner, and background job queue.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use audio_analysis::pipeline::AnalysisPipeline;
use library_db::scan::CancellationToken;
use serde::{Deserialize, Serialize};

/// Progress stage enum matching the UI frontend progress tracking definition.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ProgressStage {
    #[default]
    Scanning,
    Decoding,
    Analyzing,
    Sequencing,
    Exporting,
}

/// Progress event emitted over the Tauri IPC channel during long-running background tasks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ProgressEvent {
    /// Active lifecycle stage.
    pub stage: ProgressStage,
    /// Number of items processed in current task.
    pub current: usize,
    /// Total number of items in current task.
    pub total: usize,
    /// Optional human-readable progress details.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Optional identifier of the track currently being analyzed or processed.
    #[serde(rename = "trackId", skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    /// Estimated tempo in beats per minute.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bpm: Option<f64>,
    /// Musical key name (e.g. "A minor").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// Camelot harmonic code (e.g. "8A").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camelot: Option<String>,
    /// Energy score (1.0 to 10.0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub energy: Option<f64>,
    /// Integrated loudness in LUFS.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lufs: Option<f32>,
    /// Name of the active file being processed.
    #[serde(rename = "fileName", skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
}

/// RAII guard managing the lifecycle of an active scan operation.
///
/// When dropped, the guard automatically clears the active cancellation token
/// and resets the `is_running` flag to `false`, guaranteeing reliable state cleanup
/// across all exit paths (normal return, error, cancellation, or panic).
pub struct ScanGuard<'a> {
    queue: &'a JobQueue,
    token: CancellationToken,
}

impl std::fmt::Debug for ScanGuard<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ScanGuard")
            .field("token", &self.token)
            .finish()
    }
}

impl<'a> ScanGuard<'a> {
    /// Returns a reference to the cancellation token for the active scan.
    #[must_use]
    pub fn cancellation_token(&self) -> &CancellationToken {
        &self.token
    }

    /// Clones the cancellation token for passing across threads.
    #[must_use]
    pub fn token(&self) -> CancellationToken {
        self.token.clone()
    }
}

impl Drop for ScanGuard<'_> {
    fn drop(&mut self) {
        self.queue.finish_scan();
    }
}

/// Background job queue managing analysis pipeline and background task execution state.
pub struct JobQueue {
    /// Shared audio analysis pipeline.
    pub analyzer: Arc<AnalysisPipeline>,
    /// Cancellation token for the currently active background scan if any.
    pub active_token: Mutex<Option<CancellationToken>>,
    /// Whether a scan operation is actively executing.
    pub is_running: AtomicBool,
}

impl std::fmt::Debug for JobQueue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("JobQueue")
            .field("is_running", &self.is_running.load(Ordering::SeqCst))
            .finish()
    }
}

impl JobQueue {
    /// Creates a new job queue with the given analyzer.
    #[must_use]
    pub fn new(analyzer: Arc<AnalysisPipeline>) -> Self {
        Self {
            analyzer,
            active_token: Mutex::new(None),
            is_running: AtomicBool::new(false),
        }
    }

    /// Returns `true` if a background scan or analysis job is currently active.
    #[must_use]
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// Registers the start of a background scan, returning an RAII [`ScanGuard`].
    ///
    /// # Errors
    /// Returns error if a scan is already currently running.
    pub fn start_scan(&self) -> Result<ScanGuard<'_>, String> {
        let mut lock = self.active_token.lock().unwrap_or_else(|e| e.into_inner());
        if self.is_running.load(Ordering::SeqCst) {
            return Err("A folder scan is already in progress".to_string());
        }
        let token = CancellationToken::new();
        *lock = Some(token.clone());
        self.is_running.store(true, Ordering::SeqCst);
        Ok(ScanGuard { queue: self, token })
    }

    /// Marks the active scan as completed or stopped and clears the active cancellation token.
    pub fn finish_scan(&self) {
        let mut lock = self.active_token.lock().unwrap_or_else(|e| e.into_inner());
        *lock = None;
        self.is_running.store(false, Ordering::SeqCst);
    }

    /// Requests cooperative cancellation of the active scan job.
    pub fn cancel_current(&self) -> bool {
        let lock = self.active_token.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref token) = *lock {
            token.cancel();
            true
        } else {
            false
        }
    }
}

/// Global shared application state managed by Tauri.
pub struct AppState {
    /// Thread-safe SQLite connection handle.
    pub db: Arc<Mutex<rusqlite::Connection>>,
    /// Background job queue and folder scanner.
    pub job_queue: Arc<JobQueue>,
    /// Filesystem path to the SQLite database file if persisted on disk.
    pub db_path: Option<PathBuf>,
}

impl AppState {
    /// Initializes application state with a database located at `db_path`.
    ///
    /// Creates the parent directory if needed, opens the database with WAL mode,
    /// and executes pending database migrations.
    ///
    /// # Errors
    /// Returns error if database opening, configuration, or migration fails.
    pub fn new(db_path: PathBuf) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = rusqlite::Connection::open(&db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        library_db::apply_migrations(&conn)?;

        let analyzer = Arc::new(AnalysisPipeline::new());
        let job_queue = Arc::new(JobQueue::new(analyzer));

        Ok(Self {
            db: Arc::new(Mutex::new(conn)),
            job_queue,
            db_path: Some(db_path),
        })
    }

    /// Initializes application state with an in-memory database for automated testing.
    ///
    /// # Errors
    /// Returns error if in-memory database opening or migration fails.
    pub fn in_memory() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let conn = rusqlite::Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        library_db::apply_migrations(&conn)?;

        let analyzer = Arc::new(AnalysisPipeline::new());
        let job_queue = Arc::new(JobQueue::new(analyzer));

        Ok(Self {
            db: Arc::new(Mutex::new(conn)),
            job_queue,
            db_path: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_guard_lifecycle_and_concurrent_prevention() {
        let analyzer = Arc::new(AnalysisPipeline::new());
        let queue = JobQueue::new(analyzer);

        assert!(!queue.is_running());

        // First scan starts
        let guard = queue.start_scan().expect("start scan succeeds");
        assert!(queue.is_running());
        assert!(!guard.cancellation_token().is_cancelled());

        // Second scan fails while guard is alive
        let second_err = queue.start_scan().unwrap_err();
        assert!(second_err.contains("already in progress"));

        // Dropping guard clears the running flag
        drop(guard);
        assert!(!queue.is_running());

        // Second scan succeeds after guard drop
        let guard2 = queue.start_scan().expect("second scan succeeds");
        assert!(queue.is_running());
        drop(guard2);
        assert!(!queue.is_running());
    }

    #[test]
    fn test_scan_cancellation() {
        let analyzer = Arc::new(AnalysisPipeline::new());
        let queue = JobQueue::new(analyzer);

        assert!(!queue.cancel_current());

        let guard = queue.start_scan().expect("start scan succeeds");
        let token = guard.token();
        assert!(!token.is_cancelled());

        assert!(queue.cancel_current());
        assert!(token.is_cancelled());

        drop(guard);
        assert!(!queue.is_running());
    }
}
