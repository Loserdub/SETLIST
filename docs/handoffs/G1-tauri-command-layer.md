# G1-tauri-command-layer Tauri Command Layer Remediation and Caching
Status: done
Changed:
- `crates/sequencer/src/lib.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/src/state.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/playback.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/tests/concurrency_test.rs`
- `ui/src/api/playback.ts`
- `docs/handoffs/G1-tauri-command-layer.md`

Added deps:
- `tokio = { version = "1", features = ["rt-multi-thread"] }` in `src-tauri/Cargo.toml` for `tokio::task::spawn_blocking` across compute-heavy commands.

Public API:
- `app_lib::commands`:
  - `pub fn get_or_build_catalog_graph(state: &AppState) -> Result<Arc<CatalogGraph>, AppError>`: Retrieves cached CatalogGraph if catalog_revision matches, or builds it with Rayon without holding the SQLite database mutex.
  - `pub async fn get_catalog_summary_stats(state: State<'_, AppState>) -> Result<CatalogSummaryStats, AppError>`
  - `pub async fn get_catalog_clusters(state: State<'_, AppState>) -> Result<Vec<CatalogCluster>, AppError>`
  - `pub async fn get_catalog_outliers(state: State<'_, AppState>) -> Result<Vec<CatalogOutlier>, AppError>`
  - `pub async fn get_song_relationships(state: State<'_, AppState>, song_id: String) -> Result<SongRelationshipsResponse, AppError>`
  - `pub async fn get_song_relationship(state: State<'_, AppState>, from_song_id: String, to_song_id: String) -> Result<SongRelationship, AppError>`
  - `pub async fn get_potential_bridges(state: State<'_, AppState>, song_a_id: String, song_b_id: String, limit: Option<usize>) -> Result<Vec<BridgeCandidateAnalysis>, AppError>`
  - `pub async fn get_unusual_transitions(state: State<'_, AppState>, song_id: String, limit: Option<usize>) -> Result<Vec<SongRelationship>, AppError>`
  - `pub async fn explore_candidate_paths(state: State<'_, AppState>, constraints: DiscoveryConstraints) -> Result<Vec<DiscoveryCandidatePath>, AppError>`
  - `pub async fn suggest_order(app: AppHandle, state: State<'_, AppState>, track_ids: Option<Vec<String>>, profile: Option<EnergyProfile>, weights: Option<CostWeights>, first_id: Option<String>, last_id: Option<String>) -> Result<Vec<SetlistEntry>, String>`
  - `pub fn cancel_suggest_order(state: State<'_, AppState>) -> Result<(), String>`
- `app_lib::playback`:
  - `pub fn playback_stop_core() -> Result<(), String>`
  - `pub async fn playback_stop(app: AppHandle) -> Result<(), String>`

Tests:
- `src-tauri/tests/concurrency_test.rs`:
  - `test_catalog_graph_cache_and_invalidation`: Cold build computes and stores ScoreMatrix in cache; warm lookup returns in under 2ms (<15ms budget) with identical Arc pointer; revision bump invalidates cache.
  - `test_heavy_compute_does_not_block_concurrent_commands`: Proves that during background 60-track `suggest_order`, concurrent volume changes and read queries take <0.5ms (budget: 50ms).
- All 5 workspace quality gates pass cleanly:
  - `cargo test --workspace` (all 311+ tests pass)
  - `cargo clippy --workspace -- -D warnings` (clean)
  - `cargo fmt --check` (clean)
  - `pnpm --dir ui typecheck` (clean with 0 errors and 0 hex tokens)
  - `pnpm --dir ui test` (47 files, 506 tests pass)

Known gaps: none.

Needs from others:
- Task G3: Reconcile docs and MANIFEST.md.
- Task G4: Release and archive tooling (`build_archive.ps1`).
- Task G5: Final verification.
