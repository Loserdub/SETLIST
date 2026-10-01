//! Directed cost matrix construction for setlist sequencing.
//!
//! Evaluates transition costs between all pairs of tracks using the cost model
//! in AGENTS.md Section 6.3.

use crate::profiles::target_energy;
use crate::scoring::{transition_cost, TransitionCost};
use core_types::{CostWeights, EnergyProfile, TrackAnalysis};

/// An `n x n` directed cost matrix storing transition costs between all pairs of tracks.
#[derive(Debug, Clone, PartialEq)]
pub struct CostMatrix {
    /// Number of tracks `n`.
    pub n: usize,
    /// Row-major flattened cost values (length `n * n`).
    pub costs: Vec<f32>,
    /// Row-major flattened detailed breakdown for each transition (length `n * n`).
    pub breakdowns: Vec<TransitionCost>,
}

impl CostMatrix {
    /// Creates a new uninitialized `CostMatrix` of dimension `n x n`.
    #[must_use]
    pub fn new(n: usize) -> Self {
        Self {
            n,
            costs: vec![0.0; n * n],
            breakdowns: vec![
                TransitionCost {
                    total: 0.0,
                    tempo: 0.0,
                    key: 0.0,
                    energy: 0.0,
                    timbre: 0.0,
                };
                n * n
            ],
        }
    }

    /// Builds an `n x n` directed cost matrix for `tracks` using the given `weights`
    /// and target energy profile.
    #[must_use]
    pub fn build(tracks: &[TrackAnalysis], weights: &CostWeights, profile: EnergyProfile) -> Self {
        let n = tracks.len();
        let slope = if n > 1 {
            (target_energy(profile, n - 1, n) - target_energy(profile, 0, n)) / ((n - 1) as f32)
        } else {
            0.0
        };
        Self::build_with_slope(tracks, weights, slope)
    }

    /// Builds an `n x n` directed cost matrix for `tracks` using the given `weights`
    /// and explicit target energy slope.
    #[must_use]
    pub fn build_with_slope(
        tracks: &[TrackAnalysis],
        weights: &CostWeights,
        profile_slope: f32,
    ) -> Self {
        let n = tracks.len();
        let mut matrix = Self::new(n);

        for i in 0..n {
            for j in 0..n {
                let idx = i * n + j;
                if i == j {
                    matrix.costs[idx] = f32::INFINITY;
                    matrix.breakdowns[idx] = TransitionCost {
                        total: f32::INFINITY,
                        tempo: 0.0,
                        key: 0.0,
                        energy: 0.0,
                        timbre: 0.0,
                    };
                } else {
                    let cost = transition_cost(&tracks[i], &tracks[j], weights, profile_slope);
                    matrix.costs[idx] = cost.total;
                    matrix.breakdowns[idx] = cost;
                }
            }
        }

        matrix
    }

    /// Returns the transition cost from track `from` to track `to`.
    /// Returns `f32::INFINITY` if `from == to` or if either index is out of bounds.
    #[inline]
    #[must_use]
    pub fn cost(&self, from: usize, to: usize) -> f32 {
        if from >= self.n || to >= self.n || from == to {
            f32::INFINITY
        } else {
            self.costs[from * self.n + to]
        }
    }

    /// Returns the detailed transition cost breakdown from track `from` to track `to`.
    #[inline]
    #[must_use]
    pub fn breakdown(&self, from: usize, to: usize) -> Option<&TransitionCost> {
        if from >= self.n || to >= self.n {
            None
        } else {
            Some(&self.breakdowns[from * self.n + to])
        }
    }
}

/// Convenience function to build a cost matrix for tracks under an energy profile.
#[must_use]
pub fn build_cost_matrix(
    tracks: &[TrackAnalysis],
    weights: &CostWeights,
    profile: EnergyProfile,
) -> CostMatrix {
    CostMatrix::build(tracks, weights, profile)
}

/// Convenience function to build a cost matrix with an explicit slope.
#[must_use]
pub fn build_cost_matrix_with_slope(
    tracks: &[TrackAnalysis],
    weights: &CostWeights,
    profile_slope: f32,
) -> CostMatrix {
    CostMatrix::build_with_slope(tracks, weights, profile_slope)
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::CamelotLetter;

    fn make_dummy_analysis(bpm: f64, camelot_num: u8, energy: u8) -> TrackAnalysis {
        TrackAnalysis {
            loudness: core_types::LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 6.0,
                true_peak: -1.0,
            },
            rhythm: core_types::RhythmAnalysis {
                grid: core_types::BeatGrid {
                    first_downbeat_ms: 0.0,
                    bpm,
                    beats_ms: vec![],
                    downbeat_flags: vec![],
                    steady: true,
                },
                bpm_alternates: vec![],
            },
            key: core_types::Key {
                pitch_class: 0,
                mode: core_types::Mode::Minor,
                camelot: core_types::Camelot::new(camelot_num, CamelotLetter::A).unwrap(),
                tuning_cents: 0.0,
            },
            dynamics: core_types::DynamicsAnalysis {
                frame_rate: 44100.0,
                rms_curve: vec![],
                low_ratio_curve: vec![],
                centroid_curve: vec![],
            },
            energy_score: energy,
            energy_curve: core_types::EnergyCurve { per_bar: vec![] },
            segments: vec![],
            cue_points: vec![],
            waveform: core_types::Waveform3Band {
                points_per_sec: 100,
                low: core_types::WaveformBand {
                    peak: vec![],
                    rms: vec![],
                },
                mid: core_types::WaveformBand {
                    peak: vec![],
                    rms: vec![],
                },
                high: core_types::WaveformBand {
                    peak: vec![],
                    rms: vec![],
                },
            },
        }
    }

    #[test]
    fn test_matrix_dimensions_and_diagonal() {
        let tracks = vec![
            make_dummy_analysis(120.0, 8, 5),
            make_dummy_analysis(124.0, 9, 6),
            make_dummy_analysis(128.0, 10, 7),
        ];
        let weights = CostWeights::default();
        let matrix = build_cost_matrix(&tracks, &weights, EnergyProfile::LinearRamp);

        assert_eq!(matrix.n, 3);
        assert_eq!(matrix.costs.len(), 9);

        // Self-transitions should be infinite
        for i in 0..3 {
            assert!(matrix.cost(i, i).is_infinite());
        }

        // Off-diagonal should be finite non-negative
        for i in 0..3 {
            for j in 0..3 {
                if i != j {
                    let c = matrix.cost(i, j);
                    assert!(c.is_finite());
                    assert!(c >= 0.0);
                    assert!(c <= 1.0);
                    assert!(matrix.breakdown(i, j).is_some());
                }
            }
        }
    }

    #[test]
    fn test_out_of_bounds_handling() {
        let matrix = CostMatrix::new(2);
        assert!(matrix.cost(5, 1).is_infinite());
        assert!(matrix.cost(0, 5).is_infinite());
        assert!(matrix.breakdown(5, 1).is_none());
    }
}
