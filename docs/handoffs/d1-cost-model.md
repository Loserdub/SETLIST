# D1 Scoring Functions and Cost Model
Status: done
Changed:
- crates/sequencer/src/lib.rs
- crates/sequencer/src/scoring.rs
- crates/sequencer/src/profiles.rs

Added deps:
- None (uses existing `core-types` and `thiserror`)

Public API:
- `sequencer::scoring`:
  - `phi_tempo(bpm_i: f64, bpm_j: f64) -> f32`: Tempo cost with x2 / x0.5 (within 3%) octave detection, clamped to [0.0, 1.0].
  - `phi_key(key_a: &Camelot, key_b: &Camelot) -> f32`: Musical key distance cost using circular distance table in AGENTS.md 6.3.
  - `phi_key_from_distance(d: u8, mode_flip: bool) -> f32`: Direct lookup for distance `d` (0..=6) and mode flip.
  - `phi_key_from_keys(key_a: &Key, key_b: &Key) -> f32`: Convenience helper for `Key` struct.
  - `phi_energy(energy_a: f32, energy_b: f32, de_target: f32) -> f32`: Normalized quadratic energy deviation clamped to [0.0, 1.0].
  - `phi_timbre() -> f32`: Timbre cost returning 0.0 in v1.
  - `transition_cost(track_a: &TrackAnalysis, track_b: &TrackAnalysis, weights: &CostWeights, profile_slope: f32) -> TransitionCost`: Evaluates transition cost between tracks returning total and each sub-term.
  - `transition_cost_values(bpm_a: f64, bpm_b: f64, key_a: &Camelot, key_b: &Camelot, energy_a: f32, energy_b: f32, weights: &CostWeights, profile_slope: f32) -> TransitionCost`: Evaluates transition cost directly from scalar attributes.
  - `TransitionCost`: Struct containing `total`, `tempo`, `key`, `energy`, `timbre`, accessor methods, and tuple conversion.
- `sequencer::profiles`:
  - `target_energy(profile: EnergyProfile, k: usize, n: usize) -> f32`: Target energy level on [1.0, 10.0] at position `k` of `n` tracks for `LinearRamp`, `Wave`, and `PeakPlateau`.
  - `de_target(profile: EnergyProfile, k: usize, n: usize) -> f32`: Expected energy step from position `k` to `k + 1`.
  - `dE_target(profile: EnergyProfile, k: usize, n: usize) -> f32`: Cased alias matching AGENTS.md 6.4.
- `sequencer::evaluate_transition_cost(track_a: &TrackAnalysis, track_b: &TrackAnalysis, weights: &CostWeights) -> Result<f32, SequencerError>`: Implemented to evaluate full cost model (with default 0.0 profile slope).

Tests:
- Every row of AGENTS.md Table 6.3 tested (all 14 entries for circular distance 0..=6, same mode and mode flip).
- Tempo octave detection tested for exact pairs (70 and 140 BPM, 80 and 160 BPM, 87.5 and 175 BPM, both directions), within 3% tolerance pairs (142 vs 70, 71 vs 140), and non-octave pairs (150 vs 70).
- Clamping at 1.0 tested for tempo, key distance, energy quadratic deviation, and total weighted cost.
- Weights linear combination tested for default weights summing to 1.0, zero cost, isolated term contributions (tempo only, key only, energy only), and custom weights.
- Profile shapes:
  - `LinearRamp`: Monotonically non-decreasing energy progression and non-negative `dE_target`.
  - `Wave`: Alternating peaks and valleys verified via inflection count and level transitions.
  - `PeakPlateau`: Early ramp climb followed by constant plateau energy holding and zero `dE_target`.
  - Single-track and boundary conditions tested for all profiles.

Known gaps:
- Transition advisor (`advise_transition`) and setlist sequence solver (`sequence_tracks`) remain stubs for subsequent task implementation.

Needs from others:
- None for the cost model. Solvers and transition advisor will consume `transition_cost`, `target_energy`, and `dE_target`.
