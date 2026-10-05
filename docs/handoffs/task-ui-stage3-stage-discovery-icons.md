# task-ui-stage3-stage-discovery-icons UI & UX Final Stage: Stage Mode Touch Ergonomics, Discovery Side-Rail, and Vector Icon Suite

Status: done

Changed:
- `ui/src/components/icons/Icons.tsx`
- `ui/src/components/icons/index.ts`
- `ui/src/features/stage/StageMode.tsx`
- `ui/src/features/stage/StageModeErgonomics.test.tsx`
- `ui/src/features/discovery/CatalogExplorerView.tsx`
- `ui/src/features/discovery/SongRelationshipDrawer.tsx`
- `ui/src/features/setlist/SortableTrackItem.tsx`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/components/transport/GlobalTransportBar.tsx`
- `ui/src/features/library/LibraryView.tsx`

Added deps: none (pure SVG vector icons, zero bundle bloat)

Public API:
- `ui/src/components/icons/`: Pure SVG icon components including `IconPlay`, `IconPause`, `IconStop`, `IconPrev`, `IconNext`, `IconGripVertical`, `IconArrowUp`, `IconArrowDown`, `IconArrowUpDown`, `IconUndo`, `IconRedo`, `IconAlertTriangle`, `IconCheck`, `IconClose`, `IconSearch`, `IconExternalLink`, `IconSliders`, and `IconSparkles`.
- `SongRelationshipDrawerProps.isDockedRail?: boolean`: Optional docked side-rail mode rendering without an obstructing modal overlay backdrop.

Tests:
- `ui/src/features/stage/StageModeErgonomics.test.tsx`:
  - 56px+ touch target verification on `[ PREV ]` and `[ NEXT ]` buttons.
  - Screen corner button separation to prevent live DJ backward jumping errors.
  - Multi-line title scaling and `line-clamp-2` + `break-words` text truncation protection.
  - High-visibility hazard indicator styling (`border-amber-500/80 bg-amber-950/40 text-amber-300`) with pulsing warning dot for transitions requiring intervention.
- `ui/src/features/stage/StageMode.test.tsx`: 10 stage mode tests passing.
- `ui/src/features/discovery/CatalogExplorerView.test.tsx`: 9 discovery tests passing with side-by-side split inspection rail.
- Full UI suite: 27 test files, 310 tests passing (`pnpm --dir ui test`).
- Full Workspace suite: 55 sequencer tests, 23 db tests, 9 playback tests, 5 exporter tests, 7 validation tests passing (`cargo test --workspace`).
- Clippy & formatting checks passing with 0 warnings (`cargo clippy --workspace -- -D warnings`, `cargo fmt --check`).
- Strict TypeScript typechecking passing with 0 errors (`pnpm --dir ui typecheck`).

Known gaps: none

Needs from others: none
