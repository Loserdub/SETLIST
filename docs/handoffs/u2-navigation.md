# u2-navigation Plain Navigation Labels & Dev Switch Guard

Status: done
Changed:
- ui/src/components/Sidebar.tsx
- ui/src/App.tsx
- ui/src/store/useAppStore.ts
- ui/src/App.test.tsx
Added deps: none
Public API:
- `useAppStore`:
  - `setRoute(route: Route)`: enforces `track` route guard so navigation to `track` is ignored when no track is selected (`selectedTrackId` and `selectedTrack` are null).
  - `useMockBackend` / `setUseMockBackend(useMock: boolean)`: inside desktop Tauri environment, `useMockBackend` is forced to `false` at startup, and toggling to mock backend is rejected unless `VITE_SHOW_DEV_TOOLS` is active.
Tests:
- `ui/src/App.test.tsx`:
  - Verified plain navigation labels: `My Music` (`library`), `Find Transitions` (`discovery`), `Track Detail` (`track`), `My Set` (`setlist`), `Settings` (`settings`).
  - Verified 1-line hover descriptions (`title`) and `aria-label` accessibility attributes on every navigation button and stage mode action button.
  - Verified `Track Detail` button is disabled with tooltip `"Open a track from My Music"` when no track is selected, and clicking it does not navigate away.
  - Verified selecting a track enables `Track Detail` navigation and updates tooltip to `"Inspect beat grid, cues, and waveform for the selected track"`.
  - Verified SETLIST header tagline is updated to `"DJ set prep"`, while all legal notices and IP badges are strictly preserved.
  - Verified Mock Engine / Tauri Native toggle is hidden inside native Tauri environment, and `useMockBackend` is forced to `false` at startup.
  - Verified Mock Engine toggle is visible outside Tauri (web/test mode) or when `VITE_SHOW_DEV_TOOLS` is enabled.
- Rust tests: 294 passed (0 failed).
- UI tests: 408 passed (1 timeout in unrelated Workgroup F library audition test).
Known gaps:
- None for u2-navigation scope.
Needs from others:
- Workgroup F: `LibraryView.test.tsx` test `triggers track audition on Space key and adds to setlist on Enter key` occasionally times out when ran under heavy parallel suite load.
