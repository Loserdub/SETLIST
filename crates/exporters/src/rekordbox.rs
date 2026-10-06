//! Pioneer Rekordbox XML exporter.
//!
//! Generates a valid `DJ_PLAYLISTS` XML document containing `PRODUCT`, `COLLECTION`,
//! `TRACK`, `TEMPO`, `POSITION_MARK`, and `PLAYLISTS` elements.

use crate::ExportError;
use core_types::{CamelotLetter, CueKind, CuePoint, Key, Mode, SetlistEntry};
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, Event};
use quick_xml::writer::Writer;
use std::fs;
use std::io::Cursor;
use std::path::Path;

/// Key notation format used when writing Rekordbox XML.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum KeyNotation {
    /// Standard musical notation (e.g. "Am", "C", "F#m", "Bbm") - default.
    #[default]
    Standard,
    /// Camelot notation (e.g. "8A", "8B", "11A").
    Camelot,
}

/// Metadata describing the creating software in the `<PRODUCT>` element.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProductInfo {
    /// Product name.
    pub name: String,
    /// Product version.
    pub version: String,
    /// Company name.
    pub company: String,
}

impl Default for ProductInfo {
    fn default() -> Self {
        Self {
            name: "rekordbox".to_string(),
            version: "6.0.0".to_string(),
            company: "Pioneer DJ".to_string(),
        }
    }
}

/// Configuration options for Rekordbox XML export.
#[derive(Debug, Clone)]
pub struct RekordboxExportOptions {
    /// Playlist name displayed in Rekordbox (default: "SETLIST").
    pub playlist_name: String,
    /// Key notation format (Standard e.g. "Am", or Camelot e.g. "8A").
    pub key_notation: KeyNotation,
    /// Whether to overwrite existing destination files (default: false).
    pub overwrite: bool,
    /// Product information written to the `<PRODUCT>` tag.
    pub product: ProductInfo,
}

impl Default for RekordboxExportOptions {
    fn default() -> Self {
        Self {
            playlist_name: "SETLIST".to_string(),
            key_notation: KeyNotation::Standard,
            overwrite: false,
            product: ProductInfo::default(),
        }
    }
}

/// Escapes an XML attribute value for the predefined XML entities: `&`, `<`, `>`, `"`, and `'`.
#[must_use]
pub fn escape_xml_attr(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

/// Encodes an individual URI path component according to RFC 3986 percent-encoding.
#[must_use]
pub fn encode_path_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.as_bytes() {
        match *b {
            b'a'..=b'z'
            | b'A'..=b'Z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~'
            | b'('
            | b')'
            | b'!'
            | b'\'' => {
                out.push(*b as char);
            }
            _ => {
                use std::fmt::Write;
                let _ = write!(out, "%{:02X}", b);
            }
        }
    }
    out
}

/// Formats a local filesystem path as a percent-encoded `file://localhost/` URI.
///
/// Handles Windows drive letters (e.g. `C:\`), verbatim `\\?\` prefixes, spaces,
/// symbols, emoji, and non-ASCII characters according to Pioneer Rekordbox XML specifications.
#[must_use]
pub fn encode_location<P: AsRef<Path>>(path: P) -> String {
    let path_str = path.as_ref().to_string_lossy();
    let raw = path_str.strip_prefix(r"\\?\").unwrap_or(&path_str);
    let normalized = raw.replace('\\', "/");

    let parts: Vec<&str> = normalized.split('/').collect();
    let mut encoded_parts = Vec::new();

    for part in parts {
        if part.is_empty() {
            continue;
        }
        // Preserve Windows drive letter without percent-encoding the colon (e.g. "C:")
        if part.len() == 2 && part.as_bytes()[1] == b':' && part.as_bytes()[0].is_ascii_alphabetic()
        {
            encoded_parts.push(part.to_string());
        } else {
            encoded_parts.push(encode_path_component(part));
        }
    }

    format!("file://localhost/{}", encoded_parts.join("/"))
}

/// Parses a 6-digit hex color code into RGB `(u8, u8, u8)`.
#[must_use]
pub fn parse_hex_color(hex_str: &str) -> (u8, u8, u8) {
    let clean = hex_str.trim().trim_start_matches('#');
    if clean.len() >= 6 {
        let r = u8::from_str_radix(&clean[0..2], 16).unwrap_or(0);
        let g = u8::from_str_radix(&clean[2..4], 16).unwrap_or(255);
        let b = u8::from_str_radix(&clean[4..6], 16).unwrap_or(0);
        (r, g, b)
    } else {
        (0, 255, 0) // Default green
    }
}

/// Formats a musical key into either standard notation (e.g. "Am", "C") or Camelot notation (e.g. "8A", "8B").
#[must_use]
pub fn format_tonality(key: &Key, notation: KeyNotation) -> String {
    match notation {
        KeyNotation::Camelot => {
            let letter = match key.camelot.letter {
                CamelotLetter::A => "A",
                CamelotLetter::B => "B",
            };
            format!("{}{}", key.camelot.number, letter)
        }
        KeyNotation::Standard => match (key.camelot.number, key.camelot.letter) {
            (1, CamelotLetter::A) => "Abm".to_string(),
            (1, CamelotLetter::B) => "B".to_string(),
            (2, CamelotLetter::A) => "Ebm".to_string(),
            (2, CamelotLetter::B) => "F#".to_string(),
            (3, CamelotLetter::A) => "Bbm".to_string(),
            (3, CamelotLetter::B) => "Db".to_string(),
            (4, CamelotLetter::A) => "Fm".to_string(),
            (4, CamelotLetter::B) => "Ab".to_string(),
            (5, CamelotLetter::A) => "Cm".to_string(),
            (5, CamelotLetter::B) => "Eb".to_string(),
            (6, CamelotLetter::A) => "Gm".to_string(),
            (6, CamelotLetter::B) => "Bb".to_string(),
            (7, CamelotLetter::A) => "Dm".to_string(),
            (7, CamelotLetter::B) => "F".to_string(),
            (8, CamelotLetter::A) => "Am".to_string(),
            (8, CamelotLetter::B) => "C".to_string(),
            (9, CamelotLetter::A) => "Em".to_string(),
            (9, CamelotLetter::B) => "G".to_string(),
            (10, CamelotLetter::A) => "Bm".to_string(),
            (10, CamelotLetter::B) => "D".to_string(),
            (11, CamelotLetter::A) => "F#m".to_string(),
            (11, CamelotLetter::B) => "A".to_string(),
            (12, CamelotLetter::A) => "C#m".to_string(),
            (12, CamelotLetter::B) => "E".to_string(),
            _ => {
                // Fallback to pitch_class & mode
                let name = match key.pitch_class {
                    0 => "C",
                    1 => "Db",
                    2 => "D",
                    3 => "Eb",
                    4 => "E",
                    5 => "F",
                    6 => "F#",
                    7 => "G",
                    8 => "Ab",
                    9 => "A",
                    10 => "Bb",
                    11 => "B",
                    _ => "C",
                };
                match key.mode {
                    Mode::Minor => format!("{name}m"),
                    Mode::Major => name.to_string(),
                }
            }
        },
    }
}

/// Generates a Rekordbox XML document string from the given setlist entries and export options.
///
/// # Errors
/// Returns [`ExportError::Failed`] if XML formatting fails.
pub fn generate_rekordbox_xml(
    entries: &[SetlistEntry],
    options: &RekordboxExportOptions,
) -> Result<String, ExportError> {
    let mut buffer = Vec::new();
    let mut writer = Writer::new_with_indent(Cursor::new(&mut buffer), b' ', 2);

    // XML Declaration: <?xml version="1.0" encoding="UTF-8"?>
    writer
        .write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))
        .map_err(|e| ExportError::Failed(format!("failed to write XML declaration: {e}")))?;

    // <DJ_PLAYLISTS Version="1.0.0">
    let mut dj_playlists = BytesStart::new("DJ_PLAYLISTS");
    dj_playlists.push_attribute(("Version", "1.0.0"));
    writer
        .write_event(Event::Start(dj_playlists))
        .map_err(|e| ExportError::Failed(format!("failed to start DJ_PLAYLISTS: {e}")))?;

    // <PRODUCT Name="..." Version="..." Company="..."/>
    let mut product = BytesStart::new("PRODUCT");
    product.push_attribute(("Name", options.product.name.as_str()));
    product.push_attribute(("Version", options.product.version.as_str()));
    product.push_attribute(("Company", options.product.company.as_str()));
    writer
        .write_event(Event::Empty(product))
        .map_err(|e| ExportError::Failed(format!("failed to write PRODUCT: {e}")))?;

    // Map each unique track in the setlist to a distinct sequential TrackID (1, 2, ...)
    let mut unique_entries: Vec<&SetlistEntry> = Vec::new();
    let mut track_key_map: std::collections::HashMap<&str, String> =
        std::collections::HashMap::new();

    for entry in entries {
        let key = entry
            .track
            .as_ref()
            .map(|t| t.id.as_str())
            .unwrap_or(entry.track_id.as_str());

        if !track_key_map.contains_key(key) {
            let next_id = (unique_entries.len() + 1).to_string();
            track_key_map.insert(key, next_id);
            unique_entries.push(entry);
        }
    }

    // <COLLECTION Entries="...">
    let num_unique = unique_entries.len();
    let unique_str = num_unique.to_string();
    let mut collection = BytesStart::new("COLLECTION");
    collection.push_attribute(("Entries", unique_str.as_str()));
    writer
        .write_event(Event::Start(collection))
        .map_err(|e| ExportError::Failed(format!("failed to start COLLECTION: {e}")))?;

    // Write each unique <TRACK> in COLLECTION
    for (idx, entry) in unique_entries.iter().enumerate() {
        let track_id = (idx + 1).to_string();
        write_track(&mut writer, entry, &track_id, options)?;
    }

    // </COLLECTION>
    writer
        .write_event(Event::End(BytesEnd::new("COLLECTION")))
        .map_err(|e| ExportError::Failed(format!("failed to end COLLECTION: {e}")))?;

    // <PLAYLISTS>
    writer
        .write_event(Event::Start(BytesStart::new("PLAYLISTS")))
        .map_err(|e| ExportError::Failed(format!("failed to start PLAYLISTS: {e}")))?;

    // <NODE Type="0" Name="ROOT">
    let mut root_node = BytesStart::new("NODE");
    root_node.push_attribute(("Type", "0"));
    root_node.push_attribute(("Name", "ROOT"));
    writer
        .write_event(Event::Start(root_node))
        .map_err(|e| ExportError::Failed(format!("failed to start ROOT NODE: {e}")))?;

    // <NODE Name="SETLIST" Type="1" KeyType="0" Entries="...">
    let num_entries = entries.len();
    let entries_str = num_entries.to_string();
    let mut playlist_node = BytesStart::new("NODE");
    playlist_node.push_attribute(("Name", options.playlist_name.as_str()));
    playlist_node.push_attribute(("Type", "1"));
    playlist_node.push_attribute(("KeyType", "0"));
    playlist_node.push_attribute(("Entries", entries_str.as_str()));
    writer
        .write_event(Event::Start(playlist_node))
        .map_err(|e| ExportError::Failed(format!("failed to start playlist NODE: {e}")))?;

    // <TRACK Key="1"/>, <TRACK Key="2"/>, ... in exact setlist sequence
    for entry in entries {
        let key = entry
            .track
            .as_ref()
            .map(|t| t.id.as_str())
            .unwrap_or(entry.track_id.as_str());

        let track_key = track_key_map
            .get(key)
            .cloned()
            .unwrap_or_else(|| "1".to_string());

        let mut track_ref = BytesStart::new("TRACK");
        track_ref.push_attribute(("Key", track_key.as_str()));
        writer
            .write_event(Event::Empty(track_ref))
            .map_err(|e| ExportError::Failed(format!("failed to write TRACK key: {e}")))?;
    }

    // </NODE> (playlist)
    writer
        .write_event(Event::End(BytesEnd::new("NODE")))
        .map_err(|e| ExportError::Failed(format!("failed to end playlist NODE: {e}")))?;

    // </NODE> (root)
    writer
        .write_event(Event::End(BytesEnd::new("NODE")))
        .map_err(|e| ExportError::Failed(format!("failed to end ROOT NODE: {e}")))?;

    // </PLAYLISTS>
    writer
        .write_event(Event::End(BytesEnd::new("PLAYLISTS")))
        .map_err(|e| ExportError::Failed(format!("failed to end PLAYLISTS: {e}")))?;

    // </DJ_PLAYLISTS>
    writer
        .write_event(Event::End(BytesEnd::new("DJ_PLAYLISTS")))
        .map_err(|e| ExportError::Failed(format!("failed to end DJ_PLAYLISTS: {e}")))?;

    String::from_utf8(buffer)
        .map_err(|e| ExportError::Failed(format!("invalid UTF-8 generated: {e}")))
}

fn write_track<W: std::io::Write>(
    writer: &mut Writer<W>,
    entry: &SetlistEntry,
    track_id: &str,
    options: &RekordboxExportOptions,
) -> Result<(), ExportError> {
    let track = entry.track.as_ref();

    let name = track
        .and_then(|t| t.tags.title.as_ref())
        .map(String::as_str)
        .unwrap_or(entry.track_id.as_str());

    let artist = track
        .and_then(|t| t.tags.artist.as_ref())
        .map(String::as_str)
        .unwrap_or("");

    let album = track
        .and_then(|t| t.tags.album.as_ref())
        .map(String::as_str)
        .unwrap_or("");

    let duration_ms = track.map(|t| t.duration_ms).unwrap_or(0.0);
    let total_time_s = (duration_ms / 1000.0).round() as u64;
    let total_time_str = total_time_s.to_string();

    let analysis = track.and_then(|t| t.analysis.as_ref());
    let bpm = analysis.map(|a| a.rhythm.grid.bpm).unwrap_or(120.0);
    let bpm_str = format!("{:.2}", bpm);

    let tonality = analysis
        .map(|a| format_tonality(&a.key, options.key_notation))
        .unwrap_or_else(|| "Am".to_string());

    let path_str = track
        .map(|t| t.path.as_str())
        .unwrap_or(entry.track_id.as_str());
    let location = encode_location(path_str);

    let mut track_tag = BytesStart::new("TRACK");
    track_tag.push_attribute(("TrackID", track_id));
    track_tag.push_attribute(("Name", name));
    track_tag.push_attribute(("Artist", artist));
    track_tag.push_attribute(("Album", album));
    track_tag.push_attribute(("TotalTime", total_time_str.as_str()));
    track_tag.push_attribute(("AverageBpm", bpm_str.as_str()));
    track_tag.push_attribute(("Tonality", tonality.as_str()));
    track_tag.push_attribute(("Location", location.as_str()));

    let first_downbeat_ms = analysis
        .map(|a| a.rhythm.grid.first_downbeat_ms)
        .unwrap_or(0.0);
    let first_downbeat_s = first_downbeat_ms / 1000.0;
    let inizio_str = format!("{:.3}", first_downbeat_s);

    let cue_points = analysis.map(|a| a.cue_points.as_slice()).unwrap_or(&[]);

    if cue_points.is_empty() && analysis.is_none() {
        // Simple empty track tag
        writer
            .write_event(Event::Empty(track_tag))
            .map_err(|e| ExportError::Failed(format!("failed to write TRACK: {e}")))?;
    } else {
        writer
            .write_event(Event::Start(track_tag))
            .map_err(|e| ExportError::Failed(format!("failed to start TRACK: {e}")))?;

        // <TEMPO Inizio="..." Bpm="..." Metro="4/4" Battito="1"/>
        let mut tempo_tag = BytesStart::new("TEMPO");
        tempo_tag.push_attribute(("Inizio", inizio_str.as_str()));
        tempo_tag.push_attribute(("Bpm", bpm_str.as_str()));
        tempo_tag.push_attribute(("Metro", "4/4"));
        tempo_tag.push_attribute(("Battito", "1"));
        writer
            .write_event(Event::Empty(tempo_tag))
            .map_err(|e| ExportError::Failed(format!("failed to write TEMPO: {e}")))?;

        // Write cue points
        for cue in cue_points {
            write_position_mark(writer, cue)?;
        }

        writer
            .write_event(Event::End(BytesEnd::new("TRACK")))
            .map_err(|e| ExportError::Failed(format!("failed to end TRACK: {e}")))?;
    }

    Ok(())
}

fn write_position_mark<W: std::io::Write>(
    writer: &mut Writer<W>,
    cue: &CuePoint,
) -> Result<(), ExportError> {
    let mut mark = BytesStart::new("POSITION_MARK");
    mark.push_attribute(("Name", cue.label.as_str()));

    let time_s = cue.time_ms / 1000.0;
    let start_str = format!("{:.3}", time_s);
    mark.push_attribute(("Start", start_str.as_str()));

    let (r, g, b) = parse_hex_color(&cue.color_hex);
    let red_str = r.to_string();
    let green_str = g.to_string();
    let blue_str = b.to_string();

    match cue.kind {
        CueKind::HotCue => {
            mark.push_attribute(("Type", "0"));
            let num_str = cue.index.to_string();
            mark.push_attribute(("Num", num_str.as_str()));
        }
        CueKind::MemoryCue => {
            mark.push_attribute(("Type", "0"));
            mark.push_attribute(("Num", "-1"));
        }
        CueKind::Loop => {
            mark.push_attribute(("Type", "4"));
            let num_str = cue.index.to_string();
            mark.push_attribute(("Num", num_str.as_str()));

            if let Some(end_ms) = cue.loop_end_ms {
                let end_s = end_ms / 1000.0;
                let end_str = format!("{:.3}", end_s);
                mark.push_attribute(("End", end_str.as_str()));
            } else {
                let end_s = time_s + 15.0; // Fallback 8 bars
                let end_str = format!("{:.3}", end_s);
                mark.push_attribute(("End", end_str.as_str()));
            }
        }
    }

    mark.push_attribute(("Red", red_str.as_str()));
    mark.push_attribute(("Green", green_str.as_str()));
    mark.push_attribute(("Blue", blue_str.as_str()));

    writer
        .write_event(Event::Empty(mark))
        .map_err(|e| ExportError::Failed(format!("failed to write POSITION_MARK: {e}")))?;

    Ok(())
}

/// Exports setlist entries to a Rekordbox XML file with custom options.
///
/// # Errors
/// - Returns [`ExportError::FileExists`] if the destination file already exists and `options.overwrite` is false.
/// - Returns [`ExportError::Io`] if file operations fail.
/// - Returns [`ExportError::Failed`] if XML formatting fails.
pub fn export_rekordbox_xml_with_options<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
    options: &RekordboxExportOptions,
) -> Result<(), ExportError> {
    let path = output_path.as_ref();

    if path.exists() && !options.overwrite {
        return Err(ExportError::FileExists(path.to_path_buf()));
    }

    let xml_content = generate_rekordbox_xml(entries, options)?;

    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    fs::write(path, xml_content)?;
    Ok(())
}

/// Exports setlist entries to a Rekordbox XML file using default options.
///
/// # Errors
/// Returns [`ExportError`] on write or serialization failure.
pub fn export_rekordbox_xml<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
) -> Result<(), ExportError> {
    export_rekordbox_xml_with_options(entries, output_path, &RekordboxExportOptions::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{
        BeatGrid, Camelot, DynamicsAnalysis, EnergyCurve, LoudnessInfo, RhythmAnalysis, Track,
        TrackAnalysis, TrackTags, Waveform3Band, WaveformBand,
    };
    use quick_xml::events::Event as QEvent;
    use quick_xml::reader::Reader;

    fn create_test_track(id: &str, title: &str, path: &str, bpm: f64) -> Track {
        let camelot = Camelot::new(8, CamelotLetter::A).unwrap(); // 8A = Am
        let key = Key {
            pitch_class: 9, // A
            mode: Mode::Minor,
            camelot,
            tuning_cents: 0.0,
        };

        let grid = BeatGrid {
            first_downbeat_ms: 250.0,
            bpm,
            beats_ms: vec![0.0, 500.0, 1000.0],
            downbeat_flags: vec![true, false, false],
            steady: true,
        };

        let cue_a = CuePoint {
            index: 0,
            time_ms: 250.0,
            label: "A: First Downbeat".to_string(),
            color_hex: "#00FF00".to_string(),
            kind: CueKind::HotCue,
            loop_end_ms: None,
        };

        let cue_h = CuePoint {
            index: 7,
            time_ms: 60_000.0,
            label: "H: Percussive Loop".to_string(),
            color_hex: "#FF007F".to_string(),
            kind: CueKind::Loop,
            loop_end_ms: Some(75_000.0),
        };

        let cue_mem = CuePoint {
            index: 255,
            time_ms: 10_000.0,
            label: "Memory Marker".to_string(),
            color_hex: "#0000FF".to_string(),
            kind: CueKind::MemoryCue,
            loop_end_ms: None,
        };

        let dummy_waveform_band = WaveformBand {
            peak: vec![],
            rms: vec![],
        };

        let analysis = TrackAnalysis {
            loudness: LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 6.0,
                true_peak: -1.0,
            },
            rhythm: RhythmAnalysis {
                grid,
                bpm_alternates: vec![],
            },
            key,
            dynamics: DynamicsAnalysis {
                frame_rate: 43.0,
                rms_curve: vec![],
                low_ratio_curve: vec![],
                centroid_curve: vec![],
            },
            energy_score: 8,
            energy_curve: EnergyCurve { per_bar: vec![] },
            segments: vec![],
            cue_points: vec![cue_a, cue_h, cue_mem],
            waveform: Waveform3Band {
                points_per_sec: 150,
                low: dummy_waveform_band.clone(),
                mid: dummy_waveform_band.clone(),
                high: dummy_waveform_band,
            },
        };

        Track {
            id: id.to_string(),
            path: path.to_string(),
            hash: "1234567890abcdef".to_string(),
            tags: TrackTags {
                title: Some(title.to_string()),
                artist: Some("DJ Test".to_string()),
                album: Some("Test Album".to_string()),
            },
            duration_ms: 120_000.0,
            analysis: Some(analysis),
            analyzed_at: None,
            analysis_version: None,
        }
    }

    #[test]
    fn test_path_encoding_cases() {
        // Windows path with backslashes
        assert_eq!(
            encode_location(r"C:\Music\Track.mp3"),
            "file://localhost/C:/Music/Track.mp3"
        );

        // Windows path with spaces
        assert_eq!(
            encode_location(r"C:\DJ Sets\Track 01.mp3"),
            "file://localhost/C:/DJ%20Sets/Track%2001.mp3"
        );

        // Special characters and symbols
        assert_eq!(
            encode_location(r"D:\Audio\Track & Field #1 + Extra.wav"),
            "file://localhost/D:/Audio/Track%20%26%20Field%20%231%20%2B%20Extra.wav"
        );

        // Unicode / Emojis
        assert_eq!(
            encode_location(r"C:\Music\📂 Project\song.mp3"),
            "file://localhost/C:/Music/%F0%9F%93%82%20Project/song.mp3"
        );

        // Unix path
        assert_eq!(
            encode_location("/Users/test/music/song.mp3"),
            "file://localhost/Users/test/music/song.mp3"
        );
    }

    #[test]
    fn test_reparse_with_quick_xml() {
        let track = create_test_track("t1", "Sunrise", r"C:\Music\Sunrise.mp3", 128.0);
        let entry = SetlistEntry {
            position: 1,
            track_id: "t1".to_string(),
            track: Some(track),
            transition: None,
            target_energy: None,
        };

        let xml = generate_rekordbox_xml(&[entry], &RekordboxExportOptions::default())
            .expect("XML generation should succeed");

        let mut reader = Reader::from_str(&xml);
        reader.config_mut().trim_text(true);

        let mut element_names = Vec::new();
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(QEvent::Start(ref e)) | Ok(QEvent::Empty(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    element_names.push(name);
                }
                Ok(QEvent::Eof) => break,
                Err(e) => panic!("Error at position {}: {:?}", reader.buffer_position(), e),
                _ => {}
            }
            buf.clear();
        }

        assert!(element_names.contains(&"DJ_PLAYLISTS".to_string()));
        assert!(element_names.contains(&"PRODUCT".to_string()));
        assert!(element_names.contains(&"COLLECTION".to_string()));
        assert!(element_names.contains(&"TRACK".to_string()));
        assert!(element_names.contains(&"TEMPO".to_string()));
        assert!(element_names.contains(&"POSITION_MARK".to_string()));
        assert!(element_names.contains(&"PLAYLISTS".to_string()));
        assert!(element_names.contains(&"NODE".to_string()));
    }

    #[test]
    fn test_golden_file_match() {
        let track = create_test_track("t1", "Golden Track", r"C:\Music\Golden.mp3", 128.0);
        let entry = SetlistEntry {
            position: 1,
            track_id: "t1".to_string(),
            track: Some(track),
            transition: None,
            target_energy: None,
        };

        let options = RekordboxExportOptions {
            playlist_name: "FESTIVAL_SET".to_string(),
            key_notation: KeyNotation::Standard,
            overwrite: true,
            product: ProductInfo {
                name: "rekordbox".to_string(),
                version: "6.0.0".to_string(),
                company: "Pioneer DJ".to_string(),
            },
        };

        let xml = generate_rekordbox_xml(&[entry], &options).unwrap();

        // Verify key structural components
        assert!(xml.contains("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(xml.contains("<DJ_PLAYLISTS Version=\"1.0.0\">"));
        assert!(
            xml.contains("<PRODUCT Name=\"rekordbox\" Version=\"6.0.0\" Company=\"Pioneer DJ\"/>")
        );
        assert!(xml.contains("<COLLECTION Entries=\"1\">"));
        assert!(xml.contains("TrackID=\"1\""));
        assert!(xml.contains("Name=\"Golden Track\""));
        assert!(xml.contains("Artist=\"DJ Test\""));
        assert!(xml.contains("Album=\"Test Album\""));
        assert!(xml.contains("TotalTime=\"120\""));
        assert!(xml.contains("AverageBpm=\"128.00\""));
        assert!(xml.contains("Tonality=\"Am\""));
        assert!(xml.contains("Location=\"file://localhost/C:/Music/Golden.mp3\""));
        assert!(
            xml.contains("<TEMPO Inizio=\"0.250\" Bpm=\"128.00\" Metro=\"4/4\" Battito=\"1\"/>")
        );
        assert!(xml.contains("<NODE Name=\"FESTIVAL_SET\" Type=\"1\" KeyType=\"0\" Entries=\"1\">"));
        assert!(xml.contains("<TRACK Key=\"1\"/>"));
    }

    #[test]
    fn test_num_mapping_and_loop_output() {
        let track = create_test_track("t1", "Loop Track", r"C:\Music\Loop.mp3", 124.0);
        let entry = SetlistEntry {
            position: 1,
            track_id: "t1".to_string(),
            track: Some(track),
            transition: None,
            target_energy: None,
        };

        let xml = generate_rekordbox_xml(&[entry], &RekordboxExportOptions::default()).unwrap();

        // Hot cue 0 (A): Type 0, Num 0, Green
        assert!(xml.contains("Name=\"A: First Downbeat\""));
        assert!(xml.contains("Type=\"0\""));
        assert!(xml.contains("Num=\"0\""));
        assert!(xml.contains("Start=\"0.250\""));
        assert!(xml.contains("Red=\"0\" Green=\"255\" Blue=\"0\""));

        // Loop cue 7 (H): Type 4, Num 7, End attribute present, Pink
        assert!(xml.contains("Name=\"H: Percussive Loop\""));
        assert!(xml.contains("Type=\"4\""));
        assert!(xml.contains("Num=\"7\""));
        assert!(xml.contains("Start=\"60.000\""));
        assert!(xml.contains("End=\"75.000\""));
        assert!(xml.contains("Red=\"255\" Green=\"0\" Blue=\"127\""));

        // Memory cue: Type 0, Num -1, Blue
        assert!(xml.contains("Name=\"Memory Marker\""));
        assert!(xml.contains("Num=\"-1\""));
        assert!(xml.contains("Red=\"0\" Green=\"0\" Blue=\"255\""));
    }

    #[test]
    fn test_tonality_notation_option() {
        let track = create_test_track("t1", "Key Track", r"C:\Music\Key.mp3", 126.0);
        let entry = SetlistEntry {
            position: 1,
            track_id: "t1".to_string(),
            track: Some(track),
            transition: None,
            target_energy: None,
        };

        // Standard notation -> "Am"
        let xml_std = generate_rekordbox_xml(
            std::slice::from_ref(&entry),
            &RekordboxExportOptions {
                key_notation: KeyNotation::Standard,
                ..Default::default()
            },
        )
        .unwrap();
        assert!(xml_std.contains("Tonality=\"Am\""));

        // Camelot notation -> "8A"
        let xml_cam = generate_rekordbox_xml(
            std::slice::from_ref(&entry),
            &RekordboxExportOptions {
                key_notation: KeyNotation::Camelot,
                ..Default::default()
            },
        )
        .unwrap();
        assert!(xml_cam.contains("Tonality=\"8A\""));
    }

    #[test]
    fn test_overwrite_protection() {
        let temp_dir = std::env::temp_dir().join("rekordbox_test");
        let temp_file = temp_dir.join("test_export.xml");

        let track = create_test_track("t1", "Test", r"C:\Music\Test.mp3", 120.0);
        let entry = SetlistEntry {
            position: 1,
            track_id: "t1".to_string(),
            track: Some(track),
            transition: None,
            target_energy: None,
        };

        // First export (should succeed)
        let opts_default = RekordboxExportOptions {
            overwrite: true,
            ..Default::default()
        };
        export_rekordbox_xml_with_options(std::slice::from_ref(&entry), &temp_file, &opts_default)
            .unwrap();
        assert!(temp_file.exists());

        // Second export without overwrite (must fail with FileExists)
        let opts_no_overwrite = RekordboxExportOptions {
            overwrite: false,
            ..Default::default()
        };
        let err = export_rekordbox_xml_with_options(
            std::slice::from_ref(&entry),
            &temp_file,
            &opts_no_overwrite,
        )
        .unwrap_err();
        assert!(matches!(err, ExportError::FileExists(_)));

        // Third export with overwrite (must succeed)
        export_rekordbox_xml_with_options(std::slice::from_ref(&entry), &temp_file, &opts_default)
            .unwrap();

        // Cleanup
        let _ = fs::remove_file(temp_file);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_attribute_escaping_and_markup() {
        let title_with_markup = r#"<Rock & Roll> "Live" at St. John's & O'Connor's"#;
        let artist_with_markup = r#"The "Artists" & <Crew> '2026'"#;
        let long_album = "A".repeat(5000);

        let track = create_test_track("t_markup", title_with_markup, r"C:\Music\Song.mp3", 125.0);
        let mut entry = SetlistEntry {
            position: 1,
            track_id: "t_markup".to_string(),
            track: Some(track),
            transition: None,
            target_energy: None,
        };
        if let Some(ref mut t) = entry.track {
            t.tags.artist = Some(artist_with_markup.to_string());
            t.tags.album = Some(long_album);
        }

        let opts = RekordboxExportOptions {
            playlist_name: r#"Set & "Show" <Summer>"#.to_string(),
            ..Default::default()
        };

        let xml = generate_rekordbox_xml(&[entry], &opts).expect("should generate valid XML");
        assert!(xml.contains("The &quot;Artists&quot; &amp; &lt;Crew&gt; &apos;2026&apos;"));
        assert!(xml.contains("Set &amp; &quot;Show&quot; &lt;Summer&gt;"));

        // Verify strict quick-xml parsing does not error on markup or long attributes
        let mut reader = Reader::from_str(&xml);
        let mut count = 0;
        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(QEvent::Eof) => break,
                Ok(_) => count += 1,
                Err(e) => panic!("XML parsing failed on markup track: {e:?}"),
            }
            buf.clear();
        }
        assert!(count > 10);
    }

    #[test]
    fn test_rekordbox_strict_round_trip() {
        let t1 = create_test_track("t1", "Track One & Only", r"C:\Music\Track1.mp3", 124.5);
        let mut t2 = create_test_track("t2", "Track Two \"VIP\"", r"C:\Music\Track2.mp3", 128.0);
        let mut t3 = create_test_track("t3", "Track Three <Drop>", r"C:\Music\Track3.mp3", 132.0);

        // Track 2: 9B (G major)
        if let Some(ref mut a) = t2.analysis {
            a.key = Key {
                pitch_class: 7,
                mode: Mode::Major,
                camelot: Camelot::new(9, CamelotLetter::B).unwrap(),
                tuning_cents: 0.0,
            };
        }
        // Track 3: 11A (F# minor)
        if let Some(ref mut a) = t3.analysis {
            a.key = Key {
                pitch_class: 6,
                mode: Mode::Minor,
                camelot: Camelot::new(11, CamelotLetter::A).unwrap(),
                tuning_cents: 0.0,
            };
        }

        let entries = vec![
            SetlistEntry {
                position: 1,
                track_id: "t1".to_string(),
                track: Some(t1),
                transition: None,
                target_energy: None,
            },
            SetlistEntry {
                position: 2,
                track_id: "t2".to_string(),
                track: Some(t2),
                transition: None,
                target_energy: None,
            },
            SetlistEntry {
                position: 3,
                track_id: "t3".to_string(),
                track: Some(t3),
                transition: None,
                target_energy: None,
            },
        ];

        let opts = RekordboxExportOptions {
            playlist_name: "RoundTrip_Test".to_string(),
            key_notation: KeyNotation::Standard,
            ..Default::default()
        };

        let xml = generate_rekordbox_xml(&entries, &opts).expect("generate xml");

        // Parse with strict quick-xml reader
        let mut reader = Reader::from_str(&xml);
        reader.config_mut().trim_text(true);

        let mut parsed_tracks: Vec<(String, String, f64, String)> = Vec::new(); // (id, name, bpm, key)
        let mut playlist_order: Vec<String> = Vec::new();
        let mut in_collection = false;
        let mut in_playlist = false;
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(QEvent::Start(ref e)) => match e.name().as_ref() {
                    b"COLLECTION" => in_collection = true,
                    b"NODE" => {
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"Type" && attr.value.as_ref() == b"1" {
                                in_playlist = true;
                            }
                        }
                    }
                    b"TRACK" if in_collection => {
                        let mut tid = String::new();
                        let mut name = String::new();
                        let mut bpm = 0.0;
                        let mut key = String::new();

                        for attr in e.attributes().flatten() {
                            let val = attr.unescape_value().unwrap();
                            match attr.key.as_ref() {
                                b"TrackID" => tid = val.to_string(),
                                b"Name" => name = val.to_string(),
                                b"AverageBpm" => bpm = val.parse::<f64>().unwrap(),
                                b"Tonality" => key = val.to_string(),
                                _ => {}
                            }
                        }
                        parsed_tracks.push((tid, name, bpm, key));
                    }
                    _ => {}
                },
                Ok(QEvent::Empty(ref e)) => match e.name().as_ref() {
                    b"TRACK" if in_collection => {
                        let mut tid = String::new();
                        let mut name = String::new();
                        let mut bpm = 0.0;
                        let mut key = String::new();

                        for attr in e.attributes().flatten() {
                            let val = attr.unescape_value().unwrap();
                            match attr.key.as_ref() {
                                b"TrackID" => tid = val.to_string(),
                                b"Name" => name = val.to_string(),
                                b"AverageBpm" => bpm = val.parse::<f64>().unwrap(),
                                b"Tonality" => key = val.to_string(),
                                _ => {}
                            }
                        }
                        parsed_tracks.push((tid, name, bpm, key));
                    }
                    b"TRACK" if in_playlist => {
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"Key" {
                                playlist_order.push(attr.unescape_value().unwrap().to_string());
                            }
                        }
                    }
                    _ => {}
                },
                Ok(QEvent::End(ref e)) => match e.name().as_ref() {
                    b"COLLECTION" => in_collection = false,
                    b"NODE" => in_playlist = false,
                    _ => {}
                },
                Ok(QEvent::Eof) => break,
                Err(e) => panic!("XML syntax error: {e:?}"),
                _ => {}
            }
            buf.clear();
        }

        // Validate track count
        assert_eq!(
            parsed_tracks.len(),
            3,
            "should parse 3 tracks from COLLECTION"
        );
        assert_eq!(playlist_order.len(), 3, "should parse 3 playlist items");

        // Validate order
        assert_eq!(playlist_order, vec!["1", "2", "3"]);

        // Validate unescaped names, BPM, and key
        assert_eq!(parsed_tracks[0].1, "Track One & Only");
        assert!((parsed_tracks[0].2 - 124.5).abs() < 0.01);
        assert_eq!(parsed_tracks[0].3, "Am");

        assert_eq!(parsed_tracks[1].1, "Track Two \"VIP\"");
        assert!((parsed_tracks[1].2 - 128.0).abs() < 0.01);
        assert_eq!(parsed_tracks[1].3, "G");

        assert_eq!(parsed_tracks[2].1, "Track Three <Drop>");
        assert!((parsed_tracks[2].2 - 132.0).abs() < 0.01);
        assert_eq!(parsed_tracks[2].3, "F#m");
    }

    #[test]
    fn test_windows_extended_paths_and_unicode_uris() {
        let uri = encode_location(r"\\?\C:\Music\📂 DJ Sets\André & Frédérique [2026] #1.mp3");
        assert_eq!(
            uri,
            "file://localhost/C:/Music/%F0%9F%93%82%20DJ%20Sets/Andr%C3%A9%20%26%20Fr%C3%A9d%C3%A9rique%20%5B2026%5D%20%231.mp3"
        );
    }
}
