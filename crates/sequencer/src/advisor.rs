//! Transition advisor recommending mixing techniques, phrase lengths, cue points, and guidance.

use crate::scoring::CostModelConfig;
use core_types::{
    Camelot, CostWeights, CuePoint, EnergyProfile, SegmentLabel, TrackAnalysis,
    TransitionAdvice as CoreTransitionAdvice, TransitionType,
};

/// Categorized mixing transition techniques recommended by the advisor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TransitionTechnique {
    /// Gradual tempo adjustment during a percussion-free breakdown.
    TempoRamp,
    /// Echo-out freeze with reverb/delay tail to mask large tempo or key gaps.
    EchoOutFreeze,
    /// Instantaneous cut on phrase boundary to avoid dissonant harmonic clash.
    DirectCut,
    /// Echo-out delay/reverb decay avoiding harmonic clashing.
    EchoOut,
    /// Drop-swap cutting on beat 4 of final buildup bar into incoming track's drop beat 1.
    DropSwap,
    /// Loop extension on cue H when outro phrase is shorter than 16 bars.
    LoopExtension,
    /// Progressive 3-band EQ and filter blend with bass swap across phrase boundary.
    EqFilterBlend,
}

impl TransitionTechnique {
    /// Returns human-readable name of the transition technique.
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TempoRamp => "Tempo Ramp",
            Self::EchoOutFreeze => "Echo-Out Freeze",
            Self::DirectCut => "Direct Cut",
            Self::EchoOut => "Echo-Out",
            Self::DropSwap => "Drop-Swap",
            Self::LoopExtension => "Loop Extension",
            Self::EqFilterBlend => "EQ and Filter Blend",
        }
    }
}

impl std::fmt::Display for TransitionTechnique {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Transition advice and recommendations between two tracks.
#[derive(Debug, Clone, PartialEq)]
pub struct TransitionAdvice {
    /// Transition technique recommendation (e.g. TempoRamp, EchoOutFreeze, DropSwap, etc.).
    pub r#type: TransitionTechnique,
    /// Alias for transition technique.
    pub transition_type: TransitionTechnique,
    /// Recommended transition length in musical bars (8, 16, or 32 bars).
    pub recommended_bars: u32,
    /// Recommended cue point on outgoing track (prefers cue G, or cue H for loop extension).
    pub out_cue: Option<CuePoint>,
    /// Recommended cue point on incoming track (prefers cue A or B).
    pub in_cue: Option<CuePoint>,
    /// Guidance and transition instructions formatted as short plain sentences.
    pub notes: Vec<String>,
    /// Harmonic transition category per AGENTS.md 6.2 (ExactMatch, Fifth, Tritone, etc.).
    pub harmonic_category: TransitionType,
    /// Effective or octave-adjusted BPM difference.
    pub bpm_delta: f64,
    /// Circular distance d on the Camelot wheel (0 to 6).
    pub key_distance: u8,
    /// Whether musical mode flips (minor vs major).
    pub mode_flip: bool,
    /// True if ΔBPM > 8 or key distance d > 3.
    pub intervention_required: bool,
    /// True if outro is shorter than 16 bars.
    pub loop_extension_recommended: bool,
    /// Total weighted transition cost in [0.0, 1.0].
    pub total_cost: Option<f32>,
    /// Unweighted tempo discrepancy term Phi_tempo in [0.0, 1.0].
    pub tempo_cost: Option<f32>,
    /// Unweighted musical key distance term Phi_key in [0.0, 1.0].
    pub key_cost: Option<f32>,
    /// Unweighted energy trajectory penalty term Phi_energy in [0.0, 1.0].
    pub energy_cost: Option<f32>,
    /// Unweighted timbre difference term Phi_timbre in [0.0, 1.0].
    pub timbre_cost: Option<f32>,
    /// Expected energy change target dE_target used for evaluation.
    pub de_target: Option<f32>,
    /// Cost weights applied during evaluation.
    pub weights: Option<CostWeights>,
    /// Energy profile used for transition evaluation if applicable.
    pub profile: Option<EnergyProfile>,
}

impl TransitionAdvice {
    /// Returns the recommended transition technique.
    #[must_use]
    pub fn r#type(&self) -> TransitionTechnique {
        self.r#type
    }

    /// Returns the recommended phrase bars.
    #[must_use]
    pub fn phrase_bars(&self) -> u32 {
        self.recommended_bars
    }

    /// Converts into [`core_types::TransitionAdvice`].
    #[must_use]
    pub fn to_core_advice(&self) -> CoreTransitionAdvice {
        self.clone().into()
    }
}

impl From<TransitionAdvice> for CoreTransitionAdvice {
    fn from(adv: TransitionAdvice) -> Self {
        CoreTransitionAdvice {
            transition_type: adv.harmonic_category,
            bpm_delta: adv.bpm_delta,
            key_distance: adv.key_distance,
            mode_flip: adv.mode_flip,
            intervention_required: adv.intervention_required,
            loop_extension_recommended: adv.loop_extension_recommended,
            phrase_bars: adv.recommended_bars,
            notes: adv.notes,
            total_cost: adv.total_cost,
            tempo_cost: adv.tempo_cost,
            key_cost: adv.key_cost,
            energy_cost: adv.energy_cost,
            timbre_cost: adv.timbre_cost,
            de_target: adv.de_target,
            weights: adv.weights,
            profile: adv.profile,
        }
    }
}

/// Computes the effective BPM delta between two tempos, accounting for octave relations (x2 or x0.5 within 3%).
#[must_use]
pub fn compute_effective_bpm_delta(bpm_i: f64, bpm_j: f64) -> f64 {
    if bpm_i <= 0.0 || bpm_j <= 0.0 || bpm_i.is_nan() || bpm_j.is_nan() {
        return 0.0;
    }

    let ratio = bpm_j / bpm_i;
    let adjusted_bpm_j = if (ratio - 2.0).abs() / 2.0 <= 0.03 {
        bpm_j * 0.5
    } else if (ratio - 0.5).abs() / 0.5 <= 0.03 {
        bpm_j * 2.0
    } else {
        bpm_j
    };

    (bpm_i - adjusted_bpm_j).abs()
}

/// Categorizes the harmonic transition relationship between two Camelot keys per AGENTS.md Table 6.2.
#[must_use]
pub fn categorize_harmonic_move(key_a: &Camelot, key_b: &Camelot) -> TransitionType {
    let (d, mode_flip) = key_a.distance(key_b);
    if d == 0 && !mode_flip {
        TransitionType::ExactMatch
    } else if d == 0 && mode_flip {
        TransitionType::RelativeSwitch
    } else if d == 1 && !mode_flip {
        TransitionType::Fifth
    } else if !mode_flip && key_b.number == key_a.shift_by_semitones(2).number {
        TransitionType::WholeStepLift
    } else if !mode_flip && key_b.number == key_a.shift_by_semitones(1).number {
        TransitionType::HalfStepLift
    } else if !mode_flip && d == 6 {
        TransitionType::Tritone
    } else {
        TransitionType::Other
    }
}

/// Checks if two Camelot keys are consonant (ExactMatch, RelativeSwitch, or Fifth).
#[must_use]
pub fn is_consonant(key_a: &Camelot, key_b: &Camelot) -> bool {
    let (d, mode_flip) = key_a.distance(key_b);
    d == 0 || (d == 1 && !mode_flip)
}

/// Calculates the duration of track A's outro in 4/4 musical bars.
#[must_use]
pub fn calculate_outro_bars(analysis: &TrackAnalysis) -> f64 {
    let bpm = analysis.rhythm.grid.bpm;
    if bpm <= 0.0 {
        return 0.0;
    }
    let bar_duration_ms = 240_000.0 / bpm;

    // Check segments for Outro
    if let Some(outro_seg) = analysis
        .segments
        .iter()
        .find(|s| s.label == SegmentLabel::Outro)
    {
        return (outro_seg.end_ms - outro_seg.start_ms).max(0.0) / bar_duration_ms;
    }

    // Check Cue G (Outro Mix-Out)
    if let Some(cue_g) = analysis
        .cue_points
        .iter()
        .find(|c| c.index == 6 || c.label.to_uppercase().starts_with('G'))
    {
        let track_end = analysis
            .segments
            .last()
            .map(|s| s.end_ms)
            .or_else(|| analysis.rhythm.grid.beats_ms.last().copied())
            .unwrap_or(cue_g.time_ms);
        return (track_end - cue_g.time_ms).max(0.0) / bar_duration_ms;
    }

    0.0
}

/// Checks if track A has a percussion-free breakdown section.
#[must_use]
pub fn has_percussion_free_breakdown(analysis: &TrackAnalysis) -> bool {
    // 1. Look for Breakdown segments
    let breakdown_segs: Vec<_> = analysis
        .segments
        .iter()
        .filter(|s| s.label == SegmentLabel::Breakdown)
        .collect();

    if !breakdown_segs.is_empty() {
        for seg in &breakdown_segs {
            // Check segment energy rating (1..=10)
            if seg.energy <= 4 {
                // If dynamics curve is populated, check low ratio
                if !analysis.dynamics.low_ratio_curve.is_empty()
                    && analysis.dynamics.frame_rate > 0.0
                {
                    let start_frame =
                        ((seg.start_ms / 1000.0) * analysis.dynamics.frame_rate).round() as usize;
                    let end_frame =
                        ((seg.end_ms / 1000.0) * analysis.dynamics.frame_rate).round() as usize;
                    let total_frames = analysis.dynamics.low_ratio_curve.len();
                    let start_idx = start_frame.min(total_frames);
                    let end_idx = end_frame.min(total_frames);
                    if end_idx > start_idx {
                        let slice = &analysis.dynamics.low_ratio_curve[start_idx..end_idx];
                        let avg_low: f32 = slice.iter().sum::<f32>() / slice.len() as f32;
                        if avg_low < 0.25 {
                            return true;
                        }
                    } else {
                        return true;
                    }
                } else {
                    return true;
                }
            }
        }
    }

    // 2. Look for Breakdown Cues (Cue C = index 2, Cue E = index 4)
    let has_breakdown_cue = analysis
        .cue_points
        .iter()
        .any(|c| c.index == 2 || c.index == 4 || c.label.to_lowercase().contains("breakdown"));

    if has_breakdown_cue {
        let is_low_energy = analysis.energy_score <= 4
            || breakdown_segs.iter().any(|s| s.energy <= 4)
            || breakdown_segs.is_empty();
        if is_low_energy {
            return true;
        }
    }

    false
}

/// Checks if incoming track B starts at a buildup section.
#[must_use]
pub fn starts_at_buildup(b: &TrackAnalysis) -> bool {
    if let Some(first_seg) = b.segments.first() {
        if first_seg.label == SegmentLabel::Buildup {
            return true;
        }
    }
    // Also check if buildup is within initial 16 bars
    let bar_ms = if b.rhythm.grid.bpm > 0.0 {
        240_000.0 / b.rhythm.grid.bpm
    } else {
        2000.0
    };
    b.segments
        .iter()
        .take(2)
        .any(|s| s.label == SegmentLabel::Buildup && s.start_ms < bar_ms * 16.0)
}

/// Resolves outgoing and incoming cue points along with explanatory note entries.
fn resolve_cues(
    a: &TrackAnalysis,
    b: &TrackAnalysis,
    technique: TransitionTechnique,
    notes: &mut Vec<String>,
) -> (Option<CuePoint>, Option<CuePoint>) {
    // Helper to find cue by index
    let find_cue = |cues: &[CuePoint], idx: u8| -> Option<CuePoint> {
        cues.iter().find(|c| c.index == idx).cloned()
    };

    // 1. Resolve out_cue
    let out_cue = if technique == TransitionTechnique::LoopExtension {
        // Rule 4: loop extension using cue H
        if let Some(cue_h) = find_cue(&a.cue_points, 7) {
            notes.push("Set out cue to loop cue H for phrase extension.".to_string());
            Some(cue_h)
        } else if let Some(cue_g) = find_cue(&a.cue_points, 6) {
            notes.push("Cue H missing; falling back to mix-out cue G.".to_string());
            Some(cue_g)
        } else {
            notes.push("No outgoing cue points available.".to_string());
            None
        }
    } else {
        // Statement 3: out_cue uses cue G where possible
        if let Some(cue_g) = find_cue(&a.cue_points, 6) {
            notes.push("Set out cue to mix-out cue G.".to_string());
            Some(cue_g)
        } else if let Some(cue_h) = find_cue(&a.cue_points, 7) {
            notes.push("Cue G missing; falling back to loop cue H.".to_string());
            Some(cue_h)
        } else {
            notes.push("No outgoing cue points available.".to_string());
            None
        }
    };

    // 2. Resolve in_cue
    // Statement 3: in_cue uses cue A or B
    let in_cue = if technique == TransitionTechnique::DropSwap
        || technique == TransitionTechnique::DirectCut
    {
        // For drop-swap / cuts, prefer Cue B (where beat drops/enters)
        if let Some(cue_b) = find_cue(&b.cue_points, 1) {
            notes.push("Set in cue to cue B where bass and percussion enter.".to_string());
            Some(cue_b)
        } else if let Some(cue_a) = find_cue(&b.cue_points, 0) {
            notes.push("Cue B missing; falling back to first downbeat cue A.".to_string());
            Some(cue_a)
        } else {
            notes.push("No incoming cue points available.".to_string());
            None
        }
    } else {
        // For blends and other transitions, prefer Cue A (first downbeat)
        if let Some(cue_a) = find_cue(&b.cue_points, 0) {
            notes.push("Set in cue to first downbeat cue A.".to_string());
            Some(cue_a)
        } else if let Some(cue_b) = find_cue(&b.cue_points, 1) {
            notes.push("Cue A missing; falling back to cue B.".to_string());
            Some(cue_b)
        } else {
            notes.push("No incoming cue points available.".to_string());
            None
        }
    };

    (out_cue, in_cue)
}

/// Recommends how to mix track A into track B according to the priority rules.
///
/// Rules evaluated in order:
/// 1. Intervention: ΔBPM > 8 or key distance d > 3.
///    Prefers tempo ramp if A has a percussion-free breakdown. Otherwise echo-out freeze.
/// 2. Half-step lift or tritone: direct cut, echo-out, or drop-swap. Never a long overlap.
/// 3. Strong energy contrast or B starts at a buildup: drop-swap.
///    Cut on beat 4 of last build bar. B lands on beat 1 of its drop.
/// 4. A outro shorter than 16 bars: loop extension using cue H.
/// 5. Consonant keys, ΔBPM at most 4, outro >= 16 bars:
///    EQ and filter blend over 16 or 32 bars. Bass swap on phrase start.
#[must_use]
pub fn advise(a: &TrackAnalysis, b: &TrackAnalysis) -> TransitionAdvice {
    advise_with_cost(a, b, None, None, None)
}

/// Recommends how to mix track A into track B according to the priority rules,
/// evaluating authoritative transition cost terms using provided weights, profile, and dE_target.
#[must_use]
pub fn advise_with_cost(
    a: &TrackAnalysis,
    b: &TrackAnalysis,
    weights: Option<CostWeights>,
    profile: Option<EnergyProfile>,
    de_target: Option<f32>,
) -> TransitionAdvice {
    advise_with_cost_and_config(a, b, weights, profile, de_target, None)
}

/// Recommends how to mix track A into track B according to the priority rules,
/// evaluating authoritative transition cost terms using provided weights, profile, dE_target,
/// and an optional [`CostModelConfig`].
#[must_use]
pub fn advise_with_cost_and_config(
    a: &TrackAnalysis,
    b: &TrackAnalysis,
    weights: Option<CostWeights>,
    profile: Option<EnergyProfile>,
    de_target: Option<f32>,
    config: Option<&CostModelConfig>,
) -> TransitionAdvice {
    let bpm_a = a.rhythm.grid.bpm;
    let bpm_b = b.rhythm.grid.bpm;
    let effective_delta = compute_effective_bpm_delta(bpm_a, bpm_b);
    let (key_dist, mode_flip) = a.key.camelot.distance(&b.key.camelot);
    let harmonic_category = categorize_harmonic_move(&a.key.camelot, &b.key.camelot);

    let is_half_step_lift = harmonic_category == TransitionType::HalfStepLift;
    let is_tritone = harmonic_category == TransitionType::Tritone;
    let outro_bars = calculate_outro_bars(a);
    let energy_contrast = (a.energy_score as i32 - b.energy_score as i32).abs();
    let b_buildup = starts_at_buildup(b);
    let consonant = is_consonant(&a.key.camelot, &b.key.camelot);

    let raw_intervention = effective_delta > 8.0 || key_dist > 3;
    let mut notes = Vec::new();

    // Evaluate rules in strict priority order:
    // Rule 1: Intervention
    // Triggers if ΔBPM > 8, or if key distance d > 3 and not an intentional half-step/tritone move.
    let technique;
    let recommended_bars;

    if effective_delta > 8.0 || (key_dist > 3 && !is_half_step_lift && !is_tritone) {
        if effective_delta > 8.0 && has_percussion_free_breakdown(a) {
            technique = TransitionTechnique::TempoRamp;
            recommended_bars = 16;
            notes.push(
                "Wide tempo difference detected. Ramp tempo during percussion-free breakdown."
                    .to_string(),
            );
        } else {
            technique = TransitionTechnique::EchoOutFreeze;
            recommended_bars = 8;
            if effective_delta > 8.0 {
                notes.push(
                    "Wide tempo gap requires intervention. Echo-out freeze outgoing track."
                        .to_string(),
                );
            } else {
                notes.push(
                    "Wide key gap requires intervention. Echo-out freeze outgoing track."
                        .to_string(),
                );
            }
        }
    } else if is_half_step_lift || is_tritone {
        // Rule 2: Half-step lift or tritone: direct cut, echo-out, or drop-swap. Never long overlap.
        recommended_bars = 8;
        if b_buildup {
            technique = TransitionTechnique::DropSwap;
            notes.push(
                "Harmonic lift into buildup. Drop-swap on beat 4 of the last build bar."
                    .to_string(),
            );
        } else if a.segments.iter().any(|s| s.label == SegmentLabel::Outro) {
            technique = TransitionTechnique::EchoOut;
            if is_half_step_lift {
                notes.push(
                    "Half-step lift energy boost. Echo-out outgoing track to avoid harmonic clash."
                        .to_string(),
                );
            } else {
                notes.push(
                    "Tritone contrast. Echo-out outgoing track to avoid harmonic clash."
                        .to_string(),
                );
            }
        } else {
            technique = TransitionTechnique::DirectCut;
            if is_half_step_lift {
                notes.push(
                    "Half-step lift energy boost. Direct cut on phrase start to avoid harmonic clash."
                        .to_string(),
                );
            } else {
                notes.push(
                    "Tritone contrast. Direct cut on phrase start to avoid harmonic clash."
                        .to_string(),
                );
            }
        }
    } else if energy_contrast >= 3 || b_buildup {
        // Rule 3: Strong energy contrast or B starts at a buildup: drop-swap
        technique = TransitionTechnique::DropSwap;
        recommended_bars = 8;
        notes.push(
            "Cut on beat 4 of the last build bar. B lands on beat 1 of its drop.".to_string(),
        );
    } else if outro_bars < 16.0 {
        // Rule 4: A outro shorter than 16 bars: loop extension using cue H
        technique = TransitionTechnique::LoopExtension;
        recommended_bars = 16;
        notes.push("Outro is shorter than 16 bars. Use cue H for loop extension.".to_string());
    } else if consonant && effective_delta <= 4.0 && outro_bars >= 16.0 {
        // Rule 5: Consonant keys, ΔBPM at most 4, outro >= 16 bars: EQ and filter blend
        technique = TransitionTechnique::EqFilterBlend;
        recommended_bars = if outro_bars >= 32.0 { 32 } else { 16 };
        notes.push(format!(
            "EQ and filter blend over {} bars. Bass swap on a phrase start.",
            recommended_bars
        ));
    } else {
        // Fallback blend for intermediate cases (e.g. consonant keys with 4 < ΔBPM <= 8)
        technique = TransitionTechnique::EqFilterBlend;
        recommended_bars = 16;
        notes.push(
            "Harmonic blend over 16 bars. Align tempo and swap bass on phrase start.".to_string(),
        );
    }

    // Resolve cue points
    let (out_cue, in_cue) = resolve_cues(a, b, technique, &mut notes);

    let active_weights = weights.unwrap_or_default();
    let active_de = de_target.unwrap_or(0.0);
    let cost =
        crate::scoring::transition_cost_with_config(a, b, &active_weights, active_de, config);

    TransitionAdvice {
        r#type: technique,
        transition_type: technique,
        recommended_bars,
        out_cue,
        in_cue,
        notes,
        harmonic_category,
        bpm_delta: (effective_delta * 10.0).round() / 10.0,
        key_distance: key_dist,
        mode_flip,
        intervention_required: raw_intervention,
        loop_extension_recommended: technique == TransitionTechnique::LoopExtension,
        total_cost: Some(cost.total),
        tempo_cost: Some(cost.tempo),
        key_cost: Some(cost.key),
        energy_cost: Some(cost.energy),
        timbre_cost: Some(cost.timbre),
        de_target: Some(active_de),
        weights: Some(active_weights),
        profile,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_types::{
        BeatGrid, CamelotLetter, CueKind, DynamicsAnalysis, EnergyCurve, Key, LoudnessInfo, Mode,
        RhythmAnalysis, Segment, Waveform3Band, WaveformBand,
    };

    fn make_test_analysis(
        bpm: f64,
        camelot_num: u8,
        camelot_letter: CamelotLetter,
        energy: u8,
        segments: Vec<Segment>,
        cues: Vec<CuePoint>,
    ) -> TrackAnalysis {
        TrackAnalysis {
            loudness: LoudnessInfo {
                integrated_lufs: -14.0,
                loudness_range: 6.0,
                true_peak: -1.0,
            },
            rhythm: RhythmAnalysis {
                grid: BeatGrid {
                    first_downbeat_ms: 0.0,
                    bpm,
                    beats_ms: vec![0.0, 500.0, 1000.0],
                    downbeat_flags: vec![true, false, false],
                    steady: true,
                },
                bpm_alternates: vec![],
            },
            key: Key {
                pitch_class: 0,
                mode: match camelot_letter {
                    CamelotLetter::A => Mode::Minor,
                    CamelotLetter::B => Mode::Major,
                },
                camelot: Camelot::new(camelot_num, camelot_letter).unwrap(),
                tuning_cents: 0.0,
            },
            dynamics: DynamicsAnalysis {
                frame_rate: 44100.0,
                rms_curve: vec![],
                low_ratio_curve: vec![],
                centroid_curve: vec![],
            },
            energy_score: energy,
            energy_curve: EnergyCurve { per_bar: vec![] },
            segments,
            cue_points: cues,
            waveform: Waveform3Band {
                points_per_sec: 100,
                low: WaveformBand {
                    peak: vec![],
                    rms: vec![],
                },
                mid: WaveformBand {
                    peak: vec![],
                    rms: vec![],
                },
                high: WaveformBand {
                    peak: vec![],
                    rms: vec![],
                },
            },
        }
    }

    fn make_cue(index: u8, time_ms: f64, label: &str) -> CuePoint {
        CuePoint {
            index,
            time_ms,
            label: label.to_string(),
            color_hex: "#FFFFFF".to_string(),
            kind: if index == 7 {
                CueKind::Loop
            } else {
                CueKind::HotCue
            },
            loop_end_ms: if index == 7 {
                Some(time_ms + 15000.0)
            } else {
                None
            },
        }
    }

    // Rule 1 Test: Intervention - ΔBPM > 8 with percussion-free breakdown in A -> TempoRamp
    #[test]
    fn test_rule_1_intervention_tempo_ramp() {
        // Outro is 16 bars (30000ms at 128 BPM is 16 bars), breakdown segment is energy 2
        let a = make_test_analysis(
            120.0,
            8,
            CamelotLetter::A,
            5,
            vec![
                Segment {
                    label: SegmentLabel::Intro,
                    start_ms: 0.0,
                    end_ms: 32000.0,
                    energy: 4,
                },
                Segment {
                    label: SegmentLabel::Breakdown,
                    start_ms: 32000.0,
                    end_ms: 64000.0,
                    energy: 2,
                },
                Segment {
                    label: SegmentLabel::Drop,
                    start_ms: 64000.0,
                    end_ms: 96000.0,
                    energy: 8,
                },
                Segment {
                    label: SegmentLabel::Outro,
                    start_ms: 96000.0,
                    end_ms: 128000.0,
                    energy: 4,
                },
            ],
            vec![make_cue(6, 96000.0, "G: Outro")],
        );

        // Track B has ΔBPM = 140 - 120 = 20 > 8
        let b = make_test_analysis(
            140.0,
            8,
            CamelotLetter::A,
            6,
            vec![Segment {
                label: SegmentLabel::Intro,
                start_ms: 0.0,
                end_ms: 30000.0,
                energy: 5,
            }],
            vec![make_cue(0, 0.0, "A: Downbeat")],
        );

        let advice = advise(&a, &b);
        assert_eq!(advice.r#type, TransitionTechnique::TempoRamp);
        assert_eq!(advice.recommended_bars, 16);
        assert!(advice.intervention_required);
        assert!(advice.notes.iter().any(|n| n.contains("breakdown")));
    }

    // Rule 1 Test: Intervention - ΔBPM > 8 or key distance d > 3 without percussion-free breakdown -> EchoOutFreeze
    #[test]
    fn test_rule_1_intervention_echo_out_freeze() {
        // Track A has no breakdown, ΔBPM = 135 - 120 = 15 > 8
        let a = make_test_analysis(
            120.0,
            8,
            CamelotLetter::A,
            6,
            vec![
                Segment {
                    label: SegmentLabel::Drop,
                    start_ms: 0.0,
                    end_ms: 60000.0,
                    energy: 8,
                },
                Segment {
                    label: SegmentLabel::Outro,
                    start_ms: 60000.0,
                    end_ms: 92000.0,
                    energy: 5,
                },
            ],
            vec![make_cue(6, 60000.0, "G: Outro")],
        );

        let b = make_test_analysis(
            135.0,
            8,
            CamelotLetter::A,
            6,
            vec![],
            vec![make_cue(0, 0.0, "A: Downbeat")],
        );

        let advice = advise(&a, &b);
        assert_eq!(advice.r#type, TransitionTechnique::EchoOutFreeze);
        assert_eq!(advice.recommended_bars, 8);
        assert!(advice.intervention_required);
        assert!(advice.notes.iter().any(|n| n.contains("Echo-out freeze")));

        // Also test key clash d = 4 (8A to 12A) with moderate tempo gap (ΔBPM = 2 <= 8)
        let a_clash = make_test_analysis(124.0, 8, CamelotLetter::A, 5, vec![], vec![]);
        let b_clash = make_test_analysis(126.0, 12, CamelotLetter::A, 5, vec![], vec![]);
        let advice_clash = advise(&a_clash, &b_clash);
        assert_eq!(advice_clash.r#type, TransitionTechnique::EchoOutFreeze);
        assert!(advice_clash.intervention_required);
    }

    // Rule 2 Test: Half-step lift or tritone -> direct cut, echo-out, or drop-swap; never long overlap
    #[test]
    fn test_rule_2_half_step_lift_or_tritone() {
        // Half-step lift: 8A to 3A (+7 Camelot shift = +1 semitone)
        let a_half = make_test_analysis(
            124.0,
            8,
            CamelotLetter::A,
            5,
            vec![Segment {
                label: SegmentLabel::Outro,
                start_ms: 60000.0,
                end_ms: 92000.0,
                energy: 4,
            }],
            vec![make_cue(6, 60000.0, "G: Outro")],
        );
        let b_half = make_test_analysis(
            125.0,
            3,
            CamelotLetter::A,
            5,
            vec![Segment {
                label: SegmentLabel::Intro,
                start_ms: 0.0,
                end_ms: 30000.0,
                energy: 5,
            }],
            vec![make_cue(0, 0.0, "A: Downbeat")],
        );

        let advice_half = advise(&a_half, &b_half);
        assert_eq!(advice_half.harmonic_category, TransitionType::HalfStepLift);
        // With outro, chooses EchoOut; bars must be <= 8 ("Never a long overlap")
        assert!(matches!(
            advice_half.r#type,
            TransitionTechnique::EchoOut
                | TransitionTechnique::DirectCut
                | TransitionTechnique::DropSwap
        ));
        assert!(advice_half.recommended_bars <= 8);

        // Tritone: 8A to 2A (+6 Camelot shift = +6 semitones), without outro -> DirectCut
        let a_tritone = make_test_analysis(124.0, 8, CamelotLetter::A, 5, vec![], vec![]);
        let b_tritone = make_test_analysis(125.0, 2, CamelotLetter::A, 5, vec![], vec![]);

        let advice_tritone = advise(&a_tritone, &b_tritone);
        assert_eq!(advice_tritone.harmonic_category, TransitionType::Tritone);
        assert_eq!(advice_tritone.r#type, TransitionTechnique::DirectCut);
        assert_eq!(advice_tritone.recommended_bars, 8);
    }

    // Rule 3 Test: Strong energy contrast or B starts at a buildup -> drop-swap
    #[test]
    fn test_rule_3_drop_swap() {
        // Case A: Strong energy contrast (energy 3 to energy 8, diff = 5 >= 3)
        let a_energy = make_test_analysis(
            124.0,
            8,
            CamelotLetter::A,
            3,
            vec![Segment {
                label: SegmentLabel::Outro,
                start_ms: 60000.0,
                end_ms: 92000.0,
                energy: 3,
            }],
            vec![make_cue(6, 60000.0, "G: Outro")],
        );
        let b_energy = make_test_analysis(
            125.0,
            8,
            CamelotLetter::A,
            8,
            vec![Segment {
                label: SegmentLabel::Intro,
                start_ms: 0.0,
                end_ms: 30000.0,
                energy: 8,
            }],
            vec![make_cue(1, 15000.0, "B: Drop/Beat")],
        );

        let advice_energy = advise(&a_energy, &b_energy);
        assert_eq!(advice_energy.r#type, TransitionTechnique::DropSwap);
        assert_eq!(advice_energy.recommended_bars, 8);
        assert!(advice_energy
            .notes
            .iter()
            .any(|n| n.contains("Cut on beat 4 of the last build bar")));

        // Case B: B starts at a buildup
        let a_normal = make_test_analysis(
            124.0,
            8,
            CamelotLetter::A,
            6,
            vec![Segment {
                label: SegmentLabel::Outro,
                start_ms: 60000.0,
                end_ms: 92000.0,
                energy: 6,
            }],
            vec![],
        );
        let b_buildup = make_test_analysis(
            125.0,
            8,
            CamelotLetter::A,
            6,
            vec![
                Segment {
                    label: SegmentLabel::Buildup,
                    start_ms: 0.0,
                    end_ms: 15000.0,
                    energy: 7,
                },
                Segment {
                    label: SegmentLabel::Drop,
                    start_ms: 15000.0,
                    end_ms: 45000.0,
                    energy: 9,
                },
            ],
            vec![make_cue(1, 15000.0, "B: Bass In")],
        );

        let advice_buildup = advise(&a_normal, &b_buildup);
        assert_eq!(advice_buildup.r#type, TransitionTechnique::DropSwap);
    }

    // Rule 4 Test: A outro shorter than 16 bars -> loop extension using cue H
    #[test]
    fn test_rule_4_loop_extension() {
        // At 120 BPM, 1 bar is 2000ms. 10 seconds is 5 bars (< 16 bars).
        let a = make_test_analysis(
            120.0,
            8,
            CamelotLetter::A,
            5,
            vec![Segment {
                label: SegmentLabel::Outro,
                start_ms: 60000.0,
                end_ms: 70000.0,
                energy: 4,
            }],
            vec![
                make_cue(6, 60000.0, "G: Outro"),
                make_cue(7, 62000.0, "H: Percussive Loop"),
            ],
        );
        let b = make_test_analysis(
            122.0,
            8,
            CamelotLetter::A,
            6,
            vec![Segment {
                label: SegmentLabel::Intro,
                start_ms: 0.0,
                end_ms: 32000.0,
                energy: 5,
            }],
            vec![make_cue(0, 0.0, "A: Downbeat")],
        );

        let advice = advise(&a, &b);
        assert_eq!(advice.r#type, TransitionTechnique::LoopExtension);
        assert!(advice.loop_extension_recommended);
        assert_eq!(advice.recommended_bars, 16);
        assert_eq!(advice.out_cue.as_ref().map(|c| c.index), Some(7)); // Uses Cue H
        assert!(advice.notes.iter().any(|n| n.contains("cue H")));
    }

    // Rule 5 Test: Consonant keys, ΔBPM at most 4, outro of 16 bars or more -> EQ and filter blend
    #[test]
    fn test_rule_5_eq_filter_blend() {
        // At 120 BPM, 1 bar = 2000ms. 32000ms is 16 bars.
        let a = make_test_analysis(
            120.0,
            8,
            CamelotLetter::A,
            5,
            vec![Segment {
                label: SegmentLabel::Outro,
                start_ms: 60000.0,
                end_ms: 92000.0,
                energy: 4,
            }],
            vec![make_cue(6, 60000.0, "G: Outro")],
        );
        // Consonant key: 9A is a Fifth (+1 Camelot), ΔBPM = 122 - 120 = 2 <= 4
        let b = make_test_analysis(
            122.0,
            9,
            CamelotLetter::A,
            6,
            vec![Segment {
                label: SegmentLabel::Intro,
                start_ms: 0.0,
                end_ms: 32000.0,
                energy: 5,
            }],
            vec![make_cue(0, 0.0, "A: Downbeat")],
        );

        let advice = advise(&a, &b);
        assert_eq!(advice.r#type, TransitionTechnique::EqFilterBlend);
        assert_eq!(advice.recommended_bars, 16);
        assert_eq!(advice.out_cue.as_ref().map(|c| c.index), Some(6)); // Uses Cue G
        assert_eq!(advice.in_cue.as_ref().map(|c| c.index), Some(0)); // Uses Cue A
        assert!(advice
            .notes
            .iter()
            .any(|n| n.contains("EQ and filter blend")));

        // Test 32-bar outro gives 32 recommended bars
        let a_32 = make_test_analysis(
            120.0,
            8,
            CamelotLetter::A,
            5,
            vec![Segment {
                label: SegmentLabel::Outro,
                start_ms: 60000.0,
                end_ms: 124000.0,
                energy: 4,
            }], // 64s = 32 bars
            vec![make_cue(6, 60000.0, "G: Outro")],
        );
        let advice_32 = advise(&a_32, &b);
        assert_eq!(advice_32.r#type, TransitionTechnique::EqFilterBlend);
        assert_eq!(advice_32.recommended_bars, 32);
    }

    // Cue Resolution & Fallback Behavior Test
    #[test]
    fn test_cue_resolution_and_fallback_behavior() {
        // Case 1: LoopExtension (Rule 4) where Cue H is missing -> falls back to Cue G
        let a_no_h = make_test_analysis(
            120.0,
            8,
            CamelotLetter::A,
            5,
            vec![Segment {
                label: SegmentLabel::Outro,
                start_ms: 60000.0,
                end_ms: 70000.0,
                energy: 4,
            }],
            vec![make_cue(6, 60000.0, "G: Outro")], // Cue G only, no Cue H
        );
        let b = make_test_analysis(
            122.0,
            8,
            CamelotLetter::A,
            5,
            vec![],
            vec![make_cue(0, 0.0, "A: Downbeat")],
        );
        let adv1 = advise(&a_no_h, &b);
        assert_eq!(adv1.out_cue.as_ref().map(|c| c.index), Some(6)); // Fallback to Cue G
        assert!(adv1
            .notes
            .iter()
            .any(|n| n.contains("Cue H missing; falling back to mix-out cue G")));

        // Case 2: Standard blend where Cue G is missing -> falls back to Cue H
        let a_no_g = make_test_analysis(
            120.0,
            8,
            CamelotLetter::A,
            5,
            vec![Segment {
                label: SegmentLabel::Outro,
                start_ms: 60000.0,
                end_ms: 92000.0,
                energy: 4,
            }],
            vec![make_cue(7, 70000.0, "H: Loop")], // Cue H only, no Cue G
        );
        let adv2 = advise(&a_no_g, &b);
        assert_eq!(adv2.out_cue.as_ref().map(|c| c.index), Some(7)); // Fallback to Cue H
        assert!(adv2
            .notes
            .iter()
            .any(|n| n.contains("Cue G missing; falling back to loop cue H")));

        // Case 3: Blend incoming track missing Cue A -> falls back to Cue B
        let b_no_a = make_test_analysis(
            122.0,
            8,
            CamelotLetter::A,
            5,
            vec![],
            vec![make_cue(1, 15000.0, "B: Bass In")], // Cue B only, no Cue A
        );
        let adv3 = advise(&a_no_h, &b_no_a);
        assert_eq!(adv3.in_cue.as_ref().map(|c| c.index), Some(1)); // Fallback to Cue B
        assert!(adv3
            .notes
            .iter()
            .any(|n| n.contains("Cue A missing; falling back to cue B")));

        // Case 4: DropSwap incoming track missing Cue B -> falls back to Cue A
        let a_contrast = make_test_analysis(120.0, 8, CamelotLetter::A, 2, vec![], vec![]);
        let b_only_a = make_test_analysis(
            122.0,
            8,
            CamelotLetter::A,
            8,
            vec![],
            vec![make_cue(0, 0.0, "A: Downbeat")],
        );
        let adv4 = advise(&a_contrast, &b_only_a);
        assert_eq!(adv4.r#type, TransitionTechnique::DropSwap);
        assert_eq!(adv4.in_cue.as_ref().map(|c| c.index), Some(0)); // Fallback to Cue A
        assert!(adv4
            .notes
            .iter()
            .any(|n| n.contains("Cue B missing; falling back to first downbeat cue A")));

        // Case 5: Both tracks have empty cues -> both out_cue and in_cue are None
        let a_empty = make_test_analysis(120.0, 8, CamelotLetter::A, 5, vec![], vec![]);
        let b_empty = make_test_analysis(122.0, 8, CamelotLetter::A, 5, vec![], vec![]);
        let adv5 = advise(&a_empty, &b_empty);
        assert!(adv5.out_cue.is_none());
        assert!(adv5.in_cue.is_none());
        assert!(adv5
            .notes
            .iter()
            .any(|n| n.contains("No outgoing cue points available")));
        assert!(adv5
            .notes
            .iter()
            .any(|n| n.contains("No incoming cue points available")));
    }

    #[test]
    fn test_advise_with_cost_affects_total_and_weights() {
        let a = make_test_analysis(120.0, 8, CamelotLetter::A, 4, vec![], vec![]);
        let b = make_test_analysis(126.0, 9, CamelotLetter::A, 6, vec![], vec![]);

        // 1. Default evaluation
        let adv_default = advise_with_cost(&a, &b, None, None, None);
        assert!(adv_default.total_cost.is_some());
        assert!(adv_default.tempo_cost.is_some());
        assert!(adv_default.key_cost.is_some());
        assert!(adv_default.energy_cost.is_some());
        assert_eq!(adv_default.de_target, Some(0.0));

        // 2. Custom CostWeights affect total cost
        let custom_weights = CostWeights {
            tempo: 1.0,
            key: 0.0,
            energy: 0.0,
            timbre: 0.0,
        };
        let adv_tempo_only = advise_with_cost(&a, &b, Some(custom_weights), None, None);
        assert_eq!(adv_tempo_only.total_cost, adv_tempo_only.tempo_cost);
        assert_ne!(adv_tempo_only.total_cost, adv_default.total_cost);

        // 3. EnergyProfile / dE_target affects energy cost and total cost
        let adv_flat = advise_with_cost(&a, &b, None, Some(EnergyProfile::LinearRamp), Some(0.0));
        let adv_ramped = advise_with_cost(&a, &b, None, Some(EnergyProfile::LinearRamp), Some(2.0));
        // Energy change is 6 - 4 = 2. If dE_target is 2.0, (2 - 2)^2 / 16 = 0.0 energy penalty!
        assert_eq!(adv_ramped.energy_cost, Some(0.0));
        // If dE_target is 0.0, (2 - 0)^2 / 16 = 4 / 16 = 0.25
        assert_eq!(adv_flat.energy_cost, Some(0.25));
        assert!(adv_ramped.total_cost.unwrap() < adv_flat.total_cost.unwrap());

        // 4. Conversion to core types preserves all fields
        let core = adv_ramped.to_core_advice();
        assert_eq!(core.total_cost, adv_ramped.total_cost);
        assert_eq!(core.energy_cost, Some(0.0));
        assert_eq!(core.profile, Some(EnergyProfile::LinearRamp));
        assert_eq!(core.de_target, Some(2.0));
    }

    #[test]
    fn test_rule_1_intervention_key_gap_same_bpm_echo_out_freeze() {
        // Track A and B have exact same BPM (128.0), but key distance is 4 (8A to 12A).
        // Track A has a breakdown segment. Advisor should recommend EchoOutFreeze, NOT TempoRamp.
        let a = make_test_analysis(
            128.0,
            8,
            CamelotLetter::A,
            5,
            vec![Segment {
                label: SegmentLabel::Breakdown,
                start_ms: 30000.0,
                end_ms: 60000.0,
                energy: 2,
            }],
            vec![],
        );
        let b = make_test_analysis(128.0, 12, CamelotLetter::A, 5, vec![], vec![]);
        let advice = advise(&a, &b);
        assert_eq!(advice.r#type, TransitionTechnique::EchoOutFreeze);
        assert!(advice.intervention_required);
        assert!(advice.notes.iter().any(|n| n.contains("Wide key gap")));
        assert!(!advice.notes.iter().any(|n| n.contains("tempo difference")));
    }
}
