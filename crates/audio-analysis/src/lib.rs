//! Audio analysis algorithms and feature extraction.

pub mod dynamics;
pub mod pipeline;
pub mod rhythm;
pub mod structure;
pub mod tonal;
pub mod waveform;

pub use pipeline::{analyze_decoded, analyze_decoded_with_config, AnalysisPipeline, AudioPipeline};

use thiserror::Error;

/// Error returned when audio analysis operations fail or are not implemented.
#[derive(Debug, Error)]
pub enum AnalysisError {
    /// Functionality is not yet implemented.
    #[error("not implemented")]
    NotImplemented,
    /// Invalid input provided to analysis function.
    #[error("invalid input: {0}")]
    InvalidInput(String),
    /// Analysis processing failure.
    #[error("analysis failed: {0}")]
    Failed(String),
}
