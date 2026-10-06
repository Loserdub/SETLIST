# Antigravity Prompt Pack: SETLIST Cleanup and Optimization

Drop this file in the repo root next to `ANTIGRAVITY_PROMPTS.md`. It reuses the same workgroup letters, the same branch-per-agent model, and the same "Read AGENTS.md first" rule.

## What the audit found

These findings are what the prompts below are built around.

| Area | Finding | Prompt |
|---|---|---|
| Sequencer | `find_outliers` does about 201M linear scans for 587 tracks. Stats, clusters, and outliers each re-score the same 344k pairs. | D1, D2 |
| IPC | 33 sync commands vs 7 async. `get_catalog_summary_stats` holds the DB mutex for 20+ seconds, which freezes every other command. | G1 |
| Playback | Click-track mixer is always in the audio path. `playback_stop` is not registered. | P1, P2 |
| Transport bar | Lost in a revert (`50bcb8e`, `c8f4a69`). | F1 |
| Validation | Only 3 tracks. Key exact match is 1 of 3, with one major/minor mode error. | B1, B2 |
| UI styling | About 1,750 hard-coded hex colors and about 300 uses of 9 to 11px text. | F2, F3 |
| UI structure | `api/index.ts` is 1,809 lines. `useAppStore.ts` is 1,355. `LibraryView.tsx` is 1,004. | F4 |
| Rust rules | AGENTS.md bans `unwrap` and `expect` outside tests. Needs a real audit. | C2, G1 |
| Persistence | Domain audit says setlists live only in Zustand memory and are lost on restart. Status unknown. | G2 |
| Docs | MANIFEST says the global transport bar is done. The handoff says it was reverted. AGENTS.md still says "DJ Set Assistant". | P0.2, G3 |
| Archive | Zip uses backslash entry names. Generated schemas and a duplicate 380 KB icon are shipped. | G4 |

## How to run this

1. Run Wave 0 with one agent, in order. Commit and tag `cleanup-baseline`.
2. Start Wave 1. One agent and one branch per workgroup. Run prompts inside a workgroup in order and wait for each handoff note.
3. Merge Wave 1 branches in this order: D, C, P, B, E, F.
4. Run Wave 2 with one agent, in order.

Branches: `cl-d-sequencer`, `cl-c-library`, `cl-p-playback`, `cl-b-dsp`, `cl-e-export`, `cl-f-ui`, `cl-i-integration`.

Fewer agents at once: pair D with E, C with P, B with F.

```
Wave 0  Baseline (1 agent)
          P0.1 -> P0.2
Wave 1  Parallel
          WG-D Sequencer   D1 -> D2 -> D3
          WG-C Library     C1 -> C2 -> C3
          WG-P Playback    P1 -> P2
          WG-B DSP         B1 -> B2 -> B3
          WG-E Export      E1
          WG-F UI          F1 -> F2 -> F3 -> F4 -> F5
Wave 2  Integration (1 agent)
          G1 -> G2 -> G3 -> G4 -> G5
```

Shared rules for every prompt below:

- Behavior must not change unless the prompt says so. Every optimization needs an equivalence test against the old result.
- Source audio is read-only. Zero writes to user media.
- Gates before handoff: `cargo test --workspace`, `cargo clippy --workspace -- -D warnings`, `cargo fmt --check`, `pnpm --dir ui test`, `pnpm --dir ui typecheck`.
- One handoff note per prompt in `docs/handoffs/`, named with the prompt ID.

---

## Wave 0: Baseline

### P0.1 Measure before touching anything

```
Read AGENTS.md first. Do not change any source file in this task.

Goal: record numbers so every later optimization is provable.

Do:
1. Run all five quality gates and record pass counts.
2. Build the release binary and record binary size, installer size, and cold start time to first interactive frame.
3. Using the real 587-track library DB (copy it, never open the original for writing), time these Tauri commands with log timestamps or a temporary bench harness outside the repo tree: get_catalog_summary_stats, get_catalog_clusters, get_catalog_outliers, suggest_order with 20 tracks, suggest_order with 60 tracks, list_songs, library scan of an unchanged folder.
4. Run tools/validate on the current fixtures and record the report.
5. Count and record: non-test unwrap/expect per crate (exclude #[cfg(test)] modules and tests/ dirs), hard-coded hex colors in ui/src, text-[9px] to text-[11px] uses, lines per file for the 15 largest source files.
6. Write everything to docs/handoffs/P0.1-baseline.md as one table per section.

Done when: the baseline note exists and a second run of step 3 is within 10 percent of the first. Tag cleanup-baseline.
```

### P0.2 Fix the repo rules

```
Read AGENTS.md first.

Goal: make AGENTS.md match reality so agents stop following stale rules.

Do:
1. Rename the working title from "DJ Set Assistant" to SETLIST by TRUSTNODELOGIC everywhere in AGENTS.md. Do not touch legal notices.
2. Add ownership rows: crates/playback (Workgroup P), tools/validate (Workgroup B), src-tauri (Integration), ui/src/components/transport (Workgroup F).
3. Add these rules to section 4:
   - Tauri commands that touch compute-heavy code must be async and use spawn_blocking. They must never hold the SQLite mutex while computing.
   - No hard-coded hex colors in TSX. Use theme tokens.
   - Minimum text size and contrast rules, to be filled in by F3. Leave a marked placeholder.
   - Every performance change ships with a Criterion bench or a timing test.
4. Record in docs/handoffs/ that AGENTS.md changed and why.

Done when: only AGENTS.md and one handoff note changed.
```

---

## Wave 1: Parallel workgroups

### WG-D Sequencer (`crates/sequencer`)

#### D1 Shared score matrix and single-pass catalog stats

```
Read AGENTS.md first. You own crates/sequencer only.

Problem: CatalogGraph::get_catalog_summary_stats scores all N*(N-1) song pairs for average compatibility, then find_clusters scores them again, then find_outliers scores them again and runs outgoing.iter().find and incoming.iter().find inside a loop over every other song. For 587 songs that is about 201M linear scans, 12 to 24 seconds.

Do:
1. Add a ScoreMatrix type: a flat Vec<f32> of N*N overall_score values built once per CatalogGraph with evaluate_song_relationship, plus a stable index map from song id to row. Build it in parallel with rayon if the crate already depends on it. If it does not, add it only to this crate and note it in the handoff.
2. Rewrite get_catalog_summary_stats, find_clusters, and find_outliers to read from the matrix. No per-song Vec<SongRelationship> allocation, no .find() scans.
3. Keep the previous implementations behind #[cfg(test)] as reference_* functions. Add a test on a fixed-seed synthetic catalog of 80 songs asserting new and old produce identical clusters, outliers, and stats (floats within 1e-6).
4. Keep every public signature unchanged.

Done when: the equivalence test passes and a Criterion bench on 587 synthetic songs shows summary stats under 300 ms on this machine.
```

#### D2 Simulated annealing without allocation churn

```
Read AGENTS.md first. You own crates/sequencer only.

Problem: solve_simulated_annealing clones the whole candidate Vec on every iteration (about 35,000 allocations) and refine_dynamic_trajectory re-checks about 172,000 2-opt pairs for up to 10 passes.

Do:
1. Mutate the path in place and undo the move on rejection. No clone per iteration.
2. Compute delta cost from only the changed edges. Keep a debug assertion that full-path cost equals incremental cost, run in tests only.
3. In refine_dynamic_trajectory, add a neighbor list (K best next tracks per track, K around 20 to 30) so 2-opt only tries promising pairs. Make K a named constant.
4. Keep determinism: same seed, same output as before for paths up to 12 tracks (Held-Karp range). For larger sets, assert the new cost is no worse than the old cost over 20 seeded random catalogs.

Done when: tests pass, suggest_order on 60 tracks is at least 5x faster in a Criterion bench, and no result got worse.
```

#### D3 Cancellation, progress, and bench budgets

```
Read AGENTS.md first. You own crates/sequencer and benches/.

Do:
1. Add an optional cancellation hook (an Arc<AtomicBool> passed into the solvers and the matrix build) checked at loop boundaries, so the UI can cancel a long suggest_order.
2. Add an optional progress callback (fraction 0.0 to 1.0) for the solvers. Default is no-op so existing callers compile unchanged.
3. Extend benches/ with: matrix build at 587 songs, summary stats, suggest_order at 20 and 60 tracks. Put the budget numbers from docs/handoffs/P0.1-baseline.md beside each bench in a comment.
4. Document in the handoff exactly which new parameters src-tauri must pass. Do not edit src-tauri.

Done when: cancelling mid-solve returns promptly with a typed Cancelled error, and benches run with cargo bench.
```

### WG-C Library (`crates/library-db`, `crates/audio-io`)

#### C1 SQLite access patterns

```
Read AGENTS.md first. You own crates/library-db only.

Do:
1. Audit every PRAGMA and connection setup. Ensure WAL, synchronous=NORMAL, busy_timeout, foreign_keys=ON, and a sensible cache_size are set in one place.
2. Check what list_songs loads. If it pulls large blobs (waveform, energy curve, segments) for every song, add list_song_summaries returning only the fields the graph and library table need, and keep list_songs for callers that need everything.
3. Provide a read-only connection opener so src-tauri can run long reads without sharing the write connection mutex. Document it. Do not edit src-tauri.
4. Add a monotonic catalog_revision counter (a small table row or user_version style value) bumped on any write that changes analysis, overrides, or the track set. Expose get_catalog_revision. D1's score matrix cache will key on it later.
5. Run EXPLAIN QUERY PLAN on the 10 most frequent queries. Add missing indexes through a new migration file. Never edit an existing migration.

Done when: migrations apply cleanly on a copy of the real DB, existing tests pass, and the handoff lists each index with the query it serves.
```

#### C2 Remove unwrap and expect

```
Read AGENTS.md first. You own crates/library-db and crates/audio-io only.

Goal: enforce the "no unwrap or expect outside tests" rule.

Do:
1. List every unwrap() and expect() outside #[cfg(test)] and tests/ in your crates. Write the list to the handoff first.
2. Replace each with a typed error (thiserror) or a justified infallible form. Mutex poisoning must be recovered or reported, not panic.
3. Add #![deny(clippy::unwrap_used, clippy::expect_used)] at the crate roots with #![cfg_attr(test, allow(clippy::unwrap_used, clippy::expect_used))].
4. Decode of corrupt or truncated files must return an error and never panic. Add tests with a truncated WAV and a zero-byte MP3.

Done when: clippy passes with the deny lints and the corrupt-file tests pass.
```

#### C3 Fast, safe rescans

```
Read AGENTS.md first. You own crates/library-db only.

Do:
1. Make rescans incremental: skip hashing and analysis when path, size, and mtime match the stored row. Hash only when they differ.
2. Add cooperative cancellation and a progress callback to the scanner, default no-op.
3. Test paths containing emoji, spaces, and non-ASCII characters (for example a folder named "📂 2_Coding_and_Development"), and drive-letter paths. Test a missing drive mid-scan: it must mark files unavailable and not delete analysis data.
4. Never write to the scanned folder.

Done when: rescanning an unchanged 587-track library finishes in a small fraction of the first scan, and the missing-drive test passes.
```

### WG-P Playback (`crates/playback`)

#### P1 Fix audition silence and decouple the click mixer

```
Read AGENTS.md first. You own crates/playback only.
Read docs/handoffs or the file HANDOFF_PLAYBACK_COMPUTE_UI_REMEDIATION.md section 2 before starting.

Problem: AudioPlayer::play always builds ClickTrackSource and mixes it with the decoder when a beat grid exists, even with click disabled. Mix can end early or go silent on frame count mismatch or after a seek.

Do:
1. Only build the click source when click is enabled. Otherwise append the decoder directly with no mixing. Handle the seek skip in both paths.
2. When the user toggles click on during playback, rebuild the sink at the current position without an audible gap longer than about 50 ms.
3. Extract the "which source chain to build" decision into a pure function that returns an enum (Plain, PlainSeek, Mixed, MixedSeek) so it is unit-testable without an audio device.
4. Make ClickTrackSource stop when its beat list ends and never terminate the mix early. Add a test that a Mix of a 10 s source and a click source shorter than 10 s still yields 10 s.

Done when: the new tests pass and the handoff states which cases were verified by ear on a real device.
```

#### P2 Playback robustness

```
Read AGENTS.md first. You own crates/playback only.

Do:
1. Add a real stop() that drops the sink, resets the clock to zero, and releases the file handle.
2. Handle output device loss or change: surface a typed error and allow re-open without restarting the app.
3. Verify sample rate and channel count mismatches are resampled or rejected cleanly, including mono files and 48 kHz or 96 kHz sources.
4. Make seek accurate to within a few ms for MP3 (VBR) and FLAC. Add tests with fixture files in fixtures/.
5. Replace any lock().unwrap() with poison-safe handling.
6. Document the position clock contract: who owns time, update rate, and what happens when speed is 0.8x or 1.2x.

Done when: tests pass and the contract is written in the crate docs.
```

### WG-B DSP (`crates/audio-analysis`, `tools/validate`)

#### B1 Real validation set from your own corrections

```
Read AGENTS.md first. You own tools/validate and fixtures/ only.

Problem: validation uses 3 tracks, so accuracy numbers are noise (key exact match 1 of 3).

Do:
1. Add a command that exports ground truth from the library DB's analysis overrides table (tracks where the user corrected BPM or key in the app). Treat corrected values as truth. Write them to a CSV in the existing validation.csv format plus a source column.
2. Add a command that picks a stratified sample of N unlabeled tracks (spread across BPM, mode, and loudness) and writes a CSV template with truth columns blank, so the user can fill them in.
3. Report with confidence: show counts, not just percentages, and flag any metric computed from fewer than 20 tracks.
4. Add a regression gate: tools/validate fails if BPM within +/-0.5 or key exact match drops more than a set tolerance versus a stored baseline file.
5. Never copy or write audio. Reference files by path only.

Done when: the tool runs end to end on a copy of the real DB and the report states its sample size.
```

#### B2 Key detection accuracy

```
Read AGENTS.md first. You own crates/audio-analysis/src/tonal only.

Evidence from the current report: D major detected where truth was D minor (mode error, Camelot distance 3), and E minor detected where truth was A minor (fifth error).

Do:
1. Using the validation set from B1, build a confusion table of detected vs truth key and mode. Write it to the handoff before changing code.
2. Evaluate, one change at a time: alternative key profiles (Krumhansl-Kessler, Temperley, Sha'ath), tuning estimation before chroma, harmonic-percussive separation before chroma, bass-weighted chroma, and per-segment voting weighted by segment energy.
3. Keep a change only if exact and adjacent accuracy improve on the validation set and BPM results are unchanged.
4. Keep the pipeline deterministic and pure Rust. Do not add ML dependencies.
5. Where confidence is low, expose a confidence value so the UI can show "uncertain" rather than a wrong key.

Done when: the handoff has before and after numbers with sample sizes, and tests pin the new behavior.
```

#### B3 Analysis throughput

```
Read AGENTS.md first. You own crates/audio-analysis only.

Baseline: about 1.3 s per 3 to 6 minute track, so a 587-track first scan is roughly 13 minutes serial.

Do:
1. Profile one representative track (cargo flamegraph or samply). Put the top 10 hot spots in the handoff.
2. Reuse FFT planners and scratch buffers across frames. Remove per-frame allocations in the STFT novelty, chroma, and waveform paths.
3. Share one STFT across stages that currently recompute it, if any.
4. Do not parallelize inside a track. Track-level parallelism belongs to the scanner and is bounded by thread count.
5. Output must match the old output: identical BPM and key, and float features within 1e-4. Add a golden test against stored fixture results.

Done when: Criterion analysis_bench shows a measured speedup and golden tests pass.
```

### WG-E Export (`crates/exporters`)

#### E1 Exporter hardening

```
Read AGENTS.md first. You own crates/exporters only.

Do:
1. Rekordbox XML: escape all attribute values, and generate correct file location URIs for Windows paths with spaces, drive letters, emoji, and non-ASCII characters. Add snapshot tests.
2. M3U8: write UTF-8, and offer absolute and relative path modes.
3. CSV set sheet: quote fields containing commas, quotes, or newlines. Add an option for a UTF-8 BOM so Excel opens it correctly.
4. Round trip: parse the generated Rekordbox XML back with a strict XML parser in a test and check track count, order, BPM, and key.
5. Titles and artists with markup characters or very long values must not break any format.

Done when: all snapshot and round-trip tests pass.
```

### WG-F UI (`ui/`)

#### F1 Restore the global transport bar and fix the sidebar footer

```
Read AGENTS.md first. You own ui/ only.
Read HANDOFF_PLAYBACK_COMPUTE_UI_REMEDIATION.md sections 4 and 5 first. Follow them. Where this prompt and that document disagree, that document wins.

Do:
1. Create ui/src/components/transport/GlobalTransportBar.tsx with the sub-components in section 4.2 and mount it in App.tsx with the visibility rule and pb-14 main padding from 4.3.
2. Bind it to the existing Zustand playback state. Do not add a second source of truth for position or volume.
3. Fix the sidebar footer exactly as in section 5.2, including the scrollable nav region.
4. Move the topology canvas card clear of the sidebar edge.
5. Tests: transport bar renders only when an audition is active, hides in stage and track routes, scrub click calls seek with the right ms, stop calls the stop client method.
6. playback_stop is added to src-tauri by G1. Until then, keep the existing pause plus seek(0) fallback behind the client interface and note it in the handoff.

Done when: tests pass and the layout holds at 125 and 150 percent Windows scaling.
```

#### F2 Design tokens

```
Read AGENTS.md first. You own ui/ only.

Problem: about 1,750 hard-coded hex colors across TSX files.

Do:
1. Extract the distinct colors and group them by role (surfaces, borders, text levels, accent amber, key colors, success, warning, danger). Write the proposed token table to the handoff first.
2. Define the tokens in the Tailwind theme (CSS variables underneath) and replace hard-coded hex values file by file.
3. Merge near-duplicates (for example several grays within a few units of each other) into one token. Keep Camelot wheel key colors as their own token set.
4. Add a lint check (a small script run in the typecheck step) that fails on new hex literals in TSX, with an allowlist for the key color table.
5. Screenshot-compare the main views before and after. Differences must be limited to the merged near-duplicates.

Done when: hex literals in TSX drop to near zero, the lint check passes, and views look the same.
```

#### F3 Type scale and accessibility

```
Read AGENTS.md first. You own ui/ only.

Problem: about 300 uses of text-[9px], text-[10px], and text-[11px], many in dim grays on near-black.

Do:
1. Regenerate the list with grep. Group by component and purpose (label, badge, table cell, helper text).
2. Define a type scale in the Tailwind theme with a named minimum. Use 12px as the smallest size for anything a user must read, and allow 11px only for uppercase tracked micro-labels. Stage mode gets a larger scale suited to reading from a distance.
3. Compute contrast for every text color token against its usual backgrounds. Anything under 4.5:1 for body text gets raised. Record the table in the handoff.
4. Check keyboard focus rings on every interactive element, aria-labels on icon buttons, and that no information is color-only (Camelot keys also show their code text).
5. Fill in the placeholder rules in AGENTS.md section 4 left by P0.2.

Done when: no text below the named minimum except allowlisted micro-labels, contrast table shows no failures, and tests pass.
```

#### F4 Split the big modules

```
Read AGENTS.md first. You own ui/ only.

Targets: ui/src/api/index.ts (1,809 lines), ui/src/store/useAppStore.ts (1,355), LibraryView.tsx (1,004), SetlistView.tsx (835), WaveformCanvas.tsx (672).

Do:
1. api/index.ts: split by domain (library, analysis, sequencer, discovery, playback, export, dialogs). Keep the Backend interface and a barrel index.ts so imports elsewhere do not break.
2. useAppStore.ts: split into Zustand slices (library, setlist, playback, ui, overrides). Components must read through narrow selectors, never the whole store.
3. LibraryView and SetlistView: extract table row, toolbar, filters, and dialogs into their own files. Target under about 400 lines per file.
4. Do not hand-write any type that exists in generated ts-rs bindings.
5. This is a pure refactor: no behavior change, no style change, existing 317 tests pass untouched. If a test must change, explain why in the handoff.

Done when: no file in ui/src exceeds about 600 lines (generated bindings excluded) and all gates pass.
```

#### F5 Runtime performance and async UX

```
Read AGENTS.md first. You own ui/ only.

Do:
1. Profile with React DevTools and the browser performance panel on a 587-row library. Record the top re-render offenders in the handoff.
2. The playback position event arrives many times per second. Make sure it updates only the transport bar and playhead components, not the library table or setlist. Use selector granularity and requestAnimationFrame batching.
3. Check the library table is truly virtualized and row components are memoized with stable props.
4. WaveformCanvas: cache the static waveform in an offscreen canvas and redraw only the playhead and overlays per frame.
5. Discovery and suggest-order calls: show a loading state, ignore stale responses (request id or abort), and add a Cancel button wired to the cancellation command once G1 exposes it. Until then, only ignore stale results.
6. Debounce filters and search.

Done when: the position tick causes no re-render outside transport and waveform in a profiler trace, and the handoff includes before and after numbers.
```

---

## Wave 2: Integration (one agent, in order)

### G1 Tauri command layer

```
Read AGENTS.md first. You own src-tauri/ and are allowed to wire in changes described in the Wave 1 handoff notes.

Do:
1. Convert compute-heavy commands to async with tokio::task::spawn_blocking: get_catalog_summary_stats, get_catalog_clusters, get_catalog_outliers, get_song_relationships, get_unusual_transitions, get_potential_bridges, explore_candidate_paths, suggest_order.
2. In each, take the data you need from SQLite inside a short scoped lock block and drop the guard before computing. Prefer the read-only connection and list_song_summaries from C1. No command may hold state.db across compute.
3. Cache the ScoreMatrix per catalog_revision (C1, D1) so repeated discovery views are instant. Invalidate on revision change.
4. Register playback_stop and wire it per the remediation handoff section 2.2. Wire the D3 cancellation and progress hooks as Tauri commands and events.
5. Replace Result<T, String> and any remaining unwrap or expect with the structured AppError. Mutex poison must map to an error, not a panic.
6. Add a test or log-timestamp harness proving a get_catalog_summary_stats call does not delay a concurrent set_volume or list call.

Done when: during a suggest_order on 60 tracks, other commands still respond in under about 50 ms.
```

### G2 Setlist persistence

```
Read AGENTS.md first. Read DOMAIN_AND_PERSISTENCE_AUDIT.md first.

Step 1: check current status. Does a setlist survive an app restart today? Record the answer in the handoff before changing anything.

If it does not, do:
1. Add migrations (new files only) for setlists and setlist items in library-db, with WAL-safe writes, and Tauri commands to load, save, rename, and delete.
2. Autosave on change with a short debounce. A crash must lose at most the last few seconds.
3. Move the title and artist overrides now stored in localStorage into the database. Write a one-time import from localStorage so no existing edit is lost, then stop using localStorage for them.
4. Keep exports reading from the persisted setlist.

Done when: add tracks, kill the process, relaunch, and the setlist and overrides are intact.
```

### G3 Reconcile the docs

```
Read AGENTS.md first.

Do:
1. MANIFEST.md says the global bottom transport bar is complete, while the remediation handoff says it was reverted. After F1 lands, make MANIFEST.md state the true current status.
2. Regenerate MANIFEST numbers (file counts, LOC, test counts, binary size, build date) from real command output, not by hand. Prefer a script in scripts/ that writes them.
3. Update DOMAIN_AND_PERSISTENCE_AUDIT.md status to reflect what is done and what remains.
4. Mark completed prompts in ANTIGRAVITY_PROMPTS.md as done and link to their handoffs.
5. Do not edit legal notices.

Done when: every number in MANIFEST.md is reproducible by a script.
```

### G4 Release and archive tooling

```
Read AGENTS.md first. You own scripts/ and the build_archive.ps1 script.

Problems seen: the zip uses backslash entry names, which breaks extraction on macOS and Linux. Generated files (src-tauri/gen/schemas/*) and a duplicate 380 KB icon.png (in src-tauri/icons and ui/public) are packaged.

Do:
1. Build the file list from git ls-files plus untracked non-ignored files, instead of a hand-written exclude list. Keep the existing exclude list as a second safety check.
2. Write zip entries with forward slashes. Verify with a test that reads the zip back and rejects any entry containing a backslash.
3. Exclude generated schema files if they are regenerated by the build. Confirm that before excluding.
4. Deduplicate the icon: reference one copy in the build where possible. Check which Windows icon sizes are actually required and report any unused ones. Do not delete anything without listing it in the handoff.
5. Add SHA-256 of the zip to archive_stats.json.
6. Make rebuild.ps1 fail fast if any quality gate fails.
7. Add a commit message convention note to AGENTS.md (for example "almost v1" style messages are replaced by type(scope): summary).

Done when: the zip extracts cleanly on Linux, and stats show lower size with no required file missing.
```

### G5 Final verification

```
Read AGENTS.md first. Do not change source files except to fix defects found here.

Do:
1. Run all five quality gates.
2. Re-run every timing from docs/handoffs/P0.1-baseline.md and produce a before and after table.
3. Run the manual matrix from the remediation handoff section 7: VERIFY-AUDITION, VERIFY-STOP, VERIFY-COMPUTE-DISCOVERY, VERIFY-COMPUTE-SUGGEST, VERIFY-LAYOUT-DPI, VERIFY-READONLY. Mark each pass or fail with notes.
4. Re-run tools/validate with the expanded set and record sample sizes.
5. Rebuild the installer and record sizes.
6. List anything that regressed or was skipped. Do not hide failures.
7. Tag cleanup-v1 only if all gates pass.

Done when: docs/handoffs/G5-final.md contains the before and after tables and an honest pass or fail list.
```
