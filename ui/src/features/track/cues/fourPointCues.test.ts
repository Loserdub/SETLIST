import { describe, it, expect } from 'vitest';
import {
  resolveFourPointCues,
  formatCueTime,
  calculateBarNumber,
  snapTimeToGrid,
  nudgeCueTime,
  serializeFourPointCues,
  regenerateCanonicalFourPointCues,
  FOUR_POINT_CUE_CONFIG,
} from './fourPointCues';
import type { TrackWithOverrides } from '../../../api/overrides';

function makeTestTrack(overridden = false): TrackWithOverrides {
  return {
    id: 'test-track-1',
    path: '/music/test1.mp3',
    hash: 'hash-1',
    tags: {
      title: 'Performance Track',
      artist: 'DJ Producer',
      album: 'EP 1',
    },
    duration_ms: 240000,
    created_at: '2026-01-01',
    analysis: {
      loudness: {
        integrated_lufs: -10.5,
        loudness_range_lu: 6.0,
        true_peak_dbfs: -0.5,
      },
      rhythm: {
        grid: {
          first_downbeat_ms: 500,
          bpm: 120.0,
          beats_ms: [500, 1000, 1500, 2000, 2500, 3000],
          downbeat_flags: [true, false, false, false, true, false],
          steady: true,
        },
        bpm_alternates: [60.0, 240.0],
      },
      key: {
        pitch_class: 0,
        mode: 'Minor',
        camelot: { number: 8, letter: 'A' },
        tuning_cents: 0,
      },
      dynamics: {
        frame_rate: 86.13,
        rms_curve: [0.5],
        low_ratio_curve: [0.4],
        centroid_curve: [1200],
      },
      energy_score: 7,
      energy_curve: { per_bar: [7] },
      segments: [
        { label: 'intro', start_ms: 0, end_ms: 30000, energy: 4 },
        { label: 'verse', start_ms: 30000, end_ms: 60000, energy: 6 },
        { label: 'breakdown', start_ms: 60000, end_ms: 90000, energy: 3 },
        { label: 'drop', start_ms: 90000, end_ms: 150000, energy: 9 },
        { label: 'outro', start_ms: 180000, end_ms: 240000, energy: 4 },
      ],
      cue_points: [
        {
          index: 0,
          time_ms: 500,
          label: 'A: INTRO',
          color_hex: '#10B981',
          kind: 'HotCue',
          loop_end_ms: null,
        },
        {
          index: 1,
          time_ms: 60000,
          label: 'B: BREAKDOWN',
          color_hex: '#F59E0B',
          kind: 'HotCue',
          loop_end_ms: null,
        },
        {
          index: 2,
          time_ms: 90000,
          label: 'C: DROP',
          color_hex: '#EF4444',
          kind: 'HotCue',
          loop_end_ms: null,
        },
        {
          index: 3,
          time_ms: 180000,
          label: 'D: MIX OUT',
          color_hex: '#06B6D4',
          kind: 'HotCue',
          loop_end_ms: null,
        },
      ],
      waveform: {
        points_per_sec: 10,
        low: { peak: [100], rms: [50] },
        mid: { peak: [100], rms: [50] },
        high: { peak: [100], rms: [50] },
      },
    },
    analyzed_at: '2026-01-01',
    analysis_version: 'v1',
    overrides: {
      bpm: false,
      first_downbeat_ms: false,
      key_camelot: false,
      cues: overridden,
      title: false,
      artist: false,
    },
  } as unknown as TrackWithOverrides;
}

describe('Canonical Four-Point Cue Architecture', () => {
  it('resolves all 4 performance cue slots with proper roles and colors', () => {
    const track = makeTestTrack(false);
    const cues = resolveFourPointCues(track);

    expect(cues.A).not.toBeNull();
    expect(cues.A?.role).toBe('INTRO');
    expect(cues.A?.timeMs).toBe(500);
    expect(cues.A?.colorHex).toBe(FOUR_POINT_CUE_CONFIG.A.colorHex);

    expect(cues.B).not.toBeNull();
    expect(cues.B?.role).toBe('BREAKDOWN');
    expect(cues.B?.timeMs).toBe(60000);
    expect(cues.B?.colorHex).toBe(FOUR_POINT_CUE_CONFIG.B.colorHex);

    expect(cues.C).not.toBeNull();
    expect(cues.C?.role).toBe('DROP');
    expect(cues.C?.timeMs).toBe(90000);
    expect(cues.C?.colorHex).toBe(FOUR_POINT_CUE_CONFIG.C.colorHex);

    expect(cues.D).not.toBeNull();
    expect(cues.D?.role).toBe('MIX OUT');
    expect(cues.D?.timeMs).toBe(180000);
    expect(cues.D?.colorHex).toBe(FOUR_POINT_CUE_CONFIG.D.colorHex);
  });

  it('clearly distinguishes automatically suggested cues from user-confirmed cues', () => {
    const suggestedTrack = makeTestTrack(false);
    const suggestedCues = resolveFourPointCues(suggestedTrack);

    expect(suggestedCues.A?.isSuggested).toBe(true);
    expect(suggestedCues.A?.isConfirmed).toBe(false);
    expect(suggestedCues.D?.isSuggested).toBe(true);
    expect(suggestedCues.D?.isConfirmed).toBe(false);

    const confirmedTrack = makeTestTrack(true);
    const confirmedCues = resolveFourPointCues(confirmedTrack);

    expect(confirmedCues.A?.isSuggested).toBe(false);
    expect(confirmedCues.A?.isConfirmed).toBe(true);
    expect(confirmedCues.D?.isSuggested).toBe(false);
    expect(confirmedCues.D?.isConfirmed).toBe(true);
  });

  it('maps legacy 8-cue system seamlessly into the four-point standard', () => {
    const legacyTrack = makeTestTrack(false);
    if (legacyTrack.analysis) {
      legacyTrack.analysis.cue_points = [
        { index: 0, time_ms: 500, label: 'A: First Downbeat', color_hex: '#00FF00', kind: 'HotCue', loop_end_ms: null },
        { index: 1, time_ms: 30000, label: 'B: Intro End', color_hex: '#00FFFF', kind: 'HotCue', loop_end_ms: null },
        { index: 2, time_ms: 60000, label: 'C: First Breakdown', color_hex: '#0088FF', kind: 'HotCue', loop_end_ms: null },
        { index: 3, time_ms: 90000, label: 'D: First Drop', color_hex: '#FF8800', kind: 'HotCue', loop_end_ms: null },
        { index: 4, time_ms: 120000, label: 'E: Second Breakdown', color_hex: '#9900FF', kind: 'HotCue', loop_end_ms: null },
        { index: 5, time_ms: 140000, label: 'F: Second Drop', color_hex: '#FF0000', kind: 'HotCue', loop_end_ms: null },
        { index: 6, time_ms: 180000, label: 'G: Outro Mix-Out', color_hex: '#FFFF00', kind: 'HotCue', loop_end_ms: null },
        { index: 7, time_ms: 210000, label: 'H: Percussive Loop', color_hex: '#FF007F', kind: 'Loop', loop_end_ms: 220000 },
      ];
    }

    const cues = resolveFourPointCues(legacyTrack);

    // Slot A: First Downbeat (index 0)
    expect(cues.A?.timeMs).toBe(500);
    expect(cues.A?.role).toBe('INTRO');

    // Slot B: First Breakdown (from index 2)
    expect(cues.B?.timeMs).toBe(60000);
    expect(cues.B?.role).toBe('BREAKDOWN');

    // Slot C: First Drop (from index 3)
    expect(cues.C?.timeMs).toBe(90000);
    expect(cues.C?.role).toBe('DROP');

    // Slot D: Outro Mix-Out (from index 6)
    expect(cues.D?.timeMs).toBe(180000);
    expect(cues.D?.role).toBe('MIX OUT');
  });

  it('synthesizes missing cues as suggestions from structural segments and beat grid', () => {
    const trackWithoutCues = makeTestTrack(false);
    if (trackWithoutCues.analysis) {
      trackWithoutCues.analysis.cue_points = [];
    }

    const cues = resolveFourPointCues(trackWithoutCues);

    expect(cues.A).not.toBeNull();
    expect(cues.A?.isSuggested).toBe(true);
    expect(cues.A?.timeMs).toBe(500); // from grid downbeat

    expect(cues.B).not.toBeNull();
    expect(cues.B?.isSuggested).toBe(true);
    expect(cues.B?.timeMs).toBe(60000); // from breakdown segment

    expect(cues.C).not.toBeNull();
    expect(cues.C?.isSuggested).toBe(true);
    expect(cues.C?.timeMs).toBe(90000); // from drop segment

    expect(cues.D).not.toBeNull();
    expect(cues.D?.isSuggested).toBe(true);
    expect(cues.D?.timeMs).toBe(180000); // from outro segment
  });

  it('calculates bar positions and formats cue times', () => {
    const grid = {
      first_downbeat_ms: 0,
      bpm: 120.0, // 2000ms per bar
      beats_ms: [0, 500, 1000, 1500, 2000],
      downbeat_flags: [true, false, false, false, true],
      steady: true,
    };

    expect(calculateBarNumber(0, grid)).toBe(1);
    expect(calculateBarNumber(2000, grid)).toBe(2);
    expect(calculateBarNumber(6000, grid)).toBe(4);

    expect(formatCueTime(75500)).toBe('01:15.5');
    expect(formatCueTime(0)).toBe('00:00.0');
  });

  it('nudges cue times and clamps to track duration', () => {
    expect(nudgeCueTime(5000, 250, 60000)).toBe(5250);
    expect(nudgeCueTime(5000, -250, 60000)).toBe(4750);
    expect(nudgeCueTime(500, -1000, 60000)).toBe(0);
    expect(nudgeCueTime(59000, 2000, 60000)).toBe(60000);
  });

  it('snaps arbitrary timestamps to nearest beat on the grid', () => {
    const beats = [1000, 1500, 2000, 2500, 3000];
    expect(snapTimeToGrid(1040, beats)).toBe(1000);
    expect(snapTimeToGrid(1480, beats)).toBe(1500);
    expect(snapTimeToGrid(2260, beats)).toBe(2500);
  });

  it('serializes four-point cue records and regenerates canonical cues from analysis', () => {
    const track = makeTestTrack(false);
    const cues = resolveFourPointCues(track);
    const serialized = serializeFourPointCues(cues);

    expect(serialized.length).toBe(4);
    expect(serialized[0].index).toBe(0);
    expect(serialized[0].label).toBe('A: INTRO');
    expect(serialized[1].index).toBe(1);
    expect(serialized[1].label).toBe('B: BREAKDOWN');
    expect(serialized[2].index).toBe(2);
    expect(serialized[2].label).toBe('C: DROP');
    expect(serialized[3].index).toBe(3);
    expect(serialized[3].label).toBe('D: MIX OUT');

    if (track.analysis) {
      const regenerated = regenerateCanonicalFourPointCues(
        track.analysis.segments,
        track.analysis.rhythm.grid,
        track.duration_ms
      );
      expect(regenerated.length).toBe(4);
      expect(regenerated[0].time_ms).toBe(500);
      expect(regenerated[1].time_ms).toBe(60000);
      expect(regenerated[2].time_ms).toBe(90000);
      expect(regenerated[3].time_ms).toBe(180000);
    }
  });
});
