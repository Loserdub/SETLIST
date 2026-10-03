import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { useAppStore } from './store/useAppStore';

describe('useAppStore', () => {
  it('updates state with ping response', async () => {
    const mockBackend = {
      ping: async () => 'pong',
      scanFolder: vi.fn(),
      listTracks: vi.fn(),
      getTrack: vi.fn(),
      suggestOrder: vi.fn(),
      getAdvice: vi.fn(),
      exportSet: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({
        cost_weights: { tempo: 0.3, key: 0.35, energy: 0.35, timbre: 0.0 },
        key_penalties: [],
        energy_model: { divisor: 16.0, target_step: 1.5 },
        worker_count: 4,
      }),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      subscribeProgress: vi.fn(() => () => {}),
      onProgress: vi.fn(() => () => {}),
    };

    await useAppStore.getState().fetchPing(mockBackend as unknown as import('./api').Backend);
    expect(useAppStore.getState().pingResult).toBe('pong');
    expect(useAppStore.getState().isLoading).toBe(false);
    expect(useAppStore.getState().error).toBeNull();
  });
});

describe('App layout and routing', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentRoute: 'library',
      tracks: [],
      selectedTrackId: null,
      selectedTrack: null,
      setlist: [],
      pingResult: null,
      isLoading: false,
      error: null,
    });
  });

  it('renders sidebar and navigates through all four routes', async () => {
    render(<App />);

    // Sidebar should be visible with app brand and all routes
    expect(screen.getByText(/SETLIST/)).toBeDefined();
    expect(screen.getByTestId('nav-library')).toBeDefined();
    expect(screen.getByTestId('nav-discovery')).toBeDefined();
    expect(screen.getByTestId('nav-track')).toBeDefined();
    expect(screen.getByTestId('nav-setlist')).toBeDefined();
    expect(screen.getByTestId('nav-settings')).toBeDefined();

    // Default route is Library
    expect(screen.getByText('Music Library')).toBeDefined();

    // Navigate to Discovery route
    act(() => {
      fireEvent.click(screen.getByTestId('nav-discovery'));
    });
    expect(useAppStore.getState().currentRoute).toBe('discovery');
    expect(screen.getByTestId('catalog-explorer-view')).toBeDefined();

    // Navigate to Track route
    act(() => {
      fireEvent.click(screen.getByTestId('nav-track'));
    });
    expect(useAppStore.getState().currentRoute).toBe('track');
    // Without a track selected, empty track state is rendered
    expect(screen.getByText('No Track Selected')).toBeDefined();

    // Navigate to Setlist route
    act(() => {
      fireEvent.click(screen.getByTestId('nav-setlist'));
    });
    expect(useAppStore.getState().currentRoute).toBe('setlist');
    expect(screen.getByText('Your Setlist is Empty')).toBeDefined();

    // Navigate to Settings route
    act(() => {
      fireEvent.click(screen.getByTestId('nav-settings'));
    });
    expect(useAppStore.getState().currentRoute).toBe('settings');
    expect(screen.getByText('Application Settings')).toBeDefined();
    expect(screen.getByTestId('ping-result')).toBeDefined();
  });

  it('displays pong result when ping succeeds on settings route', () => {
    useAppStore.setState({
      currentRoute: 'settings',
      pingResult: 'pong',
      isLoading: false,
      error: null,
    });

    render(<App />);
    expect(screen.getByTestId('ping-result').textContent).toBe('pong');
  });

  it('renders empty library state when no tracks are present and not loading', async () => {
    useAppStore.setState({
      currentRoute: 'library',
      tracks: [],
      isLoadingTracks: false,
      tracksError: null,
      // stub loadTracks to prevent auto-population in this specific test
      loadTracks: vi.fn(),
    });

    render(<App />);
    expect(screen.getByText('Your library is empty')).toBeDefined();
    expect(screen.getByRole('button', { name: /scan folder/i })).toBeDefined();
  });

  it('renders StageRoute and hides Sidebar when currentRoute is stage', () => {
    useAppStore.setState({
      currentRoute: 'stage',
      isStageMode: true,
      setlist: [],
    });

    render(<App />);
    expect(screen.getByTestId('stage-empty')).toBeDefined();
    expect(screen.queryByTestId('nav-library')).toBeNull();
  });
});

