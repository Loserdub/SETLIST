import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StageMode } from './StageMode';
import { formatDuration, formatDurationCompact } from './usePerformanceClock';
import { useAppStore } from '../../store/useAppStore';
import type { Track } from '../../bindings/Track';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import type { CamelotLetter } from '../../bindings/CamelotLetter';

function makeMockTrack(
  id: string,
  title: string,
  artist: string,
  bpm: number,
  camelotNum: number,
  camelotLetter: CamelotLetter,
  energy: number,
  durationMs: number
): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    duration_ms: durationMs,
    analyzed_at: '2026-10-02T12:00:00Z',
    analysis_version: '1.0.0',
    tags: {
      title,
      artist,
      album: 'Test Album',
    },
    analysis: {
      loudness: {
        integrated_lufs: -10.5,
        loudness_range: 6.0,
        true_peak: -0.5,
      },
      rhythm: {
        grid: {
          bpm,
          first_downbeat_ms: 500,
          beats_ms: [500, 1000, 1500, 2000],
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
      energy_score: energy,
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

const mockAdvice: TransitionAdvice = {
  transition_type: 'Fifth',
  bpm_delta: 2.0,
  key_distance: 1,
  mode_flip: false,
  intervention_required: false,
  loop_extension_recommended: false,
  phrase_bars: 16,
  notes: ['Smooth transition available', 'Blend bass at phrase 2'],
  total_cost: 0.1,
  tempo_cost: 0.1,
  key_cost: 0.1,
  energy_cost: 0.1,
  timbre_cost: 0,
  de_target: 1.0,
  weights: null,
  profile: null,
};

const mockInterventionAdvice: TransitionAdvice = {
  transition_type: 'WholeStepLift',
  bpm_delta: 9.0,
  key_distance: 4,
  mode_flip: false,
  intervention_required: true,
  loop_extension_recommended: true,
  phrase_bars: 8,
  notes: ['Large BPM jump requires loop', 'Watch key clash'],
  total_cost: 0.8,
  tempo_cost: 0.8,
  key_cost: 0.8,
  energy_cost: 0.8,
  timbre_cost: 0,
  de_target: 2.0,
  weights: null,
  profile: null,
};

describe('StageMode Component & Live Performance View', () => {
  let mockTrack1: Track;
  let mockTrack2: Track;
  let mockTrack3: Track;
  let sampleSetlist: SetlistEntry[];

  beforeEach(() => {
    vi.useFakeTimers();

    mockTrack1 = makeMockTrack('track-1', 'Starlight Symphony', 'Nova', 126, 8, 'A', 6, 240000);
    mockTrack2 = makeMockTrack('track-2', 'Midnight Echoes', 'Vesper', 128, 9, 'A', 7, 300000);
    mockTrack3 = makeMockTrack('track-3', 'Solar Flare', 'Helios', 137, 1, 'B', 9, 180000);

    sampleSetlist = [
      {
        position: 1,
        track_id: mockTrack1.id,
        track: mockTrack1,
        transition: null,
        target_energy: 6,
      },
      {
        position: 2,
        track_id: mockTrack2.id,
        track: mockTrack2,
        transition: mockAdvice,
        target_energy: 7,
      },
      {
        position: 3,
        track_id: mockTrack3.id,
        track: mockTrack3,
        transition: mockInterventionAdvice,
        target_energy: 9,
      },
    ];

    useAppStore.setState({
      setlist: sampleSetlist,
      setlistName: 'Mainstage Prime',
      isStageMode: true,
      stageCurrentIndex: 0,
      stageStartTime: Date.now(),
      currentRoute: 'stage',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the empty state when setlist is empty and allows return', () => {
    useAppStore.setState({
      setlist: [],
      isStageMode: true,
    });

    render(<StageMode />);

    expect(screen.getByTestId('stage-empty')).toBeDefined();
    expect(screen.getByText('No tracks in setlist')).toBeDefined();

    const returnBtn = screen.getByTestId('stage-exit-empty');
    fireEvent.click(returnBtn);

    expect(useAppStore.getState().isStageMode).toBe(false);
    expect(useAppStore.getState().currentRoute).toBe('setlist');
  });

  it('renders current track with large title, artist, and metadata pills', () => {
    render(<StageMode />);

    const currentTrackEl = screen.getByTestId('stage-current-track');
    expect(currentTrackEl).toBeDefined();
    expect(screen.getByText('Starlight Symphony')).toBeDefined();
    expect(screen.getByText('Nova')).toBeDefined();

    // Check metadata pills
    expect(screen.getByText('126')).toBeDefined(); // BPM
    expect(screen.getByText('8A')).toBeDefined(); // Key
    expect(screen.getByText('6')).toBeDefined(); // Energy
    expect(screen.getByText('04:00')).toBeDefined(); // Length: 240000ms = 04:00

    // Set position indicator
    expect(screen.getByText('1 / 3')).toBeDefined();
    expect(screen.getByText('Mainstage Prime')).toBeDefined();
  });

  it('renders next track preview and transition advice', () => {
    render(<StageMode />);

    const nextTrackEl = screen.getByTestId('stage-next-track');
    expect(nextTrackEl).toBeDefined();
    expect(screen.getByText('Midnight Echoes')).toBeDefined();
    expect(screen.getByText('Vesper')).toBeDefined();

    const transitionInfo = screen.getByTestId('stage-transition-info');
    expect(transitionInfo).toBeDefined();
    expect(screen.getByText('Fifth')).toBeDefined();
    expect(screen.getByText('Δ2.0 BPM')).toBeDefined();
    expect(screen.getByText('Key dist 1')).toBeDefined();
    expect(screen.getByText('16 bars')).toBeDefined();
  });

  it('handles navigation forward and backward with buttons', () => {
    render(<StageMode />);

    const prevBtn = screen.getByTestId('stage-prev-btn') as HTMLButtonElement;
    const nextBtn = screen.getByTestId('stage-next-btn') as HTMLButtonElement;

    // Initially at start: prev disabled, next enabled
    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);

    // Click Next -> moves to index 1
    fireEvent.click(nextBtn);
    expect(useAppStore.getState().stageCurrentIndex).toBe(1);

    // Track 2 is now current
    expect(screen.getByText('Midnight Echoes')).toBeDefined();
    expect(screen.getByText(/previous/i)).toBeDefined();
    expect(screen.getByText('Starlight Symphony')).toBeDefined();

    // Next track is Track 3 with intervention advice
    expect(screen.getByText('Solar Flare')).toBeDefined();
    expect(screen.getByText('⚠ Intervention')).toBeDefined();

    // Click Next -> moves to index 2 (last track)
    fireEvent.click(screen.getByTestId('stage-next-btn'));
    expect(useAppStore.getState().stageCurrentIndex).toBe(2);

    expect(screen.getByText('Solar Flare')).toBeDefined();
    expect(screen.getByTestId('stage-end-of-set')).toBeDefined();
    expect(screen.getByText(/last track/i)).toBeDefined();

    const updatedNextBtn = screen.getByTestId('stage-next-btn') as HTMLButtonElement;
    expect(updatedNextBtn.disabled).toBe(true);

    // Click Prev -> moves back to index 1
    fireEvent.click(screen.getByTestId('stage-prev-btn'));
    expect(useAppStore.getState().stageCurrentIndex).toBe(1);
  });

  it('supports keyboard navigation for next, prev, and foot pedal inputs', () => {
    render(<StageMode />);

    // ArrowRight -> next
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useAppStore.getState().stageCurrentIndex).toBe(1);

    // PageDown (common foot pedal key) -> next
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(useAppStore.getState().stageCurrentIndex).toBe(2);

    // PageUp (foot pedal prev) -> prev
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(useAppStore.getState().stageCurrentIndex).toBe(1);

    // ArrowLeft -> prev
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(useAppStore.getState().stageCurrentIndex).toBe(0);

    // Space -> next
    fireEvent.keyDown(window, { key: ' ' });
    expect(useAppStore.getState().stageCurrentIndex).toBe(1);
  });

  it('opens exit confirmation modal on Escape or exit button click and protects against accidental exit', () => {
    render(<StageMode />);

    expect(screen.queryByTestId('stage-exit-confirm')).toBeNull();

    // Trigger via Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('stage-exit-confirm')).toBeDefined();
    expect(screen.getByText('Exit Stage Mode?')).toBeDefined();

    // Cancel exit
    fireEvent.click(screen.getByTestId('stage-exit-cancel'));
    expect(screen.queryByTestId('stage-exit-confirm')).toBeNull();
    expect(useAppStore.getState().isStageMode).toBe(true);

    // Open via Exit button
    fireEvent.click(screen.getByTestId('stage-exit-btn'));
    expect(screen.getByTestId('stage-exit-confirm')).toBeDefined();

    // Confirm exit
    fireEvent.click(screen.getByTestId('stage-exit-confirm-btn'));
    expect(useAppStore.getState().isStageMode).toBe(false);
    expect(useAppStore.getState().currentRoute).toBe('setlist');
  });

  it('allows jumping to any song via the setlist overlay', () => {
    render(<StageMode />);

    expect(screen.queryByTestId('stage-setlist-overlay')).toBeNull();

    // Open setlist overlay
    fireEvent.click(screen.getByTestId('stage-setlist-toggle'));
    expect(screen.getByTestId('stage-setlist-overlay')).toBeDefined();

    // Jump directly to track 3 (index 2)
    const track3Item = screen.getByTestId('stage-jump-2');
    fireEvent.click(track3Item);

    expect(useAppStore.getState().stageCurrentIndex).toBe(2);
    expect(screen.queryByTestId('stage-setlist-overlay')).toBeNull();
  });

  it('updates performance clock elapsed time over time', () => {
    const startTime = Date.now();
    useAppStore.setState({ stageStartTime: startTime });

    render(<StageMode />);

    expect(screen.getByTestId('stage-elapsed').textContent).toBe('00:00');

    // Advance 65 seconds
    act(() => {
      vi.advanceTimersByTime(65000);
    });

    expect(screen.getByTestId('stage-elapsed').textContent).toBe('01:05');
  });
});

describe('Duration formatting utilities', () => {
  it('formats milliseconds to M:SS correctly', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(5000)).toBe('00:05');
    expect(formatDuration(65000)).toBe('01:05');
    expect(formatDuration(240000)).toBe('04:00');
    expect(formatDuration(3665000)).toBe('1:01:05');
  });

  it('formats milliseconds to compact format correctly', () => {
    expect(formatDurationCompact(0)).toBe('0m');
    expect(formatDurationCompact(45000)).toBe('1m');
    expect(formatDurationCompact(3600000)).toBe('1h');
    expect(formatDurationCompact(5400000)).toBe('1h 30m');
  });
});
