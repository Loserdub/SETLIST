# w5-set-builder Central Creative Set Builder Workspace

Status: done

## Summary
Transformed the setlist builder into a tactile, central creative workspace that embodies a physical hardware/dubplate sequence rather than a spreadsheet. The workspace supports selecting tracks, defining constraints (target duration, energy profile, pinned opener/closer, exclusions, and preferred transition weight presets), generating sequences via the classical DSP solver, inspecting musical relationships without opaque AI scores, manually reordering and auditioning tracks, and selectively regenerating unlocked segments.

## Changed Files
- `ui/src/features/setlist/roles.ts` (new): Pure domain functions computing musical track roles (`computeTrackRole`), cumulative timecode intervals (`computeCumulativeTimeline`), human-readable duration formatting (`formatDurationMs`), and transition friction categories (`classifyTransitionCost`).
- `ui/src/features/setlist/roles.test.ts` (new): 14 unit tests validating role assignments across arc positions, duration interval summation, and cost classification.
- `ui/src/features/setlist/types.ts`: Extended type definitions with `pinnedIds`, `excludedIds`, `PreferredTransitionPreset`, `BridgeCandidateResult`, and role/verdict types.
- `ui/src/features/setlist/reorder.ts`: Enhanced `applyPinsToOrderedIds` to support arbitrary pinned IDs while preserving backward-compatibility for opener/closer pins.
- `ui/src/features/setlist/ConstraintCockpit.tsx` (new): Upper workspace cockpit supporting target duration selection (30m, 45m, 60m, 90m, 120m), visual duration gauge, energy profiles (Linear Ramp, Wave, Plateau), Opener/Closer locking toggles, transition weight presets (Balanced, Harmonic, Energy, Tempo), and selective regeneration.
- `ui/src/features/setlist/SortableTrackItem.tsx`: Completely redesigned physical track card module with modular aesthetic, visible `TRACK`, `KEY`, `BPM`, `ENERGY`, `ROLE` badge, cumulative timeline intervals (`[00:00 - 04:30]`), direct pin/unpin toggles, audition play/pause, move up/down controls, and "Re-sequence from here" action.
- `ui/src/features/setlist/TransitionCostBadge.tsx`: Redesigned between-track relationship display showing exact Key, BPM, and Energy shifts, clear musical verdict (`LOW COST`, `MODERATE SHIFT`, `HIGH COST`), and 1-click `🪄 Find Bridge` modal trigger.
- `ui/src/features/setlist/BridgeFinderModal.tsx` (new): Bridge discovery dialog calculating intermediate transitions (`A → Bridge → B`) across library tracks with musical role classification (Harmonic Bridge, Tempo Bridge, Energy Stepper) and direct setlist insertion.
- `ui/src/features/setlist/TrackSelectionDrawer.tsx` (new): Slide-out library track selection drawer with target duration progress meter, live search, key and BPM range filters, instant audition playback, and "+ Add" / "In Set" status toggles.
- `ui/src/features/setlist/SetlistView.tsx`: Central creative workspace integrating the cockpit, track drawer, bridge modal, physical sequence bus rail, and export safety controls.
- `ui/src/features/setlist/index.ts`: Re-exported components, roles, and types for setlist features.
- `ui/src/components/icons/Icons.tsx`: Added accessible SVG icons: `IconPin`, `IconLock`, `IconUnlock`, `IconClock`, `IconPlus`.
- `ui/src/features/setlist/SetlistView.test.tsx`: Expanded integration test suite with 6 new integration tests (14 tests total).

## Added Dependencies
None. Uses existing project dependencies (`lucide-react` / internal SVG icons, Tailwind CSS, `@dnd-kit`, Zustand store, and pure DSP cost calculations).

## Public API & Components
- `computeTrackRole(index: number, total: number, energy: number, isOpenerLocked: boolean, isCloserLocked: boolean): TrackMusicalRole`
- `computeCumulativeTimeline(items: { trackId: string; durationMs: number }[]): Map<string, { startMs: number; endMs: number }>`
- `classifyTransitionCost(cost: number): TransitionVerdict`
- `ConstraintCockpit`: `<ConstraintCockpit ... />`
- `SortableTrackItem`: `<SortableTrackItem ... />`
- `TransitionCostBadge`: `<TransitionCostBadge ... />`
- `TrackSelectionDrawer`: `<TrackSelectionDrawer ... />`
- `BridgeFinderModal`: `<BridgeFinderModal ... />`

## Tests
- `cargo test --workspace`: 294+ Rust tests passing.
- `cargo clippy --workspace -- -D warnings`: 0 warnings, clean.
- `cargo fmt --check`: 0 formatting issues.
- `pnpm --dir ui typecheck`: 0 errors.
- `pnpm --dir ui test`: 35 test files, 431 tests passing (including 94 setlist feature tests).

## Known Gaps
None for v1. Offline classical DSP cost model and catalog relationship evaluation are utilized directly. Timbre embedding matching remains scheduled for post-v1 as specified in AGENTS.md.

## Needs From Others
None. All components are self-contained and wired into `SetlistView.tsx`.
