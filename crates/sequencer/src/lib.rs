//! Cost model, solvers, and transition advisor for setlist sequencing.

pub mod advisor;
pub mod bridge;
pub mod matrix;
pub mod profiles;
pub mod relationship;
pub mod scoring;
pub mod solve;

use core_types::{
    CostWeights, EnergyProfile, TrackAnalysis, TransitionAdvice as CoreTransitionAdvice,
};
use thiserror::Error;

pub use advisor::{
    advise, advise_with_cost, advise_with_cost_and_config, TransitionAdvice, TransitionTechnique,
};
pub use bridge::{
    suggest_bridge, suggest_bridge_candidates, suggest_bridge_with_weights, AsTrackAnalysis,
    BridgeCandidate,
};
pub use matrix::{
    build_cost_matrix, build_cost_matrix_with_config, build_cost_matrix_with_slope,
    build_cost_matrix_with_slope_and_config, CostMatrix,
};
pub use profiles::{dE_target, de_target, target_energy};
pub use relationship::{
    evaluate_bpm_relationship, evaluate_energy_relationship, evaluate_harmonic_relationship,
    evaluate_song_relationship, evaluate_style_relationship, evaluate_tuning_relationship,
    parse_key_to_camelot, CatalogGraph,
};
pub use scoring::{
    phi_energy, phi_energy_with_config, phi_key, phi_key_from_distance,
    phi_key_from_distance_with_config, phi_key_from_keys, phi_key_from_keys_with_config,
    phi_key_with_config, phi_tempo, phi_timbre, transition_cost, transition_cost_values,
    transition_cost_values_with_config, transition_cost_with_config, CostModelConfig,
    TransitionCost,
};
pub use solve::{
    evaluate_path_cost, order_tracks, order_tracks_with_config, solve_open_hamiltonian_path,
    OrderedSetlist, TrackPins,
};

/// Error returned when sequencing or transition advising operations fail.
#[derive(Debug, Error)]
pub enum SequencerError {
    /// Invalid configuration or weight parameters.
    #[error("invalid parameter: {0}")]
    InvalidParameter(String),
    /// Solver was unable to find a viable sequence.
    #[error("solver failure: {0}")]
    SolverFailed(String),
}

/// Evaluates transition cost C_ij between two analyzed tracks using the given weights.
///
/// Assumes a flat target energy trajectory (`dE_target = 0.0`).
/// For profile-aware transition costs, call [`transition_cost`] directly with `profile_slope`.
///
/// # Errors
/// Returns `Ok(cost)` evaluating all cost model components.
pub fn evaluate_transition_cost(
    track_a: &TrackAnalysis,
    track_b: &TrackAnalysis,
    weights: &CostWeights,
) -> Result<f32, SequencerError> {
    evaluate_transition_cost_with_config(track_a, track_b, weights, None)
}

/// Evaluates transition cost between two analyzed tracks using weights and an optional [`CostModelConfig`].
///
/// # Errors
/// Returns `Ok(cost)` evaluating all cost model components.
pub fn evaluate_transition_cost_with_config(
    track_a: &TrackAnalysis,
    track_b: &TrackAnalysis,
    weights: &CostWeights,
    config: Option<&CostModelConfig>,
) -> Result<f32, SequencerError> {
    Ok(scoring::transition_cost_with_config(track_a, track_b, weights, 0.0, config).total)
}

/// Provides transition advice, harmonic categorization, and threshold checks between two tracks.
///
/// # Errors
/// Always returns `Ok(advice)` evaluated according to advisor priority rules.
pub fn advise_transition(
    track_a: &TrackAnalysis,
    track_b: &TrackAnalysis,
) -> Result<CoreTransitionAdvice, SequencerError> {
    Ok(advisor::advise(track_a, track_b).to_core_advice())
}

/// Provides transition advice with full authoritative transition cost model evaluation.
///
/// # Errors
/// Always returns `Ok(advice)` evaluated according to advisor priority rules and cost weights.
pub fn advise_transition_with_cost(
    track_a: &TrackAnalysis,
    track_b: &TrackAnalysis,
    weights: Option<CostWeights>,
    profile: Option<EnergyProfile>,
    de_target: Option<f32>,
) -> Result<CoreTransitionAdvice, SequencerError> {
    advise_transition_with_cost_and_config(track_a, track_b, weights, profile, de_target, None)
}

/// Provides transition advice with cost model evaluation and an optional [`CostModelConfig`].
///
/// # Errors
/// Always returns `Ok(advice)` evaluated according to advisor priority rules, weights, and config.
pub fn advise_transition_with_cost_and_config(
    track_a: &TrackAnalysis,
    track_b: &TrackAnalysis,
    weights: Option<CostWeights>,
    profile: Option<EnergyProfile>,
    de_target: Option<f32>,
    config: Option<&CostModelConfig>,
) -> Result<CoreTransitionAdvice, SequencerError> {
    Ok(
        advisor::advise_with_cost_and_config(track_a, track_b, weights, profile, de_target, config)
            .to_core_advice(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_advise_transition() {
        assert!(advise_transition(
            &test_track_analysis(120.0, 8, core_types::CamelotLetter::A, 5),
            &test_track_analysis(120.0, 8, core_types::CamelotLetter::A, 5)
        )
        .is_ok());
    }

    #[test]
    fn test_evaluate_transition_cost() {
        let track_a = test_track_analysis(120.0, 8, core_types::CamelotLetter::A, 5);
        let track_b = test_track_analysis(120.0, 8, core_types::CamelotLetter::A, 5);
        let cost = evaluate_transition_cost(&track_a, &track_b, &CostWeights::default()).unwrap();
        assert_eq!(cost, 0.0);
    }

    fn test_track_analysis(
        bpm: f64,
        camelot_num: u8,
        camelot_letter: core_types::CamelotLetter,
        energy: u8,
    ) -> TrackAnalysis {
        core_types::TrackAnalysis {
            loudness: core_types::LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 6.0,
                true_peak: -1.0,
            },
            rhythm: core_types::RhythmAnalysis {
                grid: core_types::BeatGrid {
                    first_downbeat_ms: 0.0,
                    bpm,
                    beats_ms: vec![],
                    downbeat_flags: vec![],
                    steady: true,
                },
                bpm_alternates: vec![],
            },
            key: core_types::Key {
                pitch_class: 0,
                mode: match camelot_letter {
                    core_types::CamelotLetter::A => core_types::Mode::Minor,
                    core_types::CamelotLetter::B => core_types::Mode::Major,
                },
                camelot: core_types::Camelot::new(camelot_num, camelot_letter).unwrap(),
                tuning_cents: 0.0,
            },
            dynamics: core_types::DynamicsAnalysis {
                frame_rate: 44100.0,
                rms_curve: vec![],
                low_ratio_curve: vec![],
                centroid_curve: vec![],
            },
            energy_score: energy,
            energy_curve: core_types::EnergyCurve { per_bar: vec![] },
            segments: vec![],
            cue_points: vec![],
            waveform: core_types::Waveform3Band {
                points_per_sec: 100,
                low: core_types::WaveformBand {
                    peak: vec![],
                    rms: vec![],
                },
                mid: core_types::WaveformBand {
                    peak: vec![],
                    rms: vec![],
                },
                high: core_types::WaveformBand {
                    peak: vec![],
                    rms: vec![],
                },
            },
        }
    }
}
