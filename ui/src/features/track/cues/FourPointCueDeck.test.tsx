import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FourPointCueDeck } from './FourPointCueDeck';
import { FourPointCueChips } from './FourPointCueChips';
import { useAppStore } from '../../../store/useAppStore';
import type { TrackWithOverrides } from '../../../api/overrides';

function makeMockTrack(isOverridden = false): TrackWithOverrides {
  return {
    id: 'track-4-cue',
    path: '/music/track.mp3',
    hash: 'hash-abc',
    tags: {
      title: 'Festival Banger',
      artist: 'Mainstage DJ',
      album: 'Peak EP',
    },
    duration_ms: 240000,
    created_at: '2026-01-01',
    analysis: {
      loudness: {
        integrated_lufs: -9.5,
        loudness_range_lu: 5.0,
        true_peak_dbfs: -0.1,
      },
      rhythm: {
        grid: {
          first_downbeat_ms: 250,
          bpm: 128.0,
          beats_ms: [250, 718, 1187, 1656],
          downbeat_flags: [true, false, false, false],
          steady: true,
        },
        bpm_alternates: [64.0, 256.0],
      },
      key: {
        pitch_class: 0,
        mode: 'Minor',
        camelot: { number: 4, letter: 'A' },
        tuning_cents: 0,
      },
      dynamics: {
        frame_rate: 86.13,
        rms_curve: [0.5],
        low_ratio_curve: [0.4],
        centroid_curve: [1200],
      },
      energy_score: 8,
      energy_curve: { per_bar: [8] },
      segments: [
        { label: 'intro', start_ms: 0, end_ms: 15000, energy: 4 },
        { label: 'breakdown', start_ms: 45000, end_ms: 60000, energy: 3 },
        { label: 'drop', start_ms: 60000, end_ms: 120000, energy: 9 },
        { label: 'outro', start_ms: 180000, end_ms: 240000, energy: 4 },
      ],
      cue_points: [
        { index: 0, time_ms: 250, label: 'A: INTRO', color_hex: '#10B981', kind: 'HotCue', loop_end_ms: null },
        { index: 1, time_ms: 45000, label: 'B: BREAKDOWN', color_hex: '#F59E0B', kind: 'HotCue', loop_end_ms: null },
        { index: 2, time_ms: 60000, label: 'C: DROP', color_hex: '#EF4444', kind: 'HotCue', loop_end_ms: null },
        { index: 3, time_ms: 180000, label: 'D: MIX OUT', color_hex: '#06B6D4', kind: 'HotCue', loop_end_ms: null },
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
      cues: isOverridden,
      title: false,
      artist: false,
    },
  } as unknown as TrackWithOverrides;
}

describe('FourPointCueDeck Component', () => {
  beforeEach(() => {
    useAppStore.setState({
      toasts: [],
      useMockBackend: true,
    });
  });

  it('renders all four hardware performance pads with roles and shortcut keys', () => {
    const track = makeMockTrack(false);
    render(
      <FourPointCueDeck
        track={track}
        playheadPositionMs={0}
        onJumpToCue={vi.fn()}
      />
    );

    expect(screen.getByText('PERFORMANCE CUES (A – D)')).toBeDefined();
    expect(screen.getByTestId('cue-pad-A')).toBeDefined();
    expect(screen.getByTestId('cue-pad-B')).toBeDefined();
    expect(screen.getByTestId('cue-pad-C')).toBeDefined();
    expect(screen.getByTestId('cue-pad-D')).toBeDefined();

    expect(screen.getByText('INTRO')).toBeDefined();
    expect(screen.getByText('BREAKDOWN')).toBeDefined();
    expect(screen.getByText('DROP')).toBeDefined();
    expect(screen.getByText('MIX OUT')).toBeDefined();
  });

  it('shows SUGGESTED badge when cues are analysis-generated, and CONFIRMED when user-locked', () => {
    const suggestedTrack = makeMockTrack(false);
    const { rerender } = render(
      <FourPointCueDeck
        track={suggestedTrack}
        playheadPositionMs={0}
        onJumpToCue={vi.fn()}
      />
    );

    expect(screen.getByTestId('badge-suggested-A')).toBeDefined();
    expect(screen.getByTestId('badge-suggested-D')).toBeDefined();

    const confirmedTrack = makeMockTrack(true);
    rerender(
      <FourPointCueDeck
        track={confirmedTrack}
        playheadPositionMs={0}
        onJumpToCue={vi.fn()}
      />
    );

    expect(screen.getByTestId('badge-confirmed-A')).toBeDefined();
    expect(screen.getByTestId('badge-confirmed-D')).toBeDefined();
  });

  it('calls onJumpToCue with cue timestamp when trigger pad is clicked', () => {
    const track = makeMockTrack(false);
    const handleJump = vi.fn();
    render(
      <FourPointCueDeck
        track={track}
        playheadPositionMs={0}
        onJumpToCue={handleJump}
      />
    );

    const padC = screen.getByTestId('pad-trigger-C');
    act(() => {
      fireEvent.click(padC);
    });

    expect(handleJump).toHaveBeenCalledWith(60000, true);
  });

  it('auditions cue via the dedicated PLAY button on the pad', () => {
    const track = makeMockTrack(false);
    const handleJump = vi.fn();
    render(
      <FourPointCueDeck
        track={track}
        playheadPositionMs={0}
        onJumpToCue={handleJump}
      />
    );

    const playBtnA = screen.getByTestId('btn-audition-A');
    act(() => {
      fireEvent.click(playBtnA);
    });

    expect(handleJump).toHaveBeenCalledWith(250, true);
  });
});

describe('FourPointCueChips Component', () => {
  it('renders compact chip indicators with letters and timestamps', () => {
    const track = makeMockTrack(false);
    const handleCueClick = vi.fn();

    render(
      <FourPointCueChips
        track={track}
        onCueClick={handleCueClick}
        showTimes={true}
      />
    );

    expect(screen.getByTestId('four-point-cue-chips')).toBeDefined();
    expect(screen.getByTestId('cue-chip-A')).toBeDefined();
    expect(screen.getByTestId('cue-chip-B')).toBeDefined();
    expect(screen.getByTestId('cue-chip-C')).toBeDefined();
    expect(screen.getByTestId('cue-chip-D')).toBeDefined();

    act(() => {
      fireEvent.click(screen.getByTestId('cue-chip-D'));
    });

    expect(handleCueClick).toHaveBeenCalledWith('D', 180000);
  });
});
