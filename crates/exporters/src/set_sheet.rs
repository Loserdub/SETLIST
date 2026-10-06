//! Setlist sheet exporter in CSV and Markdown formats.
//!
//! Columns: order, title, artist, BPM, Camelot key, energy, transition type,
//! recommended bars, out cue, in cue.

use crate::ExportError;
use core_types::{CamelotLetter, SetlistEntry};
use std::fs;
use std::path::Path;

/// Escapes a field for standard RFC 4180 CSV output.
#[must_use]
pub fn escape_csv_field(val: &str) -> String {
    if val.contains(',') || val.contains('"') || val.contains('\n') || val.contains('\r') {
        format!("\"{}\"", val.replace('"', "\"\""))
    } else {
        val.to_string()
    }
}

/// Resolves the outgoing cue and incoming cue labels for a setlist entry.
#[must_use]
pub fn resolve_cues(entry: &SetlistEntry) -> (&'static str, &'static str) {
    if let Some(trans) = &entry.transition {
        let mut out_cue = if trans.loop_extension_recommended {
            "H"
        } else if let Some(analysis) = entry.track.as_ref().and_then(|t| t.analysis.as_ref()) {
            if analysis.cue_points.iter().any(|c| {
                c.index == 3
                    && (c.label.to_lowercase().contains("mix")
                        || c.label.to_lowercase().contains("out"))
            }) {
                "D"
            } else {
                "G"
            }
        } else {
            "G"
        };
        let mut in_cue = "A";

        for note in &trans.notes {
            let lower = note.to_lowercase();
            // Out cue detection (D is Mix Out, H is Loop, G is legacy Outro)
            if lower.contains("out: d")
                || lower.contains("out cue: d")
                || lower.contains("mix out: cue d")
                || lower.contains("mix-out: cue d")
                || (lower.contains("cue d") && !lower.contains("in: cue d"))
                || lower.contains("mix out")
                || lower.contains("mix-out")
            {
                out_cue = "D";
            } else if lower.contains("out: h")
                || lower.contains("out cue: h")
                || lower.contains("cue h")
            {
                out_cue = "H";
            } else if lower.contains("out: g")
                || lower.contains("out cue: g")
                || lower.contains("cue g")
            {
                out_cue = "G";
            }

            // In cue detection (A is Intro, B is Breakdown, C is Drop)
            if lower.contains("in: d") || lower.contains("in cue: d") || lower.contains("enter: d")
            {
                in_cue = "D";
            } else if lower.contains("in: c")
                || lower.contains("in cue: c")
                || lower.contains("enter: c")
                || lower.contains("cue c")
                || lower.contains("drop")
            {
                in_cue = "C";
            } else if lower.contains("in: b")
                || lower.contains("in cue: b")
                || lower.contains("enter: b")
                || lower.contains("cue b")
                || lower.contains("breakdown")
            {
                in_cue = "B";
            } else if lower.contains("in: a")
                || lower.contains("in cue: a")
                || lower.contains("enter: a")
                || lower.contains("cue a")
                || lower.contains("intro")
            {
                in_cue = "A";
            }
        }

        (out_cue, in_cue)
    } else {
        ("-", "-")
    }
}

/// Formats row fields as strings:
/// `(order, title, artist, bpm, camelot_key, energy, transition_type, recommended_bars, out_cue, in_cue)`
#[must_use]
pub fn extract_row_fields(
    idx: usize,
    entry: &SetlistEntry,
) -> (
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
) {
    let order = if entry.position > 0 {
        entry.position.to_string()
    } else {
        (idx + 1).to_string()
    };

    let track = entry.track.as_ref();
    let title = track
        .and_then(|t| t.tags.title.as_deref())
        .unwrap_or(entry.track_id.as_str())
        .to_string();

    let artist = track
        .and_then(|t| t.tags.artist.as_deref())
        .unwrap_or("")
        .to_string();

    let analysis = track.and_then(|t| t.analysis.as_ref());
    let bpm = analysis
        .map(|a| format!("{:.1}", a.rhythm.grid.bpm))
        .unwrap_or_else(|| "-".to_string());

    let camelot_key = analysis
        .map(|a| {
            let letter = match a.key.camelot.letter {
                CamelotLetter::A => "A",
                CamelotLetter::B => "B",
            };
            format!("{}{}", a.key.camelot.number, letter)
        })
        .unwrap_or_else(|| "-".to_string());

    let energy = analysis
        .map(|a| a.energy_score.to_string())
        .or_else(|| entry.target_energy.map(|e| e.round().to_string()))
        .unwrap_or_else(|| "-".to_string());

    let transition_type = entry
        .transition
        .as_ref()
        .map(|t| format!("{:?}", t.transition_type))
        .unwrap_or_else(|| "-".to_string());

    let recommended_bars = entry
        .transition
        .as_ref()
        .and_then(|t| {
            if t.phrase_bars > 0 {
                Some(t.phrase_bars.to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "-".to_string());

    let (out_cue, in_cue) = resolve_cues(entry);

    (
        order,
        title,
        artist,
        bpm,
        camelot_key,
        energy,
        transition_type,
        recommended_bars,
        out_cue.to_string(),
        in_cue.to_string(),
    )
}

/// Configuration options for CSV set sheet export.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct CsvExportOptions {
    /// Whether to overwrite existing destination files (default: false).
    pub overwrite: bool,
    /// Whether to prepend a UTF-8 Byte Order Mark (BOM: `\u{FEFF}`) for Excel compatibility (default: false).
    pub include_bom: bool,
}

/// Generates a set sheet in CSV format with optional UTF-8 BOM.
#[must_use]
pub fn generate_set_sheet_csv_with_bom(entries: &[SetlistEntry], include_bom: bool) -> String {
    let mut out = if include_bom {
        String::from(
            "\u{FEFF}Order,Title,Artist,BPM,Camelot Key,Energy,Transition Type,Recommended Bars,Out Cue,In Cue\n",
        )
    } else {
        String::from(
            "Order,Title,Artist,BPM,Camelot Key,Energy,Transition Type,Recommended Bars,Out Cue,In Cue\n",
        )
    };

    for (idx, entry) in entries.iter().enumerate() {
        let (order, title, artist, bpm, key, energy, trans, bars, out_cue, in_cue) =
            extract_row_fields(idx, entry);

        out.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{}\n",
            escape_csv_field(&order),
            escape_csv_field(&title),
            escape_csv_field(&artist),
            escape_csv_field(&bpm),
            escape_csv_field(&key),
            escape_csv_field(&energy),
            escape_csv_field(&trans),
            escape_csv_field(&bars),
            escape_csv_field(&out_cue),
            escape_csv_field(&in_cue),
        ));
    }

    out
}

/// Generates a set sheet in CSV format without UTF-8 BOM.
#[must_use]
pub fn generate_set_sheet_csv(entries: &[SetlistEntry]) -> String {
    generate_set_sheet_csv_with_bom(entries, false)
}

/// Generates a set sheet in GitHub Flavored Markdown table format.
#[must_use]
pub fn generate_set_sheet_markdown(entries: &[SetlistEntry], title: Option<&str>) -> String {
    let heading = title.unwrap_or("DJ Set Sheet");
    let mut out = format!("# {heading}\n\n");

    out.push_str(
        "| Order | Title | Artist | BPM | Camelot Key | Energy | Transition Type | Recommended Bars | Out Cue | In Cue |\n",
    );
    out.push_str("|---|---|---|---|---|---|---|---|---|---|\n");

    for (idx, entry) in entries.iter().enumerate() {
        let (order, title, artist, bpm, key, energy, trans, bars, out_cue, in_cue) =
            extract_row_fields(idx, entry);

        // Sanitize markdown pipe character and newlines so rows stay on a single line
        let clean_title = title
            .replace('|', "\\|")
            .replace("\r\n", " ")
            .replace(['\r', '\n'], " ");
        let clean_artist = artist
            .replace('|', "\\|")
            .replace("\r\n", " ")
            .replace(['\r', '\n'], " ");

        out.push_str(&format!(
            "| {order} | {clean_title} | {clean_artist} | {bpm} | {key} | {energy} | {trans} | {bars} | {out_cue} | {in_cue} |\n"
        ));
    }

    out
}

/// Exports setlist sheet to a CSV file with full options.
///
/// # Errors
/// - Returns [`ExportError::FileExists`] if the destination file already exists and `options.overwrite` is false.
/// - Returns [`ExportError::Io`] if file operations fail.
pub fn export_set_sheet_csv_full<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
    options: &CsvExportOptions,
) -> Result<(), ExportError> {
    let path = output_path.as_ref();
    if path.exists() && !options.overwrite {
        return Err(ExportError::FileExists(path.to_path_buf()));
    }

    let csv_content = generate_set_sheet_csv_with_bom(entries, options.include_bom);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    fs::write(path, csv_content.as_bytes())?;
    Ok(())
}

/// Exports setlist sheet to a CSV file with overwrite control.
///
/// # Errors
/// - Returns [`ExportError::FileExists`] if the destination file already exists and `overwrite` is false.
/// - Returns [`ExportError::Io`] if file operations fail.
pub fn export_set_sheet_csv_with_options<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
    overwrite: bool,
) -> Result<(), ExportError> {
    export_set_sheet_csv_full(
        entries,
        output_path,
        &CsvExportOptions {
            overwrite,
            include_bom: false,
        },
    )
}

/// Exports setlist sheet to a CSV file.
///
/// # Errors
/// Returns [`ExportError`] on write failure or if the destination file exists.
pub fn export_set_sheet_csv<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
) -> Result<(), ExportError> {
    export_set_sheet_csv_with_options(entries, output_path, false)
}

/// Exports setlist sheet to a Markdown file with overwrite control.
///
/// # Errors
/// - Returns [`ExportError::FileExists`] if the destination file already exists and `overwrite` is false.
/// - Returns [`ExportError::Io`] if file operations fail.
pub fn export_set_sheet_markdown_with_options<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
    overwrite: bool,
) -> Result<(), ExportError> {
    let path = output_path.as_ref();
    if path.exists() && !overwrite {
        return Err(ExportError::FileExists(path.to_path_buf()));
    }

    let md_content = generate_set_sheet_markdown(entries, None);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    fs::write(path, md_content)?;
    Ok(())
}

/// Exports setlist sheet to a Markdown file.
///
/// # Errors
/// Returns [`ExportError`] on write failure or if the destination file exists.
pub fn export_set_sheet_markdown<P: AsRef<Path>>(
    entries: &[SetlistEntry],
    output_path: P,
) -> Result<(), ExportError> {
    export_set_sheet_markdown_with_options(entries, output_path, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{
        BeatGrid, Camelot, DynamicsAnalysis, EnergyCurve, Key, LoudnessInfo, Mode, RhythmAnalysis,
        Track, TrackAnalysis, TrackTags, TransitionAdvice, TransitionType, Waveform3Band,
        WaveformBand,
    };

    #[allow(clippy::too_many_arguments)]
    fn make_entry(
        pos: u32,
        title: &str,
        artist: &str,
        bpm: f64,
        camelot_num: u8,
        letter: CamelotLetter,
        energy: u8,
        trans: Option<TransitionAdvice>,
    ) -> SetlistEntry {
        let camelot = Camelot::new(camelot_num, letter).unwrap();
        let key = Key {
            pitch_class: 0,
            mode: match letter {
                CamelotLetter::A => Mode::Minor,
                CamelotLetter::B => Mode::Major,
            },
            camelot,
            tuning_cents: 0.0,
        };

        let dummy_band = WaveformBand {
            peak: vec![],
            rms: vec![],
        };

        let analysis = TrackAnalysis {
            loudness: LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 5.0,
                true_peak: -1.0,
            },
            rhythm: RhythmAnalysis {
                grid: BeatGrid {
                    first_downbeat_ms: 0.0,
                    bpm,
                    beats_ms: vec![],
                    downbeat_flags: vec![],
                    steady: true,
                },
                bpm_alternates: vec![],
            },
            key,
            dynamics: DynamicsAnalysis {
                frame_rate: 43.0,
                rms_curve: vec![],
                low_ratio_curve: vec![],
                centroid_curve: vec![],
            },
            energy_score: energy,
            energy_curve: EnergyCurve { per_bar: vec![] },
            segments: vec![],
            cue_points: vec![],
            waveform: Waveform3Band {
                points_per_sec: 150,
                low: dummy_band.clone(),
                mid: dummy_band.clone(),
                high: dummy_band,
            },
        };

        SetlistEntry {
            position: pos,
            track_id: format!("t_{pos}"),
            track: Some(Track {
                id: format!("t_{pos}"),
                path: format!(r"C:\Music\{title}.mp3"),
                hash: "hash".to_string(),
                tags: TrackTags {
                    title: Some(title.to_string()),
                    artist: Some(artist.to_string()),
                    album: Some("Album".to_string()),
                },
                duration_ms: 200_000.0,
                analysis: Some(analysis),
                analyzed_at: None,
                analysis_version: None,
            }),
            transition: trans,
            target_energy: None,
        }
    }

    #[test]
    fn test_csv_golden_match() {
        let e1 = make_entry(
            1,
            "Intro Beat",
            "Artist 1",
            124.0,
            8,
            CamelotLetter::A,
            5,
            None,
        );

        let trans2 = TransitionAdvice {
            transition_type: TransitionType::RelativeSwitch,
            bpm_delta: 2.0,
            key_distance: 0,
            mode_flip: true,
            intervention_required: false,
            loop_extension_recommended: false,
            phrase_bars: 16,
            notes: vec!["Smooth blend".to_string()],
            ..Default::default()
        };
        let e2 = make_entry(
            2,
            "Peak Groove, The",
            "Artist 2",
            126.0,
            8,
            CamelotLetter::B,
            8,
            Some(trans2),
        );

        let trans3 = TransitionAdvice {
            transition_type: TransitionType::Fifth,
            bpm_delta: 2.0,
            key_distance: 1,
            mode_flip: false,
            intervention_required: false,
            loop_extension_recommended: true,
            phrase_bars: 32,
            notes: vec!["Out cue: H, In cue: B".to_string()],
            ..Default::default()
        };
        let e3 = make_entry(
            3,
            "Outro Jam",
            "Artist 3",
            128.0,
            9,
            CamelotLetter::B,
            9,
            Some(trans3),
        );

        let csv = generate_set_sheet_csv(&[e1, e2, e3]);

        // Check header
        assert!(csv.starts_with(
            "Order,Title,Artist,BPM,Camelot Key,Energy,Transition Type,Recommended Bars,Out Cue,In Cue\n"
        ));

        // Check track 1 (no transition)
        assert!(csv.contains("1,Intro Beat,Artist 1,124.0,8A,5,-,-,-,-\n"));

        // Check track 2 (commas escaped)
        assert!(csv.contains("2,\"Peak Groove, The\",Artist 2,126.0,8B,8,RelativeSwitch,16,G,A\n"));

        // Check track 3 (loop extension cue H and cue B)
        assert!(csv.contains("3,Outro Jam,Artist 3,128.0,9B,9,Fifth,32,H,B\n"));
    }

    #[test]
    fn test_markdown_golden_match() {
        let e1 = make_entry(
            1,
            "Track A",
            "Artist A",
            120.0,
            7,
            CamelotLetter::A,
            4,
            None,
        );
        let trans = TransitionAdvice {
            transition_type: TransitionType::WholeStepLift,
            bpm_delta: 4.0,
            key_distance: 2,
            mode_flip: false,
            intervention_required: false,
            loop_extension_recommended: false,
            phrase_bars: 16,
            notes: vec![],
            ..Default::default()
        };
        let e2 = make_entry(
            2,
            "Track B | Remix",
            "Artist B",
            124.0,
            9,
            CamelotLetter::A,
            8,
            Some(trans),
        );

        let md = generate_set_sheet_markdown(&[e1, e2], Some("Festival 2026 Set"));

        assert!(md.contains("# Festival 2026 Set\n\n"));
        assert!(md.contains(
            "| Order | Title | Artist | BPM | Camelot Key | Energy | Transition Type | Recommended Bars | Out Cue | In Cue |\n"
        ));
        assert!(md.contains("| 1 | Track A | Artist A | 120.0 | 7A | 4 | - | - | - | - |\n"));
        // Check pipe escaping in title
        assert!(md.contains(
            "| 2 | Track B \\| Remix | Artist B | 124.0 | 9A | 8 | WholeStepLift | 16 | G | A |\n"
        ));
    }

    #[test]
    fn test_set_sheet_overwrite_protection() {
        let temp_dir = std::env::temp_dir().join("set_sheet_test");
        let csv_path = temp_dir.join("set.csv");
        let md_path = temp_dir.join("set.md");

        let e1 = make_entry(
            1,
            "Track 1",
            "Artist 1",
            125.0,
            8,
            CamelotLetter::A,
            6,
            None,
        );

        // Initial write with overwrite = true
        export_set_sheet_csv_with_options(std::slice::from_ref(&e1), &csv_path, true).unwrap();
        export_set_sheet_markdown_with_options(std::slice::from_ref(&e1), &md_path, true).unwrap();
        assert!(csv_path.exists());
        assert!(md_path.exists());

        // Second write with overwrite = false should fail
        let err_csv = export_set_sheet_csv(std::slice::from_ref(&e1), &csv_path).unwrap_err();
        assert!(matches!(err_csv, ExportError::FileExists(_)));

        let err_md = export_set_sheet_markdown(std::slice::from_ref(&e1), &md_path).unwrap_err();
        assert!(matches!(err_md, ExportError::FileExists(_)));

        let _ = fs::remove_file(csv_path);
        let _ = fs::remove_file(md_path);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_four_point_cue_resolution() {
        let trans = TransitionAdvice {
            transition_type: TransitionType::ExactMatch,
            bpm_delta: 0.0,
            key_distance: 0,
            mode_flip: false,
            intervention_required: false,
            loop_extension_recommended: false,
            phrase_bars: 16,
            notes: vec!["Mix out: Cue D, In: Cue C (Drop)".to_string()],
            ..Default::default()
        };
        let e = make_entry(
            2,
            "Drop Track",
            "Artist",
            126.0,
            8,
            CamelotLetter::A,
            7,
            Some(trans),
        );
        let (out_cue, in_cue) = resolve_cues(&e);
        assert_eq!(out_cue, "D");
        assert_eq!(in_cue, "C");
    }

    #[test]
    fn test_csv_utf8_bom() {
        let e1 = make_entry(
            1,
            "BOM Track",
            "Artist",
            120.0,
            8,
            CamelotLetter::A,
            5,
            None,
        );
        let csv_no_bom = generate_set_sheet_csv(&[e1.clone()]);
        let csv_with_bom = generate_set_sheet_csv_with_bom(&[e1], true);

        assert!(!csv_no_bom.starts_with('\u{FEFF}'));
        assert!(csv_with_bom.starts_with('\u{FEFF}'));
        assert_eq!(&csv_with_bom['\u{FEFF}'.len_utf8()..], &csv_no_bom);
    }

    #[test]
    fn test_csv_and_markdown_markup_and_newlines() {
        let title_weird = "Multi\nLine, Title \"With Quotes\" | and <Markup>";
        let artist_weird = "Artist\r\nWith Carriage\nReturn";
        let e1 = make_entry(
            1,
            title_weird,
            artist_weird,
            128.0,
            8,
            CamelotLetter::A,
            6,
            None,
        );

        // 1. CSV test
        let csv = generate_set_sheet_csv(&[e1.clone()]);
        // Escaped title should be wrapped in quotes and have quotes doubled
        assert!(csv.contains("\"Multi\nLine, Title \"\"With Quotes\"\" | and <Markup>\""));
        assert!(csv.contains("\"Artist\r\nWith Carriage\nReturn\""));

        // 2. Markdown test
        let md = generate_set_sheet_markdown(&[e1], Some("Markdown Test"));
        // Newlines must be replaced with spaces and pipe escaped
        assert!(md.contains("Multi Line, Title \"With Quotes\" \\| and <Markup>"));
        assert!(md.contains("Artist With Carriage Return"));

        // Count lines in markdown: header(2) + separator(1) + 1 table row = exactly 4 lines in table section
        let table_rows: Vec<&str> = md.lines().filter(|l| l.starts_with('|')).collect();
        assert_eq!(
            table_rows.len(),
            3,
            "table should have exactly header, separator, and 1 track row"
        );
    }
}
