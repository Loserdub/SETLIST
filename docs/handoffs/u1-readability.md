# u1-readability UI Readable Text Sizes and Contrast

Status: done

## Summary
Standardized typography and raised text contrast across the SETLIST desktop UI to satisfy WCAG AA requirements and ensure high readability in stage and performance environments.

- **Tiny-text classes before**: 314 (`text-[7px]`, `text-[7.5px]`, `text-[8px]`, `text-[9px]`, `text-[10px]`, `text-[11px]`)
- **Tiny-text classes after**: 0 (all text sizes strictly meet or exceed the 12px minimum)
- **Minimum font size**: 12px (`text-xs`), with body text at 14px (`text-sm`), and headings larger.
- **Contrast elevation**:
  - Elevated primary text to at least `#cfcfcf` (and `#ededed` / `#ffffff`).
  - Elevated secondary / muted text to at least `#a8a8a8` (contrast >= 4.5:1 against dark backgrounds).
  - Preserved TRUSTNODELOGIC corner copyright/version footer stamp while raising contrast from `#404040` (opacity 40) to `#a8a8a8` / `#ededed` (opacity 75-100).
  - Maintained all legal notices verbatim.
- **Heading casing & letter spacing**: Cut all-caps and wide tracking on long descriptive labels while retaining uppercase styling only on short headings.
- **Window size**: Set minimum window dimensions of `1000` x `640` in `src-tauri/tauri.conf.json`. Verified all screens, drawers, tables, and modals do not clip or overflow at 1000px width.
- **Keyboard focus rings**: Added global visible focus rings (`#38bdf8`, 2px solid, outline-offset 1px) and explicit interactive focus styles on buttons, inputs, selects, table rows, and modal dialogs.

## Changed Files
- `src-tauri/tauri.conf.json`
- `ui/src/index.css`
- `ui/src/App.tsx`
- `ui/src/components/Sidebar.tsx`
- `ui/src/components/ToastContainer.tsx`
- `ui/src/components/routes/SettingsRoute.tsx`
- `ui/src/components/waveform/WaveformCanvas.tsx`
- `ui/src/components/waveform/WaveformContainer.tsx`
- `ui/src/components/waveform/WaveformMinimap.tsx`
- `ui/src/features/discovery/BridgeDiscoveryModal.tsx`
- `ui/src/features/discovery/CatalogClustersView.tsx`
- `ui/src/features/discovery/CatalogExplorerView.tsx`
- `ui/src/features/discovery/CatalogMatrixView.tsx`
- `ui/src/features/discovery/DurationSetDiscoveryModal.tsx`
- `ui/src/features/discovery/PathExplorerModal.tsx`
- `ui/src/features/discovery/SongRelationshipDrawer.tsx`
- `ui/src/features/library/LibraryView.tsx`
- `ui/src/features/setlist/EnergyChart.tsx`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/features/setlist/SortableTrackItem.tsx`
- `ui/src/features/setlist/TransitionAdviceModal.tsx`
- `ui/src/features/setlist/TransitionCostBadge.tsx`
- `ui/src/features/stage/StageMode.tsx`
- `ui/src/features/track/PlaybackBar.tsx`
- `ui/src/features/track/TrackView.tsx`
- `ui/src/features/track/overrides/EditedBadge.tsx`
- `ui/src/features/track/overrides/OverridePanel.tsx`
- `docs/handoffs/u1-readability.md`

## Added deps
None.

## Public API
No contract changes. Pure styling and CSS variable enhancements.

## Tests
- Baseline verified:
  - Rust tests: 294 passed (`cargo test --workspace`)
  - UI tests: 317 passed across 28 test suites (`pnpm --dir ui test`)
  - `cargo clippy --workspace -- -D warnings`: passed
  - `cargo fmt --check`: passed
  - `pnpm --dir ui typecheck`: passed
- Zero tiny-text validation confirmed via scanner script across all files in `ui/src` (excluding `ui/src/features/start`).

## Known gaps
None.

## Needs from others
None.
