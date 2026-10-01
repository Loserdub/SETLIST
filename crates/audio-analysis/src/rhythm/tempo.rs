//! Global tempo estimation via autocorrelation of the novelty curve,
//! log-normal prior weighting, and parabolic peak interpolation.

use core_types::RhythmConfig;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

use crate::rhythm::onset::NoveltyCurve;
use crate::AnalysisError;

/// Estimates global BPM and octave alternates from a novelty curve.
///
/// # Errors
/// Returns `AnalysisError::InvalidInput` if the novelty curve is too short.
pub fn estimate_tempo(
    novelty: &NoveltyCurve,
    config: &RhythmConfig,
) -> Result<(f64, Vec<f64>), AnalysisError> {
    let n = novelty.values.len();
    if n < 8 {
        return Err(AnalysisError::InvalidInput(
            "novelty curve too short for tempo estimation".to_string(),
        ));
    }

    let frame_rate = novelty.frame_rate;

    // 1. Subtract mean from novelty curve to remove DC bias
    let mean: f32 = novelty.values.iter().sum::<f32>() / n as f32;
    let zero_mean: Vec<f32> = novelty.values.iter().map(|&v| v - mean).collect();

    // 2. Fast autocorrelation using FFT (zero-padded to next power of 2 >= 2*n)
    let m = (2 * n).next_power_of_two();
    let mut planner = FftPlanner::<f32>::new();
    let fft_forward = planner.plan_fft_forward(m);
    let fft_inverse = planner.plan_fft_inverse(m);

    let mut fft_buffer = vec![Complex::new(0.0f32, 0.0f32); m];
    for (i, &v) in zero_mean.iter().enumerate() {
        fft_buffer[i] = Complex::new(v, 0.0);
    }

    fft_forward.process(&mut fft_buffer);

    // Power spectrum |X[k]|^2
    for c in &mut fft_buffer {
        let norm_sq = c.norm_sqr();
        *c = Complex::new(norm_sq, 0.0);
    }

    fft_inverse.process(&mut fft_buffer);

    // Unbiased autocorrelation R[L] / (n - L)
    let inv_m = 1.0f32 / m as f32;
    let mut autocorr = vec![0.0f64; n];
    for l in 0..n {
        let overlap = (n - l) as f64;
        let r = (fft_buffer[l].re * inv_m) as f64;
        autocorr[l] = r / overlap;
    }

    // 3. Search range for lags
    // Expand bounds slightly to cover half-time and double-time candidates
    let search_min_bpm = (config.min_bpm * 0.45).max(30.0);
    let search_max_bpm = (config.max_bpm * 2.2).min(350.0);

    let min_lag = ((60.0 * frame_rate / search_max_bpm).floor() as usize).max(2);
    let max_lag = ((60.0 * frame_rate / search_min_bpm).ceil() as usize).min(n - 2);

    if min_lag >= max_lag {
        return Err(AnalysisError::InvalidInput(
            "invalid BPM search range for autocorrelation".to_string(),
        ));
    }

    // 4. Weight by log-normal tempo prior: exp(-(ln(bpm) - ln(c))^2 / (2 * sigma^2))
    let prior_center = config.bpm_prior_center;
    let prior_width = config.bpm_prior_width.max(0.1);
    let ln_center = prior_center.ln();
    let two_sigma_sq = 2.0 * prior_width * prior_width;

    let mut weighted_scores = vec![0.0f64; max_lag + 2];

    for l in min_lag..=max_lag {
        let raw_r = autocorr[l];
        if raw_r <= 0.0 {
            weighted_scores[l] = 0.0;
            continue;
        }

        let bpm_at_lag = (60.0 * frame_rate) / (l as f64);
        let ln_bpm = bpm_at_lag.ln();
        let diff = ln_bpm - ln_center;
        let weight = (-(diff * diff) / two_sigma_sq).exp();

        weighted_scores[l] = raw_r * weight;
    }

    // 5. Peak picking
    let mut best_lag = min_lag;
    let mut best_score = -1.0f64;
    let mut candidate_peaks = Vec::new();

    for l in min_lag..=max_lag {
        let val = weighted_scores[l];
        let prev = weighted_scores[l - 1];
        let next = weighted_scores[l + 1];

        if val > prev && val > next && val > 0.0 {
            candidate_peaks.push(l);
            if val > best_score {
                best_score = val;
                best_lag = l;
            }
        }
    }

    // Fallback if no strict peak was found
    if candidate_peaks.is_empty() {
        for (l, &score) in weighted_scores
            .iter()
            .enumerate()
            .take(max_lag + 1)
            .skip(min_lag)
        {
            if score > best_score {
                best_score = score;
                best_lag = l;
            }
        }
    }

    // 6. Refine peak with parabolic interpolation
    let y_minus = weighted_scores[best_lag - 1];
    let y_mid = weighted_scores[best_lag];
    let y_plus = weighted_scores[best_lag + 1];

    let denom = y_minus - 2.0 * y_mid + y_plus;
    let delta = if denom.abs() > 1e-9 {
        let shift = (y_minus - y_plus) / (2.0 * denom);
        shift.clamp(-0.5, 0.5)
    } else {
        0.0
    };

    let refined_lag = best_lag as f64 + delta;
    let best_bpm = (60.0 * frame_rate) / refined_lag;

    // 7. Best BPM plus alternates for x2 and x0.5
    let mut alternates = vec![best_bpm * 2.0, best_bpm * 0.5];

    // Include other strong peak candidates if available
    for &cand_lag in &candidate_peaks {
        if cand_lag != best_lag && weighted_scores[cand_lag] >= 0.5 * best_score {
            let cand_bpm = (60.0 * frame_rate) / (cand_lag as f64);
            if (cand_bpm - best_bpm).abs() > 1.0
                && (cand_bpm - best_bpm * 2.0).abs() > 1.0
                && (cand_bpm - best_bpm * 0.5).abs() > 1.0
            {
                alternates.push(cand_bpm);
            }
        }
    }

    Ok((best_bpm, alternates))
}
