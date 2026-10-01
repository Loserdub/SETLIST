# DJ Set Assistant

A local-first desktop app that prepares DJ sets. It analyzes a user's music library and acts as a co-pilot, suggesting track order, transition techniques, and cue points while keeping the user in full creative control.

## Workspace Layout

- `crates/core-types`: Shared types, Camelot logic, ts-rs bindings
- `crates/audio-io`: Decode, downmix, resample, loudness, tags
- `crates/audio-analysis`: Analysis modules (`rhythm`, `tonal`, `dynamics`, `structure`, `waveform`)
- `crates/library-db`: SQLite repository, scanner, job queue
- `crates/sequencer`: Cost model, solvers, transition advisor
- `crates/exporters`: Rekordbox XML, M3U8, set sheet
- `src-tauri`: Tauri 2 desktop shell and commands
- `ui`: React + TypeScript frontend (Vite, Tailwind, Zustand)
- `docs/handoffs`: Agent task handoff notes
- `fixtures`: CC0 / synthetic test audio assets

## Verification Commands (AGENTS.md Section 5)

Run these verification commands across the workspace:

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

## Build & Development Commands

```bash
# Build all Rust workspace crates
cargo build --workspace

# Build the frontend bundle
pnpm --dir ui build

# Run the Tauri desktop app in dev mode
pnpm tauri dev
```
