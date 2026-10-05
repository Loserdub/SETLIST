import type { Track } from '../../../bindings/Track';
import type { CuePoint } from '../../../bindings/CuePoint';
import type { BeatGrid } from '../../../bindings/BeatGrid';
import type { Segment } from '../../../bindings/Segment';
import { isFieldOverridden } from '../overrides/EditedBadge';

export type PerformanceCueSlot = 'A' | 'B' | 'C' | 'D';
export type PerformanceCueRole = 'INTRO' | 'BREAKDOWN' | 'DROP' | 'MIX OUT';

export interface PerformanceCueSlotConfig {
  slot: PerformanceCueSlot;
  index: number;
  role: PerformanceCueRole;
  defaultLabel: string;
  colorHex: string;
  badgeBg: string;
  badgeBorder: string;
  shortcutKey: string;
  description: string;
}

/**
 * Standard four-point performance cue specifications (A, B, C, D).
 * Hardware control standard:
 * - A — INTRO: First downbeat, rhythm entry, mix-in point
 * - B — BREAKDOWN: Melodic breath, percussion drop-out, atmospheric zone
 * - C — DROP: Peak dancefloor energy release, bassline drop
 * - D — MIX OUT: Outro transition start, mix-out marker
 */
export const FOUR_POINT_CUE_CONFIG: Record<PerformanceCueSlot, PerformanceCueSlotConfig> = {
  A: {
    slot: 'A',
    index: 0,
    role: 'INTRO',
    defaultLabel: 'A: INTRO',
    colorHex: '#10B981', // Emerald Green
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeBorder: '#059669',
    shortcutKey: '1',
    description: 'First downbeat, rhythm entry, mix-in point',
  },
  B: {
    slot: 'B',
    index: 1,
    role: 'BREAKDOWN',
    defaultLabel: 'B: BREAKDOWN',
    colorHex: '#F59E0B', // Amber
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeBorder: '#D97706',
    shortcutKey: '2',
    description: 'Melodic breath, percussion drop-out, atmospheric section',
  },
  C: {
    slot: 'C',
    index: 2,
    role: 'DROP',
    defaultLabel: 'C: DROP',
    colorHex: '#EF4444', // Red / Crimson
    badgeBg: 'rgba(239, 68, 68, 0.15)',
    badgeBorder: '#DC2626',
    shortcutKey: '3',
    description: 'Peak dancefloor energy release, bassline drop',
  },
  D: {
    slot: 'D',
    index: 3,
    role: 'MIX OUT',
    defaultLabel: 'D: MIX OUT',
    colorHex: '#06B6D4', // Cyan
    badgeBg: 'rgba(6, 182, 212, 0.15)',
    badgeBorder: '#0891B2',
    shortcutKey: '4',
    description: 'Outro transition start, mix-out marker',
  },
};

export const CUE_SLOTS: PerformanceCueSlot[] = ['A', 'B', 'C', 'D'];

/**
 * Resolved Performance Cue item holding time, role, and suggestion/confirmed flags.
 */
export interface PerformanceCue {
  slot: PerformanceCueSlot;
  index: number;
  role: PerformanceCueRole;
  label: string;
  timeMs: number;
  colorHex: string;
  isSuggested: boolean;
  isConfirmed: boolean;
  kind: 'HotCue' | 'MemoryCue' | 'Loop';
  loopEndMs?: number | null;
  barNumber?: number;
}

/**
 * Calculates bar number from timestamp and beat grid.
 */
export function calculateBarNumber(timeMs: number, grid?: BeatGrid): number | undefined {
  if (!grid || !grid.bpm || grid.bpm <= 0) return undefined;
  const barMs = 4.0 * (60_000.0 / grid.bpm);
  const offsetMs = timeMs - (grid.first_downbeat_ms ?? 0);
  if (offsetMs < 0) return 1;
  return Math.floor(offsetMs / barMs) + 1;
}

/**
 * Formats milliseconds as mm:ss.ms (e.g. "01:24.5").
 */
export function formatCueTime(timeMs: number): string {
  const totalSeconds = Math.max(0, timeMs) / 1000;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const wholeSecs = Math.floor(secs);
  const tenths = Math.floor((secs - wholeSecs) * 10);
  return `${mins.toString().padStart(2, '0')}:${wholeSecs.toString().padStart(2, '0')}.${tenths}`;
}

/**
 * Formats cue time with bar location (e.g. "01:24.5 [Bar 45]").
 */
export function formatCueWithBar(timeMs: number, grid?: BeatGrid): string {
  const timeStr = formatCueTime(timeMs);
  const bar = calculateBarNumber(timeMs, grid);
  return bar ? `${timeStr} (Bar ${bar})` : timeStr;
}

/**
 * Resolves the four standardized performance cues (A, B, C, D) for any track.
 * Seamlessly handles:
 * 1. Confirmed / overridden user cue points
 * 2. Standard 4-cue analysis
 * 3. Legacy 8-cue analysis (mapping First Downbeat -> A, Breakdown -> B, Drop -> C, Outro -> D)
 * 4. Structural segment synthesis fallback when cues have not yet been placed
 */
export function resolveFourPointCues(
  track: Track | null | undefined
): Record<PerformanceCueSlot, PerformanceCue | null> {
  const result: Record<PerformanceCueSlot, PerformanceCue | null> = {
    A: null,
    B: null,
    C: null,
    D: null,
  };

  if (!track?.analysis) {
    return result;
  }

  const isConfirmed = isFieldOverridden(track, 'cues');
  const isSuggested = !isConfirmed;
  const rawCues = track.analysis.cue_points ?? [];
  const segments = track.analysis.segments ?? [];
  const grid = track.analysis.rhythm?.grid;

  // ── 1. Resolve Slot A: INTRO ──────────────────────────────────────────────
  let cueA = rawCues.find((c) => c.index === 0);
  if (!cueA) {
    cueA = rawCues.find((c) => {
      const l = c.label.toLowerCase();
      return l.includes('intro') || l.includes('downbeat');
    });
  }
  if (cueA) {
    result.A = {
      slot: 'A',
      index: 0,
      role: 'INTRO',
      label: cueA.label || FOUR_POINT_CUE_CONFIG.A.defaultLabel,
      timeMs: cueA.time_ms,
      colorHex: FOUR_POINT_CUE_CONFIG.A.colorHex,
      isSuggested,
      isConfirmed,
      kind: cueA.kind,
      loopEndMs: cueA.loop_end_ms,
      barNumber: calculateBarNumber(cueA.time_ms, grid),
    };
  } else if (grid && grid.first_downbeat_ms >= 0) {
    // Synthesize from grid downbeat as suggestion
    result.A = {
      slot: 'A',
      index: 0,
      role: 'INTRO',
      label: FOUR_POINT_CUE_CONFIG.A.defaultLabel,
      timeMs: grid.first_downbeat_ms,
      colorHex: FOUR_POINT_CUE_CONFIG.A.colorHex,
      isSuggested: true,
      isConfirmed: false,
      kind: 'HotCue',
      barNumber: 1,
    };
  }

  // ── 2. Resolve Slot B: BREAKDOWN ──────────────────────────────────────────
  let cueB = rawCues.find((c) => {
    const l = c.label.toLowerCase();
    return l.includes('breakdown') || (c.index === 1 && !l.includes('intro end'));
  });
  // Fallback in 8-cue system: index 2 was first breakdown
  if (!cueB) {
    cueB = rawCues.find((c) => c.index === 2 && c.label.toLowerCase().includes('breakdown'));
  }
  // Check index 1 if 4 cues total
  if (!cueB && rawCues.length === 4 && rawCues[1]) {
    cueB = rawCues[1];
  }

  if (cueB) {
    result.B = {
      slot: 'B',
      index: 1,
      role: 'BREAKDOWN',
      label: cueB.label || FOUR_POINT_CUE_CONFIG.B.defaultLabel,
      timeMs: cueB.time_ms,
      colorHex: FOUR_POINT_CUE_CONFIG.B.colorHex,
      isSuggested,
      isConfirmed,
      kind: cueB.kind,
      loopEndMs: cueB.loop_end_ms,
      barNumber: calculateBarNumber(cueB.time_ms, grid),
    };
  } else {
    // Synthesize from first breakdown segment
    const bSegment = segments.find((s) => s.label.toLowerCase() === 'breakdown');
    if (bSegment) {
      result.B = {
        slot: 'B',
        index: 1,
        role: 'BREAKDOWN',
        label: FOUR_POINT_CUE_CONFIG.B.defaultLabel,
        timeMs: bSegment.start_ms,
        colorHex: FOUR_POINT_CUE_CONFIG.B.colorHex,
        isSuggested: true,
        isConfirmed: false,
        kind: 'HotCue',
        barNumber: calculateBarNumber(bSegment.start_ms, grid),
      };
    }
  }

  // ── 3. Resolve Slot C: DROP ───────────────────────────────────────────────
  let cueC = rawCues.find((c) => {
    const l = c.label.toLowerCase();
    return l.includes('drop') || (c.index === 2 && !l.includes('breakdown'));
  });
  // Fallback in 8-cue system: index 3 was first drop
  if (!cueC) {
    cueC = rawCues.find((c) => c.index === 3 && c.label.toLowerCase().includes('drop'));
  }
  // Check index 2 if 4 cues total
  if (!cueC && rawCues.length === 4 && rawCues[2]) {
    cueC = rawCues[2];
  }

  if (cueC) {
    result.C = {
      slot: 'C',
      index: 2,
      role: 'DROP',
      label: cueC.label || FOUR_POINT_CUE_CONFIG.C.defaultLabel,
      timeMs: cueC.time_ms,
      colorHex: FOUR_POINT_CUE_CONFIG.C.colorHex,
      isSuggested,
      isConfirmed,
      kind: cueC.kind,
      loopEndMs: cueC.loop_end_ms,
      barNumber: calculateBarNumber(cueC.time_ms, grid),
    };
  } else {
    // Synthesize from first drop segment
    const dSegment = segments.find((s) => s.label.toLowerCase() === 'drop');
    if (dSegment) {
      result.C = {
        slot: 'C',
        index: 2,
        role: 'DROP',
        label: FOUR_POINT_CUE_CONFIG.C.defaultLabel,
        timeMs: dSegment.start_ms,
        colorHex: FOUR_POINT_CUE_CONFIG.C.colorHex,
        isSuggested: true,
        isConfirmed: false,
        kind: 'HotCue',
        barNumber: calculateBarNumber(dSegment.start_ms, grid),
      };
    }
  }

  // ── 4. Resolve Slot D: MIX OUT ────────────────────────────────────────────
  let cueD = rawCues.find((c) => {
    const l = c.label.toLowerCase();
    return l.includes('mix out') || l.includes('outro mix-out') || l.includes('outro');
  });
  // Fallback in 8-cue system: index 6 was outro start, index 7 was loop
  if (!cueD) {
    cueD = rawCues.find((c) => c.index === 6);
  }
  if (!cueD && rawCues.length === 4 && rawCues[3]) {
    cueD = rawCues[3];
  }

  if (cueD) {
    result.D = {
      slot: 'D',
      index: 3,
      role: 'MIX OUT',
      label: cueD.label || FOUR_POINT_CUE_CONFIG.D.defaultLabel,
      timeMs: cueD.time_ms,
      colorHex: FOUR_POINT_CUE_CONFIG.D.colorHex,
      isSuggested,
      isConfirmed,
      kind: cueD.kind,
      loopEndMs: cueD.loop_end_ms,
      barNumber: calculateBarNumber(cueD.time_ms, grid),
    };
  } else {
    // Synthesize from outro segment
    const oSegment = segments.find((s) => s.label.toLowerCase() === 'outro');
    if (oSegment) {
      result.D = {
        slot: 'D',
        index: 3,
        role: 'MIX OUT',
        label: FOUR_POINT_CUE_CONFIG.D.defaultLabel,
        timeMs: oSegment.start_ms,
        colorHex: FOUR_POINT_CUE_CONFIG.D.colorHex,
        isSuggested: true,
        isConfirmed: false,
        kind: 'HotCue',
        barNumber: calculateBarNumber(oSegment.start_ms, grid),
      };
    } else if (track.duration_ms && grid?.bpm) {
      // Default fallback: 16 bars before track end
      const barMs = 4.0 * (60_000.0 / grid.bpm);
      const estTime = Math.max(0, track.duration_ms - 16.0 * barMs);
      result.D = {
        slot: 'D',
        index: 3,
        role: 'MIX OUT',
        label: FOUR_POINT_CUE_CONFIG.D.defaultLabel,
        timeMs: estTime,
        colorHex: FOUR_POINT_CUE_CONFIG.D.colorHex,
        isSuggested: true,
        isConfirmed: false,
        kind: 'HotCue',
        barNumber: calculateBarNumber(estTime, grid),
      };
    }
  }

  return result;
}

/**
 * Snaps a given millisecond time to the nearest beat in the beat grid.
 */
export function snapTimeToGrid(timeMs: number, beatsMs: number[]): number {
  if (!beatsMs || beatsMs.length === 0) return timeMs;
  let closest = beatsMs[0];
  let minDiff = Math.abs(timeMs - closest);
  for (let i = 1; i < beatsMs.length; i++) {
    const diff = Math.abs(timeMs - beatsMs[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closest = beatsMs[i];
    }
  }
  return closest;
}

/**
 * Nudges a cue timestamp forward or backward by deltaMs, clamped to duration.
 */
export function nudgeCueTime(timeMs: number, deltaMs: number, maxDurationMs?: number): number {
  const next = Math.max(0, timeMs + deltaMs);
  if (maxDurationMs != null && maxDurationMs > 0) {
    return Math.min(maxDurationMs, next);
  }
  return next;
}

/**
 * Converts a four-point record into canonical CuePoint array for storage/export.
 */
export function serializeFourPointCues(
  cuesRecord: Record<PerformanceCueSlot, PerformanceCue | null>
): CuePoint[] {
  const result: CuePoint[] = [];

  for (const slot of CUE_SLOTS) {
    const cue = cuesRecord[slot];
    if (cue) {
      const cfg = FOUR_POINT_CUE_CONFIG[slot];
      result.push({
        index: cfg.index,
        time_ms: cue.timeMs,
        label: cue.label || cfg.defaultLabel,
        color_hex: cfg.colorHex,
        kind: cue.kind,
        loop_end_ms: cue.loopEndMs ?? null,
      });
    }
  }

  return result;
}

/**
 * Regenerates the 4 canonical performance cues (A, B, C, D) strictly from pure analysis segments.
 */
export function regenerateCanonicalFourPointCues(
  segments: Segment[],
  grid: BeatGrid,
  durationMs: number
): CuePoint[] {
  const result: CuePoint[] = [];
  const barMs = grid.bpm > 0 ? 4.0 * (60_000.0 / grid.bpm) : 2000.0;

  // A: INTRO (First downbeat)
  result.push({
    index: 0,
    time_ms: Math.max(0, grid.first_downbeat_ms),
    label: FOUR_POINT_CUE_CONFIG.A.defaultLabel,
    color_hex: FOUR_POINT_CUE_CONFIG.A.colorHex,
    kind: 'HotCue',
    loop_end_ms: null,
  });

  // B: BREAKDOWN
  const bSeg = segments.find((s) => s.label.toLowerCase() === 'breakdown');
  if (bSeg) {
    result.push({
      index: 1,
      time_ms: bSeg.start_ms,
      label: FOUR_POINT_CUE_CONFIG.B.defaultLabel,
      color_hex: FOUR_POINT_CUE_CONFIG.B.colorHex,
      kind: 'HotCue',
      loop_end_ms: null,
    });
  } else if (durationMs > barMs * 32) {
    // Estimated breakdown at ~40% of track length snapped to bar
    const est = Math.floor((durationMs * 0.4) / barMs) * barMs;
    result.push({
      index: 1,
      time_ms: est,
      label: FOUR_POINT_CUE_CONFIG.B.defaultLabel,
      color_hex: FOUR_POINT_CUE_CONFIG.B.colorHex,
      kind: 'HotCue',
      loop_end_ms: null,
    });
  }

  // C: DROP
  const dSeg = segments.find((s) => s.label.toLowerCase() === 'drop');
  if (dSeg) {
    result.push({
      index: 2,
      time_ms: dSeg.start_ms,
      label: FOUR_POINT_CUE_CONFIG.C.defaultLabel,
      color_hex: FOUR_POINT_CUE_CONFIG.C.colorHex,
      kind: 'HotCue',
      loop_end_ms: null,
    });
  } else if (durationMs > barMs * 48) {
    // Estimated drop at ~55% of track length snapped to bar
    const est = Math.floor((durationMs * 0.55) / barMs) * barMs;
    result.push({
      index: 2,
      time_ms: est,
      label: FOUR_POINT_CUE_CONFIG.C.defaultLabel,
      color_hex: FOUR_POINT_CUE_CONFIG.C.colorHex,
      kind: 'HotCue',
      loop_end_ms: null,
    });
  }

  // D: MIX OUT
  const oSeg = segments.find((s) => s.label.toLowerCase() === 'outro');
  if (oSeg) {
    result.push({
      index: 3,
      time_ms: oSeg.start_ms,
      label: FOUR_POINT_CUE_CONFIG.D.defaultLabel,
      color_hex: FOUR_POINT_CUE_CONFIG.D.colorHex,
      kind: 'HotCue',
      loop_end_ms: null,
    });
  } else if (durationMs > 16.0 * barMs) {
    const est = Math.max(0, durationMs - 16.0 * barMs);
    result.push({
      index: 3,
      time_ms: est,
      label: FOUR_POINT_CUE_CONFIG.D.defaultLabel,
      color_hex: FOUR_POINT_CUE_CONFIG.D.colorHex,
      kind: 'HotCue',
      loop_end_ms: null,
    });
  }

  return result;
}
