import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StageSectionAnatomy } from './StageSectionAnatomy';
import type { Track } from '../../../bindings/Track';

afterEach(() => {
  cleanup();
});

function makeMockTrackWithSegments(id: string, durationMs: number = 120000): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    duration_ms: durationMs,
    analyzed_at: '2026-10-02T12:00:00Z',
    analysis_version: '1.0.0',
    tags: { title: 'Modulation', artist: 'Producer One', album: 'Album' },
    analysis: {
      loudness: { integrated_lufs: -10, loudness_range: 5, true_peak: -1 },
      rhythm: {
        grid: {
          bpm: 120,
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
      energy_score: 8,
      energy_curve: { per_bar: [] },
      segments: [
        { label: 'intro', start_ms: 0, end_ms: 32000, energy: 3 },
        { label: 'buildup', start_ms: 32000, end_ms: 64000, energy: 6 },
        { label: 'drop', start_ms: 64000, end_ms: 96000, energy: 9 },
        { label: 'outro', start_ms: 96000, end_ms: 120000, energy: 4 },
      ],
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

const mockTrack = makeMockTrackWithSegments('track-seg-1', 120000);

describe('StageSectionAnatomy', () => {
  it('returns null if track is null or duration is 0', () => {
    const { container } = render(
      <StageSectionAnatomy track={null} positionMs={0} durationMs={0} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders structural segment blocks with labels', () => {
    render(
      <StageSectionAnatomy
        track={mockTrack}
        positionMs={10000} // Inside intro
        durationMs={120000}
      />
    );

    expect(screen.getByTestId('stage-section-anatomy')).toBeDefined();
    expect(screen.getByTestId('section-block-intro')).toBeDefined();
    expect(screen.getByTestId('section-block-buildup')).toBeDefined();
    expect(screen.getByTestId('section-block-drop')).toBeDefined();
    expect(screen.getByTestId('section-block-outro')).toBeDefined();
  });

  it('identifies the active section and displays remaining bars to next section', () => {
    render(
      <StageSectionAnatomy
        track={mockTrack}
        positionMs={70000} // Inside drop (64000 to 96000)
        durationMs={120000}
      />
    );

    const telemetry = screen.getByTestId('section-telemetry');
    expect(telemetry.textContent).toContain('drop');
    expect(telemetry.textContent).toContain('UNTIL OUTRO');
  });

  it('invokes onSeek when clicking the structural timeline', () => {
    const onSeek = vi.fn();
    render(
      <StageSectionAnatomy
        track={mockTrack}
        positionMs={20000}
        durationMs={120000}
        onSeek={onSeek}
      />
    );

    const containerEl = screen.getByTestId('section-block-intro').parentElement!;
    vi.spyOn(containerEl, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 48,
      right: 1000,
      bottom: 48,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.click(containerEl, { clientX: 500 }); // click halfway = 60000ms
    expect(onSeek).toHaveBeenCalledWith(60000);
  });
});
