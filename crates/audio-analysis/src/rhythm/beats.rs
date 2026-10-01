//! Dynamic-programming beat tracker.
//!
//! Implements the Ellis (2007) objective:
//!   D(t) = O(t) + max_{τ} ( D(t − τ) − α · (ln(τ / τ₀))² )
//!
//! τ₀ is the frame-period implied by the estimated BPM.
//! After tracing the best path a constant grid (fixed BPM + offset) is fitted
//! via weighted least squares.  `steady` is set to `true` when the per-beat
//! residuals stay within [`STEADY_RESIDUAL_MS`].

use crate::rhythm::onset::NoveltyCurve;
use crate::AnalysisError;

/// Penalty weight for deviating from the expected beat period (α).
/// Higher values pull the tracker towards a perfectly metronomic grid.
pub const DP_ALPHA: f64 = 100.0;

/// Residual RMS threshold in milliseconds below which a grid is "steady".
pub const STEADY_RESIDUAL_MS: f64 = 8.0;

/// Minimum beat interval search bound as a fraction of τ₀.
const TAU_LO: f64 = 0.5;
/// Maximum beat interval search bound as a fraction of τ₀.
const TAU_HI: f64 = 2.0;

/// A single beat event located in the novelty-curve frame space.
#[derive(Debug, Clone, Copy)]
pub struct BeatFrame {
    /// Frame index in the novelty curve.
    pub frame: usize,
}

/// Results of the DP beat tracker.
#[derive(Debug, Clone)]
pub struct TrackedBeats {
    /// Ordered list of beat frame indices.
    pub beats: Vec<BeatFrame>,
    /// Fitted BPM from least-squares regression.
    pub fitted_bpm: f64,
    /// Fitted first-beat offset in frames.
    pub fitted_offset_frames: f64,
    /// RMS residual of the fitted grid in milliseconds.
    pub residual_ms: f64,
    /// `true` when residual is below [`STEADY_RESIDUAL_MS`].
    pub steady: bool,
}

/// Runs the DP beat tracker against a normalized novelty curve.
///
/// # Parameters
/// - `novelty`   – output of [`compute_novelty_curve`](super::onset::compute_novelty_curve).
/// - `seed_bpm`  – global BPM estimate (from autocorrelation).  Used to set τ₀.
/// - `alpha`     – DP penalty weight (default [`DP_ALPHA`]).
///
/// # Errors
/// Returns [`AnalysisError::InvalidInput`] when the novelty curve is too short
/// to accommodate at least two beats at the seed BPM.
pub fn track_beats(
    novelty: &NoveltyCurve,
    seed_bpm: f64,
    alpha: f64,
) -> Result<TrackedBeats, AnalysisError> {
    let n = novelty.values.len();
    let frame_rate = novelty.frame_rate;

    // τ₀: expected beat period in frames
    let tau0 = (60.0 / seed_bpm) * frame_rate;

    if n < (2.0 * tau0) as usize + 1 {
        return Err(AnalysisError::InvalidInput(
            "novelty curve too short for beat tracking".to_string(),
        ));
    }

    // Normalize novelty to [0, 1] so α is dimensionally consistent.
    let max_val = novelty.values.iter().cloned().fold(0.0f32, f32::max);
    let norm: Vec<f64> = if max_val > 0.0 {
        novelty
            .values
            .iter()
            .map(|&v| (v / max_val) as f64)
            .collect()
    } else {
        vec![0.0; n]
    };

    // DP tables
    let mut dp = vec![0.0f64; n];
    let mut prev = vec![0usize; n]; // back-pointer

    // Search bounds in frames
    let lo = ((tau0 * TAU_LO).round() as usize).max(1);
    let hi = ((tau0 * TAU_HI).round() as usize).min(n - 1);

    // Pre-compute ln(τ/τ₀) penalty for each lag offset
    let penalty: Vec<f64> = (lo..=hi)
        .map(|tau| {
            let lnr = ((tau as f64) / tau0).ln();
            alpha * lnr * lnr
        })
        .collect();

    // Initialise: first `hi` frames have no predecessor
    dp[..n].copy_from_slice(&norm[..n]);

    // Forward pass
    for t in (lo + 1)..n {
        let actual_lo = t.saturating_sub(hi);
        let actual_hi = if t >= lo { t - lo } else { continue };

        let mut best_val = f64::NEG_INFINITY;
        let mut best_pred = actual_lo;

        for p_idx in (actual_lo..=actual_hi).rev() {
            // offset counts from hi down towards lo so penalty index = (hi - lo) - offset
            let tau = t - p_idx;
            if tau < lo || tau > hi {
                continue;
            }
            let pen_idx = tau - lo;
            let candidate = dp[p_idx] - penalty[pen_idx];
            if candidate > best_val {
                best_val = candidate;
                best_pred = p_idx;
            }
        }

        if best_val > f64::NEG_INFINITY {
            dp[t] = norm[t] + best_val;
            prev[t] = best_pred;
        }
    }

    // Find best final beat
    let mut end = 0usize;
    let mut end_val = f64::NEG_INFINITY;
    for (t, &val) in dp.iter().enumerate().take(n).skip(lo) {
        if val > end_val {
            end_val = val;
            end = t;
        }
    }

    // Backtrace
    let mut beat_frames_rev = Vec::new();
    let mut cur = end;
    beat_frames_rev.push(cur);
    while cur > 0 && prev[cur] < cur && cur - prev[cur] >= lo {
        let p = prev[cur];
        if p == cur {
            break;
        }
        beat_frames_rev.push(p);
        cur = p;
    }
    beat_frames_rev.reverse();

    if beat_frames_rev.len() < 2 {
        return Err(AnalysisError::InvalidInput(
            "beat tracker found fewer than 2 beats".to_string(),
        ));
    }

    // Least-squares fit: beat_i ≈ offset + i * period
    // Using closed-form formulas.
    let nb = beat_frames_rev.len();
    let positions: Vec<f64> = beat_frames_rev.iter().map(|&f| f as f64).collect();
    let indices: Vec<f64> = (0..nb).map(|i| i as f64).collect();

    let sum_i: f64 = indices.iter().sum();
    let sum_i2: f64 = indices.iter().map(|x| x * x).sum();
    let sum_p: f64 = positions.iter().sum();
    let sum_ip: f64 = indices
        .iter()
        .zip(positions.iter())
        .map(|(i, p)| i * p)
        .sum();
    let denom = nb as f64 * sum_i2 - sum_i * sum_i;

    let (fitted_offset_frames, fitted_period_frames) = if denom.abs() > 1e-9 {
        let period = (nb as f64 * sum_ip - sum_i * sum_p) / denom;
        let offset = (sum_p - period * sum_i) / nb as f64;
        (offset, period)
    } else {
        // Fallback: use first gap
        let period = positions[1] - positions[0];
        (positions[0], period)
    };

    let fitted_bpm = if fitted_period_frames > 0.0 {
        60.0 * frame_rate / fitted_period_frames
    } else {
        seed_bpm
    };

    // Compute RMS residual in ms
    let ms_per_frame = 1000.0 / frame_rate;
    let mut sq_sum = 0.0f64;
    for (i, &frame) in beat_frames_rev.iter().enumerate() {
        let expected = fitted_offset_frames + i as f64 * fitted_period_frames;
        let diff_ms = (frame as f64 - expected) * ms_per_frame;
        sq_sum += diff_ms * diff_ms;
    }
    let residual_ms = (sq_sum / nb as f64).sqrt();
    let steady = residual_ms <= STEADY_RESIDUAL_MS;

    let beats: Vec<BeatFrame> = beat_frames_rev
        .into_iter()
        .map(|frame| BeatFrame { frame })
        .collect();

    Ok(TrackedBeats {
        beats,
        fitted_bpm,
        fitted_offset_frames,
        residual_ms,
        steady,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rhythm::onset::{NoveltyCurve, HOP_SIZE};

    /// Build a synthetic novelty curve that has sharp spikes at every beat frame.
    fn make_click_novelty(sample_rate: u32, duration_secs: f64, bpm: f64) -> NoveltyCurve {
        let frame_rate = sample_rate as f64 / HOP_SIZE as f64;
        let period_frames = (60.0 / bpm) * frame_rate;
        let total_frames = (duration_secs * frame_rate) as usize;
        let mut values = vec![0.0f32; total_frames];
        let mut pos = 0.0f64;
        while pos < total_frames as f64 {
            let idx = pos.round() as usize;
            if idx < total_frames {
                values[idx] = 1.0;
            }
            pos += period_frames;
        }
        NoveltyCurve { values, frame_rate }
    }

    #[test]
    fn test_beat_tracker_128_bpm() {
        let sample_rate = 44100u32;
        let bpm = 128.0;
        let novelty = make_click_novelty(sample_rate, 10.0, bpm);
        let frame_rate = novelty.frame_rate;

        let result = track_beats(&novelty, bpm, DP_ALPHA).expect("tracking should succeed");

        // fitted BPM within 1.0 BPM
        assert!(
            (result.fitted_bpm - bpm).abs() < 1.0,
            "fitted BPM {:.2} far from {bpm}",
            result.fitted_bpm
        );

        // residual should be small
        assert!(
            result.residual_ms < 5.0,
            "residual {:.2} ms too large",
            result.residual_ms
        );
        assert!(result.steady, "should be steady for perfect click track");

        // check offset close to first beat position
        let first_beat_ms = result.fitted_offset_frames / frame_rate * 1000.0;
        assert!(
            first_beat_ms.abs() < 50.0,
            "first beat offset {first_beat_ms:.1} ms unexpected"
        );
    }

    #[test]
    fn test_beat_tracker_start_offset() {
        // Build a click track that starts 137 ms in.
        let sample_rate = 44100u32;
        let bpm = 120.0;
        let frame_rate = sample_rate as f64 / HOP_SIZE as f64;
        let period_frames = (60.0 / bpm) * frame_rate;
        let offset_ms = 137.0;
        let offset_frames = (offset_ms / 1000.0 * frame_rate).round() as usize;
        let duration_secs = 10.0;
        let total_frames = (duration_secs * frame_rate) as usize;

        let mut values = vec![0.0f32; total_frames];
        let mut pos = offset_frames as f64;
        while pos < total_frames as f64 {
            let idx = pos.round() as usize;
            if idx < total_frames {
                values[idx] = 1.0;
            }
            pos += period_frames;
        }
        let novelty = NoveltyCurve { values, frame_rate };

        let result = track_beats(&novelty, bpm, DP_ALPHA).expect("tracking should succeed");

        let recovered_offset_ms = result.fitted_offset_frames / frame_rate * 1000.0;
        let error_ms = (recovered_offset_ms - offset_ms).abs();
        assert!(
            error_ms < 10.0,
            "offset error {error_ms:.1} ms exceeds 10 ms (recovered {recovered_offset_ms:.1} ms)"
        );
    }

    #[test]
    fn test_beat_tracker_slight_tempo_drift() {
        // A click track whose period drifts by < 0.5 % should still be "steady".
        let sample_rate = 44100u32;
        let bpm_start = 128.0;
        let bpm_end = 128.0 * 1.004; // 0.4 % drift
        let frame_rate = sample_rate as f64 / HOP_SIZE as f64;
        let duration_secs = 30.0;
        let total_frames = (duration_secs * frame_rate) as usize;

        let mut values = vec![0.0f32; total_frames];
        let mut pos = 0.0f64;
        let mut beat = 0usize;
        let total_beats = (duration_secs * bpm_start / 60.0) as usize;
        while beat < total_beats {
            let t = beat as f64 / total_beats as f64;
            let bpm_now = bpm_start + t * (bpm_end - bpm_start);
            let period = (60.0 / bpm_now) * frame_rate;
            let idx = pos.round() as usize;
            if idx < total_frames {
                values[idx] = 1.0;
            }
            pos += period;
            beat += 1;
        }
        let novelty = NoveltyCurve { values, frame_rate };

        let result = track_beats(&novelty, bpm_start, DP_ALPHA).expect("tracking should succeed");
        assert!(
            result.steady,
            "minor drift (0.4 %) should still be steady; residual={:.2} ms",
            result.residual_ms
        );
    }

    #[test]
    fn test_accented_downbeat_phase() {
        // Accent beat 0 of each group of 4 with extra energy.
        let sample_rate = 44100u32;
        let bpm = 128.0;
        let frame_rate = sample_rate as f64 / HOP_SIZE as f64;
        let period = (60.0 / bpm) * frame_rate;

        let mut novelty = make_click_novelty(sample_rate, 20.0, bpm);
        // Manually accent beat 0 of each bar-of-4
        let n = novelty.values.len();
        let mut pos = 0.0f64;
        while pos < n as f64 {
            let idx = pos.round() as usize;
            if idx < n {
                novelty.values[idx] += 0.5;
            }
            pos += period * 4.0;
        }

        let result = track_beats(&novelty, bpm, DP_ALPHA).expect("tracking should succeed");
        assert!(result.beats.len() >= 4, "should detect at least 4 beats");
        // Just confirm it ran deterministically without error.
    }
}
