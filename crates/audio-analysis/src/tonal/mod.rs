//! Tonal analysis: chroma, key, and tuning.

use crate::AnalysisError;
use core_types::{AudioBuffer, Key};

/// Analyzes audio buffer to estimate musical key and tuning deviation.
///
/// # Errors
/// Returns `AnalysisError::NotImplemented`.
pub fn analyze_key(_buffer: &AudioBuffer) -> Result<Key, AnalysisError> {
    Err(AnalysisError::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_key_stub() {
        let buffer = AudioBuffer {
            sample_rate: 44100,
            samples: vec![0.0; 44100],
        };
        let result = analyze_key(&buffer);
        assert!(matches!(result, Err(AnalysisError::NotImplemented)));
    }
}
