import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { ExportTarget } from '../../bindings/ExportTarget';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';

export interface SetlistPins {
  lockFirst: boolean;
  lockLast: boolean;
}

export interface TransitionModalState {
  isOpen: boolean;
  trackAId: string | null;
  trackBId: string | null;
  trackATitle: string;
  trackBTitle: string;
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

export type { EnergyProfile, ExportTarget, TransitionAdvice };
