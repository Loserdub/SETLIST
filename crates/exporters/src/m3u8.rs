//! M3U8 playlist exporter.
//!
//! Generates UTF-8 extended M3U8 playlist files with `#EXTINF` duration/title tags
//! and absolute track file paths.

use crate::ExportError;
use core_types::SetlistEntry;
use std::fs;
use std::path::{Path, PathBuf};

/// Resolves a track path to an absolute path.
///
/// If `path_str` is already absolute, returns it directly. If relative, combines it
/// with the current working directory. On Windows, strips any verbatim `\\?\` prefix.
#[must_use]
pub fn resolve_absolute_path(path_str: &str) -> String {
    let path = Path::new(path_str);
    let abs_buf: PathBuf = if path.is_absolute() {
        path.to_path_buf()
    } else {
        match std::env::current_dir() {
            Ok(cwd) => cwd.join(path),
            Err(_) => path.to_path_buf(),
        }
    };

    let s = abs_buf.to_string_lossy().to_string();
    // Normalize Windows extended-length prefix \\?\ if present
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        s
    }
}

/// Generates M3U8 playlist text from the given setlist entries.
#[must_use]
pub fn generate_m3u8(entries: &[SetlistEntry]) -> String {
    let mut out = String::from("#EXTM3U\n");

    for entry in entries {
        let track = entry.track.as_ref();
        let duration_s = track
            .map(|t| (t.duration_ms / 1000.0).round() as i64)
            .unwrap_or(-1);

        let title = track
            .and_then(|t| t.tags.title.as_deref())
            .unwrap_or(entry.track_id.as_str());

        let artist = track.and_then(|t| t.tags.artist.as_deref()).unwrap_or("");

        let display = if !artist.is_empty() {
            format!("{artist} - {title}")
        } else {
            title.to_string()
        };

        let path_str = track
            .map(|t| t.path.as_str())
            .unwrap_or(entry.track_id.as_str());
        let abs_path = resolve_absolute_path(path_str);

        out.push_str(&format!("#EXTINF:{duration_s},{display}\n"));
        out.push_str(&format!("{abs_path}\n"));
    }

    out
}

/// Exports setlist entries to an M3U8 playlist file with overwrite control.
///
/// # Errors
/// - Returns [`ExportError::FileExists`] if the destination file already exists and `overwrite` is false.
/// - Returns [`ExportError::Io`] if file operations fail.
pub fn export_m3u8_with_options<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
    overwrite: bool,
) -> Result<(), ExportError> {
    let path = output_path.as_ref();

    if path.exists() && !overwrite {
        return Err(ExportError::FileExists(path.to_path_buf()));
    }

    let content = generate_m3u8(entries);

    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    fs::write(path, content)?;
    Ok(())
}

/// Exports setlist entries to an M3U8 playlist file.
///
/// Does not overwrite existing files by default.
///
/// # Errors
/// Returns [`ExportError`] on write failure or if the file exists.
pub fn export_m3u8<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
) -> Result<(), ExportError> {
    export_m3u8_with_options(entries, output_path, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{Track, TrackTags};

    fn make_test_entry(pos: u32, id: &str, title: &str, artist: &str, path: &str) -> SetlistEntry {
        SetlistEntry {
            position: pos,
            track_id: id.to_string(),
            track: Some(Track {
                id: id.to_string(),
                path: path.to_string(),
                hash: "dummy_hash".to_string(),
                tags: TrackTags {
                    title: Some(title.to_string()),
                    artist: Some(artist.to_string()),
                    album: Some("Test Album".to_string()),
                },
                duration_ms: 180_000.0,
                analysis: None,
                analyzed_at: None,
                analysis_version: None,
            }),
            transition: None,
            target_energy: None,
        }
    }

    #[test]
    fn test_m3u8_golden_generation() {
        let e1 = make_test_entry(1, "t1", "First Song", "Artist A", r"C:\Music\Song1.mp3");
        let e2 = make_test_entry(2, "t2", "Second Song", "Artist B", r"C:\Music\Song2.mp3");

        let m3u8 = generate_m3u8(&[e1, e2]);

        assert!(m3u8.starts_with("#EXTM3U\n"));
        assert!(m3u8.contains("#EXTINF:180,Artist A - First Song\n"));
        assert!(m3u8.contains("C:\\Music\\Song1.mp3\n"));
        assert!(m3u8.contains("#EXTINF:180,Artist B - Second Song\n"));
        assert!(m3u8.contains("C:\\Music\\Song2.mp3\n"));
    }

    #[test]
    fn test_m3u8_overwrite_protection() {
        let temp_dir = std::env::temp_dir().join("m3u8_test");
        let temp_file = temp_dir.join("test.m3u8");

        let e1 = make_test_entry(1, "t1", "Song", "Artist", r"C:\Music\Song.mp3");

        // Write first time with overwrite = true
        export_m3u8_with_options(std::slice::from_ref(&e1), &temp_file, true).unwrap();
        assert!(temp_file.exists());

        // Second time without overwrite should fail
        let err = export_m3u8(std::slice::from_ref(&e1), &temp_file).unwrap_err();
        assert!(matches!(err, ExportError::FileExists(_)));

        // Third time with overwrite should succeed
        export_m3u8_with_options(std::slice::from_ref(&e1), &temp_file, true).unwrap();

        let _ = fs::remove_file(temp_file);
        let _ = fs::remove_dir(temp_dir);
    }
}
