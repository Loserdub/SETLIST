import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MusicalTopologyView } from './MusicalTopologyView';
import { CatalogExplorerView } from './CatalogExplorerView';
import { useAppStore } from '../../store/useAppStore';
import type { Track } from '../../bindings/Track';
import type { Song } from '../../bindings/Song';
import type { CamelotLetter } from '../../bindings/CamelotLetter';

function makeMockTrack(
  id: string,
  title: string,
  bpm: number,
  camelotNum: number,
  camelotLetter: CamelotLetter,
  energy: number
): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash_${id}`,
    tags: {
      title,
      artist: `Artist ${id}`,
      album: 'Test Album',
    },
    duration_ms: 240000,
    analysis: {
      loudness: { integrated_lufs: -14.0, loudness_range: 6.0, true_peak: -1.0 },
      rhythm: {
        grid: {
          first_downbeat_ms: 100.0,
          bpm,
          beats_ms: [100.0, 600.0],
          downbeat_flags: [true, false],
          steady: true,
        },
        bpm_alternates: [bpm * 0.5, bpm * 2.0],
      },
      key: {
        pitch_class: (camelotNum * 7) % 12,
        mode: camelotLetter === 'A' ? 'Minor' : 'Major',
        camelot: { number: camelotNum, letter: camelotLetter },
        tuning_cents: 0.0,
      },
      dynamics: {
        frame_rate: 86.13,
        rms_curve: [0.5],
        low_ratio_curve: [0.5],
        centroid_curve: [1000.0],
      },
      energy_score: energy,
      energy_curve: { per_bar: [energy] },
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
}

describe('MusicalTopologyView Discovery Engine', () => {
  const sampleTracks: Track[] = [
    makeMockTrack('1', 'Deep Resonance', 124.0, 8, 'A', 5),
    makeMockTrack('2', 'Melodic Elevation', 125.0, 9, 'A', 7),
    makeMockTrack('3', 'Peak Climax', 126.0, 8, 'A', 9),
    makeMockTrack('4', 'Ambient Reset', 124.0, 8, 'B', 2),
    makeMockTrack('5', 'Tempo Shifter', 130.0, 10, 'A', 8),
  ];

  const sampleSongs: Song[] = sampleTracks.map((t) => ({
    id: t.id,
    title: t.tags.title ?? '',
    artist: t.tags.artist ?? '',
    duration_seconds: 240,
    bpm: t.analysis?.rhythm.grid.bpm ?? null,
    musical_key: t.id === '2' ? 'B minor' : t.id === '3' ? 'C# minor' : 'A minor',
    mode: 'Minor',
    camelot_code: t.analysis?.key.camelot ? `${t.analysis.key.camelot.number}${t.analysis.key.camelot.letter}` : '8A',
    energy_rating: t.analysis?.energy_score ?? null,
    tuning: 'Standard',
    capo: 0,
    lead_performer: null,
    tags: ['house', 'electronic'],
    notes: null,
  }));

  beforeEach(() => {
    useAppStore.setState({
      tracks: sampleTracks,
      hasLoadedTracks: true,
      useMockBackend: true,
      setlist: [],
      toasts: [],
    });
  });

  it('renders the core musical question "WHERE CAN THIS TRACK GO?" and focal track profile', async () => {
    render(
      <MusicalTopologyView
        songs={sampleSongs}
        onOpenBridgeModal={vi.fn()}
        onOpenPathModal={vi.fn()}
      />
    );

    expect(screen.getByText('WHERE CAN THIS TRACK GO?')).toBeDefined();
    expect(screen.getByText('TOPOLOGY CO-PILOT')).toBeDefined();
    expect(screen.getAllByText('Deep Resonance').length).toBeGreaterThan(0);
    expect(screen.getByText('FOCAL ANCHOR:')).toBeDefined();
    expect(screen.getAllByText('8A').length).toBeGreaterThan(0);
  });

  it('exposes the 8 musical relationship facets with live count badges', async () => {
    render(
      <MusicalTopologyView
        songs={sampleSongs}
        onOpenBridgeModal={vi.fn()}
        onOpenPathModal={vi.fn()}
      />
    );

    expect(screen.getByTestId('facet-harmonic')).toBeDefined();
    expect(screen.getByTestId('facet-tempo')).toBeDefined();
    expect(screen.getByTestId('facet-energy')).toBeDefined();
    expect(screen.getByTestId('facet-style')).toBeDefined();
    expect(screen.getByTestId('facet-openers')).toBeDefined();
    expect(screen.getByTestId('facet-peaks')).toBeDefined();
    expect(screen.getByTestId('facet-bridges')).toBeDefined();
    expect(screen.getByTestId('facet-closers')).toBeDefined();

    // Clicking a facet filters the active facet
    act(() => {
      fireEvent.click(screen.getByTestId('facet-harmonic'));
    });
    expect(screen.getByTestId('facet-harmonic').className).toContain('text-emerald-300');
  });

  it('renders SVG topology canvas with concentric orbits and candidate nodes', async () => {
    render(
      <MusicalTopologyView
        songs={sampleSongs}
        onOpenBridgeModal={vi.fn()}
        onOpenPathModal={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('musical-topology-canvas')).toBeDefined();
    });

    expect(screen.getByText(/INNER ORBIT: HIGH CONSONANCE/)).toBeDefined();
    expect(screen.getByText(/MIDDLE ORBIT: HARMONIC LIFTS/)).toBeDefined();
    expect(screen.getByText(/OUTER ORBIT: BRIDGES, CLOSERS/)).toBeDefined();
  });

  it('selects a candidate node and explains WHY it relates with KEY, TEMPO, ENERGY, and ROLE shifts', async () => {
    render(
      <MusicalTopologyView
        songs={sampleSongs}
        onOpenBridgeModal={vi.fn()}
        onOpenPathModal={vi.fn()}
      />
    );

    // Wait for candidate nodes to render
    await waitFor(() => {
      expect(screen.getByTestId('topology-node-2')).toBeDefined();
    });

    // Select candidate track 2
    act(() => {
      fireEvent.click(screen.getByTestId('topology-node-2'));
    });

    // Verify Inspector opens with the 4 comparative metrics
    expect(screen.getByTestId('musical-relationship-inspector')).toBeDefined();
    expect(screen.getByTestId('dimensional-comparison-hud')).toBeDefined();

    // Check KEY comparison
    expect(screen.getByText('KEY')).toBeDefined();
    expect(screen.getAllByText('8A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('9A').length).toBeGreaterThan(0);

    // Check TEMPO comparison
    expect(screen.getByText('TEMPO')).toBeDefined();

    // Check ENERGY comparison
    expect(screen.getByText('ENERGY')).toBeDefined();

    // Check ROLE comparison
    expect(screen.getByText('ROLE')).toBeDefined();

    // Check musical reasoning summary from engine
    expect(screen.getByText('MUSICAL SYNTHESIS')).toBeDefined();
  });

  it('navigates the topology by hopping to a candidate track ("Explore Where THIS Track Can Go")', async () => {
    render(
      <MusicalTopologyView
        songs={sampleSongs}
        onOpenBridgeModal={vi.fn()}
        onOpenPathModal={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('topology-node-2')).toBeDefined();
    });

    act(() => {
      fireEvent.click(screen.getByTestId('topology-node-2'));
    });

    const hopBtn = screen.getByTestId('btn-explore-from-candidate');
    expect(hopBtn).toBeDefined();

    act(() => {
      fireEvent.click(hopBtn);
    });

    // Now focal track has hopped to Melodic Elevation (id '2')
    expect(useAppStore.getState().selectedTrackId).toBe('2');
  });

  it('adds candidate track to active setlist directly from the relationship inspector', async () => {
    render(
      <MusicalTopologyView
        songs={sampleSongs}
        onOpenBridgeModal={vi.fn()}
        onOpenPathModal={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('topology-node-3')).toBeDefined();
    });

    act(() => {
      fireEvent.click(screen.getByTestId('topology-node-3'));
    });

    const addBtn = screen.getByTestId('add-to-setlist-3');
    act(() => {
      fireEvent.click(addBtn);
    });

    expect(useAppStore.getState().setlist.length).toBe(1);
    expect(useAppStore.getState().setlist[0].track_id).toBe('3');
  });

  it('switches between Constellation canvas and Cards mode', async () => {
    render(
      <MusicalTopologyView
        songs={sampleSongs}
        onOpenBridgeModal={vi.fn()}
        onOpenPathModal={vi.fn()}
      />
    );

    const cardsBtn = screen.getByText('Cards');
    act(() => {
      fireEvent.click(cardsBtn);
    });

    // In cards mode, the canvas is replaced by the categorized cards grid
    expect(screen.queryByTestId('musical-topology-canvas')).toBeNull();

    const constellationBtn = screen.getByText('Constellation');
    act(() => {
      fireEvent.click(constellationBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('musical-topology-canvas')).toBeDefined();
    });
  });

  it('integrates seamlessly in CatalogExplorerView under the Musical Topology tab', async () => {
    render(<CatalogExplorerView />);

    // Click the Musical Topology tab
    const topologyTab = screen.getByTestId('tab-topology');
    act(() => {
      fireEvent.click(topologyTab);
    });

    await waitFor(() => {
      expect(screen.getByTestId('musical-topology-view')).toBeDefined();
      expect(screen.getByText('WHERE CAN THIS TRACK GO?')).toBeDefined();
    });
  });
});
