# B3 Segmentation and Cue Placement
Status: done
Changed:
- crates/audio-analysis/src/structure/mod.rs
- docs/handoffs/b3-structure-cues.md

Added deps:
- None (uses existing core-types and audio-analysis modules)

Public API:
- `audio_analysis::structure`:
  - `pub const CUE_COLOR_A: &str = "#00FF00";` (Emerald Green, First Downbeat)
  - `pub const CUE_COLOR_B: &str = "#00FFFF";` (Cyan, End of Intro)
  - `pub const CUE_COLOR_C: &str = "#0088FF";` (Blue, First Breakdown)
  - `pub const CUE_COLOR_D: &str = "#FF8800";` (Orange, First Drop)
  - `pub const CUE_COLOR_E: &str = "#9900FF";` (Purple, Second Breakdown)
  - `pub const CUE_COLOR_F: &str = "#FF0000";` (Red, Second Drop)
  - `pub const CUE_COLOR_G: &str = "#FFFF00";` (Yellow, Outro Mix-Out)
  - `pub const CUE_COLOR_H: &str = "#FF007F";` (Hot Pink, Percussive Loop)
  - `pub const CUE_COLORS: [&str; 8];`
  - `pub const CUE_LABELS: [&str; 8];`
  - `pub fn segment(rhythm: &RhythmAnalysis, dynamics: &DynamicsAnalysis) -> Result<Vec<Segment>, AnalysisError>`
  - `pub fn segment_grid(grid: &BeatGrid, dynamics: &DynamicsAnalysis) -> Result<Vec<Segment>, AnalysisError>`
  - `pub fn segment_from_buffer(buffer: &AudioBuffer, grid: &BeatGrid, energy: &EnergyCurve) -> Result<Vec<Segment>, AnalysisError>`
  - `pub fn place_cues(segments: &[Segment], grid: &BeatGrid) -> Result<Vec<CuePoint>, AnalysisError>`

Implementation details:
- `segment`:
  - Groups frames by bar downbeats from `BeatGrid`.
  - Computes normalized RMS energy, low-band (<150 Hz) ratio, and spectral centroid per musical bar.
  - Groups bars into 8-bar macro phrases aligned to downbeats from first downbeat.
  - Evaluates energy level, energy trend (first-half vs. second-half slope), and track position (intro, drop history, tail) to classify sections into `intro`, `buildup`, `drop`, `breakdown`, and `outro`.
  - Merges adjacent consecutive blocks sharing identical labels while maintaining downbeat snapping and continuity across boundaries.
  - Computes 1-10 energy rating per segment based on normalized RMS energy.
- `place_cues`:
  - Implements cue registers 0 through 7 (A through H) as defined in AGENTS.md §6.6:
    - Cue A (0): First downbeat from beat grid (`grid.first_downbeat_ms`).
    - Cue B (1): End of intro section where bass/percussion enters (`intro.end_ms`).
    - Cue C (2): Start of first breakdown.
    - Cue D (3): Start of first drop.
    - Cue E (4): Start of second breakdown (skipped if absent).
    - Cue F (5): Start of second drop (skipped if absent).
    - Cue G (6): Mix-out point, start of outro.
    - Cue H (7): 4 or 8 bar loop in a high-percussion region near the outro (e.g. last 8 bars of drop preceding outro, or initial 8 bars of outro).
  - Skips cues for non-existent sections per AGENTS.md §6.6 rules ("If a section does not exist, skip that cue. Never invent one.").
  - Assigns fixed display hex colors per cue register.

Tests:
- `test_fixture_labels_and_boundaries`: 120-bar fixture at 128 BPM (intro 16 bars, buildup 8 bars, drop 32 bars, breakdown 16 bars, drop 32 bars, outro 16 bars) produces exact labels `[Intro, Buildup, Drop, Breakdown, Drop, Outro]`, exact downbeat boundaries within 1 bar, continuous non-overlapping intervals, and expected energy ratings.
- `test_fixture_cues_placement`: verifies placement of Cues A, B, C, D, F, G, H on the expected bars, validates skipping Cue E for single-breakdown tracks, checks fixed hex colors, and verifies 8-bar loop bounds on Cue H.
- `test_fixture_with_two_breakdowns_places_cue_e`: verifies an 8-section track with 2 breakdowns generates all 8 cues (A through H) with Cue E placed on the second breakdown.
- `test_invalid_input_rejections`: verifies empty beat grid, empty dynamics, and non-positive BPM return `AnalysisError::InvalidInput`.

Known gaps:
- Classical DSP rule-based approach handles EDM, House, Techno, Trance, DnB, and structured dance music with standard 8-bar phrasing. Tracks with non-standard phrase lengths (e.g., 6-bar transitions or live un-quantized music) snap to nearest downbeats but may benefit from future neural segmentation tier.

Needs from others:
- Pipeline integration in `src-tauri` / app orchestrator can call `structure::segment(&rhythm, &dynamics)` and `structure::place_cues(&segments, &rhythm.grid)` directly using the analysis results from rhythm and dynamics.
