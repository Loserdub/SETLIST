import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { EnergyPoint } from './types';

/**
 * Computes the target energy level (1.0 to 10.0) at 0-based position `k` of `n` tracks.
 * Exact mirror of the Rust `crates/sequencer/src/profiles.rs` target energy model.
 */
export function getTargetEnergy(profile: EnergyProfile, k: number, n: number): number {
  if (n <= 1) {
    switch (profile) {
      case 'LinearRamp':
      case 'Wave':
        return 5.0;
      case 'PeakPlateau':
        return 8.5;
    }
  }

  const clampedK = Math.min(Math.max(k, 0), n - 1);
  const t = clampedK / (n - 1);

  switch (profile) {
    case 'LinearRamp': {
      // Linear ramp from 4.0 to 9.0. Energy rises steadily and never drops.
      return Math.round((4.0 + 5.0 * t) * 100) / 100;
    }
    case 'Wave': {
      // Alternates peaks and valleys:
      // Starts around 3.5, peaks at t = 0.25 (8.6), dips to valley at t = 0.5 (3.75),
      // peaks again at t = 0.75 (8.9), and cools down at t = 1.0 (4.0).
      const base = 6.0 + 0.5 * t;
      const oscillation = -2.5 * Math.cos(4.0 * Math.PI * t);
      const val = Math.min(Math.max(base + oscillation, 1.0), 10.0);
      return Math.round(val * 100) / 100;
    }
    case 'PeakPlateau': {
      // Reaches high energy (8.5) early (by t = 0.25) and holds it.
      const rampFraction = 0.25;
      if (t <= rampFraction) {
        return Math.round((4.0 + (8.5 - 4.0) * (t / rampFraction)) * 100) / 100;
      } else {
        return 8.5;
      }
    }
  }
}

/**
 * Maps setlist entries to energy trajectory points for visual graphing.
 */
export function computeEnergyTrajectory(
  entries: SetlistEntry[],
  profile: EnergyProfile
): EnergyPoint[] {
  const n = entries.length;

  return entries.map((entry, index) => {
    const track = entry.track;
    const actualEnergy = track?.analysis?.energy_score ?? entry.target_energy ?? 5;
    const targetEnergy = getTargetEnergy(profile, index, n);
    const bpm = track?.analysis?.rhythm.grid.bpm ? Math.round(track.analysis.rhythm.grid.bpm) : 0;
    const camelot = track?.analysis?.key.camelot
      ? `${track.analysis.key.camelot.number}${track.analysis.key.camelot.letter}`
      : '—';

    return {
      position: index + 1,
      actualEnergy,
      targetEnergy,
      trackTitle: track?.tags.title ?? `Track #${index + 1}`,
      bpm,
      camelotKey: camelot,
    };
  });
}

/**
 * Canonical helper that recalculates 1-based contiguous positions and position-derived
 * target_energy for every entry in the setlist.
 *
 * Target energy is derived solely from:
 * - current position index
 * - selected EnergyProfile
 * - canonical getTargetEnergy profile formula
 *
 * Never derives target_energy from the song's actual energy_score.
 */
export function recalculateSetlistTargetEnergy(
  entries: SetlistEntry[],
  profile: EnergyProfile
): SetlistEntry[] {
  const n = entries.length;
  return entries.map((entry, index) => ({
    ...entry,
    position: index + 1,
    target_energy: getTargetEnergy(profile, index, n),
  }));
}

