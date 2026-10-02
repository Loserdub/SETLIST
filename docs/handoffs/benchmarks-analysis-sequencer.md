# Benchmarks: Audio Analysis (6-min) & Sequencer Cost Matrix
Status: done
Changed:
- benches/analysis_bench.rs
- crates/audio-analysis/Cargo.toml
- Cargo.lock
- docs/handoffs/benchmarks-analysis-sequencer.md

Added deps:
- `criterion = "0.5"` (in `audio-analysis` dev-dependencies for micro-benchmarking)

Public API:
- `cargo bench --bench analysis_bench`

Benchmark Results & Baseline Targets:

| Benchmark Target | Mean Time (Current) | 95% Confidence Interval | Proposed Baseline Target | Status |
|------------------|---------------------|--------------------------|--------------------------|--------|
| `rhythm::analyze_rhythm` (6-min buffer, 15.88M samples) | **675.32 ms** | 621.92 ms – 728.36 ms | **< 1,000 ms** (1.0 s) | PASS |
| `tonal::analyze_key` (6-min buffer, 15.88M samples) | **583.23 ms** | 548.82 ms – 624.23 ms | **< 900 ms** (0.9 s) | PASS |
| `dynamics::analyze_dynamics` (6-min buffer, 15.88M samples) | **212.57 ms** | 199.15 ms – 233.54 ms | **< 350 ms** (0.35 s) | PASS |
| `structure::segment` (6-min grid + dynamics) | **0.0247 ms** (24.70 µs) | 24.35 µs – 25.37 µs | **< 0.100 ms** (100 µs) | PASS |
| `sequencer::build_cost_matrix` (20 tracks, 400 cells) | **0.0038 ms** (3.81 µs) | 3.77 µs – 3.87 µs | **< 0.020 ms** (20 µs) | PASS |
| `sequencer::build_cost_matrix` (50 tracks, 2,500 cells) | **0.0237 ms** (23.70 µs) | 23.13 µs – 24.47 µs | **< 0.100 ms** (100 µs) | PASS |
| `sequencer::build_cost_matrix` (100 tracks, 10,000 cells) | **0.0843 ms** (84.32 µs) | 83.30 µs – 86.22 µs | **< 0.300 ms** (300 µs) | PASS |

Key Findings:
1. **Total Full-Track Analysis Latency**:
   A 6-minute audio file runs through all four analysis engines in **~1,471 ms** (~1.47 seconds) on a single CPU core without GPU acceleration. Compared to real-time 360 seconds of playback, this represents a **~245x faster-than-real-time** processing speed, well within interactive performance budgets for the Wave 2 scanner.
2. **Structure Segmentation Efficiency**:
   Snapping boundaries to 8/16-bar phrases and classifying energy states takes **< 25 microseconds**, making real-time re-segmentation on cue adjustments instantaneous.
3. **Sequencer Cost Matrix Scaling**:
   Building a full 100x100 transition cost matrix takes only **84.3 microseconds**, confirming that the $O(n^2)$ matrix pre-computation will not bottleneck setlist optimization.

Tests:
- `cargo bench --bench analysis_bench` executes cleanly without panics.
- All 146 workspace tests continue to pass.
- `cargo clippy --workspace -- -D warnings` and `cargo fmt --check` pass.
