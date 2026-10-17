import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TransitionRadar } from './TransitionRadar';
import type { Track } from '../../../bindings/Track';
import type { TransitionAdvice } from '../../../bindings/TransitionAdvice';

function makeMockTrack(id: string, title: string, bpm: number, durationMs: number): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    duration_ms: durationMs,
    analyzed_at: '2026-10-02T12:00:00Z',
    analysis_version: '1.0.0',
    tags: { title, artist: 'Artist', album: 'Album' },
    analysis: {
      loudness: { integrated_lufs: -10, loudness_range: 5, true_peak: -1 },
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
        mode: 'Minor',
        camelot: { number: 8, letter: 'A' },
        tuning_cents: 0,
      },
      dynamics: { frame_rate: 10, rms_curve: [], low_ratio_curve: [], centroid_curve: [] },
      energy_score: 7,
      energy_curve: { per_bar: [] },
      segments: [],
      cue_points: [
        {
          index: 6,
          time_ms: 180000,
          label: 'Outro Mix-Out',
          color_hex: '#f59e0b',
          kind: 'HotCue',
          loop_end_ms: null,
        },
      ],
      waveform: {
        points_per_sec: 10,
        low: { peak: [], rms: [] },
        mid: { peak: [], rms: [] },
        high: { peak: [], rms: [] },
      },
    },
  };
}

const mockAdvice: TransitionAdvice = {
  transition_type: 'Fifth',
  bpm_delta: 2.0,
  key_distance: 1,
  mode_flip: false,
  intervention_required: false,
  loop_extension_recommended: false,
  phrase_bars: 16,
  notes: ['Blend bass at phrase 2', 'Smooth harmonic transition'],
  total_cost: 0.2,
  tempo_cost: 0.1,
  key_cost: 0.1,
  energy_cost: 0.1,
  timbre_cost: 0,
  de_target: 1.0,
  weights: null,
  profile: null,
};

describe('TransitionRadar Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when currentTrack is null', () => {
    const { container } = render(
      <TransitionRadar
        currentTrack={null}
        nextTrack={null}
        positionMs={0}
        transition={null}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('calculates phrase progress, bars, and beat numbers accurately at 120 BPM', () => {
    const track = makeMockTrack('t1', 'Track 1', 120, 240000);
    // 120 BPM: 500ms per beat, 2000ms (2s) per bar. 16-bar phrase = 32000ms.
    // At positionMs = 6500ms (6.5s):
    // 13 beats elapsed -> bar 4 (beat 2) of phrase 1
    render(
      <TransitionRadar
        currentTrack={track}
        nextTrack={null}
        positionMs={6500}
        transition={mockAdvice}
      />
    );

    expect(screen.getByTestId('stage-transition-radar')).toBeDefined();
    expect(screen.getByText('PHRASE 1')).toBeDefined();
    expect(screen.getByText('BAR 4 / 16')).toBeDefined();
    expect(screen.getByText('BEAT 2/4')).toBeDefined();
  });

  it('displays imminent phrase countdown alert when approaching phrase boundary', () => {
    const track = makeMockTrack('t1', 'Track 1', 120, 240000);
    // At bar 15 of 16 (positionMs = 14 bars * 2000ms = 28000ms):
    // barsRemaining = 16 - 15 = 1 (within <= 2 bars)
    render(
      <TransitionRadar
        currentTrack={track}
        nextTrack={null}
        positionMs={28500}
        transition={mockAdvice}
      />
    );

    const badge = screen.getByTestId('radar-countdown-badge');
    expect(badge.textContent).toContain('DROP IN');
  });

  it('displays green boundary alert on Bar 1 of phrase', () => {
    const track = makeMockTrack('t1', 'Track 1', 120, 240000);
    // At bar 1 of phrase 2 (32000ms):
    render(
      <TransitionRadar
        currentTrack={track}
        nextTrack={null}
        positionMs={32500}
        transition={mockAdvice}
      />
    );

    const badge = screen.getByTestId('radar-countdown-badge');
    expect(badge.textContent).toContain('PHRASE BOUNDARY');
  });

  it('displays Outro Cue distance and transition advice notes', () => {
    const track = makeMockTrack('t1', 'Track 1', 120, 240000);
    const nextTrack = makeMockTrack('t2', 'Track 2', 122, 240000);

    render(
      <TransitionRadar
        currentTrack={track}
        nextTrack={nextTrack}
        positionMs={100000}
        transition={mockAdvice}
      />
    );

    const notes = screen.getByTestId('radar-advice-notes');
    expect(notes.textContent).toContain('Outro Cue');
    expect(notes.textContent).toContain('Blend bass at phrase 2');
  });

  it('triggers onSnapNextPhrase when snap button is clicked', () => {
    const track = makeMockTrack('t1', 'Track 1', 120, 240000);
    const snapSpy = vi.fn();

    render(
      <TransitionRadar
        currentTrack={track}
        nextTrack={null}
        positionMs={10000}
        transition={mockAdvice}
        onSnapNextPhrase={snapSpy}
      />
    );

    const snapBtn = screen.getByTestId('radar-snap-next-phrase');
    fireEvent.click(snapBtn);

    expect(snapSpy).toHaveBeenCalledTimes(1);
    // At 10s, next phrase 2 start is at 32000ms
    expect(snapSpy).toHaveBeenCalledWith(32000);
  });
});
