import { describe, it, expect, vi } from 'vitest';
import {
  mockBackend,
  tauriBackend,
  getBackend,
  setUseMockBackend,
  USE_MOCK_BACKEND,
  type ProgressEvent,
} from './index';

describe('mockBackend', () => {
  it('lists exactly 40 generated tracks', async () => {
    const tracks = await mockBackend.listTracks();
    expect(tracks).toBeDefined();
    expect(tracks.length).toBe(40);

    // Verify first track properties
    const t0 = tracks[0];
    expect(t0.id).toBe('track-001');
    expect(t0.path).toContain('.mp3');
    expect(t0.hash).toBeDefined();
    expect(t0.tags.title).toBeDefined();
    expect(t0.tags.artist).toBeDefined();
    expect(t0.duration_ms).toBeGreaterThan(0);
    expect(t0.analysis).toBeDefined();

    // Verify analysis structure
    const a = t0.analysis!;
    expect(a.rhythm.grid.bpm).toBeGreaterThan(0);
    expect(a.rhythm.grid.steady).toBe(true);
    expect(a.key.camelot.number).toBeGreaterThanOrEqual(1);
    expect(a.key.camelot.number).toBeLessThanOrEqual(12);
    expect(['A', 'B']).toContain(a.key.camelot.letter);
    expect(a.energy_score).toBeGreaterThanOrEqual(1);
    expect(a.energy_score).toBeLessThanOrEqual(10);
    expect(a.segments.length).toBe(6);
    expect(a.cue_points.length).toBe(8);
    expect(a.waveform.low.peak.length).toBeGreaterThan(0);
    expect(a.waveform.mid.peak.length).toBeGreaterThan(0);
    expect(a.waveform.high.peak.length).toBeGreaterThan(0);
  });

  it('covers all 24 Camelot keys across the 40 tracks', async () => {
    const tracks = await mockBackend.listTracks();
    const coveredKeys = new Set<string>();

    for (const t of tracks) {
      if (t.analysis) {
        coveredKeys.add(`${t.analysis.key.camelot.number}${t.analysis.key.camelot.letter}`);
      }
    }

    expect(coveredKeys.size).toBe(24);
  });

  it('retrieves individual track by ID', async () => {
    const track = await mockBackend.getTrack('track-005');
    expect(track).not.toBeNull();
    expect(track?.id).toBe('track-005');

    const nonExistent = await mockBackend.getTrack('track-999');
    expect(nonExistent).toBeNull();
  });

  it('scans folder and emits progress events', async () => {
    const events: ProgressEvent[] = [];
    const unsubscribe = mockBackend.subscribeProgress((e) => {
      events.push(e);
    });

    const tracks = await mockBackend.scanFolder('C:/Music');
    expect(tracks.length).toBe(40);
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events.some((e) => e.stage === 'scanning')).toBe(true);
    expect(events.some((e) => e.stage === 'analyzing')).toBe(true);

    unsubscribe();
  });

  it('suggests setlist order with transition advice', async () => {
    const tracks = await mockBackend.listTracks();
    const sampleIds = tracks.slice(0, 5).map((t) => t.id);

    const ordered = await mockBackend.suggestOrder(sampleIds, 'LinearRamp');
    expect(ordered.length).toBe(5);

    // Entry 1 has no previous track, so transition is null
    expect(ordered[0].position).toBe(1);
    expect(ordered[0].transition).toBeNull();

    // Entry 2+ have transition advice
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].position).toBe(i + 1);
      expect(ordered[i].transition).not.toBeNull();
      expect(ordered[i].transition?.phrase_bars).toBe(16);
      expect(ordered[i].transition?.notes.length).toBeGreaterThan(0);
    }
  });

  it('computes pairwise transition advice', async () => {
    const advice = await mockBackend.getAdvice('track-001', 'track-002');
    expect(advice).toBeDefined();
    expect(advice.transition_type).toBeDefined();
    expect(typeof advice.bpm_delta).toBe('number');
    expect(typeof advice.key_distance).toBe('number');
  });

  it('exports setlist to various targets', async () => {
    const tracks = await mockBackend.listTracks();
    const entries = await mockBackend.suggestOrder(tracks.slice(0, 3).map((t) => t.id));

    const xmlRes = await mockBackend.exportSet(entries, 'RekordboxXml');
    expect(xmlRes).toContain('RekordboxXml');

    const m3uRes = await mockBackend.exportSet(entries, 'M3u8');
    expect(m3uRes).toContain('M3u8');
  });
});

describe('tauriBackend', () => {
  it('throws "not wired" for unimplemented methods', async () => {
    await expect(tauriBackend.scanFolder('/path')).rejects.toThrow('not wired');
    await expect(tauriBackend.listTracks()).rejects.toThrow('not wired');
    await expect(tauriBackend.getTrack('id')).rejects.toThrow('not wired');
    await expect(tauriBackend.suggestOrder(['id1', 'id2'])).rejects.toThrow('not wired');
    await expect(tauriBackend.getAdvice('id1', 'id2')).rejects.toThrow('not wired');
    await expect(tauriBackend.exportSet([], 'M3u8')).rejects.toThrow('not wired');
    expect(() => tauriBackend.subscribeProgress(vi.fn())).toThrow('not wired');
    expect(() => tauriBackend.onProgress(vi.fn())).toThrow('not wired');
  });
});

describe('getBackend', () => {
  it('returns mockBackend when flag is true and tauriBackend when false', () => {
    expect(getBackend(true)).toBe(mockBackend);
    expect(getBackend(false)).toBe(tauriBackend);
  });

  it('uses USE_MOCK_BACKEND default and allows toggling', () => {
    expect(USE_MOCK_BACKEND).toBe(true);
    setUseMockBackend(false);
    expect(getBackend()).toBe(tauriBackend);
    setUseMockBackend(true);
    expect(getBackend()).toBe(mockBackend);
  });
});
