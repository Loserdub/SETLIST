# fix-advisor-solver-and-overrides-hydration System Optimization and Bug Fixes

Status: done
Changed:
- `crates/sequencer/src/advisor.rs`
- `crates/sequencer/src/solve.rs`
- `ui/src/App.tsx`
- `ui/src/api/index.ts`
- `ui/src/api/overrides.ts`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/features/track/overrides/OverridePanel.tsx`
- `ui/src/store/useAppStore.ts`
- `ui/src/utils/validation.test.ts`
Added deps: none
Public API:
- `AppState.refreshTrackInSetlist: (freshTrack: Track, backend?: Backend) => Promise<void>`
- `updateMockTrack: (track: Track) => void`
Tests:
- `crates/sequencer/src/advisor.rs`: `test_rule_1_intervention_key_gap_same_bpm_echo_out_freeze` verifying wide harmonic distance with moderate/identical BPM triggers `EchoOutFreeze` with key-specific transition advice rather than a misleading breakdown tempo ramp.
- `crates/sequencer/src/solve.rs`: `test_anchors_always_hold`, `test_order_tracks_keeps_both_anchors_for_n_5_13_40`, `test_same_seed_gives_same_result` verifying dynamic trajectory refinement against `Wave` and `PeakPlateau` energy curves while strictly preserving locked start and end anchors.
- `ui/src/utils/validation.test.ts`:
  - `re-links track details in active setlist when loadTracks completes after setlist load` verifying track entity restoration upon asynchronous library load.
  - `refreshTrackInSetlist updates track in setlist and recomputes transition advice for adjacent tracks` verifying that modifying a track's overrides updates its reference in the setlist and triggers background recomputation of incoming and outgoing transition advice.
- Full workspace test pass:
  - `cargo test --workspace` (all 164 unit and integration tests passed)
  - `cargo clippy --workspace -- -D warnings` (passed with 0 warnings)
  - `cargo fmt --check` (passed)
  - `pnpm --dir ui typecheck` (passed with 0 errors)
  - `pnpm --dir ui test --run` (24 test suites, 287 unit tests passed)

Known gaps: none
Needs from others: none
