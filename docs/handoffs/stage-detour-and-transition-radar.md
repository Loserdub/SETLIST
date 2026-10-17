# stage-detour-and-transition-radar Live Stage Detour Copilot & Phrase Transition Radar
Status: done
Changed:
- `ui/src/features/stage/components/TransitionRadar.tsx`
- `ui/src/features/stage/components/TransitionRadar.test.tsx`
- `ui/src/features/stage/components/StageDetourCopilot.tsx`
- `ui/src/features/stage/components/StageDetourCopilot.test.tsx`
- `ui/src/features/stage/StageMode.tsx`
- `ui/src/features/stage/StageMode.test.tsx`
- `ui/src/store/useAppStore.ts`

Added deps: none

Public API:
- `TransitionRadar`:
  - Visual phrase-meter component mounted in Stage Mode beneath the master waveform timeline.
  - Computes active phrase index, bar within phrase (e.g., Bar 4 / 16), and beat meter with illuminated downbeat pulses from track grid (`bpm`, `first_downbeat_ms`).
  - Displays transition countdown badges: `🟢 PHRASE BOUNDARY` on bar 1, `⚠ DROP IN X BARS` when <= 2 bars remain, and proximity alerts when approaching mix-out Outro (Register G) cues.
  - Provides 1-tap `[ Snap Next Phrase ↷ ]` action for instant on-grid seeking via `onSnapPhrase`.
- `StageDetourCopilot`:
  - Intelligent live performance copilot analyzing the producer/DJ's full library in real time relative to the currently playing track.
  - Computes 3 targeted pivot recommendations:
    - ⚡ **Energy Lift**: High-energy tracks with harmonic distance <= 2 and ΔBPM <= 8.
    - 🌊 **Floor Reset**: Deep breakdown/reset tracks (energy <= 5) with harmonic distance <= 1.
    - 🎛 **VIP / Edit Swap**: Track variations matching "(VIP)", "(Dub)", "(Edit)", "(Remix)", "(Instrumental)" or exact harmonic twins (d = 0).
  - Quick action controls: `[ SWAP NEXT ]` (replaces upcoming track) and `[ INSERT NEXT ]` (splices detour immediately next, shifting remaining setlist).
  - Transient feedback banner confirming queue mutation with 3s auto-dismissal.
- `useAppStore`:
  - `stageQueueTrackNext(track: Track)`: Inserts track immediately after current stage index and updates indices.
  - `stageReplaceNextTrack(track: Track)`: Replaces the immediately upcoming track in the active setlist.

Tests:
- `ui/src/features/stage/components/TransitionRadar.test.tsx` (6 tests):
  - Empty state when no track is loaded.
  - Accurate phrase, bar, and beat calculations.
  - Phrase boundary highlight rendering.
  - Drop imminent countdown alert rendering.
  - Mix-out Outro cue proximity warning rendering.
  - Snap phrase button triggers accurate millisecond seek callback.
- `ui/src/features/stage/components/StageDetourCopilot.test.tsx` (4 tests):
  - Renders 3 recommendation cards with harmonic & BPM match tags.
  - Swap Next updates next track via `stageReplaceNextTrack`.
  - Insert Next splices track next via `stageQueueTrackNext`.
  - Displays and auto-dismisses feedback banner.
- `ui/src/features/stage/StageMode.test.tsx`:
  - Integration test verifying both components render and execute live set mutations within Stage Mode.
- Full UI suite: 400 passing tests across 34 test files (0 failures).
- Full Rust suite: 294 passing tests (0 failures).
- Lints: `cargo fmt --check`, `cargo clippy --workspace -- -D warnings`, and `pnpm --dir ui typecheck` pass cleanly.

Known gaps: none

Needs from others: none
