//! Folder scanner, fast BLAKE3 content hashing, worker pool, and background analysis queue.
//!
//! Provides:
//! - Recursive folder walking with extension filtering (`walkdir`).
//! - Fast content hashing over file size plus first and last 1 MB (`blake3`).
//! - Skip logic for tracks already analyzed at the current pipeline version.
//! - Parallel worker pool driven through the [`Analyzer`] trait.
//! - Progress events channel ([`ScanEvent`]) and cooperative cancellation ([`CancellationToken`]).

use std::collections::VecDeque;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use crate::error::DbError;
use crate::repo::upsert_track;
use core_types::{Track, TrackAnalysis, TrackTags};

/// Buffer size for first and last chunk reads during hashing (1 MB).
pub const HASH_CHUNK_SIZE: usize = 1024 * 1024;

/// Supported audio container file extensions (case-insensitive).
pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "wave", "aif", "aiff", "aac", "m4a", "ogg", "oga",
];

/// Checks whether a given path has a supported audio container extension.
#[must_use]
pub fn is_supported_audio_file<P: AsRef<Path>>(path: P) -> bool {
    path.as_ref()
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext_lower = ext.to_ascii_lowercase();
            SUPPORTED_EXTENSIONS.iter().any(|&e| e == ext_lower)
        })
        .unwrap_or(false)
}

/// Computes the fast BLAKE3 content hash over the file size plus the first and last 1 MB.
///
/// For files $\le$ 2 MB, hashes the size and the full file content.
/// For files $>$ 2 MB, hashes the size, the first 1 MB, and the last 1 MB.
///
/// # Errors
/// Returns `std::io::Error` if opening, reading, or seeking fails.
pub fn compute_file_hash<P: AsRef<Path>>(path: P) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let metadata = file.metadata()?;
    let size = metadata.len();

    let mut hasher = blake3::Hasher::new();
    // 1. Hash the file size (8 bytes, little-endian)
    hasher.update(&size.to_le_bytes());

    let two_mb = (2 * HASH_CHUNK_SIZE) as u64;
    if size <= two_mb {
        // File is <= 2 MB: read the entire file
        let mut buffer = Vec::with_capacity(size as usize);
        file.read_to_end(&mut buffer)?;
        hasher.update(&buffer);
    } else {
        // File is > 2 MB: read first 1 MB
        let mut first_mb = vec![0u8; HASH_CHUNK_SIZE];
        file.read_exact(&mut first_mb)?;
        hasher.update(&first_mb);

        // Seek to size - 1 MB and read last 1 MB
        file.seek(SeekFrom::Start(size - HASH_CHUNK_SIZE as u64))?;
        let mut last_mb = vec![0u8; HASH_CHUNK_SIZE];
        file.read_exact(&mut last_mb)?;
        hasher.update(&last_mb);
    }

    Ok(hasher.finalize().to_hex().to_string())
}

/// Trait for audio analysis engine decoupling.
///
/// Implementations analyze an audio file at `path` and return [`TrackAnalysis`].
/// Enables mock and fake analyzers in unit and integration tests without depending
/// on the audio-analysis crate.
pub trait Analyzer: Send + Sync {
    /// Analyzes the audio file at the given filesystem path.
    ///
    /// # Errors
    /// Returns error text if decoding or analysis fails.
    fn analyze(&self, path: &Path) -> Result<TrackAnalysis, String>;
}

/// Progress events emitted during folder scanning and background analysis.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScanEvent {
    /// A new audio file was discovered and queued for analysis.
    Queued {
        /// Path of the queued audio file.
        path: PathBuf,
    },
    /// A worker has started analyzing the audio file.
    Started {
        /// Path of the track currently being analyzed.
        path: PathBuf,
    },
    /// Audio file was successfully analyzed and saved to the database.
    Done {
        /// Path of the analyzed track.
        path: PathBuf,
        /// Database track identifier assigned to the track.
        track_id: String,
    },
    /// Analysis or database insertion failed for the given audio file.
    Failed {
        /// Path of the failed track.
        path: PathBuf,
        /// Error description explaining the failure.
        error: String,
    },
    /// File was skipped because its hash is already analyzed at the current version.
    Skipped {
        /// Path of the skipped track.
        path: PathBuf,
    },
}

/// Thread-safe cancellation token to signal cooperative early termination.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    /// Creates a new uncancelled token.
    #[must_use]
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Signals cancellation to all workers and the scan coordinator.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    /// Returns `true` if cancellation has been requested.
    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

/// Configuration for folder scanning and worker pool concurrency.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanConfig {
    /// Number of concurrent worker threads. Defaults to `num_cpus - 1` (min 1).
    pub num_workers: usize,
    /// Pipeline analysis version string. Files analyzed at this version are skipped. Defaults to `"v1"`.
    pub analysis_version: String,
}

impl Default for ScanConfig {
    fn default() -> Self {
        let workers = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .saturating_sub(1)
            .max(1);
        Self {
            num_workers: workers,
            analysis_version: "v1".to_string(),
        }
    }
}

/// Summary metrics returned upon completion or cancellation of a scan.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ScanSummary {
    /// Total audio files discovered with supported extensions.
    pub total_found: usize,
    /// Number of files queued for analysis.
    pub queued: usize,
    /// Number of files skipped because their hash was already analyzed at the current version.
    pub skipped: usize,
    /// Number of files successfully analyzed and saved to the database.
    pub succeeded: usize,
    /// Number of files that failed during analysis or saving.
    pub failed: usize,
    /// Whether the scan was cancelled before processing all items.
    pub cancelled: bool,
}

/// Internal job payload passed to worker threads.
#[derive(Debug, Clone)]
struct ScanJob {
    path: PathBuf,
    hash: String,
}

/// Scans a directory, queues unanalyzed audio files, executes analysis on a worker pool,
/// and saves the resulting tracks and analyses into the SQLite database.
///
/// # Errors
/// Returns `DbError` on database errors.
pub fn scan_folder<P, A>(
    conn: &rusqlite::Connection,
    folder: P,
    analyzer: Arc<A>,
    config: &ScanConfig,
    cancel_token: Option<CancellationToken>,
    event_sender: Option<mpsc::Sender<ScanEvent>>,
) -> Result<ScanSummary, DbError>
where
    P: AsRef<Path>,
    A: Analyzer + 'static,
{
    let cancel = cancel_token.unwrap_or_default();
    let mut summary = ScanSummary::default();

    // 1. Walk folder and discover candidate audio files
    let mut discovered_paths = Vec::new();
    for entry in walkdir::WalkDir::new(folder)
        .follow_links(true)
        .into_iter()
        .filter_map(Result::ok)
    {
        if cancel.is_cancelled() {
            summary.cancelled = true;
            return Ok(summary);
        }
        if entry.file_type().is_file() && is_supported_audio_file(entry.path()) {
            discovered_paths.push(entry.path().to_path_buf());
        }
    }

    // Sort paths for deterministic job processing
    discovered_paths.sort();

    // 2. Hash files and evaluate skip logic
    let mut jobs = Vec::new();
    for path in discovered_paths {
        if cancel.is_cancelled() {
            summary.cancelled = true;
            break;
        }

        summary.total_found += 1;

        let hash = match compute_file_hash(&path) {
            Ok(h) => h,
            Err(e) => {
                summary.failed += 1;
                if let Some(ref tx) = event_sender {
                    let _ = tx.send(ScanEvent::Failed {
                        path: path.clone(),
                        error: format!("hash calculation failed: {e}"),
                    });
                }
                continue;
            }
        };

        // Query database: has this content hash already been analyzed at current version?
        let already_analyzed: bool = conn.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM tracks
                WHERE hash = ?1 AND analyzed_at IS NOT NULL AND analysis_version = ?2
            )",
            rusqlite::params![hash, config.analysis_version],
            |row| row.get(0),
        )?;

        if already_analyzed {
            summary.skipped += 1;
            if let Some(ref tx) = event_sender {
                let _ = tx.send(ScanEvent::Skipped { path });
            }
        } else {
            summary.queued += 1;
            if let Some(ref tx) = event_sender {
                let _ = tx.send(ScanEvent::Queued { path: path.clone() });
            }
            jobs.push(ScanJob { path, hash });
        }
    }

    if jobs.is_empty() || cancel.is_cancelled() {
        if cancel.is_cancelled() {
            summary.cancelled = true;
        }
        return Ok(summary);
    }

    // 3. Worker pool setup
    let job_queue = Arc::new(Mutex::new(VecDeque::from(jobs)));
    let (result_tx, result_rx) = mpsc::channel();
    let num_workers = config.num_workers.max(1);
    let mut worker_handles = Vec::with_capacity(num_workers);

    for _ in 0..num_workers {
        let queue = Arc::clone(&job_queue);
        let worker_analyzer = Arc::clone(&analyzer);
        let worker_cancel = cancel.clone();
        let worker_tx = result_tx.clone();
        let worker_ev = event_sender.clone();

        let handle = std::thread::spawn(move || loop {
            if worker_cancel.is_cancelled() {
                break;
            }
            let job = {
                let mut lock = match queue.lock() {
                    Ok(l) => l,
                    Err(poisoned) => poisoned.into_inner(),
                };
                lock.pop_front()
            };
            let job = match job {
                Some(j) => j,
                None => break,
            };

            if let Some(ref ev) = worker_ev {
                let _ = ev.send(ScanEvent::Started {
                    path: job.path.clone(),
                });
            }

            let result = worker_analyzer.analyze(&job.path);
            if worker_tx.send((job, result)).is_err() {
                break;
            }
        });
        worker_handles.push(handle);
    }

    // Drop main thread's sender so result_rx terminates once all workers finish
    drop(result_tx);

    // 4. Coordinator loop: collect results and persist to SQLite
    while let Ok((job, result)) = result_rx.recv() {
        if cancel.is_cancelled() {
            summary.cancelled = true;
            // When cancelled, do not commit more database transactions
            continue;
        }

        match result {
            Ok(analysis) => {
                let duration_ms = analysis.segments.last().map(|s| s.end_ms).unwrap_or(0.0);
                let track = Track {
                    id: String::new(),
                    path: job.path.to_string_lossy().to_string(),
                    hash: job.hash,
                    tags: TrackTags::default(),
                    duration_ms,
                    analysis: Some(analysis),
                    analyzed_at: None,
                    analysis_version: Some(config.analysis_version.clone()),
                };

                match upsert_track(conn, &track) {
                    Ok(track_id) => {
                        summary.succeeded += 1;
                        if let Some(ref tx) = event_sender {
                            let _ = tx.send(ScanEvent::Done {
                                path: job.path,
                                track_id,
                            });
                        }
                    }
                    Err(e) => {
                        summary.failed += 1;
                        if let Some(ref tx) = event_sender {
                            let _ = tx.send(ScanEvent::Failed {
                                path: job.path,
                                error: format!("database persistence error: {e}"),
                            });
                        }
                    }
                }
            }
            Err(err_msg) => {
                summary.failed += 1;
                if let Some(ref tx) = event_sender {
                    let _ = tx.send(ScanEvent::Failed {
                        path: job.path,
                        error: err_msg,
                    });
                }
            }
        }
    }

    // Join all workers
    for h in worker_handles {
        let _ = h.join();
    }

    if cancel.is_cancelled() {
        summary.cancelled = true;
    }

    Ok(summary)
}

/// Scanner service wrapping analyzer and scan configuration.
#[derive(Debug, Clone)]
pub struct Scanner<A> {
    analyzer: Arc<A>,
    config: ScanConfig,
}

impl<A: Analyzer + 'static> Scanner<A> {
    /// Creates a new `Scanner` with default concurrency settings.
    pub fn new(analyzer: Arc<A>) -> Self {
        Self {
            analyzer,
            config: ScanConfig::default(),
        }
    }

    /// Creates a new `Scanner` with custom configuration.
    pub fn with_config(analyzer: Arc<A>, config: ScanConfig) -> Self {
        Self { analyzer, config }
    }

    /// Scans a folder using the configured analyzer and settings.
    ///
    /// # Errors
    /// Returns `DbError` on database errors.
    pub fn scan<P: AsRef<Path>>(
        &self,
        conn: &rusqlite::Connection,
        folder: P,
        cancel_token: Option<CancellationToken>,
        event_sender: Option<mpsc::Sender<ScanEvent>>,
    ) -> Result<ScanSummary, DbError> {
        scan_folder(
            conn,
            folder,
            Arc::clone(&self.analyzer),
            &self.config,
            cancel_token,
            event_sender,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrate::apply_migrations;
    use crate::repo::get_track;
    use core_types::{
        BeatGrid, Camelot, CamelotLetter, CueKind, CuePoint, DynamicsAnalysis, EnergyCurve, Key,
        LoudnessInfo, Mode, RhythmAnalysis, Segment, SegmentLabel, Waveform3Band, WaveformBand,
    };
    use rusqlite::Connection;
    use std::fs::File;
    use std::io::Write;
    use std::sync::atomic::AtomicUsize;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        apply_migrations(&conn).unwrap();
        conn
    }

    fn sample_analysis_for_test() -> TrackAnalysis {
        TrackAnalysis {
            loudness: LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 6.0,
                true_peak: -1.0,
            },
            rhythm: RhythmAnalysis {
                grid: BeatGrid {
                    first_downbeat_ms: 100.0,
                    bpm: 128.0,
                    beats_ms: vec![100.0, 568.75, 1037.5, 1506.25],
                    downbeat_flags: vec![true, false, false, false],
                    steady: true,
                },
                bpm_alternates: vec![64.0, 256.0],
            },
            key: Key {
                pitch_class: 0,
                mode: Mode::Minor,
                camelot: Camelot::new(5, CamelotLetter::A).unwrap(),
                tuning_cents: 0.0,
            },
            dynamics: DynamicsAnalysis {
                frame_rate: 86.13,
                rms_curve: vec![0.5],
                low_ratio_curve: vec![0.3],
                centroid_curve: vec![1500.0],
            },
            energy_score: 6,
            energy_curve: EnergyCurve { per_bar: vec![6.0] },
            segments: vec![Segment {
                label: SegmentLabel::Drop,
                start_ms: 0.0,
                end_ms: 60000.0,
                energy: 8,
            }],
            cue_points: vec![CuePoint {
                index: 0,
                time_ms: 100.0,
                label: "Drop".to_string(),
                color_hex: "#FF5500".to_string(),
                kind: CueKind::HotCue,
                loop_end_ms: None,
            }],
            waveform: Waveform3Band {
                points_per_sec: 150,
                low: WaveformBand {
                    peak: vec![100],
                    rms: vec![50],
                },
                mid: WaveformBand {
                    peak: vec![80],
                    rms: vec![40],
                },
                high: WaveformBand {
                    peak: vec![60],
                    rms: vec![30],
                },
            },
        }
    }

    /// Mock analyzer that returns Ok for all paths.
    struct SuccessAnalyzer;
    impl Analyzer for SuccessAnalyzer {
        fn analyze(&self, _path: &Path) -> Result<TrackAnalysis, String> {
            Ok(sample_analysis_for_test())
        }
    }

    /// Mock analyzer that returns Err for paths containing "corrupt".
    struct SelectiveFailingAnalyzer;
    impl Analyzer for SelectiveFailingAnalyzer {
        fn analyze(&self, path: &Path) -> Result<TrackAnalysis, String> {
            if path.to_string_lossy().contains("corrupt") {
                Err("corrupted audio stream: sync word missing".to_string())
            } else {
                Ok(sample_analysis_for_test())
            }
        }
    }

    /// Mock analyzer with delay to test cancellation.
    struct SlowAnalyzer {
        calls: AtomicUsize,
    }
    impl Analyzer for SlowAnalyzer {
        fn analyze(&self, _path: &Path) -> Result<TrackAnalysis, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(std::time::Duration::from_millis(40));
            Ok(sample_analysis_for_test())
        }
    }

    #[test]
    fn test_compute_file_hash_small_and_large() {
        let temp = tempfile::tempdir().unwrap();

        // Small file (100 bytes)
        let small_path = temp.path().join("small.mp3");
        {
            let mut f = File::create(&small_path).unwrap();
            f.write_all(&[42u8; 100]).unwrap();
        }
        let small_hash = compute_file_hash(&small_path).unwrap();
        assert!(!small_hash.is_empty());
        assert_eq!(small_hash.len(), 64); // 32-byte hex

        // Large file (> 2 MB)
        let large_path = temp.path().join("large.flac");
        {
            let mut f = File::create(&large_path).unwrap();
            // Write 2.5 MB
            let chunk = vec![7u8; 512 * 1024];
            for _ in 0..5 {
                f.write_all(&chunk).unwrap();
            }
        }
        let large_hash = compute_file_hash(&large_path).unwrap();
        assert_eq!(large_hash.len(), 64);
        assert_ne!(small_hash, large_hash);
    }

    #[test]
    fn test_temp_folder_with_mixed_files() {
        let conn = test_db();
        let temp = tempfile::tempdir().unwrap();

        // Audio files
        File::create(temp.path().join("track1.mp3"))
            .unwrap()
            .write_all(b"audio1")
            .unwrap();
        File::create(temp.path().join("track2.flac"))
            .unwrap()
            .write_all(b"audio2")
            .unwrap();
        File::create(temp.path().join("track3.wav"))
            .unwrap()
            .write_all(b"audio3")
            .unwrap();

        // Subfolder with audio file
        let sub = temp.path().join("album");
        std::fs::create_dir(&sub).unwrap();
        File::create(sub.join("track4.ogg"))
            .unwrap()
            .write_all(b"audio4")
            .unwrap();

        // Non-audio files
        File::create(temp.path().join("notes.txt"))
            .unwrap()
            .write_all(b"text")
            .unwrap();
        File::create(temp.path().join("artwork.jpg"))
            .unwrap()
            .write_all(b"image")
            .unwrap();
        File::create(sub.join("metadata.json"))
            .unwrap()
            .write_all(b"{}")
            .unwrap();

        let (tx, rx) = mpsc::channel();
        let config = ScanConfig {
            num_workers: 2,
            analysis_version: "v1".to_string(),
        };

        let summary = scan_folder(
            &conn,
            temp.path(),
            Arc::new(SuccessAnalyzer),
            &config,
            None,
            Some(tx),
        )
        .expect("scan succeeds");

        assert_eq!(summary.total_found, 4);
        assert_eq!(summary.queued, 4);
        assert_eq!(summary.skipped, 0);
        assert_eq!(summary.succeeded, 4);
        assert_eq!(summary.failed, 0);
        assert!(!summary.cancelled);

        // Verify events received
        let mut queued_count = 0;
        let mut started_count = 0;
        let mut done_count = 0;
        while let Ok(ev) = rx.try_recv() {
            match ev {
                ScanEvent::Queued { .. } => queued_count += 1,
                ScanEvent::Started { .. } => started_count += 1,
                ScanEvent::Done { track_id, .. } => {
                    done_count += 1;
                    // Verify track in database
                    let track = get_track(&conn, &track_id).unwrap().unwrap();
                    assert!(track.analysis.is_some());
                }
                _ => {}
            }
        }
        assert_eq!(queued_count, 4);
        assert_eq!(started_count, 4);
        assert_eq!(done_count, 4);
    }

    #[test]
    fn test_skip_logic() {
        let conn = test_db();
        let temp = tempfile::tempdir().unwrap();

        File::create(temp.path().join("song1.mp3"))
            .unwrap()
            .write_all(b"mp3_data")
            .unwrap();
        File::create(temp.path().join("song2.wav"))
            .unwrap()
            .write_all(b"wav_data")
            .unwrap();

        let config = ScanConfig {
            num_workers: 2,
            analysis_version: "v1".to_string(),
        };

        // First scan: both should be queued and analyzed
        let sum1 = scan_folder(
            &conn,
            temp.path(),
            Arc::new(SuccessAnalyzer),
            &config,
            None,
            None,
        )
        .unwrap();
        assert_eq!(sum1.total_found, 2);
        assert_eq!(sum1.queued, 2);
        assert_eq!(sum1.succeeded, 2);
        assert_eq!(sum1.skipped, 0);

        // Second scan with same version: both must be skipped!
        let (tx, rx) = mpsc::channel();
        let sum2 = scan_folder(
            &conn,
            temp.path(),
            Arc::new(SuccessAnalyzer),
            &config,
            None,
            Some(tx),
        )
        .unwrap();
        assert_eq!(sum2.total_found, 2);
        assert_eq!(sum2.queued, 0);
        assert_eq!(sum2.succeeded, 0);
        assert_eq!(sum2.skipped, 2);

        let mut skipped_events = 0;
        while let Ok(ev) = rx.try_recv() {
            if matches!(ev, ScanEvent::Skipped { .. }) {
                skipped_events += 1;
            }
        }
        assert_eq!(skipped_events, 2);

        // Third scan with bumped analysis_version "v2": both re-analyzed!
        let config_v2 = ScanConfig {
            num_workers: 2,
            analysis_version: "v2".to_string(),
        };
        let sum3 = scan_folder(
            &conn,
            temp.path(),
            Arc::new(SuccessAnalyzer),
            &config_v2,
            None,
            None,
        )
        .unwrap();
        assert_eq!(sum3.total_found, 2);
        assert_eq!(sum3.queued, 2);
        assert_eq!(sum3.succeeded, 2);
        assert_eq!(sum3.skipped, 0);
    }

    #[test]
    fn test_failure_isolation() {
        let conn = test_db();
        let temp = tempfile::tempdir().unwrap();

        File::create(temp.path().join("good1.mp3"))
            .unwrap()
            .write_all(b"good_one")
            .unwrap();
        File::create(temp.path().join("corrupt.flac"))
            .unwrap()
            .write_all(b"bad_data")
            .unwrap();
        File::create(temp.path().join("good2.wav"))
            .unwrap()
            .write_all(b"good_two")
            .unwrap();

        let (tx, rx) = mpsc::channel();
        let config = ScanConfig {
            num_workers: 1, // deterministic order
            analysis_version: "v1".to_string(),
        };

        let summary = scan_folder(
            &conn,
            temp.path(),
            Arc::new(SelectiveFailingAnalyzer),
            &config,
            None,
            Some(tx),
        )
        .unwrap();

        assert_eq!(summary.total_found, 3);
        assert_eq!(summary.queued, 3);
        assert_eq!(summary.succeeded, 2);
        assert_eq!(summary.failed, 1);

        let mut failed_event_seen = false;
        let mut done_event_count = 0;
        while let Ok(ev) = rx.try_recv() {
            match ev {
                ScanEvent::Failed { path, error } => {
                    assert!(path.to_string_lossy().contains("corrupt"));
                    assert!(error.contains("corrupted audio stream"));
                    failed_event_seen = true;
                }
                ScanEvent::Done { .. } => done_event_count += 1,
                _ => {}
            }
        }
        assert!(failed_event_seen);
        assert_eq!(done_event_count, 2);
    }

    #[test]
    fn test_cancellation() {
        let conn = test_db();
        let temp = tempfile::tempdir().unwrap();

        for i in 0..10 {
            File::create(temp.path().join(format!("track_{i}.mp3")))
                .unwrap()
                .write_all(format!("track_{i}").as_bytes())
                .unwrap();
        }

        let token = CancellationToken::new();
        let token_clone = token.clone();

        let slow_analyzer = Arc::new(SlowAnalyzer {
            calls: AtomicUsize::new(0),
        });

        let config = ScanConfig {
            num_workers: 2,
            analysis_version: "v1".to_string(),
        };

        // Spawn a thread to cancel after 20ms
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(20));
            token_clone.cancel();
        });

        let summary = scan_folder(
            &conn,
            temp.path(),
            slow_analyzer,
            &config,
            Some(token),
            None,
        )
        .unwrap();

        assert!(summary.cancelled);
        // It shouldn't have finished all 10 tracks
        assert!(summary.succeeded < 10);
    }
}
