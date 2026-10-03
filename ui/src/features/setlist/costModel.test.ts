import { describe, it, expect } from 'vitest';
import {
  computeTransitionCost,
  computePhiTempo,
  computePhiKey,
  DEFAULT_WEIGHTS,
} from './costModel';
import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import type { CostWeights } from '../../bindings/CostWeights';

function createMockTrack(id: string, bpm: number, camelotNum: number, letter: 'A' | 'B', energy: number): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    duration_ms: 180000,
    tags: {
      title: `Track ${id}`,
      artist: `Artist ${id}`,
      album: 'Test Album',
    },
    analysis: {
      loudness: {
        integrated_lufs: -14.0,
        loudness_range: 6.0,
        true_peak: -1.0,
      },
      rhythm: {
        grid: {
          first_downbeat_ms: 100.0,
          bpm,
          beats_ms: [],
          downbeat_flags: [],
          steady: true,
        },
        bpm_alternates: [],
      },
      key: {
        pitch_class: 0,
        mode: letter === 'A' ? 'Minor' : 'Major',
        camelot: {
          number: camelotNum,
          letter,
        },
        tuning_cents: 0.0,
      },
      dynamics: {
        frame_rate: 50,
        rms_curve: [],
        low_ratio_curve: [],
        centroid_curve: [],
      },
      energy_score: energy,
      energy_curve: {
        per_bar: [],
      },
      segments: [],
      cue_points: [],
      waveform: {
        points_per_sec: 10,
        low: { peak: [], rms: [] },
        mid: { peak: [], rms: [] },
        high: { peak: [], rms: [] },
      },
    },
    analyzed_at: new Date().toISOString(),
    analysis_version: 'v1.0.0',
  };
}

describe('Transition Cost Model Semantics', () => {
  it('computes exact phi_tempo with octave adjustment matching Rust scoring', () => {
    // Exact match
    expect(computePhiTempo(120, 120)).toBe(0.0);
    // Delta 3 BPM -> 3 / 6 = 0.5
    expect(computePhiTempo(120, 123)).toBe(0.5);
    // Delta 6+ BPM -> clamped to 1.0
    expect(computePhiTempo(120, 130)).toBe(1.0);
    // Octave match (120 to 60 -> within 3% of 0.5 ratio -> effective 120)
    expect(computePhiTempo(120, 60)).toBe(0.0);
    // Invalid / missing tempo
    expect(computePhiTempo(0, 120)).toBe(1.0);
  });

  it('computes phi_key matching AGENTS.md Table 6.3 lookup', () => {
    // Same mode: 0 -> 0.0, 1 -> 0.10, 2 -> 0.35, 3 -> 0.70, 4 -> 0.85, 5 -> 0.95, 6 -> 1.00
    expect(computePhiKey(0, false)).toBe(0.0);
    expect(computePhiKey(1, false)).toBe(0.10);
    expect(computePhiKey(2, false)).toBe(0.35);
    expect(computePhiKey(3, false)).toBe(0.70);
    expect(computePhiKey(4, false)).toBe(0.85);
    expect(computePhiKey(5, false)).toBe(0.95);
    expect(computePhiKey(6, false)).toBe(1.00);

    // Mode flip: 0 -> 0.10, 1 -> 0.40, 2 -> 0.60, 3 -> 0.80, 4 -> 0.90, 5 -> 0.95, 6 -> 1.00
    expect(computePhiKey(0, true)).toBe(0.10);
    expect(computePhiKey(1, true)).toBe(0.40);
    expect(computePhiKey(2, true)).toBe(0.60);
    expect(computePhiKey(3, true)).toBe(0.80);
    expect(computePhiKey(4, true)).toBe(0.90);
    expect(computePhiKey(5, true)).toBe(0.95);
    expect(computePhiKey(6, true)).toBe(1.00);
  });

  it('proves EnergyProfile / dE_target affects energy cost component and total cost', () => {
    const trackA = createMockTrack('A', 120, 8, 'A', 4);
    const trackB = createMockTrack('B', 120, 8, 'A', 6);
    // Energy jump is 6 - 4 = +2.

    // If target slope is +2.0 (Linear Ramp), deviation is (2 - 2) = 0 -> phiEnergy = 0.0
    const rampCost = computeTransitionCost(trackA, trackB, null, 2.0);
    expect(rampCost.phiEnergy).toBe(0.0);

    // If target slope is 0.0 (Flat plateau), deviation is (2 - 0)^2 / 16 = 4/16 = 0.25
    const flatCost = computeTransitionCost(trackA, trackB, null, 0.0);
    expect(flatCost.phiEnergy).toBe(0.25);

    // Total cost with ramp slope should be lower than flat
    expect(rampCost.total).toBeLessThan(flatCost.total);
  });

  it('proves CostWeights affect total cost and changing weights changes the result', () => {
    const trackA = createMockTrack('A', 120, 8, 'A', 4);
    const trackB = createMockTrack('B', 126, 11, 'A', 8); // BPM delta 6, key dist 3, energy delta 4

    // Default weights: tempo 0.30, key 0.35, energy 0.35
    const defaultCost = computeTransitionCost(trackA, trackB, null, 0, DEFAULT_WEIGHTS);

    // Custom weights 1: Tempo heavy
    const tempoHeavyWeights: CostWeights = {
      tempo: 0.80,
      key: 0.10,
      energy: 0.10,
      timbre: 0.00,
    };
    const tempoHeavyCost = computeTransitionCost(trackA, trackB, null, 0, tempoHeavyWeights);

    // Custom weights 2: Key heavy
    const keyHeavyWeights: CostWeights = {
      tempo: 0.10,
      key: 0.80,
      energy: 0.10,
      timbre: 0.00,
    };
    const keyHeavyCost = computeTransitionCost(trackA, trackB, null, 0, keyHeavyWeights);

    expect(defaultCost.total).toBeGreaterThan(0);
    expect(tempoHeavyCost.total).not.toBe(defaultCost.total);
    expect(keyHeavyCost.total).not.toBe(tempoHeavyCost.total);
  });

  it('proves authoritative backend advice values are preserved directly', () => {
    const trackA = createMockTrack('A', 120, 8, 'A', 4);
    const trackB = createMockTrack('B', 126, 9, 'A', 6);

    const backendAdvice: TransitionAdvice = {
      transition_type: 'ExactMatch',
      bpm_delta: 6.0,
      key_distance: 1,
      mode_flip: false,
      intervention_required: false,
      loop_extension_recommended: false,
      phrase_bars: 16,
      notes: ['Authoritative backend transition notes'],
      total_cost: 0.42,
      tempo_cost: 0.50,
      key_cost: 0.10,
      energy_cost: 0.25,
      timbre_cost: 0.00,
      de_target: 1.5,
      weights: DEFAULT_WEIGHTS,
      profile: 'LinearRamp',
    };

    const breakdown = computeTransitionCost(trackA, trackB, backendAdvice);
    expect(breakdown.isAvailable).toBe(true);
    expect(breakdown.total).toBe(0.42);
    expect(breakdown.phiTempo).toBe(0.50);
    expect(breakdown.phiKey).toBe(0.10);
    expect(breakdown.phiEnergy).toBe(0.25);
    expect(breakdown.dETarget).toBe(1.5);
    expect(breakdown.profile).toBe('LinearRamp');
  });

  it('proves unavailable analysis produces explicit unavailable state (never misleading 0.00)', () => {
    const analyzedTrack = createMockTrack('A', 120, 8, 'A', 5);
    const unanalyzedTrack: Track = {
      id: 'B',
      path: '/music/B.mp3',
      hash: 'hash-B',
      duration_ms: 180000,
      tags: { title: 'Unanalyzed Song', artist: 'Unknown', album: null },
      analysis: null,
      analyzed_at: null,
      analysis_version: null,
    };

    const breakdown1 = computeTransitionCost(analyzedTrack, unanalyzedTrack);
    expect(breakdown1.isAvailable).toBe(false);
    expect(Number.isNaN(breakdown1.total)).toBe(true);

    const breakdown2 = computeTransitionCost(unanalyzedTrack, analyzedTrack);
    expect(breakdown2.isAvailable).toBe(false);
    expect(Number.isNaN(breakdown2.total)).toBe(true);

    const breakdown3 = computeTransitionCost(null, analyzedTrack);
    expect(breakdown3.isAvailable).toBe(false);
    expect(Number.isNaN(breakdown3.total)).toBe(true);
  });
});
