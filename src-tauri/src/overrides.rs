//! Tauri commands for managing user analysis overrides.

use crate::state::AppState;
use library_db::{
    clear_override, get_override, get_override_flags, get_track_with_overrides, set_override,
    TrackOverride, TrackOverrideFlags, TrackOverridePatch, TrackWithOverrides,
};
use tauri::State;

/// Core logic for retrieving a track by ID with its user override flags.
///
/// # Errors
/// Returns error text if database lock or query fails.
pub fn get_track_core(state: &AppState, id: &str) -> Result<Option<TrackWithOverrides>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;
    get_track_with_overrides(&conn, id).map_err(|e| e.to_string())
}

/// Sets user overrides for a track's analysis values.
///
/// Allows the user to correct BPM, first downbeat, Camelot key, and cue points.
/// Corrections survive subsequent re-analysis operations.
///
/// Accepts either `track_id` or `id` to identify the track.
///
/// # Errors
/// Returns error text if the track is not found or database execution fails.
#[tauri::command]
pub async fn set_track_override(
    state: State<'_, AppState>,
    track_id: Option<String>,
    id: Option<String>,
    patch: TrackOverridePatch,
) -> Result<(), String> {
    let target_id = track_id
        .or(id)
        .ok_or_else(|| "track id is required".to_string())?;

    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;

    set_override(&conn, &target_id, &patch).map_err(|e| e.to_string())
}

/// Clears specified user overrides for a track, reverting them to analyzed values.
///
/// If `fields` is empty or None, all overrides for the track are cleared.
///
/// Accepts either `track_id` or `id` to identify the track.
///
/// # Errors
/// Returns error text if the track is not found or database execution fails.
#[tauri::command]
pub async fn clear_track_override(
    state: State<'_, AppState>,
    track_id: Option<String>,
    id: Option<String>,
    fields: Option<Vec<String>>,
) -> Result<(), String> {
    let target_id = track_id
        .or(id)
        .ok_or_else(|| "track id is required".to_string())?;

    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;

    let field_refs: Vec<&str> = match fields {
        Some(ref f) => f.iter().map(|s| s.as_str()).collect(),
        None => Vec::new(),
    };

    clear_override(&conn, &target_id, &field_refs).map_err(|e| e.to_string())
}

/// Retrieves stored override values for a track, if any.
///
/// # Errors
/// Returns error text if database query fails.
#[tauri::command]
pub async fn get_track_override(
    state: State<'_, AppState>,
    track_id: Option<String>,
    id: Option<String>,
) -> Result<Option<TrackOverride>, String> {
    let target_id = track_id
        .or(id)
        .ok_or_else(|| "track id is required".to_string())?;

    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;

    get_override(&conn, &target_id).map_err(|e| e.to_string())
}

/// Retrieves override flags for a track indicating which fields have user overrides.
///
/// # Errors
/// Returns error text if database query fails.
#[tauri::command]
pub async fn get_track_override_flags(
    state: State<'_, AppState>,
    track_id: Option<String>,
    id: Option<String>,
) -> Result<TrackOverrideFlags, String> {
    let target_id = track_id
        .or(id)
        .ok_or_else(|| "track id is required".to_string())?;

    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;

    get_override_flags(&conn, &target_id).map_err(|e| e.to_string())
}

/// Core testable implementation of setting a track override.
pub fn set_track_override_core(
    state: &AppState,
    track_id: &str,
    patch: &TrackOverridePatch,
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;
    set_override(&conn, track_id, patch).map_err(|e| e.to_string())
}

/// Core testable implementation of clearing track overrides.
pub fn clear_track_override_core(
    state: &AppState,
    track_id: &str,
    fields: &[&str],
) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("database mutex error: {e}"))?;
    clear_override(&conn, track_id, fields).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{
        Camelot, CamelotLetter, CostWeights, CueKind, CuePoint, DynamicsAnalysis, EnergyCurve,
        EnergyProfile, Key, LoudnessInfo, Mode, RhythmAnalysis, Segment, SegmentLabel,
        SetlistEntry, Track, TrackAnalysis, TrackTags, Waveform3Band, WaveformBand,
    };
    use exporters::{
        generate_m3u8, generate_rekordbox_xml, generate_set_sheet_csv, generate_set_sheet_markdown,
        RekordboxExportOptions,
    };
    use library_db::{rebuild_beat_grid, upsert_track};
    use sequencer::matrix::CostMatrix;

    fn sample_analysis(
        bpm: f64,
        downbeat: f64,
        camelot_num: u8,
        camelot_let: CamelotLetter,
    ) -> TrackAnalysis {
        let mode = match camelot_let {
            CamelotLetter::A => Mode::Minor,
            CamelotLetter::B => Mode::Major,
        };
        let pc = match camelot_let {
            CamelotLetter::A => (7 * (camelot_num as i32 - 5)).rem_euclid(12) as u8,
            CamelotLetter::B => (7 * (camelot_num as i32 - 8)).rem_euclid(12) as u8,
        };
        TrackAnalysis {
            loudness: LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 6.0,
                true_peak: -1.0,
            },
            rhythm: RhythmAnalysis {
                grid: rebuild_beat_grid(bpm, downbeat, 180_000.0),
                bpm_alternates: vec![bpm * 0.5, bpm * 2.0],
            },
            key: Key {
                pitch_class: pc,
                mode,
                camelot: Camelot::new(camelot_num, camelot_let).unwrap(),
                tuning_cents: 0.0,
            },
            dynamics: DynamicsAnalysis {
                frame_rate: 86.0,
                rms_curve: vec![0.5; 10],
                low_ratio_curve: vec![0.3; 10],
                centroid_curve: vec![1500.0; 10],
            },
            energy_score: 7,
            energy_curve: EnergyCurve {
                per_bar: vec![0.5, 0.6, 0.7, 0.8],
            },
            segments: vec![
                Segment {
                    label: SegmentLabel::Intro,
                    start_ms: 0.0,
                    end_ms: 15_000.0,
                    energy: 4,
                },
                Segment {
                    label: SegmentLabel::Drop,
                    start_ms: 15_000.0,
                    end_ms: 60_000.0,
                    energy: 8,
                },
            ],
            cue_points: vec![CuePoint {
                index: 0,
                time_ms: downbeat,
                label: "A".to_string(),
                color_hex: "#00FF00".to_string(),
                kind: CueKind::HotCue,
                loop_end_ms: None,
            }],
            waveform: Waveform3Band {
                points_per_sec: 100,
                low: WaveformBand {
                    peak: vec![10],
                    rms: vec![5],
                },
                mid: WaveformBand {
                    peak: vec![20],
                    rms: vec![10],
                },
                high: WaveformBand {
                    peak: vec![15],
                    rms: vec![7],
                },
            },
        }
    }

    fn sample_track(
        id: &str,
        bpm: f64,
        downbeat: f64,
        camelot_num: u8,
        camelot_let: CamelotLetter,
    ) -> Track {
        Track {
            id: id.to_string(),
            path: format!("/music/{id}.mp3"),
            hash: format!("hash_{id}"),
            tags: TrackTags {
                title: Some(format!("Title {id}")),
                artist: Some(format!("Artist {id}")),
                album: Some(format!("Album {id}")),
            },
            duration_ms: 180_000.0,
            analysis: Some(sample_analysis(bpm, downbeat, camelot_num, camelot_let)),
            analyzed_at: Some("2026-10-01T00:00:00Z".to_string()),
            analysis_version: Some("v1".to_string()),
        }
    }

    #[test]
    fn test_overridden_bpm_changes_sequencer_cost_matrix() {
        let state = AppState::in_memory().expect("in-memory state");
        let conn = state.db.lock().expect("lock db");

        let t1 = sample_track("track-seq-1", 120.0, 100.0, 8, CamelotLetter::A);
        let t2 = sample_track("track-seq-2", 124.0, 100.0, 8, CamelotLetter::A);
        upsert_track(&conn, &t1).expect("upsert t1");
        upsert_track(&conn, &t2).expect("upsert t2");
        drop(conn);

        // Fetch tracks as the sequencer would
        let loaded_t1 = get_track_core(&state, "track-seq-1").unwrap().unwrap();
        let loaded_t2 = get_track_core(&state, "track-seq-2").unwrap().unwrap();

        let a1 = loaded_t1.analysis.as_ref().unwrap();
        let a2 = loaded_t2.analysis.as_ref().unwrap();

        let weights = CostWeights {
            tempo: 1.0,
            key: 0.0,
            energy: 0.0,
            timbre: 0.0,
        };

        let matrix_before = CostMatrix::build(
            &[a1.clone(), a2.clone()],
            &weights,
            EnergyProfile::LinearRamp,
        );
        let cost_before = matrix_before.costs[1]; // transition 0 -> 1
                                                  // Tempo cost: |120 - 124| / 6 = 4.0 / 6.0 = 0.666667
        assert!((cost_before - (4.0 / 6.0)).abs() < 1e-4);

        // User overrides Track 1 BPM to match Track 2 exactly (124.0)
        set_track_override_core(
            &state,
            "track-seq-1",
            &TrackOverridePatch {
                bpm: Some(124.0),
                ..Default::default()
            },
        )
        .expect("set override");

        // Re-fetch tracks from database
        let effective_t1 = get_track_core(&state, "track-seq-1").unwrap().unwrap();
        let eff_a1 = effective_t1.analysis.as_ref().unwrap();

        let matrix_after = CostMatrix::build(
            &[eff_a1.clone(), a2.clone()],
            &weights,
            EnergyProfile::LinearRamp,
        );
        let cost_after = matrix_after.costs[1]; // transition 0 -> 1
                                                // Effective tempo delta is |124 - 124| = 0.0 -> tempo cost 0.0
        assert_eq!(cost_after, 0.0);
        assert!(cost_after < cost_before);
    }

    #[test]
    fn test_overridden_bpm_changes_rekordbox_export() {
        let state = AppState::in_memory().expect("in-memory state");
        let conn = state.db.lock().expect("lock db");

        let t1 = sample_track("track-rekordbox", 120.0, 100.0, 8, CamelotLetter::A);
        upsert_track(&conn, &t1).expect("upsert t1");
        drop(conn);

        // Before override: export has 120.00 BPM
        let before_track = get_track_core(&state, "track-rekordbox").unwrap().unwrap();
        let entry_before = SetlistEntry {
            position: 1,
            track_id: "track-rekordbox".to_string(),
            track: Some(before_track.track),
            transition: None,
            target_energy: Some(7.0),
        };
        let options = RekordboxExportOptions::default();
        let xml_before = generate_rekordbox_xml(&[entry_before], &options).expect("generate xml");
        assert!(xml_before.contains("AverageBpm=\"120.00\""));
        assert!(xml_before.contains("Bpm=\"120.00\""));

        // User overrides BPM to 133.50
        set_track_override_core(
            &state,
            "track-rekordbox",
            &TrackOverridePatch {
                bpm: Some(133.5),
                ..Default::default()
            },
        )
        .expect("set override");

        // After override: export must see effective value 133.50 with NO exporter changes!
        let after_track = get_track_core(&state, "track-rekordbox").unwrap().unwrap();
        let entry_after = SetlistEntry {
            position: 1,
            track_id: "track-rekordbox".to_string(),
            track: Some(after_track.track),
            transition: None,
            target_energy: Some(7.0),
        };
        let xml_after = generate_rekordbox_xml(&[entry_after], &options).expect("generate xml");
        assert!(xml_after.contains("AverageBpm=\"133.50\""));
        assert!(xml_after.contains("Bpm=\"133.50\""));
    }

    #[test]
    fn test_tauri_command_overrides_flow() {
        let state = AppState::in_memory().expect("in-memory state");
        let conn = state.db.lock().expect("lock db");

        let t = sample_track("track-tauri-cmd", 120.0, 100.0, 8, CamelotLetter::A);
        upsert_track(&conn, &t).expect("upsert track");
        drop(conn);

        // Initially no overrides
        let loaded = get_track_core(&state, "track-tauri-cmd").unwrap().unwrap();
        assert!(!loaded.overrides.bpm);
        assert!(!loaded.overrides.key_camelot);

        // Set override via core
        set_track_override_core(
            &state,
            "track-tauri-cmd",
            &TrackOverridePatch {
                bpm: Some(125.0),
                key_camelot: Some("10B".to_string()),
                ..Default::default()
            },
        )
        .expect("set override");

        // get_track_core returns effective values and flags
        let updated = get_track_core(&state, "track-tauri-cmd").unwrap().unwrap();
        assert_eq!(updated.analysis.as_ref().unwrap().rhythm.grid.bpm, 125.0);
        assert_eq!(
            updated.analysis.as_ref().unwrap().key.camelot.to_string(),
            "10B"
        );
        assert!(updated.overrides.bpm);
        assert!(updated.overrides.key_camelot);
        assert!(!updated.overrides.first_downbeat_ms);
        assert!(!updated.overrides.cues);

        // Clear overrides
        clear_track_override_core(&state, "track-tauri-cmd", &["bpm"]).expect("clear bpm");
        let cleared = get_track_core(&state, "track-tauri-cmd").unwrap().unwrap();
        assert_eq!(cleared.analysis.as_ref().unwrap().rhythm.grid.bpm, 120.0); // reverted to analyzed
        assert!(!cleared.overrides.bpm);
        assert!(cleared.overrides.key_camelot); // key still active
    }

    #[test]
    fn test_overridden_title_and_artist_changes_all_exports() {
        let state = AppState::in_memory().expect("in-memory state");
        let conn = state.db.lock().expect("lock db");

        let t1 = sample_track("track-export-meta", 120.0, 100.0, 8, CamelotLetter::A);
        upsert_track(&conn, &t1).expect("upsert t1");
        drop(conn);

        // Before override: export has original tags
        let before_track = get_track_core(&state, "track-export-meta")
            .unwrap()
            .unwrap();
        let entry_before = SetlistEntry {
            position: 1,
            track_id: "track-export-meta".to_string(),
            track: Some(before_track.track),
            transition: None,
            target_energy: Some(7.0),
        };
        let options = RekordboxExportOptions::default();

        let xml_before =
            generate_rekordbox_xml(&[entry_before.clone()], &options).expect("generate xml");
        assert!(xml_before.contains("Name=\"Title track-export-meta\""));
        assert!(xml_before.contains("Artist=\"Artist track-export-meta\""));

        let m3u8_before = generate_m3u8(&[entry_before.clone()]);
        assert!(m3u8_before.contains("Artist track-export-meta - Title track-export-meta"));

        let csv_before = generate_set_sheet_csv(&[entry_before.clone()]);
        assert!(csv_before.contains("Title track-export-meta"));
        assert!(csv_before.contains("Artist track-export-meta"));

        let md_before = generate_set_sheet_markdown(&[entry_before], None);
        assert!(md_before.contains("Title track-export-meta"));
        assert!(md_before.contains("Artist track-export-meta"));

        // User overrides title and artist
        set_track_override_core(
            &state,
            "track-export-meta",
            &TrackOverridePatch {
                title: Some("Headline Banger".to_string()),
                artist: Some("DJ Resident".to_string()),
                ..Default::default()
            },
        )
        .expect("set override");

        // After override: all exports must see effective values
        let after_track = get_track_core(&state, "track-export-meta")
            .unwrap()
            .unwrap();
        assert!(after_track.overrides.title);
        assert!(after_track.overrides.artist);

        let entry_after = SetlistEntry {
            position: 1,
            track_id: "track-export-meta".to_string(),
            track: Some(after_track.track),
            transition: None,
            target_energy: Some(7.0),
        };

        let xml_after =
            generate_rekordbox_xml(&[entry_after.clone()], &options).expect("generate xml");
        assert!(xml_after.contains("Name=\"Headline Banger\""));
        assert!(xml_after.contains("Artist=\"DJ Resident\""));
        assert!(!xml_after.contains("Name=\"Title track-export-meta\""));

        let m3u8_after = generate_m3u8(&[entry_after.clone()]);
        assert!(m3u8_after.contains("DJ Resident - Headline Banger"));

        let csv_after = generate_set_sheet_csv(&[entry_after.clone()]);
        assert!(csv_after.contains("Headline Banger"));
        assert!(csv_after.contains("DJ Resident"));

        let md_after = generate_set_sheet_markdown(&[entry_after], None);
        assert!(md_after.contains("Headline Banger"));
        assert!(md_after.contains("DJ Resident"));

        // Clear overrides: exports revert to original tags
        clear_track_override_core(&state, "track-export-meta", &["title", "artist"])
            .expect("clear");
        let cleared_track = get_track_core(&state, "track-export-meta")
            .unwrap()
            .unwrap();
        assert!(!cleared_track.overrides.title);
        assert!(!cleared_track.overrides.artist);

        let entry_cleared = SetlistEntry {
            position: 1,
            track_id: "track-export-meta".to_string(),
            track: Some(cleared_track.track),
            transition: None,
            target_energy: Some(7.0),
        };
        let xml_reverted =
            generate_rekordbox_xml(&[entry_cleared], &options).expect("generate xml");
        assert!(xml_reverted.contains("Name=\"Title track-export-meta\""));
        assert!(xml_reverted.contains("Artist=\"Artist track-export-meta\""));
    }
}
