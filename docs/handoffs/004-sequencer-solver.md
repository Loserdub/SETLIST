# 004-sequencer-solver Low-Cost Track Ordering and Open Hamiltonian Solvers
Status: done
Changed:
- crates/sequencer/src/lib.rs
- crates/sequencer/src/matrix.rs
- crates/sequencer/src/solve.rs

Added deps:
- None (pure Rust implementation using deterministic internal Xoshiro256++ PRNG)

Public API:
- `sequencer::matrix`:
  - `CostMatrix`: `n x n` directed transition cost matrix with `cost(from, to) -> f32` and `breakdown(from, to) -> Option<&TransitionCost>`.
  - `build_cost_matrix(tracks: &[TrackAnalysis], weights: &CostWeights, profile: EnergyProfile) -> CostMatrix`: Builds matrix from track analyses with profile-derived slope.
  - `build_cost_matrix_with_slope(tracks: &[TrackAnalysis], weights: &CostWeights, profile_slope: f32) -> CostMatrix`: Builds matrix with explicit profile slope.
- `sequencer::solve`:
  - `TrackPins`: Struct for user pinning constraints: `first: Option<usize>`, `last: Option<usize>`, `exclude: Vec<usize>`, with builder methods `.with_first()`, `.with_last()`, `.with_exclude()`.
  - `OrderedSetlist`: Result struct containing `order: Vec<usize>`, `total_cost: f32`, and `edge_costs: Vec<TransitionCost>`.
  - `order_tracks(tracks: &[TrackAnalysis], weights: &CostWeights, profile: EnergyProfile, pins: &TrackPins, seed: u64) -> Result<OrderedSetlist, SequencerError>`: Main sequencing solver pipeline.
  - `solve_open_hamiltonian_path(matrix: &CostMatrix, active: &[usize], pins: &TrackPins, seed: u64) -> Result<Vec<usize>, SequencerError>`: Solves open Hamiltonian path via Held-Karp (m <= 12) or Simulated Annealing (m > 12).
  - `evaluate_path_cost(path: &[usize], matrix: &CostMatrix) -> f32`: Evaluates path cost sum across matrix edges.
  - `SimpleRng`: 64-bit seeded deterministic PRNG.

Tests:
- `test_held_karp_matches_brute_force_up_to_8`: Verifies exact Held-Karp against complete brute force permutation search across multiple track counts (n=4..8) and anchor combinations (no anchors, first anchor only, last anchor only, both anchors, exclusions).
- `test_anchors_always_hold`: Verifies anchors hold under all configurations (first anchor, last anchor, both anchors, anchors with excluded tracks) for simulated annealing.
- `test_same_seed_gives_same_result`: Verifies exact determinism of simulated annealing output order, total cost, and per-edge costs across repeated runs with identical seeds.
- `test_n_60_finishes_under_one_second`: Verifies performance requirement on 60 tracks (executes in ~60ms in release mode, < 350ms in debug mode).
- `test_invalid_parameters`: Validates bounds checks and constraint conflict errors for anchors and exclusions.
- `test_matrix_dimensions_and_diagonal`: Verifies infinite self-transitions and finite non-negative off-diagonal costs.

Known gaps:
- High-level `sequence_tracks(&[Track], ...)` currently stubbed pending downstream integration to map `Track` to `TrackAnalysis` and construct `SetlistEntry`.

Needs from others:
- Workgroup D/Integration tasks connecting `order_tracks` to Tauri commands.
