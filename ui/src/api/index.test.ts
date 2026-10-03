import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  mockBackend,
  tauriBackend,
  getBackend,
  setUseMockBackend,
  USE_MOCK_BACKEND,
  type ProgressEvent,
} from './index';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

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
    expect(xmlRes.format).toBe('RekordboxXml');
    expect(xmlRes.track_count).toBe(3);
    expect(xmlRes.path).toContain('.xml');

    const m3uRes = await mockBackend.exportSet(entries, 'M3u8');
    expect(m3uRes.format).toBe('M3u8');
    expect(m3uRes.track_count).toBe(3);
    expect(m3uRes.path).toContain('.m3u8');
  });
});

describe('tauriBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes ping command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('pong');
    const result = await tauriBackend.ping();
    expect(result).toBe('pong');
    expect(invoke).toHaveBeenCalledWith('ping');
  });

  it('invokes scan_folder command with path parameter', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const result = await tauriBackend.scanFolder('C:/Music');
    expect(result).toEqual([]);
    expect(invoke).toHaveBeenCalledWith('scan_folder', { path: 'C:/Music' });
  });

  it('invokes list_tracks command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const result = await tauriBackend.listTracks();
    expect(result).toEqual([]);
    expect(invoke).toHaveBeenCalledWith('list_tracks');
  });

  it('invokes get_track command with id parameter', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null);
    const result = await tauriBackend.getTrack('track-123');
    expect(result).toBeNull();
    expect(invoke).toHaveBeenCalledWith('get_track', { id: 'track-123' });
  });

  it('invokes suggest_order command with trackIds, profile, and weights', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const result = await tauriBackend.suggestOrder(['id-1', 'id-2'], 'LinearRamp', {
      tempo: 0.3,
      key: 0.35,
      energy: 0.35,
      timbre: 0.0,
    });
    expect(result).toEqual([]);
    expect(invoke).toHaveBeenCalledWith('suggest_order', {
      trackIds: ['id-1', 'id-2'],
      profile: 'LinearRamp',
      weights: {
        tempo: 0.3,
        key: 0.35,
        energy: 0.35,
        timbre: 0.0,
      },
    });
  });

  it('invokes get_advice command with trackAId and trackBId', async () => {
    const mockAdvice = {
      transition_type: 'ExactMatch' as const,
      bpm_delta: 0,
      key_distance: 0,
      mode_flip: false,
      intervention_required: false,
      loop_extension_recommended: false,
      phrase_bars: 16,
      notes: ['Harmonic match'],
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockAdvice);
    const result = await tauriBackend.getAdvice('track-1', 'track-2');
    expect(result).toEqual(mockAdvice);
    expect(invoke).toHaveBeenCalledWith('get_advice', {
      trackAId: 'track-1',
      trackBId: 'track-2',
      profile: null,
      weights: null,
      deTarget: null,
    });
  });

  it('invokes export_set command with entries, target, outputPath, and overwrite', async () => {
    const fakeExportResult = {
      path: '/out.xml',
      format: 'RekordboxXml' as const,
      track_count: 0,
    };
    vi.mocked(invoke).mockResolvedValueOnce(fakeExportResult);
    const result = await tauriBackend.exportSet([], 'RekordboxXml', '/out.xml', false);
    expect(result).toEqual(fakeExportResult);
    expect(invoke).toHaveBeenCalledWith('export_set', {
      entries: [],
      target: 'RekordboxXml',
      outputPath: '/out.xml',
      overwrite: false,
    });
  });

  it('subscribes to progress events and unsubscribes cleanly', async () => {
    const unlistenMock = vi.fn();
    let handler: ((event: { payload: ProgressEvent }) => void) | null = null;
    vi.mocked(listen).mockImplementationOnce((_event, cb) => {
      handler = cb as (event: { payload: ProgressEvent }) => void;
      return Promise.resolve(unlistenMock);
    });

    const received: ProgressEvent[] = [];
    const unsubscribe = tauriBackend.subscribeProgress((evt) => {
      received.push(evt);
    });

    expect(listen).toHaveBeenCalledWith('progress', expect.any(Function));

    // Wait for promise resolution
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (handler) {
      (handler as (event: { payload: ProgressEvent }) => void)({
        payload: {
          stage: 'analyzing',
          current: 1,
          total: 5,
          message: 'Analyzing...',
        },
      });
    }

    expect(received).toHaveLength(1);
    expect(received[0].stage).toBe('analyzing');

    unsubscribe();
    expect(unlistenMock).toHaveBeenCalled();
  });

  it('invokes get_settings and save_settings on Tauri backend', async () => {
    const sampleSettings = {
      cost_weights: { tempo: 0.25, key: 0.35, energy: 0.4, timbre: 0.0 },
      key_penalties: [],
      energy_model: { divisor: 16.0, target_step: 1.5 },
      worker_count: 6,
    };

    vi.mocked(invoke).mockResolvedValueOnce(sampleSettings);
    const retrieved = await tauriBackend.getSettings();
    expect(invoke).toHaveBeenCalledWith('get_settings');
    expect(retrieved.worker_count).toBe(6);

    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await tauriBackend.saveSettings(sampleSettings);
    expect(invoke).toHaveBeenCalledWith('save_settings', { settings: sampleSettings });
  });
});

describe('mockBackend settings', () => {
  it('loads default settings and persists updates', async () => {
    const initial = await mockBackend.getSettings();
    expect(initial.worker_count).toBe(4);
    expect(initial.cost_weights.tempo).toBe(0.3);

    const updated = {
      ...initial,
      worker_count: 8,
      cost_weights: { ...initial.cost_weights, tempo: 0.5 },
    };

    await mockBackend.saveSettings(updated);
    const reloaded = await mockBackend.getSettings();
    expect(reloaded.worker_count).toBe(8);
    expect(reloaded.cost_weights.tempo).toBe(0.5);
  });
});

describe('getBackend', () => {
  it('returns mockBackend when flag is true and tauriBackend when false', () => {
    expect(getBackend(true)).toBe(mockBackend);
    expect(getBackend(false)).toBe(tauriBackend);
  });

  it('uses USE_MOCK_BACKEND default (false) and allows toggling', () => {
    expect(USE_MOCK_BACKEND).toBe(false);
    expect(getBackend()).toBe(tauriBackend);
    setUseMockBackend(true);
    expect(getBackend()).toBe(mockBackend);
    setUseMockBackend(false);
    expect(getBackend()).toBe(tauriBackend);
  });
});

describe('suggestOrder regression tests for track preservation', () => {
  it('preserves all 4 tracks with 3 analyzed and 1 unanalyzed', async () => {
    const inputIds = ['track-001', 'track-002', 'track-unanalyzed', 'track-003'];
    const result = await mockBackend.suggestOrder(inputIds, 'LinearRamp');

    expect(result.length).toBe(4);
    const resultIds = result.map((e) => e.track_id);
    expect(resultIds).toContain('track-001');
    expect(resultIds).toContain('track-002');
    expect(resultIds).toContain('track-003');
    expect(resultIds).toContain('track-unanalyzed');

    // Unanalyzed track merged at end
    expect(result[3].track_id).toBe('track-unanalyzed');
    expect(result[3].transition).toBeNull();

    // Contiguous positions 1..N
    result.forEach((e, idx) => {
      expect(e.position).toBe(idx + 1);
    });
  });

  it('preserves all 4 tracks with 1 analyzed and 3 unanalyzed', async () => {
    const inputIds = ['u1', 'track-001', 'u2', 'u3'];
    const result = await mockBackend.suggestOrder(inputIds, 'Wave');

    expect(result.length).toBe(4);
    const resultIds = result.map((e) => e.track_id);
    expect(resultIds).toEqual(['track-001', 'u1', 'u2', 'u3']);

    // Transitions all null because no two adjacent analyzed tracks
    result.forEach((e, idx) => {
      expect(e.position).toBe(idx + 1);
      expect(e.transition).toBeNull();
    });
  });

  it('preserves all tracks when all tracks are unanalyzed', async () => {
    const inputIds = ['u1', 'u2', 'u3', 'u4'];
    const result = await mockBackend.suggestOrder(inputIds, 'PeakPlateau');

    expect(result.length).toBe(4);
    expect(result.map((e) => e.track_id)).toEqual(['u1', 'u2', 'u3', 'u4']);
    result.forEach((e, idx) => {
      expect(e.position).toBe(idx + 1);
      expect(e.transition).toBeNull();
    });
  });

  it('calculates target energy based on final position', async () => {
    const inputIds = ['track-001', 'track-002', 'track-003', 'u1'];
    const result = await mockBackend.suggestOrder(inputIds, 'LinearRamp');

    expect(result.length).toBe(4);
    // LinearRamp targets from 4.0 to 9.0
    expect(result[0].target_energy).toBe(4.0);
    expect(result[3].target_energy).toBe(9.0);
  });
});

