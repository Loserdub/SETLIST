//! Rhythm analysis: onset, tempo, beats, and downbeats.

use crate::AnalysisError;
use core_types::{AudioBuffer, RhythmAnalysis, RhythmConfig};

/// Analyzes audio buffer to detect beats, downbeats, and tempo grid.
///
/// # Errors
/// Returns `AnalysisError::NotImplemented`.
pub fn analyze_rhythm(
    _buffer: &AudioBuffer,
    _config: &RhythmConfig,
) -> Result<RhythmAnalysis, AnalysisError> {
    Err(AnalysisError::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_rhythm_stub() {
        let buffer = AudioBuffer {
            sample_rate: 44100,
            samples: vec![0.0; 44100],
        };
        let config = RhythmConfig::default();
        let result = analyze_rhythm(&buffer, &config);
        assert!(matches!(result, Err(AnalysisError::NotImplemented)));
    }
}
