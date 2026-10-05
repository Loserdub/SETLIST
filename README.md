# SETLIST

SETLIST is a local-first desktop application that prepares DJ sets by analyzing your music library entirely offline. It acts as an intelligent co-pilot, suggesting optimal track ordering, harmonic transitions, and cue points while keeping you in full creative control. With classical DSP audio analysis, combinatorial sequencing, audio playback with metronome click, live Stage Mode, and Rekordbox export, SETLIST streamlines your workflow from raw audio files to performance-ready sets.

## Data Storage Locations

SETLIST stores all application data locally on your machine with zero external network transmission:

- **Database & Logs**: `%APPDATA%\com.setlist.desktop`  
  Contains the SQLite library database (`library.db` in WAL mode), application settings, track analysis cache, and diagnostic logs (`setlist.log`).
- **WebView2 Runtime Cache**: `%LOCALAPPDATA%\com.setlist.desktop\EBWebView`  
  Contains Microsoft Edge WebView2 client cache, GPU cache, and local UI state.

## How to Run SETLIST

### Prerequisites
- Windows 11 (or 10) 64-bit
- Node.js (v18+) and pnpm (v9+)
- Rust (v1.80+) with `x86_64-pc-windows-msvc` toolchain
- Microsoft Edge WebView2 Runtime

### Development Mode
To run SETLIST in development mode with live reload:
```bash
# Install frontend dependencies
pnpm install

# Run the Tauri desktop app in dev mode
pnpm tauri dev
```

### Production Build & Desktop Launch
To build and run the optimized production release:
```powershell
# Rebuild the production binary and UI bundle
.\scripts\rebuild.ps1

# Create a desktop shortcut pointing to the release executable
.\scripts\make-desktop-shortcut.ps1

# Or run the compiled binary directly
.\target\release\SETLIST.exe
```

### Troubleshooting
If the app does not open or the window is hidden, run the cleanup script to terminate any stale processes and restart:
```powershell
.\scripts\cleanup-setlist.ps1
.\target\release\SETLIST.exe
```

## Workspace Layout

- `crates/core-types`: Shared domain models (`Track`, `Song`, `SetlistItem`), Camelot keys, validation, `ts-rs` bindings
- `crates/audio-io`: Audio decoding (Symphonia), tagging (Lofty), resampling (Rubato), loudness (EBU R128), hashing (Blake3)
- `crates/audio-analysis`: Classical DSP modules (`rhythm`, `tonal`, `dynamics`, `structure`, `waveform`)
- `crates/library-db`: SQLite repository, migrations, background scanner job queue, setlist persistence, overrides
- `crates/playback`: Pure Rust audio engine (rodio/cpal), transport state machine, clock, metronome click generator
- `crates/sequencer`: Held-Karp TSP solver, cost model weights (`CostModelConfig`), transition advisor, catalog relationship graph
- `crates/exporters`: Rekordbox 5/6 XML, extended M3U8, set sheets (CSV and Markdown)
- `tools/validate`: Ground-truth accuracy validation CLI and Rekordbox XML verification harness
- `src-tauri`: Tauri 2 desktop shell, IPC commands (`commands.rs`, `overrides.rs`, `playback.rs`, `diagnostics.rs`), application state
- `ui`: React 19 frontend (TypeScript, Vite, Tailwind CSS, Zustand)
- `docs`: System documentation, architecture guide, and audit reports
- `docs/handoffs`: Workgroup task handoff records
- `fixtures`: CC0 and synthetic test audio assets
- `scripts`: PowerShell automation for builds, packaging, shortcuts, and process cleanup

## Verification Commands (AGENTS.md Section 5)

Run these verification commands across the workspace before finishing any task:

```bash
# Rust test suite
cargo test --workspace

# Rust linter
cargo clippy --workspace -- -D warnings

# Rust code formatting check
cargo fmt --check

# Frontend TypeScript type check
pnpm --dir ui typecheck

# Frontend Vitest test suite
pnpm --dir ui test
```
