# w7-performance-cues Performance Cue Framework Standardization

Status: done

## Summary
Standardized the canonical four-point cue framework throughout the application:
- **A — INTRO**: First downbeat, rhythm entry, mix-in point (Emerald `#10B981`, Key 1)
- **B — BREAKDOWN**: Melodic breath, percussion drop-out, atmospheric pause (Amber `#F59E0B`, Key 2)
- **C — DROP**: Peak dancefloor energy release, bassline drop (Red `#EF4444`, Key 3)
- **D — MIX OUT**: Outro transition start, mix-out marker (Cyan `#06B6D4`, Key 4)

Built a unified, hardware-inspired architecture ensuring cues are easy to inspect, move, audition, delete, regenerate, and override, with clear visual distinction between automatically suggested cues and user-confirmed overrides across Track View, Waveform Displays, Transition Alignment / Rehearsal View, Setlist Builder, Live Stage HUD, and Exporters.

## Changed:
- `ui/src/features/track/cues/fourPointCues.ts` (CREATED): Canonical types (`PerformanceCueSlot`, `PerformanceCueRole`, `PerformanceCue`), configuration (`FOUR_POINT_CUE_CONFIG`), resolver (`resolveFourPointCues`), override status helpers (`isSuggested`, `isConfirmed`), beat nudging, playhead snapping, and serialization.
- `ui/src/features/track/cues/FourPointCueDeck.tsx` (CREATED): Hardware-styled tactile 4-pad cue deck with play audition, beat nudge (-1/+1 beat), playhead snapping, delete, confirm/lock, regenerate canonical cues, revert to analysis, and extended register fallbacks.
- `ui/src/features/track/cues/FourPointCueChips.tsx` (CREATED): Universal compact cue chip component with timestamps, canonical colors, and suggested vs confirmed indicators.
- `ui/src/features/track/cues/index.ts` (CREATED): Public barrel export for cue framework.
- `ui/src/features/track/cues/fourPointCues.test.ts` (CREATED): Unit test suite for cue resolution, role mapping, 8-cue conversion, and nudging.
- `ui/src/features/track/cues/FourPointCueDeck.test.tsx` (CREATED): Component test suite for pad actions, audition, overrides, and hotkeys.
- `ui/src/features/track/TrackView.tsx`: Integrated `FourPointCueDeck`, hotkeys 1-4 for instant cue jumping, and override flag propagation to waveform.
- `ui/src/components/waveform/WaveformCanvas.tsx`: Dashed vertical cue lines for suggested cues, solid lines for confirmed cues, canonical 4-point colors, and tooltip status badges.
- `ui/src/components/waveform/WaveformContainer.tsx`: Forwarded cue override state to canvas.
- `ui/src/components/waveform/WaveformMinimap.tsx`: Updated cue tick markers with canonical four-point colors.
- `ui/src/features/transition/transitionPlan.ts`: Transition ENTER directive resolves Cue B (Breakdown) or Cue A (Intro); OUT directive resolves Cue D (Mix Out); structural markers map canonical roles and colors.
- `ui/src/features/transition/transitionPlan.test.ts`: Added test verifying 4-point cue framework integration in performance plans.
- `ui/src/features/transition/DualDeckWaveform.tsx`: Integrated `FourPointCueChips` in Deck A and Deck B headers with instant audition, plus canonical cue colors and styling on structural waveforms.
- `ui/src/features/setlist/SortableTrackItem.tsx`: Added `FourPointCueChips` strip with one-click cue auditioning for every track in the setlist.
- `ui/src/features/stage/StageMode.tsx`: Added high-contrast hardware 4-Point Performance Cues HUD for NOW PLAYING song and incoming cue indicator for UP NEXT song.
- `ui/src/features/stage/StageMode.test.tsx`: Added unit test verifying Performance Cues HUD rendering in Stage Mode.
- `crates/exporters/src/set_sheet.rs`: Enhanced `resolve_cues` to identify Cue D (Mix Out) and Cue C (Drop) from transition notes and track analysis, and added test `test_four_point_cue_resolution`.

## Added deps:
None.

## Public API:
- `FOUR_POINT_CUE_CONFIG: Record<PerformanceCueSlot, PerformanceCueSlotConfig>`
- `resolveFourPointCues(track: Track | null | undefined): Record<PerformanceCueSlot, PerformanceCue | null>`
- `FourPointCueDeck: React.FC<FourPointCueDeckProps>`
- `FourPointCueChips: React.FC<FourPointCueChipsProps>`
- `formatCueTime(timeMs: number): string`
- `nudgeCueTime(timeMs: number, deltaMs: number, minMs?: number, maxMs?: number): number`
- `snapTimeToGrid(timeMs: number, grid?: BeatGrid): number`
- `serializeFourPointCues(cues: Record<PerformanceCueSlot, PerformanceCue | null>): CuePoint[]`

## Tests:
- Rust tests: 295 passed (all workspace tests passing).
- UI tests: 461 passed (40 test files passing).
- Typecheck: `tsc -b --noEmit` clean with zero errors.
- Linter: `cargo clippy --workspace -- -D warnings` and `cargo fmt --check` clean.

## Known gaps:
None.

## Needs from others:
None.
