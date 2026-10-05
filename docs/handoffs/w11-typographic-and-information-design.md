# w11-typographic-and-information-design Typographic and Information Design Refinement

Status: done

## Summary
Executed an end-to-end typography and information-density refinement across SETLIST:
- Elevated technical musical numbers (BPM, Camelot Key, musical mode, energy, integrated LUFS, sequence position, timecodes, and cue labels) into beautiful, tabular, and highly readable studio-grade telemetry.
- Replaced container box inflation (nested cards, thick borders, dark container boxes, and heavy background wrappers) with whitespace, precise alignment, subtle 1px divider rules, and typographic hierarchy.
- Audited all primary screens under the question: "Does this information deserve to occupy this much visual space?" and eliminated visual noise while preserving 100% of underlying features, keyboard shortcuts, test IDs, and accessibility roles.
- Normalized legacy fallback em-dash characters (`—`) to clean hyphens (`-`) or midpoint separators (`·`) across technical metrics and fallbacks.

## Key Changes by Surface

### 1. Global Design System & Typography Tokens (`ui/src/index.css`)
- Added `.te-num`: Enforces `tabular-nums` and `font-feature-settings: "tnum" 1, "zero" 1` with `-0.02em` tracking for rock-solid tabular numeral alignment across all technical values.
- Added `.te-silkscreen`: Uppercase 10px monospace labels with `0.08em` tracking in muted secondary tone (`var(--text-muted)`) for studio-hardware style headers.
- Added `.te-unit`: Dedicated unit label utility (`BPM`, `LUFS`, `cents`, `bars`) styled in 10px monospace with calibrated contrast.
- Added `.te-divider`: Crisp hardware dividing mark (`#2b2b38`) for inline metric ribbons.
- Added `.te-metric`: Bold monospace lead metric typography for hero telemetry values.

### 2. Setlist Builder Rows (`ui/src/features/setlist/SortableTrackItem.tsx`)
- **Sequence Position & Timeline Interval**: Position number formatted in bold high-contrast tabular typography (`.te-num`), with timeline interval timecode neatly aligned beneath.
- **Track Identity**: Established clear typographic contrast between bold white track title and muted secondary artist name (`#9898a4`), removing visual clutter.
- **Camelot Key**: Crisp monospace badge with 1px border (`border-black/30`) and harmonic color accent.
- **BPM**: Tabular numeral with muted uppercase unit (`126 BPM`), cleanly right-aligned.
- **Energy**: Removed the nested box container (`bg-[#161616] p-0.5 border border-[#222222]`); replaced with a sleek borderless 10-bar micro-gauge paired with `.te-num` rating (`E7`).
- **Duration**: Tabular monospace timecode aligned to the right.
- **Fallbacks**: Normalized legacy `'—'` em-dashes to `'-'`.

### 3. Transition Rail Link (`ui/src/features/setlist/TransitionCostBadge.tsx`)
- **Eliminated Nested Cards**: Removed the three inner boxes (`bg-[#0e0e0e] px-2 py-0.5 border border-[#222222]`) that boxed Key, BPM, and Energy individually.
- **Unified Hardware Telemetry Bus**: Formatted between-track relationships in a single continuous telemetry row separated by fine typographic divider marks (`|` in `#2b2b38`):
  `8A → 9A (Harmonic 5th)` · `126 → 128 (+2)` · `E6 → E7 (+1)` · `LOW COST · Smooth`.
- Preserved all verdict badges, background tones, test IDs, and Find Bridge triggers.

### 4. Constraint Cockpit (`ui/src/features/setlist/ConstraintCockpit.tsx`)
- **Unified Controls Strip**: Replaced three isolated boxed buttons groups (`PINS`, `ARC`, `PREFERENCE`) with a unified continuous architectural strip (`bg-[#0a0a0d] border border-[#191922] divide-x divide-[#191922]`).
- **Refined Duration Progress**: Eliminated the chunky container box around the time progress readout; aligned current duration, target duration, and needed delta with crisp tabular numbers (`.te-num`).

### 5. Track Detail Telemetry (`ui/src/features/track/TrackView.tsx`)
- **Studio Hardware Telemetry Strip**: Replaced 4 bulky isolated card boxes (`p-3 bg-[#0a0a0a] border border-[#1c1c1c]`) with a cohesive horizontal telemetry console (`bg-[#0a0a0d] border border-[#191922] divide-y sm:divide-y-0 sm:divide-x divide-[#191922]`).
- **Tempo**: Bold 2xl tabular number with micro silkscreen label above and beat-grid stability badge below.
- **Key & Tuning**: Bold Camelot identifier with musical mode name and tuning cents (`440.0 Hz` / `+1.2 cents`).
- **Energy**: Bold rating with an integrated micro-rule gauge replacing the thick container.
- **Loudness**: Bold integrated LUFS numeral with secondary LRA and True Peak values cleanly separated by midpoint bullets (`·`).

### 6. Live Performance View (`ui/src/features/stage/StageMode.tsx`)
- Refined `MetricCard` with `.te-silkscreen`, `.te-num`, and calibrated contrast (`#0a0a0d` with `#191922` border).
- Updated `StageMode.test.tsx` to scope transition advice assertions (`within(transitionInfo)`), ensuring reliable test isolation across parallel Vitest workers.

### 7. Playback Transport Bar (`ui/src/features/track/PlaybackBar.tsx`)
- Eliminated redundant box container around time readout; styled current playhead timecode in bold high-contrast white tabular numerals, with total duration in muted secondary tone.
- Refined tactile transport hitboxes with subtle borders (`#22222c`).

### 8. Transition Dual-Deck & Modal (`DualDeckWaveform.tsx`, `TransitionLabModal.tsx`)
- Normalized fallback em-dashes (`'—'` -> `'-'`).
- Applied `.te-num` and `.te-unit` to Deck A/B telemetry, delta values, and cue markers.

## Changed Files:
- `ui/src/index.css`: Added precision typographic utilities (`.te-num`, `.te-silkscreen`, `.te-unit`, `.te-divider`, `.te-metric`).
- `ui/src/features/setlist/SortableTrackItem.tsx`: Refined sequence position, track identity, Camelot key, BPM, borderless energy micro-gauge, duration, and normalized em-dashes.
- `ui/src/features/setlist/TransitionCostBadge.tsx`: Removed 3 nested card boxes; unified into a continuous telemetry row with subtle 1px divider marks.
- `ui/src/features/setlist/SetlistView.test.tsx`: Normalized fallback em-dash in transition rail assertion to match updated component.
- `ui/src/features/setlist/ConstraintCockpit.tsx`: Replaced 3 boxed card groups with a unified architectural control strip; refined duration progress readout typography.
- `ui/src/features/setlist/BridgeFinderModal.tsx`: Normalized key and BPM fallbacks; refined candidate card typography.
- `ui/src/features/setlist/TrackSelectionDrawer.tsx`: Refined track card typography; added `.te-num` and normalized em-dashes.
- `ui/src/features/track/TrackView.tsx`: Transformed 4 bulky card boxes into a unified studio hardware telemetry strip with clear typographic hierarchy.
- `ui/src/features/track/PlaybackBar.tsx`: Refined time readout typography; removed container box; calibrated transport button contrast.
- `ui/src/features/track/cues/FourPointCueChips.tsx`: Added `.te-num` to cue timecode display.
- `ui/src/features/stage/StageMode.tsx`: Refined `MetricCard` typography and borders.
- `ui/src/features/stage/StageMode.test.tsx`: Scoped transition advice assertion with `within(transitionInfo)`.
- `ui/src/features/library/LibraryView.tsx`: Enhanced BPM, Key, Energy, LUFS, and Duration table columns with `.te-num` and refined borders.
- `ui/src/features/transition/DualDeckWaveform.tsx`: Normalized key and BPM fallbacks; refined deck metrics.
- `ui/src/features/transition/TransitionLabModal.tsx`: Normalized key fallbacks; refined relationship ribbon typography.

## Tests & Verification:
- **UI Tests**: 43 test files passed, 477 tests passed (`pnpm --dir ui test --run`).
- **Typecheck**: `pnpm --dir ui typecheck` (`tsc -b --noEmit`) clean with zero errors.
- **Rust Tests**: 20 unit tests + 25 integration tests passed (`cargo test -p app`).
