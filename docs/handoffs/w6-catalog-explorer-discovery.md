# w6-catalog-explorer-discovery Catalog Explorer + Set Discovery Layer

Status: done

Changed:
- `crates/core-types/src/relationship.rs`: Added domain models for catalog discovery: `CatalogOutlier`, `DiscoveryCandidatePath`, `DiscoveryConstraints`, and `CatalogSummaryStats` with `ts-rs` type generation.
- `crates/core-types/src/lib.rs`: Re-exported discovery domain models.
- `crates/sequencer/src/relationship.rs`: Added graph traversal and discovery algorithms to `CatalogGraph`:
  - `find_outliers(min_similarity)`: Identifies catalog outliers/islands with explicit structural diagnostic reasons (e.g. tempo/key/energy isolation, missing metadata).
  - `get_unusual_transitions(song_id, limit)`: Surfaces creative contrast moves (harmonic lifts, energy resets, half/double-time pivots, hard transitions).
  - `get_catalog_summary_stats()`: Computes total songs, connections, density, average transitions per song, and identified clusters.
  - `find_candidate_paths(constraints)`: Deterministic graph pathfinder supporting duration targets (with tolerance), start song anchors, end song anchors, and must-include requirements.
- `src-tauri/src/commands.rs`: Implemented 4 new discovery Tauri IPC commands: `get_catalog_outliers`, `get_unusual_transitions`, `get_catalog_summary_stats`, `explore_candidate_paths`.
- `src-tauri/src/lib.rs`: Registered new discovery commands in the Tauri command handler.
- `src-tauri/tests/catalog_relationship_test.rs`: Added integration test coverage for outliers, unusual transitions, catalog summary stats, and duration/constraint pathfinding.
- `ui/src/bindings/`: Generated updated TypeScript definitions (`CatalogOutlier.ts`, `DiscoveryCandidatePath.ts`, `DiscoveryConstraints.ts`, `CatalogSummaryStats.ts`).
- `ui/src/api/index.ts`: Extended `Backend` interface with discovery methods (`getCatalogOutliers`, `getUnusualTransitions`, `getCatalogSummaryStats`, `exploreCandidatePaths`) and added mock implementations with mock path generation and outlier detection.
- `ui/src/store/useAppStore.ts`: Added `'discovery'` route to active routes and state management.
- `ui/src/components/Sidebar.tsx`: Added "Discovery" navigation button with Compass icon.
- `ui/src/App.tsx`: Wired up `DiscoveryRoute` view switcher.
- `ui/src/components/routes/DiscoveryRoute.tsx`: Added lazy/direct route wrapper for the Discovery feature.
- `ui/src/features/discovery/`: Created discovery components:
  - `CatalogExplorerView.tsx`: Main discovery hub with catalog database table, quick relationship badges, search/filter controls, and view toggles (Catalog, Clusters & Outliers, Relational Matrix).
  - `SongRelationshipDrawer.tsx`: Deep-dive inspector for a selected song showing outgoing ("What can follow this"), incoming ("What can precede this"), and unusual contrast transitions with multi-dimensional score breakdowns (BPM, Harmony, Energy, Tuning, Style), human explanations, and explicit "Add to Setlist" actions.
  - `BridgeDiscoveryModal.tsx`: Two-song bridge finder (`A -> Bridge -> B`) inspecting intermediate transitions, bridge roles (Tempo/Harmonic/Energy/Style Bridge), and direct setlist addition.
  - `PathExplorerModal.tsx`: Step-by-step interactive path builder displaying chained transitions and cumulative duration.
  - `DurationSetDiscoveryModal.tsx`: Duration-aware candidate set exploration with anchor constraints (Start with, End with, Must include) and step-by-step transition inspection.
  - `CatalogClustersView.tsx`: Inspects detected cohesive song clusters and catalog outliers/islands with diagnostic reasons.
  - `CatalogMatrixView.tsx`: Pairwise compatibility heat map for the catalog.
  - `types.ts`: Internal UI discovery view models and state contracts.
- `ui/src/features/discovery/CatalogExplorerView.test.tsx`: Comprehensive UI component testing suite covering catalog table, relationship drawer, bridge discovery modal, path explorer, duration set discovery modal, cluster/outlier tabs, and relational matrix.
- `ui/src/App.test.tsx`: Updated App layout and navigation test to verify 5 primary navigation routes (Library, Discovery, Track, Setlist, Settings).

Added deps: none (built using existing dependencies, Lucide icons, and Tailwind).

Public API:
- `core_types::relationship::*`:
  - `CatalogOutlier`: Struct containing `song: Song`, `strong_connections_count: usize`, and `reason: String`.
  - `DiscoveryCandidatePath`: Candidate setlist path with `songs: Vec<Song>`, `total_duration_ms: f64`, `average_transition_score: f64`, and step-by-step `transitions: Vec<SongRelationship>`.
  - `DiscoveryConstraints`: Path search constraints (`target_duration_ms`, `tolerance_ms`, `start_song_id`, `end_song_id`, `must_include_song_ids`, `max_candidates`).
  - `CatalogSummaryStats`: High-level metrics (`total_songs`, `total_connections`, `average_connections_per_song`, `isolated_songs_count`, `density_percentage`).
- `sequencer::relationship::CatalogGraph`:
  - `CatalogGraph::find_outliers(&self, min_similarity: f64) -> Vec<CatalogOutlier>`
  - `CatalogGraph::get_unusual_transitions(&self, song_id: &str, limit: usize) -> Vec<SongRelationship>`
  - `CatalogGraph::get_catalog_summary_stats(&self) -> CatalogSummaryStats`
  - `CatalogGraph::find_candidate_paths(&self, constraints: DiscoveryConstraints) -> Vec<DiscoveryCandidatePath>`
- Tauri IPC Commands:
  - `get_catalog_outliers(min_similarity: Option<f64>) -> Result<Vec<CatalogOutlier>, AppError>`
  - `get_unusual_transitions(song_id: String, limit: Option<usize>) -> Result<Vec<SongRelationship>, AppError>`
  - `get_catalog_summary_stats() -> Result<CatalogSummaryStats, AppError>`
  - `explore_candidate_paths(constraints: DiscoveryConstraints) -> Result<Vec<DiscoveryCandidatePath>, AppError>`
- Frontend `Backend` Interface (`ui/src/api/index.ts`):
  - `getCatalogOutliers(minSimilarity?: number): Promise<CatalogOutlier[]>`
  - `getUnusualTransitions(songId: string, limit?: number): Promise<SongRelationship[]>`
  - `getCatalogSummaryStats(): Promise<CatalogSummaryStats>`
  - `exploreCandidatePaths(constraints: DiscoveryConstraints): Promise<DiscoveryCandidatePath[]>`

Tests:
- Rust unit tests in `crates/sequencer/src/relationship.rs`:
  - `test_catalog_outliers_detection`
  - `test_unusual_transitions_discovery`
  - `test_catalog_summary_stats`
  - `test_candidate_path_exploration_with_constraints`
  - `test_candidate_path_duration_awareness`
- Rust Tauri integration tests in `src-tauri/tests/catalog_relationship_test.rs`:
  - `test_catalog_outliers_and_unusual_transitions_commands`
  - `test_catalog_summary_stats_and_path_exploration_commands`
- TypeScript Vitest component tests in `ui/src/features/discovery/CatalogExplorerView.test.tsx` (9 tests):
  - Catalog tracks table, metadata, and summary stats rendering
  - Outgoing ("Can Follow") and Incoming ("Can Precede") song drawer inspection
  - Unusual / contrast transitions inspection in drawer
  - BridgeDiscoveryModal route evaluation (`A -> Bridge -> B`)
  - PathExplorerModal step-by-step chaining
  - DurationSetDiscoveryModal duration & anchor constraint discovery
  - Adding candidate sets / individual tracks into active setlist without destructive reordering
  - Clusters & Outliers view
  - Relational matrix view

Known gaps:
- None for Workgroup 6 scope.

Needs from others:
- None.
