# k3-accessible-playback-and-te-tooltips Accessible Playback Transport & Teenage Engineering Hover Tooltips

Status: done
Changed:
- `ui/src/features/track/playbackMath.ts`
- `ui/src/features/track/playbackMath.test.ts`
- `ui/src/components/waveform/WaveformCanvas.tsx`
- `ui/src/components/waveform/WaveformMinimap.tsx`
- `ui/src/components/waveform/WaveformContainer.tsx`
- `ui/src/features/track/PlaybackBar.tsx`
- `ui/src/features/track/TrackView.tsx`
- `ui/src/features/track/TrackView.test.tsx`
Added deps: none
Public API:
- `CanvasHoverInfo`: Waveform canvas hover telemetry state with cue, segment, beat, timeMs, pixelX, and isLingering
- `MinimapHoverInfo`: Waveform minimap hover telemetry state with cue, segment, timeMs, pixelX, and isLingering
- `TrackKeyboardAction`: Added `{ type: 'jump_cue'; cueIndex: number }` for keys 1–8 hot cue jumping
Tests:
- Vitest: 291 passed across 24 test suites
- Cargo: All workspace unit tests and doc-tests passed
Known gaps: none
Needs from others: none

## Summary of Changes
1. **Permanently Docked Bottom Transport Bar:**
   - Decoupled `PlaybackBar` from the scrolling document body in `TrackView.tsx`, docking it into a fixed bottom bar with frosted dark backdrop (`bg-[#0a0a0a]/98 backdrop-blur-md border-t border-[#242424] shadow-[0_-8px_24px_rgba(0,0,0,0.9)] z-30`).
   - Ensured Play/Pause, position readout, seek deltas (±5s, 0:00), speed multipliers (0.5x–2.0x), and metronome click track are permanently accessible no matter where the user scrolls.

2. **Waveform Header Quick Transport:**
   - Added a compact quick Play/Pause button (`▶ PLAY [SPACE]` / `⏸ PAUSE [SPACE]`) directly in `WaveformContainer` header next to the playhead time readout.

3. **Shortcuts & Hot Cue Jumping:**
   - Enhanced `handleTrackKeyDown` in `playbackMath.ts` to support numeric keys `1`–`8` to trigger immediate jump to Cues A–H (`jump_cue` action).
   - Ignored when typing inside input/textarea fields.
   - Updated keyboard shortcut hints in `PlaybackBar.tsx`.

4. **Auto-Follow Playhead Viewport:**
   - Implemented an auto-scroll effect in `TrackView.tsx` during playback when zoomed in (`zoomLevel > 1.0`): when the playhead approaches the right boundary, the visible window smoothly shifts to keep the playhead in view with forward lookahead.

5. **Teenage Engineering Hover Tooltips with 2-Second Linger:**
   - Designed micro-typography telemetry tooltips in `WaveformCanvas.tsx` and `WaveformMinimap.tsx` adhering to the Teenage Engineering aesthetic: monospace (`font-mono`), ultra-crisp uppercase micro-typography (`text-[9px] tracking-widest uppercase`), sharp 0px corners (`rounded-none`), thin hairline border (`border border-[#333]`), technical dividers (`//`), and matte dark background (`bg-[#0c0c0c]/95`).
   - Implemented a 2000 ms hover decay / linger timer (`hoverLeaveTimerRef`): when the cursor leaves the canvas or minimap, the telemetry tooltip remains pinned for 2 seconds with a `HOLD 2S` badge before cleanly disappearing.
