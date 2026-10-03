//! Regression tests for setlist sequencing flow:
//! - 4 tracks with 3 analyzed and 1 unanalyzed
//! - 4 tracks with 1 analyzed and 3 unanalyzed
//! - all tracks unanalyzed
//! - all tracks analyzed
//! - duplicate IDs are never introduced
//! - final output contains exactly the same track IDs as the input
//! - positions are contiguous 1..N
//! - transitions are recalculated correctly
//! - target energy corresponds to final position

use app_lib::commands::suggest_order_core;
use app_lib::state::AppState;
use core_types::{
    BeatGrid, Camelot, CamelotLetter, DynamicsAnalysis, EnergyCurve, EnergyProfile, Key,
    LoudnessInfo, Mode, RhythmAnalysis, Track, TrackAnalysis, TrackTags, Waveform3Band,
    WaveformBand,
};

fn make_test_track(
    id: &str,
    bpm: f64,
    camelot_num: u8,
    camelot_letter: CamelotLetter,
    energy: u8,
    analyzed: bool,
) -> Track {
    let analysis = if analyzed {
        Some(TrackAnalysis {
            loudness: LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 6.0,
                true_peak: -1.0,
            },
            rhythm: RhythmAnalysis {
                grid: BeatGrid {
                    first_downbeat_ms: 100.0,
                    bpm,
                    beats_ms: vec![100.0, 100.0 + 60000.0 / bpm],
                    downbeat_flags: vec![true, false],
                    steady: true,
                },
                bpm_alternates: vec![bpm * 0.5, bpm * 2.0],
            },
            key: Key {
                pitch_class: ((camelot_num * 7) % 12),
                mode: if camelot_letter == CamelotLetter::A {
                    Mode::Minor
                } else {
                    Mode::Major
                },
                camelot: Camelot::new(camelot_num, camelot_letter).unwrap(),
                tuning_cents: 0.0,
            },
            dynamics: DynamicsAnalysis {
                frame_rate: 86.13,
                rms_curve: vec![0.5],
                low_ratio_curve: vec![0.5],
                centroid_curve: vec![1000.0],
            },
            energy_score: energy,
            energy_curve: EnergyCurve {
                per_bar: vec![energy as f32],
            },
            segments: vec![],
            cue_points: vec![],
            waveform: Waveform3Band {
                points_per_sec: 10,
                low: WaveformBand {
                    peak: vec![100],
                    rms: vec![50],
                },
                mid: WaveformBand {
                    peak: vec![100],
                    rms: vec![50],
                },
                high: WaveformBand {
                    peak: vec![100],
                    rms: vec![50],
                },
            },
        })
    } else {
        None
    };

    Track {
        id: id.to_string(),
        path: format!("/music/{id}.mp3"),
        hash: format!("hash_{id}"),
        tags: TrackTags {
            title: Some(format!("Title {id}")),
            artist: Some("Artist".to_string()),
            album: None,
        },
        duration_ms: 180000.0,
        analysis,
        analyzed_at: if analyzed {
            Some("2026-10-02T00:00:00Z".to_string())
        } else {
            None
        },
        analysis_version: if analyzed {
            Some("1.0.0".to_string())
        } else {
            None
        },
    }
}

fn setup_test_app(tracks: &[Track]) -> (tempfile::TempDir, AppState) {
    let db_dir = tempfile::tempdir().expect("create temp dir for db");
    let db_path = db_dir.path().join("library.db");
    let state = AppState::new(db_path).expect("initialize AppState");

    {
        let conn = state.db.lock().expect("lock db");
        for track in tracks {
            library_db::upsert_track(&conn, track).expect("upsert track");
        }
    }

    (db_dir, state)
}

#[test]
fn test_regression_4_tracks_3_analyzed_1_unanalyzed() {
    let t1 = make_test_track("track-1", 120.0, 8, CamelotLetter::A, 4, true);
    let t2 = make_test_track("track-2", 124.0, 9, CamelotLetter::A, 6, true);
    let t3 = make_test_track("track-3", 128.0, 10, CamelotLetter::A, 5, false); // unanalyzed
    let t4 = make_test_track("track-4", 126.0, 10, CamelotLetter::A, 8, true);

    let (_dir, state) = setup_test_app(&[t1, t2, t3, t4]);
    let input_ids = vec![
        "track-1".to_string(),
        "track-2".to_string(),
        "track-3".to_string(),
        "track-4".to_string(),
    ];
    let profile = EnergyProfile::LinearRamp;

    let result = suggest_order_core(&state, Some(input_ids.clone()), Some(profile), None, |_| {})
        .expect("suggest_order_core succeeds");

    // 1. All original tracks preserved exactly once
    assert_eq!(result.len(), 4, "expected all 4 tracks to be present");
    let out_ids: Vec<String> = result.iter().map(|e| e.track_id.clone()).collect();
    let mut sorted_in = input_ids.clone();
    sorted_in.sort();
    let mut sorted_out = out_ids.clone();
    sorted_out.sort();
    assert_eq!(sorted_in, sorted_out, "all input track IDs must be present");

    // 2. Positions are contiguous 1..N
    for (i, entry) in result.iter().enumerate() {
        assert_eq!(
            entry.position,
            (i + 1) as u32,
            "position must be contiguous 1..N"
        );
    }

    // 3. Unanalyzed track (track-3) is merged deterministically at the end (pos 4)
    assert_eq!(
        result[3].track_id, "track-3",
        "unanalyzed track should be merged at the end"
    );

    // 4. Transitions: pos 1->2 and 2->3 are between analyzed tracks and calculated.
    // Pos 4 (unanalyzed) must have transition == None.
    assert!(
        result[0].transition.is_none(),
        "first track has no incoming transition"
    );
    assert!(
        result[1].transition.is_some(),
        "transition between analyzed tracks 1 and 2 must exist"
    );
    assert!(
        result[2].transition.is_some(),
        "transition between analyzed tracks 2 and 3 must exist"
    );
    assert!(
        result[3].transition.is_none(),
        "transition into unanalyzed track must be None"
    );

    // 5. Target energy corresponds to final position for all entries
    for (i, entry) in result.iter().enumerate() {
        let expected_energy = sequencer::target_energy(profile, i, 4);
        let actual_energy = entry.target_energy.expect("target_energy should be set");
        assert!(
            (actual_energy - expected_energy).abs() < 1e-4,
            "target energy at position {} was {} but expected {}",
            i + 1,
            actual_energy,
            expected_energy
        );
    }
}

#[test]
fn test_regression_4_tracks_1_analyzed_3_unanalyzed() {
    let t1 = make_test_track("track-1", 120.0, 8, CamelotLetter::A, 4, false); // unanalyzed
    let t2 = make_test_track("track-2", 124.0, 9, CamelotLetter::A, 6, true); // analyzed
    let t3 = make_test_track("track-3", 128.0, 10, CamelotLetter::A, 5, false); // unanalyzed
    let t4 = make_test_track("track-4", 126.0, 10, CamelotLetter::A, 8, false); // unanalyzed

    let (_dir, state) = setup_test_app(&[t1, t2, t3, t4]);
    let input_ids = vec![
        "track-1".to_string(),
        "track-2".to_string(),
        "track-3".to_string(),
        "track-4".to_string(),
    ];
    let profile = EnergyProfile::Wave;

    let result = suggest_order_core(&state, Some(input_ids.clone()), Some(profile), None, |_| {})
        .expect("suggest_order_core succeeds");

    // All tracks preserved
    assert_eq!(result.len(), 4);
    let mut sorted_in = input_ids.clone();
    sorted_in.sort();
    let mut sorted_out: Vec<String> = result.iter().map(|e| e.track_id.clone()).collect();
    sorted_out.sort();
    assert_eq!(sorted_in, sorted_out);

    // Analyzed track is at pos 1, followed by unanalyzed tracks in their original relative order
    assert_eq!(result[0].track_id, "track-2");
    assert_eq!(result[1].track_id, "track-1");
    assert_eq!(result[2].track_id, "track-3");
    assert_eq!(result[3].track_id, "track-4");

    // Contiguous positions 1..N
    for (i, entry) in result.iter().enumerate() {
        assert_eq!(entry.position, (i + 1) as u32);
    }

    // No adjacent pair has two analyzed tracks, so all transitions are None
    for entry in &result {
        assert!(entry.transition.is_none());
    }

    // Target energy corresponds to final position
    for (i, entry) in result.iter().enumerate() {
        let expected_energy = sequencer::target_energy(profile, i, 4);
        let actual_energy = entry.target_energy.unwrap();
        assert!((actual_energy - expected_energy).abs() < 1e-4);
    }
}

#[test]
fn test_regression_all_tracks_unanalyzed() {
    let t1 = make_test_track("track-1", 120.0, 8, CamelotLetter::A, 4, false);
    let t2 = make_test_track("track-2", 124.0, 9, CamelotLetter::A, 6, false);
    let t3 = make_test_track("track-3", 128.0, 10, CamelotLetter::A, 5, false);
    let t4 = make_test_track("track-4", 126.0, 10, CamelotLetter::A, 8, false);

    let (_dir, state) = setup_test_app(&[t1, t2, t3, t4]);
    let input_ids = vec![
        "track-1".to_string(),
        "track-2".to_string(),
        "track-3".to_string(),
        "track-4".to_string(),
    ];
    let profile = EnergyProfile::PeakPlateau;

    let result = suggest_order_core(&state, Some(input_ids.clone()), Some(profile), None, |_| {})
        .expect("suggest_order_core succeeds");

    // Requirement 13: Handle zero analyzed tracks by returning original order with all tracks intact
    assert_eq!(result.len(), 4);
    assert_eq!(result[0].track_id, "track-1");
    assert_eq!(result[1].track_id, "track-2");
    assert_eq!(result[2].track_id, "track-3");
    assert_eq!(result[3].track_id, "track-4");

    // Contiguous positions
    for (i, entry) in result.iter().enumerate() {
        assert_eq!(entry.position, (i + 1) as u32);
        assert!(entry.transition.is_none());
        let expected_energy = sequencer::target_energy(profile, i, 4);
        assert!((entry.target_energy.unwrap() - expected_energy).abs() < 1e-4);
    }
}

#[test]
fn test_regression_all_tracks_analyzed() {
    let t1 = make_test_track("track-1", 120.0, 8, CamelotLetter::A, 3, true);
    let t2 = make_test_track("track-2", 122.0, 9, CamelotLetter::A, 5, true);
    let t3 = make_test_track("track-3", 125.0, 10, CamelotLetter::A, 7, true);
    let t4 = make_test_track("track-4", 128.0, 11, CamelotLetter::A, 9, true);

    let (_dir, state) = setup_test_app(&[t1, t2, t3, t4]);
    let input_ids = vec![
        "track-1".to_string(),
        "track-2".to_string(),
        "track-3".to_string(),
        "track-4".to_string(),
    ];
    let profile = EnergyProfile::LinearRamp;

    let result = suggest_order_core(&state, Some(input_ids.clone()), Some(profile), None, |_| {})
        .expect("suggest_order_core succeeds");

    assert_eq!(result.len(), 4);

    // Contiguous positions 1..N
    for (i, entry) in result.iter().enumerate() {
        assert_eq!(entry.position, (i + 1) as u32);
        if i == 0 {
            assert!(entry.transition.is_none());
        } else {
            assert!(
                entry.transition.is_some(),
                "all adjacent analyzed tracks should have transition advice"
            );
        }
        let expected_energy = sequencer::target_energy(profile, i, 4);
        assert!((entry.target_energy.unwrap() - expected_energy).abs() < 1e-4);
    }
}

#[test]
fn test_regression_duplicate_ids_are_never_introduced() {
    let t1 = make_test_track("track-1", 120.0, 8, CamelotLetter::A, 4, true);
    let t2 = make_test_track("track-2", 124.0, 9, CamelotLetter::A, 6, true);
    let t3 = make_test_track("track-3", 128.0, 10, CamelotLetter::A, 5, false);

    let (_dir, state) = setup_test_app(&[t1, t2, t3]);

    // Provide duplicate IDs in input
    let input_ids = vec![
        "track-1".to_string(),
        "track-2".to_string(),
        "track-1".to_string(),
        "track-3".to_string(),
        "track-2".to_string(),
    ];

    let result = suggest_order_core(
        &state,
        Some(input_ids),
        Some(EnergyProfile::LinearRamp),
        None,
        |_| {},
    )
    .expect("suggest_order_core succeeds");

    assert_eq!(result.len(), 3, "duplicates should be deduplicated");
    let mut seen = std::collections::HashSet::new();
    for entry in &result {
        assert!(
            seen.insert(entry.track_id.clone()),
            "duplicate ID found in output: {}",
            entry.track_id
        );
    }

    for (i, entry) in result.iter().enumerate() {
        assert_eq!(entry.position, (i + 1) as u32);
    }
}
