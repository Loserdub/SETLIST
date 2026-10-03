//! Dynamics analysis: frame-level RMS, spectral centroid, low-frequency power ratio,
//! bar-level energy curve, and 1-to-10 energy score.

use std::f32::consts::PI;

use core_types::{AudioBuffer, BeatGrid, DynamicsAnalysis, EnergyCurve};
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

use crate::AnalysisError;

// ---------------------------------------------------------------------------
// STFT parameters for frame-level feature extraction
// ---------------------------------------------------------------------------

/// Window size in samples (~46.4 ms at 44.1 kHz).
pub const WINDOW_SIZE: usize = 2048;

/// Zero-padded FFT size in samples.
pub const FFT_SIZE: usize = 2048;

/// Hop size between frames in samples (~23.2 ms, giving ~43 Hz frame rate).
pub const HOP_SIZE: usize = 1024;

/// Low-frequency boundary for the low-energy ratio feature in Hz.
pub const LOW_FREQ_HZ: f32 = 150.0;

/// Frame rate in Hz produced by `analyze_dynamics` at 44.1 kHz.
///
/// Computed as `44100 / HOP_SIZE = 43.06640625`.
pub const FRAME_RATE: f64 = 44100.0 / HOP_SIZE as f64;

// ---------------------------------------------------------------------------
// EnergyModel: weights and fixed bounds for the energy score
// ---------------------------------------------------------------------------

/// Weights and fixed bounds for the 1-to-10 energy score.
///
/// All bounds are **absolute** (not library-relative) so they are consistent
/// across tracks and sessions.
///
/// # Default weights
///
/// | Feature            | Weight | Lower bound | Upper bound |
/// |--------------------|--------|-------------|-------------|
/// | Integrated LUFS    | 0.35   | -30 LUFS    | -6 LUFS     |
/// | Mean RMS           | 0.30   | 0.0         | 0.35        |
/// | Mean low ratio     | 0.20   | 0.0         | 0.70        |
/// | Mean centroid (Hz) | 0.15   | 500 Hz      | 6000 Hz     |
///
/// The centroid contribution is **inverted** before scaling: a very bright
/// (high-centroid) signal without bass would otherwise score high on energy,
/// which contradicts the DJ domain where bass-heavy tracks are "high energy".
#[derive(Debug, Clone, PartialEq)]
pub struct EnergyModel {
    /// Weight for the integrated LUFS component (0.0 – 1.0).
    pub w_lufs: f32,
    /// Lower LUFS bound (most quiet; maps to 0). Typical value: -30.0 LUFS.
    pub lufs_lo: f32,
    /// Upper LUFS bound (loudest; maps to 1). Typical value: -6.0 LUFS.
    pub lufs_hi: f32,

    /// Weight for the mean RMS component (0.0 – 1.0).
    pub w_rms: f32,
    /// Lower RMS bound (maps to 0). Typical value: 0.0.
    pub rms_lo: f32,
    /// Upper RMS bound (maps to 1). Typical value: 0.35.
    pub rms_hi: f32,

    /// Weight for the mean low-frequency ratio component (0.0 – 1.0).
    pub w_low: f32,
    /// Lower low-ratio bound (maps to 0). Typical value: 0.0.
    pub low_lo: f32,
    /// Upper low-ratio bound (maps to 1). Typical value: 0.70.
    pub low_hi: f32,

    /// Weight for the mean spectral centroid component (0.0 – 1.0).
    ///
    /// Note: this is an **inverted** term — a higher centroid lowers the
    /// score because bass-heavy tracks are considered high energy in DJ terms.
    pub w_centroid: f32,
    /// Lower centroid bound in Hz (maps to 1.0 on inverted scale). Typical value: 500.0.
    pub centroid_lo: f32,
    /// Upper centroid bound in Hz (maps to 0.0 on inverted scale). Typical value: 6000.0.
    pub centroid_hi: f32,
}

impl Default for EnergyModel {
    fn default() -> Self {
        Self {
            w_lufs: 0.35,
            lufs_lo: -30.0,
            lufs_hi: -6.0,

            w_rms: 0.30,
            rms_lo: 0.0,
            rms_hi: 0.35,

            w_low: 0.20,
            low_lo: 0.0,
            low_hi: 0.70,

            w_centroid: 0.15,
            centroid_lo: 500.0,
            centroid_hi: 6000.0,
        }
    }
}

impl EnergyModel {
    /// Converts a raw feature value into a clamped [0.0, 1.0] fraction.
    #[must_use]
    fn scale(value: f32, lo: f32, hi: f32) -> f32 {
        if (hi - lo).abs() < 1e-9 {
            return 0.5;
        }
        ((value - lo) / (hi - lo)).clamp(0.0, 1.0)
    }

    /// Computes the weighted combined score in [0.0, 1.0].
    ///
    /// `integrated_lufs` is the integrated loudness from audio-io (passed in separately
    /// to keep `analyze_dynamics` pure to the audio buffer).
    #[must_use]
    pub fn compute_score(
        &self,
        integrated_lufs: f32,
        mean_rms: f32,
        mean_low_ratio: f32,
        mean_centroid_hz: f32,
    ) -> f32 {
        let s_lufs = Self::scale(integrated_lufs, self.lufs_lo, self.lufs_hi);
        let s_rms = Self::scale(mean_rms, self.rms_lo, self.rms_hi);
        let s_low = Self::scale(mean_low_ratio, self.low_lo, self.low_hi);
        // Centroid is inverted: high centroid (thin/bright) → lower score
        let s_centroid = 1.0 - Self::scale(mean_centroid_hz, self.centroid_lo, self.centroid_hi);

        let total_w = self.w_lufs + self.w_rms + self.w_low + self.w_centroid;
        if total_w < 1e-9 {
            return 0.5;
        }

        let combined = (self.w_lufs * s_lufs
            + self.w_rms * s_rms
            + self.w_low * s_low
            + self.w_centroid * s_centroid)
            / total_w;

        combined.clamp(0.0, 1.0)
    }

    /// Maps a [0.0, 1.0] score to an integer energy level in 1..=10.
    #[must_use]
    pub fn to_energy_level(score: f32) -> u8 {
        let level = (score * 9.0).floor() as u8 + 1;
        level.clamp(1, 10)
    }
}

// ---------------------------------------------------------------------------
// Helper: generate Hann window
// ---------------------------------------------------------------------------

fn hann_window(size: usize) -> Vec<f32> {
    if size <= 1 {
        return vec![1.0; size];
    }
    (0..size)
        .map(|n| 0.5 * (1.0 - (2.0 * PI * n as f32 / (size - 1) as f32).cos()))
        .collect()
}

// ---------------------------------------------------------------------------
// Frame-level feature extraction
// ---------------------------------------------------------------------------

struct FrameFeatures {
    rms: f32,
    low_ratio: f32,
    centroid_hz: f32,
}

fn compute_frame_features(
    samples: &[f32],
    fft_scratch: &mut [Complex<f32>],
    fft: &dyn rustfft::Fft<f32>,
    window: &[f32],
    sample_rate: f32,
    low_freq_hz: f32,
) -> FrameFeatures {
    // Apply window and zero-pad
    for s in fft_scratch.iter_mut() {
        *s = Complex::new(0.0, 0.0);
    }
    let n = samples.len().min(WINDOW_SIZE);
    for (i, &samp) in samples.iter().take(n).enumerate() {
        fft_scratch[i] = Complex::new(samp * window[i], 0.0);
    }

    fft.process(fft_scratch);

    // Magnitude spectrum (only positive half)
    let n_bins = FFT_SIZE / 2 + 1;
    let bin_hz = sample_rate / FFT_SIZE as f32;
    let low_bin_limit = ((low_freq_hz / bin_hz).ceil() as usize).min(n_bins - 1);

    let mut total_power = 0.0f32;
    let mut low_power = 0.0f32;
    let mut weighted_freq = 0.0f32;

    for (k, c) in fft_scratch.iter().enumerate().take(n_bins) {
        let mag = c.norm();
        let power = mag * mag;
        let freq = k as f32 * bin_hz;
        total_power += power;
        if k <= low_bin_limit {
            low_power += power;
        }
        weighted_freq += freq * power;
    }

    let low_ratio = if total_power > 1e-12 {
        (low_power / total_power).clamp(0.0, 1.0)
    } else {
        0.0
    };

    let centroid_hz = if total_power > 1e-12 {
        (weighted_freq / total_power).clamp(0.0, sample_rate * 0.5)
    } else {
        0.0
    };

    // RMS over the windowed time-domain block
    let rms = {
        let sq_sum: f32 = samples.iter().map(|&s| s * s).sum();
        (sq_sum / samples.len() as f32).sqrt()
    };

    FrameFeatures {
        rms,
        low_ratio,
        centroid_hz,
    }
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Analyzes an audio buffer, producing frame-level RMS energy, spectral centroid,
/// and low-frequency power ratio at a fixed frame rate of approximately 43 Hz
/// (44 100 / 1 024 samples/hop).
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if the buffer is empty or sample rate is 0.
pub fn analyze_dynamics(buffer: &AudioBuffer) -> Result<DynamicsAnalysis, AnalysisError> {
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
    let window = hann_window(WINDOW_SIZE);

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    let mut fft_scratch = vec![Complex::new(0.0f32, 0.0); FFT_SIZE];

    let num_frames = if total_samples < HOP_SIZE {
        1
    } else {
        (total_samples - 1) / HOP_SIZE + 1
    };

    let mut rms_curve = Vec::with_capacity(num_frames);
    let mut low_ratio_curve = Vec::with_capacity(num_frames);
    let mut centroid_curve = Vec::with_capacity(num_frames);

    for frame_idx in 0..num_frames {
        let start = frame_idx * HOP_SIZE;
        let end = (start + WINDOW_SIZE).min(total_samples);
        let frame_samples = &buffer.samples[start..end];

        let feat = compute_frame_features(
            frame_samples,
            &mut fft_scratch,
            fft.as_ref(),
            &window,
            sample_rate,
            LOW_FREQ_HZ,
        );

        rms_curve.push(feat.rms);
        low_ratio_curve.push(feat.low_ratio);
        centroid_curve.push(feat.centroid_hz);
    }

    Ok(DynamicsAnalysis {
        frame_rate: FRAME_RATE,
        rms_curve,
        low_ratio_curve,
        centroid_curve,
    })
}

/// Aggregates frame-level features per musical bar using the beat grid, normalising
/// the result so the maximum bar value is 1.0.
///
/// Bars are derived from consecutive downbeat timestamps. Frames that fall between
/// two downbeats are averaged. If no downbeats are present the entire track is
/// treated as a single bar.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if the dynamics curves are empty.
pub fn energy_curve(
    dynamics: &DynamicsAnalysis,
    grid: &BeatGrid,
) -> Result<EnergyCurve, AnalysisError> {
    if dynamics.rms_curve.is_empty() {
        return Err(AnalysisError::InvalidInput(
            "dynamics curves are empty".to_string(),
        ));
    }

    let n_frames = dynamics.rms_curve.len();
    let frame_rate = dynamics.frame_rate;

    // Build list of downbeat timestamps in milliseconds
    let downbeat_ms: Vec<f64> = grid
        .beats_ms
        .iter()
        .zip(&grid.downbeat_flags)
        .filter_map(|(&ts, &flag)| if flag { Some(ts) } else { None })
        .collect();

    // Define bar boundaries: pairs of (start_ms, end_ms)
    let track_duration_ms = n_frames as f64 / frame_rate * 1000.0;
    let bar_boundaries: Vec<(f64, f64)> = if downbeat_ms.len() < 2 {
        vec![(0.0, track_duration_ms)]
    } else {
        let mut boundaries = Vec::with_capacity(downbeat_ms.len());
        for i in 0..downbeat_ms.len() - 1 {
            boundaries.push((downbeat_ms[i], downbeat_ms[i + 1]));
        }
        // Last bar extends to end of track
        if let Some(&last_downbeat) = downbeat_ms.last() {
            boundaries.push((last_downbeat, track_duration_ms));
        }
        boundaries
    };

    // For each bar, average RMS over the frames that fall inside it
    let mut per_bar = Vec::with_capacity(bar_boundaries.len());
    for (start_ms, end_ms) in &bar_boundaries {
        let start_frame = ((start_ms / 1000.0) * frame_rate) as usize;
        let end_frame = ((end_ms / 1000.0) * frame_rate) as usize;
        let start_frame = start_frame.min(n_frames);
        let end_frame = end_frame.min(n_frames);

        if start_frame >= end_frame {
            per_bar.push(0.0f32);
            continue;
        }

        let sum: f32 = dynamics.rms_curve[start_frame..end_frame].iter().sum();
        per_bar.push(sum / (end_frame - start_frame) as f32);
    }

    // Normalise so the peak bar is 1.0
    let max_val = per_bar.iter().cloned().fold(0.0f32, f32::max);
    if max_val > 1e-9 {
        for v in &mut per_bar {
            *v /= max_val;
        }
    }

    Ok(EnergyCurve { per_bar })
}

/// Computes the overall track energy score on a 1-to-10 integer scale.
///
/// This signature matches the locked contract from `002-contracts-v1`. LUFS
/// is unavailable here (it lives in `audio-io`), so this function sets it to
/// the neutral midpoint of the bound (`lufs_lo + lufs_hi) / 2`). Call
/// [`energy_score_with_lufs`] when you have the integrated loudness available.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if the dynamics curves are empty.
pub fn energy_score(dynamics: &DynamicsAnalysis, _grid: &BeatGrid) -> Result<u8, AnalysisError> {
    // Use the neutral-LUFS variant with the default model's midpoint
    let model = EnergyModel::default();
    let lufs_neutral = (model.lufs_lo + model.lufs_hi) * 0.5;
    energy_score_with_lufs(dynamics, lufs_neutral, &model)
}

/// Computes the overall track energy score with an explicit integrated LUFS value.
///
/// Prefer this over [`energy_score`] when loudness is available from `audio-io`.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if the dynamics curves are empty.
pub fn energy_score_with_lufs(
    dynamics: &DynamicsAnalysis,
    integrated_lufs: f32,
    model: &EnergyModel,
) -> Result<u8, AnalysisError> {
    if dynamics.rms_curve.is_empty() {
        return Err(AnalysisError::InvalidInput(
            "dynamics curves are empty".to_string(),
        ));
    }

    let n = dynamics.rms_curve.len() as f32;
    let mean_rms: f32 = dynamics.rms_curve.iter().sum::<f32>() / n;
    let mean_low: f32 = dynamics.low_ratio_curve.iter().sum::<f32>() / n;
    let mean_centroid: f32 = dynamics.centroid_curve.iter().sum::<f32>() / n;

    let score = model.compute_score(integrated_lufs, mean_rms, mean_low, mean_centroid);
    Ok(EnergyModel::to_energy_level(score))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    const SR: u32 = 44100;

    /// Synthesizes a mono sine tone at `freq` Hz with given linear amplitude.
    fn sine_tone(freq: f32, amplitude: f32, duration_secs: f32) -> AudioBuffer {
        let n = (SR as f32 * duration_secs) as usize;
        let samples: Vec<f32> = (0..n)
            .map(|i| amplitude * (2.0 * PI * freq * i as f32 / SR as f32).sin())
            .collect();
        AudioBuffer {
            sample_rate: SR,
            samples,
        }
    }

    /// Synthesizes a tone with a given amplitude for the first half and a lower
    /// amplitude for the middle third, then resumes the original amplitude.
    fn tone_with_quiet_middle(freq: f32, amplitude: f32, quiet_amp: f32) -> AudioBuffer {
        let duration = 4.0f32; // 4 seconds
        let n = (SR as f32 * duration) as usize;
        let quiet_start = n / 3;
        let quiet_end = 2 * n / 3;
        let samples: Vec<f32> = (0..n)
            .map(|i| {
                let amp = if i >= quiet_start && i < quiet_end {
                    quiet_amp
                } else {
                    amplitude
                };
                amp * (2.0 * PI * freq * i as f32 / SR as f32).sin()
            })
            .collect();
        AudioBuffer {
            sample_rate: SR,
            samples,
        }
    }

    /// Synthesizes a bass-heavy signal (fundamental at `freq` Hz plus a strong sub).
    fn bass_heavy_tone(freq: f32, amplitude: f32) -> AudioBuffer {
        let duration = 2.0f32;
        let n = (SR as f32 * duration) as usize;
        // Sub-octave + fundamental
        let sub = freq * 0.5;
        let samples: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f32 / SR as f32;
                amplitude * (2.0 * PI * sub * t).sin()
                    + 0.8 * amplitude * (2.0 * PI * freq * t).sin()
            })
            .collect();
        // Normalize
        let max_val = samples.iter().cloned().fold(0.0f32, f32::max);
        let samples = if max_val > 1e-6 {
            samples.iter().map(|&s| s / max_val * amplitude).collect()
        } else {
            samples
        };
        AudioBuffer {
            sample_rate: SR,
            samples,
        }
    }

    // ------------------------------------------------------------------
    // Basic correctness
    // ------------------------------------------------------------------

    #[test]
    fn test_silence_rms_is_zero() {
        let buffer = AudioBuffer {
            sample_rate: SR,
            samples: vec![0.0; 44100],
        };
        let dyn_analysis = analyze_dynamics(&buffer).unwrap();
        let mean_rms: f32 =
            dyn_analysis.rms_curve.iter().sum::<f32>() / dyn_analysis.rms_curve.len() as f32;
        assert!(
            mean_rms < 1e-6,
            "RMS of silence should be ~0, got {mean_rms}"
        );
    }

    #[test]
    fn test_empty_buffer_returns_error() {
        let buffer = AudioBuffer {
            sample_rate: SR,
            samples: vec![],
        };
        assert!(matches!(
            analyze_dynamics(&buffer),
            Err(AnalysisError::InvalidInput(_))
        ));
    }

    #[test]
    fn test_frame_rate_is_correct() {
        let buffer = sine_tone(440.0, 0.5, 2.0);
        let dyn_analysis = analyze_dynamics(&buffer).unwrap();
        let expected = FRAME_RATE;
        let diff = (dyn_analysis.frame_rate - expected).abs();
        assert!(
            diff < 1e-6,
            "frame_rate should be {expected}, got {}",
            dyn_analysis.frame_rate
        );
    }

    #[test]
    fn test_low_ratio_high_for_bass_signal() {
        // A 60 Hz signal should give a high low-ratio
        let buffer = sine_tone(60.0, 0.8, 1.0);
        let dyn_analysis = analyze_dynamics(&buffer).unwrap();
        let mean_low: f32 = dyn_analysis.low_ratio_curve.iter().sum::<f32>()
            / dyn_analysis.low_ratio_curve.len() as f32;
        assert!(
            mean_low > 0.8,
            "60 Hz signal should have high low-ratio, got {mean_low}"
        );
    }

    #[test]
    fn test_low_ratio_low_for_high_freq_signal() {
        // A 5 kHz signal should give a low low-ratio
        let buffer = sine_tone(5000.0, 0.8, 1.0);
        let dyn_analysis = analyze_dynamics(&buffer).unwrap();
        let mean_low: f32 = dyn_analysis.low_ratio_curve.iter().sum::<f32>()
            / dyn_analysis.low_ratio_curve.len() as f32;
        assert!(
            mean_low < 0.1,
            "5 kHz signal should have low low-ratio, got {mean_low}"
        );
    }

    #[test]
    fn test_centroid_high_for_high_freq_signal() {
        let buffer = sine_tone(4000.0, 0.8, 1.0);
        let dyn_analysis = analyze_dynamics(&buffer).unwrap();
        let mean_centroid: f32 = dyn_analysis.centroid_curve.iter().sum::<f32>()
            / dyn_analysis.centroid_curve.len() as f32;
        assert!(
            mean_centroid > 2000.0,
            "4 kHz signal centroid should be high, got {mean_centroid}"
        );
    }

    // ------------------------------------------------------------------
    // REQUIREMENT: Monotonic energy score across 5 signals
    //
    // Signal progression (increasing loudness + bass):
    //   1. Very quiet, high-freq (thin)
    //   2. Quiet, mid-freq
    //   3. Medium, mid-freq
    //   4. Louder, low+mid
    //   5. Loud, bass-heavy (fullest)
    // ------------------------------------------------------------------

    #[test]
    fn test_monotonic_energy_score_across_five_signals() {
        let model = EnergyModel::default();

        // Signal 1: very quiet thin tone
        let s1 = sine_tone(3000.0, 0.05, 2.0);
        // Signal 2: quiet mid-range
        let s2 = sine_tone(1000.0, 0.15, 2.0);
        // Signal 3: moderate mid-range
        let s3 = sine_tone(500.0, 0.40, 2.0);
        // Signal 4: louder with bass presence (80 Hz sub + fundamental)
        let s4 = bass_heavy_tone(80.0, 0.65);
        // Signal 5: maximum energy – loud bass at lowest feasible fundamental,
        // LUFS at the upper bound so it hits score bucket 10
        let s5 = bass_heavy_tone(40.0, 0.99);

        // Corresponding approximate integrated LUFS values (louder → higher LUFS).
        // Signal 5 uses -6 LUFS (just at the upper bound of the default model)
        // to ensure it reaches energy level 10 while signal 4 stays at 9.
        let lufs = [-28.0f32, -22.0, -16.0, -12.0, -6.0];
        let signals = [&s1, &s2, &s3, &s4, &s5];

        let mut scores = Vec::new();
        for (buf, &l) in signals.iter().zip(&lufs) {
            let dyn_analysis = analyze_dynamics(buf).unwrap();
            let score = energy_score_with_lufs(&dyn_analysis, l, &model).unwrap();
            scores.push(score);
            println!("Signal LUFS={l}: energy score = {score}");
        }

        // Verify strict monotonic order
        for i in 0..scores.len() - 1 {
            assert!(
                scores[i] < scores[i + 1],
                "Energy scores not strictly monotonic: {:?}",
                scores
            );
        }

        // All scores in [1, 10]
        for &s in &scores {
            assert!((1..=10).contains(&s), "Score {s} out of range");
        }
    }

    // ------------------------------------------------------------------
    // REQUIREMENT: Quiet middle shows a dip in the per-bar energy curve
    // ------------------------------------------------------------------

    #[test]
    fn test_quiet_middle_shows_dip_in_energy_curve() {
        // 440 Hz signal: loud → quiet → loud
        let buffer = tone_with_quiet_middle(440.0, 0.8, 0.05);
        let dyn_analysis = analyze_dynamics(&buffer).unwrap();

        // Build a beat grid with downbeats at 0 ms, 1000 ms, 2000 ms, 3000 ms
        // (roughly 60 BPM, 4 bars over 4 seconds)
        let bar_ms = [0.0f64, 1000.0, 2000.0, 3000.0, 4000.0];
        let mut beats_ms = Vec::new();
        let mut downbeat_flags = Vec::new();
        for &t in &bar_ms {
            beats_ms.push(t);
            downbeat_flags.push(true);
        }
        let grid = BeatGrid {
            first_downbeat_ms: 0.0,
            bpm: 60.0,
            beats_ms,
            downbeat_flags,
            steady: true,
        };

        let curve = energy_curve(&dyn_analysis, &grid).unwrap();
        assert!(
            curve.per_bar.len() >= 4,
            "Expected at least 4 bars, got {}",
            curve.per_bar.len()
        );

        println!("Per-bar energy curve: {:?}", curve.per_bar);

        // The middle bars (index 1 and 2) should be lower than the outer bars (0 and 3)
        let first = curve.per_bar[0];
        let mid1 = curve.per_bar[1];
        let mid2 = curve.per_bar[2];
        let last = curve.per_bar[curve.per_bar.len() - 1];

        let outer_avg = (first + last) * 0.5;
        let middle_avg = (mid1 + mid2) * 0.5;

        assert!(
            middle_avg < outer_avg,
            "Middle bars ({middle_avg:.3}) should be quieter than outer bars ({outer_avg:.3})"
        );
    }

    // ------------------------------------------------------------------
    // EnergyModel unit tests
    // ------------------------------------------------------------------

    #[test]
    fn test_energy_model_scale_bounds() {
        let model = EnergyModel::default();
        // At lower bound → 0.0
        assert!(
            (EnergyModel::scale(model.lufs_lo, model.lufs_lo, model.lufs_hi) - 0.0).abs() < 1e-6
        );
        // At upper bound → 1.0
        assert!(
            (EnergyModel::scale(model.lufs_hi, model.lufs_lo, model.lufs_hi) - 1.0).abs() < 1e-6
        );
        // Below lower → clamped to 0.0
        assert!((EnergyModel::scale(-99.0, model.lufs_lo, model.lufs_hi) - 0.0).abs() < 1e-6);
        // Above upper → clamped to 1.0
        assert!((EnergyModel::scale(0.0, model.lufs_lo, model.lufs_hi) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_energy_level_mapping() {
        // score 0.0 → level 1
        assert_eq!(EnergyModel::to_energy_level(0.0), 1);
        // score 1.0 → level 10
        assert_eq!(EnergyModel::to_energy_level(1.0), 10);
        // mid-range
        let mid_score = 0.5f32;
        let level = EnergyModel::to_energy_level(mid_score);
        assert!((1..=10).contains(&level));
    }

    #[test]
    fn test_energy_score_stub_compat() {
        // The locked contract: energy_score(&DynamicsAnalysis, &BeatGrid) -> Result<u8, AnalysisError>
        let buffer = sine_tone(440.0, 0.5, 1.0);
        let dyn_analysis = analyze_dynamics(&buffer).unwrap();
        let grid = BeatGrid {
            first_downbeat_ms: 0.0,
            bpm: 120.0,
            beats_ms: vec![],
            downbeat_flags: vec![],
            steady: true,
        };
        let score = energy_score(&dyn_analysis, &grid).unwrap();
        assert!((1..=10).contains(&score), "Score {score} out of range");
    }
}
