# w10-motion-interaction-polish Motion + Interaction Polish
Status: done
Changed:
- ui/src/index.css
- ui/src/components/Sidebar.tsx
- ui/src/features/setlist/SortableTrackItem.tsx
- ui/src/features/setlist/TransitionCostBadge.tsx
- ui/src/features/library/LibraryView.tsx
- ui/src/features/track/PlaybackBar.tsx
- ui/src/features/track/cues/FourPointCueDeck.tsx
- ui/src/features/track/cues/FourPointCueChips.tsx
- ui/src/features/stage/StageMode.tsx
- ui/src/features/interaction/interactionPolish.test.tsx
- crates/library-db/src/repo.rs (cargo fmt)

Added deps: none

Public API:
- CSS Tokens:
  - `--ease-mechanical: cubic-bezier(0.2, 0, 0, 1)`
  - `--ease-snap: cubic-bezier(0, 0, 0.2, 1)`
  - `--dur-instant: 60ms`
  - `--dur-tactile: 90ms`
  - `--dur-snap: 140ms`
- Control Surface Classes:
  - `.hw-btn`: Tactile hardware push-button with 1px mechanical depression (`:active { transform: translateY(1px); }`) and instant duration (60ms).
  - `.hw-pad`: Tactile performance trigger pad with tactile depression (`:active { transform: translateY(1px) scale(0.97); }`).
  - `.hw-row`: Table channel strip with hover and latch state (`.is-active`).
  - `.hw-track-card`: Modular cassette rack object feel with elevation on drag (`scale(1.01)` and high-contrast drop shadow).
  - `.hw-coupler`: Interlocking hardware coupler representing transition events between tracks.
  - `.hw-led`: Sharp indicator LED with glowing states (`.hw-led-cyan`, `.hw-led-active`, `.hw-led-warn`).
- Accessibility:
  - `@media (prefers-reduced-motion: reduce)` zeroes transitions and disables transforms.
  - Enforced minimum 12px text rule throughout touched views.

Tests:
- `ui/src/features/interaction/interactionPolish.test.tsx` (7 tests):
  - Mechanical easing curve tokens and rapid tactile duration variables.
  - Control surface CSS primitives (`.hw-btn`, `.hw-pad`, `.hw-row`, `.hw-track-card`, `.hw-coupler`, `.hw-led`).
  - prefers-reduced-motion safety overrides.
  - Sidebar tactile navigation buttons and illuminated cyan LED latch.
  - TransitionCostBadge hardware coupler interlock and tactile button.
  - PlaybackBar mechanical transport controls and illuminated LED indicator without soft pulse.
  - FourPointCueDeck tactile pad triggers and action buttons.
  - FourPointCueChips tactile interactive chips with compliant >=12px font sizes.
- Full UI suite: 44 test files, 484 tests passing.
- Workspace Rust suite: 295 unit and integration tests passing.
- `cargo clippy --workspace -- -D warnings`: 0 warnings.
- `cargo fmt --check`: cleanly formatted.
- `pnpm --dir ui typecheck`: 0 TypeScript errors.

Known gaps:
- none

Needs from others:
- none
