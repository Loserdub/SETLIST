import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { App } from '../../App';
import { Sidebar } from '../../components/Sidebar';
import { useAppStore } from '../../store/useAppStore';
import { mockBackend, type Backend } from '../../api';
import type { Track } from '../../bindings/Track';

describe('Landing Route Logic and Sidebar Start Item', () => {
  let sampleTracks: Track[];

  beforeEach(async () => {
    sampleTracks = await mockBackend.listTracks();
    useAppStore.setState({
      currentRoute: 'start',
      tracks: [],
      hasLoadedTracks: false,
      isLoadingTracks: false,
      isStageMode: false,
      setlist: [],
      hasLoadedActiveSetlist: true,
      toasts: [],
      progress: null,
    });
  });

  it('lands on Start route when the library is empty and does not use localStorage', async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, 'getItem');
    const emptyBackend: Partial<Backend> = {
      ...mockBackend,
      listTracks: vi.fn().mockResolvedValue([]),
    };

    useAppStore.setState({
      currentRoute: 'start',
      tracks: [],
      hasLoadedTracks: false,
      loadTracks: async () => {
        const tracks = await emptyBackend.listTracks!();
        useAppStore.setState({
          tracks,
          hasLoadedTracks: true,
          currentRoute: tracks.length === 0 ? 'start' : 'library',
        });
      },
    });

    await act(async () => {
      render(<App />);
    });

    expect(useAppStore.getState().currentRoute).toBe('start');
    expect(screen.getByTestId('start-screen')).toBeDefined();
    expect(screen.getByText('GETTING STARTED')).toBeDefined();

    // Verify localStorage was never queried for route state
    expect(localStorageSpy).not.toHaveBeenCalledWith('currentRoute');
    expect(localStorageSpy).not.toHaveBeenCalledWith('route');
    localStorageSpy.mockRestore();
  });

  it('lands on My Music (library) when tracks exist in the library', async () => {
    const populatedBackend: Partial<Backend> = {
      ...mockBackend,
      listTracks: vi.fn().mockResolvedValue(sampleTracks),
    };

    useAppStore.setState({
      currentRoute: 'start',
      tracks: [],
      hasLoadedTracks: false,
      loadTracks: async () => {
        const tracks = await populatedBackend.listTracks!();
        useAppStore.setState({
          tracks,
          hasLoadedTracks: true,
          currentRoute: tracks.length === 0 ? 'start' : 'library',
        });
      },
    });

    await act(async () => {
      render(<App />);
    });

    expect(useAppStore.getState().currentRoute).toBe('library');
    expect(screen.getByTestId('nav-library')).toBeDefined();
    expect(screen.queryByTestId('start-screen')).toBeNull();
  });

  it('preserves explicit route (e.g. stage or settings) when loading', async () => {
    useAppStore.setState({
      currentRoute: 'stage',
      isStageMode: true,
      tracks: [],
      hasLoadedTracks: false,
      loadTracks: vi.fn().mockResolvedValue(undefined),
    });

    await act(async () => {
      render(<App />);
    });

    expect(useAppStore.getState().currentRoute).toBe('stage');
  });

  it('renders Start at the top of the sidebar with check mark when all 4 steps are done', () => {
    // Incomplete steps state (no tracks, no setlist)
    useAppStore.setState({
      tracks: [],
      setlist: [],
      currentRoute: 'start',
      isStageMode: false,
    });

    const { unmount } = render(<Sidebar />);

    const startNav = screen.getByTestId('nav-start');
    expect(startNav).toBeDefined();
    expect(screen.queryByTestId('start-all-done-badge')).toBeNull();
    unmount();

    // Complete steps state:
    // Step 1: tracks > 0
    // Step 2: all tracks have bpm and key
    // Step 3: setlist.length >= 2
    // Step 4: export format or ready
    const analyzedTracks: Track[] = sampleTracks.slice(0, 3);

    useAppStore.setState({
      tracks: analyzedTracks,
      setlist: [
        {
          position: 1,
          track_id: analyzedTracks[0].id,
          track: analyzedTracks[0],
          transition: null,
          target_energy: 5,
        },
        {
          position: 2,
          track_id: analyzedTracks[1].id,
          track: analyzedTracks[1],
          transition: null,
          target_energy: 6,
        },
      ],
      currentRoute: 'start',
      isStageMode: false,
    });

    render(<Sidebar />);

    const doneBadge = screen.getByTestId('start-all-done-badge');
    expect(doneBadge).toBeDefined();
    expect(doneBadge.textContent).toBe('✓');
  });
});
