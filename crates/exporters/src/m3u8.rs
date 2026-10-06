//! M3U8 playlist exporter.
//!
//! Generates UTF-8 extended M3U8 playlist files with `#EXTINF` duration/title tags
//! supporting both absolute and relative track file paths.

use crate::ExportError;
use core_types::SetlistEntry;
use std::fs;
use std::path::{Path, PathBuf};

/// Path mode used when writing track references in an M3U8 playlist.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum M3u8PathMode {
    /// Write absolute filesystem paths (default).
    #[default]
    Absolute,
    /// Write relative filesystem paths relative to the playlist output directory.
    Relative,
}

/// Resolves a track path to an absolute path.
///
/// If `path_str` is already absolute, returns it directly. If relative, combines it
/// with the current working directory. On Windows, strips any verbatim `\\?\` prefix.
#[must_use]
pub fn resolve_absolute_path(path_str: &str) -> String {
    let raw = path_str.strip_prefix(r"\\?\").unwrap_or(path_str);
    let path = Path::new(raw);
    let abs_buf: PathBuf = if path.is_absolute() {
        path.to_path_buf()
    } else {
        match std::env::current_dir() {
            Ok(cwd) => cwd.join(path),
            Err(_) => path.to_path_buf(),
        }
    };

    let s = abs_buf.to_string_lossy().to_string();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        s
    }
}

/// Resolves a track path to a relative path relative to `base_dir`.
///
/// If `base_dir` is not provided, returns the track path normalized with forward slashes.
/// If `path_str` is already relative, preserves it.
/// If both are on matching roots, calculates the relative path traversal (`..` as necessary).
#[must_use]
pub fn resolve_relative_path(path_str: &str, base_dir: Option<&Path>) -> String {
    let raw = path_str.strip_prefix(r"\\?\").unwrap_or(path_str);
    let track_path = Path::new(raw);

    if let Some(base) = base_dir {
        let base_raw = base.to_string_lossy();
        let clean_base_str = base_raw.strip_prefix(r"\\?\").unwrap_or(&base_raw);
        let clean_base = Path::new(clean_base_str);

        // If track path is already relative, return normalized
        if track_path.is_relative() {
            return track_path.to_string_lossy().replace('\\', "/");
        }

        // Try direct strip_prefix if track is within base_dir or a subdirectory
        if let Ok(rel) = track_path.strip_prefix(clean_base) {
            return rel.to_string_lossy().replace('\\', "/");
        }

        // Calculate relative components between two absolute paths on matching roots
        let base_comps: Vec<_> = clean_base.components().collect();
        let track_comps: Vec<_> = track_path.components().collect();

        if !base_comps.is_empty() && !track_comps.is_empty() && base_comps[0] == track_comps[0] {
            let mut common = 0;
            while common < base_comps.len()
                && common < track_comps.len()
                && base_comps[common] == track_comps[common]
            {
                common += 1;
            }

            let mut rel_buf = PathBuf::new();
            for _ in common..base_comps.len() {
                rel_buf.push("..");
            }
            for comp in &track_comps[common..] {
                rel_buf.push(comp.as_os_str());
            }

            return rel_buf.to_string_lossy().replace('\\', "/");
        }
    }

    track_path.to_string_lossy().replace('\\', "/")
}

/// Generates M3U8 playlist text from the given setlist entries with custom path mode.
#[must_use]
pub fn generate_m3u8_with_mode(
    entries: &[SetlistEntry],
    mode: M3u8PathMode,
    base_dir: Option<&Path>,
) -> String {
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

        // Strip carriage returns and line feeds to guarantee single-line #EXTINF
        let clean_title = title.replace("\r\n", " ").replace(['\r', '\n'], " ");
        let clean_artist = artist.replace("\r\n", " ").replace(['\r', '\n'], " ");

        let display = if !clean_artist.is_empty() {
            format!("{clean_artist} - {clean_title}")
        } else {
            clean_title
        };

        let path_str = track
            .map(|t| t.path.as_str())
            .unwrap_or(entry.track_id.as_str());

        let formatted_path = match mode {
            M3u8PathMode::Absolute => resolve_absolute_path(path_str),
            M3u8PathMode::Relative => resolve_relative_path(path_str, base_dir),
        };

        out.push_str(&format!("#EXTINF:{duration_s},{display}\n"));
        out.push_str(&format!("{formatted_path}\n"));
    }

    out
}

/// Generates M3U8 playlist text using default absolute path mode.
#[must_use]
pub fn generate_m3u8(entries: &[SetlistEntry]) -> String {
    generate_m3u8_with_mode(entries, M3u8PathMode::Absolute, None)
}

/// Exports setlist entries to an M3U8 playlist file with custom path mode and overwrite control.
///
/// # Errors
/// - Returns [`ExportError::FileExists`] if the destination file already exists and `overwrite` is false.
/// - Returns [`ExportError::Io`] if file operations fail.
pub fn export_m3u8_with_mode<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
    overwrite: bool,
    path_mode: M3u8PathMode,
) -> Result<(), ExportError> {
    let path = output_path.as_ref();

    if path.exists() && !overwrite {
        return Err(ExportError::FileExists(path.to_path_buf()));
    }

    let base_dir = path.parent();
    let content = generate_m3u8_with_mode(entries, path_mode, base_dir);

    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    fs::write(path, content.as_bytes())?;
    Ok(())
}

/// Exports setlist entries to an M3U8 playlist file with overwrite control using absolute paths.
///
/// # Errors
/// Returns [`ExportError`] on write failure or if the file exists and overwrite is false.
pub fn export_m3u8_with_options<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
    overwrite: bool,
) -> Result<(), ExportError> {
    export_m3u8_with_mode(entries, output_path, overwrite, M3u8PathMode::Absolute)
}

/// Exports setlist entries to an M3U8 playlist file with default options.
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
    fn test_m3u8_relative_path_mode() {
        let e1 = make_test_entry(
            1,
            "t1",
            "Song One",
            "Artist",
            r"C:\Music\Collection\Sub\Song1.mp3",
        );
        let e2 = make_test_entry(
            2,
            "t2",
            "Song Two",
            "Artist",
            r"C:\Music\Collection\Other\Song2.mp3",
        );

        let playlist_dir = Path::new(r"C:\Music\Collection\Playlists");
        let m3u8 = generate_m3u8_with_mode(&[e1, e2], M3u8PathMode::Relative, Some(playlist_dir));

        assert!(m3u8.starts_with("#EXTM3U\n"));
        assert!(m3u8.contains("../Sub/Song1.mp3\n"));
        assert!(m3u8.contains("../Other/Song2.mp3\n"));
    }

    #[test]
    fn test_m3u8_newline_sanitization() {
        let e1 = make_test_entry(
            1,
            "t1",
            "Song With\r\nNewline",
            "Artist\nMultiline",
            r"C:\Music\Song.mp3",
        );

        let m3u8 = generate_m3u8(&[e1]);
        assert!(m3u8.contains("#EXTINF:180,Artist Multiline - Song With Newline\n"));
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
