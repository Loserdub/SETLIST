# Antigravity Prompt Pack: DJ Set Assistant

## How to run this

1. Put `AGENTS.md` in the repo root.
2. Run Wave 0 with one agent, in order. Commit and tag `contracts-v1` when it passes.
3. Start Wave 1. Give each workgroup its own agent and its own git branch. Workgroups own separate folders, so they will not collide.
4. Inside a workgroup, run prompts in order. Wait for each handoff note before sending the next prompt.
5. Merge Wave 1 branches. Then run Wave 2 with one agent.

Branches: `wg-a-rhythm`, `wg-b-tonal`, `wg-c-library`, `wg-d-sequencer`, `wg-e-export`, `wg-f-ui`.

If you want fewer agents at once, pair them like this: A with D, B with E, C with F.

Each prompt starts with "Read AGENTS.md". Keep that line. It forces the rules into context even if the IDE does not load the file on its own.

```
Wave 0  Foundation (1 agent, sequential)
          P0.1 -> P0.2
Wave 1  Parallel
          WG-A Rhythm      A1 -> A2
          WG-B Tonal       B1 -> B2 -> B3 -> B4
          WG-C Library     C1 -> C2 -> C3
          WG-D Sequencer   D1 -> D2 -> D3
          WG-E Export      E1 -> E2
          WG-F UI          F1 -> F2 -> F3 -> F4
Wave 2  Integration (1 agent, sequential)
          G1 -> G2 -> G3 -> G4
```

---

## Wave 0: Foundation

### P0.1 Workspace scaffold

```
Read AGENTS.md first.

Goal: create the empty skeleton so six agents can work later without touching the same files.

Do:
1. Create a Cargo workspace with members: core-types, audio-io, audio-analysis, library-db, sequencer, exporters, src-tauri.
2. Each crate gets Cargo.toml and src/lib.rs with a one-line doc comment. No logic.
3. In audio-analysis, lib.rs declares: pub mod rhythm; pub mod tonal; pub mod dynamics; pub mod structure; pub mod waveform. Each is a folder with a mod.rs stub.
4. Create src-tauri as a Tauri 2 app with one command: ping, returning "pong".
5. Create ui/ with Vite, React, TypeScript (strict), Tailwind, Zustand, Vitest. The home page calls ping and shows the result.
6. Add rustfmt.toml, .gitignore, docs/handoffs/.gitkeep, fixtures/.gitkeep, and a README with the run commands from AGENTS.md section 5.

Done when:
- cargo build --workspace passes.
- pnpm --dir ui build passes.
- pnpm tauri dev opens a window that shows "pong".

Do not write any analysis or UI logic.
```

### P0.2 Contracts, Camelot, and schema

```
Read AGENTS.md first. Work in crates/core-types, crates/library-db/migrations, and the stub files created in P0.1.

Goal: define every shared type and function signature, so later agents code against fixed contracts.

Do:
1. In core-types, define with serde and ts-rs derives (export to ui/src/bindings):
   AudioBuffer { sample_rate, samples: Vec<f32> } (mono)
   LoudnessInfo { integrated_lufs, loudness_range, true_peak }
   TrackTags { title, artist, album }
   DecodedAudio { buffer, loudness, tags, duration_ms, source_sample_rate }
   BeatGrid { first_downbeat_ms, bpm, beats_ms: Vec<f64>, downbeat_flags: Vec<bool>, steady: bool }
   RhythmAnalysis { grid, bpm_alternates: Vec<f64> }
   Key { pitch_class, mode, camelot, tuning_cents }
   DynamicsAnalysis { frame_rate, rms_curve, low_ratio_curve, centroid_curve }
   EnergyCurve { per_bar: Vec<f32> }, energy_score: u8
   Segment { label, start_ms, end_ms, energy }, SegmentLabel enum per AGENTS.md 6.7
   CuePoint { index (0-7), time_ms, label, color_hex, kind: HotCue | MemoryCue | Loop, loop_end_ms }
   Waveform3Band { points_per_sec, low, mid, high } (u8 arrays, peak and rms)
   TrackAnalysis (all of the above) and Track (id, path, hash, analysis, analyzed_at, analysis_version)
   CostWeights, EnergyProfile, TransitionType, TransitionAdvice, SetlistEntry, ExportTarget
2. Implement crates/core-types/src/camelot.rs fully: Camelot::from_key, to_standard_name, shift_by_semitones, distance (returns d and mode_flip). Test every row of the AGENTS.md 6.1 table and the shift math in 6.1.
3. Add stub function signatures that return Err(NotImplemented):
   rhythm::analyze_rhythm(&AudioBuffer, &RhythmConfig)
   tonal::analyze_key(&AudioBuffer)
   dynamics::analyze_dynamics(&AudioBuffer)
   dynamics::energy_score(...), dynamics::energy_curve(...)
   structure::segment(...), structure::place_cues(...)
   waveform::compute_waveform(&AudioBuffer)
   audio-io::decode_file(path)
   sequencer and exporters entry points as listed in AGENTS.md section 3.
4. Write crates/library-db/migrations/0001_init.sql with tables: tracks, structural_segments, cue_points, setlists, setlist_entries, plus an analysis_blobs table for waveform and energy curve. Store the beat grid as constant fields on tracks (first_downbeat_ms, bpm, steady) plus an optional beats_json column. Include 'buildup' in the segment label CHECK.

Done when: cargo test --workspace passes, ts bindings are generated, and the Camelot tests pass.
Tag the commit contracts-v1.
```

---

## Wave 1, Workgroup A: Rhythm

Branch `wg-a-rhythm`. Owns `crates/audio-analysis/src/rhythm`.

### A1 Onset and global tempo

```
Read AGENTS.md first. Work only in crates/audio-analysis/src/rhythm (onset.rs, tempo.rs).

Goal: turn an AudioBuffer into a novelty curve and a global BPM.

Do:
1. STFT with rustfft. Hann window of about 32 ms (1411 samples, zero-pad to 2048). Hop of 256 samples.
2. Mel filterbank (40 bands). Log-compress. Compute spectral flux per band. Half-wave rectify. Sum into one novelty curve. Expose the frame rate.
3. Global tempo: autocorrelate the novelty curve. Weight by a log-normal prior. Make the center (default 125 BPM) and width configurable in RhythmConfig. Keep the width wide so drum and bass and slow hip hop still work.
4. Refine the peak with parabolic interpolation.
5. Return the best BPM plus alternates for x2 and x0.5.

Tests (synthetic):
- Click tracks at 90, 128, 150, and 174 BPM. Result within 0.5 BPM, or the correct octave appears in alternates.
- Click track plus noise still passes at 128.
- Print the run time for a 6 minute buffer in a release test.

Done when: tests pass and a 6 minute buffer analyzes in under 3 seconds on the CPU.
```

### A2 Beat tracking and downbeats

```
Read AGENTS.md first. Work only in crates/audio-analysis/src/rhythm (beats.rs, downbeat.rs) and rhythm/mod.rs.

Goal: produce a BeatGrid that DJ software can use.

Do:
1. Beat tracking by dynamic programming. Objective: D(t) = O(t) + max over tau of ( D(t - tau) - alpha * (ln(tau / tau0))^2 ). Normalize the novelty curve first. Start with alpha near 100 and tune on tests. Backtrace the best path.
2. Fit a constant grid to the tracked beats: least-squares offset and BPM. Set steady = true when the residuals stay small. DJ software expects a fixed grid in v1.
3. Downbeats for 4/4: compute low-band (under 150 Hz) energy at each beat. Pick the phase of 4 with the highest mean. Fill downbeat_flags and first_downbeat_ms.
4. Wire analyze_rhythm to run A1 then A2 and return RhythmAnalysis.

Tests (synthetic):
- Click track with an accented first beat. Downbeat phase is correct.
- Start offset of 137 ms is recovered within 10 ms.
- Tempo drift of under 0.5 percent sets steady = true.

Done when: tests pass and analyze_rhythm returns real data.
```

---

## Wave 1, Workgroup B: Tonal, dynamics, structure, waveform

Branch `wg-b-tonal`. Owns `tonal`, `dynamics`, `structure`, `waveform`.

### B1 Key detection

```
Read AGENTS.md first. Work only in crates/audio-analysis/src/tonal.

Goal: detect musical key and tuning offset.

Do:
1. Compute a 12-bin chromagram from an STFT (not CQT yet). Use harmonic-peak picking with a frequency range of about 60 Hz to 5 kHz.
2. Estimate tuning from the deviation of spectral peaks against 440 Hz. Return tuning_cents. Compensate for it before folding to chroma.
3. Correlate the mean chroma against 24 key templates. Use Krumhansl-Kessler by default. Put the template set behind an enum so Temperley or EDMA can be added later.
4. Map the result to Key with core-types Camelot. Return a confidence value.

Tests (synthetic):
- Additive-harmonic major and minor triads in all 24 keys. At least 22 of 24 correct. Wrong ones must be relative or fifth neighbors.
- A tone set tuned to 432 Hz reports about -31.8 cents within 10 cents, and still resolves the right key.

Done when: tests pass.
```

### B2 Dynamics and energy

```
Read AGENTS.md first. Work only in crates/audio-analysis/src/dynamics.

Goal: compute the features behind the 1 to 10 energy score. LUFS is computed in audio-io (C1), so take it as an input.

Do:
1. analyze_dynamics: frame-level RMS, spectral centroid, and low-frequency power ratio under 150 Hz. Return DynamicsAnalysis at a fixed frame rate.
2. energy_curve: aggregate the features per bar using the BeatGrid. Return EnergyCurve.
3. energy_score: combine integrated LUFS, mean low ratio, mean centroid, and mean RMS into 1 to 10. Put the weights and bounds in an EnergyModel struct with documented defaults. Use fixed bounds, not library-relative scaling.

Tests (synthetic):
- Louder and bassier signals score higher than quiet and thin ones. Check monotonic order across 5 signals.
- A signal with a quiet middle shows a dip in the per-bar curve.

Done when: tests pass.
```

### B3 Segmentation and cue placement

```
Read AGENTS.md first. Work only in crates/audio-analysis/src/structure. Use RhythmAnalysis and DynamicsAnalysis as inputs. Do not call neural models.

Goal: rule-based sections and the 8 cue points.

Do:
1. Build a test-only fixture generator: intro (hats only, 16 bars), buildup (8 bars, rising), drop (kick and bass, 32 bars), breakdown (no kick, 16 bars), drop, outro (kick fades, 16 bars). Use 128 BPM.
2. segment(): use per-bar low-band and total energy. Place boundaries on downbeats. Prefer multiples of 8 bars from the first downbeat. Label with intro, buildup, drop, breakdown, outro using energy level, trend, and position.
3. place_cues(): create cues A to H as in AGENTS.md 6.6. Skip cues for sections that do not exist. Cue H is a 4 or 8 bar loop in a high-percussion region near the outro. Use fixed colors per cue.

Tests: the fixture yields the right labels, boundaries within one bar, and cues A to H on the expected bars.

Done when: tests pass.
```

### B4 Multi-band waveform

```
Read AGENTS.md first. Work only in crates/audio-analysis/src/waveform.

Goal: a 3-band waveform for the UI.

Do:
1. 4th-order Butterworth filters as cascaded biquads. Low pass under 150 Hz. Band pass 150 to 2500 Hz. High pass above 2500 Hz.
2. For each band, compute peak and RMS downsampled to 150 points per second. Normalize to u8.
3. Return Waveform3Band. Add compact encode and decode functions for storing it in the database.

Tests: sines at 60, 1000, and 8000 Hz each light up mainly the expected band. Encode then decode returns the same data.

Done when: tests pass and a 6 minute buffer renders in under 2 seconds.
```

---

## Wave 1, Workgroup C: Library and ingest

Branch `wg-c-library`. Owns `audio-io` and `library-db`.

### C1 Decode and loudness

```
Read AGENTS.md first. Work only in crates/audio-io.

Goal: decode any common audio file into a DecodedAudio.

Do:
1. Use symphonia for MP3, FLAC, WAV, AIFF, AAC and M4A, and OGG. Handle 16, 24, and 32-bit sources.
2. While decoding, feed the stereo stream to the ebur128 crate. Return integrated LUFS, loudness range, and true peak in LoudnessInfo.
3. Downmix to mono and resample to 44100 Hz with rubato. Return AudioBuffer.
4. Read tags with lofty. Return TrackTags. Missing tags are None, never an error.
5. Return a clear error for corrupt or unsupported files. Never panic.

Tests: generate WAV files in test code (mono, stereo, 24-bit, 48 kHz). Check length, sample rate, and a known-level sine against its expected LUFS within 0.5 LU.

Done when: tests pass.
```

### C2 SQLite repository

```
Read AGENTS.md first. Work only in crates/library-db.

Goal: persist tracks, analysis, cues, and setlists.

Do:
1. A migration runner that applies migrations/*.sql in order and records the version.
2. Repo functions: upsert_track (match on file hash, then path), save_analysis, get_track, list_tracks with filters (bpm range, camelot keys, energy range, text search), replace_cues, save_setlist, load_setlist.
3. Use transactions. Use the BLOB helpers from waveform for waveform storage.

Tests on an in-memory database: round trip a full TrackAnalysis, filter queries, cascade delete, and re-import of a moved file keeps its analysis.

Done when: tests pass.
```

### C3 Folder scanner and job queue

```
Read AGENTS.md first. Work only in crates/library-db/src/scan (new module) and its tests.

Goal: scan a folder and analyze new files in the background.

Do:
1. Walk a folder with walkdir. Keep supported extensions only.
2. Hash each file with blake3 over the size plus the first and last 1 MB. Skip files whose hash is already analyzed at the current analysis_version.
3. A worker pool (default: cores minus 1) runs jobs through a trait: Analyzer { fn analyze(&self, path) -> Result<TrackAnalysis> }. Do not depend on audio-analysis. Use a fake analyzer in tests.
4. Emit progress events through a channel: Queued, Started, Done, Failed with the error text. Support cancel.

Tests: temp folder with mixed files, skip logic, failure isolation (one bad file does not stop the rest), cancel.

Done when: tests pass.
```

---

## Wave 1, Workgroup D: Sequencer

Branch `wg-d-sequencer`. Owns `crates/sequencer`. Pure logic, no audio.

### D1 Scoring functions

```
Read AGENTS.md first. Work only in crates/sequencer (scoring.rs, profiles.rs).

Goal: implement the cost model in AGENTS.md 6.3 and 6.4.

Do:
1. phi_tempo with octave detection.
2. phi_key using core-types Camelot distance and the table in 6.3.
3. phi_energy, normalized and clamped.
4. phi_timbre returns 0.
5. transition_cost(a, b, weights, profile_slope) returning the total and each term.
6. Energy profiles: target_energy(profile, k, n) and dE_target(profile, k, n) for linear ramp, wave, and plateau.

Tests: every row of the key table, octave pairs like 70 and 140 BPM, clamping at 1.0, weights summing correctly, and profile shapes.

Done when: tests pass.
```

### D2 Order solver

```
Read AGENTS.md first. Work only in crates/sequencer (matrix.rs, solve.rs).

Goal: find a low-cost track order. The user can pin anchors.

Do:
1. Build the n by n directed cost matrix from D1.
2. Open Hamiltonian path with optional first and last anchors and an optional must-exclude list.
3. n up to 12: exact Held-Karp.
4. n above 12: simulated annealing with 2-opt and or-opt moves. Respect anchors. Take a seed for determinism.
5. Public API: order_tracks(tracks, weights, profile, pins, seed) returning the order and per-edge cost breakdown.
Skip ILP and Lin-Kernighan.

Tests: Held-Karp matches brute force for n up to 8. Anchors always hold. Same seed gives the same result. n = 60 finishes in under 1 second in release.

Done when: tests pass.
```

### D3 Transition advisor

```
Read AGENTS.md first. Work only in crates/sequencer (advisor.rs, bridge.rs).

Goal: recommend how to mix track A into track B.

Do:
1. advise(a, b) -> TransitionAdvice { type, recommended_bars, out_cue, in_cue, notes }.
2. Rules, checked in this order:
   - Intervention: ΔBPM > 8 or key distance d > 3. Prefer a tempo ramp if A has a percussion-free breakdown. Otherwise echo-out freeze.
   - Half-step lift or tritone: direct cut, echo-out, or drop-swap. Never a long overlap.
   - Strong energy contrast or B starts at a buildup: drop-swap. Cut on beat 4 of the last build bar. B lands on beat 1 of its drop.
   - A outro shorter than 16 bars: loop extension using cue H.
   - Consonant keys, ΔBPM at most 4, outro of 16 bars or more: EQ and filter blend over 16 or 32 bars. Bass swap on a phrase start.
3. out_cue uses cue G where possible. in_cue uses cue A or B.
4. suggest_bridge(a, b, library) returns the top 3 tracks that minimize cost(a, x) + cost(x, b).
5. Notes are short plain sentences.

Tests: one test per rule, plus fallback behavior when cues are missing.

Done when: tests pass.
```

---

## Wave 1, Workgroup E: Export

Branch `wg-e-export`. Owns `crates/exporters`.

### E1 Rekordbox XML writer

```
Read AGENTS.md first. Work only in crates/exporters.

Goal: write a Rekordbox XML file that Rekordbox can import.

Do:
1. Use quick-xml. Build DJ_PLAYLISTS with PRODUCT, COLLECTION, TRACK, TEMPO, POSITION_MARK, and PLAYLISTS.
2. TEMPO: Inizio is the first downbeat in seconds (3 decimals). Bpm, Metro 4/4, Battito 1.
3. POSITION_MARK: hot cues use Type 0 and Num 0 to 7. Memory cues use Num -1. Loops use Type 4 with an End attribute. Times in seconds. RGB from the cue color.
4. Location: file://localhost/ plus a percent-encoded path. Handle Windows drive letters and spaces.
5. Tonality: write standard notation (for example Am) by default. Add an option for Camelot notation.
6. Escape all text. Assign unique TrackIDs. Never overwrite an existing file unless asked.
7. Write docs/EXPORT_REKORDBOX.md with a short manual import checklist.

Tests: re-parse the output with quick-xml, golden file match, path encoding cases, Num mapping, and loop output.

Note in your handoff: the Tonality and Camelot display behavior must be verified in a real Rekordbox import.

Done when: tests pass.
```

### E2 Setlist export and CLI

```
Read AGENTS.md first. Work only in crates/exporters.

Goal: export a whole setlist in three formats, plus a CLI for testing without the UI.

Do:
1. Rekordbox playlist node with ordered track keys (extend E1).
2. M3U8 with #EXTINF lines and absolute paths.
3. Set sheet as CSV and Markdown: order, title, artist, BPM, Camelot key, energy, transition type, recommended bars, out cue and in cue.
4. A binary export-cli that reads a JSON file (setlist plus analyses) and writes all three outputs to a chosen folder.

Tests: golden files for each format, and an end-to-end CLI test using a small JSON fixture.

Done when: tests pass.
```

---

## Wave 1, Workgroup F: UI

Branch `wg-f-ui`. Owns `ui/`. Works against a mock backend until Wave 2.

### F1 Shell and mock backend

```
Read AGENTS.md first. Work only in ui/.

Goal: the app shell, routing, and a typed backend interface with mock data.

Do:
1. Dark theme. Layout with a sidebar and four routes: Library, Track, Setlist, Settings.
2. Define a Backend interface in ui/src/api: scanFolder, listTracks, getTrack, suggestOrder, getAdvice, exportSet, and an event subscription for progress.
3. Implement mockBackend with 40 generated tracks, fake analysis, fake waveform, and fake progress events. Add a tauriBackend that throws "not wired". Select the backend with one flag.
4. Use the generated types from ui/src/bindings. Do not redefine them.
5. Add a camelotColor helper and a Zustand store for tracks and the active setlist.

Tests: mock backend returns valid data. camelotColor covers all 24 keys.

Done when: typecheck, tests, and build pass, and the app shows the empty routes.
```

### F2 Library view

```
Read AGENTS.md first. Work only in ui/src/features/library.

Goal: a fast, filterable track table.

Do:
1. Virtualized table (TanStack Table plus a virtualizer). Columns: title, artist, BPM, Camelot key (colored chip), energy, LUFS, duration.
2. Sort on any column. Filters: BPM range, key (include harmonically compatible keys), energy range, text search.
3. A Scan Folder button and a progress bar driven by backend events.
4. Click a row to open the Track route. Multi-select adds tracks to the setlist.

Tests: sort, filter, and key-compatibility logic as pure functions.

Done when: the table scrolls smoothly with 5,000 mock tracks.
```

### F3 Waveform component

```
Read AGENTS.md first. Work only in ui/src/features/track and ui/src/components/waveform.

Goal: the 3-band waveform with structure overlays.

Do:
1. Canvas component. Low band blue, mid band amber, high band white.
2. Overlays: beat ticks, stronger downbeat lines, colored segment bands with labels, and cue markers A to H.
3. Zoom and scroll with wheel and drag. Click sets a playhead position in state. No audio playback.
4. Render only the visible window. Keep 60 fps while panning.
5. Track route shows the waveform, the key, BPM, energy, and a list of cues.

Tests: the time-to-pixel math and visible-window slicing as pure functions.

Done when: the component renders mock tracks smoothly at several zoom levels.
```

### F4 Setlist builder

```
Read AGENTS.md first. Work only in ui/src/features/setlist.

Goal: build and tune a set.

Do:
1. Setlist list with drag and drop reorder (dnd-kit). Lock-first and lock-last toggles.
2. Energy profile selector: linear ramp, wave, plateau. Chart the set energy against the target curve.
3. Suggest Order button calls backend.suggestOrder with the pins.
4. Between each pair, show a cost badge with the tempo, key, and energy parts. Click it to open an advice panel from backend.getAdvice.
5. Export button with format choice. Calls backend.exportSet.

Tests: reorder logic and pin handling as pure functions.

Done when: the full flow works against the mock backend.
```

---

## Wave 2: Integration

One agent. Start after Wave 1 branches are merged.

### G1 Pipeline and Tauri commands

```
Read AGENTS.md first. Work in crates/audio-analysis/src/pipeline.rs and src-tauri/.

Goal: connect the engines to the app.

Do:
1. pipeline::analyze_decoded(&DecodedAudio) -> TrackAnalysis. Run rhythm, key, dynamics, structure, cues, and waveform in the right order. Run independent steps in parallel with rayon.
2. Implement the scanner Analyzer trait with this pipeline.
3. Tauri commands that match the UI Backend interface: scan_folder, list_tracks, get_track, suggest_order, get_advice, export_set. Emit progress events.
4. App state holds the database and the job queue. Store the database in the app data folder.

Tests: an integration test over generated audio files runs scan to database to list.

Done when: cargo test passes and the commands run from a Tauri dev build.
```

### G2 Wire the UI

```
Read AGENTS.md first. Work only in ui/.

Do:
1. Implement tauriBackend with invoke and event listeners.
2. Make it the default. Keep mockBackend for tests and Storybook-style dev.
3. Add error toasts, loading states, and an empty state for a first launch.

Done when: scanning a real folder fills the library, and a setlist can be built and exported end to end.
```

### G3 Validation harness

```
Read AGENTS.md first. Work in a new tools/validate crate.

Goal: measure accuracy on real music.

Do:
1. A CLI that analyzes a folder and prints CSV: file, BPM, key, Camelot, LUFS, energy.
2. An optional ground-truth CSV input (file, BPM, key). Report BPM within 0.5, BPM correct up to an octave, exact key, and Camelot-adjacent key. Print the worst 10 files.
3. A manual Rekordbox import checklist in docs/VALIDATION.md: import the XML, check grids, cues, key display, and playlist order.

Done when: the report runs on a folder of 20 files.
```

### G4 Packaging and settings

```
Read AGENTS.md first.

Do:
1. A Settings route: cost weights, key penalty table, energy model weights, worker count. Persist to the database.
2. Structured logging to a file in the app data folder.
3. Windows installer build with the Tauri bundler. Document the steps in docs/BUILD_WINDOWS.md.

Done when: an installer builds and installs on a clean Windows machine.
```

---

## Later phases (no prompts yet)

- Demucs and All-In-One via ONNX Runtime behind a trait
- CQT chroma and better key templates
- Timbre distance from MFCC or embeddings
- Traktor NML and Serato export (write to copies only)
- Audio preview playback
