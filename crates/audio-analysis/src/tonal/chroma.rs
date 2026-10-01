//! Chromagram computation from STFT, harmonic-peak picking, and tuning estimation.

use std::f32::consts::PI;

use core_types::AudioBuffer;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

use crate::AnalysisError;

/// Analysis window size in samples (~92.9 ms at 44.1 kHz).
pub const WINDOW_SIZE: usize = 4096;

/// Zero-padded FFT size in samples (~5.38 Hz bin resolution at 44.1 kHz).
pub const FFT_SIZE: usize = 8192;

/// Hop size in samples between consecutive STFT frames (~46.4 ms at 44.1 kHz).
pub const HOP_SIZE: usize = 2048;

/// Minimum analysis frequency in Hz (approx. B1 = 61.74 Hz).
pub const MIN_FREQ_HZ: f32 = 60.0;

/// Maximum analysis frequency in Hz (approx. D#8 = 4978 Hz).
pub const MAX_FREQ_HZ: f32 = 5000.0;

/// Detected spectral peak with interpolated frequency and magnitude.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SpectralPeak {
    /// Refined frequency in Hz.
    pub freq: f32,
    /// Refined linear magnitude.
    pub mag: f32,
}

/// Chromagram extraction result.
#[derive(Debug, Clone, PartialEq)]
pub struct ChromagramResult {
    /// 12-bin mean chromagram normalized to sum to 1.0.
    pub mean_chroma: [f32; 12],
    /// Frame-by-frame 12-bin chromagram vectors.
    pub frames: Vec<[f32; 12]>,
    /// Estimated tuning offset in cents relative to 440 Hz standard (-50.0 to +50.0).
    pub tuning_cents: f32,
}

/// Generates a Hann window of specified length.
#[must_use]
pub fn hann_window(length: usize) -> Vec<f32> {
    if length <= 1 {
        return vec![1.0; length];
    }
    (0..length)
        .map(|n| 0.5 * (1.0 - (2.0 * PI * n as f32 / (length - 1) as f32).cos()))
        .collect()
}

/// Estimates the tuning deviation in cents relative to A4 = 440 Hz from detected spectral peaks.
///
/// Uses a circular histogram with mode detection and parabolic refinement over [-50, +50] cents.
#[must_use]
pub fn estimate_tuning(peaks_by_frame: &[Vec<SpectralPeak>]) -> f32 {
    const NUM_BINS: usize = 100;
    let mut hist = [0.0f32; NUM_BINS];
    let mut total_weight = 0.0f32;

    for frame in peaks_by_frame {
        for peak in frame {
            if peak.freq <= 0.0 {
                continue;
            }
            // Continuous MIDI note number
            let note = 69.0 + 12.0 * (peak.freq / 440.0).log2();
            let deviation_cents = 100.0 * (note - note.round()); // in [-50, 50]

            // Map [-50, 50) to [0, 100)
            let u = (deviation_cents + 50.0).rem_euclid(100.0);
            let b0 = (u.floor() as usize) % NUM_BINS;
            let b1 = (b0 + 1) % NUM_BINS;
            let frac = u - u.floor();

            // Weight by peak magnitude
            let w = peak.mag;
            hist[b0] += w * (1.0 - frac);
            hist[b1] += w * frac;
            total_weight += w;
        }
    }

    if total_weight <= 1e-12 {
        return 0.0;
    }

    // Circular Gaussian smoothing (5 taps: [0.06, 0.24, 0.40, 0.24, 0.06])
    let kernel = [0.06f32, 0.24, 0.40, 0.24, 0.06];
    let mut smoothed = [0.0f32; NUM_BINS];
    for (i, item) in smoothed.iter_mut().enumerate() {
        let mut s = 0.0f32;
        for (k_idx, &k_val) in kernel.iter().enumerate() {
            let offset = k_idx as isize - 2;
            let bin_idx = (i as isize + offset).rem_euclid(NUM_BINS as isize) as usize;
            s += k_val * hist[bin_idx];
        }
        *item = s;
    }

    // Find mode of the smoothed histogram
    let mut max_bin = 0;
    let mut max_val = smoothed[0];
    for (i, &val) in smoothed.iter().enumerate() {
        if val > max_val {
            max_val = val;
            max_bin = i;
        }
    }

    // Parabolic interpolation around max_bin
    let prev_idx = (max_bin + NUM_BINS - 1) % NUM_BINS;
    let next_idx = (max_bin + 1) % NUM_BINS;
    let alpha = smoothed[prev_idx];
    let beta = smoothed[max_bin];
    let gamma = smoothed[next_idx];

    let denom = alpha - 2.0 * beta + gamma;
    let delta = if denom.abs() > 1e-12 {
        0.5 * (alpha - gamma) / denom
    } else {
        0.0
    };

    let peak_bin = max_bin as f32 + delta;
    let mut tuning_cents = -50.0 + peak_bin;

    // Wrap into [-50, 50]
    while tuning_cents > 50.0 {
        tuning_cents -= 100.0;
    }
    while tuning_cents < -50.0 {
        tuning_cents += 100.0;
    }

    tuning_cents.clamp(-50.0, 50.0)
}

/// Computes STFT, extracts harmonic peaks within 60 Hz to 5 kHz, estimates tuning offset,
/// compensates for tuning, and folds into a 12-bin chromagram.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if audio buffer is empty or sample rate is invalid.
/// Returns `AnalysisError::Failed` if the buffer contains silence or no harmonic peaks.
pub fn compute_chromagram(buffer: &AudioBuffer) -> Result<ChromagramResult, AnalysisError> {
    if buffer.sample_rate == 0 {
        return Err(AnalysisError::InvalidInput(
            "sample rate cannot be zero".to_string(),
        ));
    }
    if buffer.samples.is_empty() {
        return Err(AnalysisError::InvalidInput(
            "audio buffer cannot be empty".to_string(),
        ));
    }

    let sample_rate = buffer.sample_rate as f32;
    let total_samples = buffer.samples.len();

    // Prepare window and zero-padded buffer
    let win = hann_window(WINDOW_SIZE);
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);

    let k_min = ((MIN_FREQ_HZ * FFT_SIZE as f32 / sample_rate).floor() as usize).max(1);
    let k_max =
        ((MAX_FREQ_HZ * FFT_SIZE as f32 / sample_rate).ceil() as usize).min(FFT_SIZE / 2 - 1);

    if k_min >= k_max {
        return Err(AnalysisError::InvalidInput(
            "sample rate too low for requested frequency analysis range".to_string(),
        ));
    }

    // Step 1: Compute STFT and collect harmonic spectral peaks for each frame
    let mut frames_peaks = Vec::new();
    let mut fft_scratch = vec![Complex::new(0.0f32, 0.0f32); FFT_SIZE];

    let num_frames = if total_samples < WINDOW_SIZE {
        1
    } else {
        (total_samples - WINDOW_SIZE) / HOP_SIZE + 1
    };

    let mut any_signal = false;

    for frame_idx in 0..num_frames {
        let start = frame_idx * HOP_SIZE;
        // Zero out FFT buffer
        for s in &mut fft_scratch {
            *s = Complex::new(0.0, 0.0);
        }

        // Apply window
        for n in 0..WINDOW_SIZE {
            let sample = if start + n < total_samples {
                buffer.samples[start + n]
            } else {
                0.0
            };
            fft_scratch[n] = Complex::new(sample * win[n], 0.0);
        }

        fft.process(&mut fft_scratch);

        // Magnitude spectrum
        let mut mags = vec![0.0f32; FFT_SIZE / 2 + 1];
        let mut frame_peak_max = 0.0f32;
        for k in 0..=FFT_SIZE / 2 {
            let mag = fft_scratch[k].norm();
            mags[k] = mag;
            if k >= k_min && k <= k_max && mag > frame_peak_max {
                frame_peak_max = mag;
            }
        }

        if frame_peak_max > 1e-6 {
            any_signal = true;
        }

        // Harmonic peak picking
        let peak_thresh = (frame_peak_max * 0.01).max(1e-7);
        let mut frame_peaks = Vec::new();

        for k in k_min..=k_max {
            let m = mags[k];
            if m > mags[k - 1] && m > mags[k + 1] && m >= peak_thresh {
                // Parabolic interpolation around peak
                let alpha = mags[k - 1];
                let beta = m;
                let gamma = mags[k + 1];
                let denom = alpha - 2.0 * beta + gamma;
                let delta = if denom.abs() > 1e-12 {
                    0.5 * (alpha - gamma) / denom
                } else {
                    0.0
                };

                let refined_k = k as f32 + delta;
                let refined_freq = refined_k * sample_rate / FFT_SIZE as f32;
                let refined_mag = beta - 0.25 * (alpha - gamma) * delta;

                if (MIN_FREQ_HZ..=MAX_FREQ_HZ).contains(&refined_freq) && refined_mag > 0.0 {
                    frame_peaks.push(SpectralPeak {
                        freq: refined_freq,
                        mag: refined_mag,
                    });
                }
            }
        }

        frames_peaks.push(frame_peaks);
    }

    if !any_signal {
        return Err(AnalysisError::Failed(
            "audio buffer contains only silence".to_string(),
        ));
    }

    // Step 2: Estimate tuning offset against 440 Hz
    let tuning_cents = estimate_tuning(&frames_peaks);

    // Step 3: Compensate tuning and fold peaks into 12-bin chromagram
    let mut chroma_frames = Vec::with_capacity(frames_peaks.len());
    let mut mean_chroma = [0.0f32; 12];

    for frame in &frames_peaks {
        let mut frame_chroma = [0.0f32; 12];

        for peak in frame {
            // Tuning-compensated MIDI note
            let raw_note = 69.0 + 12.0 * (peak.freq / 440.0).log2();
            let comp_note = raw_note - (tuning_cents / 100.0);

            // Pitch class in [0.0, 12.0)
            let pc = (comp_note.rem_euclid(12.0) + 12.0).rem_euclid(12.0);

            // Smooth triangular/cosine distribution between adjacent pitch class bins
            let b0 = (pc.floor() as usize) % 12;
            let b1 = (b0 + 1) % 12;
            let frac = pc - pc.floor();

            let angle = frac * (PI * 0.5);
            let w0 = angle.cos().powi(2);
            let w1 = angle.sin().powi(2);

            let energy = peak.mag * peak.mag;
            frame_chroma[b0] += energy * w0;
            frame_chroma[b1] += energy * w1;
        }

        // Accumulate into mean chroma
        for (m, &f) in mean_chroma.iter_mut().zip(&frame_chroma) {
            *m += f;
        }

        chroma_frames.push(frame_chroma);
    }

    // Normalize mean chroma to sum to 1.0
    let total_chroma: f32 = mean_chroma.iter().sum();
    if total_chroma > 1e-12 {
        for v in &mut mean_chroma {
            *v /= total_chroma;
        }
    } else {
        return Err(AnalysisError::Failed(
            "no harmonic energy detected in analysis range".to_string(),
        ));
    }

    Ok(ChromagramResult {
        mean_chroma,
        frames: chroma_frames,
        tuning_cents,
    })
}
