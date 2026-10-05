//! Solvers for Open Hamiltonian Path setlist sequencing.
//!
//! Implements:
//! - Exact Held-Karp dynamic programming for n <= 12.
//! - Simulated Annealing with 2-opt and Or-opt moves for n > 12.
//! - First anchor, last anchor, and must-exclude constraints.

use crate::matrix::{build_cost_matrix_with_config, CostMatrix};
use crate::profiles::dE_target;
use crate::scoring::{transition_cost_with_config, CostModelConfig, TransitionCost};
use crate::SequencerError;
use core_types::{CostWeights, EnergyProfile, TrackAnalysis};

/// Pinning constraints and exclusions for track sequencing.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TrackPins {
    /// Optional index of the track that must appear first in the setlist.
    pub first: Option<usize>,
    /// Optional index of the track that must appear last in the setlist.
    pub last: Option<usize>,
    /// Track indices that must be excluded from the sequence.
    pub exclude: Vec<usize>,
}

impl TrackPins {
    /// Creates an empty set of constraints.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the first track anchor.
    #[must_use]
    pub fn with_first(mut self, first: usize) -> Self {
        self.first = Some(first);
        self
    }

    /// Sets the last track anchor.
    #[must_use]
    pub fn with_last(mut self, last: usize) -> Self {
        self.last = Some(last);
        self
    }

    /// Sets the list of excluded track indices.
    #[must_use]
    pub fn with_exclude(mut self, exclude: Vec<usize>) -> Self {
        self.exclude = exclude;
        self
    }
}

/// Output sequence and per-edge transition cost breakdown.
#[derive(Debug, Clone, PartialEq)]
pub struct OrderedSetlist {
    /// 0-based indices into the input track collection in sequenced order.
    pub order: Vec<usize>,
    /// Total transition cost along the sequence.
    pub total_cost: f32,
    /// Per-edge transition breakdown for each transition (length is `order.len().saturating_sub(1)`).
    pub edge_costs: Vec<TransitionCost>,
}

/// Deterministic Xoshiro256++ PRNG seeded via SplitMix64.
#[derive(Debug, Clone)]
pub struct SimpleRng {
    state: [u64; 4],
}

impl SimpleRng {
    /// Creates a new PRNG with the given 64-bit seed.
    #[must_use]
    pub fn new(seed: u64) -> Self {
        let mut sm = seed;
        let mut next_sm = || {
            sm = sm.wrapping_add(0x9e37_79b9_7f4a_7c15);
            let mut z = sm;
            z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
            z ^ (z >> 31)
        };
        Self {
            state: [next_sm(), next_sm(), next_sm(), next_sm()],
        }
    }

    /// Generates the next pseudo-random `u64`.
    pub fn next_u64(&mut self) -> u64 {
        let result = (self.state[0].wrapping_add(self.state[3]))
            .rotate_left(23)
            .wrapping_add(self.state[0]);
        let t = self.state[1] << 17;
        self.state[2] ^= self.state[0];
        self.state[3] ^= self.state[1];
        self.state[1] ^= self.state[2];
        self.state[0] ^= self.state[3];
        self.state[2] ^= t;
        self.state[3] = self.state[3].rotate_left(45);
        result
    }

    /// Generates a pseudo-random `f32` in `[0.0, 1.0)`.
    pub fn next_f32(&mut self) -> f32 {
        (self.next_u64() >> 40) as f32 / ((1u64 << 24) as f32)
    }

    /// Generates a random `usize` in `[low, high)`.
    pub fn gen_range(&mut self, low: usize, high: usize) -> usize {
        if low >= high {
            low
        } else {
            low + (self.next_u64() as usize % (high - low))
        }
    }
}

/// Evaluates total path cost across an index sequence using a cost matrix.
#[must_use]
pub fn evaluate_path_cost(path: &[usize], matrix: &CostMatrix) -> f32 {
    let mut total = 0.0;
    for k in 0..path.len().saturating_sub(1) {
        total += matrix.cost(path[k], path[k + 1]);
    }
    total
}

/// Orders candidate tracks to minimize transition cost while satisfying anchor constraints.
///
/// Uses exact Held-Karp for active tracks <= 12, and Simulated Annealing with 2-opt and Or-opt
/// moves for active tracks > 12.
///
/// # Errors
/// Returns [`SequencerError::InvalidParameter`] if any pinned or excluded index is out of bounds,
/// Orders candidate tracks to minimize transition cost while satisfying anchor constraints.
///
/// Uses exact Held-Karp for active tracks <= 12, and Simulated Annealing with 2-opt and Or-opt
/// moves for active tracks > 12.
///
/// # Errors
/// Returns [`SequencerError::InvalidParameter`] if any pinned or excluded index is out of bounds,
/// or if conflicting constraints are provided.
pub fn order_tracks(
    tracks: &[TrackAnalysis],
    weights: &CostWeights,
    profile: EnergyProfile,
    pins: &TrackPins,
    seed: u64,
) -> Result<OrderedSetlist, SequencerError> {
    order_tracks_with_config(tracks, weights, profile, pins, seed, None)
}

/// Orders candidate tracks with an optional [`CostModelConfig`] for custom key and energy scoring.
///
/// # Errors
/// Returns [`SequencerError::InvalidParameter`] if any pinned or excluded index is out of bounds,
/// or if conflicting constraints are provided.
pub fn order_tracks_with_config(
    tracks: &[TrackAnalysis],
    weights: &CostWeights,
    profile: EnergyProfile,
    pins: &TrackPins,
    seed: u64,
    config: Option<&CostModelConfig>,
) -> Result<OrderedSetlist, SequencerError> {
    let n = tracks.len();
    validate_pins(n, pins)?;

    // Filter active tracks excluding must-exclude indices
    let active: Vec<usize> = (0..n).filter(|idx| !pins.exclude.contains(idx)).collect();
    let m = active.len();

    if m == 0 {
        return Ok(OrderedSetlist {
            order: vec![],
            total_cost: 0.0,
            edge_costs: vec![],
        });
    }

    if m == 1 {
        return Ok(OrderedSetlist {
            order: active,
            total_cost: 0.0,
            edge_costs: vec![],
        });
    }

    let matrix = build_cost_matrix_with_config(tracks, weights, profile, config);
    let mut order = solve_open_hamiltonian_path(&matrix, &active, pins, seed)?;

    // Refine order with dynamic trajectory scoring for non-linear energy profiles
    if profile != EnergyProfile::LinearRamp && m > 2 {
        refine_dynamic_trajectory(&mut order, tracks, weights, profile, pins, config);
    }

    // Compute exact per-edge costs along the sequenced path with dynamic profile slopes
    let mut edge_costs = Vec::with_capacity(m.saturating_sub(1));
    let mut total_cost = 0.0;

    for k in 0..m.saturating_sub(1) {
        let u = order[k];
        let v = order[k + 1];
        let slope = dE_target(profile, k, m);
        let edge_cost = transition_cost_with_config(&tracks[u], &tracks[v], weights, slope, config);
        total_cost += edge_cost.total;
        edge_costs.push(edge_cost);
    }

    Ok(OrderedSetlist {
        order,
        total_cost,
        edge_costs,
    })
}

#[cfg(test)]
pub(crate) fn evaluate_dynamic_cost(
    order: &[usize],
    tracks: &[TrackAnalysis],
    weights: &CostWeights,
    profile: EnergyProfile,
    config: Option<&CostModelConfig>,
) -> f32 {
    let m = order.len();
    let mut total = 0.0;
    for k in 0..m.saturating_sub(1) {
        let u = order[k];
        let v = order[k + 1];
        let slope = dE_target(profile, k, m);
        total += transition_cost_with_config(&tracks[u], &tracks[v], weights, slope, config).total;
    }
    total
}

fn refine_dynamic_trajectory(
    order: &mut [usize],
    tracks: &[TrackAnalysis],
    weights: &CostWeights,
    profile: EnergyProfile,
    pins: &TrackPins,
    config: Option<&CostModelConfig>,
) {
    let m = order.len();
    if m <= 2 {
        return;
    }

    let start_idx = if pins.first.is_some() { 1 } else { 0 };
    let end_idx = if pins.last.is_some() { m - 2 } else { m - 1 };

    if start_idx >= end_idx {
        return;
    }

    // Precompute profile slopes for all m - 1 positions
    let slopes: Vec<f32> = (0..m - 1).map(|k| dE_target(profile, k, m)).collect();

    // Initialize per-edge costs along current order
    let mut edge_costs: Vec<f32> = Vec::with_capacity(m - 1);
    for k in 0..m - 1 {
        let u = order[k];
        let v = order[k + 1];
        let cost =
            transition_cost_with_config(&tracks[u], &tracks[v], weights, slopes[k], config).total;
        edge_costs.push(cost);
    }

    let mut improved = true;
    let mut passes = 0;
    let mut candidate_edge_costs: Vec<f32> = Vec::with_capacity(m);

    while improved && passes < 10 {
        improved = false;
        passes += 1;

        for i in start_idx..end_idx {
            for j in (i + 1)..=end_idx {
                // The 2-opt reversal of order[i..=j] only alters edges connecting to or within [i, j]:
                // - Edge i - 1 (if i > 0): connects order[i - 1] to the new first element order[j]
                // - Internal edges k in i..j: reversed sequence order[j - (k - i)] -> order[j - (k - i) - 1]
                // - Edge j (if j < m - 1): connects the new last element order[i] to order[j + 1]
                // All other edges k < k_start and k > k_end remain strictly identical.
                let k_start = if i > 0 { i - 1 } else { i };
                let k_end = if j < m - 1 { j } else { j - 1 };

                candidate_edge_costs.clear();
                let mut old_cost_sum = 0.0;
                let mut new_cost_sum = 0.0;

                for k in k_start..=k_end {
                    let u = if k < i {
                        order[k]
                    } else if k <= j {
                        order[j - (k - i)]
                    } else {
                        order[k]
                    };

                    let next_pos = k + 1;
                    let v = if next_pos < i {
                        order[next_pos]
                    } else if next_pos <= j {
                        order[j - (next_pos - i)]
                    } else {
                        order[next_pos]
                    };

                    let new_cost = transition_cost_with_config(
                        &tracks[u], &tracks[v], weights, slopes[k], config,
                    )
                    .total;
                    candidate_edge_costs.push(new_cost);
                    old_cost_sum += edge_costs[k];
                    new_cost_sum += new_cost;
                }

                let delta = new_cost_sum - old_cost_sum;
                if delta < -1e-4 {
                    order[i..=j].reverse();
                    for (idx, k) in (k_start..=k_end).enumerate() {
                        edge_costs[k] = candidate_edge_costs[idx];
                    }
                    improved = true;
                }
            }
        }
    }
}

/// Solves the open Hamiltonian path on the given matrix for the active tracks.
///
/// # Errors
/// Returns [`SequencerError::SolverFailed`] if no path could be constructed.
pub fn solve_open_hamiltonian_path(
    matrix: &CostMatrix,
    active: &[usize],
    pins: &TrackPins,
    seed: u64,
) -> Result<Vec<usize>, SequencerError> {
    let m = active.len();
    if m <= 12 {
        solve_held_karp(matrix, active, pins.first, pins.last)
    } else {
        solve_simulated_annealing(matrix, active, pins.first, pins.last, seed)
    }
}

/// Exact Held-Karp dynamic programming solver for open Hamiltonian path (m <= 12).
fn solve_held_karp(
    matrix: &CostMatrix,
    active: &[usize],
    first_anchor: Option<usize>,
    last_anchor: Option<usize>,
) -> Result<Vec<usize>, SequencerError> {
    let m = active.len();
    let s_local = first_anchor.and_then(|f| active.iter().position(|&x| x == f));
    let t_local = last_anchor.and_then(|l| active.iter().position(|&x| x == l));

    let num_states = (1 << m) * m;
    let mut dp = vec![f32::INFINITY; num_states];
    let mut parent = vec![255u8; num_states];

    // Initialize base cases for single-vertex subsets
    for v in 0..m {
        if let Some(s) = s_local {
            if v == s {
                dp[(1 << s) * m + s] = 0.0;
            }
        } else if let Some(t) = t_local {
            // If target is specified and m > 1, start vertex cannot be t
            if m == 1 || v != t {
                dp[(1 << v) * m + v] = 0.0;
            }
        } else {
            dp[(1 << v) * m + v] = 0.0;
        }
    }

    let full_mask = (1 << m) - 1;

    // Iterate through all bitmasks in ascending order
    for mask in 1..full_mask {
        if let Some(s) = s_local {
            if (mask & (1 << s)) == 0 {
                continue;
            }
        }

        for u in 0..m {
            if (mask & (1 << u)) == 0 {
                continue;
            }

            let current_cost = dp[mask * m + u];
            if current_cost.is_infinite() {
                continue;
            }

            for v in 0..m {
                if (mask & (1 << v)) != 0 {
                    continue;
                }

                let next_mask = mask | (1 << v);

                // Enforce last anchor constraint
                if next_mask == full_mask {
                    if let Some(t) = t_local {
                        if v != t {
                            continue;
                        }
                    }
                } else if let Some(t) = t_local {
                    // Cannot visit last anchor before the final step
                    if v == t {
                        continue;
                    }
                }

                let edge_cost = matrix.cost(active[u], active[v]);
                let new_cost = current_cost + edge_cost;
                let next_idx = next_mask * m + v;

                if new_cost < dp[next_idx] {
                    dp[next_idx] = new_cost;
                    parent[next_idx] = u as u8;
                }
            }
        }
    }

    // Find optimal finishing vertex
    let best_end = if let Some(t) = t_local {
        t
    } else {
        let mut min_v = 0;
        let mut min_val = f32::INFINITY;
        for v in 0..m {
            let val = dp[full_mask * m + v];
            if val < min_val {
                min_val = val;
                min_v = v;
            }
        }
        min_v
    };

    if dp[full_mask * m + best_end].is_infinite() {
        return Err(SequencerError::SolverFailed(
            "Held-Karp could not find a viable Hamiltonian path".to_string(),
        ));
    }

    // Reconstruct path backwards
    let mut path = Vec::with_capacity(m);
    let mut curr = best_end;
    let mut curr_mask = full_mask;

    path.push(active[curr]);
    while parent[curr_mask * m + curr] != 255 {
        let prev = parent[curr_mask * m + curr] as usize;
        curr_mask ^= 1 << curr;
        curr = prev;
        path.push(active[curr]);
    }
    path.reverse();

    if path.len() != m {
        return Err(SequencerError::SolverFailed(
            "path reconstruction failed to visit all active tracks".to_string(),
        ));
    }

    Ok(path)
}

/// Simulated Annealing solver with 2-opt and Or-opt moves for m > 12.
fn solve_simulated_annealing(
    matrix: &CostMatrix,
    active: &[usize],
    first_anchor: Option<usize>,
    last_anchor: Option<usize>,
    seed: u64,
) -> Result<Vec<usize>, SequencerError> {
    let m = active.len();
    let mut rng = SimpleRng::new(seed);

    // Initial permutation with anchors fixed at start and end
    let mut current = Vec::with_capacity(m);
    if let Some(f) = first_anchor {
        current.push(f);
    }

    let mut middle: Vec<usize> = active
        .iter()
        .copied()
        .filter(|&idx| Some(idx) != first_anchor && Some(idx) != last_anchor)
        .collect();

    // Deterministically shuffle unpinned intermediate tracks
    for i in (1..middle.len()).rev() {
        let j = rng.gen_range(0, i + 1);
        middle.swap(i, j);
    }
    current.extend(middle);

    if let Some(l) = last_anchor {
        current.push(l);
    }

    let start_idx = if first_anchor.is_some() { 1 } else { 0 };
    let end_idx = if last_anchor.is_some() { m - 2 } else { m - 1 };

    // If fewer than 2 mutable vertices, permutation is already constrained
    if start_idx >= end_idx {
        return Ok(current);
    }

    let mut current_cost = evaluate_path_cost(&current, matrix);
    let mut best = current.clone();
    let mut best_cost = current_cost;

    let iterations = 35_000;
    let t_init = 1.0_f32;
    let t_min = 1e-4_f32;
    let alpha = (t_min / t_init).powf(1.0 / (iterations as f32));
    let mut temp = t_init;

    for _ in 0..iterations {
        let mut candidate = current.clone();
        let move_type = rng.next_u64() % 2;

        if move_type == 0 {
            // 2-opt move: reverse subsegment candidate[i..=j]
            let i = rng.gen_range(start_idx, end_idx);
            let j = rng.gen_range(i + 1, end_idx + 1);
            candidate[i..=j].reverse();
        } else {
            // Or-opt move: relocate a block of length 1, 2, or 3
            let span = end_idx - start_idx + 1;
            let max_len = 3.min(span.saturating_sub(1)).max(1);
            let len = rng.gen_range(1, max_len + 1);

            let max_start = end_idx - len + 1;
            let i = rng.gen_range(start_idx, max_start + 1);
            let j = rng.gen_range(start_idx, max_start + 1);

            if i != j {
                if i < j {
                    candidate[i..j + len].rotate_left(len);
                } else {
                    candidate[j..i + len].rotate_right(len);
                }
            }
        }

        let candidate_cost = evaluate_path_cost(&candidate, matrix);
        let delta = candidate_cost - current_cost;

        if delta <= 0.0 || rng.next_f32() < (-delta / temp).exp() {
            current = candidate;
            current_cost = candidate_cost;
            if current_cost < best_cost {
                best = current.clone();
                best_cost = current_cost;
            }
        }

        temp *= alpha;
    }

    Ok(best)
}

fn validate_pins(n: usize, pins: &TrackPins) -> Result<(), SequencerError> {
    for &exc in &pins.exclude {
        if exc >= n {
            return Err(SequencerError::InvalidParameter(format!(
                "exclude index {exc} out of bounds (n = {n})"
            )));
        }
    }

    if let Some(f) = pins.first {
        if f >= n {
            return Err(SequencerError::InvalidParameter(format!(
                "first anchor index {f} out of bounds (n = {n})"
            )));
        }
        if pins.exclude.contains(&f) {
            return Err(SequencerError::InvalidParameter(format!(
                "first anchor {f} is in exclude list"
            )));
        }
    }

    if let Some(l) = pins.last {
        if l >= n {
            return Err(SequencerError::InvalidParameter(format!(
                "last anchor index {l} out of bounds (n = {n})"
            )));
        }
        if pins.exclude.contains(&l) {
            return Err(SequencerError::InvalidParameter(format!(
                "last anchor {l} is in exclude list"
            )));
        }
    }

    let active_count = n.saturating_sub(pins.exclude.len());
    if let (Some(f), Some(l)) = (pins.first, pins.last) {
        if f == l && active_count > 1 {
            return Err(SequencerError::InvalidParameter(
                "first and last anchors cannot be the same track when more than 1 track is sequenced"
                    .to_string(),
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::matrix::build_cost_matrix;
    use core_types::CamelotLetter;
    use std::time::Instant;

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

    /// Brute force solver testing all permutations for ground truth comparison.
    fn solve_brute_force(
        matrix: &CostMatrix,
        active: &[usize],
        pins: &TrackPins,
    ) -> (Vec<usize>, f32) {
        let mut min_cost = f32::INFINITY;
        let mut best_perm = Vec::new();
        let mut perm = active.to_vec();

        fn permute(
            k: usize,
            arr: &mut [usize],
            matrix: &CostMatrix,
            pins: &TrackPins,
            min_cost: &mut f32,
            best_perm: &mut Vec<usize>,
        ) {
            if k == arr.len() {
                if let Some(f) = pins.first {
                    if arr.first() != Some(&f) {
                        return;
                    }
                }
                if let Some(l) = pins.last {
                    if arr.last() != Some(&l) {
                        return;
                    }
                }
                let cost = evaluate_path_cost(arr, matrix);
                if cost < *min_cost {
                    *min_cost = cost;
                    *best_perm = arr.to_vec();
                }
                return;
            }

            for i in k..arr.len() {
                arr.swap(k, i);
                permute(k + 1, arr, matrix, pins, min_cost, best_perm);
                arr.swap(k, i);
            }
        }

        permute(0, &mut perm, matrix, pins, &mut min_cost, &mut best_perm);
        (best_perm, min_cost)
    }

    #[test]
    fn test_held_karp_matches_brute_force_up_to_8() {
        let tracks: Vec<TrackAnalysis> = vec![
            make_dummy_analysis(120.0, 8, 4),
            make_dummy_analysis(124.0, 9, 5),
            make_dummy_analysis(128.0, 10, 6),
            make_dummy_analysis(130.0, 11, 7),
            make_dummy_analysis(122.0, 8, 5),
            make_dummy_analysis(126.0, 9, 6),
            make_dummy_analysis(125.0, 12, 8),
            make_dummy_analysis(128.0, 1, 9),
        ];
        let weights = CostWeights::default();
        let matrix = build_cost_matrix(&tracks, &weights, EnergyProfile::LinearRamp);

        // Test varying sizes up to 8 with different anchor combinations
        let test_configs: Vec<(usize, TrackPins)> = vec![
            (4, TrackPins::default()),
            (5, TrackPins::new().with_first(2)),
            (5, TrackPins::new().with_last(4)),
            (6, TrackPins::new().with_first(0).with_last(5)),
            (7, TrackPins::new().with_exclude(vec![1])),
            (8, TrackPins::new().with_first(3).with_last(6)),
        ];

        for (n, pins) in test_configs {
            let active: Vec<usize> = (0..n).filter(|idx| !pins.exclude.contains(idx)).collect();
            let (brute_path, brute_cost) = solve_brute_force(&matrix, &active, &pins);
            let hk_path = solve_held_karp(&matrix, &active, pins.first, pins.last).unwrap();
            let hk_cost = evaluate_path_cost(&hk_path, &matrix);

            assert_eq!(hk_path.len(), brute_path.len());
            assert!(
                (hk_cost - brute_cost).abs() < 1e-4,
                "Held-Karp cost {hk_cost} must match brute force {brute_cost} for n={n}"
            );

            if let Some(f) = pins.first {
                assert_eq!(hk_path[0], f);
            }
            if let Some(l) = pins.last {
                assert_eq!(hk_path[hk_path.len() - 1], l);
            }
        }
    }

    #[test]
    fn test_anchors_always_hold() {
        let tracks: Vec<TrackAnalysis> = (0..20)
            .map(|i| {
                let bpm = 120.0 + (i as f64) * 0.8;
                let camelot = ((i % 12) + 1) as u8;
                let energy = ((i % 8) + 2) as u8;
                make_dummy_analysis(bpm, camelot, energy)
            })
            .collect();
        let weights = CostWeights::default();

        // 1. First anchor only
        let pins_first = TrackPins::new().with_first(7);
        let res_first = order_tracks(
            &tracks,
            &weights,
            EnergyProfile::LinearRamp,
            &pins_first,
            42,
        )
        .unwrap();
        assert_eq!(res_first.order.first(), Some(&7));

        // 2. Last anchor only
        let pins_last = TrackPins::new().with_last(14);
        let res_last =
            order_tracks(&tracks, &weights, EnergyProfile::LinearRamp, &pins_last, 42).unwrap();
        assert_eq!(res_last.order.last(), Some(&14));

        // 3. Both first and last anchors
        let pins_both = TrackPins::new().with_first(3).with_last(18);
        let res_both =
            order_tracks(&tracks, &weights, EnergyProfile::LinearRamp, &pins_both, 42).unwrap();
        assert_eq!(res_both.order.first(), Some(&3));
        assert_eq!(res_both.order.last(), Some(&18));

        // 4. Anchors with exclusions
        let pins_ex = TrackPins::new()
            .with_first(0)
            .with_last(19)
            .with_exclude(vec![2, 5, 8]);
        let res_ex =
            order_tracks(&tracks, &weights, EnergyProfile::LinearRamp, &pins_ex, 42).unwrap();
        assert_eq!(res_ex.order.first(), Some(&0));
        assert_eq!(res_ex.order.last(), Some(&19));
        for exc in [2, 5, 8] {
            assert!(!res_ex.order.contains(&exc));
        }
        assert_eq!(res_ex.order.len(), 17);
    }

    #[test]
    fn test_same_seed_gives_same_result() {
        let tracks: Vec<TrackAnalysis> = (0..25)
            .map(|i| {
                make_dummy_analysis(
                    120.0 + ((i * 3) % 15) as f64,
                    ((i % 12) + 1) as u8,
                    ((i % 7) + 3) as u8,
                )
            })
            .collect();
        let weights = CostWeights::default();
        let pins = TrackPins::new().with_first(2).with_last(20);
        let seed = 987654321;

        let run1 = order_tracks(&tracks, &weights, EnergyProfile::Wave, &pins, seed).unwrap();
        let run2 = order_tracks(&tracks, &weights, EnergyProfile::Wave, &pins, seed).unwrap();

        assert_eq!(run1.order, run2.order);
        assert_eq!(run1.total_cost, run2.total_cost);
        assert_eq!(run1.edge_costs, run2.edge_costs);
    }

    #[test]
    fn test_n_60_finishes_under_one_second() {
        let tracks: Vec<TrackAnalysis> = (0..60)
            .map(|i| {
                let bpm = 115.0 + (i as f64) * 0.5;
                let camelot = ((i % 12) + 1) as u8;
                let energy = ((i % 9) + 1) as u8;
                make_dummy_analysis(bpm, camelot, energy)
            })
            .collect();
        let weights = CostWeights::default();
        let pins = TrackPins::new().with_first(0).with_last(59);

        let start = Instant::now();
        let result =
            order_tracks(&tracks, &weights, EnergyProfile::PeakPlateau, &pins, 123456).unwrap();
        let elapsed = start.elapsed();

        assert_eq!(result.order.len(), 60);
        assert_eq!(result.order.first(), Some(&0));
        assert_eq!(result.order.last(), Some(&59));
        assert_eq!(result.edge_costs.len(), 59);
        assert!(
            elapsed.as_millis() < 1000,
            "n=60 took {:?}, expected < 1 second",
            elapsed
        );
    }

    #[test]
    fn test_invalid_parameters() {
        let tracks = vec![
            make_dummy_analysis(120.0, 8, 5),
            make_dummy_analysis(124.0, 9, 6),
        ];
        let weights = CostWeights::default();

        // Out of bounds first anchor
        assert!(order_tracks(
            &tracks,
            &weights,
            EnergyProfile::LinearRamp,
            &TrackPins::new().with_first(5),
            42
        )
        .is_err());

        // Anchor in exclude
        assert!(order_tracks(
            &tracks,
            &weights,
            EnergyProfile::LinearRamp,
            &TrackPins::new().with_first(0).with_exclude(vec![0]),
            42
        )
        .is_err());

        // First and last same track when n > 1
        assert!(order_tracks(
            &tracks,
            &weights,
            EnergyProfile::LinearRamp,
            &TrackPins::new().with_first(1).with_last(1),
            42
        )
        .is_err());
    }

    #[test]
    fn test_order_tracks_keeps_both_anchors_for_n_5_13_40() {
        let weights = CostWeights::default();
        let test_sizes = [(5, 1, 4), (13, 0, 12), (40, 7, 33)];

        for (n, first_idx, last_idx) in test_sizes {
            let tracks: Vec<TrackAnalysis> = (0..n)
                .map(|i| {
                    make_dummy_analysis(
                        110.0 + ((i * 5) % 30) as f64,
                        ((i % 12) + 1) as u8,
                        ((i % 10) + 1) as u8,
                    )
                })
                .collect();

            let pins = TrackPins::new().with_first(first_idx).with_last(last_idx);
            let result = order_tracks(
                &tracks,
                &weights,
                EnergyProfile::LinearRamp,
                &pins,
                42 + n as u64,
            )
            .unwrap();

            assert_eq!(
                result.order.len(),
                n,
                "Order length must equal input size n={n}"
            );
            assert_eq!(
                result.order.first(),
                Some(&first_idx),
                "Failed to preserve first anchor for n={n}"
            );
            assert_eq!(
                result.order.last(),
                Some(&last_idx),
                "Failed to preserve last anchor for n={n}"
            );

            // Also verify with custom CostModelConfig
            let custom_cfg = CostModelConfig::default();
            let result_cfg = order_tracks_with_config(
                &tracks,
                &weights,
                EnergyProfile::Wave,
                &pins,
                100 + n as u64,
                Some(&custom_cfg),
            )
            .unwrap();

            assert_eq!(
                result_cfg.order.first(),
                Some(&first_idx),
                "Failed to preserve first anchor with config for n={n}"
            );
            assert_eq!(
                result_cfg.order.last(),
                Some(&last_idx),
                "Failed to preserve last anchor with config for n={n}"
            );
        }
    }

    #[test]
    fn test_refine_dynamic_trajectory_differential_cost_parity() {
        let n = 15;
        let tracks: Vec<TrackAnalysis> = (0..n)
            .map(|i| {
                let bpm = 120.0 + (i as f64) * 1.5;
                let camelot = ((i % 12) + 1) as u8;
                let energy = ((i % 10) + 1) as u8;
                make_dummy_analysis(bpm, camelot, energy)
            })
            .collect();
        let weights = CostWeights::default();
        let pins = TrackPins::new().with_first(0).with_last(n - 1);

        for profile in [EnergyProfile::Wave, EnergyProfile::PeakPlateau] {
            let mut order: Vec<usize> = (0..n).collect();
            let initial_cost = evaluate_dynamic_cost(&order, &tracks, &weights, profile, None);

            refine_dynamic_trajectory(&mut order, &tracks, &weights, profile, &pins, None);

            let refined_cost = evaluate_dynamic_cost(&order, &tracks, &weights, profile, None);

            // 1. Refinement never makes trajectory worse
            assert!(
                refined_cost <= initial_cost + 1e-4,
                "Refined cost ({refined_cost}) must not exceed initial cost ({initial_cost})"
            );

            // 2. Anchors are strictly preserved
            assert_eq!(order.first(), Some(&0));
            assert_eq!(order.last(), Some(&(n - 1)));

            // 3. Permutation integrity (all items present once)
            let mut sorted = order.clone();
            sorted.sort_unstable();
            assert_eq!(sorted, (0..n).collect::<Vec<_>>());
        }
    }
}
