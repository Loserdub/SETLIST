# F4 Setlist Builder and Tuner
Status: done
Changed:
- `ui/package.json`
- `ui/pnpm-lock.yaml`
- `ui/src/features/setlist/types.ts`
- `ui/src/features/setlist/reorder.ts`
- `ui/src/features/setlist/energyCurve.ts`
- `ui/src/features/setlist/costModel.ts`
- `ui/src/features/setlist/SortableTrackItem.tsx`
- `ui/src/features/setlist/TransitionCostBadge.tsx`
- `ui/src/features/setlist/TransitionAdviceModal.tsx`
- `ui/src/features/setlist/EnergyChart.tsx`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/features/setlist/index.ts`
- `ui/src/features/setlist/pure.test.ts`
- `ui/src/features/setlist/SetlistView.test.tsx`
- `ui/src/components/routes/SetlistRoute.tsx`

Added deps:
- `@dnd-kit/core`: Accessible drag-and-drop toolkit core primitives and sensors.
- `@dnd-kit/sortable`: Vertical list sorting strategy and sorting hooks for setlist reordering.
- `@dnd-kit/utilities`: Transform and transition CSS utility helpers for drag interactions.

Public API:
- `SetlistView`: `React.FC<{ customBackend?: Backend }>`
- `SortableTrackItem`: Sortable track card with drag handle, opener/closer lock toggles, Camelot badge, BPM, energy meter, and actions.
- `TransitionCostBadge`: Transition badge rendering cost terms ($\Phi_{\text{tempo}}$, $\Phi_{\text{key}}$, $\Phi_{\text{energy}}$, total cost) and launching advice modal.
- `TransitionAdviceModal`: Modal drawer presenting detailed harmonic alignment, cue strategies, and transition notes.
- `EnergyChart`: SVG visualization comparing setlist energy trajectory against target curve.
- `arrayMove<T>(array: T[], from: number, to: number): T[]`
- `isMovePermitted(fromIndex: number, toIndex: number, totalCount: number, pins: SetlistPins): boolean`
- `reorderSetlistEntries(entries: SetlistEntry[], fromIndex: number, toIndex: number, pins?: SetlistPins): SetlistEntry[]`
- `applyPinsToOrderedIds(originalIds: string[], suggestedIds: string[], pins: SetlistPins): string[]`
- `getTargetEnergy(profile: EnergyProfile, k: number, n: number): number`
- `computeEnergyTrajectory(entries: SetlistEntry[], profile: EnergyProfile): EnergyPoint[]`
- `computePhiTempo(bpmA: number, bpmB: number): number`
- `computePhiKey(circularDist: number, modeFlip: boolean): number`
- `computePhiEnergy(energyA: number, energyB: number, dETarget?: number): number`
- `computeTransitionCost(fromTrack: Track | null, toTrack: Track | null, advice?: TransitionAdvice | null, dETarget?: number, weights?: CostWeights): TransitionCostBreakdown`

Tests:
- `ui/src/features/setlist/pure.test.ts` (32 tests):
  - Pure array reordering forward, backward, identity.
  - Pin constraint validation for lockFirst, lockLast, and combined pins.
  - Setlist position re-indexing with pin enforcement.
  - Anchor preservation on sequencer suggested order (`applyPinsToOrderedIds`).
  - Target energy curves for `LinearRamp`, `Wave`, and `PeakPlateau` matching `crates/sequencer/src/profiles.rs`.
  - Cost model sub-terms ($\Phi_{\text{tempo}}$, $\Phi_{\text{key}}$, $\Phi_{\text{energy}}$, total cost) matching AGENTS.md Section 6.3.
- `ui/src/features/setlist/SetlistView.test.tsx` (7 tests):
  - Empty state rendering and "Load Sample Tracks" initialization.
  - Track cards, energy chart SVG, and transition badges rendering.
  - Interactive transition advice modal open and close flow.
  - Energy profile switching between Linear Ramp, Wave, and Plateau.
  - Lock opener and closer pin toggling.
  - "Suggest Order" trigger and sequence update.
  - Export flow with target selection (`M3u8`, `RekordboxXml`, `SetSheetMarkdown`, `SetSheetCsv`) and user status feedback.

Known gaps:
- None for v1 flow. Connects directly to `mockBackend` or Tauri backend when available.

Needs from others:
- Integration with Tauri backend commands when native Rust backend wiring is activated.
