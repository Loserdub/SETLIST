import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StageMode, getTransitionSegmentFlow } from './StageMode';
import { useAppStore } from '../../store/useAppStore';
import type { Track } from '../../bindings/Track';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';

function makeTrack(
  id: string,
  title: string,
  artist: string,
  bpm: number,
  camelotNum: number,
  camelotLetter: 'A' | 'B',
  energy: number,
  durationMs: number,
  cuePoints: Track['analysis'] extends infer A ? (A extends { cue_points: infer C } ? C : never) : never = [],
  segments: Track['analysis'] extends infer A ? (A extends { segments: infer S } ? S : never) : never = []
): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    duration_ms: durationMs,
    analyzed_at: '2026-10-05T12:00:00Z',
    analysis_version: '1.0.0',
    tags: { title, artist, album: 'Stage Test' },
    analysis: {
      loudness: { integrated_lufs: -10.0, loudness_range: 5.0, true_peak: -0.5 },
      rhythm: {
        grid: {
          bpm,
          first_downbeat_ms: 0,
          beats_ms: [0, 500, 1000],
          downbeat_flags: [true, false, false],
          steady: true,
        },
        bpm_alternates: [],
      },
      key: {
        pitch_class: 0,
        mode: camelotLetter === 'A' ? 'Minor' : 'Major',
        camelot: { number: camelotNum, letter: camelotLetter },
        tuning_cents: 0,
      },
      dynamics: {
        frame_rate: 10,
        rms_curve: [0.5],
        low_ratio_curve: [0.5],
        centroid_curve: [1000],
      },
      energy_score: energy,
      energy_curve: { per_bar: [energy] },
      segments,
      cue_points: cuePoints,
      waveform: {
        points_per_sec: 10,
        low: { peak: [], rms: [] },
        mid: { peak: [], rms: [] },
        high: { peak: [], rms: [] },
      },
    },
  };
}

describe('StageMode Performance Hardware Experience & Countdown Intelligence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders transition countdown based on Cue D (Mix-Out) and decrements live with rehearsal clock', () => {
    // Track 1: 4 minutes (240,000ms), with Mix Out Cue at 3:00 (180,000ms)
    const track1 = makeTrack('t1', 'Genesis', 'Justice', 126, 8, 'A', 7, 240000, [
      { index: 0, label: 'A: INTRO', time_ms: 0, kind: 'HotCue', color_hex: '#10B981', loop_end_ms: null },
      { index: 1, label: 'B: BREAKDOWN', time_ms: 60000, kind: 'HotCue', color_hex: '#F59E0B', loop_end_ms: null },
      { index: 2, label: 'C: DROP', time_ms: 90000, kind: 'HotCue', color_hex: '#EF4444', loop_end_ms: null },
      { index: 3, label: 'D: MIX OUT', time_ms: 180000, kind: 'HotCue', color_hex: '#06B6D4', loop_end_ms: null },
    ]);

    const track2 = makeTrack('t2', 'Solar Flare', 'Helios', 127, 8, 'B', 8, 180000);

    const advice: TransitionAdvice = {
      transition_type: 'Other',
      bpm_delta: 1.0,
      key_distance: 0,
      mode_flip: true,
      intervention_required: false,
      loop_extension_recommended: false,
      phrase_bars: 16,
      notes: ['Drop swap at phrase boundary'],
      total_cost: 0.1,
      tempo_cost: 0.1,
      key_cost: 0.1,
      energy_cost: 0.1,
      timbre_cost: 0,
      de_target: 1.0,
      weights: null,
      profile: null,
    };

    const startTime = Date.now();
    useAppStore.setState({
      setlist: [
        { position: 1, track_id: track1.id, track: track1, transition: null, target_energy: 7 },
        { position: 2, track_id: track2.id, track: track2, transition: advice, target_energy: 8 },
      ],
      setlistName: 'Festival Mainstage',
      isStageMode: true,
      stageCurrentIndex: 0,
      stageStartTime: startTime,
    });

    render(<StageMode />);

    // Initially at start: target mix-out is 180,000ms (03:00)
    const countdownEl = screen.getByTestId('stage-transition-countdown');
    expect(countdownEl.textContent).toBe('03:00');

    // Advance rehearsal clock by 96,000ms (1 minute 36 seconds)
    // 180,000 - 96,000 = 84,000ms = 01:24 remaining!
    act(() => {
      vi.advanceTimersByTime(96000);
    });

    expect(countdownEl.textContent).toBe('01:24');

    // Flow phase shows BREAKDOWN → DROP
    expect(screen.getByText('BREAKDOWN → DROP')).toBeDefined();
  });

  it('resolves segment flow with getTransitionSegmentFlow helper', () => {
    // 1. Explicit DropSwap advice produces BREAKDOWN → DROP
    const adviceDropSwap: TransitionAdvice = {
      transition_type: 'Other',
      bpm_delta: 0,
      key_distance: 0,
      mode_flip: false,
      intervention_required: false,
      loop_extension_recommended: false,
      phrase_bars: 16,
      notes: ['Drop-swap at phrase boundary'],
      total_cost: null,
      tempo_cost: null,
      key_cost: null,
      energy_cost: null,
      timbre_cost: null,
      de_target: null,
      weights: null,
      profile: null,
    };

    const entry1: SetlistEntry = {
      position: 1,
      track_id: '1',
      track: makeTrack('1', 'T1', 'A1', 124, 8, 'A', 6, 200000),
      transition: null,
      target_energy: 6,
    };

    const entry2: SetlistEntry = {
      position: 2,
      track_id: '2',
      track: makeTrack('2', 'T2', 'A2', 124, 8, 'A', 6, 200000),
      transition: adviceDropSwap,
      target_energy: 6,
    };

    expect(getTransitionSegmentFlow(entry1, entry2)).toBe('BREAKDOWN → DROP');

    // 2. Segments with outro and intro
    const trackWithSegments1 = makeTrack('s1', 'T1', 'A1', 125, 9, 'A', 7, 240000, [], [
      { label: 'intro', start_ms: 0, end_ms: 30000, energy: 5 },
      { label: 'breakdown', start_ms: 30000, end_ms: 90000, energy: 6 },
      { label: 'drop', start_ms: 90000, end_ms: 180000, energy: 9 },
      { label: 'outro', start_ms: 180000, end_ms: 240000, energy: 6 },
    ]);

    const trackWithSegments2 = makeTrack('s2', 'T2', 'A2', 125, 9, 'A', 7, 240000, [], [
      { label: 'intro', start_ms: 0, end_ms: 30000, energy: 5 },
      { label: 'drop', start_ms: 30000, end_ms: 120000, energy: 8 },
    ]);

    const entrySeg1: SetlistEntry = { position: 1, track_id: 's1', track: trackWithSegments1, transition: null, target_energy: 7 };
    const entrySeg2: SetlistEntry = {
      position: 2,
      track_id: 's2',
      track: trackWithSegments2,
      transition: { ...adviceDropSwap, transition_type: 'Fifth' },
      target_energy: 7,
    };

    // Outro has previous segment 'drop' or 'breakdown', incoming intro has second segment 'drop'
    const flow = getTransitionSegmentFlow(entrySeg1, entrySeg2);
    expect(flow).toContain('→');
  });

  it('updates active cue highlight as time advances in track', () => {
    const track = makeTrack('t1', 'Track Cues Test', 'Artist', 128, 8, 'A', 6, 300000, [
      { index: 0, label: 'A: INTRO', time_ms: 0, kind: 'HotCue', color_hex: '#10B981', loop_end_ms: null },
      { index: 1, label: 'B: BREAKDOWN', time_ms: 60000, kind: 'HotCue', color_hex: '#F59E0B', loop_end_ms: null },
      { index: 2, label: 'C: DROP', time_ms: 120000, kind: 'HotCue', color_hex: '#EF4444', loop_end_ms: null },
      { index: 3, label: 'D: MIX OUT', time_ms: 240000, kind: 'HotCue', color_hex: '#06B6D4', loop_end_ms: null },
    ]);

    const startTime = Date.now();
    useAppStore.setState({
      setlist: [{ position: 1, track_id: track.id, track, transition: null, target_energy: 6 }],
      isStageMode: true,
      stageCurrentIndex: 0,
      stageStartTime: startTime,
    });

    render(<StageMode />);

    // Initially at 0ms: active cue is A
    expect(screen.getByText(/CURRENT CUE:/)).toBeDefined();
    expect(screen.getByText(/\[A\]/)).toBeDefined();

    // Advance time past 60s (Breakdown)
    act(() => {
      vi.advanceTimersByTime(65000);
    });

    expect(screen.getByText(/\[B\]/)).toBeDefined();

    // Advance time past 120s (Drop)
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(screen.getByText(/\[C\]/)).toBeDefined();
  });

  it('supports toggleSetlist with S key and advances with Enter', () => {
    const track1 = makeTrack('1', 'T1', 'A1', 120, 1, 'A', 5, 200000);
    const track2 = makeTrack('2', 'T2', 'A2', 120, 2, 'A', 5, 200000);

    useAppStore.setState({
      setlist: [
        { position: 1, track_id: '1', track: track1, transition: null, target_energy: 5 },
        { position: 2, track_id: '2', track: track2, transition: null, target_energy: 5 },
      ],
      isStageMode: true,
      stageCurrentIndex: 0,
      stageStartTime: Date.now(),
    });

    render(<StageMode />);

    expect(screen.queryByTestId('stage-setlist-overlay')).toBeNull();

    // Press 's' to toggle setlist drawer
    fireEvent.keyDown(window, { key: 's' });
    expect(screen.getByTestId('stage-setlist-overlay')).toBeDefined();

    // Press 's' again to close
    fireEvent.keyDown(window, { key: 's' });
    expect(screen.queryByTestId('stage-setlist-overlay')).toBeNull();

    // Press Enter to advance to next track
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(useAppStore.getState().stageCurrentIndex).toBe(1);

    // Press Backspace to return to prev track
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(useAppStore.getState().stageCurrentIndex).toBe(0);
  });
});
