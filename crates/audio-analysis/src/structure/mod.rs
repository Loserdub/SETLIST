//! Structure analysis: segments and cue placement.

use crate::AnalysisError;
use core_types::{AudioBuffer, BeatGrid, CuePoint, EnergyCurve, Segment};

/// Segments audio into musical sections snapped to bar boundaries.
///
/// # Errors
/// Returns `AnalysisError::NotImplemented`.
pub fn segment(
    _buffer: &AudioBuffer,
    _grid: &BeatGrid,
    _energy: &EnergyCurve,
) -> Result<Vec<Segment>, AnalysisError> {
    Err(AnalysisError::NotImplemented)
}

/// Computes recommended hot cues and memory cue placement (registers 0-7) per AGENTS.md 6.6.
///
/// # Errors
/// Returns `AnalysisError::NotImplemented`.
pub fn place_cues(_segments: &[Segment], _grid: &BeatGrid) -> Result<Vec<CuePoint>, AnalysisError> {
    Err(AnalysisError::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_structure_stubs() {
        let buffer = AudioBuffer {
            sample_rate: 44100,
            samples: vec![0.0; 44100],
        };
        let grid = BeatGrid {
            first_downbeat_ms: 0.0,
            bpm: 120.0,
            beats_ms: vec![],
            downbeat_flags: vec![],
            steady: true,
        };
        let energy = EnergyCurve { per_bar: vec![] };

        assert!(matches!(
            segment(&buffer, &grid, &energy),
            Err(AnalysisError::NotImplemented)
        ));
        assert!(matches!(
            place_cues(&[], &grid),
            Err(AnalysisError::NotImplemented)
        ));
    }
}
