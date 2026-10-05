import { describe, it, expect } from 'vitest';
import {
  computeTrackRole,
  formatDurationMs,
  computeCumulativeTimeline,
  classifyTransitionCost,
} from './roles';
import type { TransitionCostBreakdown } from './costModel';
import type { SetlistEntry } from '../../bindings/SetlistEntry';

describe('roles.ts Musical Domain Logic', () => {
  describe('formatDurationMs', () => {
    it('formats milliseconds under 1 minute', () => {
      expect(formatDurationMs(45000)).toBe('0:45');
    });

    it('formats standard track duration', () => {
      expect(formatDurationMs(185000)).toBe('3:05');
      expect(formatDurationMs(360000)).toBe('6:00');
    });

    it('formats durations over 1 hour', () => {
      expect(formatDurationMs(3665000)).toBe('1:01:05');
    });

    it('handles negative or NaN durations safely', () => {
      expect(formatDurationMs(-500)).toBe('0:00');
      expect(formatDurationMs(NaN)).toBe('0:00');
    });
  });

  describe('computeTrackRole', () => {
    it('designates first track as OPENER', () => {
      const role = computeTrackRole(0, 5, 5.0, 5.0, 'LinearRamp', true, false);
      expect(role.role).toBe('OPENER');
      expect(role.badgeClass).toContain('amber');
    });

    it('designates last track as CLOSER', () => {
      const role = computeTrackRole(4, 5, 6.0, 6.0, 'LinearRamp', false, true);
      expect(role.role).toBe('CLOSER');
      expect(role.badgeClass).toContain('indigo');
    });

    it('designates bridge track as BRIDGE', () => {
      const role = computeTrackRole(2, 5, 5.0, 5.0, 'LinearRamp', false, false, true);
      expect(role.role).toBe('BRIDGE');
      expect(role.badgeClass).toContain('emerald');
    });

    it('designates high energy tracks as PEAK DRIVE or PLATEAU', () => {
      const peakRole = computeTrackRole(2, 8, 8.5, 8.5, 'PeakPlateau', false, false, false, 6.0);
      expect(peakRole.role).toBe('PEAK DRIVE');

      const plateauRole = computeTrackRole(3, 8, 8.5, 8.5, 'PeakPlateau', false, false, false, 8.5);
      expect(plateauRole.role).toBe('PLATEAU');
    });

    it('designates deliberate energy drops as BREAKDOWN', () => {
      const breakdownRole = computeTrackRole(3, 8, 5.0, 5.5, 'Wave', false, false, false, 7.5);
      expect(breakdownRole.role).toBe('BREAKDOWN');
    });

    it('designates building tracks as BUILD', () => {
      const buildRole = computeTrackRole(1, 6, 6.0, 6.0, 'LinearRamp', false, false, false, 5.0);
      expect(buildRole.role).toBe('BUILD');
    });
  });

  describe('computeCumulativeTimeline', () => {
    it('computes continuous start and end intervals', () => {
      const mockEntries: SetlistEntry[] = [
        {
          position: 1,
          track_id: 't1',
          track: {
            id: 't1',
            duration_ms: 180000, // 3:00
            path: '',
            hash: '',
            tags: { title: 'T1', artist: 'A1', album: null },
            analysis: null,
            analyzed_at: null,
            analysis_version: null,
          },
          transition: null,
          target_energy: 4,
        },
        {
          position: 2,
          track_id: 't2',
          track: {
            id: 't2',
            duration_ms: 240000, // 4:00
            path: '',
            hash: '',
            tags: { title: 'T2', artist: 'A2', album: null },
            analysis: null,
            analyzed_at: null,
            analysis_version: null,
          },
          transition: null,
          target_energy: 6,
        },
      ];

      const intervals = computeCumulativeTimeline(mockEntries);
      expect(intervals).toHaveLength(2);
      expect(intervals[0].startFormatted).toBe('0:00');
      expect(intervals[0].endFormatted).toBe('3:00');
      expect(intervals[1].startFormatted).toBe('3:00');
      expect(intervals[1].endFormatted).toBe('7:00');
    });
  });

  describe('classifyTransitionCost', () => {
    it('classifies cost < 0.25 as LOW COST', () => {
      const breakdown: TransitionCostBreakdown = {
        isAvailable: true,
        total: 0.12,
        phiTempo: 0.05,
        phiKey: 0.1,
        phiEnergy: 0.2,
        phiTimbre: 0.0,
        bpmDelta: 1,
        keyDistance: 0,
        modeFlip: false,
        dETarget: 0,
        weights: { tempo: 0.3, key: 0.35, energy: 0.35, timbre: 0 },
        profile: 'LinearRamp',
      };
      const verdict = classifyTransitionCost(breakdown);
      expect(verdict.verdict).toBe('LOW COST');
      expect(verdict.subLabel).toBe('NATURAL BLEND');
      expect(verdict.textColorClass).toContain('emerald');
    });

    it('classifies cost between 0.25 and 0.55 as MODERATE SHIFT', () => {
      const breakdown: TransitionCostBreakdown = {
        isAvailable: true,
        total: 0.38,
        phiTempo: 0.3,
        phiKey: 0.4,
        phiEnergy: 0.4,
        phiTimbre: 0.0,
        bpmDelta: 2,
        keyDistance: 1,
        modeFlip: false,
        dETarget: 0,
        weights: { tempo: 0.3, key: 0.35, energy: 0.35, timbre: 0 },
        profile: 'LinearRamp',
      };
      const verdict = classifyTransitionCost(breakdown);
      expect(verdict.verdict).toBe('MODERATE SHIFT');
      expect(verdict.subLabel).toBe('ENERGY LIFT');
      expect(verdict.textColorClass).toContain('amber');
    });

    it('classifies cost >= 0.55 as HIGH COST', () => {
      const breakdown: TransitionCostBreakdown = {
        isAvailable: true,
        total: 0.72,
        phiTempo: 0.8,
        phiKey: 0.9,
        phiEnergy: 0.5,
        phiTimbre: 0.0,
        bpmDelta: 8,
        keyDistance: 4,
        modeFlip: true,
        dETarget: 0,
        weights: { tempo: 0.3, key: 0.35, energy: 0.35, timbre: 0 },
        profile: 'LinearRamp',
      };
      const verdict = classifyTransitionCost(breakdown);
      expect(verdict.verdict).toBe('HIGH COST');
      expect(verdict.subLabel).toBe('CHALLENGING JUMP');
      expect(verdict.textColorClass).toContain('rose');
    });
  });
});
