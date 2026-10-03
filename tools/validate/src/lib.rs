//! Validation harness library: audio folder analysis, ground-truth comparison,
//! accuracy reporting, and metric calculations.

use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use core_types::{Camelot, Mode, TrackAnalysis};
use thiserror::Error;

/// Error type for validation harness operations.
#[derive(Debug, Error)]
pub enum ValidateError {
    /// Filesystem I/O error.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Audio decoding error.
    #[error("audio decode error for {path}: {source}")]
    Decode {
        path: PathBuf,
        source: audio_io::AudioIoError,
    },

    /// Audio analysis error.
    #[error("analysis error for {path}: {source}")]
    Analysis {
        path: PathBuf,
        source: audio_analysis::AnalysisError,
    },

    /// CSV parsing error.
    #[error("CSV parsing error: {0}")]
    CsvParse(String),

    /// Target folder contained no supported audio files.
    #[error("no supported audio files found in: {0}")]
    NoAudioFilesFound(String),
}

/// Represents the analyzed DSP metrics for a single audio file.
#[derive(Debug, Clone, PartialEq)]
pub struct AnalysisRow {
    /// Relative path or file name.
    pub file: String,
    /// Absolute or original path on disk.
    pub path: PathBuf,
    /// Detected tempo in BPM.
    pub bpm: f64,
    /// Detected musical key name (e.g., "A minor").
    pub key: String,
    /// Detected Camelot key (e.g., "8A").
    pub camelot: Camelot,
    /// Integrated loudness in LUFS.
    pub lufs: f32,
    /// Energy rating (1 to 10).
    pub energy: u8,
}

impl AnalysisRow {
    /// Creates a formatted CSV row string.
    #[must_use]
    pub fn to_csv_row(&self) -> String {
        format!(
            "{},{:.1},{},{},{:.1},{}",
            escape_csv(&self.file),
            self.bpm,
            escape_csv(&self.key),
            self.camelot,
            self.lufs,
            self.energy
        )
    }
}

/// Represents a single ground-truth reference entry.
#[derive(Debug, Clone, PartialEq)]
pub struct GroundTruthRow {
    /// Target file identifier or filename.
    pub file: String,
    /// Ground-truth BPM.
    pub bpm: f64,
    /// Ground-truth Camelot key.
    pub camelot: Camelot,
}

/// Evaluation comparison between detected and ground-truth values.
#[derive(Debug, Clone, PartialEq)]
pub struct TrackComparison {
    /// Track filename or identifier.
    pub file: String,
    /// Detected BPM.
    pub detected_bpm: f64,
    /// Ground truth BPM.
    pub gt_bpm: f64,
    /// Absolute BPM error: `|detected - gt|`.
    pub bpm_diff: f64,
    /// Whether detected BPM is within 0.5 of ground truth.
    pub bpm_within_0_5: bool,
    /// Whether detected BPM is correct up to an octave (x1, x2, or x0.5).
    pub bpm_octave_correct: bool,
    /// Detected Camelot key.
    pub detected_camelot: Camelot,
    /// Ground truth Camelot key.
    pub gt_camelot: Camelot,
    /// Circular distance on Camelot wheel (0 to 6).
    pub key_distance: u8,
    /// Whether key mode flipped (Minor vs Major).
    pub mode_flip: bool,
    /// Whether key matches ground truth exactly.
    pub exact_key: bool,
    /// Whether key is Camelot-adjacent (`d <= 1`).
    pub camelot_adjacent: bool,
    /// Composite error penalty score for sorting worst tracks.
    pub error_score: f64,
}

/// Summary report of accuracy evaluation across a collection.
#[derive(Debug, Clone, PartialEq)]
pub struct ValidationReport {
    /// Total audio files analyzed.
    pub total_analyzed: usize,
    /// Total tracks matched with ground-truth records.
    pub total_matched: usize,
    /// Tracks with BPM within 0.5.
    pub bpm_within_0_5_count: usize,
    /// Tracks with BPM correct up to an octave.
    pub bpm_octave_correct_count: usize,
    /// Mean absolute BPM error among matched tracks.
    pub mean_bpm_error: f64,
    /// Tracks with exact key match.
    pub exact_key_count: usize,
    /// Tracks with Camelot-adjacent key (`d <= 1`).
    pub camelot_adjacent_count: usize,
    /// Count of distance 0 with same mode (exact match).
    pub dist_0_same_count: usize,
    /// Count of distance 0 with mode flip (relative switch).
    pub dist_0_flip_count: usize,
    /// Count of distance 1 with same mode (fifth).
    pub dist_1_same_count: usize,
    /// Count of distance 1 with mode flip.
    pub dist_1_flip_count: usize,
    /// Count of distance >= 2.
    pub dist_2_plus_count: usize,
    /// All individual track comparisons.
    pub comparisons: Vec<TrackComparison>,
    /// Up to 10 worst tracks ranked by error severity.
    pub worst_10: Vec<TrackComparison>,
}

/// Helper function to escape CSV strings per RFC 4180.
#[must_use]
pub fn escape_csv(val: &str) -> String {
    if val.contains(',') || val.contains('"') || val.contains('\n') || val.contains('\r') {
        format!("\"{}\"", val.replace('"', "\"\""))
    } else {
        val.to_string()
    }
}

/// Parses a musical key string in flexible formats:
/// - Camelot notation: `"8A"`, `"11b"`
/// - Standard key names: `"A minor"`, `"C major"`, `"Eb minor"`, `"F# major"`
/// - Shorthand symbols: `"Am"`, `"C"`, `"F#m"`, `"Bbm"`
///
/// # Errors
/// Returns [`ValidateError::CsvParse`] if the key string is unrecognized.
pub fn parse_key_flexible(raw: &str) -> Result<Camelot, ValidateError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ValidateError::CsvParse("empty key string".to_string()));
    }

    // Try direct Camelot parsing first (e.g. "8A", "11B")
    if let Ok(c) = trimmed.parse::<Camelot>() {
        return Ok(c);
    }

    let lower = trimmed.to_lowercase();

    // Check for minor mode indicators
    let is_minor = lower.contains("minor")
        || lower.contains("min")
        || (lower.ends_with('m') && !lower.ends_with("dim") && lower.len() > 1);

    let mode = if is_minor { Mode::Minor } else { Mode::Major };

    // Strip descriptor words
    let note_part = lower
        .replace("major", "")
        .replace("minor", "")
        .replace("maj", "")
        .replace("min", "");
    let note_part_trimmed = note_part.trim();

    // If it ends with 'm' (like 'am' or 'c#m'), strip the 'm'
    let note_str = if is_minor && note_part_trimmed.ends_with('m') && note_part_trimmed.len() > 1 {
        &note_part_trimmed[..note_part_trimmed.len() - 1]
    } else {
        note_part_trimmed
    }
    .trim();

    let pitch_class: u8 = match note_str {
        "c" | "b#" => 0,
        "c#" | "db" => 1,
        "d" => 2,
        "d#" | "eb" => 3,
        "e" | "fb" => 4,
        "f" | "e#" => 5,
        "f#" | "gb" => 6,
        "g" => 7,
        "g#" | "ab" => 8,
        "a" => 9,
        "a#" | "bb" => 10,
        "b" | "cb" => 11,
        _ => {
            return Err(ValidateError::CsvParse(format!(
                "unrecognized musical key: '{raw}'"
            )))
        }
    };

    Camelot::from_key(pitch_class, mode)
        .map_err(|e| ValidateError::CsvParse(format!("camelot conversion error: {e}")))
}

/// Parses ground-truth CSV contents into structured [`GroundTruthRow`] records.
///
/// Accepts header line containing `file,bpm,key` or positional columns (file, bpm, key).
///
/// # Errors
/// Returns [`ValidateError::CsvParse`] if any row contains invalid numbers or keys.
pub fn parse_ground_truth(csv_content: &str) -> Result<Vec<GroundTruthRow>, ValidateError> {
    let mut rows = Vec::new();

    for (line_idx, line) in csv_content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Parse CSV fields handling optional quotes
        let fields = parse_csv_line(trimmed);
        if fields.len() < 3 {
            continue;
        }

        // Skip header line if present
        let col0_lower = fields[0].to_lowercase();
        let col1_lower = fields[1].to_lowercase();
        if (col0_lower.contains("file")
            || col0_lower.contains("track")
            || col0_lower.contains("path"))
            && (col1_lower.contains("bpm") || col1_lower.contains("tempo"))
        {
            continue;
        }

        let file = fields[0].trim().to_string();
        let bpm: f64 = fields[1].trim().parse().map_err(|e| {
            ValidateError::CsvParse(format!(
                "invalid BPM on line {}: '{}' ({e})",
                line_idx + 1,
                fields[1]
            ))
        })?;

        let camelot = parse_key_flexible(fields[2].trim())?;

        rows.push(GroundTruthRow { file, bpm, camelot });
    }

    Ok(rows)
}

/// Simple CSV line splitter that respects quoted strings.
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_quotes && chars.peek() == Some(&'"') {
                    // Escaped quote
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = !in_quotes;
                }
            }
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current = String::new();
            }
            _ => current.push(c),
        }
    }
    fields.push(current.trim().to_string());
    fields
}

/// Generates a complete CSV string from analyzed rows.
#[must_use]
pub fn generate_csv(rows: &[AnalysisRow]) -> String {
    let mut out = String::from("file,bpm,key,camelot,lufs,energy\n");
    for row in rows {
        out.push_str(&row.to_csv_row());
        out.push('\n');
    }
    out
}

/// Evaluates detected analysis against ground truth and produces [`ValidationReport`].
#[must_use]
pub fn evaluate_accuracy(
    analyzed: &[AnalysisRow],
    ground_truth: &[GroundTruthRow],
) -> ValidationReport {
    let mut comparisons = Vec::new();

    let mut bpm_within_0_5_count = 0;
    let mut bpm_octave_correct_count = 0;
    let mut exact_key_count = 0;
    let mut camelot_adjacent_count = 0;

    let mut dist_0_same_count = 0;
    let mut dist_0_flip_count = 0;
    let mut dist_1_same_count = 0;
    let mut dist_1_flip_count = 0;
    let mut dist_2_plus_count = 0;

    let mut total_bpm_diff = 0.0;

    for row in analyzed {
        // Find matching ground-truth entry by filename or base name (case-insensitive)
        let row_filename = Path::new(&row.file)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&row.file)
            .to_lowercase();

        let matched_gt = ground_truth.iter().find(|gt| {
            let gt_filename = Path::new(&gt.file)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&gt.file)
                .to_lowercase();

            gt_filename == row_filename
                || gt_filename == row.file.to_lowercase()
                || gt.file.eq_ignore_ascii_case(&row.file)
        });

        if let Some(gt) = matched_gt {
            let bpm_diff = (row.bpm - gt.bpm).abs();
            total_bpm_diff += bpm_diff;

            let bpm_within_0_5 = bpm_diff <= 0.5;
            if bpm_within_0_5 {
                bpm_within_0_5_count += 1;
            }

            // Octave relation check:
            // 1. Within 0.5 BPM of direct, 2x, or 0.5x
            // 2. OR within 3% ratio per AGENTS.md 6.3
            let is_direct_octave = bpm_diff <= 0.5 || (row.bpm / gt.bpm - 1.0).abs() <= 0.03;
            let is_double_octave = (row.bpm - 2.0 * gt.bpm).abs() <= 0.5
                || (row.bpm / (2.0 * gt.bpm) - 1.0).abs() <= 0.03;
            let is_half_octave = (row.bpm - 0.5 * gt.bpm).abs() <= 0.5
                || (row.bpm / (0.5 * gt.bpm) - 1.0).abs() <= 0.03;

            let bpm_octave_correct = is_direct_octave || is_double_octave || is_half_octave;
            if bpm_octave_correct {
                bpm_octave_correct_count += 1;
            }

            // Key distance calculation
            let (key_distance, mode_flip) = row.camelot.distance(&gt.camelot);
            let exact_key = key_distance == 0 && !mode_flip;
            let camelot_adjacent = key_distance <= 1;

            if exact_key {
                exact_key_count += 1;
            }
            if camelot_adjacent {
                camelot_adjacent_count += 1;
            }

            match (key_distance, mode_flip) {
                (0, false) => dist_0_same_count += 1,
                (0, true) => dist_0_flip_count += 1,
                (1, false) => dist_1_same_count += 1,
                (1, true) => dist_1_flip_count += 1,
                _ => dist_2_plus_count += 1,
            }

            // Octave-adjusted BPM difference for error scoring
            let min_bpm_err = bpm_diff
                .min((row.bpm - 2.0 * gt.bpm).abs())
                .min((row.bpm - 0.5 * gt.bpm).abs());
            let phi_tempo = (min_bpm_err / 6.0).min(1.0);

            // Phi_key lookup table from AGENTS.md 6.3
            let phi_key = match (key_distance, mode_flip) {
                (0, false) => 0.0,
                (0, true) => 0.10,
                (1, false) => 0.10,
                (1, true) => 0.40,
                (2, false) => 0.35,
                (2, true) => 0.60,
                (3, false) => 0.70,
                (3, true) => 0.80,
                (4, false) => 0.85,
                (4, true) => 0.90,
                (5, false) => 0.95,
                (5, true) => 0.95,
                _ => 1.0,
            };

            let error_score = 0.5 * phi_tempo + 0.5 * phi_key;

            comparisons.push(TrackComparison {
                file: row.file.clone(),
                detected_bpm: row.bpm,
                gt_bpm: gt.bpm,
                bpm_diff,
                bpm_within_0_5,
                bpm_octave_correct,
                detected_camelot: row.camelot,
                gt_camelot: gt.camelot,
                key_distance,
                mode_flip,
                exact_key,
                camelot_adjacent,
                error_score,
            });
        }
    }

    let total_matched = comparisons.len();
    let mean_bpm_error = if total_matched > 0 {
        total_bpm_diff / total_matched as f64
    } else {
        0.0
    };

    // Sort descending by error score to identify worst files
    let mut sorted = comparisons.clone();
    sorted.sort_by(|a, b| {
        b.error_score
            .partial_cmp(&a.error_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let worst_10 = sorted.into_iter().take(10).collect();

    ValidationReport {
        total_analyzed: analyzed.len(),
        total_matched,
        bpm_within_0_5_count,
        bpm_octave_correct_count,
        mean_bpm_error,
        exact_key_count,
        camelot_adjacent_count,
        dist_0_same_count,
        dist_0_flip_count,
        dist_1_same_count,
        dist_1_flip_count,
        dist_2_plus_count,
        comparisons,
        worst_10,
    }
}

impl fmt::Display for ValidationReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(
            f,
            "================================================================================"
        )?;
        writeln!(f, "                    VALIDATION ACCURACY REPORT")?;
        writeln!(
            f,
            "================================================================================"
        )?;

        let match_pct = if self.total_analyzed > 0 {
            (self.total_matched as f64 / self.total_analyzed as f64) * 100.0
        } else {
            0.0
        };

        writeln!(f, "Analyzed Audio Files:  {}", self.total_analyzed)?;
        writeln!(
            f,
            "Ground-Truth Matched:  {} ({:.1}%)",
            self.total_matched, match_pct
        )?;
        writeln!(f)?;

        if self.total_matched == 0 {
            writeln!(
                f,
                "Warning: No ground-truth records matched the analyzed filenames."
            )?;
            return Ok(());
        }

        let total_f = self.total_matched as f64;
        let bpm_05_pct = (self.bpm_within_0_5_count as f64 / total_f) * 100.0;
        let bpm_oct_pct = (self.bpm_octave_correct_count as f64 / total_f) * 100.0;
        let key_exact_pct = (self.exact_key_count as f64 / total_f) * 100.0;
        let key_adj_pct = (self.camelot_adjacent_count as f64 / total_f) * 100.0;

        writeln!(f, "Tempo (BPM) Evaluation:")?;
        writeln!(
            f,
            "  • Within +/-0.5 BPM:            {:4} / {:<4} ({:5.1}%)",
            self.bpm_within_0_5_count, self.total_matched, bpm_05_pct
        )?;
        writeln!(
            f,
            "  • Correct up to an Octave:      {:4} / {:<4} ({:5.1}%)",
            self.bpm_octave_correct_count, self.total_matched, bpm_oct_pct
        )?;
        writeln!(
            f,
            "  • Mean Absolute BPM Error:      {:.2} BPM",
            self.mean_bpm_error
        )?;
        writeln!(f)?;

        writeln!(f, "Musical Key (Camelot) Evaluation:")?;
        writeln!(
            f,
            "  • Exact Key Match:              {:4} / {:<4} ({:5.1}%)",
            self.exact_key_count, self.total_matched, key_exact_pct
        )?;
        writeln!(
            f,
            "  • Camelot-Adjacent (d <= 1):    {:4} / {:<4} ({:5.1}%)",
            self.camelot_adjacent_count, self.total_matched, key_adj_pct
        )?;
        writeln!(f, "  • Harmonic Relationship Breakdown:")?;
        writeln!(
            f,
            "      - Exact Match (d=0, same):  {:4} ({:5.1}%)",
            self.dist_0_same_count,
            (self.dist_0_same_count as f64 / total_f) * 100.0
        )?;
        writeln!(
            f,
            "      - Relative Switch (d=0, flip): {:4} ({:5.1}%)",
            self.dist_0_flip_count,
            (self.dist_0_flip_count as f64 / total_f) * 100.0
        )?;
        writeln!(
            f,
            "      - Perfect Fifth (d=1, same): {:4} ({:5.1}%)",
            self.dist_1_same_count,
            (self.dist_1_same_count as f64 / total_f) * 100.0
        )?;
        writeln!(
            f,
            "      - Adjacent Sector (d=1, flip): {:4} ({:5.1}%)",
            self.dist_1_flip_count,
            (self.dist_1_flip_count as f64 / total_f) * 100.0
        )?;
        writeln!(
            f,
            "      - Distant (d >= 2):         {:4} ({:5.1}%)",
            self.dist_2_plus_count,
            (self.dist_2_plus_count as f64 / total_f) * 100.0
        )?;
        writeln!(f)?;

        writeln!(f, "Worst 10 Files (Ranked by Error Severity):")?;
        writeln!(
            f,
            "--------------------------------------------------------------------------------"
        )?;
        writeln!(
            f,
            "{:<4} | {:<24} | {:<16} | {:<16} | {:<8} | {:<8}",
            "Rank", "File", "Detected", "Ground Truth", "BPM Err", "Key Dist"
        )?;
        writeln!(
            f,
            "--------------------------------------------------------------------------------"
        )?;

        for (idx, item) in self.worst_10.iter().enumerate() {
            let filename = Path::new(&item.file)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&item.file);

            let truncated_name = if filename.len() > 24 {
                format!("{}...", &filename[..21])
            } else {
                filename.to_string()
            };

            let det_str = format!("{:.1} ({})", item.detected_bpm, item.detected_camelot);
            let gt_str = format!("{:.1} ({})", item.gt_bpm, item.gt_camelot);
            let bpm_err_str = format!("{:+5.1}", item.detected_bpm - item.gt_bpm);
            let key_dist_str = if item.mode_flip {
                format!("d={} (flip)", item.key_distance)
            } else {
                format!("d={}", item.key_distance)
            };

            writeln!(
                f,
                "{:<4} | {:<24} | {:<16} | {:<16} | {:<8} | {:<8}",
                idx + 1,
                truncated_name,
                det_str,
                gt_str,
                bpm_err_str,
                key_dist_str
            )?;
        }

        writeln!(
            f,
            "================================================================================"
        )?;

        Ok(())
    }
}

/// Recursively scans an audio folder and returns sorted file paths.
pub fn discover_audio_files<P: AsRef<Path>>(folder: P) -> Result<Vec<PathBuf>, ValidateError> {
    let mut audio_paths = Vec::new();
    let supported_exts = [
        "wav", "mp3", "flac", "aif", "aiff", "ogg", "m4a", "aac", "wma",
    ];

    fn visit_dir(
        dir: &Path,
        supported: &[&str],
        acc: &mut Vec<PathBuf>,
    ) -> Result<(), std::io::Error> {
        if !dir.is_dir() {
            return Ok(());
        }
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                visit_dir(&path, supported, acc)?;
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if supported.iter().any(|&s| s.eq_ignore_ascii_case(ext)) {
                    acc.push(path);
                }
            }
        }
        Ok(())
    }

    visit_dir(folder.as_ref(), &supported_exts, &mut audio_paths)?;
    audio_paths.sort();

    if audio_paths.is_empty() {
        return Err(ValidateError::NoAudioFilesFound(
            folder.as_ref().display().to_string(),
        ));
    }

    Ok(audio_paths)
}

/// Analyzes an audio file and returns its [`AnalysisRow`] metrics.
///
/// # Errors
/// Returns [`ValidateError::Decode`] or [`ValidateError::Analysis`] if decoding or DSP fails.
pub fn analyze_single_file<P: AsRef<Path>>(path: P) -> Result<AnalysisRow, ValidateError> {
    let path_ref = path.as_ref();
    let decoded = audio_io::decode_file(path_ref).map_err(|e| ValidateError::Decode {
        path: path_ref.to_path_buf(),
        source: e,
    })?;

    let analysis: TrackAnalysis =
        audio_analysis::pipeline::analyze_decoded(&decoded).map_err(|e| {
            ValidateError::Analysis {
                path: path_ref.to_path_buf(),
                source: e,
            }
        })?;

    let file_name = path_ref
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio_file")
        .to_string();

    Ok(AnalysisRow {
        file: file_name,
        path: path_ref.to_path_buf(),
        bpm: (analysis.rhythm.grid.bpm * 10.0).round() / 10.0,
        key: analysis.key.camelot.to_standard_name().to_string(),
        camelot: analysis.key.camelot,
        lufs: (analysis.loudness.integrated_lufs * 10.0).round() / 10.0,
        energy: analysis.energy_score,
    })
}

/// Recursively scans and analyzes all audio files within a target directory.
///
/// # Errors
/// Returns [`ValidateError`] if directory traversal or audio processing fails.
pub fn analyze_folder<P: AsRef<Path>>(folder: P) -> Result<Vec<AnalysisRow>, ValidateError> {
    let audio_files = discover_audio_files(folder)?;
    let mut results = Vec::with_capacity(audio_files.len());

    for path in audio_files {
        match analyze_single_file(&path) {
            Ok(row) => results.push(row),
            Err(err) => eprintln!("Warning: failed to analyze {}: {err}", path.display()),
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_key_flexible_camelot() {
        assert_eq!(parse_key_flexible("8A").unwrap().to_string(), "8A");
        assert_eq!(parse_key_flexible("11b").unwrap().to_string(), "11B");
        assert_eq!(parse_key_flexible(" 1A ").unwrap().to_string(), "1A");
        assert_eq!(parse_key_flexible("12B").unwrap().to_string(), "12B");
    }

    #[test]
    fn test_parse_key_flexible_standard_names() {
        assert_eq!(parse_key_flexible("A minor").unwrap().to_string(), "8A");
        assert_eq!(parse_key_flexible("C major").unwrap().to_string(), "8B");
        assert_eq!(parse_key_flexible("Eb minor").unwrap().to_string(), "2A");
        assert_eq!(parse_key_flexible("F# major").unwrap().to_string(), "2B");
        assert_eq!(parse_key_flexible("Db major").unwrap().to_string(), "3B");
    }

    #[test]
    fn test_parse_key_flexible_shorthand() {
        assert_eq!(parse_key_flexible("Am").unwrap().to_string(), "8A");
        assert_eq!(parse_key_flexible("C").unwrap().to_string(), "8B");
        assert_eq!(parse_key_flexible("Em").unwrap().to_string(), "9A");
        assert_eq!(parse_key_flexible("G").unwrap().to_string(), "9B");
        assert_eq!(parse_key_flexible("F#m").unwrap().to_string(), "11A");
        assert_eq!(parse_key_flexible("A").unwrap().to_string(), "11B");
    }

    #[test]
    fn test_parse_ground_truth_csv() {
        let csv = "file,bpm,key\n\
                   track1.mp3,128.0,8A\n\
                   track2.wav,124.5,C major\n\
                   \"track3 with space.flac\",174.0,Am\n";

        let parsed = parse_ground_truth(csv).unwrap();
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].file, "track1.mp3");
        assert_eq!(parsed[0].bpm, 128.0);
        assert_eq!(parsed[0].camelot.to_string(), "8A");

        assert_eq!(parsed[1].file, "track2.wav");
        assert_eq!(parsed[1].bpm, 124.5);
        assert_eq!(parsed[1].camelot.to_string(), "8B");

        assert_eq!(parsed[2].file, "track3 with space.flac");
        assert_eq!(parsed[2].bpm, 174.0);
        assert_eq!(parsed[2].camelot.to_string(), "8A");
    }

    #[test]
    fn test_evaluate_accuracy_metrics() {
        let analyzed = vec![
            AnalysisRow {
                file: "track1.mp3".to_string(),
                path: PathBuf::from("track1.mp3"),
                bpm: 128.1,
                key: "A minor".to_string(),
                camelot: "8A".parse().unwrap(),
                lufs: -14.0,
                energy: 7,
            },
            AnalysisRow {
                file: "track2.mp3".to_string(),
                path: PathBuf::from("track2.mp3"),
                bpm: 87.0, // Octave of 174
                key: "C major".to_string(),
                camelot: "8B".parse().unwrap(),
                lufs: -13.5,
                energy: 8,
            },
            AnalysisRow {
                file: "track3.mp3".to_string(),
                path: PathBuf::from("track3.mp3"),
                bpm: 120.0,
                key: "E minor".to_string(),
                camelot: "9A".parse().unwrap(), // Fifth (d=1) of 8A
                lufs: -15.0,
                energy: 5,
            },
        ];

        let gt = vec![
            GroundTruthRow {
                file: "track1.mp3".to_string(),
                bpm: 128.0,
                camelot: "8A".parse().unwrap(),
            },
            GroundTruthRow {
                file: "track2.mp3".to_string(),
                bpm: 174.0,
                camelot: "8B".parse().unwrap(),
            },
            GroundTruthRow {
                file: "track3.mp3".to_string(),
                bpm: 120.2,
                camelot: "8A".parse().unwrap(),
            },
        ];

        let report = evaluate_accuracy(&analyzed, &gt);
        assert_eq!(report.total_matched, 3);
        // Track 1: within 0.1 (<0.5)
        // Track 2: 87 vs 174 (diff 87, but octave 87*2=174 within 0.5)
        // Track 3: 120.0 vs 120.2 (diff 0.2 < 0.5)
        assert_eq!(report.bpm_within_0_5_count, 2);
        assert_eq!(report.bpm_octave_correct_count, 3);

        // Keys:
        // Track 1: 8A == 8A (exact)
        // Track 2: 8B == 8B (exact)
        // Track 3: 9A vs 8A (d=1, adjacent)
        assert_eq!(report.exact_key_count, 2);
        assert_eq!(report.camelot_adjacent_count, 3);

        // Report formatted string contains expected sections
        let rep_str = report.to_string();
        assert!(rep_str.contains("VALIDATION ACCURACY REPORT"));
        assert!(rep_str.contains("Within +/-0.5 BPM"));
        assert!(rep_str.contains("Correct up to an Octave"));
        assert!(rep_str.contains("Exact Key Match"));
        assert!(rep_str.contains("Worst 10 Files"));
    }
}
