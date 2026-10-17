import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MacroSetlistAnalyzer,
  formatAggregatePlaytime,
  computeMacroSequenceMetrics,
} from './MacroSetlistAnalyzer';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { Track } from '../../bindings/Track';

function createMockTrack(
  id: string,
  title: string,
  bpm: number,
  camelotNum: number,
  camelotLetter: 'A' | 'B',
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

describe('MacroSetlistAnalyzer Component & Logic', () => {
  it('formats aggregate playtime correctly for minutes and hours', () => {
    expect(formatAggregatePlaytime(0)).toBe('0m 00s');
    expect(formatAggregatePlaytime(125)).toBe('2m 05s');
    expect(formatAggregatePlaytime(3665)).toBe('1h 01m 05s');
  });

  it('correctly calculates metrics and flags harmonic and tempo clashes', () => {
    // Track 1: 120 BPM, Key 8A, Energy 5, Duration 180s (3m)
    const t1 = createMockTrack('t1', 'Track 1', 120, 8, 'A', 5, 180000);
    // Track 2: 124 BPM (Δ4 <= 8), Key 9A (d=1 <= 2), Energy 7, Duration 240s (4m) -> SMOOTH
    const t2 = createMockTrack('t2', 'Track 2', 124, 9, 'A', 7, 240000);
    // Track 3: 135 BPM (Δ11 > 8), Key 2A (d=5 > 2), Energy 9, Duration 180s (3m) -> CLASH (both)
    const t3 = createMockTrack('t3', 'Track 3', 135, 2, 'A', 9, 180000);

    const entries: SetlistEntry[] = [
      { position: 1, track_id: 't1', track: t1, transition: null, target_energy: 5 },
      { position: 2, track_id: 't2', track: t2, transition: null, target_energy: 7 },
      { position: 3, track_id: 't3', track: t3, transition: null, target_energy: 9 },
    ];

    const metrics = computeMacroSequenceMetrics(entries);

    expect(metrics.totalTracks).toBe(3);
    expect(metrics.totalPlaytimeSeconds).toBe(600); // 180 + 240 + 180 = 600s = 10m
    expect(metrics.formattedPlaytime).toBe('10m 00s');
    expect(metrics.averageBpm).toBe(126.3);
    expect(metrics.minBpm).toBe(120);
    expect(metrics.maxBpm).toBe(135);
    expect(metrics.bpmSpan).toBe(15);
    expect(metrics.averageEnergy).toBe(7);

    // Transitions
    expect(metrics.transitions).toHaveLength(2);

    // Step 1 -> 2: Smooth
    const step1 = metrics.transitions[0];
    expect(step1.bpmDelta).toBe(4);
    expect(step1.keyDistance).toBe(1);
    expect(step1.isHarmonicClash).toBe(false);
    expect(step1.isTempoClash).toBe(false);
    expect(step1.isClash).toBe(false);

    // Step 2 -> 3: Clash
    const step2 = metrics.transitions[1];
    expect(step2.bpmDelta).toBe(11);
    expect(step2.keyDistance).toBe(5);
    expect(step2.isHarmonicClash).toBe(true);
    expect(step2.isTempoClash).toBe(true);
    expect(step2.isClash).toBe(true);
    expect(step2.clashReason).toContain('Harmonic clash');
    expect(step2.clashReason).toContain('Tempo gap');

    expect(metrics.smoothCount).toBe(1);
    expect(metrics.clashCount).toBe(1);
  });

  it('renders MacroSetlistAnalyzer with all telemetry readouts and visual graph', () => {
    const t1 = createMockTrack('t1', 'Alpha', 122, 8, 'A', 4, 180000);
    const t2 = createMockTrack('t2', 'Beta', 124, 9, 'A', 6, 210000);
    const t3 = createMockTrack('t3', 'Gamma', 134, 1, 'B', 8, 240000); // Clash: ΔBPM=10, d=5

    const entries: SetlistEntry[] = [
      { position: 1, track_id: 't1', track: t1, transition: null, target_energy: 4 },
      { position: 2, track_id: 't2', track: t2, transition: null, target_energy: 6 },
      { position: 3, track_id: 't3', track: t3, transition: null, target_energy: 8 },
    ];

    const onSelectTrack = vi.fn();
    render(<MacroSetlistAnalyzer entries={entries} onSelectTrack={onSelectTrack} />);

    // Header & Telemetry
    expect(screen.getByTestId('macro-setlist-analyzer')).toBeDefined();
    expect(screen.getByText('MACRO SEQUENCE ANALYSIS')).toBeDefined();

    // Playtime: 180 + 210 + 240 = 630s = 10m 30s
    expect(screen.getByTestId('macro-total-playtime').textContent).toContain('10m 30s');

    // Tempo overview
    expect(screen.getByTestId('macro-tempo-overview').textContent).toContain('126.7');

    // Energy overview
    expect(screen.getByTestId('macro-energy-overview').textContent).toContain('6/10');

    // Sequence Health
    expect(screen.getByTestId('macro-sequence-health').textContent).toContain('1 CLASH');

    // Transition Badges
    expect(screen.getByTestId('transition-status-badge-1').textContent).toContain('SMOOTH');
    expect(screen.getByTestId('transition-status-badge-2').textContent).toContain('CLASH');

    // Filter to clashes only
    const filterBtn = screen.getByTestId('filter-clashes-btn');
    fireEvent.click(filterBtn);
    expect(screen.queryByTestId('macro-transition-step-1')).toBeNull();
    expect(screen.getByTestId('macro-transition-step-2')).toBeDefined();

    // Clicking filter again restores all transitions
    fireEvent.click(filterBtn);
    expect(screen.getByTestId('macro-transition-step-1')).toBeDefined();
  });

  it('renders nothing when entries array is empty', () => {
    const { container } = render(<MacroSetlistAnalyzer entries={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
