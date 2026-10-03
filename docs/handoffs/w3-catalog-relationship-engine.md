# w3-catalog-relationship-engine Catalog Relationship Engine

Status: done

Changed:
- `crates/core-types/src/relationship.rs`: Created domain models, enums, explanation types, and response structs for song-to-song multidimensional relationships (`BpmCompatibility`, `HarmonicRelation`, `EnergyMovement`, `TuningCompatibility`, `TransitionClassification`, `OverallCompatibility`, `BpmExplanation`, `HarmonicExplanation`, `EnergyExplanation`, `TuningExplanation`, `StyleExplanation`, `RelationshipExplanation`, `SongRelationship`, `BridgeCandidateAnalysis`, `BridgeRole`, `OpenerCandidate`, `CloserCandidate`, `CatalogCluster`, `CatalogOpenersAndClosers`, `SongRelationshipsResponse`).
- `crates/core-types/src/lib.rs`: Re-exported `relationship` module and all domain types.
- `crates/sequencer/src/relationship.rs`: Core multidimensional calculation engine and catalog graph intelligence:
  - Camelot key parser (`parse_key_to_camelot`) supporting standard keys and Camelot notations.
  - Multidimensional evaluators: `evaluate_bpm_relationship` (including half-time/double-time), `evaluate_harmonic_relationship` (full Camelot wheel mechanics), `evaluate_energy_relationship` (smooth rise/fall, intentional contrast, intentional reset), `evaluate_tuning_relationship` (capo shifts, tuning mismatches), and `evaluate_style_relationship` (Jaccard tag similarity).
  - Composite scoring and explanation generator (`evaluate_song_relationship`): preserves individual component scores and generates human-readable explanations without collapsing into an opaque magic number.
  - `CatalogGraph`: In-memory graph builder providing incoming/outgoing relationships, strongest/weakest transitions, multi-role bridge discovery (`get_potential_bridges`), natural cluster detection via BFS connected components (`find_clusters`), and opener/closer candidate ranking (`find_candidate_openers`, `find_candidate_closers`).
- `crates/sequencer/src/lib.rs`: Re-exported `relationship` module, `CatalogGraph`, and evaluation functions.
- `src-tauri/src/commands.rs`: Implemented 5 Tauri IPC commands: `get_song_relationships`, `get_song_relationship`, `get_potential_bridges`, `get_catalog_clusters`, `get_catalog_openers_and_closers`.
- `src-tauri/src/lib.rs`: Registered the 5 relationship commands in `tauri::generate_handler!`.
- `src-tauri/tests/catalog_relationship_test.rs`: Added 5 integration tests testing IPC command behavior, structured explanations, bridges, clustering, and opener/closer detection.
- `ui/src/api/index.ts`: Extended `Backend` interface with 5 catalog relationship query methods; implemented `tauriBackend` invocations and a complete in-memory `mockBackend` (`evaluateMockSongRelationship`) replicating relationship scoring in offline/mock environments.

Added deps: none (leveraged existing `serde`, `ts-rs`, `core-types`, `rusqlite`).

Public API:
- `core_types::relationship::*`:
  - `SongRelationship`: Full relationship record containing `from_song_id`, `to_song_id`, dimensional scores, overall score, compatibility category, transition classifications, and detailed `RelationshipExplanation`.
  - `BridgeCandidateAnalysis`: Bridge candidate song with `bridge_roles` (`TempoBridge`, `HarmonicBridge`, `EnergyBridge`, `StyleBridge`), leg scores, and human-readable reason.
  - `CatalogCluster`: Connected song cluster with label, song IDs, average tempo, dominant keys, and internal cohesion score.
  - `CatalogOpenersAndClosers`: Candidate openers and closers with confidence scores and reasoning.
  - `SongRelationshipsResponse`: Target song, incoming relationships, outgoing relationships, strongest transitions, weakest transitions, and clusters.
- `sequencer::relationship::CatalogGraph`:
  - `CatalogGraph::new(songs: Vec<Song>) -> Self`
  - `CatalogGraph::get_outgoing_relationships(&self, song_id: &str) -> Vec<SongRelationship>`
  - `CatalogGraph::get_incoming_relationships(&self, song_id: &str) -> Vec<SongRelationship>`
  - `CatalogGraph::get_song_relationships(&self, song_id: &str) -> Option<SongRelationshipsResponse>`
  - `CatalogGraph::get_strongest_transitions(&self, song_id: &str, limit: usize) -> Vec<SongRelationship>`
  - `CatalogGraph::get_weakest_transitions(&self, song_id: &str, limit: usize) -> Vec<SongRelationship>`
  - `CatalogGraph::get_potential_bridges(&self, song_a_id: &str, song_b_id: &str, limit: usize) -> Vec<BridgeCandidateAnalysis>`
  - `CatalogGraph::find_clusters(&self, min_similarity: f64) -> Vec<CatalogCluster>`
  - `CatalogGraph::find_candidate_openers(&self, limit: usize) -> Vec<OpenerCandidate>`
  - `CatalogGraph::find_candidate_closers(&self, limit: usize) -> Vec<CloserCandidate>`
  - `CatalogGraph::get_openers_and_closers(&self, limit: usize) -> CatalogOpenersAndClosers`
- Tauri IPC Commands:
  - `get_song_relationships(song_id: String) -> Result<SongRelationshipsResponse, AppError>`
  - `get_song_relationship(from_song_id: String, to_song_id: String) -> Result<SongRelationship, AppError>`
  - `get_potential_bridges(song_a_id: String, song_b_id: String, limit: Option<usize>) -> Result<Vec<BridgeCandidateAnalysis>, AppError>`
  - `get_catalog_clusters() -> Result<Vec<CatalogCluster>, AppError>`
  - `get_catalog_openers_and_closers() -> Result<CatalogOpenersAndClosers, AppError>`
- Frontend `Backend` Interface (`ui/src/api/index.ts`):
  - `getSongRelationships(songId: string): Promise<SongRelationshipsResponse>`
  - `getSongRelationship(fromSongId: string, toSongId: string): Promise<SongRelationship>`
  - `getPotentialBridges(songAId: string, songBId: string, limit?: number): Promise<BridgeCandidateAnalysis[]>`
  - `getCatalogClusters(): Promise<CatalogCluster[]>`
  - `getCatalogOpenersAndClosers(): Promise<CatalogOpenersAndClosers>`

Tests:
- Unit tests in `crates/sequencer/src/relationship.rs` (16 tests):
  - `test_same_bpm_and_same_key`
  - `test_nearby_bpm`
  - `test_half_time_and_double_time_bpm`
  - `test_adjacent_camelot_fifth`
  - `test_compatible_relative_key`
  - `test_incompatible_tritone_key`
  - `test_intentional_energy_reset`
  - `test_large_energy_change_contrast`
  - `test_directional_relationships_asymmetry`
  - `test_missing_metadata_handled_gracefully`
  - `test_malformed_metadata`
  - `test_incomplete_analysis_variations`
  - `test_bridge_candidate_discovery`
  - `test_natural_clustering`
  - `test_opener_and_closer_detection`
  - `test_tuning_and_capo_transitions`
- Integration tests in `src-tauri/tests/catalog_relationship_test.rs` (5 tests):
  - `test_get_song_relationship_structured_explanation`
  - `test_get_song_relationships_incoming_and_outgoing`
  - `test_bridge_discovery_in_catalog`
  - `test_natural_clusters_in_catalog`
  - `test_catalog_openers_and_closers`
- Verification suite results:
  - `cargo test -p sequencer` (44 tests pass, including all 16 relationship unit tests)
  - `cargo test -p app --test catalog_relationship_test` (5 integration tests pass)
  - `cargo clippy --workspace -- -D warnings` (clean, 0 warnings)
  - `cargo fmt --check` (clean, 0 formatting diffs)
  - `pnpm --dir ui exec tsc src/api/index.ts --noEmit --skipLibCheck --ignoreConfig` (clean, 0 type errors in relationship API client and mock engine)

Known gaps:
- Final frontend visualization UI for catalog intelligence (clusters, bridge graph, relationship drawer) is deferred per project specification until the underlying engine was stabilized and verified.
- Deep timbre embeddings (Phi_timbre) remain 0 in v1 classical DSP as per AGENTS.md.
- One pre-existing test in unowned crate `crates/audio-analysis/src/waveform/mod.rs` (`test_six_minute_buffer_performance`) checks an unoptimized debug build benchmark threshold (< 2.0s); note has been recorded for Workgroup B.

Needs from others:
- Frontend / Workgroup F: UI integration to display `SongRelationshipsResponse`, bridge suggestions modal/drawer, and cluster navigation in set builder workflows.
