import { describe, it, expect } from 'vitest';
import {
  formatSetDuration,
  computeSetlistTelemetry,
  verifySetlistReadiness,
} from './deliveryValidation';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { Track } from '../../bindings/Track';
import type { ExportResult } from '../../bindings/ExportResult';

function makeMockTrack(id: string, bpm: number, keyNum: number, withCues = true): Track {
  return {
    id,
    path: `C:/Music/${id}.mp3`,
    duration_ms: 180000,
    tags: {
      title: `Track ${id}`,
      artist: `Artist ${id}`,
      bpm,
      initial_key: `${keyNum}A`,
    },
    analysis: {
      rhythm: {
        grid: {
          bpm,
          first_downbeat_ms: 200,
          beats_ms: [200, 700],
          downbeat_flags: [true, false],
          steady: true,
        },
      },
      key: {
        pitch_class: 0,
        mode: 'Minor',
        camelot: { number: keyNum, letter: 'A' },
        tuning_cents: 0,
      },
      cue_points: withCues
        ? [
            { index: 0, label: 'A: INTRO', time_ms: 200, kind: 'HotCue', color_hex: '#10B981', loop_end_ms: null },
            { index: 1, label: 'B: BREAKDOWN', time_ms: 45000, kind: 'HotCue', color_hex: '#F59E0B', loop_end_ms: null },
            { index: 2, label: 'C: DROP', time_ms: 90000, kind: 'HotCue', color_hex: '#EF4444', loop_end_ms: null },
            { index: 3, label: 'D: MIX OUT', time_ms: 165000, kind: 'HotCue', color_hex: '#06B6D4', loop_end_ms: null },
          ]
        : [],
      segments: [],
      energy_score: 7,
    },
  } as unknown as Track;
}

describe('Delivery and Finalization Validation', () => {
  it('formats duration in HH:MM:SS format', () => {
    expect(formatSetDuration(0)).toBe('00:00:00');
    expect(formatSetDuration(62000)).toBe('00:01:02');
    // 1 hour, 2 minutes, 14 seconds = 3734000 ms
    expect(formatSetDuration(3734000)).toBe('01:02:14');
  });

  it('computes setlist telemetry matching the performance brief', () => {
    const setlist: SetlistEntry[] = [
      { position: 1, track_id: 't1', track: makeMockTrack('t1', 126, 8), transition: null, target_energy: 7 },
      { position: 2, track_id: 't2', track: makeMockTrack('t2', 128, 9), transition: null, target_energy: 8 },
      { position: 3, track_id: 't3', track: makeMockTrack('t3', 130, 10), transition: null, target_energy: 9 },
    ];

    const telemetry = computeSetlistTelemetry(setlist);
    expect(telemetry.trackCount).toBe(3);
    expect(telemetry.transitionCount).toBe(2);
    expect(telemetry.bpmRangeFormatted).toBe('126–130 BPM');
    expect(telemetry.cuesPerTrackFormatted).toBe('4 CUES / TRACK');
    expect(telemetry.keyFlowFormatted).toBe('8A → 10A');
    expect(telemetry.durationFormatted).toBe('00:09:00');
  });

  it('verifies complete setlist with authentic checks', () => {
    const setlist: SetlistEntry[] = [
      { position: 1, track_id: 't1', track: makeMockTrack('t1', 126, 8), transition: null, target_energy: 7 },
      { position: 2, track_id: 't2', track: makeMockTrack('t2', 128, 9), transition: null, target_energy: 8 },
    ];

    const pendingResult = verifySetlistReadiness(setlist, null);
    expect(pendingResult.canExport).toBe(true);

    const checkIds = pendingResult.checks.map((c) => c.id);
    expect(checkIds).toEqual([
      'tracks_available',
      'metadata_complete',
      'cue_points_present',
      'sequence_valid',
      'export_generated',
    ]);

    expect(pendingResult.checks.find((c) => c.id === 'tracks_available')?.status).toBe('pass');
    expect(pendingResult.checks.find((c) => c.id === 'metadata_complete')?.status).toBe('pass');
    expect(pendingResult.checks.find((c) => c.id === 'cue_points_present')?.status).toBe('pass');
    expect(pendingResult.checks.find((c) => c.id === 'sequence_valid')?.status).toBe('pass');
    expect(pendingResult.checks.find((c) => c.id === 'export_generated')?.status).toBe('pending');

    // Now test with export generated
    const mockExport: ExportResult = {
      path: 'C:/Exports/festival.xml',
      format: 'RekordboxXml',
      track_count: 2,
    };
    const completedResult = verifySetlistReadiness(setlist, mockExport);
    expect(completedResult.allChecksPassed).toBe(true);
    expect(completedResult.checks.find((c) => c.id === 'export_generated')?.status).toBe('pass');
  });

  it('accurately reports missing metadata or missing cues without false claims', () => {
    const trackNoBpm = makeMockTrack('t-nobpm', 0, 8, false);
    // remove tags bpm as well
    (trackNoBpm.tags as Record<string, unknown>).bpm = 0;
    if (trackNoBpm.analysis?.rhythm.grid) {
      trackNoBpm.analysis.rhythm.grid.bpm = 0;
    }

    const setlist: SetlistEntry[] = [
      { position: 1, track_id: 't-nobpm', track: trackNoBpm, transition: null, target_energy: 7 },
    ];

    const result = verifySetlistReadiness(setlist, null);
    const metaCheck = result.checks.find((c) => c.id === 'metadata_complete');
    expect(metaCheck?.status).toBe('warn');
    expect(metaCheck?.summary).toContain('1 track missing BPM or key');

    const cueCheck = result.checks.find((c) => c.id === 'cue_points_present');
    expect(cueCheck?.status).toBe('warn');
  });

  it('accurately fails on empty setlist', () => {
    const result = verifySetlistReadiness([], null);
    expect(result.canExport).toBe(false);
    expect(result.checks.find((c) => c.id === 'tracks_available')?.status).toBe('fail');
    expect(result.checks.find((c) => c.id === 'sequence_valid')?.status).toBe('fail');
  });
});
