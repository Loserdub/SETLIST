# AGENTS.md

Read this file before every task. It is the source of truth for the repo.

## 1. Project

Product name: SETLIST, by TRUSTNODELOGIC.

A local-first desktop app that prepares DJ sets. It analyzes a user's music library. It then acts as a co-pilot. It suggests track order, transition techniques, and cue points. The user keeps creative control. The app never produces an unchangeable playlist.

## 2. Locked decisions

Do not change these without a note in `docs/handoffs/`.

- Shell: Tauri 2. Core in Rust. Frontend in React, TypeScript, Vite, Tailwind, Zustand.
- Local only. Audio and metadata never leave the machine. No network calls with user data.
- Source audio is read-only. Never write, rename, or retag a user's audio file in v1.
- Storage: SQLite through `rusqlite` with the `bundled` feature. Migrations are plain `.sql` files.
- Durable user data lives in SQLite. Never store it in localStorage. localStorage may hold only UI-only preferences such as panel sizes.
- The desktop app never shows mock data. The mock backend exists for tests and dev builds only.
- Dev target: Windows 11, CPU only. Assume no GPU. Keep the v1 analysis path in classical DSP, pure Rust.
- Neural tier (Demucs and All-In-One via ONNX Runtime) is a later phase. It must sit behind a trait so v1 never depends on it.
- Exports in v1: Rekordbox XML, M3U8, and a set sheet (CSV and Markdown). Traktor NML and Serato come later.
- Shared types live in `crates/core-types`. TypeScript bindings are generated from them with `ts-rs`. Never hand-write a type that already exists in Rust.

## 3. Repo layout and ownership

| Path | Purpose | Workgroup |
|---|---|---|
| `crates/core-types` | Shared types, Camelot logic, ts-rs bindings | Foundation |
| `crates/audio-io` | Decode, downmix, resample, loudness, tags | C |
| `crates/audio-analysis/src/rhythm` | Onset, tempo, beats, downbeats | A |
| `crates/audio-analysis/src/tonal` | Chroma, key, tuning | B |
| `crates/audio-analysis/src/dynamics` | Spectral features, energy | B |
| `crates/audio-analysis/src/structure` | Segments, cue placement | B |
| `crates/audio-analysis/src/waveform` | 3-band waveform | B |
| `crates/library-db` | SQLite repo, scanner, job queue | C |
| `crates/playback` | Pure Rust audio player, state machine, clock, beat click generator | K |
| `crates/sequencer` | Cost model, solvers, transition advisor | D |
| `crates/exporters` | Rekordbox XML, M3U8, set sheet | E |
| `tools/validate` | Ground-truth accuracy validation harness and Rekordbox verification CLI | G |
| `scripts/` | Desktop run scripts, release automation, and desktop shortcuts | Integration |
| `src-tauri/src/commands.rs` | Tauri IPC commands for library, scan, setlist, and exports | Integration |
| `src-tauri/src/overrides.rs` | Track analysis override commands and database bridging | L |
| `src-tauri/src/playback.rs` | Audio playback IPC commands and position event bridge | K |
| `src-tauri/src/state.rs` | Application state, SQLite connection pool, and background scanner job queue | Integration |
| `src-tauri/` | Tauri commands and app state | Integration |
| `ui/src/features/library` | Virtualized track table, filtering, search, and harmonic sorting | F |
| `ui/src/features/track` | Track inspection, waveform display, audio transport, and analysis overrides | F |
| `ui/src/features/setlist` | Setlist builder, drag-and-drop reordering, transition badges, and energy curves | F |
| `ui/src/features/stage` | Full-screen live performance stage mode, wake lock, and performance timers | F |
| `ui/src/features/discovery` | Catalog graph explorer, set discovery, pathfinder, and outlier detector | W |
| `ui/` | React frontend | F |
| `docs/handoffs/` | One handoff note per finished task | All |

Rule: edit only the paths your workgroup owns. If you need a change elsewhere, write it in your handoff note. Do not make it yourself.

## 4. Conventions

Units
- All times are milliseconds as `f64`. Exporters convert to seconds.
- BPM is `f64`. Energy is an integer from 1 to 10. Loudness is LUFS as `f32`.
- Analysis sample rate is 44100 Hz, mono, `f32`.

Rust
- `cargo fmt` and `cargo clippy --workspace -- -D warnings` must pass.
- Use `thiserror` for errors. Return `Result`. No `unwrap` or `expect` outside tests.
- Public functions get doc comments. Keep functions pure where possible.
- Analysis code must be deterministic. Seed any randomness.

TypeScript
- `strict` mode on. No `any`.
- Components stay small. Data access goes through the `Backend` interface in `ui/src/api`.

UI standards
- Text is never smaller than 12px. Body text is 14px.
- Text contrast meets WCAG AA (4.5 to 1) on the dark background.
- Every button, input, and row shows a visible keyboard focus ring.
- Labels use plain words. Internal names such as w_tempo never appear in the UI.
- Keep existing data-testid values when you edit a component.
- Never remove or shorten a legal notice.

Dependencies
- Add dependencies only to the crate that needs them. List each new one in your handoff note with the reason.

## 5. Testing

- Every task ships tests.
- Use synthetic signals built in test code: click tracks, additive-harmonic chords, noise bursts. Do not commit copyrighted audio.
- `fixtures/` holds generated or CC0 files only.
- Commands:
  - `cargo test --workspace`
  - `cargo clippy --workspace -- -D warnings`
  - `cargo fmt --check`
  - `pnpm --dir ui typecheck`
  - `pnpm --dir ui test`

## 6. Domain reference

### 6.1 Camelot mapping

| Num | A (minor) | B (major) |
|---|---|---|
| 1 | Ab minor | B major |
| 2 | Eb minor | F# major |
| 3 | Bb minor | Db major |
| 4 | F minor | Ab major |
| 5 | C minor | Eb major |
| 6 | G minor | Bb major |
| 7 | D minor | F major |
| 8 | A minor | C major |
| 9 | E minor | G major |
| 10 | B minor | D major |
| 11 | F# minor | A major |
| 12 | C# minor | E major |

Shift math: a change of `s` semitones moves the Camelot number by `(7 * s) mod 12`. A whole step up is +2. A half step up is +7. A tritone is +6.

### 6.2 Transition categories

| Move | Semitones | Camelot shift | Meaning |
|---|---|---|---|
| Exact match | 0 | 0 | Perfect consonance |
| Relative switch | 0 | A and B swap | High consonance |
| Fifth | +7 or -5 | +1 or -1 | High consonance |
| Whole-step lift | +2 | +2 | Moderate dissonance, energy lift |
| Half-step lift | +1 | +7 | High dissonance, avoid long overlap |
| Tritone | +6 | +6 | Maximum dissonance |

### 6.3 Cost model

`C_ij = w_tempo * Phi_tempo + w_key * Phi_key + w_energy * Phi_energy + w_timbre * Phi_timbre`

Every term is clamped to [0, 1]. Default weights: tempo 0.30, key 0.35, energy 0.35, timbre 0.00.

- `Phi_tempo = min(|BPM_i - BPM_j| / 6, 1)`. Before scoring, test for an octave relation (x2 or x0.5, within 3 percent). If found, compare against the octave-adjusted BPM.
- `Phi_key` uses circular distance `d` on the number ring (0 to 6) and whether the mode flips. Starting values, user tunable:

| d | Same mode | Mode flip |
|---|---|---|
| 0 | 0.00 | 0.10 |
| 1 | 0.10 | 0.40 |
| 2 | 0.35 | 0.60 |
| 3 | 0.70 | 0.80 |
| 4 | 0.85 | 0.90 |
| 5 | 0.95 | 0.95 |
| 6 | 1.00 | 1.00 |

- `Phi_energy = min(((E_j - E_i) - dE_target)^2 / 16, 1)`. The research doc leaves this unnormalized. This repo normalizes it.
- `Phi_timbre` returns 0 in v1. Deep embeddings arrive in a later phase.

### 6.4 Energy profiles

- Linear ramp: energy rises slowly. Step change of 1 to 2 BPM. Energy never drops.
- Wave: alternates peaks and valleys.
- Peak plateau: reaches high energy early and holds it.

`dE_target(k)` is the expected energy change at position `k` of `n`.

### 6.5 Transition thresholds

- Intervention needed when `ΔBPM > 8` or key distance `d > 3`.
- Outro shorter than 16 bars triggers a loop extension.
- Phrase lengths are 8, 16, or 32 bars. Transitions start on phrase boundaries.

### 6.6 Cue registers

| Index | Cue | Meaning |
|---|---|---|
| 0 | A | First downbeat |
| 1 | B | End of intro, percussion or bass enters |
| 2 | C | First breakdown |
| 3 | D | First drop |
| 4 | E | Second breakdown |
| 5 | F | Second drop |
| 6 | G | Mix-out point, start of outro |
| 7 | H | 4 or 8 bar percussive loop |

If a section does not exist, skip that cue. Never invent one.

### 6.7 Segment labels

`intro`, `verse`, `buildup`, `drop`, `breakdown`, `outro`. The research schema omitted `buildup`. This repo includes it. Segment edges snap to bar boundaries.

## 7. Agent rules

1. Read this file. Read the prompt. Then start.
2. Do one task per prompt. Do not start the next task.
3. Stay inside your owned paths.
4. Contracts in `core-types` are fixed. If one is wrong, stop and describe the problem in your handoff note.
5. Run all test commands before you finish. Fix failures you caused.
6. Do not refactor code you do not own.
7. Do not add features the prompt does not ask for.
8. Write a handoff note to `docs/handoffs/<task-id>.md`.
9. Commit to your workgroup branch with a clear message.

### Parallel work

- Up to three agents work at the same time. Edit only the paths your prompt says you own.
- Shared files are src-tauri/src/lib.rs, ui/src/store/useAppStore.ts, ui/src/api/index.ts, and ui/src/App.tsx. Read the file again right before you edit it. Keep your change to one small hunk.
- Generated files in ui/src/bindings come from ts-rs. Regenerate them. Never edit them by hand.
- Run all checks from section 5 before you finish. Report Rust and UI test counts. The baseline is 294 Rust tests and 317 UI tests. If a count drops, say why.
- Commit only the files you changed, and only when the prompt gives a commit message.
- Write a handoff note to docs/handoffs/ for every task.

### Handoff note format

```
# <task-id> <title>
Status: done | partial | blocked
Changed: list of files
Added deps: crate or package, reason
Public API: signatures other agents may call
Tests: what is covered
Known gaps: plain list
Needs from others: plain list
```

## Command rules
- Run one simple command per call. No pipes, no ForEach-Object, no inline scripts.
- Never launch the app or pnpm tauri dev. Ask the user to run it.
- If a task needs the app launched, the prompt must say so. Launch it once and report. Do not retry in a loop.
- Never poll or loop on a process. Check once, then report.
- Never stop processes by name. Stop only a process id you started yourself.
- Never kill msedgewebview2 processes. Other apps use them.
- If asked to diagnose, do not edit code or commit. Report and wait.
- Write long output to a file in share/ and read the file.
- Do not git commit unless the prompt says so.

## 8. Out of scope for v1

- Neural source separation and neural segmentation
- Audio preview playback
- Serato crate and GEOB writing
- Traktor NML export
- Cloud sync, accounts, telemetry
- Mobile and web builds
- Automatic playlist generation without user control

## 9. Definition of done

A task is done when its acceptance list passes, all test commands pass, and the handoff note exists.

Status: Baseline on 2026-10-04: 294 Rust tests, 317 UI tests, clippy, fmt, and typecheck all passing.
