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
      isStageMode: false,
      tracks: [],
      selectedTrackId: null,
      selectedTrack: null,
      setlist: [],
      pingResult: null,
      isLoading: false,
      error: null,
    });
  });

  it('renders sidebar and navigates through all routes', async () => {
    render(<App />);

    // Sidebar should be visible with app brand, tagline, and all routes
    expect(screen.getByText(/SETLIST/)).toBeDefined();
    expect(screen.getByText('DJ set prep')).toBeDefined();

    // Plain navigation labels
    expect(screen.getByTestId('nav-library')).toBeDefined();
    expect(screen.getByText('My Music')).toBeDefined();
    expect(screen.getByTestId('nav-library').getAttribute('title')).toBe(
      'Browse and search your music library'
    );
    expect(screen.getByTestId('nav-library').getAttribute('aria-label')).toBe(
      'My Music - Browse and search your music library'
    );

    expect(screen.getByTestId('nav-discovery')).toBeDefined();
    expect(screen.getByText('Find Transitions')).toBeDefined();
    expect(screen.getByTestId('nav-discovery').getAttribute('title')).toBe(
      'Discover harmonic transitions, bridges, and mix paths'
    );

    expect(screen.getByTestId('nav-track')).toBeDefined();
    expect(screen.getByText('Track Detail')).toBeDefined();

    expect(screen.getByTestId('nav-setlist')).toBeDefined();
    expect(screen.getByText('My Set')).toBeDefined();
    expect(screen.getByTestId('nav-setlist').getAttribute('title')).toBe(
      'Build, reorder, and optimize your active setlist'
    );

    expect(screen.getByTestId('nav-settings')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();

    // Default route is Library
    expect(screen.getByText('Music Library')).toBeDefined();

    // Navigate to Discovery route
    act(() => {
      fireEvent.click(screen.getByTestId('nav-discovery'));
    });
    expect(useAppStore.getState().currentRoute).toBe('discovery');
    expect(screen.getByTestId('catalog-explorer-view')).toBeDefined();

    // Track Detail is disabled when no track is selected
    const trackNavBtn = screen.getByTestId('nav-track') as HTMLButtonElement;
    expect(trackNavBtn.disabled).toBe(true);
    expect(trackNavBtn.getAttribute('title')).toBe('Open a track from My Music');
    expect(trackNavBtn.getAttribute('aria-label')).toBe(
      'Track Detail - Open a track from My Music'
    );

    // Attempting to click disabled Track Detail does not navigate
    act(() => {
      fireEvent.click(trackNavBtn);
    });
    expect(useAppStore.getState().currentRoute).toBe('discovery');

    // Selecting a track enables Track Detail navigation
    act(() => {
      useAppStore.setState({
        selectedTrackId: 'track-1',
        selectedTrack: {
          id: 'track-1',
          path: '/path/test.mp3',
          hash: 'test-hash',
          tags: {
            title: 'Test Track',
            artist: 'Test Artist',
            album: null,
            genre: null,
            year: null,
            track_number: null,
            bpm: 120,
            key: '8A',
            gain_db: null,
          },
          duration_ms: 180000,
          analysis: null,
          analyzed_at: null,
          analysis_version: null,
        } as unknown as import('./bindings/Track').Track,
      });
    });
    expect(trackNavBtn.disabled).toBe(false);
    expect(trackNavBtn.getAttribute('title')).toBe(
      'Inspect beat grid, cues, and waveform for the selected track'
    );

    // Navigate to Track route now that a track is selected
    act(() => {
      fireEvent.click(trackNavBtn);
    });
    expect(useAppStore.getState().currentRoute).toBe('track');

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

  it('renders TRUSTNODELOGIC software label and intellectual property notices', () => {
    render(<App />);

    // Brand label present
    const brandLabels = screen.getAllByText('TRUSTNODELOGIC');
    expect(brandLabels.length).toBeGreaterThanOrEqual(1);

    // Intellectual property / copyright notice present
    expect(screen.getByText(/© 2026 TRUSTNODELOGIC/)).toBeDefined();
    expect(screen.getByLabelText('Software Intellectual Property')).toBeDefined();
  });

  it('hides mock switch in native Tauri environment and forces useMockBackend to false', () => {
    // Simulate Tauri environment window
    const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
    const originalInternals = win.__TAURI_INTERNALS__;
    win.__TAURI_INTERNALS__ = {};
    useAppStore.setState({ useMockBackend: true });

    render(<App />);

    // Inside Tauri, useMockBackend is forced to false and switch is hidden
    expect(useAppStore.getState().useMockBackend).toBe(false);
    expect(screen.queryByText('Mock Engine')).toBeNull();
    expect(screen.queryByText('[Switch]')).toBeNull();

    // Clean up
    delete win.__TAURI_INTERNALS__;
    if (originalInternals !== undefined) {
      win.__TAURI_INTERNALS__ = originalInternals;
    }
  });

  it('shows mock switch when outside Tauri environment', () => {
    // In standard test environment, window.__TAURI_INTERNALS__ is undefined
    const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
    delete win.__TAURI_INTERNALS__;
    useAppStore.setState({ useMockBackend: false });

    render(<App />);

    expect(screen.getByText('Tauri Native')).toBeDefined();
    expect(screen.getByText('[Switch]')).toBeDefined();
  });

  it('shows mock switch when VITE_SHOW_DEV_TOOLS is set even in Tauri environment', () => {
    const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
    const originalInternals = win.__TAURI_INTERNALS__;
    win.__TAURI_INTERNALS__ = {};
    const originalEnv = import.meta.env.VITE_SHOW_DEV_TOOLS;
    import.meta.env.VITE_SHOW_DEV_TOOLS = 'true';

    render(<App />);

    expect(screen.getByText('Tauri Native')).toBeDefined();
    expect(screen.getByText('[Switch]')).toBeDefined();

    delete win.__TAURI_INTERNALS__;
    if (originalInternals !== undefined) {
      win.__TAURI_INTERNALS__ = originalInternals;
    }
    if (originalEnv !== undefined) {
      import.meta.env.VITE_SHOW_DEV_TOOLS = originalEnv;
    } else {
      delete (import.meta.env as Record<string, unknown>).VITE_SHOW_DEV_TOOLS;
    }
  });
});


