//! Novelty curve extraction using STFT with a Hann window and 40-band Mel filterbank.

use core_types::AudioBuffer;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use std::f32::consts::PI;

use crate::AnalysisError;

/// Analysis window size in samples (about 32 ms at 44.1 kHz).
pub const WINDOW_SIZE: usize = 1411;

/// Zero-padded FFT size in samples.
pub const FFT_SIZE: usize = 2048;

/// Hop size in samples between consecutive STFT frames.
pub const HOP_SIZE: usize = 256;

/// Number of triangular filters in the Mel filterbank.
pub const NUM_MEL_BANDS: usize = 40;

/// Lowest frequency for the Mel filterbank in Hz.
pub const MIN_FREQ_HZ: f32 = 20.0;

/// Highest frequency for the Mel filterbank in Hz.
pub const MAX_FREQ_HZ: f32 = 22050.0;

/// Extracted spectral flux novelty curve and its effective frame rate.
#[derive(Debug, Clone, PartialEq)]
pub struct NoveltyCurve {
    /// Frame-by-frame novelty values (half-wave rectified spectral flux sum).
    pub values: Vec<f32>,
    /// Effective frame rate in frames per second (e.g. 44100 / 256 = 172.265625 Hz).
    pub frame_rate: f64,
}

/// Sparse triangular filter for one Mel band.
#[derive(Debug, Clone)]
struct SparseMelFilter {
    start_bin: usize,
    weights: Vec<f32>,
}

/// Precomputed Mel filterbank containing 40 triangular bands.
#[derive(Debug, Clone)]
pub struct MelFilterbank {
    filters: Vec<SparseMelFilter>,
}

impl MelFilterbank {
    /// Creates a 40-band Mel filterbank for the given FFT size and sample rate.
    #[must_use]
    pub fn new(num_bands: usize, fft_size: usize, sample_rate: f32) -> Self {
        let f_min = MIN_FREQ_HZ;
        let f_max = MAX_FREQ_HZ.min(sample_rate / 2.0);

        let hz_to_mel = |f: f32| 1127.0105 * (1.0 + f / 700.0).ln();
        let mel_to_hz = |m: f32| 700.0 * ((m / 1127.0105).exp() - 1.0);

        let mel_min = hz_to_mel(f_min);
        let mel_max = hz_to_mel(f_max);

        let num_points = num_bands + 2;
        let mut bin_indices = Vec::with_capacity(num_points);

        for i in 0..num_points {
            let mel = mel_min + (mel_max - mel_min) * (i as f32 / (num_points - 1) as f32);
            let hz = mel_to_hz(mel);
            let bin = (hz * fft_size as f32 / sample_rate).round() as usize;
            let clamped_bin = bin.min(fft_size / 2);
            bin_indices.push(clamped_bin);
        }

        let mut filters = Vec::with_capacity(num_bands);

        for m in 0..num_bands {
            let left = bin_indices[m];
            let center = bin_indices[m + 1].max(left + 1);
            let right = bin_indices[m + 2].max(center + 1);

            let mut weights = Vec::with_capacity(right - left + 1);

            for k in left..=right {
                let weight = if k < center {
                    (k as f32 - left as f32) / (center as f32 - left as f32)
                } else if k <= right {
                    (right as f32 - k as f32) / (right as f32 - center as f32)
                } else {
                    0.0
                };
                weights.push(weight);
            }

            filters.push(SparseMelFilter {
                start_bin: left,
                weights,
            });
        }

        Self { filters }
    }

    /// Applies the 40 Mel filters to a magnitude spectrum of length `fft_size / 2 + 1`.
    pub fn apply(&self, magnitude_spectrum: &[f32], output_energies: &mut [f32]) {
        for (filter, out) in self.filters.iter().zip(output_energies.iter_mut()) {
            let mut sum = 0.0f32;
            let end_idx = (filter.start_bin + filter.weights.len()).min(magnitude_spectrum.len());
            for (k, &w) in (filter.start_bin..end_idx).zip(&filter.weights) {
                sum += magnitude_spectrum[k] * w;
            }
            *out = sum;
        }
    }
}

/// Generates a Hann window of the given size.
#[must_use]
pub fn hann_window(size: usize) -> Vec<f32> {
    if size <= 1 {
        return vec![1.0; size];
    }
    (0..size)
        .map(|n| 0.5 * (1.0 - (2.0 * PI * n as f32 / (size - 1) as f32).cos()))
        .collect()
}

/// Computes the spectral flux novelty curve from an input audio buffer.
///
/// Steps:
/// 1. STFT using rustfft with a 1411-sample Hann window zero-padded to 2048, hop 256.
/// 2. 40-band Mel filterbank projection.
/// 3. Log compression: ln(1 + 1000 * x).
/// 4. Half-wave rectified first difference per band.
/// 5. Summation across all bands into one novelty curve.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if the audio buffer is too short.
pub fn compute_novelty_curve(buffer: &AudioBuffer) -> Result<NoveltyCurve, AnalysisError> {
    if buffer.samples.len() < WINDOW_SIZE {
        return Err(AnalysisError::InvalidInput(format!(
            "audio buffer length ({}) is shorter than window size ({})",
            buffer.samples.len(),
            WINDOW_SIZE
        )));
    }

    let sample_rate = buffer.sample_rate as f32;
    let frame_rate = buffer.sample_rate as f64 / HOP_SIZE as f64;

    let num_frames = (buffer.samples.len() - WINDOW_SIZE) / HOP_SIZE + 1;
    let window = hann_window(WINDOW_SIZE);
    let mel_bank = MelFilterbank::new(NUM_MEL_BANDS, FFT_SIZE, sample_rate);

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);

    let mut fft_buffer = vec![Complex::new(0.0f32, 0.0f32); FFT_SIZE];
    let num_bins = FFT_SIZE / 2 + 1;
    let mut mag_spectrum = vec![0.0f32; num_bins];
    let mut current_mel = [0.0f32; NUM_MEL_BANDS];
    let mut prev_mel = [0.0f32; NUM_MEL_BANDS];

    let mut novelty_values = Vec::with_capacity(num_frames);

    for frame_idx in 0..num_frames {
        let frame_start = frame_idx * HOP_SIZE;
        let frame_samples = &buffer.samples[frame_start..frame_start + WINDOW_SIZE];

        // Apply Hann window and zero-pad to 2048
        for i in 0..WINDOW_SIZE {
            fft_buffer[i] = Complex::new(frame_samples[i] * window[i], 0.0);
        }
        for c in &mut fft_buffer[WINDOW_SIZE..FFT_SIZE] {
            *c = Complex::new(0.0, 0.0);
        }

        fft.process(&mut fft_buffer);

        // Magnitude spectrum for positive frequencies
        for k in 0..num_bins {
            let re = fft_buffer[k].re;
            let im = fft_buffer[k].im;
            mag_spectrum[k] = (re * re + im * im).sqrt();
        }

        // Apply Mel filterbank
        mel_bank.apply(&mag_spectrum, &mut current_mel);

        // Log compression: ln(1 + 1000 * x)
        for val in &mut current_mel {
            *val = (1.0 + 1000.0 * *val).ln();
        }

        // Spectral flux with half-wave rectification
        let mut flux_sum = 0.0f32;
        if frame_idx > 0 {
            for b in 0..NUM_MEL_BANDS {
                let diff = current_mel[b] - prev_mel[b];
                if diff > 0.0 {
                    flux_sum += diff;
                }
            }
        }

        prev_mel.copy_from_slice(&current_mel);
        novelty_values.push(flux_sum);
    }

    Ok(NoveltyCurve {
        values: novelty_values,
        frame_rate,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hann_window() {
        let win = hann_window(1411);
        assert_eq!(win.len(), 1411);
        assert_eq!(win[0], 0.0);
        assert_eq!(win[1410], 0.0);
        assert!((win[705] - 1.0).abs() < 1e-4);
    }

    #[test]
    fn test_mel_filterbank_creation() {
        let bank = MelFilterbank::new(40, 2048, 44100.0);
        assert_eq!(bank.filters.len(), 40);
        for f in &bank.filters {
            assert!(!f.weights.is_empty());
        }
    }

    #[test]
    fn test_novelty_curve_silence() {
        let silence = AudioBuffer {
            sample_rate: 44100,
            samples: vec![0.0f32; 44100],
        };
        let curve = compute_novelty_curve(&silence).unwrap();
        assert!(!curve.values.is_empty());
        for &val in &curve.values {
            assert_eq!(val, 0.0);
        }
        assert_eq!(curve.frame_rate, 44100.0 / 256.0);
    }
}
