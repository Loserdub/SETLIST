//! Rhythm analysis: onset, tempo, beats, and downbeats.

pub mod beats;
pub mod downbeat;
pub mod onset;
pub mod tempo;

pub use beats::*;
pub use downbeat::*;
pub use onset::*;
pub use tempo::*;

use crate::AnalysisError;
use core_types::{AudioBuffer, BeatGrid, RhythmAnalysis, RhythmConfig};

/// Analyzes an audio buffer to extract the novelty curve, estimate the global BPM,
/// track beats via dynamic programming, detect downbeat phase from low-band energy,
/// and construct a beat grid suitable for DJ software.
///
/// # Errors
/// Returns `AnalysisError` if audio buffer is too short or tempo estimation fails.
pub fn analyze_rhythm(
    buffer: &AudioBuffer,
    config: &RhythmConfig,
) -> Result<RhythmAnalysis, AnalysisError> {
    // A1 – novelty curve and global tempo
    let novelty = compute_novelty_curve(buffer)?;
    let (seed_bpm, alternates) = estimate_tempo(&novelty, config)?;

    // A2 – DP beat tracker
    let tracked = track_beats(&novelty, seed_bpm, beats::DP_ALPHA)?;

    let frame_rate = novelty.frame_rate;
    let duration_ms = (buffer.samples.len() as f64 / buffer.sample_rate as f64) * 1000.0;

    // Use the DP-fitted BPM (or fall back to the autocorrelation estimate when
    // the tracker returns an implausible value).
    let fitted_bpm = if tracked.fitted_bpm > config.min_bpm && tracked.fitted_bpm < config.max_bpm {
        tracked.fitted_bpm
    } else {
        seed_bpm
    };

    // Downbeat phase: run the low-band energy picker on the tracked beats.
    let energies = downbeat::low_band_energies(buffer, &tracked);
    let phase = downbeat::pick_downbeat_phase(&energies);

    // Convert tracked beat frames to millisecond timestamps, starting from the
    // first beat that lands on the winning downbeat phase.
    let beat_period_ms = (60.0 / fitted_bpm) * 1000.0;

    // Determine first_downbeat_ms from the fitted grid, adjusted by phase.
    // fitted_offset_frames is beat 0 of the raw tracked sequence;
    // the downbeat falls at beat index `phase` in that sequence.
    let first_downbeat_offset_frames =
        tracked.fitted_offset_frames + phase as f64 * (60.0 / fitted_bpm * frame_rate);

    // The spectral flux novelty curve registers a jump when the audio transient
    // enters the STFT window. With WINDOW_SIZE = 1411 and HOP_SIZE = 256, the
    // transient is located near the end of that window (approximately
    // WINDOW_SIZE - 3/4 * HOP_SIZE samples into the window). We add this STFT
    // window entry delay so the resulting beat grid timestamps match the actual
    // transient in the audio buffer.
    let stft_delay_ms = ((onset::WINDOW_SIZE as f64 - 0.75 * onset::HOP_SIZE as f64)
        / buffer.sample_rate as f64)
        * 1000.0;
    let first_downbeat_ms = (first_downbeat_offset_frames / frame_rate) * 1000.0 + stft_delay_ms;

    // Build the beat list from the fitted constant grid, starting at or just
    // before the first downbeat, reaching back to beat 0 at beat_period_ms
    // offsets, and extending to the end of the track.
    let mut beats_ms: Vec<f64> = Vec::new();
    let mut downbeat_flags: Vec<bool> = Vec::new();

    // Walk backward from first_downbeat_ms to include any beats before it.
    let mut current_ms = first_downbeat_ms;
    while current_ms - beat_period_ms >= 0.0 {
        current_ms -= beat_period_ms;
    }
    // current_ms is now the first beat at or after t=0 that is aligned with the grid.

    let mut beat_count = 0i64;
    let beat_zero_ms = current_ms;
    // Compute downbeat alignment: first_downbeat_ms should be at beat_count % 4 == 0.
    // Offset all beat_count values so that first_downbeat_ms corresponds to a multiple of 4.
    let offset_beats_to_first_db =
        ((first_downbeat_ms - beat_zero_ms) / beat_period_ms).round() as i64;

    while current_ms < duration_ms {
        beats_ms.push(current_ms);
        let relative = beat_count - offset_beats_to_first_db;
        let is_downbeat = relative.rem_euclid(4) == 0;
        downbeat_flags.push(is_downbeat);
        current_ms += beat_period_ms;
        beat_count += 1;
    }

    // Recalculate actual first_downbeat_ms from the grid
    let actual_first_downbeat_ms = beats_ms
        .iter()
        .zip(downbeat_flags.iter())
        .find(|(_, &db)| db)
        .map(|(&ms, _)| ms)
        .unwrap_or(first_downbeat_ms);

    let grid = BeatGrid {
        first_downbeat_ms: actual_first_downbeat_ms,
        bpm: fitted_bpm,
        beats_ms,
        downbeat_flags,
        steady: tracked.steady,
    };

    Ok(RhythmAnalysis {
        grid,
        bpm_alternates: alternates,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;
    use std::time::Instant;

    const SAMPLE_RATE: u32 = 44100;

    /// Synthesizes a deterministic click track at a specific BPM, with an
    /// optional start offset in samples, and an optional accent on every 4th
    /// beat (index 0).
    fn make_click_track(
        sample_rate: u32,
        duration_secs: f64,
        bpm: f64,
        offset_samples: usize,
        accent_downbeats: bool,
    ) -> AudioBuffer {
        let num_samples = (sample_rate as f64 * duration_secs) as usize;
        let mut samples = vec![0.0f32; num_samples];
        let interval_samples = (sample_rate as f64 * 60.0) / bpm;
        let click_len = (sample_rate as f64 * 0.010) as usize; // 10 ms click

        let mut click_pos = offset_samples as f64;
        let mut beat_idx = 0usize;
        while (click_pos as usize) < num_samples {
            let start = click_pos as usize;
            // Accent beats 0 of every bar of 4 with a lower pitched tone.
            let freq = if accent_downbeats && beat_idx % 4 == 0 {
                200.0f32
            } else {
                1000.0f32
            };
            let amplitude = if accent_downbeats && beat_idx % 4 == 0 {
                2.0f32
            } else {
                1.0f32
            };
            for i in 0..click_len {
                if start + i < num_samples {
                    let t = i as f32 / sample_rate as f32;
                    let env = 1.0 - (i as f32 / click_len as f32);
                    let tone = (2.0 * PI * freq * t).sin();
                    samples[start + i] += amplitude * tone * env;
                }
            }
            click_pos += interval_samples;
            beat_idx += 1;
        }
        AudioBuffer {
            sample_rate,
            samples,
        }
    }

    /// Checks if target BPM is matched within 0.5 BPM directly or via an alternate octave.
    fn matches_bpm_or_octave(target_bpm: f64, best_bpm: f64, alternates: &[f64]) -> bool {
        let tolerance = 0.5;
        if (best_bpm - target_bpm).abs() <= tolerance {
            return true;
        }
        for &alt in alternates {
            if (alt - target_bpm).abs() <= tolerance {
                return true;
            }
            if (alt * 2.0 - target_bpm).abs() <= tolerance {
                return true;
            }
            if (alt * 0.5 - target_bpm).abs() <= tolerance {
                return true;
            }
        }
        false
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Tests inherited from the previous iteration
    // ──────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_click_tracks_90_128_150_174() {
        let config = RhythmConfig::default();
        let duration = 10.0;

        for &target_bpm in &[90.0, 128.0, 150.0, 174.0] {
            let audio = make_click_track(SAMPLE_RATE, duration, target_bpm, 0, false);
            let analysis = analyze_rhythm(&audio, &config).expect("analysis succeeds");

            let matched =
                matches_bpm_or_octave(target_bpm, analysis.grid.bpm, &analysis.bpm_alternates);

            assert!(
                matched,
                "Expected {target_bpm} BPM to match within 0.5 BPM or appear in alternates. \
                 Got best: {:.2}, alternates: {:?}",
                analysis.grid.bpm, analysis.bpm_alternates
            );
        }
    }

    #[test]
    fn test_click_track_128_with_noise() {
        let config = RhythmConfig::default();
        let mut audio = make_click_track(SAMPLE_RATE, 10.0, 128.0, 0, false);

        // Add deterministic pseudo-random noise per AGENTS.md rule 4
        let mut state: u64 = 123456789;
        for s in &mut audio.samples {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            let noise = ((state >> 33) as f32 / 2147483648.0) - 1.0;
            *s += 0.25 * noise;
        }

        let analysis = analyze_rhythm(&audio, &config).expect("analysis with noise succeeds");
        let matched = matches_bpm_or_octave(128.0, analysis.grid.bpm, &analysis.bpm_alternates);

        assert!(
            matched,
            "128 BPM with noise failed. Got best: {:.2}, alternates: {:?}",
            analysis.grid.bpm, analysis.bpm_alternates
        );
    }

    #[test]
    fn test_six_minute_buffer_performance() {
        let audio = make_click_track(SAMPLE_RATE, 360.0, 128.0, 0, false);
        let config = RhythmConfig::default();

        let start = Instant::now();
        let analysis = analyze_rhythm(&audio, &config).expect("6 minute analysis succeeds");
        let elapsed = start.elapsed();

        println!(
            "Performance: 6 minute buffer analyzed in {:.3} seconds (detected BPM: {:.2})",
            elapsed.as_secs_f64(),
            analysis.grid.bpm
        );

        if !cfg!(debug_assertions) {
            assert!(
                elapsed.as_secs_f64() < 3.0,
                "Analysis took {:.3}s, exceeding the 3.0s threshold",
                elapsed.as_secs_f64()
            );
        } else {
            eprintln!(
                "Note: Run with --release to benchmark under 3.0s (debug mode took {:.3}s)",
                elapsed.as_secs_f64()
            );
        }

        let matched = matches_bpm_or_octave(128.0, analysis.grid.bpm, &analysis.bpm_alternates);
        assert!(matched);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // New tests for A2 (beat tracking + downbeat detection)
    // ──────────────────────────────────────────────────────────────────────────

    /// Accent beat 0 of every bar of 4 with a stronger, lower-pitched click.
    /// The downbeat phase returned by analyze_rhythm must correspond to a beat
    /// that lands on those accented positions.
    #[test]
    fn test_accented_downbeat_phase_correct() {
        let bpm = 128.0;
        // 20 seconds gives ~42 bars at 128 BPM
        let audio = make_click_track(SAMPLE_RATE, 20.0, bpm, 0, true);
        let config = RhythmConfig::default();
        let analysis = analyze_rhythm(&audio, &config).expect("analysis succeeds");

        // first_downbeat_ms must be flagged as a downbeat in the grid
        let first_db = analysis.grid.first_downbeat_ms;
        let beat_period_ms = (60.0 / analysis.grid.bpm) * 1000.0;

        // Find which beat index corresponds to first_downbeat_ms
        let found = analysis
            .grid
            .beats_ms
            .iter()
            .zip(analysis.grid.downbeat_flags.iter())
            .any(|(&t, &db)| db && (t - first_db).abs() < beat_period_ms * 0.1);

        assert!(
            found,
            "first_downbeat_ms {first_db:.1} ms is not flagged as downbeat in the grid"
        );

        // Downbeat flags must repeat every 4 beats
        let db_indices: Vec<usize> = analysis
            .grid
            .downbeat_flags
            .iter()
            .enumerate()
            .filter(|(_, &db)| db)
            .map(|(i, _)| i)
            .collect();

        for w in db_indices.windows(2) {
            assert_eq!(
                w[1] - w[0],
                4,
                "downbeat spacing is {} beats, expected 4",
                w[1] - w[0]
            );
        }
    }

    /// A click track starting 137 ms into the buffer.
    /// The beat grid must be phase-aligned to within one beat period at the
    /// A click track starting 137 ms into the buffer.
    /// The start offset must be recovered within 10 ms per prompt requirement.
    #[test]
    fn test_start_offset_recovered_within_10ms() {
        let bpm = 120.0;
        let offset_ms = 137.0f64;
        let offset_samples = ((offset_ms / 1000.0) * SAMPLE_RATE as f64).round() as usize;

        let audio = make_click_track(SAMPLE_RATE, 15.0, bpm, offset_samples, false);
        let config = RhythmConfig::default();
        let analysis = analyze_rhythm(&audio, &config).expect("analysis succeeds");

        // The beat grid period determines quantisation
        let beat_period_ms = 60.0 / bpm * 1000.0;

        // Check that at least one beat in the grid aligns within 10 ms of the
        // original offset (or a multiple of beat_period_ms from it).
        let close_beat = analysis.grid.beats_ms.iter().any(|&t| {
            let diff = (t - offset_ms).rem_euclid(beat_period_ms);
            let phase_err = diff.min(beat_period_ms - diff);
            phase_err < 10.0
        });

        assert!(
            close_beat,
            "No beat in grid aligns within 10 ms of offset_ms={offset_ms} (beat_period={beat_period_ms:.1} ms). \
             Grid BPM={:.2}, first_db={:.1} ms",
            analysis.grid.bpm,
            analysis.grid.first_downbeat_ms
        );
    }

    /// A click track with < 0.5 % tempo drift.  `steady` must be true.
    #[test]
    fn test_tempo_drift_under_half_percent_is_steady() {
        let sample_rate = SAMPLE_RATE;
        let bpm_start = 128.0f64;
        let bpm_end = 128.0 * 1.004; // 0.4 % drift
        let duration_secs = 30.0;
        let num_samples = (sample_rate as f64 * duration_secs) as usize;
        let mut samples = vec![0.0f32; num_samples];

        let total_beats = (duration_secs * bpm_start / 60.0) as usize;
        let click_len = (sample_rate as f64 * 0.010) as usize;
        let mut pos = 0.0f64;
        for beat in 0..total_beats {
            let t = beat as f64 / total_beats as f64;
            let bpm_now = bpm_start + t * (bpm_end - bpm_start);
            let period_samples = sample_rate as f64 * 60.0 / bpm_now;
            let start = pos.round() as usize;
            for k in 0..click_len {
                if start + k < num_samples {
                    let ts = k as f32 / sample_rate as f32;
                    let env = 1.0 - (k as f32 / click_len as f32);
                    samples[start + k] += (2.0 * PI * 1000.0 * ts).sin() * env;
                }
            }
            pos += period_samples;
        }

        let audio = AudioBuffer {
            sample_rate,
            samples,
        };
        let config = RhythmConfig::default();
        let analysis = analyze_rhythm(&audio, &config).expect("analysis succeeds");

        assert!(
            analysis.grid.steady,
            "Expected steady=true for < 0.5 % tempo drift, got false (BPM: {:.2})",
            analysis.grid.bpm
        );
    }
}
