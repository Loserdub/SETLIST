import { describe, it, expect } from 'vitest';
import {
  clamp,
  clampBpm,
  halfBpm,
  doubleBpm,
  nudgeBpm,
  calculateBeatPeriodMs,
  nudgeDownbeat,
  shiftBeat,
  isValidCamelot,
  normalizeCamelot,
  ALL_CAMELOT_KEYS_24,
  MIN_BPM,
  MAX_BPM,
} from './overrideMath';

describe('overrideMath pure functions', () => {
  describe('clamp', () => {
    it('clamps values below min', () => {
      expect(clamp(5, 10, 20)).toBe(10);
    });

    it('clamps values above max', () => {
      expect(clamp(25, 10, 20)).toBe(20);
    });

    it('leaves values within range unchanged', () => {
      expect(clamp(15, 10, 20)).toBe(15);
    });

    it('handles NaN by returning min', () => {
      expect(clamp(NaN, 10, 20)).toBe(10);
    });
  });

  describe('clampBpm', () => {
    it('clamps BPM to default limits [20, 300]', () => {
      expect(clampBpm(10)).toBe(MIN_BPM);
      expect(clampBpm(350)).toBe(MAX_BPM);
      expect(clampBpm(124.56)).toBe(124.6);
    });

    it('respects custom limits', () => {
      expect(clampBpm(50, 60, 180)).toBe(60);
      expect(clampBpm(200, 60, 180)).toBe(180);
    });
  });

  describe('halfBpm', () => {
    it('halves typical dance tempos accurately', () => {
      expect(halfBpm(140)).toBe(70);
      expect(halfBpm(128)).toBe(64);
      expect(halfBpm(175)).toBe(87.5);
    });

    it('clamps to minimum BPM boundary when halved', () => {
      expect(halfBpm(30)).toBe(MIN_BPM);
      expect(halfBpm(MIN_BPM)).toBe(MIN_BPM);
    });
  });

  describe('doubleBpm', () => {
    it('doubles typical halftime tempos accurately', () => {
      expect(doubleBpm(70)).toBe(140);
      expect(doubleBpm(87.5)).toBe(175);
      expect(doubleBpm(64)).toBe(128);
    });

    it('clamps to maximum BPM boundary when doubled', () => {
      expect(doubleBpm(180)).toBe(MAX_BPM);
      expect(doubleBpm(MAX_BPM)).toBe(MAX_BPM);
    });
  });

  describe('nudgeBpm', () => {
    it('nudges BPM up and down by 0.1 without floating point drift', () => {
      expect(nudgeBpm(120.0, 0.1)).toBe(120.1);
      expect(nudgeBpm(120.1, -0.1)).toBe(120.0);
      expect(nudgeBpm(124.9, 0.1)).toBe(125.0);
      expect(nudgeBpm(125.0, -0.1)).toBe(124.9);
    });

    it('clamps at boundaries when nudged', () => {
      expect(nudgeBpm(MAX_BPM, 0.1)).toBe(MAX_BPM);
      expect(nudgeBpm(MIN_BPM, -0.1)).toBe(MIN_BPM);
    });
  });

  describe('calculateBeatPeriodMs', () => {
    it('computes milliseconds per beat accurately', () => {
      expect(calculateBeatPeriodMs(120)).toBe(500);
      expect(calculateBeatPeriodMs(60)).toBe(1000);
      expect(calculateBeatPeriodMs(125)).toBe(480);
    });

    it('returns 0 for non-positive BPM', () => {
      expect(calculateBeatPeriodMs(0)).toBe(0);
      expect(calculateBeatPeriodMs(-10)).toBe(0);
    });
  });

  describe('nudgeDownbeat', () => {
    it('nudges forward and backward by ms increments', () => {
      expect(nudgeDownbeat(100.0, 10.0)).toBe(110.0);
      expect(nudgeDownbeat(100.0, -10.0)).toBe(90.0);
    });

    it('clamps at 0 ms (no negative timestamps)', () => {
      expect(nudgeDownbeat(5.0, -10.0)).toBe(0);
      expect(nudgeDownbeat(0.0, -10.0)).toBe(0);
    });

    it('respects optional maxMs duration bound', () => {
      expect(nudgeDownbeat(95.0, 10.0, 100.0)).toBe(100.0);
    });
  });

  describe('shiftBeat', () => {
    it('shifts forward by one beat period', () => {
      // 120 BPM -> 500 ms beat period
      expect(shiftBeat(120.0, 120, 1)).toBe(620.0);
    });

    it('shifts backward by one beat period', () => {
      // 120 BPM -> 500 ms beat period
      expect(shiftBeat(750.0, 120, -1)).toBe(250.0);
    });

    it('clamps at 0 ms when shifting backward past beginning', () => {
      expect(shiftBeat(200.0, 120, -1)).toBe(0);
    });

    it('respects optional maxMs duration bound', () => {
      expect(shiftBeat(900.0, 120, 1, 1200.0)).toBe(1200.0);
    });
  });

  describe('Camelot key validation and normalization', () => {
    it('contains all 24 Camelot keys in structured order', () => {
      expect(ALL_CAMELOT_KEYS_24).toHaveLength(24);
      expect(ALL_CAMELOT_KEYS_24.filter((k) => k.endsWith('A'))).toHaveLength(12);
      expect(ALL_CAMELOT_KEYS_24.filter((k) => k.endsWith('B'))).toHaveLength(12);
    });

    it('validates genuine Camelot keys', () => {
      expect(isValidCamelot('1A')).toBe(true);
      expect(isValidCamelot('12B')).toBe(true);
      expect(isValidCamelot('8a')).toBe(true);
      expect(isValidCamelot(' 5b ')).toBe(true);
    });

    it('rejects invalid Camelot keys', () => {
      expect(isValidCamelot('0A')).toBe(false);
      expect(isValidCamelot('13A')).toBe(false);
      expect(isValidCamelot('8C')).toBe(false);
      expect(isValidCamelot('C# Minor')).toBe(false);
      expect(isValidCamelot('')).toBe(false);
    });

    it('normalizes Camelot keys to uppercase without whitespace', () => {
      expect(normalizeCamelot('8a')).toBe('8A');
      expect(normalizeCamelot(' 11b ')).toBe('11B');
      expect(normalizeCamelot('invalid')).toBeNull();
    });
  });
});
