//! Integration and regression tests for Settings wiring in Tauri commands:
//! - Custom key penalty table saved via save_settings changes the cost computed by suggest_order and get_advice.
//! - Default settings give identical ordering and costs as standard reference.
//! - Database-persisted cost weights are applied when caller provides no explicit weights.

use app_lib::commands::{get_advice_core, suggest_order_core, suggest_order_pins_core};
use app_lib::state::AppState;
use core_types::{
    BeatGrid, Camelot, CamelotLetter, CostWeights, DynamicsAnalysis, EnergyCurve,
    EnergyModelSettings, EnergyProfile, Key, KeyPenaltyRow, LoudnessInfo, Mode, RhythmAnalysis,
    Track, TrackAnalysis, TrackTags, Waveform3Band, WaveformBand,
};

fn make_test_track(
    id: &str,
    bpm: f64,
    camelot_num: u8,
    camelot_letter: CamelotLetter,
    energy: u8,
) -> Track {
    let camelot = Camelot::new(camelot_num, camelot_letter)
        .unwrap_or_else(|_| Camelot::new(8, CamelotLetter::A).expect("default camelot"));

    let analysis = TrackAnalysis {
        loudness: LoudnessInfo {
            integrated_lufs: -14.0,
            loudness_range: 6.0,
            true_peak: -1.0,
        },
        rhythm: RhythmAnalysis {
            grid: BeatGrid {
                first_downbeat_ms: 0.0,
                bpm,
                beats_ms: vec![0.0, 500.0, 1000.0, 1500.0],
                downbeat_flags: vec![true, false, false, false],
                steady: true,
            },
            bpm_alternates: vec![bpm * 0.5, bpm * 2.0],
        },
        key: Key {
            pitch_class: ((camelot_num * 7) % 12),
            mode: match camelot_letter {
                CamelotLetter::A => Mode::Minor,
                CamelotLetter::B => Mode::Major,
            },
            camelot,
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
        analysis: Some(analysis),
        analyzed_at: Some("2026-10-02T00:00:00Z".to_string()),
        analysis_version: Some("1".to_string()),
    }
}

#[tokio::test]
async fn test_default_settings_give_deterministic_order_and_standard_cost() {
    let state = AppState::in_memory().expect("in-memory state");

    let t1 = make_test_track("t1", 124.0, 8, CamelotLetter::A, 5); // 8A
    let t2 = make_test_track("t2", 124.0, 9, CamelotLetter::A, 6); // 9A (d=1, same_mode default = 0.10)
    let t3 = make_test_track("t3", 124.0, 10, CamelotLetter::A, 7); // 10A

    {
        let conn = state.db.lock().expect("db lock");
        library_db::upsert_track(&conn, &t1).expect("save t1");
        library_db::upsert_track(&conn, &t2).expect("save t2");
        library_db::upsert_track(&conn, &t3).expect("save t3");
    }

    // Default advice cost check (d=1, same mode -> Phi_key = 0.10)
    let advice = get_advice_core(&state, "t1", "t2", None, None, None).expect("get advice");
    assert_eq!(advice.key_cost, Some(0.10));

    // Run suggest order with default settings
    let result = suggest_order_core(
        &state,
        Some(vec!["t1".to_string(), "t2".to_string(), "t3".to_string()]),
        Some(EnergyProfile::LinearRamp),
        None,
        |_| {},
    )
    .expect("suggest order");

    assert_eq!(result.len(), 3);
    assert_eq!(result[0].track_id, "t1");
    assert_eq!(result[1].track_id, "t2");
    assert_eq!(result[2].track_id, "t3");

    // Verify transition advice in setlist entry reflects key_cost 0.10
    let trans = result[1].transition.as_ref().expect("transition t1->t2");
    assert_eq!(trans.key_cost, Some(0.10));
}

#[tokio::test]
async fn test_custom_key_penalties_change_cost_in_get_advice_and_suggest_order() {
    let state = AppState::in_memory().expect("in-memory state");

    let t1 = make_test_track("t1", 124.0, 8, CamelotLetter::A, 5); // 8A
    let t2 = make_test_track("t2", 124.0, 9, CamelotLetter::A, 5); // 9A (d=1 from 8A)
    let t3 = make_test_track("t3", 124.0, 8, CamelotLetter::B, 5); // 8B (d=0, mode flip from 8A)

    {
        let conn = state.db.lock().expect("db lock");
        library_db::upsert_track(&conn, &t1).expect("save t1");
        library_db::upsert_track(&conn, &t2).expect("save t2");
        library_db::upsert_track(&conn, &t3).expect("save t3");
    }

    // Initial check under default settings:
    // t1 -> t2: d=1, same mode -> key_cost = 0.10
    let default_advice = get_advice_core(&state, "t1", "t2", None, None, None).expect("get advice");
    assert_eq!(default_advice.key_cost, Some(0.10));

    // Save custom settings: heavily penalize d=1 (0.95) and make mode flip d=0 completely free (0.00)
    {
        let conn = state.db.lock().expect("db lock");
        let mut settings = library_db::load_settings(&conn).expect("load settings");
        settings.key_penalties = vec![
            KeyPenaltyRow {
                distance: 0,
                same_mode: 0.00,
                mode_flip: 0.00, // custom: mode flips at d=0 are free
            },
            KeyPenaltyRow {
                distance: 1,
                same_mode: 0.95, // custom: fifths are heavily penalized
                mode_flip: 0.95,
            },
            KeyPenaltyRow {
                distance: 2,
                same_mode: 0.35,
                mode_flip: 0.60,
            },
            KeyPenaltyRow {
                distance: 3,
                same_mode: 0.70,
                mode_flip: 0.80,
            },
            KeyPenaltyRow {
                distance: 4,
                same_mode: 0.85,
                mode_flip: 0.90,
            },
            KeyPenaltyRow {
                distance: 5,
                same_mode: 0.95,
                mode_flip: 0.95,
            },
            KeyPenaltyRow {
                distance: 6,
                same_mode: 1.00,
                mode_flip: 1.00,
            },
        ];
        library_db::save_settings(&conn, &settings).expect("save custom settings");
    }

    // After updating settings, get_advice should immediately reflect custom penalty
    let updated_advice_t2 =
        get_advice_core(&state, "t1", "t2", None, None, None).expect("get advice t1->t2");
    assert_eq!(updated_advice_t2.key_cost, Some(0.95));

    let updated_advice_t3 =
        get_advice_core(&state, "t1", "t3", None, None, None).expect("get advice t1->t3");
    assert_eq!(updated_advice_t3.key_cost, Some(0.00));

    // In suggest_order, the custom penalty should be loaded from DB and used for transition advice
    let ordered = suggest_order_pins_core(
        &state,
        Some(vec!["t1".to_string(), "t2".to_string()]),
        Some(EnergyProfile::PeakPlateau),
        None,
        Some("t1".to_string()),
        Some("t2".to_string()),
        |_| {},
    )
    .expect("suggest order");

    let trans = ordered[1].transition.as_ref().expect("transition t1->t2");
    assert_eq!(trans.key_cost, Some(0.95));
}

#[tokio::test]
async fn test_saved_cost_weights_and_energy_divisor_are_applied_when_no_weights_passed() {
    let state = AppState::in_memory().expect("in-memory state");

    let t1 = make_test_track("t1", 120.0, 8, CamelotLetter::A, 2);
    let t2 = make_test_track("t2", 130.0, 8, CamelotLetter::A, 8);

    {
        let conn = state.db.lock().expect("db lock");
        library_db::upsert_track(&conn, &t1).expect("save t1");
        library_db::upsert_track(&conn, &t2).expect("save t2");

        // Save custom weights: pure tempo weight (w_tempo=1.0, others=0.0) and divisor=36.0
        let mut settings = library_db::load_settings(&conn).expect("load settings");
        settings.cost_weights = CostWeights {
            tempo: 1.0,
            key: 0.0,
            energy: 0.0,
            timbre: 0.0,
        };
        settings.energy_model = EnergyModelSettings {
            divisor: 36.0,
            target_step: 2.0,
        };
        library_db::save_settings(&conn, &settings).expect("save settings");
    }

    // Call get_advice with weights = None -> should use saved pure tempo weights
    let advice = get_advice_core(&state, "t1", "t2", None, None, None).expect("get advice");
    assert_eq!(
        advice.weights,
        Some(CostWeights {
            tempo: 1.0,
            key: 0.0,
            energy: 0.0,
            timbre: 0.0,
        })
    );
    // Total cost with pure tempo weight: w_tempo * Phi_tempo = 1.0 * min(|130-120|/6, 1) = 1.0 * 1.0 = 1.0
    assert_eq!(advice.total_cost, Some(1.0));

    // Explicitly passing weights overrides the saved weights
    let custom_weights = CostWeights {
        tempo: 0.0,
        key: 1.0,
        energy: 0.0,
        timbre: 0.0,
    };
    let advice_override =
        get_advice_core(&state, "t1", "t2", None, Some(custom_weights.clone()), None)
            .expect("get advice with override");
    assert_eq!(advice_override.weights, Some(custom_weights));
    // Same key (8A -> 8A): key_cost = 0.0, so total_cost = 0.0
    assert_eq!(advice_override.total_cost, Some(0.0));
}
