# 010-transition-advisor Transition Advisor and Bridge Suggester
Status: done
Changed:
- crates/sequencer/src/advisor.rs
- crates/sequencer/src/bridge.rs
- crates/sequencer/src/lib.rs

Added deps:
- None (pure Rust implementation using existing `core-types` and `thiserror`)

Public API:
- `sequencer::advisor`:
  - `TransitionTechnique`: Enum of transition techniques (`TempoRamp`, `EchoOutFreeze`, `DirectCut`, `EchoOut`, `DropSwap`, `LoopExtension`, `EqFilterBlend`) with `as_str()` and `Display`.
  - `TransitionAdvice`: Struct containing:
    - `r#type: TransitionTechnique`
    - `transition_type: TransitionTechnique`
    - `recommended_bars: u32`
    - `phrase_bars: u32`
    - `out_cue: Option<CuePoint>`
    - `in_cue: Option<CuePoint>`
    - `notes: Vec<String>`
    - `harmonic_category: TransitionType`
    - `bpm_delta: f64`
    - `key_distance: u8`
    - `mode_flip: bool`
    - `intervention_required: bool`
    - `loop_extension_recommended: bool`
    - `to_core_advice(&self) -> core_types::TransitionAdvice`
  - `advise(a: &TrackAnalysis, b: &TrackAnalysis) -> TransitionAdvice`: Priority-based rule evaluator:
    1. Intervention: `ΔBPM > 8` or key distance `d > 3`. Prefers tempo ramp (16 bars) if outgoing track A has a percussion-free breakdown; otherwise echo-out freeze (8 bars).
    2. Half-step lift or tritone: short overlap (<= 8 bars) with direct cut, echo-out, or drop-swap avoiding long dissonant clashes.
    3. Strong energy contrast (`|E_a - E_b| >= 3`) or B starts at a buildup: drop-swap cutting on beat 4 of final build bar into beat 1 of drop.
    4. Outro shorter than 16 bars: loop extension (16 bars) using cue H.
    5. Consonant keys, `ΔBPM <= 4`, outro >= 16 bars: EQ and filter blend over 16 or 32 bars with bass swap on phrase boundary.
  - `compute_effective_bpm_delta(bpm_i: f64, bpm_j: f64) -> f64`: Octave-adjusted BPM delta matching `phi_tempo`.
  - `categorize_harmonic_move(key_a: &Camelot, key_b: &Camelot) -> TransitionType`: Maps Camelot keys to harmonic move categories.
  - `is_consonant(key_a: &Camelot, key_b: &Camelot) -> bool`: Consonance check for ExactMatch, RelativeSwitch, and Fifth.
  - `calculate_outro_bars(analysis: &TrackAnalysis) -> f64`: Outro bar duration calculation.
  - `has_percussion_free_breakdown(analysis: &TrackAnalysis) -> bool`: Detects low-energy or low-bass breakdown sections.
  - `starts_at_buildup(b: &TrackAnalysis) -> bool`: Checks if incoming track begins with a buildup section.
- `sequencer::bridge`:
  - `AsTrackAnalysis`: Trait implemented for `Track` and `TrackAnalysis` allowing flexible track referencing.
  - `BridgeCandidate`: Struct holding `track`, `cost_a_to_bridge`, `cost_bridge_to_b`, and `total_cost`.
  - `suggest_bridge<T: AsTrackAnalysis>(a: &T, b: &T, library: &[Track]) -> Vec<Track>`: Returns top 3 library tracks minimizing `cost(a, x) + cost(x, b)`, excluding `a` and `b`.
  - `suggest_bridge_with_weights<T: AsTrackAnalysis>(a: &T, b: &T, library: &[Track], weights: &CostWeights) -> Vec<Track>`.
  - `suggest_bridge_candidates<T: AsTrackAnalysis>(a: &T, b: &T, library: &[Track], weights: &CostWeights) -> Vec<BridgeCandidate>`.
- `sequencer`:
  - `advise_transition(track_a: &TrackAnalysis, track_b: &TrackAnalysis) -> Result<core_types::TransitionAdvice, SequencerError>`: Dispatches to `advise(track_a, track_b)` and converts into `core_types::TransitionAdvice`.

Tests:
- `test_rule_1_intervention_tempo_ramp`: Verifies `TempoRamp` (16 bars) and intervention flags when `ΔBPM > 8` and track A contains a percussion-free breakdown.
- `test_rule_1_intervention_echo_out_freeze`: Verifies `EchoOutFreeze` (8 bars) when `ΔBPM > 8` without breakdown, as well as key distance `d > 3` key clashes.
- `test_rule_2_half_step_lift_or_tritone`: Verifies half-step lift (+7 Camelot shift, +1 semitone) and tritone (+6 Camelot shift, +6 semitones) choose short transitions (`DirectCut`/`EchoOut`, <= 8 bars).
- `test_rule_3_drop_swap`: Verifies `DropSwap` for strong energy contrast (`|E_a - E_b| >= 3`) and incoming buildup starts.
- `test_rule_4_loop_extension`: Verifies `LoopExtension` using Cue H when outro is shorter than 16 bars.
- `test_rule_5_eq_filter_blend`: Verifies `EqFilterBlend` over 16 or 32 bars with Cue G out and Cue A in for consonant keys with `ΔBPM <= 4` and sufficient outro.
- `test_cue_resolution_and_fallback_behavior`:
  - Loop extension missing Cue H falls back to Cue G.
  - Standard blend missing Cue G falls back to Cue H.
  - Blend missing Cue A falls back to Cue B.
  - Drop-swap missing Cue B falls back to Cue A.
  - Empty cues on both tracks cleanly returns `None` for both `out_cue` and `in_cue` with explanatory notes.
- `test_suggest_bridge_top_3`: Verifies top 3 tracks minimizing `cost(a, x) + cost(x, b)`, filtering out source/target tracks and unanalyzed tracks, and ordering by total cost.
- `test_suggest_bridge_analyses_and_empty_library`: Verifies empty library handling and direct usage with `TrackAnalysis` references.

Known gaps:
- High-level `sequence_tracks(&[Track], ...)` remains a stub pending D4 pipeline task.

Needs from others:
- Workgroup F (UI): In `ui/src/features/library/pure.test.ts`, the mock object specifies `cues` instead of `cue_points`, causing `pnpm --dir ui typecheck` to fail. Also `LibraryView.test.tsx` has 2 failing tests that need UI test fixture updates.
