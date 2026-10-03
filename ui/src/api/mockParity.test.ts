import { describe, it, expect } from 'vitest';
import { mockBackend } from './index';
import { getTargetEnergy } from '../features/setlist/energyCurve';
import type { CostWeights } from '../bindings/CostWeights';

describe('Mock Backend Semantics Parity (Task 5)', () => {
  it('preserves all requested tracks and deduplicates input IDs preserving order', async () => {
    const allTracks = await mockBackend.listTracks();
    const t1 = allTracks[0].id;
    const t2 = allTracks[1].id;
    const t3 = allTracks[2].id;

    // Provide duplicate ID
    const inputWithDuplicates = [t1, t2, t1, t3, t2];
    const result = await mockBackend.suggestOrder(inputWithDuplicates);

    // Should contain exactly 3 tracks (t1, t2, t3)
    expect(result.length).toBe(3);
    const ids = result.map((e) => e.track_id);
    expect(ids).toContain(t1);
    expect(ids).toContain(t2);
    expect(ids).toContain(t3);

    // Positions must be strictly 1-based and contiguous
    expect(result.map((e) => e.position)).toEqual([1, 2, 3]);
  });

  it('guarantees deterministic output given identical inputs', async () => {
    const allTracks = await mockBackend.listTracks();
    const sampleIds = allTracks.slice(0, 6).map((t) => t.id);

    const run1 = await mockBackend.suggestOrder(sampleIds, 'Wave');
    const run2 = await mockBackend.suggestOrder(sampleIds, 'Wave');

    expect(run1.map((e) => e.track_id)).toEqual(run2.map((e) => e.track_id));
    expect(run1.map((e) => e.target_energy)).toEqual(run2.map((e) => e.target_energy));
  });

  it('handles missing-analysis tracks by preserving them at the end with transition: null', async () => {
    const allTracks = await mockBackend.listTracks();
    const analyzed1 = allTracks[0].id;
    const analyzed2 = allTracks[1].id;
    const unknownStubId = 'stub-track-unpersisted';

    const result = await mockBackend.suggestOrder([analyzed1, unknownStubId, analyzed2]);

    expect(result.length).toBe(3);
    const ids = result.map((e) => e.track_id);
    expect(ids).toContain(analyzed1);
    expect(ids).toContain(analyzed2);
    expect(ids).toContain(unknownStubId);

    // The unanalyzed track is appended at the end
    const lastEntry = result[result.length - 1];
    expect(lastEntry.track_id).toBe(unknownStubId);
    expect(lastEntry.transition).toBeNull();
  });

  it('calculates position-derived target_energy strictly from profile and position', async () => {
    const allTracks = await mockBackend.listTracks();
    const sampleIds = allTracks.slice(0, 5).map((t) => t.id);

    const resultLinear = await mockBackend.suggestOrder(sampleIds, 'LinearRamp');
    expect(resultLinear.length).toBe(5);

    // Check every position's target_energy
    for (let i = 0; i < 5; i++) {
      const expectedEnergy = getTargetEnergy('LinearRamp', i, 5);
      expect(resultLinear[i].target_energy).toBe(expectedEnergy);
    }

    const resultPlateau = await mockBackend.suggestOrder(sampleIds, 'PeakPlateau');
    for (let i = 0; i < 5; i++) {
      const expectedEnergy = getTargetEnergy('PeakPlateau', i, 5);
      expect(resultPlateau[i].target_energy).toBe(expectedEnergy);
    }
  });

  it('respects CostWeights in transition advice calculations', async () => {
    const allTracks = await mockBackend.listTracks();
    const tA = allTracks[0].id;
    const tB = allTracks[1].id;

    const weightsTempoHeavy: CostWeights = {
      tempo: 0.9,
      key: 0.05,
      energy: 0.05,
      timbre: 0.0,
    };

    const weightsKeyHeavy: CostWeights = {
      tempo: 0.05,
      key: 0.9,
      energy: 0.05,
      timbre: 0.0,
    };

    const adviceTempo = await mockBackend.getAdvice(tA, tB, 'LinearRamp', weightsTempoHeavy);
    const adviceKey = await mockBackend.getAdvice(tA, tB, 'LinearRamp', weightsKeyHeavy);

    expect(adviceTempo.weights).toEqual(weightsTempoHeavy);
    expect(adviceKey.weights).toEqual(weightsKeyHeavy);
    expect(adviceTempo.total_cost).not.toBeNull();
    expect(adviceKey.total_cost).not.toBeNull();
  });

  it('throws descriptive error in getAdvice when a track is not found or lacks analysis', async () => {
    const allTracks = await mockBackend.listTracks();
    const tA = allTracks[0].id;

    await expect(mockBackend.getAdvice(tA, 'non-existent-id')).rejects.toThrow(/Track not found/);
  });
});
