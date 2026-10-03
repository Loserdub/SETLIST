//! Audio analysis pipeline orchestrator and scanner Analyzer implementation.
//!
//! Orchestrates feature extraction across:
//! 1. Stage 1 (independent steps in parallel via rayon):
//!    - Rhythm (novelty curve, global BPM, DP beat tracking, downbeat phase)
//!    - Key and tuning estimation (chromagram correlation against Krumhansl-Kessler)
//!    - Dynamics (frame-level RMS, low-frequency ratio, spectral centroid)
//!    - Waveform (4th-order Butterworth low/mid/high downsampled to 150 points/sec)
//! 2. Stage 2 (dependent on rhythm and dynamics in parallel via rayon):
//!    - Bar-by-bar energy curve
//!    - Overall 1-to-10 energy score incorporating integrated LUFS
//!    - Structural segmentation snapped to downbeats
//! 3. Stage 3:
//!    - Cue placement for registers 0 to 7 (A through H)
//! 4. Assembly into complete [`TrackAnalysis`].
//!
//! Also implements the [`library_db::scan::Analyzer`] trait for background folder scanning.

use std::path::Path;

use core_types::{DecodedAudio, RhythmConfig, TrackAnalysis};

use crate::dynamics::{self, EnergyModel};
use crate::rhythm;
use crate::structure;
use crate::tonal;
use crate::waveform;
use crate::AnalysisError;

/// Analyzes decoded audio with default configuration options, executing
/// independent DSP feature extraction stages in parallel using rayon.
///
/// # Errors
/// Returns [`AnalysisError`] if decoding/analysis inputs are invalid or any sub-engine fails.
pub fn analyze_decoded(decoded: &DecodedAudio) -> Result<TrackAnalysis, AnalysisError> {
    analyze_decoded_with_config(decoded, &RhythmConfig::default())
}

/// Analyzes decoded audio with an explicit [`RhythmConfig`].
///
/// # Errors
/// Returns [`AnalysisError`] if the audio buffer is empty, sample rate is zero, or any sub-engine fails.
pub fn analyze_decoded_with_config(
    decoded: &DecodedAudio,
    rhythm_config: &RhythmConfig,
) -> Result<TrackAnalysis, AnalysisError> {
    if decoded.buffer.samples.is_empty() {
        return Err(AnalysisError::InvalidInput(
            "audio buffer cannot be empty".to_string(),
        ));
    }
    if decoded.buffer.sample_rate == 0 {
        return Err(AnalysisError::InvalidInput(
            "sample rate must be positive".to_string(),
        ));
    }

    // Stage 1: Run independent initial steps in parallel using Rayon:
    // - Rhythm analysis (novelty curve, tempo, beat tracking, downbeats)
    // - Musical key detection (chromagram, tuning, Camelot key)
    // - Dynamics analysis (RMS, low-band ratio, spectral centroid curves)
    // - 3-band waveform generation (Butterworth filtering, downsampling)
    let ((rhythm_res, key_res), (dynamics_res, waveform_res)) = rayon::join(
        || {
            rayon::join(
                || rhythm::analyze_rhythm(&decoded.buffer, rhythm_config),
                || tonal::analyze_key(&decoded.buffer),
            )
        },
        || {
            rayon::join(
                || dynamics::analyze_dynamics(&decoded.buffer),
                || waveform::compute_waveform(&decoded.buffer),
            )
        },
    );

    let rhythm = rhythm_res?;
    let key = key_res?;
    let dynamics = dynamics_res?;
    let waveform = waveform_res?;

    // Stage 2: Steps requiring rhythm and dynamics (executed in parallel where independent):
    // - Energy curve (per-bar RMS using downbeat boundaries)
    // - Energy score (1-to-10 scale using integrated LUFS and mean curves)
    // - Structural segmentation (macro phrase classification snapped to downbeats)
    let ((energy_curve_res, energy_score_res), segments_res) = rayon::join(
        || {
            rayon::join(
                || dynamics::energy_curve(&dynamics, &rhythm.grid),
                || {
                    let model = EnergyModel::default();
                    dynamics::energy_score_with_lufs(
                        &dynamics,
                        decoded.loudness.integrated_lufs,
                        &model,
                    )
                },
            )
        },
        || structure::segment(&rhythm, &dynamics),
    );

    let energy_curve = energy_curve_res?;
    let energy_score = energy_score_res?;
    let segments = segments_res?;

    // Stage 3: Cue point placement snaps to detected segments and beat grid downbeats
    let cue_points = structure::place_cues(&segments, &rhythm.grid)?;

    // Stage 4: Assemble complete TrackAnalysis
    Ok(TrackAnalysis {
        loudness: decoded.loudness.clone(),
        rhythm,
        key,
        dynamics,
        energy_score,
        energy_curve,
        segments,
        cue_points,
        waveform,
    })
}

/// Analysis pipeline implementation of the [`library_db::scan::Analyzer`] trait.
///
/// Decodes the audio file from disk via `audio-io` and runs the full analysis pipeline.
#[derive(Debug, Clone, Default)]
pub struct AnalysisPipeline {
    /// Rhythm analysis configuration parameters.
    pub rhythm_config: RhythmConfig,
}

impl AnalysisPipeline {
    /// Creates a new analysis pipeline with default settings.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Configures the rhythm estimation parameters.
    #[must_use]
    pub fn with_rhythm_config(mut self, config: RhythmConfig) -> Self {
        self.rhythm_config = config;
        self
    }

    /// Analyzes an already decoded audio track.
    ///
    /// # Errors
    /// Returns [`AnalysisError`] if analysis fails.
    pub fn analyze_decoded(&self, decoded: &DecodedAudio) -> Result<TrackAnalysis, AnalysisError> {
        analyze_decoded_with_config(decoded, &self.rhythm_config)
    }
}

/// Type alias for [`AnalysisPipeline`].
pub type AudioPipeline = AnalysisPipeline;

impl library_db::scan::Analyzer for AnalysisPipeline {
    fn analyze(&self, path: &Path) -> Result<TrackAnalysis, String> {
        let decoded = audio_io::decode_file(path)
            .map_err(|e| format!("Failed to decode audio file {}: {e}", path.display()))?;
        self.analyze_decoded(&decoded)
            .map_err(|e| format!("Failed to analyze audio file {}: {e}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{AudioBuffer, LoudnessInfo, TrackTags};
    use library_db::scan::Analyzer;
    use std::f32::consts::PI;

    /// Generates a synthetic audio buffer containing periodic clicks and harmonic tones.
    fn generate_synthetic_audio(duration_secs: f64, bpm: f64) -> AudioBuffer {
        let sample_rate = 44100;
        let total_samples = (duration_secs * sample_rate as f64).round() as usize;
        let mut samples = vec![0.0f32; total_samples];

        let beat_period_samples = (60.0 / bpm * sample_rate as f64).round() as usize;

        for (i, sample) in samples.iter_mut().enumerate() {
            let t = i as f32 / sample_rate as f32;

            // Musical tone (A4 = 440 Hz + C#5 = 554 Hz)
            let tone = 0.2 * (2.0 * PI * 440.0 * t).sin() + 0.15 * (2.0 * PI * 554.37 * t).sin();

            // Periodic percussive click every beat
            let click = if (i % beat_period_samples) < 200 {
                let ct = (i % beat_period_samples) as f32 / 200.0;
                0.5 * (1.0 - ct) * (2.0 * PI * 120.0 * t).sin()
            } else {
                0.0
            };

            *sample = (tone + click).clamp(-1.0, 1.0);
        }

        AudioBuffer {
            sample_rate,
            samples,
        }
    }

    #[test]
    fn test_analyze_decoded_synthetic_audio() {
        let buffer = generate_synthetic_audio(8.0, 120.0);
        let decoded = DecodedAudio {
            buffer,
            loudness: LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 5.0,
                true_peak: -0.5,
            },
            tags: TrackTags {
                title: Some("Synthetic Test Track".to_string()),
                artist: Some("Test Producer".to_string()),
                album: Some("Test Album".to_string()),
            },
            duration_ms: 8000.0,
            source_sample_rate: 44100,
        };

        let analysis = analyze_decoded(&decoded).expect("pipeline analysis succeeds");

        // Verify loudness carried through
        assert_eq!(analysis.loudness, decoded.loudness);

        // Verify rhythm
        assert!(analysis.rhythm.grid.bpm > 0.0);
        assert!(!analysis.rhythm.grid.beats_ms.is_empty());
        assert_eq!(
            analysis.rhythm.grid.beats_ms.len(),
            analysis.rhythm.grid.downbeat_flags.len()
        );

        // Verify key (A major chord maps to Camelot B)
        assert_eq!(analysis.key.camelot.letter, core_types::CamelotLetter::B);

        // Verify dynamics
        assert!(!analysis.dynamics.rms_curve.is_empty());
        assert!(!analysis.dynamics.low_ratio_curve.is_empty());
        assert!(!analysis.dynamics.centroid_curve.is_empty());
        assert!(analysis.energy_score >= 1 && analysis.energy_score <= 10);
        assert!(!analysis.energy_curve.per_bar.is_empty());

        // Verify structure
        assert!(!analysis.segments.is_empty());
        assert!(!analysis.cue_points.is_empty());
        // First cue is Cue A (index 0)
        assert_eq!(analysis.cue_points[0].index, 0);

        // Verify waveform
        assert_eq!(analysis.waveform.points_per_sec, 150);
        assert!(!analysis.waveform.low.peak.is_empty());
        assert!(!analysis.waveform.mid.peak.is_empty());
        assert!(!analysis.waveform.high.peak.is_empty());
    }

    #[test]
    fn test_pipeline_empty_buffer_returns_error() {
        let decoded = DecodedAudio {
            buffer: AudioBuffer {
                sample_rate: 44100,
                samples: vec![],
            },
            loudness: LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 5.0,
                true_peak: -1.0,
            },
            tags: TrackTags::default(),
            duration_ms: 0.0,
            source_sample_rate: 44100,
        };

        let err = analyze_decoded(&decoded);
        assert!(err.is_err());
    }

    #[test]
    fn test_analyzer_trait_implementation_on_wav_file() {
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let wav_path = temp_dir.path().join("test_synth.wav");

        // Write a 4-second WAV file using hound
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&wav_path, spec).expect("create wav");
        let buffer = generate_synthetic_audio(4.0, 125.0);
        for &sample in &buffer.samples {
            let int_sample = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            writer.write_sample(int_sample).expect("write sample");
        }
        writer.finalize().expect("finalize wav");

        let pipeline = AnalysisPipeline::new();
        let analysis = pipeline.analyze(&wav_path).expect("analyze wav file");

        assert!(analysis.rhythm.grid.bpm > 0.0);
        assert!(analysis.energy_score >= 1 && analysis.energy_score <= 10);
        assert!(!analysis.waveform.low.peak.is_empty());
    }
}
