import { describe, it, expect } from 'vitest';
import {
  arrayMove,
  validatePins,
  isMovePermitted,
  reorderSetlistEntries,
  applyPinsToOrderedIds,
} from './reorder';
import {
  getTargetEnergy,
  computeEnergyTrajectory,
  recalculateSetlistTargetEnergy,
} from './energyCurve';
import {
  computePhiTempo,
  computePhiKey,
  computePhiEnergy,
  computeTransitionCost,
} from './costModel';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { Track } from '../../bindings/Track';

describe('Setlist Pure Functions: reorder.ts', () => {
  describe('arrayMove', () => {
    it('moves an element forward in an array', () => {
      const items = ['A', 'B', 'C', 'D'];
      const moved = arrayMove(items, 0, 2);
      expect(moved).toEqual(['B', 'C', 'A', 'D']);
    });

    it('moves an element backward in an array', () => {
      const items = ['A', 'B', 'C', 'D'];
      const moved = arrayMove(items, 3, 1);
      expect(moved).toEqual(['A', 'D', 'B', 'C']);
    });

    it('returns an identical shallow clone when from === to', () => {
      const items = ['A', 'B', 'C'];
      const moved = arrayMove(items, 1, 1);
      expect(moved).toEqual(['A', 'B', 'C']);
      expect(moved).not.toBe(items);
    });
  });

  describe('isMovePermitted with SetlistPins', () => {
    it('permits all moves when no pins are enabled', () => {
      const pins = { lockFirst: false, lockLast: false };
      expect(isMovePermitted(0, 3, 5, pins)).toBe(true);
      expect(isMovePermitted(4, 1, 5, pins)).toBe(true);
      expect(isMovePermitted(1, 2, 5, pins)).toBe(true);
    });

    it('prohibits moving the first track when lockFirst is true', () => {
      const pins = { lockFirst: true, lockLast: false };
      expect(isMovePermitted(0, 1, 4, pins)).toBe(false);
      expect(isMovePermitted(0, 3, 4, pins)).toBe(false);
    });

    it('prohibits moving any track into the first position when lockFirst is true', () => {
      const pins = { lockFirst: true, lockLast: false };
      expect(isMovePermitted(1, 0, 4, pins)).toBe(false);
      expect(isMovePermitted(3, 0, 4, pins)).toBe(false);
    });

    it('allows middle and end moves when only lockFirst is true', () => {
      const pins = { lockFirst: true, lockLast: false };
      expect(isMovePermitted(1, 2, 4, pins)).toBe(true);
      expect(isMovePermitted(2, 3, 4, pins)).toBe(true);
      expect(isMovePermitted(3, 1, 4, pins)).toBe(true);
    });

    it('prohibits moving the last track when lockLast is true', () => {
      const pins = { lockFirst: false, lockLast: true };
      expect(isMovePermitted(3, 1, 4, pins)).toBe(false);
      expect(isMovePermitted(3, 0, 4, pins)).toBe(false);
    });

    it('prohibits moving any track into the last position when lockLast is true', () => {
      const pins = { lockFirst: false, lockLast: true };
      expect(isMovePermitted(1, 3, 4, pins)).toBe(false);
      expect(isMovePermitted(0, 3, 4, pins)).toBe(false);
    });

    it('enforces both lockFirst and lockLast constraints simultaneously', () => {
      const pins = { lockFirst: true, lockLast: true };
      // Prohibited boundary moves:
      expect(isMovePermitted(0, 2, 5, pins)).toBe(false);
      expect(isMovePermitted(2, 0, 5, pins)).toBe(false);
      expect(isMovePermitted(4, 2, 5, pins)).toBe(false);
      expect(isMovePermitted(2, 4, 5, pins)).toBe(false);

      // Permitted inner moves (between 1 and 3 in a 5-item array):
      expect(isMovePermitted(1, 2, 5, pins)).toBe(true);
      expect(isMovePermitted(2, 3, 5, pins)).toBe(true);
      expect(isMovePermitted(3, 1, 5, pins)).toBe(true);
    });
  });

  describe('reorderSetlistEntries', () => {
    const mockEntries: SetlistEntry[] = [
      { position: 1, track_id: 't-1', track: null, transition: null, target_energy: 4 },
      { position: 2, track_id: 't-2', track: null, transition: null, target_energy: 5 },
      { position: 3, track_id: 't-3', track: null, transition: null, target_energy: 6 },
      { position: 4, track_id: 't-4', track: null, transition: null, target_energy: 7 },
    ];

    it('reorders unpinned entries and recalculates 1-based positions', () => {
      const reordered = reorderSetlistEntries(mockEntries, 1, 3);
      expect(reordered.map((e) => e.track_id)).toEqual(['t-1', 't-3', 't-4', 't-2']);
      expect(reordered.map((e) => e.position)).toEqual([1, 2, 3, 4]);
    });

    it('refuses reordering when move violates lockFirst', () => {
      const reordered = reorderSetlistEntries(mockEntries, 0, 2, {
        lockFirst: true,
        lockLast: false,
      });
      expect(reordered).toBe(mockEntries);
    });

    it('refuses reordering when move violates lockLast', () => {
      const reordered = reorderSetlistEntries(mockEntries, 1, 3, {
        lockFirst: false,
        lockLast: true,
      });
      expect(reordered).toBe(mockEntries);
    });

    it('successfully reorders inner tracks when both pins are active', () => {
      const reordered = reorderSetlistEntries(mockEntries, 1, 2, {
        lockFirst: true,
        lockLast: true,
      });
      expect(reordered.map((e) => e.track_id)).toEqual(['t-1', 't-3', 't-2', 't-4']);
      expect(reordered[0].track_id).toBe('t-1');
      expect(reordered[3].track_id).toBe('t-4');
    });
  });

  describe('applyPinsToOrderedIds', () => {
    const original = ['A', 'B', 'C', 'D', 'E'];
    const suggested = ['C', 'E', 'A', 'D', 'B'];

    it('returns suggested order directly when no pins are set', () => {
      const result = applyPinsToOrderedIds(original, suggested, {
        lockFirst: false,
        lockLast: false,
      });
      expect(result).toEqual(['C', 'E', 'A', 'D', 'B']);
    });

    it('anchors original first track at position 0 when lockFirst is active', () => {
      const result = applyPinsToOrderedIds(original, suggested, {
        lockFirst: true,
        lockLast: false,
      });
      expect(result[0]).toBe('A');
      // Remaining items follow suggested relative order without duplicates
      expect(result).toEqual(['A', 'C', 'E', 'D', 'B']);
    });

    it('anchors original last track at position N-1 when lockLast is active', () => {
      const result = applyPinsToOrderedIds(original, suggested, {
        lockFirst: false,
        lockLast: true,
      });
      expect(result[result.length - 1]).toBe('E');
      // Remaining items follow suggested relative order without duplicates
      expect(result).toEqual(['C', 'A', 'D', 'B', 'E']);
    });

    it('anchors both first and last tracks when both pins are active', () => {
      const result = applyPinsToOrderedIds(original, suggested, {
        lockFirst: true,
        lockLast: true,
      });
      expect(result[0]).toBe('A');
      expect(result[result.length - 1]).toBe('E');
      // Inner tracks: 'C', 'D', 'B'
      expect(result).toEqual(['A', 'C', 'D', 'B', 'E']);
    });

    it('handles small arrays <= 1 safely by resetting pins', () => {
      const one = ['X'];
      const res = applyPinsToOrderedIds(one, ['X'], { lockFirst: true, lockLast: true });
      expect(res).toEqual(['X']);
    });

    it('enforces pins on 2-track arrays consistently', () => {
      const two = ['X', 'Y'];
      const resBoth = applyPinsToOrderedIds(two, ['Y', 'X'], { lockFirst: true, lockLast: true });
      expect(resBoth).toEqual(['X', 'Y']);

      const resFirstOnly = applyPinsToOrderedIds(two, ['Y', 'X'], { lockFirst: true, lockLast: false });
      expect(resFirstOnly).toEqual(['X', 'Y']);

      const resLastOnly = applyPinsToOrderedIds(two, ['Y', 'X'], { lockFirst: false, lockLast: true });
      expect(resLastOnly).toEqual(['X', 'Y']);
    });
  });

  describe('validatePins', () => {
    it('resets pins to false when track count is 0 or 1', () => {
      expect(validatePins(0, { lockFirst: true, lockLast: true })).toEqual({
        lockFirst: false,
        lockLast: false,
      });
      expect(validatePins(1, { lockFirst: true, lockLast: true })).toEqual({
        lockFirst: false,
        lockLast: false,
      });
    });

    it('preserves pins when track count is 2 or more', () => {
      expect(validatePins(2, { lockFirst: true, lockLast: false })).toEqual({
        lockFirst: true,
        lockLast: false,
      });
      expect(validatePins(5, { lockFirst: true, lockLast: true })).toEqual({
        lockFirst: true,
        lockLast: true,
      });
    });
  });
});

describe('Setlist Pure Functions: energyCurve.ts', () => {
  describe('getTargetEnergy', () => {
    it('calculates LinearRamp correctly from 4.0 to 9.0', () => {
      const n = 5;
      expect(getTargetEnergy('LinearRamp', 0, n)).toBe(4.0);
      expect(getTargetEnergy('LinearRamp', 2, n)).toBe(6.5);
      expect(getTargetEnergy('LinearRamp', 4, n)).toBe(9.0);
    });

    it('calculates Wave trajectory with peaks and dips', () => {
      const n = 9;
      // t = 0 -> cos(0)=1 -> 6.0 - 2.5 = 3.5
      expect(getTargetEnergy('Wave', 0, n)).toBe(3.5);
      // t = 0.25 (index 2) -> cos(pi)=-1 -> 6.125 + 2.5 = 8.63
      const peak1 = getTargetEnergy('Wave', 2, n);
      expect(peak1).toBeGreaterThan(8.0);
      // t = 0.5 (index 4) -> cos(2pi)=1 -> 6.25 - 2.5 = 3.75
      const valley = getTargetEnergy('Wave', 4, n);
      expect(valley).toBeLessThan(4.0);
      // t = 0.75 (index 6) -> cos(3pi)=-1 -> peak again
      const peak2 = getTargetEnergy('Wave', 6, n);
      expect(peak2).toBeGreaterThan(8.5);
    });

    it('calculates PeakPlateau with quick ramp to 8.5 and holding', () => {
      const n = 9;
      expect(getTargetEnergy('PeakPlateau', 0, n)).toBe(4.0);
      // At index 2 (t = 0.25), reaches 8.5
      expect(getTargetEnergy('PeakPlateau', 2, n)).toBe(8.5);
      // Beyond t = 0.25, holds 8.5 plateau
      expect(getTargetEnergy('PeakPlateau', 5, n)).toBe(8.5);
      expect(getTargetEnergy('PeakPlateau', 8, n)).toBe(8.5);
    });
  });

  describe('computeEnergyTrajectory', () => {
    it('creates trajectory points from setlist entries', () => {
      const entries: SetlistEntry[] = [
        {
          position: 1,
          track_id: 't-1',
          track: {
            tags: { title: 'First Song', artist: 'Artist A', album: 'Album A' },
            analysis: {
              energy_score: 3,
              rhythm: { grid: { bpm: 122 } },
              key: { camelot: { number: 4, letter: 'A' } },
            },
          } as unknown as Track,
          transition: null,
          target_energy: 3,
        },
        {
          position: 2,
          track_id: 't-2',
          track: {
            tags: { title: 'Second Song', artist: 'Artist B', album: 'Album B' },
            analysis: {
              energy_score: 8,
              rhythm: { grid: { bpm: 126 } },
              key: { camelot: { number: 5, letter: 'A' } },
            },
          } as unknown as Track,
          transition: null,
          target_energy: 8,
        },
      ];

      const points = computeEnergyTrajectory(entries, 'LinearRamp');
      expect(points).toHaveLength(2);
      expect(points[0]).toEqual({
        position: 1,
        actualEnergy: 3,
        targetEnergy: 4.0,
        trackTitle: 'First Song',
        bpm: 122,
        camelotKey: '4A',
      });
      expect(points[1]).toEqual({
        position: 2,
        actualEnergy: 8,
        targetEnergy: 9.0,
        trackTitle: 'Second Song',
        bpm: 126,
        camelotKey: '5A',
      });
    });
  });

  describe('recalculateSetlistTargetEnergy', () => {
    it('handles empty setlist cleanly without errors', () => {
      const result = recalculateSetlistTargetEnergy([], 'LinearRamp');
      expect(result).toEqual([]);
    });

    it('derives position-based target energy for single-track setlist', () => {
      const single: SetlistEntry[] = [
        {
          position: 99, // stale position
          track_id: 'track-1',
          track: {
            analysis: { energy_score: 9 }, // high actual energy
          } as unknown as Track,
          transition: null,
          target_energy: 1.0, // stale target energy
        },
      ];

      // LinearRamp / Wave single track returns 5.0
      const resLinear = recalculateSetlistTargetEnergy(single, 'LinearRamp');
      expect(resLinear).toHaveLength(1);
      expect(resLinear[0].position).toBe(1);
      expect(resLinear[0].target_energy).toBe(5.0);
      expect(resLinear[0].target_energy).not.toBe(9); // Never actual energy

      // PeakPlateau single track returns 8.5
      const resPeak = recalculateSetlistTargetEnergy(single, 'PeakPlateau');
      expect(resPeak[0].position).toBe(1);
      expect(resPeak[0].target_energy).toBe(8.5);
    });

    it('ensures contiguous 1..N positions and correct position-derived energy', () => {
      const entries: SetlistEntry[] = [
        {
          position: 5,
          track_id: 't-a',
          track: { analysis: { energy_score: 10 } } as unknown as Track,
          transition: null,
          target_energy: 10,
        },
        {
          position: 12,
          track_id: 't-b',
          track: { analysis: { energy_score: 1 } } as unknown as Track,
          transition: null,
          target_energy: 1,
        },
        {
          position: 1,
          track_id: 't-c',
          track: { analysis: { energy_score: 5 } } as unknown as Track,
          transition: null,
          target_energy: 5,
        },
      ];

      const recalculated = recalculateSetlistTargetEnergy(entries, 'LinearRamp');
      expect(recalculated.map((e) => e.position)).toEqual([1, 2, 3]);

      // N = 3: index 0 -> 4.0, index 1 -> 6.5, index 2 -> 9.0
      expect(recalculated[0].target_energy).toBe(4.0);
      expect(recalculated[1].target_energy).toBe(6.5);
      expect(recalculated[2].target_energy).toBe(9.0);

      // Verify that changing profile derives new target energies
      const waveRecalculated = recalculateSetlistTargetEnergy(entries, 'Wave');
      expect(waveRecalculated[0].target_energy).toBe(3.5);
      expect(waveRecalculated.map((e) => e.position)).toEqual([1, 2, 3]);
    });
  });
});

describe('Setlist Pure Functions: costModel.ts', () => {
  describe('computePhiTempo', () => {
    it('returns 0.0 for exact tempo match', () => {
      expect(computePhiTempo(124, 124)).toBe(0.0);
    });

    it('returns linear fraction up to 6 BPM difference', () => {
      expect(computePhiTempo(120, 123)).toBe(0.5);
      expect(computePhiTempo(120, 126)).toBe(1.0);
    });

    it('clamps to 1.0 when BPM delta exceeds 6', () => {
      expect(computePhiTempo(120, 132)).toBe(1.0);
    });

    it('detects x2 octave relationship within 3%', () => {
      // 140 BPM to 70 BPM (x0.5 octave relation)
      expect(computePhiTempo(140, 70)).toBe(0.0);
      // 60 BPM to 120 BPM (x2 octave relation)
      expect(computePhiTempo(60, 120)).toBe(0.0);
    });
  });

  describe('computePhiKey', () => {
    it('returns exact values from AGENTS.md 6.3 table for same mode', () => {
      expect(computePhiKey(0, false)).toBe(0.00);
      expect(computePhiKey(1, false)).toBe(0.10);
      expect(computePhiKey(2, false)).toBe(0.35);
      expect(computePhiKey(3, false)).toBe(0.70);
      expect(computePhiKey(4, false)).toBe(0.85);
      expect(computePhiKey(5, false)).toBe(0.95);
      expect(computePhiKey(6, false)).toBe(1.00);
    });

    it('returns exact values from AGENTS.md 6.3 table for mode flip', () => {
      expect(computePhiKey(0, true)).toBe(0.10);
      expect(computePhiKey(1, true)).toBe(0.40);
      expect(computePhiKey(2, true)).toBe(0.60);
      expect(computePhiKey(3, true)).toBe(0.80);
      expect(computePhiKey(4, true)).toBe(0.90);
      expect(computePhiKey(5, true)).toBe(0.95);
      expect(computePhiKey(6, true)).toBe(1.00);
    });
  });

  describe('computePhiEnergy', () => {
    it('returns 0.0 when energy change matches target delta', () => {
      expect(computePhiEnergy(5, 7, 2)).toBe(0.0);
    });

    it('computes normalized quadratic difference clamped to 1.0', () => {
      // Deviation of 2: (2)^2 / 16 = 4/16 = 0.25
      expect(computePhiEnergy(4, 6, 0)).toBe(0.25);
      // Deviation of 4: (4)^2 / 16 = 16/16 = 1.0
      expect(computePhiEnergy(2, 6, 0)).toBe(1.0);
      // Deviation of 6: 36/16 clamped to 1.0
      expect(computePhiEnergy(1, 7, 0)).toBe(1.0);
    });
  });

  describe('computeTransitionCost', () => {
    it('computes weighted combination with default weights', () => {
      const trackA = {
        analysis: {
          rhythm: { grid: { bpm: 120 } },
          energy_score: 5,
        },
      } as Track;

      const trackB = {
        analysis: {
          rhythm: { grid: { bpm: 120 } },
          energy_score: 5,
        },
      } as Track;

      const advice = {
        bpm_delta: 0,
        key_distance: 0,
        mode_flip: false,
      } as any;

      const cost = computeTransitionCost(trackA, trackB, advice);
      expect(cost.total).toBe(0.0);
      expect(cost.phiTempo).toBe(0.0);
      expect(cost.phiKey).toBe(0.0);
      expect(cost.phiEnergy).toBe(0.0);
    });
  });
});
