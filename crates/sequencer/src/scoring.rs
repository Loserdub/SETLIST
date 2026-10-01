//! Transition cost model and sub-scoring functions.
//!
//! Implements AGENTS.md Section 6.3:
//! `C_ij = w_tempo * Phi_tempo + w_key * Phi_key + w_energy * Phi_energy + w_timbre * Phi_timbre`

use core_types::{Camelot, CostWeights, Key, TrackAnalysis};

/// Breakdown of transition cost components along with total cost.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TransitionCost {
    /// Total weighted transition cost C_ij clamped to [0.0, 1.0].
    pub total: f32,
    /// Unweighted tempo discrepancy term Phi_tempo in [0.0, 1.0].
    pub tempo: f32,
    /// Unweighted musical key distance term Phi_key in [0.0, 1.0].
    pub key: f32,
    /// Unweighted energy trajectory penalty term Phi_energy in [0.0, 1.0].
    pub energy: f32,
    /// Unweighted timbre difference term Phi_timbre (0.0 in v1).
    pub timbre: f32,
}

impl TransitionCost {
    /// Returns the unweighted tempo term Phi_tempo.
    #[inline]
    #[must_use]
    pub fn phi_tempo(&self) -> f32 {
        self.tempo
    }

    /// Returns the unweighted key distance term Phi_key.
    #[inline]
    #[must_use]
    pub fn phi_key(&self) -> f32 {
        self.key
    }

    /// Returns the unweighted energy penalty term Phi_energy.
    #[inline]
    #[must_use]
    pub fn phi_energy(&self) -> f32 {
        self.energy
    }

    /// Returns the unweighted timbre term Phi_timbre.
    #[inline]
    #[must_use]
    pub fn phi_timbre(&self) -> f32 {
        self.timbre
    }
}

impl From<TransitionCost> for (f32, f32, f32, f32, f32) {
    fn from(cost: TransitionCost) -> Self {
        (cost.total, cost.tempo, cost.key, cost.energy, cost.timbre)
    }
}

/// Evaluates `Phi_tempo = min(|BPM_i - BPM_j| / 6, 1)` with octave detection.
///
/// Before scoring, tests for an octave relation (x2 or x0.5, within 3 percent).
/// If detected, compares against the octave-adjusted BPM.
#[must_use]
pub fn phi_tempo(bpm_i: f64, bpm_j: f64) -> f32 {
    if bpm_i <= 0.0 || bpm_j <= 0.0 || bpm_i.is_nan() || bpm_j.is_nan() {
        return 1.0;
    }

    let ratio = bpm_j / bpm_i;
    let adjusted_bpm_j = if (ratio - 2.0).abs() / 2.0 <= 0.03 {
        bpm_j * 0.5
    } else if (ratio - 0.5).abs() / 0.5 <= 0.03 {
        bpm_j * 2.0
    } else {
        bpm_j
    };

    let delta = (bpm_i - adjusted_bpm_j).abs();
    ((delta / 6.0) as f32).clamp(0.0, 1.0)
}

/// Evaluates `Phi_key` given the circular Camelot number distance `d` (0..=6)
/// and whether the mode flips between minor and major.
///
/// Implements the lookup table from AGENTS.md Section 6.3:
///
/// | d | Same mode | Mode flip |
/// |---|-----------|-----------|
/// | 0 | 0.00      | 0.10      |
/// | 1 | 0.10      | 0.40      |
/// | 2 | 0.35      | 0.60      |
/// | 3 | 0.70      | 0.80      |
/// | 4 | 0.85      | 0.90      |
/// | 5 | 0.95      | 0.95      |
/// | 6 | 1.00      | 1.00      |
#[must_use]
pub fn phi_key_from_distance(d: u8, mode_flip: bool) -> f32 {
    match (d, mode_flip) {
        (0, false) => 0.00,
        (0, true) => 0.10,
        (1, false) => 0.10,
        (1, true) => 0.40,
        (2, false) => 0.35,
        (2, true) => 0.60,
        (3, false) => 0.70,
        (3, true) => 0.80,
        (4, false) => 0.85,
        (4, true) => 0.90,
        (5, false) => 0.95,
        (5, true) => 0.95,
        (6, false) => 1.00,
        (6, true) => 1.00,
        _ => 1.00,
    }
}

/// Evaluates `Phi_key` between two Camelot keys using circular distance and mode flip.
#[must_use]
pub fn phi_key(key_a: &Camelot, key_b: &Camelot) -> f32 {
    let (d, mode_flip) = key_a.distance(key_b);
    phi_key_from_distance(d, mode_flip)
}

/// Evaluates `Phi_key` between two estimated [`Key`] values.
#[must_use]
pub fn phi_key_from_keys(key_a: &Key, key_b: &Key) -> f32 {
    phi_key(&key_a.camelot, &key_b.camelot)
}

/// Evaluates `Phi_energy = min(((E_j - E_i) - dE_target)^2 / 16, 1)`.
///
/// Normalizes and clamps the quadratic energy deviation to [0.0, 1.0].
#[must_use]
pub fn phi_energy(energy_a: f32, energy_b: f32, de_target: f32) -> f32 {
    let diff = (energy_b - energy_a) - de_target;
    ((diff * diff) / 16.0).clamp(0.0, 1.0)
}

/// Evaluates `Phi_timbre`.
///
/// Returns 0.0 in v1 per AGENTS.md Section 6.3.
#[must_use]
pub fn phi_timbre() -> f32 {
    0.0
}

/// Evaluates full transition cost from raw track properties.
#[must_use]
#[allow(clippy::too_many_arguments)]
pub fn transition_cost_values(
    bpm_a: f64,
    bpm_b: f64,
    key_a: &Camelot,
    key_b: &Camelot,
    energy_a: f32,
    energy_b: f32,
    weights: &CostWeights,
    profile_slope: f32,
) -> TransitionCost {
    let tempo = phi_tempo(bpm_a, bpm_b);
    let key = phi_key(key_a, key_b);
    let energy = phi_energy(energy_a, energy_b, profile_slope);
    let timbre = phi_timbre();

    let total = (weights.tempo * tempo
        + weights.key * key
        + weights.energy * energy
        + weights.timbre * timbre)
        .clamp(0.0, 1.0);

    TransitionCost {
        total,
        tempo,
        key,
        energy,
        timbre,
    }
}

/// Evaluates transition cost C_ij between two analyzed tracks using the given weights and profile slope.
///
/// Returns the total cost and each individual cost term wrapped in [`TransitionCost`].
#[must_use]
pub fn transition_cost(
    track_a: &TrackAnalysis,
    track_b: &TrackAnalysis,
    weights: &CostWeights,
    profile_slope: f32,
) -> TransitionCost {
    transition_cost_values(
        track_a.rhythm.grid.bpm,
        track_b.rhythm.grid.bpm,
        &track_a.key.camelot,
        &track_b.key.camelot,
        track_a.energy_score as f32,
        track_b.energy_score as f32,
        weights,
        profile_slope,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::CamelotLetter;

    #[test]
    fn test_key_table_every_row() {
        // Table 6.3 from AGENTS.md:
        // d | Same mode | Mode flip
        // 0 | 0.00      | 0.10
        // 1 | 0.10      | 0.40
        // 2 | 0.35      | 0.60
        // 3 | 0.70      | 0.80
        // 4 | 0.85      | 0.90
        // 5 | 0.95      | 0.95
        // 6 | 1.00      | 1.00
        let table = [
            (0, 0.00_f32, 0.10_f32),
            (1, 0.10_f32, 0.40_f32),
            (2, 0.35_f32, 0.60_f32),
            (3, 0.70_f32, 0.80_f32),
            (4, 0.85_f32, 0.90_f32),
            (5, 0.95_f32, 0.95_f32),
            (6, 1.00_f32, 1.00_f32),
        ];

        let base_num = 8;
        let base_a = Camelot::new(base_num, CamelotLetter::A).unwrap();

        for (d, expected_same, expected_flip) in table {
            // Direct distance lookup
            assert_eq!(
                phi_key_from_distance(d, false),
                expected_same,
                "Failed at d={d}, same mode"
            );
            assert_eq!(
                phi_key_from_distance(d, true),
                expected_flip,
                "Failed at d={d}, mode flip"
            );

            // Using Camelot keys
            let target_num = ((base_num as i32 - 1 + d as i32).rem_euclid(12) + 1) as u8;
            let target_same = Camelot::new(target_num, CamelotLetter::A).unwrap();
            let target_flip = Camelot::new(target_num, CamelotLetter::B).unwrap();

            assert_eq!(
                phi_key(&base_a, &target_same),
                expected_same,
                "Camelot key mismatch for d={d}, same mode"
            );
            assert_eq!(
                phi_key(&base_a, &target_flip),
                expected_flip,
                "Camelot key mismatch for d={d}, mode flip"
            );
        }

        // Out of range distance clamps to 1.0
        assert_eq!(phi_key_from_distance(7, false), 1.0);
        assert_eq!(phi_key_from_distance(7, true), 1.0);
    }

    #[test]
    fn test_tempo_octave_pairs() {
        // Exact octave pairs
        assert_eq!(phi_tempo(70.0, 140.0), 0.0);
        assert_eq!(phi_tempo(140.0, 70.0), 0.0);
        assert_eq!(phi_tempo(80.0, 160.0), 0.0);
        assert_eq!(phi_tempo(160.0, 80.0), 0.0);
        assert_eq!(phi_tempo(87.5, 175.0), 0.0);
        assert_eq!(phi_tempo(175.0, 87.5), 0.0);

        // Identical tempo (ratio = 1.0)
        assert_eq!(phi_tempo(120.0, 120.0), 0.0);

        // Within 3% octave tolerance:
        // 70.0 * 2 = 140.0. 142.0 vs 140.0 is 2.0 / 140.0 = 1.43% <= 3%.
        // Adjusted 142.0 is 71.0, |70.0 - 71.0| = 1.0. Phi = 1.0 / 6.0.
        let cost_near_octave = phi_tempo(70.0, 142.0);
        assert!((cost_near_octave - (1.0 / 6.0)).abs() < 1e-4);

        // Without octave detection, |70 - 142| = 72, which would clamp to 1.0.
        // Confirm it was detected and scored at ~0.1667 instead of 1.0:
        assert!(cost_near_octave < 0.2);

        // 140.0 * 0.5 = 70.0. 71.0 vs 70.0 is 1.0 / 70.0 = 1.43% <= 3%.
        // Adjusted 71.0 is 142.0, |140.0 - 142.0| = 2.0. Phi = 2.0 / 6.0.
        let cost_half_octave = phi_tempo(140.0, 71.0);
        assert!((cost_half_octave - (2.0 / 6.0)).abs() < 1e-4);

        // Outside 3% tolerance:
        // 70.0 and 150.0: ratio is 150 / 70 = 2.14 (> 2.06, 7% off).
        // Delta |70 - 150| = 80, clamped to 1.0.
        assert_eq!(phi_tempo(70.0, 150.0), 1.0);
    }

    #[test]
    fn test_clamping_at_one() {
        // Tempo clamping: delta >= 6.0 yields 1.0
        assert_eq!(phi_tempo(120.0, 126.0), 1.0);
        assert_eq!(phi_tempo(120.0, 135.0), 1.0);
        assert_eq!(phi_tempo(100.0, 20.0), 1.0);
        assert_eq!(phi_tempo(-10.0, 120.0), 1.0);

        // Key clamping
        assert_eq!(phi_key_from_distance(6, false), 1.0);
        assert_eq!(phi_key_from_distance(6, true), 1.0);
        assert_eq!(phi_key_from_distance(10, false), 1.0);

        // Energy clamping: ((delta - target)^2 / 16.0) >= 1.0
        // diff = 4.0 -> 16 / 16 = 1.0
        assert_eq!(phi_energy(1.0, 5.0, 0.0), 1.0);
        // diff = 5.0 -> 25 / 16 = 1.5625 -> clamped to 1.0
        assert_eq!(phi_energy(1.0, 6.0, 0.0), 1.0);
        assert_eq!(phi_energy(1.0, 10.0, 0.0), 1.0);
        assert_eq!(phi_energy(10.0, 1.0, 0.0), 1.0);

        // TransitionCost total clamping when weights sum to > 1.0
        let excessive_weights = CostWeights {
            tempo: 0.8,
            key: 0.8,
            energy: 0.8,
            timbre: 0.0,
        };
        let key_a = Camelot::new(8, CamelotLetter::A).unwrap();
        let key_b = Camelot::new(2, CamelotLetter::A).unwrap(); // d = 6, cost = 1.0
        let cost = transition_cost_values(
            120.0,
            135.0, // delta = 15 -> tempo cost = 1.0
            &key_a,
            &key_b,
            1.0,
            10.0, // energy cost = 1.0
            &excessive_weights,
            0.0,
        );
        assert_eq!(cost.total, 1.0);
        assert_eq!(cost.tempo, 1.0);
        assert_eq!(cost.key, 1.0);
        assert_eq!(cost.energy, 1.0);
    }

    #[test]
    fn test_weights_summing_correctly() {
        let key_match = Camelot::new(8, CamelotLetter::A).unwrap();
        let key_dissonant = Camelot::new(2, CamelotLetter::A).unwrap(); // d = 6

        // 1. Default weights: 0.30 tempo, 0.35 key, 0.35 energy, 0.00 timbre. Sum = 1.00.
        let default_weights = CostWeights::default();
        assert!(
            (default_weights.tempo
                + default_weights.key
                + default_weights.energy
                + default_weights.timbre
                - 1.00)
                .abs()
                < 1e-4
        );

        // When all sub-costs are maximal (1.0), total should equal 1.00.
        let max_cost = transition_cost_values(
            120.0,
            135.0, // tempo = 1.0
            &key_match,
            &key_dissonant, // key = 1.0
            1.0,
            10.0, // energy = 1.0
            &default_weights,
            0.0,
        );
        assert!((max_cost.total - 1.00).abs() < 1e-4);
        assert_eq!(max_cost.tempo, 1.0);
        assert_eq!(max_cost.key, 1.0);
        assert_eq!(max_cost.energy, 1.0);
        assert_eq!(max_cost.timbre, 0.0);

        // When all sub-costs are perfect (0.0), total should equal 0.00.
        let zero_cost = transition_cost_values(
            120.0,
            120.0, // tempo = 0.0
            &key_match,
            &key_match, // key = 0.0
            5.0,
            6.0, // energy diff = 1.0, slope = 1.0 -> cost = 0.0
            &default_weights,
            1.0,
        );
        assert_eq!(zero_cost.total, 0.0);
        assert_eq!(zero_cost.tempo, 0.0);
        assert_eq!(zero_cost.key, 0.0);
        assert_eq!(zero_cost.energy, 0.0);
        assert_eq!(zero_cost.timbre, 0.0);

        // Isolated term contributions:
        // Only tempo is 1.0 (others 0.0) -> total = default_weights.tempo (0.30)
        let only_tempo = transition_cost_values(
            120.0,
            130.0,
            &key_match,
            &key_match,
            5.0,
            5.0,
            &default_weights,
            0.0,
        );
        assert!((only_tempo.total - default_weights.tempo).abs() < 1e-4);

        // Only key is 1.0 (others 0.0) -> total = default_weights.key (0.35)
        let only_key = transition_cost_values(
            120.0,
            120.0,
            &key_match,
            &key_dissonant,
            5.0,
            5.0,
            &default_weights,
            0.0,
        );
        assert!((only_key.total - default_weights.key).abs() < 1e-4);

        // Only energy is 1.0 (others 0.0) -> total = default_weights.energy (0.35)
        let only_energy = transition_cost_values(
            120.0,
            120.0,
            &key_match,
            &key_match,
            1.0,
            5.0, // diff = 4 -> 16 / 16 = 1.0
            &default_weights,
            0.0,
        );
        assert!((only_energy.total - default_weights.energy).abs() < 1e-4);

        // Custom weights
        let custom_weights = CostWeights {
            tempo: 0.10,
            key: 0.20,
            energy: 0.30,
            timbre: 0.40,
        };
        let custom_cost = transition_cost_values(
            120.0,
            130.0, // tempo = 1.0
            &key_match,
            &key_dissonant, // key = 1.0
            1.0,
            5.0, // energy = 1.0
            &custom_weights,
            0.0,
        );
        // timbre is 0.0 in v1, so total = 0.10 * 1 + 0.20 * 1 + 0.30 * 1 + 0.40 * 0 = 0.60
        assert!((custom_cost.total - 0.60).abs() < 1e-4);
        assert_eq!(custom_cost.timbre, 0.0);
    }

    #[test]
    fn test_phi_timbre() {
        assert_eq!(phi_timbre(), 0.0);
    }
}
