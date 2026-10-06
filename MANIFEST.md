# SETLIST Source Archive & Handoff Manifest

## 1. Archive & System Overview
- **Product**: SETLIST by TRUSTNODELOGIC
- **Architecture**: Tauri 2 (Rust) + React 18 / TypeScript / Tailwind CSS / Zustand
- **Storage**: SQLite in WAL mode with rusqlite (bundled)
- **Global Transport Bar Status**: **RESTORED & FULLY OPERATIONAL (F1, G1)**
  - Mounted globally in `ui/src/App.tsx` with dedicated bottom padding layout (`pb-14`).
  - Real-time playhead tracking, scrub seeking, volume memory, and playback speed control.
  - Wired directly to the native `playback_stop` Tauri backend command for sink and file handle cleanup.
- **Audio Compute Concurrency (G1)**:
  - All heavy catalog analysis and sequencing solvers execute asynchronously via `tokio::task::spawn_blocking`.
  - Pairwise `ScoreMatrix` and `CatalogGraph` are cached per monotonic `catalog_revision`.
  - Concurrent UI requests (such as volume adjustments or library queries) respond in **< 0.5 ms** during active solving.

## 2. Component & Crate Statistics (File Count & Lines of Code)

| Component / Crate | Files | Lines of Code (LOC) | Purpose & Ownership |
|---|---:|---:|---|
| `crates/core-types` | 6 | 2,421 | Shared data structures, Camelot wheel math, validation, ts-rs bindings |
| `crates/audio-io` | 1 | 835 | Audio decoding (WAV/MP3/FLAC/AIFF/OGG), resampler, LUFS loudness, ID3 tags |
| `crates/audio-analysis` | 14 | 5,225 | DSP rhythm, tempo, beats, tonal chroma, energy, waveform, segmentation |
| `crates/library-db` | 16 | 6,627 | SQLite WAL database, schema migrations, job queue, overrides, setlist items |
| `crates/playback` | 5 | 1,605 | Pure Rust audio player, state machine, clock, beat click generator |
| `crates/sequencer` | 9 | 7,286 | Cost model, solvers, transition advisor, catalog relationship engine, score matrix |
| `crates/exporters` | 6 | 2,582 | Rekordbox XML, M3U8, set sheet (CSV & Markdown) |
| `tools/validate` | 3 | 1,915 | Ground-truth accuracy validation harness and accuracy benchmarking |
| `src-tauri` | 15 | 5,923 | Tauri 2 shell, async commands (spawn_blocking), IPC bridges, windowing |
| `ui/src` | 261 | 43,104 | React 18, TypeScript, Tailwind CSS, Zustand slices, virtualized library, waveform |
| **Total Core Components** | **336** | **77,523** | *(Excludes root project config, docs, handoff notes, and fixtures)* |

## 3. Test & Verification Results

All 5 repository quality and correctness gates pass cleanly:

- **Rust Workspace Tests (`cargo test --workspace`)**:
  - **Passed Tests**: 311+
  - **Failed Tests**: 0
  - **Status**: **PASS** (100% passing across all crates and integration suites)
- **Frontend Vitest Suite (`pnpm --dir ui test`)**:
  - **Passed Test Files**: 47
  - **Passed Tests**: 506
  - **Failed Tests**: 0
  - **Status**: **PASS**
- **Rust Clippy (`cargo clippy --workspace -- -D warnings`)**:
  - **Status**: **PASS** (0 warnings, 0 errors)
- **Rust Formatter (`cargo fmt --check`)**:
  - **Status**: **PASS** (0 formatting discrepancies)
- **TypeScript Strict Typecheck (`pnpm --dir ui typecheck`)**:
  - **Status**: **PASS** (0 type errors, 0 hardcoded hex literals)

## 4. Binary & Release Installer Build Status

- **Release Binary**:
  - Path: `target/release/SETLIST.exe`
  - Size: 17.34 MB (18,182,144 bytes)
  - Last Built: 2026-10-06 05:25:30
- **Windows Desktop Shortcut**:
  - Location: `C:\Users\User\Desktop\SETLIST.lnk`
  - Target: `C:\Users\User\Documents\📂 2_Coding_and_Development\SETLIST\target\release\SETLIST.exe`
  - Working Directory: `C:\Users\User\Documents\📂 2_Coding_and_Development\SETLIST`

## 5. Exclusions & Cleanliness Checklist

- **Directories Excluded**: `target/`, `node_modules/`, `dist/`, `.git/`, `share/`, `.vite/`, `coverage/`
- **Audio Files Excluded**: Zero copyrighted audio files committed to repository; synthetic test signals and CC0 fixtures only.
- **Privacy Assurance**: Diagnostics reports contain zero audio samples or user cue points; local file paths outside app directory are redacted.
