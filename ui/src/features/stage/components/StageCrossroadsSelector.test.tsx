import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StageCrossroadsSelector } from './StageCrossroadsSelector';
import type { Track } from '../../../bindings/Track';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';

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
  durationMs: number = 180000
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

const mockCurrentTrack = makeMockTrack('current-1', 'Deep Horizon', 'Artist A', 124, 5, 'A', 5);
const mockNextTrack = makeMockTrack('next-1', 'Planned Next', 'Artist B', 124, 5, 'A', 6);
const mockEnergyTrack = makeMockTrack('energy-1', 'Peak Reactor', 'Artist C', 126, 6, 'A', 9, 200000);
const mockVipTrack = makeMockTrack('vip-1', 'Deep Horizon (VIP Dub)', 'Artist A', 124, 5, 'A', 8, 210000);

describe('StageCrossroadsSelector', () => {
  it('renders all 3 narrative branch cards', () => {
    const nextEntry: SetlistEntry = {
      position: 2,
      track_id: 'next-1',
      track: mockNextTrack,
      transition: null,
      target_energy: null,
    };

    render(
      <StageCrossroadsSelector
        currentTrack={mockCurrentTrack}
        nextEntry={nextEntry}
        allTracks={[mockCurrentTrack, mockNextTrack, mockEnergyTrack, mockVipTrack]}
        onCommitBranch={vi.fn()}
      />
    );

    expect(screen.getByTestId('stage-crossroads-selector')).toBeDefined();
    expect(screen.getByTestId('crossroads-branch-1')).toBeDefined();
    expect(screen.getByTestId('crossroads-branch-2')).toBeDefined();
    expect(screen.getByTestId('crossroads-branch-3')).toBeDefined();

    expect(screen.getByTestId('crossroads-branch-1').textContent).toContain('Planned Next');
    expect(screen.getByTestId('crossroads-branch-2').textContent).toContain('Peak Reactor');
    expect(screen.getByTestId('crossroads-branch-3').textContent).toContain('Deep Horizon (VIP Dub)');
  });

  it('triggers onCommitBranch and shows confirmation toast when committing branch 2', () => {
    const onCommit = vi.fn();
    const nextEntry: SetlistEntry = {
      position: 2,
      track_id: 'next-1',
      track: mockNextTrack,
      transition: null,
      target_energy: null,
    };

    render(
      <StageCrossroadsSelector
        currentTrack={mockCurrentTrack}
        nextEntry={nextEntry}
        allTracks={[mockCurrentTrack, mockNextTrack, mockEnergyTrack, mockVipTrack]}
        onCommitBranch={onCommit}
      />
    );

    const branch2Btn = screen.getByTitle('Commit Branch [2]');
    fireEvent.click(branch2Btn);

    expect(onCommit).toHaveBeenCalledWith(2, mockEnergyTrack);
    expect(screen.getByTestId('crossroads-feedback').textContent).toContain('Peak Reactor');
  });
});
