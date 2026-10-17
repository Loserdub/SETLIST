import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { StageDetourCopilot } from './StageDetourCopilot';
import type { Track } from '../../../bindings/Track';

function makeMockTrack(
  id: string,
  title: string,
  bpm: number,
  camelotNum: number,
  camelotLetter: 'A' | 'B',
  energy: number
): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    duration_ms: 240000,
    analyzed_at: '2026-10-02T12:00:00Z',
    analysis_version: '1.0.0',
    tags: { title, artist: 'Apex Producer', album: 'Album' },
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
        mode: camelotLetter === 'A' ? 'Minor' : 'Major',
        camelot: { number: camelotNum, letter: camelotLetter },
        tuning_cents: 0,
      },
      dynamics: { frame_rate: 10, rms_curve: [], low_ratio_curve: [], centroid_curve: [] },
      energy_score: energy,
      energy_curve: { per_bar: [] },
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

describe('StageDetourCopilot Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when currentTrack is null or catalog has no candidates', () => {
    const { container } = render(
      <StageDetourCopilot
        currentTrack={null}
        allTracks={[]}
        onQueueNext={vi.fn()}
        onSwapNext={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('generates Energy Lift, Floor Reset, and VIP recommendations from library', () => {
    const current = makeMockTrack('t1', 'Starlight', 126, 8, 'A', 6);
    const liftCandidate = makeMockTrack('t2', 'Solar Flare', 128, 9, 'A', 9); // Higher energy (+3), +1 Fifth
    const resetCandidate = makeMockTrack('t3', 'Deep Horizon', 124, 8, 'A', 3); // Lower energy (-3), same key
    const vipCandidate = makeMockTrack('t4', 'Starlight (VIP Mix)', 126, 8, 'A', 8); // Variant title!

    const allTracks = [current, liftCandidate, resetCandidate, vipCandidate];

    render(
      <StageDetourCopilot
        currentTrack={current}
        allTracks={allTracks}
        onQueueNext={vi.fn()}
        onSwapNext={vi.fn()}
      />
    );

    expect(screen.getByTestId('stage-detour-copilot')).toBeDefined();

    // 1. Energy Lift Card
    const liftCard = screen.getByTestId('detour-card-lift');
    expect(liftCard.textContent).toContain('ENERGY LIFT');
    expect(liftCard.textContent).toContain('Solar Flare');

    // 2. Floor Reset Card
    const resetCard = screen.getByTestId('detour-card-reset');
    expect(resetCard.textContent).toContain('FLOOR RESET');
    expect(resetCard.textContent).toContain('Deep Horizon');

    // 3. VIP Variant Card
    const vipCard = screen.getByTestId('detour-card-vip');
    expect(vipCard.textContent).toContain('VIP / PRODUCER EDIT');
    expect(vipCard.textContent).toContain('Starlight (VIP Mix)');
  });

  it('triggers onSwapNext and displays confirmation toast when SWAP NEXT is clicked', () => {
    vi.useFakeTimers();
    const current = makeMockTrack('t1', 'Starlight', 126, 8, 'A', 6);
    const liftCandidate = makeMockTrack('t2', 'Solar Flare', 128, 9, 'A', 9);
    const swapSpy = vi.fn();
    const queueSpy = vi.fn();

    render(
      <StageDetourCopilot
        currentTrack={current}
        allTracks={[current, liftCandidate]}
        onQueueNext={queueSpy}
        onSwapNext={swapSpy}
      />
    );

    const swapBtn = screen.getByTestId('detour-swap-lift');
    fireEvent.click(swapBtn);

    expect(swapSpy).toHaveBeenCalledTimes(1);
    expect(swapSpy).toHaveBeenCalledWith(liftCandidate);

    const toast = screen.getByTestId('detour-feedback-toast');
    expect(toast.textContent).toContain('Set "Solar Flare" as Next Track');

    // Fast-forward toast timer
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByTestId('detour-feedback-toast')).toBeNull();
    vi.useRealTimers();
  });

  it('triggers onQueueNext when INSERT NEXT is clicked', () => {
    const current = makeMockTrack('t1', 'Starlight', 126, 8, 'A', 6);
    const liftCandidate = makeMockTrack('t2', 'Solar Flare', 128, 9, 'A', 9);
    const swapSpy = vi.fn();
    const queueSpy = vi.fn();

    render(
      <StageDetourCopilot
        currentTrack={current}
        allTracks={[current, liftCandidate]}
        onQueueNext={queueSpy}
        onSwapNext={swapSpy}
      />
    );

    const queueBtn = screen.getByTestId('detour-queue-lift');
    fireEvent.click(queueBtn);

    expect(queueSpy).toHaveBeenCalledTimes(1);
    expect(queueSpy).toHaveBeenCalledWith(liftCandidate);
  });
});
