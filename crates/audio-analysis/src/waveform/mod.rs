//! Waveform analysis: 3-band waveform.

use crate::AnalysisError;
use core_types::{AudioBuffer, Waveform3Band};

/// Computes 3-band overview waveform (low, mid, high frequencies) with peak and RMS.
///
/// # Errors
/// Returns `AnalysisError::NotImplemented`.
pub fn compute_waveform(_buffer: &AudioBuffer) -> Result<Waveform3Band, AnalysisError> {
    Err(AnalysisError::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_waveform_stub() {
        let buffer = AudioBuffer {
            sample_rate: 44100,
            samples: vec![0.0; 44100],
        };
        assert!(matches!(
            compute_waveform(&buffer),
            Err(AnalysisError::NotImplemented)
        ));
    }
}
