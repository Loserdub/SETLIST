# stage-studio-integration-qa App Boot Stability, State Hydration Routing, and Test Suite Continuity
Status: done
Changed:
- `ui/src/config/stageFeatureFlag.ts`
- `ui/src/App.tsx`
- `ui/src/store/useAppStore.ts`
- `ui/src/App.test.tsx`
- `ui/vite.config.ts`
Added deps: none
Public API:
- `isStageModeEnabled(): boolean` in `ui/src/config/stageFeatureFlag.ts`
- `setEnableStageMode(enabled: boolean | null): void` in `ui/src/config/stageFeatureFlag.ts`
- `resetStageModeFeatureFlag(): void` in `ui/src/config/stageFeatureFlag.ts`
Tests:
- Strict quarantine router guard enforcing clean landing in Studio Mode (`'library'`) when `ENABLE_STAGE_MODE` is disabled
- Stage Mode unlocking and full-screen view (`StageRoute`) mounting when feature flag is active
- Independent SQLite `library_db` hydration verification on app startup (`loadTracks` and `loadActiveSetlist` execute without triggering sequencer or stage controls)
- Stage controls store and live performance air-gap isolation: live queue mutations strictly skip debounced persistence writes to SQLite
- Vitest worker execution stabilization on Windows (`pool: 'forks'`, `maxWorkers: 2`, `testTimeout: 35000`)
- 440 UI tests passing across 43 test files (100% pass continuity)
- 304 Rust tests passing across the workspace with 0 warnings in Clippy and clean formatting
Known gaps: none
Needs from others: none
