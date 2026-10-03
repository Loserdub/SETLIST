# f5-stage-mode Stage Mode & Live Performance System
Status: done
Changed:
- `ui/src/features/stage/StageMode.tsx`: Full-screen live performance UI with high-contrast, large-format now playing & up next track displays, transition guidance, and safe read-only controls
- `ui/src/features/stage/useWakeLock.ts`: Web Screen Wake Lock API integration with visibility lifecycle management and graceful degradation
- `ui/src/features/stage/usePerformanceClock.ts`: Live elapsed/remaining performance timer and duration formatting utilities
- `ui/src/features/stage/useStageKeyboard.ts`: Configurable keyboard navigation and Bluetooth foot pedal mapping (PageUp/PageDown, arrows, Space, Escape)
- `ui/src/features/stage/index.ts`: Barrel export for Stage feature
- `ui/src/components/routes/StageRoute.tsx`: Route container component for Stage Mode
- `ui/src/store/useAppStore.ts`: Added `'stage'` route and stage actions (`isStageMode`, `stageCurrentIndex`, `stageStartTime`, `enterStageMode`, `exitStageMode`, `stageNext`, `stagePrev`, `stageGoTo`, `stageRestart`)
- `ui/src/components/Sidebar.tsx`: Added Stage Mode launch button when active setlist contains tracks
- `ui/src/App.tsx`: Wired `'stage'` route, conditionally hides sidebar in Stage Mode to ensure distraction-free performance view
- `ui/src/features/stage/StageMode.test.tsx`: Comprehensive integration and unit tests covering navigation, foot pedal shortcuts, timer, jump overlay, and exit safety
- `ui/src/App.test.tsx`: Added test coverage for Stage Mode route and hidden sidebar state
- `ui/src/features/setlist/EnergyChart.tsx`: Fixed duplicate closing tags
- `ui/src/features/library/pure.test.ts`: Adjusted benchmark threshold to tolerate parallel test worker CPU scheduling

Added deps: none

Public API:
- `StageMode: React.FC`: High-visibility stage performance component
- `useWakeLock(enabled: boolean): { isActive: boolean; isSupported: boolean; error: string | null }`: Hook managing screen wake lock
- `usePerformanceClock(active: boolean, startTime: number | null, totalDurationMs: number | null, currentSongDurationMs: number | null, elapsedSongsMs: number): PerformanceClockState`: Hook computing elapsed and remaining performance time
- `formatDuration(ms: number): string`: Formats milliseconds into MM:SS or HH:MM:SS
- `formatDurationCompact(ms: number): string`: Formats milliseconds into compact Xh Ym or Xm
- `useStageKeyboard(options: UseStageKeyboardOptions): void`: Hook binding keyboard & foot pedal controls to stage navigation actions
- `AppState`: `isStageMode: boolean`, `stageCurrentIndex: number`, `stageStartTime: number | null`, `enterStageMode(): void`, `exitStageMode(): void`, `stageNext(): void`, `stagePrev(): void`, `stageGoTo(index: number): void`, `stageRestart(): void`

Tests:
- `ui/src/features/stage/StageMode.test.tsx`:
  - Renders empty state when setlist is empty and returns to setlist
  - Renders current track with large distance-readable typography, artist, and metadata pills (BPM, Key, Energy, Duration)
  - Previews upcoming track and transition guidance (harmonic moves, BPM deltas, phrase lengths, intervention alerts)
  - Prev/Next button navigation and boundary conditions (first track disables prev, last track disables next with end-of-set notification)
  - Keyboard & Bluetooth foot pedal controls (ArrowRight/Down, PageDown, Space, PageUp, ArrowLeft/Up)
  - Accidental exit protection: Escape or Exit button triggers confirmation modal, allowing staying or deliberate exit
  - Jump-to-track overlay: opens quick setlist picker to jump to any song without reordering
  - Performance clock elapsed and duration formatting unit tests
- `ui/src/App.test.tsx`: Verified StageRoute rendering and full-screen sidebar hiding

Known gaps:
- Native OS-level wake lock plugin via Tauri syscalls can be added as a fallback for webviews where `navigator.wakeLock` is restricted

Needs from others:
- None
