# opt-2-differential-dynamic-trajectory Differential Delta-Evaluation in refine_dynamic_trajectory

Status: done
Changed:
- `crates/sequencer/src/solve.rs`: Replaced full $O(m)$ trajectory recalculation per 2-opt candidate move in `refine_dynamic_trajectory` with differential $\Delta$-evaluation bounded strictly to affected transition boundaries (`[k_start..=k_end]`). Precomputed profile slopes `slopes[k]` once per refinement run, avoiding repeated calls to `dE_target`. Eliminated speculative `order` slice reversals for rejected candidates. Added `test_refine_dynamic_trajectory_differential_cost_parity`.
Added deps: none
Public API: signatures other agents may call:
- `pub fn order_tracks(tracks: &[TrackAnalysis], weights: &CostWeights, profile: EnergyProfile, pins: &TrackPins, seed: u64) -> Result<OrderedSetlist, SequencerError>` (existing, now runs substantially faster on non-linear energy profiles)
Tests:
- `crates/sequencer/src/solve.rs::tests::test_refine_dynamic_trajectory_differential_cost_parity`: Validates that differential evaluation produces non-increasing trajectory costs, strictly preserves pin anchors, maintains permutation integrity, and matches authoritative edge scoring.
- All 56 sequencer tests pass.
- Full workspace: 296 Rust tests pass, 484 UI tests pass, clippy and fmt clean, typecheck clean.
Known gaps: none
Needs from others: none
