# stage-mode-boutique-audio-optimization Stage Mode Live Performance HUD Overhaul

Status: done
Changed:
- `ui/src/features/stage/StageMode.tsx`
- `ui/src/features/stage/useStageKeyboard.ts`
- `ui/src/features/stage/StageMode.test.tsx`

Added deps: none

Public API:
- `calculatePitchFader(currentBpm, nextBpm)`: pure helper computing exact pitch fader offset % (e.g. `+1.6%`)
- `getHarmonicIntervalName(currentKeyStr, nextKeyStr, advice)`: pure helper resolving Camelot harmonic shift names
- `calculatePhraseTelemetry(bpm, firstDownbeatMs, currentElapsedMs, targetMixOutMs, phraseBars)`: pure helper calculating bar/beat step progress and bars remaining
- `StageMode`: enhanced hardware performance cockpit with live auditioning, phrase step LED meter, telemetry strip, and interactive cues

Tests:
- All 22 tests in `ui/src/features/stage/` pass (`StageMode.test.tsx`, `StageModeErgonomics.test.tsx`, `StageModePerformance.test.tsx`).
- Full test suites pass: `pnpm --dir ui test` (495/495 tests across 46 files), `pnpm --dir ui typecheck` (0 errors), `cargo test --workspace` (296/296 tests), `cargo clippy` and `cargo fmt` clean.

Known gaps: none
Needs from others: none
