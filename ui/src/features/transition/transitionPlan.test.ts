import { describe, it, expect } from 'vitest';
import {
  generatePerformancePlan,
  extractStructuralMarkers,
  formatTime,
  formatPosition,
} from './transitionPlan';
import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';

const mockTrackA = {
  id: 'track-a',
  path: 'C:/music/track_a.mp3',
  duration_ms: 240000,
  tags: {
    title: 'Outgoing Deep',
    artist: 'Artist One',
    bpm: 126,
    initial_key: '8A',
  },
  analysis: {
    rhythm: {
      grid: {
        bpm: 126.0,
        first_downbeat_ms: 200.0,
        beats_ms: [200, 676, 1152],
        downbeat_flags: [true, false, false],
        steady: true,
      },
    },
    key: {
      pitch_class: 0,
      mode: 'Minor',
      camelot: { number: 8, letter: 'A' },
      tuning_cents: 0,
    },
    segments: [
      { label: 'intro', start_ms: 0, end_ms: 30000, energy: 3 },
      { label: 'verse', start_ms: 30000, end_ms: 90000, energy: 6 },
      { label: 'outro', start_ms: 210000, end_ms: 240000, energy: 4 },
    ],
    cue_points: [
      { index: 0, label: 'First Downbeat', time_ms: 200, kind: 'HotCue', color_hex: '#38bdf8', loop_end_ms: null },
      { index: 6, label: 'Mix-Out', time_ms: 210000, kind: 'HotCue', color_hex: '#10b981', loop_end_ms: null },
      { index: 7, label: 'Loop Tail', time_ms: 225000, kind: 'Loop', color_hex: '#f59e0b', loop_end_ms: 240000 },
    ],
    energy_score: 6,
  },
} as unknown as Track;

const mockTrackB = {
  id: 'track-b',
  path: 'C:/music/track_b.mp3',
  duration_ms: 300000,
  tags: {
    title: 'Incoming Peak',
    artist: 'Artist Two',
    bpm: 127,
    initial_key: '9A',
  },
  analysis: {
    rhythm: {
      grid: {
        bpm: 127.0,
        first_downbeat_ms: 150.0,
        beats_ms: [150, 622, 1094],
        downbeat_flags: [true, false, false],
        steady: true,
      },
    },
    key: {
      pitch_class: 7,
      mode: 'Minor',
      camelot: { number: 9, letter: 'A' },
      tuning_cents: 0,
    },
    segments: [
      { label: 'intro', start_ms: 0, end_ms: 30000, energy: 4 },
      { label: 'breakdown', start_ms: 30000, end_ms: 75000, energy: 3 },
      { label: 'drop', start_ms: 75000, end_ms: 150000, energy: 9 },
    ],
    cue_points: [
      { index: 0, label: 'First Downbeat', time_ms: 150, kind: 'HotCue', color_hex: '#38bdf8', loop_end_ms: null },
      { index: 1, label: 'Intro Bass', time_ms: 15000, kind: 'HotCue', color_hex: '#6366f1', loop_end_ms: null },
      { index: 2, label: 'First Breakdown', time_ms: 30000, kind: 'HotCue', color_hex: '#8b5cf6', loop_end_ms: null },
      { index: 3, label: 'First Drop', time_ms: 75000, kind: 'HotCue', color_hex: '#ef4444', loop_end_ms: null },
    ],
    energy_score: 8,
  },
} as unknown as Track;

const mockAdvice: TransitionAdvice = {
  transition_type: 'Fifth',
  bpm_delta: 1.0,
  key_distance: 1,
  mode_flip: false,
  intervention_required: false,
  loop_extension_recommended: false,
  phrase_bars: 16,
  notes: [
    'Energy lift: prepare audience for peak tempo',
    'Consonant harmonic blend with fifth key movement',
  ],
  total_cost: 0.15,
  tempo_cost: 0.16,
  key_cost: 0.10,
  energy_cost: 0.20,
  timbre_cost: 0.0,
  de_target: 1.0,
  weights: null,
  profile: null,
};

describe('transitionPlan pure calculations', () => {
  it('formats time and positions correctly', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75000)).toBe('1:15');
    expect(formatTime(210000)).toBe('3:30');
    expect(formatPosition(3)).toBe('03');
    expect(formatPosition(12)).toBe('12');
    expect(formatPosition(undefined, '01')).toBe('01');
  });

  it('generates performance plan with ENTER at BREAKDOWN and RELEASE at DROP', () => {
    const plan = generatePerformancePlan(mockTrackA, mockTrackB, mockAdvice, 3, 4);

    expect(plan.enter).toContain('Track 04 at BREAKDOWN (0:30)');
    expect(plan.lowEnd).toContain('Keep incoming bass reduced');
    expect(plan.release).toContain('Open incoming low-end at DROP (1:15)');
    expect(plan.phraseBars).toBe(16);
    expect(plan.transitionDurationSec).toBeGreaterThan(0);
    expect(plan.outPoint.label).toBe('Cue G (Mix-Out Point)');
    expect(plan.inPoint.label).toBe('Breakdown');
    expect(plan.guidanceNotes.length).toBe(2);
  });

  it('adapts LOW END directive when loop extension is recommended', () => {
    const loopAdvice: TransitionAdvice = {
      ...mockAdvice,
      loop_extension_recommended: true,
    };
    const plan = generatePerformancePlan(mockTrackA, mockTrackB, loopAdvice, 1, 2);
    expect(plan.lowEnd).toContain('Loop percussive outro on Cue H');
    expect(plan.outPoint.label).toBe('Cue H (Loop Extension)');
  });

  it('extracts structural markers sorted chronologically', () => {
    const markers = extractStructuralMarkers(mockTrackB);
    expect(markers.length).toBe(7); // 3 segments + 4 cues
    // Ensure chronological ordering
    for (let i = 1; i < markers.length; i++) {
      expect(markers[i].timeMs).toBeGreaterThanOrEqual(markers[i - 1].timeMs);
    }
    const dropMarker = markers.find((m) => m.label.includes('DROP'));
    expect(dropMarker).toBeDefined();
    expect(dropMarker?.colorHex).toBeDefined();
  });

  it('generates performance plan with standardized 4-point cue framework (A: Intro, B: Breakdown, C: Drop, D: Mix Out)', () => {
    const trackWithFourCuesA = {
      ...mockTrackA,
      analysis: {
        ...mockTrackA.analysis,
        cue_points: [
          { index: 0, label: 'A: INTRO', time_ms: 500, kind: 'HotCue', color_hex: '#10B981', loop_end_ms: null },
          { index: 3, label: 'D: MIX OUT', time_ms: 220000, kind: 'HotCue', color_hex: '#06B6D4', loop_end_ms: null },
        ],
      },
    } as unknown as Track;

    const trackWithFourCuesB = {
      ...mockTrackB,
      analysis: {
        ...mockTrackB.analysis,
        segments: [], // test fallback to 4-point cues directly
        cue_points: [
          { index: 0, label: 'A: INTRO', time_ms: 1000, kind: 'HotCue', color_hex: '#10B981', loop_end_ms: null },
          { index: 1, label: 'B: BREAKDOWN', time_ms: 45000, kind: 'HotCue', color_hex: '#F59E0B', loop_end_ms: null },
          { index: 2, label: 'C: DROP', time_ms: 90000, kind: 'HotCue', color_hex: '#EF4444', loop_end_ms: null },
          { index: 3, label: 'D: MIX OUT', time_ms: 240000, kind: 'HotCue', color_hex: '#06B6D4', loop_end_ms: null },
        ],
      },
    } as unknown as Track;

    const plan = generatePerformancePlan(trackWithFourCuesA, trackWithFourCuesB, mockAdvice, 1, 2);
    expect(plan.outPoint.label).toBe('Cue D (Mix Out)');
    expect(plan.outPoint.timeMs).toBe(220000);
    expect(plan.enter).toContain('Track 02 at BREAKDOWN (0:45)');
    expect(plan.inPoint.timeMs).toBe(45000);

    const markers = extractStructuralMarkers(trackWithFourCuesB);
    const cueLabels = markers.filter((m) => m.type === 'cue').map((m) => m.label);
    expect(cueLabels).toContain('CUE A: INTRO');
    expect(cueLabels).toContain('CUE B: BREAKDOWN');
    expect(cueLabels).toContain('CUE C: DROP');
    expect(cueLabels).toContain('CUE D: MIX OUT');
  });
});

