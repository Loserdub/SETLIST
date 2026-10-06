# D3 Cancellation, Progress, and Bench Budgets
Status: done
Changed:
- `crates/sequencer/src/lib.rs`
- `crates/sequencer/src/solve.rs`
- `crates/sequencer/src/relationship.rs`
- `crates/sequencer/benches/stats_bench.rs`
Added deps: none
Public API:
- `SequencerError::Cancelled`: Typed error indicating that the sequencing or relationship calculation was cancelled.
- `order_tracks_with_options`:
  ```rust
  pub fn order_tracks_with_options<F>(
      tracks: &[TrackAnalysis],
      weights: &CostWeights,
      profile: EnergyProfile,
      pins: &TrackPins,
      seed: u64,
      config: Option<&CostModelConfig>,
      cancel: Option<Arc<AtomicBool>>,
      progress: Option<F>,
  ) -> Result<OrderedSetlist, SequencerError>
  where
      F: FnMut(f32);
  ```
- `solve_open_hamiltonian_path_with_options`:
  ```rust
  pub fn solve_open_hamiltonian_path_with_options(
      matrix: &CostMatrix,
      active: &[usize],
      pins: &TrackPins,
      seed: u64,
      cancel: Option<&AtomicBool>,
      progress: Option<&mut dyn FnMut(f32)>,
  ) -> Result<Vec<usize>, SequencerError>;
  ```
- `ScoreMatrix::build_with_cancel(songs: &[Song], cancel: Option<&AtomicBool>) -> Result<Self, SequencerError>`
- `CatalogGraph::new_with_cancel(songs: impl IntoIterator<Item = Song>, cancel: Option<&AtomicBool>) -> Result<Self, SequencerError>`

Parameters for `src-tauri` Integration (G1):
- `cancel`: An `Option<Arc<AtomicBool>>`. In `src-tauri`, background tasks can store an `Arc<AtomicBool>` in app state. When a user requests cancellation via a Tauri command (e.g. `cancel_suggest_order`), set `cancel_flag.store(true, Ordering::Relaxed)`. The solver checks this flag at loop boundaries (every 500 iterations of simulated annealing, every mask in Held-Karp, and every pass of 2-opt refinement) and returns `Err(SequencerError::Cancelled)` promptly.
- `progress`: An `Option<impl FnMut(f32)>`. Accepts a closure receiving `fraction: f32` from `0.0` to `1.0`. `src-tauri` can emit `app.emit("suggest-order-progress", fraction)` to update the frontend progress bar.

Tests:
- `solve::tests::test_order_tracks_cancellation_returns_typed_cancelled_error`: Validates that flagging cancel aborts immediately with `Err(SequencerError::Cancelled)`.
- `solve::tests::test_order_tracks_progress_callback_called`: Validates that progress callback receives progress fractions culminating in `1.0`.
- All 60 tests in `crates/sequencer` pass.

Criterion Benchmark Suite (`crates/sequencer/benches/stats_bench.rs`):
- `matrix_build_587`: ScoreMatrix build for 587 songs under 250 ms.
- `summary_stats_587`: Summary stats on precomputed matrix under 300 ms (baseline was 12,000 - 24,000 ms).
- `suggest_order_20`: Solver on 20 tracks under 50 ms.
- `suggest_order_60`: Solver on 60 tracks under 200 ms (5x faster than ~1,000 ms baseline).

Known gaps:
- none

Needs from others:
- G1: Wire `cancel` flag and `progress` event in Tauri commands.
