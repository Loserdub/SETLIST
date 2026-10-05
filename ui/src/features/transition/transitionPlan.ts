import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import type { PerformancePlan, StructuralMarker } from './types';
import { resolveFourPointCues, FOUR_POINT_CUE_CONFIG } from '../track/cues';

/**
 * Formats a millisecond duration into "MM:SS".
 */
export function formatTime(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats sequence positions into 2-digit strings (e.g. 3 -> "03").
 */
export function formatPosition(pos?: number, fallback: string = '01'): string {
  if (pos === undefined || pos === null || Number.isNaN(pos)) return fallback;
  return String(pos).padStart(2, '0');
}

/**
 * Generates an authoritative, structured performance plan from Track A, Track B,
 * and the calculated TransitionAdvice.
 */
export function generatePerformancePlan(
  trackA: Track | null,
  trackB: Track | null,
  advice: TransitionAdvice | null,
  _posA?: number,
  posB?: number
): PerformancePlan {
  const posBStr = formatPosition(posB, '02');
  const trackBLabel = `Track ${posBStr}`;

  const bpmA = trackA?.analysis?.rhythm.grid.bpm ?? 120;
  const bpmB = trackB?.analysis?.rhythm.grid.bpm ?? bpmA;
  const phraseBars = advice?.phrase_bars ?? 16;
  const transitionDurationSec = Math.round(phraseBars * (60.0 / bpmB) * 4 * 10) / 10;

  // 1. Determine ENTER directive
  let enter = `${trackBLabel} at FIRST DOWNBEAT`;
  let inPointTimeMs = 0;
  let inPointLabel = 'Cue A (Intro)';

  if (trackB) {
    const fourCuesB = resolveFourPointCues(trackB);
    const cueA = fourCuesB.A;
    const cueB = fourCuesB.B;
    const cueC = fourCuesB.C;
    const analysis = trackB.analysis;
    const breakdownSeg = analysis?.segments.find((s) => s.label.toLowerCase() === 'breakdown');
    const buildupSeg = analysis?.segments.find((s) => s.label.toLowerCase() === 'buildup');

    if (breakdownSeg) {
      enter = `${trackBLabel} at BREAKDOWN (${formatTime(breakdownSeg.start_ms)})`;
      inPointTimeMs = breakdownSeg.start_ms;
      inPointLabel = 'Breakdown';
    } else if (cueB) {
      enter = `${trackBLabel} at BREAKDOWN (${formatTime(cueB.timeMs)})`;
      inPointTimeMs = cueB.timeMs;
      inPointLabel = cueB.label || 'Cue B (Breakdown)';
    } else if (buildupSeg) {
      enter = `${trackBLabel} at BUILDUP (${formatTime(buildupSeg.start_ms)})`;
      inPointTimeMs = buildupSeg.start_ms;
      inPointLabel = 'Buildup';
    } else if (cueA) {
      enter = `${trackBLabel} at INTRO / FIRST DOWNBEAT (${formatTime(cueA.timeMs)})`;
      inPointTimeMs = cueA.timeMs;
      inPointLabel = cueA.label || 'Cue A (Intro)';
    } else if (cueC) {
      enter = `${trackBLabel} at DROP (${formatTime(cueC.timeMs)})`;
      inPointTimeMs = cueC.timeMs;
      inPointLabel = cueC.label || 'Cue C (Drop)';
    }
  }

  // 2. Determine OUT point on Track A
  let outPointTimeMs = trackA ? Math.max(0, trackA.duration_ms - 30_000) : 0;
  let outPointLabel = 'Mix-Out (Outro)';

  if (trackA) {
    const analysis = trackA.analysis;
    const fourCuesA = resolveFourPointCues(trackA);
    const cueD = fourCuesA.D;
    const cueH = analysis?.cue_points.find((c) => c.index === 7 || c.label.toLowerCase().includes('loop'));
    const cueG = analysis?.cue_points.find((c) => c.index === 6);
    const outroSeg = analysis?.segments.find((s) => s.label.toLowerCase() === 'outro');

    if (advice?.loop_extension_recommended && cueH) {
      outPointTimeMs = cueH.time_ms;
      outPointLabel = 'Cue H (Loop Extension)';
    } else if (cueG && !analysis?.cue_points.some((c) => c.index === 3 && c.label.toLowerCase().includes('mix'))) {
      outPointTimeMs = cueG.time_ms;
      outPointLabel = 'Cue G (Mix-Out Point)';
    } else if (cueD) {
      outPointTimeMs = cueD.timeMs;
      outPointLabel = 'Cue D (Mix Out)';
    } else if (outroSeg) {
      outPointTimeMs = outroSeg.start_ms;
      outPointLabel = 'Outro Segment';
    }
  }

  // 3. Determine LOW END directive
  let lowEnd = 'Keep incoming bass reduced';
  if (advice) {
    if (advice.transition_type === 'Tritone' || advice.transition_type === 'HalfStepLift') {
      lowEnd = 'Mute incoming low-end completely — direct frequency swap on phrase boundary';
    } else if (advice.intervention_required) {
      lowEnd = 'Isolate low frequencies — steep high-pass filter until beat-matched bridge';
    } else if (advice.loop_extension_recommended) {
      lowEnd = 'Loop percussive outro on Cue H; keep incoming sub-bass attenuated';
    } else if (phraseBars >= 32) {
      lowEnd = 'Keep incoming bass reduced — slow progressive blend across 32 bars';
    } else {
      lowEnd = 'Keep incoming bass reduced (high-pass filter / swap on bar 16)';
    }
  }

  // 4. Determine RELEASE directive
  let release = 'Open incoming low-end at DROP';
  if (trackB?.analysis) {
    const dropSeg = trackB.analysis.segments.find((s) => s.label.toLowerCase() === 'drop');
    const dropCue = trackB.analysis.cue_points.find((c) => c.index === 3 || c.index === 5 || c.label.toLowerCase().includes('drop'));

    if (dropSeg) {
      release = `Open incoming low-end at DROP (${formatTime(dropSeg.start_ms)})`;
    } else if (dropCue) {
      release = `Open incoming low-end at DROP (${formatTime(dropCue.time_ms)})`;
    } else {
      release = `Open incoming low-end and cut outgoing track on bar ${phraseBars}`;
    }
  }

  // 5. Guidance notes
  const notes: string[] = advice?.notes && advice.notes.length > 0
    ? [...advice.notes]
    : [
        `Align phrase boundary at bar ${phraseBars} (${transitionDurationSec}s window).`,
        'Maintain clean frequency separation during mid-range vocal and lead overlaps.',
      ];

  return {
    enter,
    lowEnd,
    release,
    phraseBars,
    transitionDurationSec,
    outPoint: {
      label: outPointLabel,
      timeMs: outPointTimeMs,
    },
    inPoint: {
      label: inPointLabel,
      timeMs: inPointTimeMs,
    },
    guidanceNotes: notes,
  };
}

/**
 * Extracts and normalizes structural markers (segments & cues) from a track's analysis.
 */
export function extractStructuralMarkers(track: Track | null): StructuralMarker[] {
  if (!track?.analysis) return [];
  const markers: StructuralMarker[] = [];
  const { segments, cue_points, rhythm } = track.analysis;
  const bpm = rhythm.grid.bpm;
  const firstDb = rhythm.grid.first_downbeat_ms;
  const barMs = bpm > 0 ? 240_000.0 / bpm : 2000.0;

  // Segment colors matching AGENTS.md 6.7
  const SEG_COLORS: Record<string, string> = {
    intro: '#0284c7', // Sky Blue
    verse: '#4f46e5', // Indigo
    buildup: '#ea580c', // Orange
    drop: '#dc2626', // Red
    breakdown: '#7c3aed', // Purple
    outro: '#059669', // Emerald
  };

  // Add segments
  segments.forEach((seg, i) => {
    const barNumber = bpm > 0 ? Math.max(1, Math.round((seg.start_ms - firstDb) / barMs) + 1) : undefined;
    markers.push({
      id: `seg-${seg.label}-${i}`,
      label: seg.label.toUpperCase(),
      type: 'segment',
      timeMs: seg.start_ms,
      endMs: seg.end_ms,
      colorHex: SEG_COLORS[seg.label.toLowerCase()] ?? '#64748b',
      barNumber,
    });
  });

  // Add cues
  cue_points.forEach((cue) => {
    const letter = String.fromCharCode(65 + (cue.index % 8));
    const barNumber = bpm > 0 ? Math.max(1, Math.round((cue.time_ms - firstDb) / barMs) + 1) : undefined;
    const fourPointConfig = FOUR_POINT_CUE_CONFIG[letter as keyof typeof FOUR_POINT_CUE_CONFIG];
    const colorHex = fourPointConfig?.colorHex ?? cue.color_hex ?? '#38bdf8';
    const roleLabel = fourPointConfig ? `CUE ${letter}: ${fourPointConfig.role}` : `CUE ${letter}: ${cue.label}`;
    markers.push({
      id: `cue-${letter}-${cue.index}`,
      label: roleLabel,
      type: 'cue',
      timeMs: cue.time_ms,
      colorHex,
      barNumber,
    });
  });

  return markers.sort((a, b) => a.timeMs - b.timeMs);
}
