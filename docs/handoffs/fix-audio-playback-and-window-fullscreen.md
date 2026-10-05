# fix-audio-playback-and-window-fullscreen Fix Audio Playback, Native Window Fullscreen, and Stage Viewport Responsiveness
Status: done
Changed:
- src-tauri/capabilities/default.json (added core:window fullscreen and maximize permissions)
- src-tauri/src/playback.rs (added structured tracing/error logging for playback commands)
- ui/src/utils/windowFullscreen.ts (cross-platform Tauri window fullscreen toggle & state query helper with DOM fallback)
- ui/src/utils/windowFullscreen.test.ts (unit tests for fullscreen utilities)
- ui/src/index.css (locked html, body, and root to 100% height and width to prevent flex collapse)
- ui/src/App.tsx (added global F11 fullscreen shortcut listener and updated root layout classes)
- ui/src/store/useAppStore.ts (hardened toggleAudition with error handling/toasts, fixed isFinished track completion logic, added synthetic track guard, added masterVolume control)
- ui/src/store/useAppStore.test.ts (unit tests for toggleAudition error recovery and synthetic track handling)
- ui/src/features/track/PlaybackBar.tsx (added Master Volume slider and mute toggle)
- ui/src/features/stage/StageMode.tsx (added FULLSCREEN toggle button in status bar, master volume controls, and updated grid breakpoints from xl:grid-cols-12 to lg:grid-cols-12 for 1080p and laptop scaling)
Added deps: none
Public API:
- `toggleWindowFullscreen(): Promise<boolean>` in `ui/src/utils/windowFullscreen.ts`
- `isWindowFullscreen(): Promise<boolean>` in `ui/src/utils/windowFullscreen.ts`
- `setMasterVolume: (volume: number) => Promise<void>` in `ui/src/store/useAppStore.ts`
Tests:
- 294 Rust workspace tests passing (`cargo test --workspace`)
- 495 UI tests passing across 46 test suites (`pnpm --dir ui test`)
- Rust clippy clean (`cargo clippy --workspace -- -D warnings`)
- Rust fmt clean (`cargo fmt --check`)
- TypeScript typecheck clean (`pnpm --dir ui typecheck`)
- Fresh release binary compiled and desktop shortcut updated (`target/release/SETLIST.exe`)
Known gaps: none
Needs from others: none
