//! Regression tests for safe setlist export.

use std::fs;

use app_lib::commands::export_set_core;
use core_types::{
    BeatGrid, Camelot, CamelotLetter, DynamicsAnalysis, EnergyCurve, ExportTarget, Key,
    LoudnessInfo, Mode, RhythmAnalysis, SetlistEntry, Track, TrackAnalysis, TrackTags,
    Waveform3Band, WaveformBand,
};

fn make_test_entry(pos: u32, id: &str, title: &str, artist: &str, bpm: f64) -> SetlistEntry {
    let dummy_band = WaveformBand {
        peak: vec![],
        rms: vec![],
    };

    SetlistEntry {
        position: pos,
        track_id: id.to_string(),
        track: Some(Track {
            id: id.to_string(),
            path: format!("/music/{id}.mp3"),
            hash: "dummy_hash".to_string(),
            duration_ms: 180_000.0,
            tags: TrackTags {
                title: Some(title.to_string()),
                artist: Some(artist.to_string()),
                album: Some("Test Album".to_string()),
            },
            analysis: Some(TrackAnalysis {
                loudness: LoudnessInfo {
                    integrated_lufs: -10.0,
                    loudness_range: 4.0,
                    true_peak: -0.5,
                },
                rhythm: RhythmAnalysis {
                    grid: BeatGrid {
                        bpm,
                        first_downbeat_ms: 0.0,
                        beats_ms: vec![],
                        downbeat_flags: vec![],
                        steady: true,
                    },
                    bpm_alternates: vec![],
                },
                key: Key {
                    pitch_class: 0,
                    mode: Mode::Major,
                    camelot: Camelot {
                        number: 8,
                        letter: CamelotLetter::B,
                    },
                    tuning_cents: 0.0,
                },
                dynamics: DynamicsAnalysis {
                    frame_rate: 43.0,
                    rms_curve: vec![],
                    low_ratio_curve: vec![],
                    centroid_curve: vec![],
                },
                energy_score: 7,
                energy_curve: EnergyCurve { per_bar: vec![] },
                segments: vec![],
                cue_points: vec![],
                waveform: Waveform3Band {
                    points_per_sec: 150,
                    low: dummy_band.clone(),
                    mid: dummy_band.clone(),
                    high: dummy_band,
                },
            }),
            analyzed_at: None,
            analysis_version: None,
        }),
        transition: None,
        target_energy: Some(7.0),
    }
}

#[test]
fn test_export_prevents_silent_overwrite() {
    let tmp = tempfile::tempdir().expect("create tempdir");
    let dest = tmp.path().join("existing_setlist.xml");

    // Write initial file
    fs::write(&dest, "<ORIGINAL_CONTENT/>").expect("write initial file");

    let entries = vec![
        make_test_entry(1, "trk1", "Track 1", "Artist 1", 124.0),
        make_test_entry(2, "trk2", "Track 2", "Artist 2", 126.0),
    ];

    // Attempt export without overwrite
    let err = export_set_core(
        &entries,
        ExportTarget::RekordboxXml,
        dest.clone(),
        false,
        |_| {},
    )
    .expect_err("export must fail when file exists and overwrite is false");

    assert!(
        err.contains("already exists"),
        "error message should state file already exists: {err}"
    );

    // Verify original content was not overwritten
    let content = fs::read_to_string(&dest).expect("read file");
    assert_eq!(content, "<ORIGINAL_CONTENT/>");
}

#[test]
fn test_export_allows_explicit_overwrite() {
    let tmp = tempfile::tempdir().expect("create tempdir");
    let dest = tmp.path().join("to_overwrite.m3u8");

    // Pre-create file
    fs::write(&dest, "#PREEXISTING").expect("write pre-existing file");

    let entries = vec![make_test_entry(1, "trk1", "Track 1", "Artist 1", 124.0)];

    let result = export_set_core(&entries, ExportTarget::M3u8, dest.clone(), true, |_| {})
        .expect("export should succeed with overwrite = true");

    assert_eq!(result.format, ExportTarget::M3u8);
    assert_eq!(result.track_count, 1);
    assert_eq!(result.path, dest.to_string_lossy());

    let content = fs::read_to_string(&dest).expect("read file");
    assert!(content.contains("#EXTM3U"));
    assert!(!content.contains("#PREEXISTING"));
}

#[test]
fn test_export_returns_structured_result_all_formats() {
    let tmp = tempfile::tempdir().expect("create tempdir");
    let entries = vec![
        make_test_entry(1, "trk1", "Opener", "Artist A", 122.0),
        make_test_entry(2, "trk2", "Closer", "Artist B", 126.0),
    ];

    let targets = [
        (ExportTarget::RekordboxXml, "set.xml"),
        (ExportTarget::M3u8, "set.m3u8"),
        (ExportTarget::SetSheetCsv, "set.csv"),
        (ExportTarget::SetSheetMarkdown, "set.md"),
    ];

    for (target, filename) in targets {
        let path = tmp.path().join(filename);
        let res = export_set_core(&entries, target, path.clone(), false, |_| {})
            .unwrap_or_else(|e| panic!("failed exporting {target:?}: {e}"));

        assert_eq!(res.format, target);
        assert_eq!(res.track_count, 2);
        assert_eq!(res.path, path.to_string_lossy());
        assert!(path.exists());
    }
}

#[test]
fn test_export_creates_nested_parent_directories() {
    let tmp = tempfile::tempdir().expect("create tempdir");
    let nested_dest = tmp
        .path()
        .join("deeply")
        .join("nested")
        .join("folder")
        .join("sheet.csv");

    let entries = vec![make_test_entry(1, "trk1", "Track 1", "Artist 1", 125.0)];

    let res = export_set_core(
        &entries,
        ExportTarget::SetSheetCsv,
        nested_dest.clone(),
        false,
        |_| {},
    )
    .expect("export should create parent directories");

    assert_eq!(res.track_count, 1);
    assert!(nested_dest.exists());
}
