import { describe, it, expect } from 'vitest';
import { camelotColor, camelotTextColor, ALL_CAMELOT_KEYS } from './camelotColor';
import type { CamelotLetter } from '../bindings/CamelotLetter';

describe('camelotColor', () => {
  it('covers all 24 keys with non-empty hex strings', () => {
    expect(ALL_CAMELOT_KEYS.length).toBe(24);

    for (const key of ALL_CAMELOT_KEYS) {
      const color = camelotColor(key);
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('correctly handles Camelot object format for all 24 keys', () => {
    for (let num = 1; num <= 12; num++) {
      for (const letter of ['A', 'B'] as CamelotLetter[]) {
        const objColor = camelotColor({ number: num, letter });
        const strColor = camelotColor(`${num}${letter}`);
        expect(objColor).toBe(strColor);
        expect(objColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('provides appropriate contrast text colors', () => {
    expect(camelotTextColor('11B')).toBe('#0f172a');
    expect(camelotTextColor('8A')).toBe('#ffffff');
    expect(camelotTextColor('3A')).toBe('#ffffff');
  });

  it('falls back gracefully on invalid or empty input', () => {
    expect(camelotColor(null)).toBe('#64748b');
    expect(camelotColor(undefined)).toBe('#64748b');
    expect(camelotColor('')).toBe('#64748b');
    expect(camelotColor('99Z')).toBe('#64748b');
  });
});
