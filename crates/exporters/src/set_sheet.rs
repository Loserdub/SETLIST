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
        } else {
            "G"
        };
        let mut in_cue = "A";

        for note in &trans.notes {
            let lower = note.to_lowercase();
            if lower.contains("out") {
                if lower.contains("cue h")
                    || lower.contains("out: h")
                    || lower.contains("out cue: h")
                {
                    out_cue = "H";
                } else if lower.contains("cue g")
                    || lower.contains("out: g")
                    || lower.contains("out cue: g")
                {
                    out_cue = "G";
                }
            }
            if lower.contains("in") {
                if lower.contains("cue b") || lower.contains("in: b") || lower.contains("in cue: b")
                {
                    in_cue = "B";
                } else if lower.contains("cue a")
                    || lower.contains("in: a")
                    || lower.contains("in cue: a")
                {
                    in_cue = "A";
                }
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

/// Generates a set sheet in CSV format.
#[must_use]
pub fn generate_set_sheet_csv(entries: &[SetlistEntry]) -> String {
    let mut out = String::from(
        "Order,Title,Artist,BPM,Camelot Key,Energy,Transition Type,Recommended Bars,Out Cue,In Cue\n",
    );

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

        // Sanitize markdown pipe character in values
        let clean_title = title.replace('|', "\\|");
        let clean_artist = artist.replace('|', "\\|");

        out.push_str(&format!(
            "| {order} | {clean_title} | {clean_artist} | {bpm} | {key} | {energy} | {trans} | {bars} | {out_cue} | {in_cue} |\n"
        ));
    }

    out
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
    let path = output_path.as_ref();
    if path.exists() && !overwrite {
        return Err(ExportError::FileExists(path.to_path_buf()));
    }

    let csv_content = generate_set_sheet_csv(entries);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    fs::write(path, csv_content)?;
    Ok(())
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
        export_set_sheet_csv_with_options(&[e1.clone()], &csv_path, true).unwrap();
        export_set_sheet_markdown_with_options(&[e1.clone()], &md_path, true).unwrap();
        assert!(csv_path.exists());
        assert!(md_path.exists());

        // Second write with overwrite = false should fail
        let err_csv = export_set_sheet_csv(&[e1.clone()], &csv_path).unwrap_err();
        assert!(matches!(err_csv, ExportError::FileExists(_)));

        let err_md = export_set_sheet_markdown(&[e1], &md_path).unwrap_err();
        assert!(matches!(err_md, ExportError::FileExists(_)));

        let _ = fs::remove_file(csv_path);
        let _ = fs::remove_file(md_path);
        let _ = fs::remove_dir(temp_dir);
    }
}
