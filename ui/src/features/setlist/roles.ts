import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionCostBreakdown } from './costModel';

export type SetRole =
  | 'OPENER'
  | 'BUILD'
  | 'PEAK DRIVE'
  | 'PLATEAU'
  | 'BREAKDOWN'
  | 'CLOSER'
  | 'BRIDGE';

export interface TrackRoleInfo {
  role: SetRole;
  description: string;
  badgeClass: string;
}

/**
 * Computes a musically descriptive role for a track based on its position in the setlist,
 * active energy trajectory, and relative energy shifts.
 */
export function computeTrackRole(
  _index: number,
  total: number,
  energy: number,
  targetEnergy: number,
  _profile: EnergyProfile,
  isFirst: boolean,
  isLast: boolean,
  isBridge: boolean = false,
  prevEnergy?: number
): TrackRoleInfo {
  if (isBridge) {
    return {
      role: 'BRIDGE',
      description: 'Intermediate transition track connecting disparate musical keys or tempos.',
      badgeClass: 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300',
    };
  }

  if (isFirst) {
    return {
      role: 'OPENER',
      description: 'Sets the foundational groove, tempo, and sonic atmosphere for the performance.',
      badgeClass: 'bg-amber-950/70 border-amber-500/60 text-amber-300',
    };
  }

  if (isLast && total > 1) {
    return {
      role: 'CLOSER',
      description: 'Climactic finale or memorable resolution resolving the set journey.',
      badgeClass: 'bg-indigo-950/70 border-indigo-500/60 text-indigo-300',
    };
  }

  // Detect deliberate breathers / breakdowns: energy drops noticeably from previous track
  if (prevEnergy !== undefined && prevEnergy - energy >= 1.5) {
    return {
      role: 'BREAKDOWN',
      description: 'Deliberate energy reset and dynamic breathing room before the next build.',
      badgeClass: 'bg-sky-950/70 border-sky-500/60 text-sky-300',
    };
  }

  // Detect high energy / peak intensity
  if (energy >= 8 || targetEnergy >= 8.2) {
    if (prevEnergy !== undefined && prevEnergy >= 8) {
      return {
        role: 'PLATEAU',
        description: 'Sustained maximum dancefloor pressure and rhythmic momentum.',
        badgeClass: 'bg-purple-950/70 border-purple-500/60 text-purple-300',
      };
    }
    return {
      role: 'PEAK DRIVE',
      description: 'Peak high-impact track driving peak audience reaction.',
      badgeClass: 'bg-rose-950/70 border-rose-500/60 text-rose-300',
    };
  }

  // General progression tracks
  return {
    role: 'BUILD',
    description: 'Elevates sonic tension, tempo momentum, and crowd engagement.',
    badgeClass: 'bg-cyan-950/70 border-cyan-500/60 text-cyan-300',
  };
}

/**
 * Formats duration milliseconds into clean mm:ss (or h:mm:ss if >= 1 hour).
 */
export function formatDurationMs(ms: number): string {
  if (isNaN(ms) || ms < 0) return '0:00';
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export interface TimelineInterval {
  startMs: number;
  endMs: number;
  startFormatted: string;
  endFormatted: string;
  durationFormatted: string;
}

/**
 * Calculates continuous cumulative physical timeline intervals for every track in the sequence.
 */
export function computeCumulativeTimeline(entries: SetlistEntry[]): TimelineInterval[] {
  let currentMs = 0;
  return entries.map((entry) => {
    const dur = entry.track?.duration_ms && entry.track.duration_ms > 0
      ? entry.track.duration_ms
      : 180000; // 3-minute fallback if unanalyzed
    const startMs = currentMs;
    const endMs = currentMs + dur;
    currentMs = endMs;

    return {
      startMs,
      endMs,
      startFormatted: formatDurationMs(startMs),
      endFormatted: formatDurationMs(endMs),
      durationFormatted: formatDurationMs(dur),
    };
  });
}

export type TransitionVerdict = 'LOW COST' | 'MODERATE SHIFT' | 'HIGH COST';

export interface TransitionVerdictDetails {
  verdict: TransitionVerdict;
  subLabel: string;
  musicalDescription: string;
  colorHex: string;
  badgeBorderClass: string;
  badgeBgClass: string;
  textColorClass: string;
}

/**
 * Classifies transition friction into musical language.
 * No meaningless "AI score" labels — strictly acoustic and mixing reality.
 */
export function classifyTransitionCost(
  breakdown: TransitionCostBreakdown | null
): TransitionVerdictDetails {
  if (!breakdown || !breakdown.isAvailable || isNaN(breakdown.total)) {
    return {
      verdict: 'LOW COST',
      subLabel: 'PENDING ANALYSIS',
      musicalDescription: 'Track acoustic analysis pending.',
      colorHex: '#71717a',
      badgeBorderClass: 'border-[#333333]',
      badgeBgClass: 'bg-[#141414]',
      textColorClass: 'text-[#a1a1aa]',
    };
  }

  const cost = breakdown.total;

  if (cost < 0.25) {
    return {
      verdict: 'LOW COST',
      subLabel: 'NATURAL BLEND',
      musicalDescription: 'Harmonically consonant and tempo-aligned. Seamless phrase blend.',
      colorHex: '#10b981',
      badgeBorderClass: 'border-emerald-500/50',
      badgeBgClass: 'bg-emerald-950/40',
      textColorClass: 'text-emerald-400',
    };
  }

  if (cost < 0.55) {
    return {
      verdict: 'MODERATE SHIFT',
      subLabel: 'ENERGY LIFT',
      musicalDescription: 'Noticeable key modulation or tempo step. Use EQ swap or phrase separation.',
      colorHex: '#f59e0b',
      badgeBorderClass: 'border-amber-500/50',
      badgeBgClass: 'bg-amber-950/40',
      textColorClass: 'text-amber-400',
    };
  }

  return {
    verdict: 'HIGH COST',
    subLabel: 'CHALLENGING JUMP',
    musicalDescription: 'Significant tempo/key distance. Consider inserting a bridge track or drop-cut mix.',
    colorHex: '#f43f5e',
    badgeBorderClass: 'border-rose-500/60',
    badgeBgClass: 'bg-rose-950/40',
    textColorClass: 'text-rose-400',
  };
}
