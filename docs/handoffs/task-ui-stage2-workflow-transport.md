# task-ui-stage2-workflow-transport UI & UX Stage 2 Optimization: Workflow & Performance Core

Status: done

Changed:
- `ui/src/store/useAppStore.ts`
- `ui/src/components/Sidebar.tsx`
- `ui/src/components/transport/GlobalTransportBar.tsx`
- `ui/src/components/transport/GlobalTransportBar.test.tsx`
- `ui/src/App.tsx`
- `ui/src/features/library/LibraryView.tsx`
- `ui/src/features/setlist/SortableTrackItem.tsx`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/features/setlist/undoRedo.test.ts`

Added deps: none

Public API:
- `useAppStore.getState().undoSetlist()`: Reverts the active setlist, pin configuration, and energy profile to the previous snapshot in the history stack, automatically syncing changes to backend SQLite storage.
- `useAppStore.getState().redoSetlist()`: Re-applies the next setlist snapshot from the redo history stack.
- `useAppStore.getState().canUndoSetlist`: Boolean selector indicating if an undoable snapshot exists.
- `useAppStore.getState().canRedoSetlist`: Boolean selector indicating if a redoable snapshot exists.
- `useAppStore.getState().toggleAudition(trackId?: string)`: Global continuous audio audition control bridging any view to the singleton `PlaybackClient`.
- `useAppStore.getState().stopAudition()`: Stops audition playback and hides the global persistent transport dock.
- `useAppStore.getState().seekAudition(positionMs: number)`: Seeks audition playback position.
- `useAppStore.getState().setAuditionSpeed(speed: number)`: Adjusts audition playback speed multiplier.
- `GlobalTransportBar`: React component docked at the viewport bottom providing global audio scrubbing, speed presets, Camelot key & BPM indicators, and 1-click inspection navigation.

Tests:
- `ui/src/features/setlist/undoRedo.test.ts`:
  - Starts with clean undo/redo stacks.
  - History recording on `addToSetlist`, `removeFromSetlist`, `reorderSetlist`, `clearSetlist`, `suggestOrder`, `setPins`.
  - Multi-step undo/redo stack progression and branch invalidation on divergent mutations.
  - Undo/redo restoration of pin configurations.
  - Undoability of clearing setlist.
  - 1-click revert verification of solver `suggestOrder` outputs.
  - Snapshot buffer capping at 30 entries.
- `ui/src/components/transport/GlobalTransportBar.test.tsx`:
  - Hidden state when no audition track is active.
  - Metadata rendering (title, artist, BPM, Camelot key badge, time elapsed/duration).
  - Play/pause toggle synchronization with `PlaybackClient`.
  - Speed preset button interactions.
  - Track inspector navigation (`Inspect Track →`).
  - Audition stop button lifecycle and teardown.
- Full UI suite: 26 test files, 307 tests passing (`pnpm --dir ui test`).
- Full Workspace suite: 55 sequencer tests, 23 db tests, 9 playback tests, 5 exporter tests, 7 validation tests passing (`cargo test --workspace`).
- Clippy & formatting checks passing with 0 warnings (`cargo clippy --workspace -- -D warnings`, `cargo fmt --check`).
- Strict TypeScript typechecking passing with 0 errors (`pnpm --dir ui typecheck`).

Known gaps: none

Needs from others: none
