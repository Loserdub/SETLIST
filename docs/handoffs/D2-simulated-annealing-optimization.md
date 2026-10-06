# D2 Simulated Annealing without Allocation Churn
Status: done
Changed:
- `crates/sequencer/src/solve.rs`
Added deps: none
Public API:
- `K_NEIGHBORS: usize = 25`: constant defining number of top candidate neighbors considered per track during 2-opt refinement.
Tests:
- `solve::tests::test_order_tracks_large_set_cost_quality_over_20_seeded_catalogs`: Tests simulated annealing solver on 20 seeded random catalogs (n=25) ensuring permutation validity, anchor satisfaction, and bounded finite non-degraded costs.
- `solve::tests::test_refine_dynamic_trajectory_differential_cost_parity`: Tests 2-opt trajectory refinement parity and non-increasing cost property.
- `solve::tests::test_n_60_finishes_under_one_second`: Runs 60 tracks solve in ~30ms (well under 1 second).
- All 58 tests in `crates/sequencer` pass.

Known gaps:
- none

Needs from others:
- D3 cancellation and progress hooks.
