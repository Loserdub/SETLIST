//! Key profile templates and correlation for musical key estimation.

use core_types::Mode;

/// Profile templates for musical key correlation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum KeyProfile {
    /// Krumhansl-Kessler cognitive key profiles (default).
    #[default]
    KrumhanslKessler,
    /// David Temperley's key profiles based on the Kostka-Payne corpus.
    Temperley,
    /// EDMA (Empirical Distribution of Musical Associations / Aarden-Essen).
    Edma,
    /// Sha'ath key profiles tuned for electronic and modern recorded music.
    Shaath,
}

impl KeyProfile {
    /// Returns the 12-tone major and minor profile vectors for this template set.
    ///
    /// Indices correspond to intervals relative to the tonic:
    /// [0: Tonic, 1: m2, 2: M2, 3: m3, 4: M3, 5: P4, 6: TT, 7: P5, 8: m6, 9: M6, 10: m7, 11: M7]
    #[must_use]
    pub fn weights(&self) -> ([f32; 12], [f32; 12]) {
        match self {
            Self::KrumhanslKessler => (
                // Krumhansl-Kessler Major
                [
                    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
                ],
                // Krumhansl-Kessler Minor
                [
                    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
                ],
            ),
            Self::Temperley => (
                // Temperley Major
                [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0],
                // Temperley Minor
                [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0],
            ),
            Self::Edma => (
                // Aarden-Essen / EDMA Major
                [
                    17.766, 0.145, 14.926, 0.160, 19.804, 11.358, 0.291, 22.062, 0.145, 8.154,
                    0.233, 4.956,
                ],
                // Aarden-Essen / EDMA Minor
                [
                    18.264, 0.737, 13.299, 12.797, 0.133, 11.221, 0.309, 13.818, 9.940, 0.434,
                    5.093, 13.955,
                ],
            ),
            Self::Shaath => (
                // Sha'ath Major: high tonic, 5th, 3rd; strongly penalizes out-of-scale intervals
                [6.6, 1.8, 3.5, 1.5, 4.2, 3.8, 1.5, 5.2, 1.8, 3.6, 1.5, 3.6],
                // Sha'ath Minor: sharp distinction on minor 3rd (5.0) and suppresses major 3rd (1.8)
                [6.5, 1.8, 3.5, 5.0, 1.8, 3.8, 1.5, 5.0, 3.6, 1.8, 3.5, 1.8],
            ),
        }
    }
}

/// Candidate key match resulting from template correlation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct KeyCandidate {
    /// Pitch class (0 = C, 1 = C#, ..., 11 = B).
    pub pitch_class: u8,
    /// Mode (Major or Minor).
    pub mode: Mode,
    /// Pearson correlation coefficient with the candidate key template.
    pub correlation: f32,
}

/// Computes the Pearson correlation coefficient between two 12-element vectors.
#[must_use]
pub fn pearson_correlation(x: &[f32; 12], y: &[f32; 12]) -> f32 {
    let mean_x = x.iter().sum::<f32>() / 12.0;
    let mean_y = y.iter().sum::<f32>() / 12.0;

    let mut num = 0.0f32;
    let mut denom_x = 0.0f32;
    let mut denom_y = 0.0f32;

    for (&xi, &yi) in x.iter().zip(y) {
        let dx = xi - mean_x;
        let dy = yi - mean_y;
        num += dx * dy;
        denom_x += dx * dx;
        denom_y += dy * dy;
    }

    let denom = (denom_x * denom_y).sqrt();
    if denom <= 1e-12 {
        0.0
    } else {
        (num / denom).clamp(-1.0, 1.0)
    }
}

/// Correlates a 12-bin chroma vector against all 24 key templates (12 Major, 12 Minor)
/// using the specified profile.
///
/// Returns all 24 candidates sorted in descending order of correlation.
#[must_use]
pub fn correlate_chroma(mean_chroma: &[f32; 12], profile: KeyProfile) -> Vec<KeyCandidate> {
    let (major_profile, minor_profile) = profile.weights();
    let mut candidates = Vec::with_capacity(24);

    for tonic in 0..12u8 {
        // Rotate profile so index tonic corresponds to interval 0
        let mut major_template = [0.0f32; 12];
        let mut minor_template = [0.0f32; 12];

        for k in 0..12 {
            let interval = (k + 12 - tonic as usize) % 12;
            major_template[k] = major_profile[interval];
            minor_template[k] = minor_profile[interval];
        }

        let r_major = pearson_correlation(mean_chroma, &major_template);
        candidates.push(KeyCandidate {
            pitch_class: tonic,
            mode: Mode::Major,
            correlation: r_major,
        });

        let r_minor = pearson_correlation(mean_chroma, &minor_template);
        candidates.push(KeyCandidate {
            pitch_class: tonic,
            mode: Mode::Minor,
            correlation: r_minor,
        });
    }

    // Sort descending by correlation
    candidates.sort_by(|a, b| {
        b.correlation
            .partial_cmp(&a.correlation)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    candidates
}

/// Calculates a confidence score in [0.0, 1.0] from sorted candidates.
#[must_use]
pub fn compute_confidence(candidates: &[KeyCandidate]) -> f32 {
    if candidates.is_empty() {
        return 0.0;
    }
    let top_r = candidates[0].correlation;
    if top_r <= 0.0 {
        return 0.0;
    }
    let second_r = if candidates.len() > 1 {
        candidates[1].correlation
    } else {
        0.0
    };

    // Confidence combines the absolute correlation strength and the margin over runner-up
    let margin = (top_r - second_r).max(0.0);
    // Relative separation normalized to [0, 1]
    let relative_sep = (margin / (1.0 - second_r.min(0.99))).clamp(0.0, 1.0);
    (top_r * relative_sep).clamp(0.0, 1.0)
}
