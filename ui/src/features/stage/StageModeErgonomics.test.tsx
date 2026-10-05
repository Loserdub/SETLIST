import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StageMode } from './StageMode';
import { useAppStore } from '../../store/useAppStore';
import type { Track } from '../../bindings/Track';
import type { SetlistEntry } from '../../bindings/SetlistEntry';

function createMockEntry(
  position: number,
  id: string,
  title: string,
  artist: string,
  bpm: number,
  camelotKey = '8A',
  intervention = false
): SetlistEntry {
  const camelotNum = parseInt(camelotKey.replace(/\D/g, ''), 10) || 8;
  const camelotLetter = camelotKey.includes('B') ? 'B' : 'A';

  const track: Track = {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash_${id}`,
    tags: { title, artist, album: 'Test Album' },
    duration_ms: 240000,
    analysis: {
      loudness: { integrated_lufs: -14.0, loudness_range: 6.0, true_peak: -1.0 },
      rhythm: {
        grid: {
          first_downbeat_ms: 0.0,
          bpm,
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
        frame_rate: 86.13,
        rms_curve: [0.5],
        low_ratio_curve: [0.5],
        centroid_curve: [1000.0],
      },
      energy_score: 7,
      energy_curve: { per_bar: [7] },
      segments: [],
      cue_points: [],
      waveform: {
        points_per_sec: 10,
        low: { peak: [100], rms: [50] },
        mid: { peak: [100], rms: [50] },
        high: { peak: [100], rms: [50] },
      },
    },
    analyzed_at: '2026-01-01T00:00:00Z',
    analysis_version: 'v1',
  };

  return {
    position,
    track_id: id,
    track,
    target_energy: 7,
    transition: {
      transition_type: 'Other',
      bpm_delta: intervention ? 10.0 : 1.0,
      key_distance: intervention ? 5 : 1,
      mode_flip: false,
      intervention_required: intervention,
      loop_extension_recommended: false,
      phrase_bars: 16,
      notes: intervention ? ['Major tempo jump required'] : [],
      total_cost: 0.2,
      tempo_cost: 0.1,
      key_cost: 0.1,
      energy_cost: 0.0,
      timbre_cost: 0.0,
      de_target: null,
      weights: null,
      profile: null,
    },
  };
}

describe('StageMode Ergonomics & High-Pressure Touch Targets (Stage 3 Optimization)', () => {
  const longTitle = 'Hyperdrive Sonic Supernova (Extended Festival VIP Dubstep Mix feat. Guest Vocalist)';
  const mockSetlist: SetlistEntry[] = [
    createMockEntry(1, 'trk-1', longTitle, 'Bass Master', 128.0, '8A', false),
    createMockEntry(2, 'trk-2', 'Cosmic Odyssey', 'Starlight', 138.0, '1A', true),
  ];

  beforeEach(() => {
    useAppStore.setState({
      setlist: mockSetlist,
      setlistName: 'Main Stage Peak Hour',
      isStageMode: true,
      stageCurrentIndex: 0,
      stageStartTime: Date.now(),
      useMockBackend: true,
    });
  });

  it('renders large 56px+ touch target hitboxes for stage navigation buttons', () => {
    render(<StageMode />);

    const prevBtn = screen.getByTestId('stage-prev-btn');
    const nextBtn = screen.getByTestId('stage-next-btn');

    expect(prevBtn.className).toContain('min-h-[56px]');
    expect(nextBtn.className).toContain('min-h-[56px]');
    expect(prevBtn.textContent).toContain('PREV');
    expect(nextBtn.textContent).toContain('NEXT');
  });

  it('renders title with line clamping and word breaking to avoid live truncation', () => {
    render(<StageMode />);

    const titleEl = screen.getByText(longTitle);
    expect(titleEl.className).toContain('line-clamp-2');
    expect(titleEl.className).toContain('break-words');
  });

  it('displays high-visibility amber hazard indicator for transitions requiring intervention', () => {
    render(<StageMode />);

    const transitionInfo = screen.getByTestId('stage-transition-info');
    expect(transitionInfo.className).toContain('border-amber-500/80');
    expect(transitionInfo.className).toContain('bg-amber-950/40');
    expect(screen.getByText(/⚠ Intervention/i)).toBeDefined();
  });
});
