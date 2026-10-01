//! Dynamics analysis: spectral features and energy.

use crate::AnalysisError;
use core_types::{AudioBuffer, BeatGrid, DynamicsAnalysis, EnergyCurve};

/// Analyzes dynamic and spectral features of an audio buffer over time.
///
/// # Errors
/// Returns `AnalysisError::NotImplemented`.
pub fn analyze_dynamics(_buffer: &AudioBuffer) -> Result<DynamicsAnalysis, AnalysisError> {
    Err(AnalysisError::NotImplemented)
}

/// Calculates the overall track energy score on an integer scale from 1 to 10.
///
/// # Errors
/// Returns `AnalysisError::NotImplemented`.
pub fn energy_score(_dynamics: &DynamicsAnalysis, _grid: &BeatGrid) -> Result<u8, AnalysisError> {
    Err(AnalysisError::NotImplemented)
}

/// Calculates the bar-by-bar normalized energy curve.
///
/// # Errors
/// Returns `AnalysisError::NotImplemented`.
pub fn energy_curve(
    _dynamics: &DynamicsAnalysis,
    _grid: &BeatGrid,
) -> Result<EnergyCurve, AnalysisError> {
    Err(AnalysisError::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dynamics_stubs() {
        let buffer = AudioBuffer {
            sample_rate: 44100,
            samples: vec![0.0; 44100],
        };
        assert!(matches!(
            analyze_dynamics(&buffer),
            Err(AnalysisError::NotImplemented)
        ));

        let dynamics = DynamicsAnalysis {
            frame_rate: 10.0,
            rms_curve: vec![],
            low_ratio_curve: vec![],
            centroid_curve: vec![],
        };
        let grid = BeatGrid {
            first_downbeat_ms: 0.0,
            bpm: 120.0,
            beats_ms: vec![],
            downbeat_flags: vec![],
            steady: true,
        };

        assert!(matches!(
            energy_score(&dynamics, &grid),
            Err(AnalysisError::NotImplemented)
        ));
        assert!(matches!(
            energy_curve(&dynamics, &grid),
            Err(AnalysisError::NotImplemented)
        ));
    }
}
