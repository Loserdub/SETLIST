//! Structure analysis: segments and cue placement.

use crate::AnalysisError;
use core_types::{
    AudioBuffer, BeatGrid, CueKind, CuePoint, DynamicsAnalysis, EnergyCurve, RhythmAnalysis,
    Segment, SegmentLabel,
};

/// Fixed hex colors per cue register (A through H) for DJ hardware and UI display.
pub const CUE_COLOR_A: &str = "#00FF00"; // Emerald Green (First Downbeat)
pub const CUE_COLOR_B: &str = "#00FFFF"; // Cyan (End of Intro)
pub const CUE_COLOR_C: &str = "#0088FF"; // Blue (First Breakdown)
pub const CUE_COLOR_D: &str = "#FF8800"; // Orange (First Drop)
pub const CUE_COLOR_E: &str = "#9900FF"; // Purple (Second Breakdown)
pub const CUE_COLOR_F: &str = "#FF0000"; // Red (Second Drop)
pub const CUE_COLOR_G: &str = "#FFFF00"; // Yellow (Mix-Out / Start of Outro)
pub const CUE_COLOR_H: &str = "#FF007F"; // Hot Pink (Percussive Loop)

/// Table of fixed colors indexed by cue register (0 to 7).
pub const CUE_COLORS: [&str; 8] = [
    CUE_COLOR_A,
    CUE_COLOR_B,
    CUE_COLOR_C,
    CUE_COLOR_D,
    CUE_COLOR_E,
    CUE_COLOR_F,
    CUE_COLOR_G,
    CUE_COLOR_H,
];

/// Table of default cue descriptions indexed by cue register (0 to 7).
pub const CUE_LABELS: [&str; 8] = [
    "A: First Downbeat",
    "B: Intro End",
    "C: First Breakdown",
    "D: First Drop",
    "E: Second Breakdown",
    "F: Second Drop",
    "G: Outro Mix-Out",
    "H: Percussive Loop",
];

/// Segments audio into musical sections snapped to bar boundaries using rhythm and dynamics analysis.
///
/// Uses per-bar low-band and total energy from [`DynamicsAnalysis`], placing boundaries
/// on downbeats from [`RhythmAnalysis`] (preferring multiples of 8 bars from the first downbeat).
///
/// Sections are classified into `intro`, `buildup`, `drop`, `breakdown`, and `outro` based on
/// energy level, energy trend, and structural position.
///
/// # Errors
/// Returns [`AnalysisError::InvalidInput`] if rhythm or dynamics data is empty or invalid.
pub fn segment(
    rhythm: &RhythmAnalysis,
    dynamics: &DynamicsAnalysis,
) -> Result<Vec<Segment>, AnalysisError> {
    segment_grid(&rhythm.grid, dynamics)
}

/// Segments audio given an explicit [`BeatGrid`] and [`DynamicsAnalysis`].
///
/// # Errors
/// Returns [`AnalysisError::InvalidInput`] if beat grid has no beats/downbeats or dynamics has no frames.
pub fn segment_grid(
    grid: &BeatGrid,
    dynamics: &DynamicsAnalysis,
) -> Result<Vec<Segment>, AnalysisError> {
    if grid.beats_ms.is_empty() || grid.downbeat_flags.is_empty() {
        return Err(AnalysisError::InvalidInput("beat grid has no beats".into()));
    }
    if grid.bpm <= 0.0 {
        return Err(AnalysisError::InvalidInput(
            "grid BPM must be positive".into(),
        ));
    }
    if dynamics.rms_curve.is_empty() || dynamics.frame_rate <= 0.0 {
        return Err(AnalysisError::InvalidInput(
            "dynamics analysis has no frames or invalid frame rate".into(),
        ));
    }

    // Extract downbeats
    let mut downbeats = Vec::new();
    for (&beat_ms, &is_downbeat) in grid.beats_ms.iter().zip(grid.downbeat_flags.iter()) {
        if is_downbeat {
            downbeats.push(beat_ms);
        }
    }
    if downbeats.is_empty() {
        return Err(AnalysisError::InvalidInput(
            "beat grid contains no downbeats".into(),
        ));
    }

    let bar_ms = 4.0 * (60_000.0 / grid.bpm);
    let num_bars = downbeats.len();

    // Compute per-bar total energy, low-band ratio, and spectral centroid
    let mut bar_raw_rms = Vec::with_capacity(num_bars);
    let mut bar_low_ratio = Vec::with_capacity(num_bars);
    let mut bar_centroid = Vec::with_capacity(num_bars);

    for k in 0..num_bars {
        let t_start = downbeats[k];
        let t_end = if k + 1 < num_bars {
            downbeats[k + 1]
        } else {
            downbeats[k] + bar_ms
        };

        let start_frame = (t_start / 1000.0 * dynamics.frame_rate).floor().max(0.0) as usize;
        let end_frame = (t_end / 1000.0 * dynamics.frame_rate).ceil() as usize;
        let end_frame = end_frame.min(dynamics.rms_curve.len());

        if start_frame < end_frame {
            let count = (end_frame - start_frame) as f32;
            let sum_rms: f32 = dynamics.rms_curve[start_frame..end_frame].iter().sum();
            let sum_low: f32 = dynamics.low_ratio_curve[start_frame..end_frame]
                .iter()
                .sum();
            let sum_cent: f32 = dynamics.centroid_curve[start_frame..end_frame].iter().sum();

            bar_raw_rms.push(sum_rms / count);
            bar_low_ratio.push(sum_low / count);
            bar_centroid.push(sum_cent / count);
        } else {
            bar_raw_rms.push(0.0);
            bar_low_ratio.push(0.0);
            bar_centroid.push(2000.0);
        }
    }

    // Normalize per-bar energy so peak = 1.0
    let peak_rms = bar_raw_rms.iter().copied().fold(0.0_f32, f32::max);
    let bar_energy: Vec<f32> = if peak_rms > 1e-6 {
        bar_raw_rms
            .iter()
            .map(|&r| (r / peak_rms).clamp(0.0, 1.0))
            .collect()
    } else {
        vec![0.0; num_bars]
    };

    // Group bars into macro phrases (preferring multiples of 8 bars from first downbeat)
    struct PhraseBlock {
        start_bar: usize,
        end_bar: usize,
        avg_energy: f32,
        avg_low: f32,
        trend: f32,
    }

    let mut blocks = Vec::new();
    let mut b_start = 0;
    while b_start < num_bars {
        let b_end = (b_start + 8).min(num_bars);
        let actual_end = if num_bars - b_end < 4 {
            num_bars
        } else {
            b_end
        };

        let len = actual_end - b_start;
        let avg_e: f32 = bar_energy[b_start..actual_end].iter().sum::<f32>() / len as f32;
        let avg_l: f32 = bar_low_ratio[b_start..actual_end].iter().sum::<f32>() / len as f32;

        let trend = if len >= 4 {
            let mid = b_start + len / 2;
            let first_half: f32 =
                bar_energy[b_start..mid].iter().sum::<f32>() / (mid - b_start) as f32;
            let second_half: f32 =
                bar_energy[mid..actual_end].iter().sum::<f32>() / (actual_end - mid) as f32;
            second_half - first_half
        } else {
            0.0
        };

        blocks.push(PhraseBlock {
            start_bar: b_start,
            end_bar: actual_end,
            avg_energy: avg_e,
            avg_low: avg_l,
            trend,
        });

        b_start = actual_end;
    }

    if blocks.is_empty() {
        return Ok(vec![]);
    }

    // Label each phrase block using energy level, trend, and position
    let num_blocks = blocks.len();
    let mut labels = Vec::with_capacity(num_blocks);
    let mut has_seen_drop = false;

    for (i, blk) in blocks.iter().enumerate() {
        let is_tail = i >= num_blocks.saturating_sub(2);

        // Buildup: distinct rising energy trend towards high energy
        let is_buildup = blk.trend >= 0.12 && blk.avg_energy >= 0.25 && blk.avg_energy <= 0.85;

        // Drop: high total energy and strong low-band energy (kick and bass)
        let is_drop = (blk.avg_energy >= 0.65 && blk.avg_low >= 0.35)
            || (blk.avg_energy >= 0.85 && blk.avg_low >= 0.25);

        // Outro: tail of track with declining energy or fading bass
        let is_outro = has_seen_drop
            && is_tail
            && (blk.trend <= -0.06 || blk.avg_energy < 0.65 || blk.avg_low < 0.35);

        // Breakdown: after drop has occurred, low energy, kick/bass cuts out
        let is_breakdown =
            has_seen_drop && !is_outro && (blk.avg_low < 0.25 || blk.avg_energy < 0.55);

        let label = if is_buildup && !has_seen_drop {
            SegmentLabel::Buildup
        } else if is_drop {
            has_seen_drop = true;
            SegmentLabel::Drop
        } else if is_buildup && has_seen_drop && !is_tail {
            SegmentLabel::Buildup
        } else if is_outro {
            SegmentLabel::Outro
        } else if is_breakdown {
            SegmentLabel::Breakdown
        } else if !has_seen_drop {
            SegmentLabel::Intro
        } else if is_tail {
            SegmentLabel::Outro
        } else if blk.avg_low >= 0.30 {
            SegmentLabel::Drop
        } else {
            SegmentLabel::Breakdown
        };

        labels.push(label);
    }

    // Ensure outro extends to the end once active in the tail
    let mut outro_active = false;
    for (i, label) in labels.iter_mut().enumerate() {
        if *label == SegmentLabel::Outro {
            outro_active = true;
        }
        if outro_active && i >= num_blocks.saturating_sub(2) {
            *label = SegmentLabel::Outro;
        }
    }

    // Merge consecutive blocks with identical label
    let mut segments = Vec::new();
    let mut cur_label = labels[0];
    let mut cur_start_bar = blocks[0].start_bar;
    let mut cur_end_bar = blocks[0].end_bar;

    for (&label, blk) in labels.iter().zip(blocks.iter()).skip(1) {
        if label == cur_label {
            cur_end_bar = blk.end_bar;
        } else {
            let start_ms = downbeats[cur_start_bar];
            let end_ms = if cur_end_bar < num_bars {
                downbeats[cur_end_bar]
            } else {
                downbeats[num_bars - 1] + bar_ms
            };

            let seg_energy_avg: f32 = bar_energy[cur_start_bar..cur_end_bar].iter().sum::<f32>()
                / (cur_end_bar - cur_start_bar) as f32;
            let energy_1_10 = (seg_energy_avg * 9.0 + 1.0).round().clamp(1.0, 10.0) as u8;

            segments.push(Segment {
                label: cur_label,
                start_ms,
                end_ms,
                energy: energy_1_10,
            });

            cur_label = label;
            cur_start_bar = blk.start_bar;
            cur_end_bar = blk.end_bar;
        }
    }

    // Final segment
    let start_ms = downbeats[cur_start_bar];
    let end_ms = if cur_end_bar < num_bars {
        downbeats[cur_end_bar]
    } else {
        downbeats[num_bars - 1] + bar_ms
    };
    let seg_energy_avg: f32 = bar_energy[cur_start_bar..cur_end_bar].iter().sum::<f32>()
        / (cur_end_bar - cur_start_bar) as f32;
    let energy_1_10 = (seg_energy_avg * 9.0 + 1.0).round().clamp(1.0, 10.0) as u8;

    segments.push(Segment {
        label: cur_label,
        start_ms,
        end_ms,
        energy: energy_1_10,
    });

    Ok(segments)
}

/// Segments audio from raw buffer, beat grid, and energy curve.
///
/// # Errors
/// Returns [`AnalysisError`] if dynamics extraction or segmentation fails.
pub fn segment_from_buffer(
    buffer: &AudioBuffer,
    grid: &BeatGrid,
    _energy: &EnergyCurve,
) -> Result<Vec<Segment>, AnalysisError> {
    let dynamics = crate::dynamics::analyze_dynamics(buffer)?;
    segment_grid(grid, &dynamics)
}

/// Computes recommended hot cues and memory/loop cue placement (registers 0-7, A through H) per AGENTS.md 6.6.
///
/// - Cue A (0): First downbeat
/// - Cue B (1): End of intro, percussion or bass enters
/// - Cue C (2): First breakdown
/// - Cue D (3): First drop
/// - Cue E (4): Second breakdown (skipped if missing)
/// - Cue F (5): Second drop (skipped if missing)
/// - Cue G (6): Mix-out point, start of outro
/// - Cue H (7): 4 or 8 bar loop in a high-percussion region near the outro
///
/// Skips cues for sections that do not exist. Uses fixed colors per cue register.
///
/// # Errors
/// Returns [`AnalysisError::InvalidInput`] if beat grid has no beats or BPM <= 0.
pub fn place_cues(segments: &[Segment], grid: &BeatGrid) -> Result<Vec<CuePoint>, AnalysisError> {
    if grid.beats_ms.is_empty() {
        return Err(AnalysisError::InvalidInput("beat grid has no beats".into()));
    }
    if grid.bpm <= 0.0 {
        return Err(AnalysisError::InvalidInput(
            "grid BPM must be positive".into(),
        ));
    }

    let bar_ms = 4.0 * (60_000.0 / grid.bpm);
    let mut cues = Vec::new();

    // Cue A (0): First downbeat
    cues.push(CuePoint {
        index: 0,
        time_ms: grid.first_downbeat_ms,
        label: CUE_LABELS[0].to_string(),
        color_hex: CUE_COLORS[0].to_string(),
        kind: CueKind::HotCue,
        loop_end_ms: None,
    });

    // Cue B (1): End of intro, percussion or bass enters
    if let Some(intro_idx) = segments.iter().position(|s| s.label == SegmentLabel::Intro) {
        let intro_end = segments[intro_idx].end_ms;
        if intro_idx + 1 < segments.len() {
            cues.push(CuePoint {
                index: 1,
                time_ms: intro_end,
                label: CUE_LABELS[1].to_string(),
                color_hex: CUE_COLORS[1].to_string(),
                kind: CueKind::HotCue,
                loop_end_ms: None,
            });
        }
    }

    // Collect breakdowns and drops
    let breakdowns: Vec<&Segment> = segments
        .iter()
        .filter(|s| s.label == SegmentLabel::Breakdown)
        .collect();
    let drops: Vec<&Segment> = segments
        .iter()
        .filter(|s| s.label == SegmentLabel::Drop)
        .collect();

    // Cue C (2): First breakdown
    if let Some(b1) = breakdowns.first() {
        cues.push(CuePoint {
            index: 2,
            time_ms: b1.start_ms,
            label: CUE_LABELS[2].to_string(),
            color_hex: CUE_COLORS[2].to_string(),
            kind: CueKind::HotCue,
            loop_end_ms: None,
        });
    }

    // Cue D (3): First drop
    if let Some(d1) = drops.first() {
        cues.push(CuePoint {
            index: 3,
            time_ms: d1.start_ms,
            label: CUE_LABELS[3].to_string(),
            color_hex: CUE_COLORS[3].to_string(),
            kind: CueKind::HotCue,
            loop_end_ms: None,
        });
    }

    // Cue E (4): Second breakdown (skip if does not exist)
    if breakdowns.len() >= 2 {
        cues.push(CuePoint {
            index: 4,
            time_ms: breakdowns[1].start_ms,
            label: CUE_LABELS[4].to_string(),
            color_hex: CUE_COLORS[4].to_string(),
            kind: CueKind::HotCue,
            loop_end_ms: None,
        });
    }

    // Cue F (5): Second drop (skip if does not exist)
    if drops.len() >= 2 {
        cues.push(CuePoint {
            index: 5,
            time_ms: drops[1].start_ms,
            label: CUE_LABELS[5].to_string(),
            color_hex: CUE_COLORS[5].to_string(),
            kind: CueKind::HotCue,
            loop_end_ms: None,
        });
    }

    // Cue G (6): Mix-out point, start of outro
    let outro_opt = segments.iter().find(|s| s.label == SegmentLabel::Outro);
    if let Some(outro) = outro_opt {
        cues.push(CuePoint {
            index: 6,
            time_ms: outro.start_ms,
            label: CUE_LABELS[6].to_string(),
            color_hex: CUE_COLORS[6].to_string(),
            kind: CueKind::HotCue,
            loop_end_ms: None,
        });
    }

    // Cue H (7): 4 or 8 bar loop in a high-percussion region near the outro
    if let Some(outro) = outro_opt {
        // Last drop preceding the outro
        let drop_before_outro = drops
            .iter()
            .rev()
            .find(|d| d.end_ms <= outro.start_ms + 1.0);
        if let Some(last_drop) = drop_before_outro {
            let drop_duration = last_drop.end_ms - last_drop.start_ms;
            let (loop_len, loop_start) = if drop_duration >= 8.0 * bar_ms {
                (8.0 * bar_ms, last_drop.end_ms - 8.0 * bar_ms)
            } else if drop_duration >= 4.0 * bar_ms {
                (4.0 * bar_ms, last_drop.end_ms - 4.0 * bar_ms)
            } else {
                (4.0 * bar_ms, last_drop.start_ms)
            };

            cues.push(CuePoint {
                index: 7,
                time_ms: loop_start,
                label: CUE_LABELS[7].to_string(),
                color_hex: CUE_COLORS[7].to_string(),
                kind: CueKind::Loop,
                loop_end_ms: Some(loop_start + loop_len),
            });
        } else {
            let outro_duration = outro.end_ms - outro.start_ms;
            let loop_len = if outro_duration >= 8.0 * bar_ms {
                8.0 * bar_ms
            } else {
                4.0 * bar_ms
            };
            cues.push(CuePoint {
                index: 7,
                time_ms: outro.start_ms,
                label: CUE_LABELS[7].to_string(),
                color_hex: CUE_COLORS[7].to_string(),
                kind: CueKind::Loop,
                loop_end_ms: Some(outro.start_ms + loop_len),
            });
        }
    } else if let Some(last_drop) = drops.last() {
        let drop_duration = last_drop.end_ms - last_drop.start_ms;
        let (loop_len, loop_start) = if drop_duration >= 8.0 * bar_ms {
            (8.0 * bar_ms, last_drop.end_ms - 8.0 * bar_ms)
        } else {
            (4.0 * bar_ms, last_drop.start_ms)
        };
        cues.push(CuePoint {
            index: 7,
            time_ms: loop_start,
            label: CUE_LABELS[7].to_string(),
            color_hex: CUE_COLORS[7].to_string(),
            kind: CueKind::Loop,
            loop_end_ms: Some(loop_start + loop_len),
        });
    }

    cues.sort_by_key(|c| c.index);
    Ok(cues)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test fixture generator at 128 BPM matching the exact requirements:
    /// - Intro: hats only, 16 bars
    /// - Buildup: 8 bars, rising
    /// - Drop 1: kick and bass, 32 bars
    /// - Breakdown: no kick, 16 bars
    /// - Drop 2: kick and bass, 32 bars
    /// - Outro: kick fades, 16 bars
    ///
    /// Total: 120 bars = 480 beats = 225.0 seconds.
    fn generate_test_fixture() -> (RhythmAnalysis, DynamicsAnalysis) {
        let bpm = 128.0;
        let beat_ms = 60_000.0 / bpm; // 468.75 ms
        let bar_ms = 4.0 * beat_ms; // 1875.0 ms
        let total_bars = 120;
        let total_beats = total_bars * 4;

        let beats_ms: Vec<f64> = (0..total_beats).map(|b| b as f64 * beat_ms).collect();
        let downbeat_flags: Vec<bool> = (0..total_beats).map(|b| b % 4 == 0).collect();

        let grid = BeatGrid {
            first_downbeat_ms: 0.0,
            bpm,
            beats_ms,
            downbeat_flags,
            steady: true,
        };
        let rhythm = RhythmAnalysis {
            grid,
            bpm_alternates: vec![64.0, 256.0],
        };

        let frame_rate = 44100.0 / 1024.0;
        let total_duration_s = (total_bars as f64 * bar_ms) / 1000.0;
        let num_frames = (total_duration_s * frame_rate).ceil() as usize;

        let mut rms_curve = Vec::with_capacity(num_frames);
        let mut low_ratio_curve = Vec::with_capacity(num_frames);
        let mut centroid_curve = Vec::with_capacity(num_frames);

        for f in 0..num_frames {
            let t_ms = (f as f64 / frame_rate) * 1000.0;
            let bar = (t_ms / bar_ms).floor() as usize;

            let (rms, low, centroid) = if bar < 16 {
                // Intro: 16 bars, hats only
                (0.20, 0.03, 5200.0)
            } else if bar < 24 {
                // Buildup: 8 bars, rising
                let p = (bar - 16) as f32 / 8.0;
                (0.25 + 0.50 * p, 0.05 + 0.25 * p, 3000.0 + 1500.0 * p)
            } else if bar < 56 {
                // Drop 1: 32 bars, kick and bass
                (0.92, 0.72, 1800.0)
            } else if bar < 72 {
                // Breakdown: 16 bars, no kick
                (0.38, 0.06, 3200.0)
            } else if bar < 104 {
                // Drop 2: 32 bars, kick and bass
                (0.95, 0.75, 1750.0)
            } else if bar < 120 {
                // Outro: 16 bars, kick fades
                let p = (bar - 104) as f32 / 16.0;
                (0.60 * (1.0 - p) + 0.10, 0.50 * (1.0 - p) + 0.04, 2800.0)
            } else {
                (0.10, 0.02, 2500.0)
            };

            rms_curve.push(rms);
            low_ratio_curve.push(low);
            centroid_curve.push(centroid);
        }

        let dynamics = DynamicsAnalysis {
            frame_rate,
            rms_curve,
            low_ratio_curve,
            centroid_curve,
        };

        (rhythm, dynamics)
    }

    /// Second fixture containing 2 breakdowns and 3 drops to verify Cue E (Second Breakdown) placement.
    fn generate_test_fixture_two_breakdowns() -> (RhythmAnalysis, DynamicsAnalysis) {
        let bpm = 128.0;
        let beat_ms = 60_000.0 / bpm;
        let bar_ms = 4.0 * beat_ms;
        // 16 intro, 8 build, 32 drop1, 16 break1, 32 drop2, 16 break2, 32 drop3, 16 outro = 168 bars
        let total_bars = 168;
        let total_beats = total_bars * 4;

        let beats_ms: Vec<f64> = (0..total_beats).map(|b| b as f64 * beat_ms).collect();
        let downbeat_flags: Vec<bool> = (0..total_beats).map(|b| b % 4 == 0).collect();

        let grid = BeatGrid {
            first_downbeat_ms: 0.0,
            bpm,
            beats_ms,
            downbeat_flags,
            steady: true,
        };
        let rhythm = RhythmAnalysis {
            grid,
            bpm_alternates: vec![64.0, 256.0],
        };

        let frame_rate = 44100.0 / 1024.0;
        let total_duration_s = (total_bars as f64 * bar_ms) / 1000.0;
        let num_frames = (total_duration_s * frame_rate).ceil() as usize;

        let mut rms_curve = Vec::with_capacity(num_frames);
        let mut low_ratio_curve = Vec::with_capacity(num_frames);
        let mut centroid_curve = Vec::with_capacity(num_frames);

        for f in 0..num_frames {
            let t_ms = (f as f64 / frame_rate) * 1000.0;
            let bar = (t_ms / bar_ms).floor() as usize;

            let (rms, low, centroid) = if bar < 16 {
                // Intro: 16 bars
                (0.20, 0.03, 5200.0)
            } else if bar < 24 {
                // Buildup: 8 bars
                let p = (bar - 16) as f32 / 8.0;
                (0.25 + 0.50 * p, 0.05 + 0.25 * p, 3000.0 + 1500.0 * p)
            } else if bar < 56 {
                // Drop 1: 32 bars
                (0.92, 0.72, 1800.0)
            } else if bar < 72 {
                // Breakdown 1: 16 bars
                (0.38, 0.06, 3200.0)
            } else if bar < 104 {
                // Drop 2: 32 bars
                (0.95, 0.75, 1750.0)
            } else if bar < 120 {
                // Breakdown 2: 16 bars
                (0.36, 0.05, 3100.0)
            } else if bar < 152 {
                // Drop 3: 32 bars
                (0.96, 0.76, 1700.0)
            } else if bar < 168 {
                // Outro: 16 bars
                let p = (bar - 152) as f32 / 16.0;
                (0.60 * (1.0 - p) + 0.10, 0.50 * (1.0 - p) + 0.04, 2800.0)
            } else {
                (0.10, 0.02, 2500.0)
            };

            rms_curve.push(rms);
            low_ratio_curve.push(low);
            centroid_curve.push(centroid);
        }

        let dynamics = DynamicsAnalysis {
            frame_rate,
            rms_curve,
            low_ratio_curve,
            centroid_curve,
        };

        (rhythm, dynamics)
    }

    #[test]
    fn test_fixture_labels_and_boundaries() {
        let (rhythm, dynamics) = generate_test_fixture();
        let segments = segment(&rhythm, &dynamics).expect("segmentation should succeed");

        assert_eq!(segments.len(), 6, "Expected 6 structural segments");

        let bar_ms = 4.0 * (60_000.0 / 128.0); // 1875.0 ms

        // Verify correct sequence of labels
        assert_eq!(segments[0].label, SegmentLabel::Intro);
        assert_eq!(segments[1].label, SegmentLabel::Buildup);
        assert_eq!(segments[2].label, SegmentLabel::Drop);
        assert_eq!(segments[3].label, SegmentLabel::Breakdown);
        assert_eq!(segments[4].label, SegmentLabel::Drop);
        assert_eq!(segments[5].label, SegmentLabel::Outro);

        // Verify boundaries are within one bar of expected multiples of 8 bars
        // 0: Intro (bars 0..16 -> 0.0 ms to 30000.0 ms)
        assert!((segments[0].start_ms - 0.0).abs() < bar_ms);
        assert!((segments[0].end_ms - 30_000.0).abs() < bar_ms);

        // 1: Buildup (bars 16..24 -> 30000.0 ms to 45000.0 ms)
        assert!((segments[1].start_ms - 30_000.0).abs() < bar_ms);
        assert!((segments[1].end_ms - 45_000.0).abs() < bar_ms);

        // 2: Drop 1 (bars 24..56 -> 45000.0 ms to 105000.0 ms)
        assert!((segments[2].start_ms - 45_000.0).abs() < bar_ms);
        assert!((segments[2].end_ms - 105_000.0).abs() < bar_ms);

        // 3: Breakdown (bars 56..72 -> 105000.0 ms to 135000.0 ms)
        assert!((segments[3].start_ms - 105_000.0).abs() < bar_ms);
        assert!((segments[3].end_ms - 135_000.0).abs() < bar_ms);

        // 4: Drop 2 (bars 72..104 -> 135000.0 ms to 195000.0 ms)
        assert!((segments[4].start_ms - 135_000.0).abs() < bar_ms);
        assert!((segments[4].end_ms - 195_000.0).abs() < bar_ms);

        // 5: Outro (bars 104..120 -> 195000.0 ms to 225000.0 ms)
        assert!((segments[5].start_ms - 195_000.0).abs() < bar_ms);
        assert!((segments[5].end_ms - 225_000.0).abs() < bar_ms);

        // Verify contiguous boundaries without gaps
        for i in 0..segments.len() - 1 {
            assert_eq!(segments[i].end_ms, segments[i + 1].start_ms);
        }

        // Verify energy ratings (1 to 10)
        assert!(segments[0].energy <= 4, "Intro should have low energy");
        assert!(
            segments[1].energy >= 4 && segments[1].energy <= 7,
            "Buildup should have moderate energy"
        );
        assert!(segments[2].energy >= 8, "Drop 1 should have high energy");
        assert!(
            segments[3].energy <= 6,
            "Breakdown should have lower energy than drop"
        );
        assert!(segments[4].energy >= 8, "Drop 2 should have high energy");
        assert!(
            segments[5].energy <= 5,
            "Outro should have low/moderate energy"
        );
    }

    #[test]
    fn test_fixture_cues_placement() {
        let (rhythm, dynamics) = generate_test_fixture();
        let segments = segment(&rhythm, &dynamics).expect("segmentation should succeed");
        let cues = place_cues(&segments, &rhythm.grid).expect("cue placement should succeed");

        let bar_ms = 4.0 * (60_000.0 / 128.0); // 1875.0 ms

        // In this fixture, there is 1 breakdown, so Cue E (second breakdown) is skipped
        // Cues present: A (0), B (1), C (2), D (3), F (5), G (6), H (7)
        let cue_a = cues.iter().find(|c| c.index == 0).expect("Cue A missing");
        let cue_b = cues.iter().find(|c| c.index == 1).expect("Cue B missing");
        let cue_c = cues.iter().find(|c| c.index == 2).expect("Cue C missing");
        let cue_d = cues.iter().find(|c| c.index == 3).expect("Cue D missing");
        let cue_e = cues.iter().find(|c| c.index == 4);
        let cue_f = cues.iter().find(|c| c.index == 5).expect("Cue F missing");
        let cue_g = cues.iter().find(|c| c.index == 6).expect("Cue G missing");
        let cue_h = cues.iter().find(|c| c.index == 7).expect("Cue H missing");

        // Cue E should be skipped because there is no second breakdown
        assert!(
            cue_e.is_none(),
            "Cue E should be skipped for single-breakdown track"
        );

        // Expected bars:
        // Cue A: First downbeat -> Bar 0 (0.0 ms)
        assert!((cue_a.time_ms - 0.0).abs() < bar_ms);
        assert_eq!(cue_a.kind, CueKind::HotCue);
        assert_eq!(cue_a.color_hex, CUE_COLOR_A);

        // Cue B: End of intro -> Bar 16 (30000.0 ms)
        assert!((cue_b.time_ms - 30_000.0).abs() < bar_ms);
        assert_eq!(cue_b.kind, CueKind::HotCue);
        assert_eq!(cue_b.color_hex, CUE_COLOR_B);

        // Cue C: First breakdown -> Bar 56 (105000.0 ms)
        assert!((cue_c.time_ms - 105_000.0).abs() < bar_ms);
        assert_eq!(cue_c.kind, CueKind::HotCue);
        assert_eq!(cue_c.color_hex, CUE_COLOR_C);

        // Cue D: First drop -> Bar 24 (45000.0 ms)
        assert!((cue_d.time_ms - 45_000.0).abs() < bar_ms);
        assert_eq!(cue_d.kind, CueKind::HotCue);
        assert_eq!(cue_d.color_hex, CUE_COLOR_D);

        // Cue F: Second drop -> Bar 72 (135000.0 ms)
        assert!((cue_f.time_ms - 135_000.0).abs() < bar_ms);
        assert_eq!(cue_f.kind, CueKind::HotCue);
        assert_eq!(cue_f.color_hex, CUE_COLOR_F);

        // Cue G: Mix-out / Start of outro -> Bar 104 (195000.0 ms)
        assert!((cue_g.time_ms - 195_000.0).abs() < bar_ms);
        assert_eq!(cue_g.kind, CueKind::HotCue);
        assert_eq!(cue_g.color_hex, CUE_COLOR_G);

        // Cue H: 4 or 8 bar loop near the outro in high-percussion region:
        // Last 8 bars of Drop 2 before Outro: Bar 96 (180000.0 ms) to Bar 104 (195000.0 ms)
        assert!((cue_h.time_ms - 180_000.0).abs() < bar_ms);
        assert_eq!(cue_h.kind, CueKind::Loop);
        assert_eq!(cue_h.color_hex, CUE_COLOR_H);
        let loop_end = cue_h.loop_end_ms.expect("Cue H should have loop_end_ms");
        assert!((loop_end - 195_000.0).abs() < bar_ms);
        assert!((loop_end - cue_h.time_ms - 8.0 * bar_ms).abs() < 1.0);
    }

    #[test]
    fn test_fixture_with_two_breakdowns_places_cue_e() {
        let (rhythm, dynamics) = generate_test_fixture_two_breakdowns();
        let segments = segment(&rhythm, &dynamics).expect("segmentation should succeed");
        let cues = place_cues(&segments, &rhythm.grid).expect("cue placement should succeed");

        let bar_ms = 4.0 * (60_000.0 / 128.0); // 1875.0 ms

        // In this fixture, all 8 cues (A through H) must exist
        assert_eq!(cues.len(), 8, "Expected all 8 cues A through H");

        for (i, cue) in cues.iter().enumerate().take(8) {
            assert_eq!(cue.index, i as u8);
        }

        // Cue E: Second breakdown -> Bar 104 to 120 (starts at 104 * 1875.0 = 195,000.0 ms)
        let cue_e = &cues[4];
        assert_eq!(cue_e.index, 4);
        assert!((cue_e.time_ms - 195_000.0).abs() < bar_ms);
        assert_eq!(cue_e.color_hex, CUE_COLOR_E);
        assert_eq!(cue_e.kind, CueKind::HotCue);

        // Cue F: Second drop -> Bar 72 (135,000.0 ms)
        let cue_f = &cues[5];
        assert_eq!(cue_f.index, 5);
        assert!((cue_f.time_ms - 135_000.0).abs() < bar_ms);
        assert_eq!(cue_f.color_hex, CUE_COLOR_F);

        // Cue G: Outro -> Bar 152 (152 * 1875.0 = 285,000.0 ms)
        let cue_g = &cues[6];
        assert_eq!(cue_g.index, 6);
        assert!((cue_g.time_ms - 285_000.0).abs() < bar_ms);

        // Cue H: 8 bar loop before outro -> Bar 144 (270,000.0 ms) to Bar 152 (285,000.0 ms)
        let cue_h = &cues[7];
        assert_eq!(cue_h.index, 7);
        assert!((cue_h.time_ms - 270_000.0).abs() < bar_ms);
        assert_eq!(cue_h.kind, CueKind::Loop);
    }

    #[test]
    fn test_invalid_input_rejections() {
        let empty_grid = BeatGrid {
            first_downbeat_ms: 0.0,
            bpm: 120.0,
            beats_ms: vec![],
            downbeat_flags: vec![],
            steady: true,
        };
        let empty_dynamics = DynamicsAnalysis {
            frame_rate: 43.0,
            rms_curve: vec![],
            low_ratio_curve: vec![],
            centroid_curve: vec![],
        };

        let rhythm = RhythmAnalysis {
            grid: empty_grid.clone(),
            bpm_alternates: vec![],
        };

        // Empty grid should fail
        assert!(matches!(
            segment(&rhythm, &empty_dynamics),
            Err(AnalysisError::InvalidInput(_))
        ));

        // Empty grid for cue placement should fail
        assert!(matches!(
            place_cues(&[], &empty_grid),
            Err(AnalysisError::InvalidInput(_))
        ));
    }
}
