//! 4/4 downbeat detection using low-band energy at tracked beat positions.
//!
//! The algorithm:
//! 1. For each tracked beat, sum the squared FFT magnitudes for bins whose
//!    centre frequency is below [`LOW_BAND_MAX_HZ`] (≈ 150 Hz).  This captures
//!    kick drum energy without melodic contamination.
//! 2. Try each of the four possible bar-phase offsets (0, 1, 2, 3).
//! 3. The phase whose group means are largest at beat 0 within each bar wins.
//! 4. Return the winning phase so the caller can tag `downbeat_flags`.

use crate::rhythm::beats::TrackedBeats;
use crate::rhythm::onset::{HOP_SIZE, WINDOW_SIZE};
use core_types::AudioBuffer;

/// Maximum frequency (Hz) counted as "low band" for kick detection.
pub const LOW_BAND_MAX_HZ: f32 = 150.0;

/// Precomputed coefficients for the second-order Goertzel resonator bank.
#[derive(Debug, Clone)]
struct GoertzelBank {
    coeffs: Vec<f64>,
}

impl GoertzelBank {
    /// Creates a Goertzel resonator bank for evaluating DFT bins below `max_hz`.
    fn new(sample_rate: f32, fft_size: usize, max_hz: f32) -> Self {
        if sample_rate <= 0.0 || fft_size == 0 {
            return Self { coeffs: Vec::new() };
        }
        let max_bin =
            ((max_hz * fft_size as f32 / sample_rate).ceil() as usize).min(fft_size / 2 + 1);
        // k = 0 (DC) is evaluated directly via sample accumulation.
        // Non-DC bins k = 1..max_bin use 2 * cos(2 * PI * k / N).
        let coeffs = (1..max_bin)
            .map(|k| 2.0 * (2.0 * std::f64::consts::PI * (k as f64) / (fft_size as f64)).cos())
            .collect();
        Self { coeffs }
    }

    /// Evaluates total low-band energy (sum of squared DFT magnitudes for DC and bins 1..max_bin).
    ///
    /// By the Goertzel identity, for any truncated signal length L <= N:
    /// |X[k]|^2 = s1^2 + s2^2 - c_k * s1 * s2
    /// exactly equals the squared magnitude of the zero-padded N-point DFT bin k.
    #[inline]
    fn compute_energy(&self, samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }

        // DC bin (k = 0): |X[0]|^2 = (sum x[n])^2
        let dc_sum: f64 = samples.iter().map(|&x| x as f64).sum();
        let mut total_energy = dc_sum * dc_sum;

        // Non-DC bins evaluated via 2nd-order Goertzel IIR recurrence
        for &c in &self.coeffs {
            let mut s1 = 0.0f64;
            let mut s2 = 0.0f64;
            for &x in samples {
                let s0 = (x as f64) + c * s1 - s2;
                s2 = s1;
                s1 = s0;
            }
            let bin_energy = s1 * s1 + s2 * s2 - c * s1 * s2;
            total_energy += bin_energy;
        }

        total_energy as f32
    }
}

/// Compute low-band energy (sum of squared magnitudes below 150 Hz) for every
/// tracked beat frame in `beats`, using an O(K) Goertzel resonator bank centred on the beat.
///
/// Returns a `Vec<f32>` of the same length as `beats.beats`.
pub fn low_band_energies(buffer: &AudioBuffer, beats: &TrackedBeats) -> Vec<f32> {
    let sample_rate = buffer.sample_rate as f32;
    let fft_size = 2048usize;
    let bank = GoertzelBank::new(sample_rate, fft_size, LOW_BAND_MAX_HZ);
    let half_win = WINDOW_SIZE / 2;

    beats
        .beats
        .iter()
        .map(|beat| {
            let center_sample = beat.frame * HOP_SIZE;
            let start = center_sample.saturating_sub(half_win);
            let end = (start + WINDOW_SIZE).min(buffer.samples.len());
            bank.compute_energy(&buffer.samples[start..end])
        })
        .collect()
}

/// Pick the 4/4 downbeat phase (0, 1, 2, or 3) that maximises the mean
/// low-band energy on beat 0 of each bar.
///
/// Returns the winning phase offset (0–3).
pub fn pick_downbeat_phase(energies: &[f32]) -> usize {
    if energies.is_empty() {
        return 0;
    }
    let mut best_phase = 0;
    let mut best_mean = -1.0f64;

    for phase in 0..4usize {
        let mut sum = 0.0f64;
        let mut count = 0usize;
        for (i, &e) in energies.iter().enumerate() {
            if i % 4 == phase {
                sum += e as f64;
                count += 1;
            }
        }
        let mean = if count > 0 { sum / count as f64 } else { 0.0 };
        if mean > best_mean {
            best_mean = mean;
            best_phase = phase;
        }
    }
    best_phase
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rhythm::beats::{BeatFrame, TrackedBeats};
    use crate::rhythm::onset::HOP_SIZE;

    /// Build a minimal TrackedBeats without running the full DP.
    fn fake_beats(
        num: usize,
        period_frames: f64,
        offset_frames: f64,
        frame_rate: f64,
    ) -> TrackedBeats {
        let beats = (0..num)
            .map(|i| BeatFrame {
                frame: (offset_frames + i as f64 * period_frames).round() as usize,
            })
            .collect();
        TrackedBeats {
            beats,
            fitted_bpm: 60.0 * frame_rate / period_frames,
            fitted_offset_frames: offset_frames,
            residual_ms: 0.0,
            steady: true,
        }
    }

    #[test]
    fn test_pick_phase_identifies_loud_beat() {
        // beat 0 of each group of 4 has much higher energy
        let energies: Vec<f32> = (0..16)
            .map(|i| if i % 4 == 2 { 10.0 } else { 1.0 })
            .collect();
        assert_eq!(pick_downbeat_phase(&energies), 2);
    }

    #[test]
    fn test_pick_phase_uniform() {
        // When all energies are equal, phase 0 should still win (or at least not panic).
        let energies = vec![1.0f32; 16];
        let phase = pick_downbeat_phase(&energies);
        assert!(phase < 4, "phase out of range: {phase}");
    }

    #[test]
    fn test_low_band_energies_silence() {
        let sample_rate = 44100u32;
        let n_samples = sample_rate as usize * 5;
        let buffer = AudioBuffer {
            sample_rate,
            samples: vec![0.0f32; n_samples],
        };
        let frame_rate = sample_rate as f64 / HOP_SIZE as f64;
        let period_frames = (60.0 / 120.0) * frame_rate;
        let beats = fake_beats(8, period_frames, 0.0, frame_rate);
        let energies = low_band_energies(&buffer, &beats);
        assert_eq!(energies.len(), 8);
        for e in energies {
            assert!(e.abs() < 1e-6, "expected zero energy on silence, got {e}");
        }
    }

    #[test]
    fn test_low_band_energies_kick_accent() {
        // Place a 60 Hz tone burst at beat 0 of bars 0 and 1 (beat indices 0, 4).
        let sample_rate = 44100u32;
        let bpm = 120.0;
        let frame_rate = sample_rate as f64 / HOP_SIZE as f64;
        let period_frames = (60.0 / bpm) * frame_rate;
        let n_beats = 8usize;
        let total_samples =
            ((period_frames * n_beats as f64 / frame_rate) * sample_rate as f64 + 2048.0) as usize;

        let mut samples = vec![0.0f32; total_samples];

        // Inject 60 Hz burst at beats 0 and 4
        let burst_len = 512usize;
        for beat_idx in [0usize, 4] {
            let center = (beat_idx as f64 * period_frames / frame_rate * sample_rate as f64).round()
                as usize;
            let start = center.saturating_sub(burst_len / 2);
            for k in 0..burst_len {
                if start + k < total_samples {
                    let t = k as f32 / sample_rate as f32;
                    samples[start + k] += (2.0 * std::f32::consts::PI * 60.0 * t).sin();
                }
            }
        }

        let buffer = AudioBuffer {
            sample_rate,
            samples,
        };
        let beats = fake_beats(n_beats, period_frames, 0.0, frame_rate);
        let energies = low_band_energies(&buffer, &beats);

        // beats 0 and 4 should have visibly higher low-band energy
        assert!(
            energies[0] > energies[1],
            "beat 0 energy should exceed beat 1 (kick vs. silence)"
        );
        assert!(
            energies[4] > energies[5],
            "beat 4 energy should exceed beat 5 (kick vs. silence)"
        );

        // The downbeat picker should select phase 0
        assert_eq!(pick_downbeat_phase(&energies), 0);
    }

    #[test]
    fn test_goertzel_equivalence_to_fft() {
        use rustfft::num_complex::Complex;
        use rustfft::FftPlanner;

        let sample_rate = 44100.0f32;
        let fft_size = 2048usize;
        let max_hz = LOW_BAND_MAX_HZ;
        let bank = GoertzelBank::new(sample_rate, fft_size, max_hz);

        // Generate synthetic test frame with mixed tones (50 Hz, 110 Hz, 800 Hz)
        let n_samples = 1411;
        let mut test_signal = vec![0.0f32; n_samples];
        for (i, sample) in test_signal.iter_mut().enumerate() {
            let t = i as f32 / sample_rate;
            *sample = (2.0 * std::f32::consts::PI * 50.0 * t).sin()
                + 0.5 * (2.0 * std::f32::consts::PI * 110.0 * t).cos()
                + 0.8 * (2.0 * std::f32::consts::PI * 800.0 * t).sin();
        }

        // 1. Energy via Goertzel Bank
        let goertzel_energy = bank.compute_energy(&test_signal);

        // 2. Energy via zero-padded 2048-point FFT
        let max_bin =
            ((max_hz * fft_size as f32 / sample_rate).ceil() as usize).min(fft_size / 2 + 1);
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(fft_size);
        let mut fft_buf = vec![Complex::new(0.0f32, 0.0f32); fft_size];
        for (i, &s) in test_signal.iter().enumerate() {
            fft_buf[i] = Complex::new(s, 0.0);
        }
        fft.process(&mut fft_buf);

        let mut fft_energy = 0.0f32;
        for c in fft_buf.iter().take(max_bin) {
            fft_energy += c.re * c.re + c.im * c.im;
        }

        assert!(goertzel_energy > 0.0, "expected positive energy");
        assert!(fft_energy > 0.0, "expected positive energy");
        let rel_err = ((goertzel_energy - fft_energy).abs()) / fft_energy;
        assert!(
            rel_err < 1e-4,
            "Goertzel ({goertzel_energy}) deviates from FFT ({fft_energy}) by relative error {rel_err}"
        );
    }
}
