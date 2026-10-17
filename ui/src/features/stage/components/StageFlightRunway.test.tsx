import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StageFlightRunway } from './StageFlightRunway';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';
import type { Track } from '../../../bindings/Track';

afterEach(() => {
  cleanup();
});

function makeMockTrack(
  id: string,
  title: string,
  artist: string,
  bpm: number,
  camelotNum: number,
  camelotLetter: 'A' | 'B',
  energy: number,
  durationMs: number = 240000
): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    duration_ms: durationMs,
    analyzed_at: '2026-10-02T12:00:00Z',
    analysis_version: '1.0.0',
    tags: { title, artist, album: 'Album' },
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

const mockTrack1 = makeMockTrack('track-1', 'Atmosphere', 'Producer One', 124, 5, 'A', 7, 240000);
const mockTrack2 = makeMockTrack('track-2', 'Neon Pulse', 'Producer One', 126, 6, 'A', 9, 180000);

describe('StageFlightRunway', () => {
  it('returns null when entries array is empty', () => {
    const { container } = render(
      <StageFlightRunway entries={[]} currentIndex={0} currentPositionMs={0} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders active waypoint capsule with title, artist, key, and bpm', () => {
    const entries: SetlistEntry[] = [
      { position: 1, track_id: 'track-1', track: mockTrack1, transition: null, target_energy: null },
      { position: 2, track_id: 'track-2', track: mockTrack2, transition: null, target_energy: null },
    ];

    render(
      <StageFlightRunway entries={entries} currentIndex={0} currentPositionMs={60000} />
    );

    expect(screen.getByTestId('stage-flight-runway')).toBeDefined();
    const activeCapsule = screen.getByTestId('stage-runway-active-capsule');
    expect(activeCapsule.textContent).toContain('Atmosphere');
    expect(activeCapsule.textContent).toContain('Producer One');
    expect(activeCapsule.textContent).toContain('KEY 5A');
    expect(activeCapsule.textContent).toContain('124 BPM');
    expect(activeCapsule.textContent).toContain('ENERGY 7/10');
  });

  it('renders upcoming waypoints and invokes onSelectWaypoint on click', () => {
    const onSelect = vi.fn();
    const entries: SetlistEntry[] = [
      { position: 1, track_id: 'track-1', track: mockTrack1, transition: null, target_energy: null },
      { position: 2, track_id: 'track-2', track: mockTrack2, transition: null, target_energy: null },
    ];

    render(
      <StageFlightRunway
        entries={entries}
        currentIndex={0}
        currentPositionMs={30000}
        onSelectWaypoint={onSelect}
      />
    );

    const nextBtn = screen.getByTestId('stage-runway-next-1');
    expect(nextBtn.textContent).toContain('+1 UPCOMING');
    expect(nextBtn.textContent).toContain('Neon Pulse');
    expect(nextBtn.textContent).toContain('6A');

    fireEvent.click(nextBtn);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('renders specialized non-song waypoints such as tuning changes and banter', () => {
    const entries: SetlistEntry[] = [
      { position: 1, track_id: 'track-1', track: mockTrack1, transition: null, target_energy: null },
      { position: 2, track_id: 'tuning:Drop D', track: null, transition: null, target_energy: null },
      { position: 3, track_id: 'banter:Album Story', track: null, transition: null, target_energy: null },
    ];

    render(
      <StageFlightRunway entries={entries} currentIndex={0} currentPositionMs={10000} />
    );

    expect(screen.getByTestId('stage-runway-next-1').textContent).toContain('TUNING');
    expect(screen.getByTestId('stage-runway-next-2').textContent).toContain('MIC');
  });
});
