# F1 Restore Global Transport Bar and Fix Sidebar Footer

Status: done
Changed: 
- `ui/src/components/transport/GlobalTransportBar.tsx`
- `ui/src/components/transport/GlobalTransportBar.test.tsx`
- `ui/src/App.tsx`
- `ui/src/components/Sidebar.tsx`
- `ui/src/features/discovery/MusicalTopologyCanvas.tsx`
Added deps: none
Public API:
- `<GlobalTransportBar />`: Fixed bottom hardware transport bar docked at `bottom-0 left-56 right-0 h-14`
- `App`: Conditionally applies `pb-14` padding to `<main>` when audition transport is active
Tests:
- `ui/src/components/transport/GlobalTransportBar.test.tsx` (11 unit tests covering rendering conditions, metadata readout, seek scrubber ms accuracy, rewind, play/pause toggle, speed multiplier pills, metronome click toggle, stop calling client method, and App route visibility rules across Library, Discovery, Setlist, Track, and Stage routes).
- All 9 App routing tests in `ui/src/App.test.tsx` pass.
- Full UI test suite passes.
Known gaps:
- `playback_stop` command is added to `src-tauri` by G1. Until G1 lands, `PlaybackClient.stop()` uses the existing `pause() + seek(0)` fallback in `TauriPlaybackClient`.
Needs from others:
- G1: Register and wire native `playback_stop` Tauri command.
