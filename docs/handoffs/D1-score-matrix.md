# D1 Shared Score Matrix and Single-Pass Catalog Stats
Status: done
Changed:
- `crates/sequencer/src/relationship.rs`
- `crates/sequencer/src/matrix.rs`
- `crates/sequencer/src/lib.rs`
- `crates/sequencer/Cargo.toml`
- `crates/sequencer/benches/stats_bench.rs`
Added deps: rayon = "1.10" (parallel matrix construction across tracks), criterion = "0.5" (dev-dependencies for performance benchmarking)
Public API:
- `ScoreMatrix`: Flat row-major `n*n` score matrix storing compatibility scores, with fast lookup `get(i, j)` and song ID to row index map.
- `CatalogGraph::score_matrix(&self) -> &ScoreMatrix`
Tests:
- `relationship::tests::test_matrix_equivalence_on_80_synthetic_songs`: Asserts new single-pass matrix implementation and legacy reference implementation produce identical clusters, outliers, and stats (floats within 1e-6).
- All 58 tests in `crates/sequencer` pass.
- Criterion benchmark `stats_bench` on 587 synthetic tracks: `summary_stats_587` executes in **13.98 ms** (budget: < 300 ms, baseline was 12-24s), and parallel `ScoreMatrix::build` executes in **199.11 ms**.

Known gaps:
- none

Needs from others:
- G1 can cache `ScoreMatrix` per `catalog_revision`.
