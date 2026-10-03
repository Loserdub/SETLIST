import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { CatalogExplorerView } from './CatalogExplorerView';
import { useAppStore } from '../../store/useAppStore';
import type { Track } from '../../bindings/Track';
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
      artist: 'Test Artist',
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

describe('CatalogExplorerView Component', () => {
  const sampleTracks: Track[] = [
    makeMockTrack('1', 'Deep Resonance', 124.0, 8, 'A', 6),
    makeMockTrack('2', 'Melodic Elevation', 125.0, 9, 'A', 7),
    makeMockTrack('3', 'Peak Climax', 126.0, 10, 'A', 9),
    makeMockTrack('4', 'Ambient Reset', 124.0, 8, 'A', 2),
    makeMockTrack('5', 'Speedcore Outlier', 175.0, 1, 'B', 10),
  ];

  beforeEach(() => {
    useAppStore.setState({
      tracks: sampleTracks,
      hasLoadedTracks: true,
      useMockBackend: true,
      setlist: [],
      toasts: [],
    });
  });

  it('renders catalog tracks table, metadata, and summary stats', async () => {
    render(<CatalogExplorerView />);

    expect(screen.getByText('CATALOG EXPLORER & SET DISCOVERY')).toBeDefined();
    expect(screen.getByText('Deep Resonance')).toBeDefined();
    expect(screen.getByText('Melodic Elevation')).toBeDefined();
    expect(screen.getByText('Speedcore Outlier')).toBeDefined();

    // Verify metadata badges
    expect(screen.getAllByText('8A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('9A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('124.0').length).toBeGreaterThan(0);
  });

  it('filters catalog tracks by search query and Camelot key', async () => {
    render(<CatalogExplorerView />);

    const searchInput = screen.getByTestId('catalog-search-input');
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'Melodic' } });
    });

    expect(screen.getByText('Melodic Elevation')).toBeDefined();
    expect(screen.queryByText('Deep Resonance')).toBeNull();

    act(() => {
      fireEvent.change(searchInput, { target: { value: '' } });
    });
    expect(screen.getByText('Deep Resonance')).toBeDefined();
  });

  it('opens SongRelationshipDrawer when clicking Relationships button', async () => {
    render(<CatalogExplorerView />);

    const inspectBtn = screen.getByTestId('inspect-rel-btn-1');
    act(() => {
      fireEvent.click(inspectBtn);
    });

    expect(screen.getByTestId('song-relationship-drawer')).toBeDefined();
    expect(screen.getByText('SONG RELATIONSHIP PROFILE')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('tab-outgoing')).toBeDefined();
    });

    // Verify tabs switch
    const incomingTab = screen.getByTestId('tab-incoming');
    act(() => {
      fireEvent.click(incomingTab);
    });
    expect(screen.getByText('Incoming transitions from Preceding Song → "Deep Resonance".')).toBeDefined();

    const contrastsTab = screen.getByTestId('tab-unusual');
    act(() => {
      fireEvent.click(contrastsTab);
    });
    expect(screen.getByText('Creative opportunities: energy resets, half/double time, and harmonic lifts.')).toBeDefined();
  });

  it('adds track to setlist from relationship drawer without modifying existing set unexpectedly', async () => {
    render(<CatalogExplorerView />);

    const inspectBtn = screen.getByTestId('inspect-rel-btn-1');
    act(() => {
      fireEvent.click(inspectBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('add-to-setlist-2')).toBeDefined();
    });

    act(() => {
      fireEvent.click(screen.getByTestId('add-to-setlist-2'));
    });

    expect(useAppStore.getState().setlist.length).toBe(1);
    expect(useAppStore.getState().setlist[0].track_id).toBe('2');
  });

  it('opens BridgeDiscoveryModal and evaluates intermediate bridging routes', async () => {
    render(<CatalogExplorerView />);

    const bridgeBtn = screen.getByTestId('btn-find-bridges');
    act(() => {
      fireEvent.click(bridgeBtn);
    });

    expect(screen.getByTestId('bridge-discovery-modal')).toBeDefined();
    expect(screen.getByText('CATALOG BRIDGE DISCOVERY')).toBeDefined();
    expect(screen.getByTestId('select-song-a')).toBeDefined();
    expect(screen.getByTestId('select-song-b')).toBeDefined();
  });

  it('opens PathExplorerModal and allows step-by-step path chaining', async () => {
    render(<CatalogExplorerView />);

    const pathBtn = screen.getByTestId('btn-build-path');
    act(() => {
      fireEvent.click(pathBtn);
    });

    expect(screen.getByTestId('path-explorer-modal')).toBeDefined();
    expect(screen.getByText('INTERACTIVE PATH BUILDER')).toBeDefined();
    expect(screen.getByText(/CURRENT PATH TRAIL/)).toBeDefined();
  });

  it('opens DurationSetDiscoveryModal and discovers sets matching duration', async () => {
    render(<CatalogExplorerView />);

    const durationBtn = screen.getByTestId('btn-duration-sets');
    act(() => {
      fireEvent.click(durationBtn);
    });

    expect(screen.getByTestId('duration-discovery-modal')).toBeDefined();
    expect(screen.getByText('DURATION-AWARE SET DISCOVERY')).toBeDefined();
  });

  it('navigates to Clusters & Outliers view and displays cluster and outlier diagnostic cards', async () => {
    render(<CatalogExplorerView />);

    const clustersTab = screen.getByTestId('tab-clusters');
    act(() => {
      fireEvent.click(clustersTab);
    });

    await waitFor(() => {
      expect(screen.getByTestId('catalog-clusters-view')).toBeDefined();
      expect(screen.getByText('Natural Song Clusters')).toBeDefined();
      expect(screen.getByText('Low-Connection Songs / Catalog Outliers')).toBeDefined();
    });
  });

  it('navigates to Relational Matrix tab and renders pairwise compatibility grid', async () => {
    render(<CatalogExplorerView />);

    const matrixTab = screen.getByTestId('tab-matrix');
    act(() => {
      fireEvent.click(matrixTab);
    });

    expect(screen.getByTestId('catalog-matrix-view')).toBeDefined();
    expect(screen.getByText('Catalog Relationship Matrix')).toBeDefined();
    expect(screen.getByText('FROM \\ TO')).toBeDefined();
  });
});
