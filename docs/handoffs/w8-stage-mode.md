# w8-stage-mode Rehearsal & Live Performance Mode Redesign

Status: done
Changed:
- `ui/src/features/stage/StageMode.tsx`
- `ui/src/features/stage/useStageKeyboard.ts`
- `ui/src/features/stage/StageModePerformance.test.tsx`
- `ui/src/features/delivery/deliveryValidation.ts` (type cleanup for workspace `tsc` pass)
- `ui/src/features/delivery/deliveryValidation.test.ts` (type cleanup for workspace `tsc` pass)
- `ui/src/features/delivery/FinalDeliveryModal.test.tsx` (type cleanup for workspace `tsc` pass)

Added deps: none

Public API:
- `StageMode(): JSX.Element`: Dedicated full-screen live rehearsal & stage cockpit component.
- `getTransitionSegmentFlow(currentEntry: SetlistEntry | null, nextEntry: SetlistEntry | null): string`: Derives musical segment phase flow between adjacent setlist tracks (e.g. `BREAKDOWN → DROP`, `OUTRO → INTRO`).
- `useStageKeyboard(options: UseStageKeyboardOptions)`: Keyboard and foot pedal hook supporting Space, Arrows, PageUp/PageDown, Enter, Backspace, Escape, and 'S' to toggle setlist drawer.

Tests:
- `ui/src/features/stage/StageMode.test.tsx` (11 tests covering empty states, current/next track presentation, exit protection, setlist jumping, duration utilities, and cue HUD).
- `ui/src/features/stage/StageModeErgonomics.test.tsx` (3 tests covering 56px+ touch target hitboxes, line clamping, and amber hazard styling on intervention).
- `ui/src/features/stage/StageModePerformance.test.tsx` (4 tests covering real-time transition countdown decrementing from Mix-Out Cue D, phase flow resolution, active cue dynamic tracking, and keyboard shortcuts).
- Workspace test totals: 294 Rust tests passed (0 failed), 476 UI tests passed (0 failed).

Known gaps:
- Hardware MIDI controller crossfader integration for Stage Mode is reserved for v2.

Needs from others:
- None.
