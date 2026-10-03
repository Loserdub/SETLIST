import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import type { CostWeights } from '../../bindings/CostWeights';
import type { EnergyProfile } from '../../bindings/EnergyProfile';

export interface TransitionCostBreakdown {
  isAvailable: boolean;
  total: number;
  phiTempo: number;
  phiKey: number;
  phiEnergy: number;
  phiTimbre: number;
  bpmDelta: number;
  keyDistance: number;
  modeFlip: boolean;
  dETarget: number;
  weights: CostWeights;
  profile: EnergyProfile | null;
}

export const DEFAULT_WEIGHTS: CostWeights = {
  tempo: 0.30,
  key: 0.35,
  energy: 0.35,
  timbre: 0.00,
};

export const KEY_DISTANCE_COST_TABLE: Record<number, [number, number]> = {
  0: [0.00, 0.10],
  1: [0.10, 0.40],
  2: [0.35, 0.60],
  3: [0.70, 0.80],
  4: [0.85, 0.90],
  5: [0.95, 0.95],
  6: [1.00, 1.00],
};

/**
 * Evaluates Phi_tempo = min(|BPM_i - BPM_j| / 6, 1) with octave detection.
 * Matches Rust `crates/sequencer/src/scoring.rs`.
 */
export function computePhiTempo(bpmA: number, bpmB: number): number {
  if (bpmA <= 0 || bpmB <= 0 || isNaN(bpmA) || isNaN(bpmB)) {
    return 1.0;
  }

  const ratio = bpmB / bpmA;
  let adjustedBpmB = bpmB;
  if (Math.abs(ratio - 2.0) / 2.0 <= 0.03) {
    adjustedBpmB = bpmB * 0.5;
  } else if (Math.abs(ratio - 0.5) / 0.5 <= 0.03) {
    adjustedBpmB = bpmB * 2.0;
  }

  const delta = Math.abs(bpmA - adjustedBpmB);
  return Math.min(Math.max(delta / 6.0, 0.0), 1.0);
}

/**
 * Evaluates Phi_key lookup table from AGENTS.md 6.3.
 */
export function computePhiKey(circularDist: number, modeFlip: boolean): number {
  const d = Math.min(Math.max(Math.round(circularDist), 0), 6);
  const pair = KEY_DISTANCE_COST_TABLE[d] ?? [1.00, 1.00];
  return modeFlip ? pair[1] : pair[0];
}

/**
 * Evaluates Phi_energy = min(((E_j - E_i) - dE_target)^2 / 16, 1).
 */
export function computePhiEnergy(
  energyA: number,
  energyB: number,
  dETarget: number = 0
): number {
  const diff = (energyB - energyA) - dETarget;
  const raw = (diff * diff) / 16.0;
  return Math.min(Math.max(raw, 0.0), 1.0);
}

/**
 * Evaluates full transition cost and individual terms between two tracks.
 * Authoritative source: Rust sequencer backend when advice has populated cost fields.
 * Returns isAvailable: false if either track lacks complete analysis.
 */
export function computeTransitionCost(
  fromTrack: Track | null,
  toTrack: Track | null,
  advice?: TransitionAdvice | null,
  dETarget: number = 0,
  weights: CostWeights = DEFAULT_WEIGHTS,
  profile: EnergyProfile | null = null
): TransitionCostBreakdown {
  // If analysis is missing on either track, cost cannot be calculated.
  // Explicit unavailable state - no misleading zero or default cost.
  if (!fromTrack?.analysis || !toTrack?.analysis) {
    return {
      isAvailable: false,
      total: NaN,
      phiTempo: NaN,
      phiKey: NaN,
      phiEnergy: NaN,
      phiTimbre: NaN,
      bpmDelta: advice?.bpm_delta ?? 0,
      keyDistance: advice?.key_distance ?? 0,
      modeFlip: advice?.mode_flip ?? false,
      dETarget: advice?.de_target ?? dETarget,
      weights: advice?.weights ?? weights,
      profile: advice?.profile ?? profile,
    };
  }

  // If authoritative backend calculation is present in advice, use it directly
  if (advice && advice.total_cost !== null && advice.total_cost !== undefined) {
    return {
      isAvailable: true,
      total: advice.total_cost,
      phiTempo: advice.tempo_cost ?? 0,
      phiKey: advice.key_cost ?? 0,
      phiEnergy: advice.energy_cost ?? 0,
      phiTimbre: advice.timbre_cost ?? 0,
      bpmDelta: advice.bpm_delta,
      keyDistance: advice.key_distance,
      modeFlip: advice.mode_flip,
      dETarget: advice.de_target ?? dETarget,
      weights: advice.weights ?? weights,
      profile: advice.profile ?? profile,
    };
  }

  // Fallback computation matching authoritative Rust sequencer formula
  const bpmA = fromTrack.analysis.rhythm.grid.bpm;
  const bpmB = toTrack.analysis.rhythm.grid.bpm;
  const phiTempo = computePhiTempo(bpmA, bpmB);
  const bpmDelta = advice?.bpm_delta ?? Math.abs(bpmB - bpmA);

  const keyDistance = advice?.key_distance ?? 0;
  const modeFlip = advice?.mode_flip ?? false;
  const phiKey = computePhiKey(keyDistance, modeFlip);

  const energyA = fromTrack.analysis.energy_score;
  const energyB = toTrack.analysis.energy_score;
  const activeDe = advice?.de_target ?? dETarget;
  const phiEnergy = computePhiEnergy(energyA, energyB, activeDe);
  const phiTimbre = 0.0;

  const activeWeights = advice?.weights ?? weights;
  const total = Math.min(
    Math.max(
      activeWeights.tempo * phiTempo +
        activeWeights.key * phiKey +
        activeWeights.energy * phiEnergy +
        activeWeights.timbre * phiTimbre,
      0.0
    ),
    1.0
  );

  return {
    isAvailable: true,
    total,
    phiTempo,
    phiKey,
    phiEnergy,
    phiTimbre,
    bpmDelta,
    keyDistance,
    modeFlip,
    dETarget: activeDe,
    weights: activeWeights,
    profile: advice?.profile ?? profile,
  };
}
