//! Application diagnostics and system health reporting.
//!
//! Exposes Tauri commands for querying application metadata, log file locations,
//! database stats, and opening the diagnostic log folder.
//! Ensures privacy by redacting any file paths outside the application data folder
//! unless explicitly opted-in by the user.

use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

use crate::state::AppState;

/// Diagnostic information about the application state, storage, and runtime environment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiagnosticsInfo {
    /// SETLIST package version (e.g. "0.1.0").
    pub app_version: String,
    /// Absolute path to the setlist.log file.
    pub log_file_path: String,
    /// Absolute path to the SQLite library database.
    pub database_path: String,
    /// Current count of analyzed audio tracks in the library.
    pub track_count: usize,
    /// Application data directory root.
    pub app_data_dir: String,
    /// Target operating system.
    pub os: String,
    /// Target CPU architecture.
    pub arch: String,
}

/// Checks whether a given path is contained within the application data directory.
#[must_use]
pub fn is_inside_app_data(path: &Path, app_data_dir: &Path) -> bool {
    let canonical_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let canonical_app_data = app_data_dir
        .canonicalize()
        .unwrap_or_else(|_| app_data_dir.to_path_buf());
    canonical_path.starts_with(canonical_app_data)
}

/// Sanitizes a file path for diagnostic reporting.
/// When `include_paths` is false, any path outside the app data folder is redacted.
#[must_use]
pub fn sanitize_path(path_str: &str, app_data_dir: &str, include_paths: bool) -> String {
    if include_paths {
        return path_str.to_string();
    }
    let p = Path::new(path_str);
    let app_data = Path::new(app_data_dir);
    if path_str.starts_with(app_data_dir) || is_inside_app_data(p, app_data) {
        path_str.to_string()
    } else {
        "[path outside app data redacted]".to_string()
    }
}

/// Formats diagnostics into a plain text report.
/// Strictly excludes any audio samples, waveforms, or cues.
#[must_use]
pub fn format_diagnostics_report(info: &DiagnosticsInfo, include_paths: bool) -> String {
    let sanitized_log = sanitize_path(&info.log_file_path, &info.app_data_dir, include_paths);
    let sanitized_db = sanitize_path(&info.database_path, &info.app_data_dir, include_paths);
    let sanitized_data = sanitize_path(&info.app_data_dir, &info.app_data_dir, true); // Root app data is always public within app data

    format!(
        "=== SETLIST Diagnostics Report ===\n\
         App Version: {}\n\
         OS: {} ({})\n\
         App Data Folder: {}\n\
         Log File: {}\n\
         Database: {}\n\
         Track Count: {}\n\
         Include External Paths: {}\n\
         ==================================",
        info.app_version,
        info.os,
        info.arch,
        sanitized_data,
        sanitized_log,
        sanitized_db,
        info.track_count,
        if include_paths { "Yes" } else { "No" }
    )
}

/// Retrieves application diagnostics including paths, version, and database track count.
///
/// # Errors
/// Returns error text if the database mutex cannot be acquired.
#[tauri::command]
pub fn get_diagnostics(state: State<'_, AppState>) -> Result<DiagnosticsInfo, String> {
    let app_data_dir = crate::resolve_app_data_dir();
    let log_file_path = app_data_dir.join("setlist.log");
    let database_path = state
        .db_path
        .clone()
        .unwrap_or_else(|| app_data_dir.join("library.db"));

    let track_count = {
        let conn = state
            .db
            .lock()
            .map_err(|e| format!("database mutex error: {e}"))?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tracks;", [], |row| row.get(0))
            .unwrap_or(0);
        count.max(0) as usize
    };

    Ok(DiagnosticsInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        log_file_path: log_file_path.to_string_lossy().to_string(),
        database_path: database_path.to_string_lossy().to_string(),
        track_count,
        app_data_dir: app_data_dir.to_string_lossy().to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    })
}

/// Opens the application log folder in the operating system's native file explorer.
///
/// # Errors
/// Returns error text if the directory launcher process fails.
#[tauri::command]
pub fn open_log_folder() -> Result<(), String> {
    let app_data_dir = crate::resolve_app_data_dir();
    if !app_data_dir.exists() {
        let _ = std::fs::create_dir_all(&app_data_dir);
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&app_data_dir)
            .spawn()
            .map_err(|e| format!("failed to launch Windows Explorer: {e}"))?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&app_data_dir)
            .spawn()
            .map_err(|e| format!("failed to launch Finder: {e}"))?;
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&app_data_dir)
            .spawn()
            .map_err(|e| format!("failed to launch directory: {e}"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnostics_info_serialization() {
        let info = DiagnosticsInfo {
            app_version: "0.1.0".to_string(),
            log_file_path: "C:/AppData/setlist.log".to_string(),
            database_path: "C:/AppData/library.db".to_string(),
            track_count: 42,
            app_data_dir: "C:/AppData".to_string(),
            os: "windows".to_string(),
            arch: "x86_64".to_string(),
        };

        let json = serde_json::to_string(&info).expect("serialize diagnostics");
        assert!(json.contains("\"app_version\":\"0.1.0\""));
        assert!(json.contains("\"track_count\":42"));

        let deserialized: DiagnosticsInfo =
            serde_json::from_str(&json).expect("deserialize diagnostics");
        assert_eq!(info, deserialized);
    }

    #[test]
    fn test_path_sanitization_redacts_external_paths_unless_opted_in() {
        let app_data = "C:/Users/User/AppData/Roaming/com.setlist.desktop";
        let external_music_path = "D:/PrivateMusicLibrary/SuperSecretTrack.mp3";
        let internal_log_path = "C:/Users/User/AppData/Roaming/com.setlist.desktop/setlist.log";

        // Without opt-in (default)
        let redacted = sanitize_path(external_music_path, app_data, false);
        assert_eq!(redacted, "[path outside app data redacted]");

        let internal_kept = sanitize_path(internal_log_path, app_data, false);
        assert_eq!(internal_kept, internal_log_path);

        // With opt-in
        let allowed = sanitize_path(external_music_path, app_data, true);
        assert_eq!(allowed, external_music_path);
    }

    #[test]
    fn test_diagnostics_report_has_no_audio_data_and_no_secrets() {
        let info = DiagnosticsInfo {
            app_version: "0.1.0".to_string(),
            log_file_path: "C:/AppData/Roaming/com.setlist.desktop/setlist.log".to_string(),
            database_path: "C:/AppData/Roaming/com.setlist.desktop/library.db".to_string(),
            track_count: 55,
            app_data_dir: "C:/AppData/Roaming/com.setlist.desktop".to_string(),
            os: "windows".to_string(),
            arch: "x86_64".to_string(),
        };

        let report = format_diagnostics_report(&info, false);

        // Required diagnostic fields are present
        assert!(report.contains("App Version: 0.1.0"));
        assert!(report.contains("Track Count: 55"));
        assert!(report.contains("Log File:"));
        assert!(report.contains("Database:"));

        // No audio data or waveform structures exist in report
        assert!(!report.contains("waveform"));
        assert!(!report.contains("low_peak"));
        assert!(!report.contains("rms"));
        assert!(!report.contains("bpm"));
        assert!(!report.contains("camelot"));
        assert!(!report.contains("cue"));
        assert!(!report.contains("pcm"));
    }
}
