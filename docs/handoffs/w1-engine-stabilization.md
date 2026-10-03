# w1-engine-stabilization SETLIST Engine Stabilization
Status: done
Changed:
- crates/core-types/src/types.rs
- crates/sequencer/src/advisor.rs
- src-tauri/src/commands.rs
- src-tauri/tests/integration_test.rs
- src-tauri/tests/export_safety_test.rs
- ui/src/bindings/TransitionAdvice.ts
- ui/src/bindings/ExportResult.ts
- ui/src/features/setlist/costModel.ts
- ui/src/features/setlist/costModel.test.ts
- ui/src/features/setlist/TransitionCostBadge.tsx
- ui/src/features/setlist/TransitionAdviceModal.tsx
- ui/src/features/setlist/energyCurve.ts
- ui/src/features/setlist/reorder.ts
- ui/src/features/setlist/pinLifecycle.test.ts
- ui/src/features/setlist/raceCondition.test.tsx
- ui/src/features/setlist/exportSafety.test.tsx
- ui/src/features/setlist/SetlistView.tsx
- ui/src/features/setlist/SetlistView.test.tsx
- ui/src/api/index.ts
- ui/src/api/index.test.ts
- ui/src/api/mockParity.test.ts
- ui/src/store/useAppStore.ts

Added deps: none

Public API:
- `core_types::TransitionAdvice`: added `total_cost`, `tempo_cost`, `key_cost`, `energy_cost`, `timbre_cost`, `de_target`, `weights`, `profile` fields.
- `core_types::ExportResult`: `{ path: String, format: ExportTarget, track_count: usize }`.
- `sequencer::advisor::advise_with_cost(&TrackAnalysis, &TrackAnalysis, Option<EnergyProfile>, Option<CostWeights>, Option<f32>) -> TransitionAdvice`
- `sequencer::advisor::advise_transition_with_cost(&Track, &Track, Option<EnergyProfile>, Option<CostWeights>, Option<f32>) -> TransitionAdvice`
- `src-tauri::commands::export_set_core(entries, target, dest_path, overwrite, on_progress) -> Result<ExportResult, String>`
- `src-tauri::commands::export_set(app, state, entries, target, output_path, overwrite) -> Result<ExportResult, String>`
- `ui::recalculateSetlistTargetEnergy(entries: SetlistEntry[], profile: EnergyProfile): SetlistEntry[]`
- `ui::validatePins(totalCount: number, pins: SetlistPins): SetlistPins`
- `ui::Backend::exportSet(entries, target, outputPath?, overwrite?): Promise<ExportResult>`
- `ui::useAppStore::exportSetlist(target, outputPath?, overwrite?, backend?): Promise<ExportResult>`

Tests:
- `crates/sequencer/src/advisor.rs`: `test_advise_with_cost_affects_total_and_weights`
- `src-tauri/tests/export_safety_test.rs`:
  - `test_export_prevents_silent_overwrite`
  - `test_export_allows_explicit_overwrite`
  - `test_export_returns_structured_result_all_formats`
  - `test_export_creates_nested_parent_directories`
- `src-tauri/tests/integration_test.rs`: updated to verify `ExportResult` for RekordboxXml, M3u8, SetSheetCsv, SetSheetMarkdown.
- `ui/src/features/setlist/costModel.test.ts`: cost breakdown, weight sensitivity, energy curve dE_target impact, missing analysis handling.
- `ui/src/features/setlist/pinLifecycle.test.ts`: pin reset on clear, load, replace, opener/closer removal, shrinking to <=1 track.
- `ui/src/features/setlist/raceCondition.test.tsx`: stale suggest order discard, synchronous drag-reorder resilience, stale advice discard.
- `ui/src/api/mockParity.test.ts`: mock/Rust parity for track preservation, deduplication, deterministic order, unanalyzed track handling, position-derived target energy.
- `ui/src/features/setlist/exportSafety.test.tsx`: structured ExportResult display, cancellation without export, custom destination, overwrite flag enforcement.

Known gaps: none. All stabilization requirements satisfied.

Needs from others: none.
