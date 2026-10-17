import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransitionCostBadge } from './TransitionCostBadge';
import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';

function createMockTrack(
  id: string,
  bpm: number,
  camelotNum: number,
  camelotLetter: 'A' | 'B'
): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    duration_ms: 180000,
    analyzed_at: '2026-10-02T12:00:00Z',
    analysis_version: '1.0.0',
    tags: {
      title: `Track ${id}`,
      artist: 'Artist',
      album: 'Album',
    },
    analysis: {
      loudness: {
        integrated_lufs: -10.0,
        loudness_range: 5.0,
        true_peak: -0.5,
      },
      rhythm: {
        grid: {
          bpm,
          first_downbeat_ms: 0,
          beats_ms: [0, 500, 1000, 1500],
          downbeat_flags: [true, false, false, false],
          steady: true,
        },
        bpm_alternates: [],
      },
      key: {
        pitch_class: 0,
        mode: camelotLetter === 'A' ? 'Minor' : 'Major',
        camelot: {
          number: camelotNum,
          letter: camelotLetter,
        },
        tuning_cents: 0,
      },
      dynamics: {
        frame_rate: 10,
        rms_curve: [],
        low_ratio_curve: [],
        centroid_curve: [],
      },
      energy_score: 5,
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
  };
}

describe('TransitionCostBadge Component', () => {
  it('renders fallback button when transition advice is null', () => {
    const onOpen = vi.fn();
    render(
      <TransitionCostBadge
        transition={null}
        fromTitle="Track 1"
        toTitle="Track 2"
        onOpenAdvice={onOpen}
      />
    );

    const btn = screen.getByRole('button');
    expect(btn.textContent).toContain('Advice →');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders smooth compatible badge without clash warning when d <= 2 and ΔBPM <= 8', () => {
    const t1 = createMockTrack('1', 124, 8, 'A');
    const t2 = createMockTrack('2', 126, 9, 'A'); // ΔBPM = 2, key distance d = 1

    const advice: TransitionAdvice = {
      transition_type: 'Fifth',
      bpm_delta: 2.0,
      key_distance: 1,
      mode_flip: false,
      intervention_required: false,
      loop_extension_recommended: false,
      phrase_bars: 16,
      notes: [],
      total_cost: 0.15,
      tempo_cost: 0.1,
      key_cost: 0.1,
      energy_cost: 0.0,
      timbre_cost: 0.0,
      de_target: 0,
      weights: null,
      profile: null,
    };

    render(
      <TransitionCostBadge
        fromTrack={t1}
        toTrack={t2}
        transition={advice}
        fromTitle="Track 1"
        toTitle="Track 2"
        onOpenAdvice={() => {}}
      />
    );

    expect(screen.getByText('Harmonic 5th (±1)')).toBeDefined();
    expect(screen.queryByTestId('transition-clash-badge')).toBeNull();
  });

  it('renders visual CLASH badge when harmonic distance d > 2', () => {
    const t1 = createMockTrack('1', 124, 8, 'A');
    const t2 = createMockTrack('2', 126, 3, 'A'); // key distance d = 5 (> 2)

    const advice: TransitionAdvice = {
      transition_type: 'Other',
      bpm_delta: 2.0,
      key_distance: 5,
      mode_flip: false,
      intervention_required: true,
      loop_extension_recommended: false,
      phrase_bars: 8,
      notes: [],
      total_cost: 0.85,
      tempo_cost: 0.1,
      key_cost: 0.95,
      energy_cost: 0.0,
      timbre_cost: 0.0,
      de_target: 0,
      weights: null,
      profile: null,
    };

    render(
      <TransitionCostBadge
        fromTrack={t1}
        toTrack={t2}
        transition={advice}
        fromTitle="Track 1"
        toTitle="Track 2"
        onOpenAdvice={() => {}}
      />
    );

    const clashBadge = screen.getByTestId('transition-clash-badge');
    expect(clashBadge).toBeDefined();
    expect(clashBadge.textContent).toContain('⚠ CLASH');
  });

  it('renders visual CLASH badge when tempo difference ΔBPM > 8', () => {
    const t1 = createMockTrack('1', 120, 8, 'A');
    const t2 = createMockTrack('2', 132, 8, 'A'); // ΔBPM = 12 (> 8)

    const advice: TransitionAdvice = {
      transition_type: 'ExactMatch',
      bpm_delta: 12.0,
      key_distance: 0,
      mode_flip: false,
      intervention_required: true,
      loop_extension_recommended: false,
      phrase_bars: 8,
      notes: [],
      total_cost: 0.7,
      tempo_cost: 1.0,
      key_cost: 0.0,
      energy_cost: 0.0,
      timbre_cost: 0.0,
      de_target: 0,
      weights: null,
      profile: null,
    };

    render(
      <TransitionCostBadge
        fromTrack={t1}
        toTrack={t2}
        transition={advice}
        fromTitle="Track 1"
        toTitle="Track 2"
        onOpenAdvice={() => {}}
      />
    );

    const clashBadge = screen.getByTestId('transition-clash-badge');
    expect(clashBadge).toBeDefined();
    expect(clashBadge.textContent).toContain('⚠ CLASH');
  });
});
