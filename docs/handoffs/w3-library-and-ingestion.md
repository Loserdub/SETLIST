# w3-library-and-ingestion Boutique Producer Library & Ingestion Experience

Status: done

## Summary
Transformed the existing audio library and ingestion experience into a boutique, high-performance producer tool. The audio pipeline implements an effortless workflow:
`DROP AUDIO → ANALYZE → UNDERSTAND → CATALOG`

The implementation exposes existing deterministic DSP analysis clearly without inventing synthetic algorithms. Ingestion progress is modeled as a hardware instrument status display (`IngestionInstrumentDisplay`) with real-time pipeline gauges, ASCII progress meter (`██████████░░ 127 / 184`), and live telemetry readouts for BPM, Musical Key, Camelot code, Energy rating, and LUFS.

The library table maintains high visual density without noisy giant cards, featuring virtualized 60fps rendering for catalogs exceeding 5,000 tracks, dual-key representation (Camelot badge + musical key name), steady beat-grid status dots, structural segment mini-maps (`StructuralMiniMap`), keyboard navigation (Arrow keys, Space for auditioning, Enter for queuing, and `I` for instant inspection), and a slide-out track analysis drawer (`TrackInspectionDrawer`).

Multi-path audio ingestion is supported via drag/drop window overlays (`DropZoneOverlay`), native folder selection, and multi-file picker selection. Deduplication is handled via BLAKE3 content hashing with zero redundant compute on rescanned files, hash relocation on moved audio, and an actionable diagnostics report modal (`ScanReportModal`) with copyable error logs.

## Changed & Added Files
- `crates/library-db/src/scan/mod.rs`:
  - Added `scan_paths<P, A>` supporting collections of directories and individual audio files with path deduplication.
  - Implemented hash relocation logic: if a track with an identical BLAKE3 hash is scanned at a new location (e.g. portable SSD drive letter change), the SQLite path is updated without redundant DSP re-analysis.
  - Added unit test `test_rescan_moved_or_relocated_file_updates_path`.
  - Updated `ScanEvent::Done` to emit rich analysis telemetry: `bpm`, `key`, `camelot`, `energy`, `lufs`.
- `src-tauri/src/state.rs`:
  - Added telemetry fields to `ProgressEvent`: `bpm`, `key`, `camelot`, `energy`, `lufs`, `file_name`.
- `src-tauri/src/commands.rs`:
  - Added `scan_paths_core` with path existence verification and `scan_paths` Tauri command.
  - Added directory validation in `scan_folder_core`.
  - Populated telemetry fields on `ProgressEvent`.
- `src-tauri/src/lib.rs`:
  - Registered `commands::scan_paths` handler in Tauri application setup.
- `ui/src/api/index.ts`:
  - Updated `ProgressEvent` interface with telemetry properties.
  - Added `scanPaths` to `Backend` interface and implemented in `tauriBackend` and `mockBackend`.
- `ui/src/store/useAppStore.ts`:
  - Added `scanPaths` state action to app store.
- `ui/src/features/library/filters.ts`:
  - Added `getTrackMusicalKeyName` and `CAMELOT_TO_MUSICAL_KEY` mapping.
  - Supported musical key string queries (e.g., "A minor") in search filtering.
- `ui/src/features/library/StructuralMiniMap.tsx` (new):
  - 96x12 segment visualizer with colored zones (Intro, Verse, Buildup, Drop, Breakdown, Outro) and tooltip breakdown.
- `ui/src/features/library/IngestionInstrumentDisplay.tsx` (new):
  - Hardware console UI with ASCII segmented meter, 4 telemetry gauges (BPM, Key, Camelot, Energy/LUFS), source ticker, duplicates/failed counters, and abort action.
- `ui/src/features/library/DropZoneOverlay.tsx` (new):
  - Interactive drag-and-drop window/table overlay with visual blueprint grid, accepting single/multi-file drops and folder drops.
- `ui/src/features/library/ScanReportModal.tsx` (new):
  - Dedicated modal reviewing skipped duplicates (with explanation of hash verification and zero redundant compute) and failed files (with actionable error descriptions and clipboard export).
- `ui/src/features/library/TrackInspectionDrawer.tsx` (new):
  - Slide-out inspection drawer without navigating away from library view. Includes 3-band waveform canvas, acoustics/harmonics telemetry, structural segments breakdown, hot cue registers (0-7), and quick audition/setlist actions.
- `ui/src/features/library/EmptyLibraryView.tsx` (new):
  - Boutique empty state with prominent drag/drop deck, folder & audio file pickers, path input, demo library (40 tracks), 5K benchmark mode, and technical specifications strip.
- `ui/src/features/library/LibraryView.tsx`:
  - Integrated `IngestionInstrumentDisplay`, `EmptyLibraryView`, `DropZoneOverlay`, `TrackInspectionDrawer`, `ScanReportModal`, and `StructuralMiniMap`.
  - Added keyboard shortcut `I`/`i` to toggle inspection drawer and `Escape` to close.
- `ui/src/features/library/Workgroup3LibraryIngestion.test.tsx` (new):
  - 5 comprehensive tests validating the instrument display, report modal, inspection drawer, empty library view, and drawer keyboard integration.

## Technical Guarantees
1. **Local Audio Immutability**: All audio files are strictly read-only. Files are never modified, retagged, or renamed.
2. **Deterministic Deduplication**: BLAKE3 hashing ensures audio files with identical content are never re-analyzed redundantly.
3. **Drive Relocation Resilience**: Moving files or switching drive letters updates the database path without invalidating existing cue points or overrides.
4. **Zero Em-Dashes**: Public copy and UI elements strictly avoid em-dashes (`—` and `&mdash;`), adhering to repository editorial protocols.

## Test Verification
- `cargo test -p app`: All 20 unit tests, 9 catalog tests, 3 domain tests, 4 export tests, 1 integration test, 3 settings tests, and 5 regression tests passed.
- `cargo test -p library-db`: All 25 database and scan unit tests passed.
- `pnpm --dir ui typecheck`: 0 errors.
- `pnpm --dir ui test`: 36 test files, 436 tests passed.
