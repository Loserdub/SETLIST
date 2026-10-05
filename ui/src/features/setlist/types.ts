import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { ExportTarget } from '../../bindings/ExportTarget';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import type { SetRole, TransitionVerdict, TimelineInterval } from './roles';

export interface SetlistPins {
  lockFirst: boolean;
  lockLast: boolean;
  pinnedIds?: string[];
  excludedIds?: string[];
}

export interface TransitionModalState {
  isOpen: boolean;
  trackAId: string | null;
  trackBId: string | null;
  trackATitle: string;
  trackBTitle: string;
  posA?: number;
  posB?: number;
  advice: TransitionAdvice | null;
  isLoading: boolean;
  error: string | null;
}

export interface EnergyPoint {
  position: number; // 1-based
  actualEnergy: number;
  targetEnergy: number;
  trackTitle: string;
  bpm: number;
  camelotKey: string;
}

export type PreferredTransitionPreset =
  | 'Balanced'
  | 'Harmonic'
  | 'Energy'
  | 'Tempo';

export interface BridgeCandidateResult {
  trackId: string;
  title: string;
  artist: string;
  key: string;
  bpm: number;
  energy: number;
  durationMs: number;
  bridgeRole: 'Harmonic Bridge' | 'Tempo Bridge' | 'Energy Bridge' | 'Multi-Role Bridge';
  costFromA: number;
  costToB: number;
  totalBridgeCost: number;
}

export type { EnergyProfile, ExportTarget, TransitionAdvice, SetRole, TransitionVerdict, TimelineInterval };
