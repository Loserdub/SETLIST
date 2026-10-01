//! 4/4 downbeat detection using low-band energy at tracked beat positions.
//!
//! The algorithm:
//! 1. For each tracked beat, sum the squared FFT magnitudes for bins whose
//!    centre frequency is below [`LOW_BAND_MAX_HZ`] (≈ 150 Hz).  This captures
//!    kick drum energy without melodic contamination.
//! 2. Try each of the four possible bar-phase offsets (0, 1, 2, 3).
//! 3. The phase whose group means are largest at beat 0 within each bar wins.
//! 4. Return the winning phase so the caller can tag `downbeat_flags`.

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

use crate::rhythm::beats::TrackedBeats;
use crate::rhythm::onset::{HOP_SIZE, WINDOW_SIZE};
use core_types::AudioBuffer;

/// Maximum frequency (Hz) counted as "low band" for kick detection.
pub const LOW_BAND_MAX_HZ: f32 = 150.0;

/// Compute low-band energy (sum of squared magnitudes below 150 Hz) for every
/// tracked beat frame in `beats`, using a 2048-point FFT centred on the beat.
///
/// Returns a `Vec<f32>` of the same length as `beats.beats`.
pub fn low_band_energies(buffer: &AudioBuffer, beats: &TrackedBeats) -> Vec<f32> {
    let sample_rate = buffer.sample_rate as f32;
    let fft_size = 2048usize;
    // Bin index above which we stop summing (all bins with centre_hz <= 150 Hz)
    let max_bin =
        ((LOW_BAND_MAX_HZ * fft_size as f32 / sample_rate).ceil() as usize).min(fft_size / 2 + 1);

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);
    let mut fft_buf = vec![Complex::new(0.0f32, 0.0f32); fft_size];

    let half_win = WINDOW_SIZE / 2;

    beats
        .beats
        .iter()
        .map(|beat| {
            // Centre a window on the beat sample (beat.frame * HOP_SIZE)
            let center_sample = beat.frame * HOP_SIZE;
            let start = center_sample.saturating_sub(half_win);
            let end = (start + WINDOW_SIZE).min(buffer.samples.len());
            let len = end - start;

            for (i, c) in fft_buf.iter_mut().enumerate().take(fft_size) {
                if i < len {
                    *c = Complex::new(buffer.samples[start + i], 0.0);
                } else {
                    *c = Complex::new(0.0, 0.0);
                }
            }

            fft.process(&mut fft_buf);

            // Sum squared magnitudes for low bins
            let lim = max_bin.min(fft_size / 2 + 1);
            let mut energy = 0.0f32;
            for c in fft_buf.iter().take(lim) {
                energy += c.re * c.re + c.im * c.im;
            }
            energy
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
}
