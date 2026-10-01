//! Cost model, solvers, and transition advisor for setlist sequencing.

pub mod profiles;
pub mod scoring;

use core_types::{
    CostWeights, EnergyProfile, SetlistEntry, Track, TrackAnalysis, TransitionAdvice,
};
use thiserror::Error;

pub use profiles::{dE_target, de_target, target_energy};
pub use scoring::{
    phi_energy, phi_key, phi_key_from_distance, phi_key_from_keys, phi_tempo, phi_timbre,
    transition_cost, transition_cost_values, TransitionCost,
};

/// Error returned when sequencing or transition advising operations fail.
#[derive(Debug, Error)]
pub enum SequencerError {
    /// Functionality is not yet implemented.
    #[error("not implemented")]
    NotImplemented,
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
    Ok(scoring::transition_cost(track_a, track_b, weights, 0.0).total)
}

/// Provides transition advice, harmonic categorization, and threshold checks between two tracks.
///
/// # Errors
/// Returns `SequencerError::NotImplemented`.
pub fn advise_transition(
    _track_a: &TrackAnalysis,
    _track_b: &TrackAnalysis,
) -> Result<TransitionAdvice, SequencerError> {
    Err(SequencerError::NotImplemented)
}

/// Orders a set of candidate tracks to match the requested energy profile and minimize transition cost.
///
/// # Errors
/// Returns `SequencerError::NotImplemented`.
pub fn sequence_tracks(
    _tracks: &[Track],
    _profile: EnergyProfile,
    _weights: &CostWeights,
) -> Result<Vec<SetlistEntry>, SequencerError> {
    Err(SequencerError::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sequencer_stubs() {
        assert!(matches!(
            sequence_tracks(&[], EnergyProfile::LinearRamp, &CostWeights::default()),
            Err(SequencerError::NotImplemented)
        ));
        assert!(matches!(
            advise_transition(
                &test_track_analysis(120.0, 8, core_types::CamelotLetter::A, 5),
                &test_track_analysis(120.0, 8, core_types::CamelotLetter::A, 5)
            ),
            Err(SequencerError::NotImplemented)
        ));
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
