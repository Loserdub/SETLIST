//! Setlist and metadata exporters for Rekordbox XML, M3U8, and set sheets.

pub mod rekordbox;

pub use rekordbox::{
    encode_location, format_tonality, generate_rekordbox_xml, parse_hex_color, KeyNotation,
    ProductInfo, RekordboxExportOptions,
};

use core_types::SetlistEntry;
use std::path::{Path, PathBuf};
use thiserror::Error;

/// Error returned when exporting a setlist fails.
#[derive(Debug, Error)]
pub enum ExportError {
    /// Functionality is not yet implemented.
    #[error("not implemented")]
    NotImplemented,
    /// Destination file already exists.
    #[error("output file already exists: {0}")]
    FileExists(PathBuf),
    /// I/O or filesystem error.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    /// Formatting or serialization failure.
    #[error("export failed: {0}")]
    Failed(String),
}

/// Exports setlist to Pioneer Rekordbox XML format including track metadata and cue points.
///
/// # Errors
/// Returns [`ExportError`] on write or serialization failure, or if file exists and overwrite is false.
pub fn export_rekordbox_xml<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
) -> Result<(), ExportError> {
    rekordbox::export_rekordbox_xml(entries, output_path)
}

/// Exports setlist to Pioneer Rekordbox XML format with custom options.
///
/// # Errors
/// Returns [`ExportError`] on write or serialization failure.
pub fn export_rekordbox_xml_with_options<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
    options: &RekordboxExportOptions,
) -> Result<(), ExportError> {
    rekordbox::export_rekordbox_xml_with_options(entries, output_path, options)
}

/// Exports setlist to UTF-8 M3U8 playlist format.
///
/// # Errors
/// Returns `ExportError::NotImplemented`.
pub fn export_m3u8<P: AsRef<Path>>(
    _entries: &[SetlistEntry],
    _output_path: P,
) -> Result<(), ExportError> {
    Err(ExportError::NotImplemented)
}

/// Exports setlist sheet in tabular CSV format.
///
/// # Errors
/// Returns `ExportError::NotImplemented`.
pub fn export_set_sheet_csv<P: AsRef<Path>>(
    _entries: &[SetlistEntry],
    _output_path: P,
) -> Result<(), ExportError> {
    Err(ExportError::NotImplemented)
}

/// Exports setlist sheet in formatted Markdown document format.
///
/// # Errors
/// Returns `ExportError::NotImplemented`.
pub fn export_set_sheet_markdown<P: AsRef<Path>>(
    _entries: &[SetlistEntry],
    _output_path: P,
) -> Result<(), ExportError> {
    Err(ExportError::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_stubs() {
        assert!(matches!(
            export_m3u8(&[], "set.m3u8"),
            Err(ExportError::NotImplemented)
        ));
        assert!(matches!(
            export_set_sheet_csv(&[], "set.csv"),
            Err(ExportError::NotImplemented)
        ));
        assert!(matches!(
            export_set_sheet_markdown(&[], "set.md"),
            Err(ExportError::NotImplemented)
        ));
    }
}
