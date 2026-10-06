//! Tonal analysis: chroma, key, and tuning.

pub mod chroma;
pub mod profiles;

pub use chroma::{compute_chromagram, estimate_tuning, ChromagramResult, SpectralPeak};
pub use profiles::{correlate_chroma, pearson_correlation, KeyCandidate, KeyProfile};

use crate::AnalysisError;
use core_types::camelot::Camelot;
use core_types::{AudioBuffer, Key};

/// Detailed musical key analysis results including confidence and chromagram.
#[derive(Debug, Clone, PartialEq)]
pub struct KeyAnalysis {
    /// Estimated musical key including pitch class, mode, Camelot code, and tuning offset.
    pub key: Key,
    /// Key estimation confidence score in [0.0, 1.0].
    pub confidence: f32,
    /// 12-bin mean chromagram normalized to sum to 1.0.
    pub chroma: [f32; 12],
    /// Sorted list of candidate key matches and their correlation coefficients.
    pub candidates: Vec<KeyCandidate>,
}

/// Analyzes an audio buffer to estimate musical key and tuning deviation using the default
/// Krumhansl-Kessler profile.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if the buffer is empty or sample rate is 0.
/// Returns `AnalysisError::Failed` if the buffer contains only silence or key estimation fails.
pub fn analyze_key(buffer: &AudioBuffer) -> Result<Key, AnalysisError> {
    let result = analyze_key_detailed(buffer, KeyProfile::KrumhanslKessler)?;
    Ok(result.key)
}

/// Analyzes an audio buffer to estimate key with confidence and chromagram, using the specified key profile.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if the buffer is empty or sample rate is 0.
/// Returns `AnalysisError::Failed` if the buffer contains only silence or key estimation fails.
pub fn analyze_key_detailed(
    buffer: &AudioBuffer,
    profile: KeyProfile,
) -> Result<KeyAnalysis, AnalysisError> {
    let chroma_result = compute_chromagram(buffer)?;
    let candidates = correlate_chroma(&chroma_result.mean_chroma, profile);

    if candidates.is_empty() {
        return Err(AnalysisError::Failed(
            "failed to compute candidate key correlations".to_string(),
        ));
    }

    let top = &candidates[0];
    let camelot = Camelot::from_key(top.pitch_class, top.mode)
        .map_err(|e| AnalysisError::Failed(e.to_string()))?;

    let confidence = profiles::compute_confidence(&candidates);

    let key = Key {
        pitch_class: top.pitch_class,
        mode: top.mode,
        camelot,
        tuning_cents: chroma_result.tuning_cents,
    };

    Ok(KeyAnalysis {
        key,
        confidence,
        chroma: chroma_result.mean_chroma,
        candidates,
    })
}

/// Analyzes an audio buffer returning the key and estimation confidence.
///
/// # Errors
/// Returns `AnalysisError` if key analysis fails.
pub fn analyze_key_with_confidence(buffer: &AudioBuffer) -> Result<(Key, f32), AnalysisError> {
    let analysis = analyze_key_detailed(buffer, KeyProfile::KrumhanslKessler)?;
    Ok((analysis.key, analysis.confidence))
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::Mode;
    use std::f32::consts::PI;

    /// Synthesizes an additive-harmonic triad.
    ///
    /// Root pitch class: `root_pc` (0 = C, 1 = C#, ..., 11 = B).
    /// Base octave MIDI note: `root_midi` (e.g. 60 for C4).
    fn synthesize_additive_triad(
        root_midi: u8,
        mode: Mode,
        duration_secs: f32,
        sample_rate: u32,
        tuning_ref_hz: f32,
    ) -> AudioBuffer {
        let num_samples = (duration_secs * sample_rate as f32) as usize;
        let mut samples = vec![0.0f32; num_samples];

        let third_offset = match mode {
            Mode::Major => 4,
            Mode::Minor => 3,
        };
        let fifth_offset = 7;

        let notes = [
            root_midi as f32,
            (root_midi + third_offset) as f32,
            (root_midi + fifth_offset) as f32,
        ];

        // Harmonic series weights: 1st, 2nd, 3rd, 4th, 5th, 6th partials
        let harmonic_weights = [1.0f32, 0.5, 0.33, 0.25, 0.2, 0.15];

        for &note in &notes {
            // Note frequency with customizable tuning reference (default 440.0)
            let f0 = tuning_ref_hz * 2.0f32.powf((note - 69.0) / 12.0);

            for (h_idx, &weight) in harmonic_weights.iter().enumerate() {
                let h_num = (h_idx + 1) as f32;
                let f_h = f0 * h_num;
                if f_h > sample_rate as f32 * 0.49 {
                    continue;
                }

                for (n, sample) in samples.iter_mut().enumerate() {
                    let t = n as f32 / sample_rate as f32;
                    *sample += weight * (2.0 * PI * f_h * t).sin();
                }
            }
        }

        // Normalize amplitude to [-0.9, 0.9]
        let max_val = samples.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
        if max_val > 1e-6 {
            for s in &mut samples {
                *s = (*s / max_val) * 0.9;
            }
        }

        AudioBuffer {
            sample_rate,
            samples,
        }
    }

    #[test]
    fn test_silence_returns_error() {
        let buffer = AudioBuffer {
            sample_rate: 44100,
            samples: vec![0.0; 44100],
        };
        let result = analyze_key(&buffer);
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_buffer_returns_invalid_input() {
        let buffer = AudioBuffer {
            sample_rate: 44100,
            samples: Vec::new(),
        };
        let result = analyze_key(&buffer);
        assert!(matches!(result, Err(AnalysisError::InvalidInput(_))));
    }

    #[test]
    fn test_all_24_additive_triads() {
        let sample_rate = 44100;
        let duration = 0.8; // 800 ms per triad

        let mut correct_count = 0;
        let mut acceptable_neighbor_count = 0;

        for mode in [Mode::Major, Mode::Minor] {
            for tonic in 0..12u8 {
                let root_midi = 60 + tonic; // Octave 4/5
                let buffer =
                    synthesize_additive_triad(root_midi, mode, duration, sample_rate, 440.0);

                let analysis = analyze_key_detailed(&buffer, KeyProfile::KrumhanslKessler)
                    .unwrap_or_else(|e| {
                        panic!("Key analysis failed for tonic {} {:?}: {}", tonic, mode, e)
                    });

                let detected = analysis.key;
                let expected_camelot = Camelot::from_key(tonic, mode).unwrap();

                if tonic == 0 && mode == Mode::Major {
                    println!("C Major Chroma: {:?}", analysis.chroma);
                    for (i, c) in analysis.candidates.iter().take(5).enumerate() {
                        println!(
                            "  Top {}: pc={}, mode={:?}, corr={}",
                            i, c.pitch_class, c.mode, c.correlation
                        );
                    }
                }

                let is_exact = detected.pitch_class == tonic && detected.mode == mode;
                if is_exact {
                    correct_count += 1;
                    assert!(analysis.confidence > 0.0);
                } else {
                    // Check if neighbor is relative or fifth neighbor
                    let (dist, mode_flip) = detected.camelot.distance(&expected_camelot);
                    let is_relative = dist == 0 && mode_flip;
                    let is_fifth = dist == 1 && !mode_flip;

                    if is_relative || is_fifth {
                        acceptable_neighbor_count += 1;
                        println!(
                            "Acceptable neighbor match for {:?} tonic {}: got {:?} tonic {} (dist={}, mode_flip={})",
                            mode, tonic, detected.mode, detected.pitch_class, dist, mode_flip
                        );
                    } else {
                        panic!(
                            "Unacceptable misclassification for {:?} tonic {}: got {:?} tonic {} (dist={}, mode_flip={})",
                            mode, tonic, detected.mode, detected.pitch_class, dist, mode_flip
                        );
                    }
                }
            }
        }

        println!(
            "Total triads: 24 | Exact matches: {} | Acceptable neighbors: {}",
            correct_count, acceptable_neighbor_count
        );

        // Requirement: At least 22 of 24 correct. Wrong ones must be relative or fifth neighbors.
        assert!(
            correct_count >= 22,
            "Expected at least 22 exact matches, got {}",
            correct_count
        );
        assert_eq!(
            correct_count + acceptable_neighbor_count,
            24,
            "All non-exact matches must be relative or fifth neighbors"
        );
    }

    #[test]
    fn test_432_hz_tuning_and_key() {
        let sample_rate = 44100;
        let duration = 1.0;

        // Synthesize an A major triad (MIDI 69 = A4) tuned to 432 Hz
        let buffer = synthesize_additive_triad(69, Mode::Major, duration, sample_rate, 432.0);

        let analysis = analyze_key_detailed(&buffer, KeyProfile::KrumhanslKessler)
            .expect("Analysis should succeed on 432 Hz signal");

        let detected = analysis.key;

        // Expected tuning deviation: 1200 * log2(432 / 440) = -31.7666 cents
        let expected_cents = -31.7666f32;
        let diff = (detected.tuning_cents - expected_cents).abs();

        println!(
            "Detected tuning: {:.2} cents (diff: {:.2} cents), detected key: {:?} pitch_class {}",
            detected.tuning_cents, diff, detected.mode, detected.pitch_class
        );

        // Requirement: reports about -31.8 cents within 10 cents
        assert!(
            diff <= 10.0,
            "Tuning deviation {:.2} cents was not within 10 cents of expected {:.2} cents",
            detected.tuning_cents,
            expected_cents
        );

        // Requirement: still resolves the right key (A major, pitch class 9)
        assert_eq!(detected.pitch_class, 9, "Expected pitch class 9 (A)");
        assert_eq!(detected.mode, Mode::Major, "Expected Major mode");
    }

    #[test]
    fn test_alternative_key_profiles() {
        let sample_rate = 44100;
        let buffer = synthesize_additive_triad(60, Mode::Major, 0.8, sample_rate, 440.0);

        for profile in [
            KeyProfile::KrumhanslKessler,
            KeyProfile::Temperley,
            KeyProfile::Edma,
            KeyProfile::Shaath,
        ] {
            let res =
                analyze_key_detailed(&buffer, profile).expect("Profile analysis should succeed");
            assert_eq!(res.key.pitch_class, 0, "Expected C major");
            assert_eq!(res.key.mode, Mode::Major, "Expected C major");
            assert!(res.confidence > 0.0, "Confidence score should be positive");
        }
    }

    #[test]
    fn test_key_confidence_score_exposure() {
        let sample_rate = 44100;
        // Strong tonal triad has high confidence
        let clear_triad = synthesize_additive_triad(60, Mode::Major, 1.0, sample_rate, 440.0);
        let (key, conf) = analyze_key_with_confidence(&clear_triad).unwrap();
        assert_eq!(key.pitch_class, 0);
        assert!(conf > 0.3, "Clear triad should have confident correlation");

        // Noisy/weak signal has lower confidence
        let mut noisy_samples = vec![0.0f32; 44100];
        let mut rng = 123456789u32;
        for s in &mut noisy_samples {
            rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
            *s = ((rng as f32 / u32::MAX as f32) - 0.5) * 0.05;
        }
        let noisy_buffer = AudioBuffer {
            sample_rate: 44100,
            samples: noisy_samples,
        };
        let noisy_res = analyze_key_with_confidence(&noisy_buffer);
        if let Ok((_, noisy_conf)) = noisy_res {
            assert!(
                noisy_conf < conf,
                "Noisy buffer confidence ({}) should be lower than clear triad ({})",
                noisy_conf,
                conf
            );
        }
    }
}
