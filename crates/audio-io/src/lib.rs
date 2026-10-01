//! Audio decoding, resampling, loudness calculation, and metadata extraction.

use core_types::DecodedAudio;
use std::path::Path;
use thiserror::Error;

/// Error returned when audio decoding or I/O operations fail.
#[derive(Debug, Error)]
pub enum AudioIoError {
    /// Functionality is not yet implemented.
    #[error("not implemented")]
    NotImplemented,
    /// Audio file was not found.
    #[error("file not found: {0}")]
    FileNotFound(String),
    /// Audio format is unsupported.
    #[error("unsupported audio format: {0}")]
    UnsupportedFormat(String),
    /// Audio decoding error.
    #[error("decode error: {0}")]
    DecodeFailed(String),
}

/// Decodes an audio file from `path`, downmixes to mono, resamples to 44100 Hz,
/// computes loudness info, and extracts tags.
///
/// # Errors
/// Returns `AudioIoError::NotImplemented`.
pub fn decode_file<P: AsRef<Path>>(_path: P) -> Result<DecodedAudio, AudioIoError> {
    Err(AudioIoError::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_file_stub() {
        let result = decode_file("test.mp3");
        assert!(matches!(result, Err(AudioIoError::NotImplemented)));
    }
}
