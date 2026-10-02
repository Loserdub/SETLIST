//! Setlist and metadata exporters for Rekordbox XML, M3U8, and set sheets.

pub mod m3u8;
pub mod rekordbox;
pub mod set_sheet;

pub use m3u8::{export_m3u8, export_m3u8_with_options, generate_m3u8, resolve_absolute_path};
pub use rekordbox::{
    encode_location, export_rekordbox_xml, export_rekordbox_xml_with_options, format_tonality,
    generate_rekordbox_xml, parse_hex_color, KeyNotation, ProductInfo, RekordboxExportOptions,
};
pub use set_sheet::{
    export_set_sheet_csv, export_set_sheet_csv_with_options, export_set_sheet_markdown,
    export_set_sheet_markdown_with_options, generate_set_sheet_csv, generate_set_sheet_markdown,
    resolve_cues,
};

use core_types::SetlistEntry;
use std::fs;
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
    /// JSON parsing or serialization error.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

/// Structure holding destination paths for all generated export files.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportReport {
    /// Pioneer Rekordbox XML playlist file path.
    pub xml_path: PathBuf,
    /// Extended M3U8 playlist file path.
    pub m3u8_path: PathBuf,
    /// Tabular CSV set sheet file path.
    pub csv_path: PathBuf,
    /// Formatted Markdown set sheet file path.
    pub markdown_path: PathBuf,
}

/// Represents setlist data input parsed from JSON for export.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
pub enum SetlistExportData {
    /// Wrapper object containing optional setlist name and track entries.
    Named {
        /// Name of the setlist or playlist.
        #[serde(default)]
        name: Option<String>,
        /// Ordered track entries.
        entries: Vec<SetlistEntry>,
    },
    /// Plain list of setlist entries.
    List(Vec<SetlistEntry>),
}

impl SetlistExportData {
    /// Returns the slice of setlist entries.
    #[must_use]
    pub fn entries(&self) -> &[SetlistEntry] {
        match self {
            Self::Named { entries, .. } => entries,
            Self::List(entries) => entries,
        }
    }

    /// Returns the setlist name if specified.
    #[must_use]
    pub fn name(&self) -> Option<&str> {
        match self {
            Self::Named { name, .. } => name.as_deref(),
            Self::List(_) => None,
        }
    }
}

/// Exports all three formats: Rekordbox XML, M3U8, and Set Sheet (CSV and Markdown).
///
/// # Errors
/// Returns [`ExportError`] if reading or parsing the JSON fails, or if writing any output file fails.
pub fn export_all_formats<P: AsRef<Path>, Q: AsRef<Path>>(
    input_json_path: P,
    output_dir: Q,
    custom_name: Option<&str>,
    overwrite: bool,
) -> Result<ExportReport, ExportError> {
    let json_bytes = fs::read(input_json_path.as_ref())?;
    let data: SetlistExportData = serde_json::from_slice(&json_bytes)?;

    let entries = data.entries();
    let set_name = custom_name.or_else(|| data.name()).unwrap_or("setlist");

    let out_dir = output_dir.as_ref();
    if !out_dir.exists() {
        fs::create_dir_all(out_dir)?;
    }

    let xml_path = out_dir.join(format!("{set_name}.xml"));
    let m3u8_path = out_dir.join(format!("{set_name}.m3u8"));
    let csv_path = out_dir.join(format!("{set_name}.csv"));
    let md_path = out_dir.join(format!("{set_name}.md"));

    let r_opts = RekordboxExportOptions {
        playlist_name: set_name.to_string(),
        overwrite,
        ..Default::default()
    };
    export_rekordbox_xml_with_options(entries, &xml_path, &r_opts)?;
    export_m3u8_with_options(entries, &m3u8_path, overwrite)?;
    export_set_sheet_csv_with_options(entries, &csv_path, overwrite)?;
    export_set_sheet_markdown_with_options(entries, &md_path, overwrite)?;

    Ok(ExportReport {
        xml_path,
        m3u8_path,
        csv_path,
        markdown_path: md_path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_setlist_export_data_deserialization() {
        let json_arr = r#"[
            {
                "position": 1,
                "track_id": "trk1",
                "track": null,
                "transition": null,
                "target_energy": null
            }
        ]"#;
        let data: SetlistExportData = serde_json::from_str(json_arr).unwrap();
        assert_eq!(data.entries().len(), 1);
        assert_eq!(data.name(), None);

        let json_obj = r#"{
            "name": "Summer Festival",
            "entries": [
                {
                    "position": 1,
                    "track_id": "trk1",
                    "track": null,
                    "transition": null,
                    "target_energy": null
                }
            ]
        }"#;
        let data2: SetlistExportData = serde_json::from_str(json_obj).unwrap();
        assert_eq!(data2.entries().len(), 1);
        assert_eq!(data2.name(), Some("Summer Festival"));
    }
}
