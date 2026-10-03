# h4-sequencer-cleanup Sequencer Cleanup and Configurable Cost Model

Status: done

Changed:
- `crates/sequencer/src/lib.rs`:
  - Removed `sequence_tracks` stub function and `SequencerError::NotImplemented` enum variant.
  - Replaced stub test with `test_advise_transition`.
  - Added `evaluate_transition_cost_with_config` and `advise_transition_with_cost_and_config` public functions.
  - Re-exported `CostModelConfig` and configurable scoring, solving, matrix, and transition advising APIs.
- `crates/sequencer/src/scoring.rs`:
  - Added `CostModelConfig` struct with `key_penalties: Vec<KeyPenaltyRow>` and `energy_divisor: f32`.
  - Implemented `Default` for `CostModelConfig` providing AGENTS.md Section 6.3 standard key penalties and 16.0 energy divisor.
  - Added constructors `CostModelConfig::new(key_penalties, energy_divisor)` and `CostModelConfig::from_app_settings(&AppSettings)`.
  - Added `lookup_key_penalty` to resolve key penalties for Camelot distance `d=0..=6` and mode flip.
  - Added configurable scoring functions: `phi_key_from_distance_with_config`, `phi_key_with_config`, `phi_key_from_keys_with_config`, `phi_energy_with_config`, `transition_cost_values_with_config`, and `transition_cost_with_config`.
  - Routed all non-config convenience scoring functions (`phi_key`, `phi_energy`, `transition_cost`, etc.) to default `None` config.
  - Added unit tests: `test_cost_model_config_defaults_match_standard_table`, `test_custom_key_penalties_change_cost`, `test_custom_energy_divisor_changes_cost`, `test_cost_model_config_from_app_settings`.
- `crates/sequencer/src/matrix.rs`:
  - Added `build_with_config`, `build_with_slope_and_config`, `build_cost_matrix_with_config`, and `build_cost_matrix_with_slope_and_config` supporting `Option<&CostModelConfig>`.
- `crates/sequencer/src/solve.rs`:
  - Added `order_tracks_with_config` supporting custom `Option<&CostModelConfig>`.
  - Routed `order_tracks` to delegate to `order_tracks_with_config(..., None)`.
  - Added anchor preservation test `test_order_tracks_keeps_both_anchors_for_n_5_13_40` verifying first and last anchor integrity across $n=5$, $n=13$, and $n=40$.
- `crates/sequencer/src/advisor.rs`:
  - Added `advise_with_cost_and_config` accepting `Option<&CostModelConfig>`.
  - Routed `advise_with_cost` to delegate to `advise_with_cost_and_config(..., None)`.
- `crates/sequencer/src/relationship.rs`:
  - Removed all `unwrap()` calls outside tests (lines 954-955 and lines 1530, 1542 replaced with safe pattern matching).

Added deps: none (used existing `core_types`, `thiserror`).

Public API:
- `sequencer::scoring::CostModelConfig`:
  - `pub struct CostModelConfig { pub key_penalties: Vec<KeyPenaltyRow>, pub energy_divisor: f32 }`
  - `CostModelConfig::new(key_penalties: Vec<KeyPenaltyRow>, energy_divisor: f32) -> Self`
  - `CostModelConfig::from_app_settings(settings: &core_types::AppSettings) -> Self`
  - `CostModelConfig::lookup_key_penalty(&self, d: u8, mode_flip: bool) -> f32`
- Exact signatures for `src-tauri` / callers to pass `AppSettings` or custom configs:
  - `order_tracks_with_config(tracks: &[TrackAnalysis], weights: &CostWeights, profile: EnergyProfile, pins: &TrackPins, seed: u64, config: Option<&CostModelConfig>) -> Result<OrderedSetlist, SequencerError>`
  - `build_cost_matrix_with_config(tracks: &[TrackAnalysis], weights: &CostWeights, profile: EnergyProfile, config: Option<&CostModelConfig>) -> CostMatrix`
  - `build_cost_matrix_with_slope_and_config(tracks: &[TrackAnalysis], weights: &CostWeights, profile_slope: f32, config: Option<&CostModelConfig>) -> CostMatrix`
  - `advise_transition_with_cost_and_config(track_a: &TrackAnalysis, track_b: &TrackAnalysis, weights: Option<CostWeights>, profile: Option<EnergyProfile>, de_target: Option<f32>, config: Option<&CostModelConfig>) -> Result<CoreTransitionAdvice, SequencerError>`
  - `advise_with_cost_and_config(a: &TrackAnalysis, b: &TrackAnalysis, weights: Option<CostWeights>, profile: Option<EnergyProfile>, de_target: Option<f32>, config: Option<&CostModelConfig>) -> TransitionAdvice`
  - `evaluate_transition_cost_with_config(track_a: &TrackAnalysis, track_b: &TrackAnalysis, weights: &CostWeights, config: Option<&CostModelConfig>) -> Result<f32, SequencerError>`
  - `transition_cost_with_config(track_a: &TrackAnalysis, track_b: &TrackAnalysis, weights: &CostWeights, profile_slope: f32, config: Option<&CostModelConfig>) -> TransitionCost`
  - `transition_cost_values_with_config(bpm_a: f64, bpm_b: f64, key_a: &Camelot, key_b: &Camelot, energy_a: f32, energy_b: f32, weights: &CostWeights, profile_slope: f32, config: Option<&CostModelConfig>) -> TransitionCost`
  - `phi_key_with_config(key_a: &Camelot, key_b: &Camelot, config: Option<&CostModelConfig>) -> f32`
  - `phi_key_from_distance_with_config(d: u8, mode_flip: bool, config: Option<&CostModelConfig>) -> f32`
  - `phi_key_from_keys_with_config(key_a: &Key, key_b: &Key, config: Option<&CostModelConfig>) -> f32`
  - `phi_energy_with_config(energy_a: f32, energy_b: f32, de_target: f32, config: Option<&CostModelConfig>) -> f32`

Tests:
- Unit tests in `crates/sequencer/src/scoring.rs`:
  - `test_cost_model_config_defaults_match_standard_table`
  - `test_custom_key_penalties_change_cost`
  - `test_custom_energy_divisor_changes_cost`
  - `test_cost_model_config_from_app_settings`
- Unit tests in `crates/sequencer/src/solve.rs`:
  - `test_order_tracks_keeps_both_anchors_for_n_5_13_40`
- Unit tests in `crates/sequencer/src/lib.rs`:
  - `test_advise_transition`
  - `test_evaluate_transition_cost`

Known gaps:
- None.

Needs from others:
- `src-tauri` can construct `CostModelConfig::from_app_settings(&state.get_settings()?)` when calling `order_tracks_with_config` or transition advising.
