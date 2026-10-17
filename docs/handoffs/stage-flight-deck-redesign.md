# stage-flight-deck-redesign Stage Mode Flight Deck Redesign & Performer Co-Pilot
Status: done
Changed:
- `ui/src/features/stage/store/useStageControlsStore.ts`
- `ui/src/features/stage/useStageKeyboard.ts`
- `ui/src/features/stage/StageMode.tsx`
- `ui/src/features/stage/StageMode.test.tsx`
- `ui/src/features/stage/components/PerformanceControls.tsx`
- `ui/src/features/stage/components/TransitionRadar.tsx`
- `ui/src/features/stage/components/StageDetourCopilot.tsx`
- `ui/src/features/stage/components/TimelineVisualizer.tsx`
- `ui/src/features/stage/components/StageFlightRunway.tsx`
- `ui/src/features/stage/components/StageFlightRunway.test.tsx`
- `ui/src/features/stage/components/StageSectionAnatomy.tsx`
- `ui/src/features/stage/components/StageSectionAnatomy.test.tsx`
- `ui/src/features/stage/components/StageCrossroadsSelector.tsx`
- `ui/src/features/stage/components/StageCrossroadsSelector.test.tsx`
- `ui/src/features/stage/components/StageActionPrompter.tsx`
- `ui/src/features/stage/components/StageActionPrompter.test.tsx`

Added deps: none

Public API:
- `useStageControlsStore`:
  - `playMode`: `'auto_advance' | 'manual_takeover'` allowing performers to toggle between autonomous hands-off set progression and manual control.
  - `setPlayMode(mode)` and `togglePlayMode()`: Action handlers for switching play modes.
  - Pioneer DJ hardware colorway applied to Hot Cues (`bg-cyan-500`, `bg-amber-500`, `bg-rose-500`, `bg-indigo-500`).
- `useStageKeyboard`:
  - Extended keyboard controller binding `A` / `a` to `onTogglePlayMode` and number keys `1`, `2`, `3` to `onSelectBranch` (1: Planned Path, 2: Energy Surge, 3: VIP / Edit Swap).
- `StageFlightRunway`:
  - Continuous horizontal narrative waypoint flight runway.
  - Visualizes past played tracks (dimmed), current active capsule with pulsating status telemetry, and upcoming waypoints with relative arrival countdowns (`+03:45`).
  - Supports hybrid performance items: `Song`, `TuningChange` (`tuning:*`), `Banter` (`banter:*`), and `Intermission`.
- `StageSectionAnatomy`:
  - Macro-structural phrase visualizer displaying song architecture blocks (`intro`, `verse`, `buildup`, `drop`, `breakdown`, `outro`).
  - Pioneer Cyan playhead needle sweeping across structural blocks with on-click seek capabilities.
  - Dynamic telemetry display indicating remaining bars to the next major energy landmark (`X BARS UNTIL DROP / OUTRO`).
- `StageCrossroadsSelector`:
  - 3-Way Tactical Branching decision deck mounted above the action deck:
    - `[1] PLANNED PATH`: Follow original setlist sequence.
    - `[2] ENERGY SURGE`: Automated crowd-lift recommendation with $\Delta\text{BPM} \le 8$, harmonic distance $d \le 2$, and elevated energy.
    - `[3] VIP / EDIT / HARMONIC TWIN`: Automated variation detection for live edits, dub mixes, VIPs, or harmonic twins ($d = 0$).
  - One-tap or hotkey hardware execution with transient visual feedback banner.
- `StageActionPrompter`:
  - Heads-up directive banner alerting performers to impending physical actions:
    - Tuning/Capo adjustments with Pioneer Amber styling (`[TUNE/CAPO]`).
    - Microphone/Spoken banter cues with Serato Red styling (`[MIC ACTIVE]`).
    - Transition technique alerts (Filter Blend, Echo Out Freeze, Drop Swap, Loop Extension).
- Color Palette Refinement:
  - Strict Pioneer CDJ / Serato pro-hardware styling: Deep matte chassis (`#0d0e12`, `#16171d`), CDJ Cyan (`#00b4d8`, `#38bdf8`), Cue Amber (`#f59e0b`), Serato Red (`#ef4444`).
  - Curfew timer omitted per requirements; focused strictly on elapsed set time and remaining track time (`-MM:SS`). Zero emerald or neon boilerplate.

Tests:
- `StageFlightRunway.test.tsx` (4 tests)
- `StageSectionAnatomy.test.tsx` (4 tests)
- `StageCrossroadsSelector.test.tsx` (2 tests)
- `StageActionPrompter.test.tsx` (5 tests)
- `StageMode.test.tsx` (15 tests)
- Vitest UI suite: 38 test files, 417 passed (0 failed).
- Rust suite: 294 passed (0 failed).
- Lint & Types: `pnpm --dir ui typecheck`, `cargo fmt --check`, `cargo clippy --workspace -- -D warnings` all passing.

Known gaps: none

Needs from others: none
