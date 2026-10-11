# 5b487685-4872-4b6d-a5f4-30a10a081eee Stage Mode Performance Layer
Status: done
Changed: 
- `ui/src/features/stage/StageMode.tsx`
- `ui/src/features/stage/components/PerformanceControls.tsx`
- `ui/src/features/stage/components/TimelineVisualizer.tsx`
- `ui/src/features/stage/store/useStageControlsStore.ts`
Added deps: None
Public API: None
Tests: Components created, basic rendering logic provided; mock backend logic stubbed for visual testing.
Known gaps: Audio engine bindings for slip mode, beat jump, and hot cues are currently mocked/console logged. Playhead does not smoothly advance yet until backend event bridge is connected for stage mode.
Needs from others: Rust backend needs to bridge IPC events for slip mode toggling, beat jumps, and setting/firing hot cues from `useStageControlsStore`.
