//! Cost model, solvers, and transition advisor for setlist sequencing.

use core_types::{
    CostWeights, EnergyProfile, SetlistEntry, Track, TrackAnalysis, TransitionAdvice,
};
use thiserror::Error;

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
/// # Errors
/// Returns `SequencerError::NotImplemented`.
pub fn evaluate_transition_cost(
    _track_a: &TrackAnalysis,
    _track_b: &TrackAnalysis,
    _weights: &CostWeights,
) -> Result<f32, SequencerError> {
    Err(SequencerError::NotImplemented)
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
    }
}
