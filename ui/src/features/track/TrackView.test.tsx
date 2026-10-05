import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TrackView } from './TrackView';
import { useAppStore } from '../../store/useAppStore';
import { useTrackState } from './useTrackState';
import { mockBackend } from '../../api';
import { mockPlaybackClient } from '../../api/playback';

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe('TrackView Component', () => {
  beforeEach(async () => {
    useTrackState.getState().resetView();
    mockPlaybackClient.reset();
    // Load mock tracks
    const tracks = await mockBackend.listTracks();
    act(() => {
      useAppStore.setState({
        tracks,
        selectedTrackId: tracks[0].id,
        selectedTrack: tracks[0],
        currentRoute: 'track',
      });
    });
  });

  afterEach(() => {
    mockPlaybackClient.reset();
  });

  it('renders empty placeholder when no track is selected', () => {
    act(() => {
      useAppStore.setState({ selectedTrack: null, selectedTrackId: null });
    });
    render(<TrackView />);

    expect(screen.getByText('No Track Selected')).toBeDefined();
    expect(screen.getByRole('button', { name: /Browse Library/i })).toBeDefined();
  });

  it('renders track title, artist, Camelot key, BPM, and energy rating', () => {
    render(<TrackView />);

    const track = useAppStore.getState().selectedTrack!;
    expect(screen.getByText(track.tags.title!)).toBeDefined();
    expect(screen.getByText(track.tags.artist!, { exact: true })).toBeDefined();

    // Check Camelot Key Badge
    const keyBadge = screen.getByTestId('track-key-badge');
    expect(keyBadge).toBeDefined();
    expect(keyBadge.textContent).toBe('1A');

    // Check BPM value
    const bpmVal = screen.getByTestId('track-bpm-value');
    expect(bpmVal).toBeDefined();
    expect(bpmVal.textContent).toBe('120.0');

    // Check Energy Rating
    const energyVal = screen.getByTestId('track-energy-value');
    expect(energyVal).toBeDefined();
    expect(energyVal.textContent).toContain('/10');
  });

  it('renders the 3-band waveform container with canvas and minimap', () => {
    render(<TrackView />);

    expect(screen.getByTestId('waveform-canvas-container')).toBeDefined();
    expect(screen.getByTestId('waveform-minimap')).toBeDefined();
    expect(screen.getAllByText(/Playhead/i).length).toBeGreaterThan(0);
  });

  it('renders PlaybackBar with transport controls, time readout, and click toggle', () => {
    render(<TrackView />);

    expect(screen.getByTestId('playback-bar')).toBeDefined();
    expect(screen.getByTestId('playback-play-pause-btn')).toBeDefined();
    expect(screen.getByTestId('playback-time-readout')).toBeDefined();
    expect(screen.getByTestId('playback-status-badge')).toBeDefined();
    expect(screen.getByTestId('playback-click-toggle')).toBeDefined();
    expect(screen.getByTestId('playback-jump-start-btn')).toBeDefined();
    expect(screen.getByTestId('playback-seek-back-5s')).toBeDefined();
    expect(screen.getByTestId('playback-seek-fwd-5s')).toBeDefined();
  });

  it('toggles play and pause on PlaybackBar button click', async () => {
    render(<TrackView />);

    const playPauseBtn = screen.getByTestId('playback-play-pause-btn');
    expect(playPauseBtn.textContent).toContain('PLAY');

    await act(async () => {
      fireEvent.click(playPauseBtn);
    });

    expect(mockPlaybackClient.getMockState().state).toBe('playing');
    expect(screen.getByTestId('playback-status-badge').textContent).toBe('playing');

    await act(async () => {
      fireEvent.click(playPauseBtn);
    });

    expect(mockPlaybackClient.getMockState().state).toBe('paused');
    expect(screen.getByTestId('playback-status-badge').textContent).toBe('paused');
  });

  it('toggles click track on click toggle button', async () => {
    render(<TrackView />);

    const clickBtn = screen.getByTestId('playback-click-toggle');
    expect(clickBtn.textContent).toContain('Click: OFF');

    await act(async () => {
      fireEvent.click(clickBtn);
    });

    expect(mockPlaybackClient.getMockState().clickEnabled).toBe(true);
    expect(screen.getByTestId('playback-click-toggle').textContent).toContain('Click: ON');
  });

  it('responds to keyboard Space to toggle play/pause and arrow keys to seek', async () => {
    render(<TrackView />);

    // Space -> Play
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    });
    expect(mockPlaybackClient.getMockState().state).toBe('playing');

    // Space -> Pause
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    });
    expect(mockPlaybackClient.getMockState().state).toBe('paused');

    // Reset position to 0 to test exact seek deltas
    await act(async () => {
      await mockPlaybackClient.seek(0);
      useTrackState.getState().setPlayheadPositionMs(0);
    });

    // ArrowRight -> seek +5000 ms
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(mockPlaybackClient.getMockState().positionMs).toBe(5000);

    // ArrowLeft -> seek -5000 ms
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    });
    expect(mockPlaybackClient.getMockState().positionMs).toBe(0);
  });

  it('renders all cue points (Registers A to H) with colors and labels', () => {
    render(<TrackView />);

    const cuesList = screen.getByTestId('cues-list');
    expect(cuesList).toBeDefined();

    // Cue flags A through H
    const cueLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (const letter of cueLetters) {
      expect(screen.getByTestId(`cue-card-${letter}`)).toBeDefined();
    }
  });

  it('clicking a cue card jumps playhead and scrolls waveform to cue time', async () => {
    render(<TrackView />);

    const cueA = screen.getByTestId('cue-card-A');
    await act(async () => {
      fireEvent.click(cueA);
    });

    const playheadMs = useTrackState.getState().playheadPositionMs;
    expect(playheadMs).toBe(120); // First downbeat in mock track is 120ms
    expect(mockPlaybackClient.getMockState().positionMs).toBe(120);
  });

  it('adjusts zoom level when clicking zoom in and zoom out buttons', () => {
    render(<TrackView />);

    const zoomInBtn = screen.getByTitle('Zoom In');
    fireEvent.click(zoomInBtn);

    expect(useTrackState.getState().zoomLevel).toBeGreaterThan(1.0);

    const zoomOutBtn = screen.getByTitle('Zoom Out');
    fireEvent.click(zoomOutBtn);

    expect(useTrackState.getState().zoomLevel).toBeCloseTo(1.0, 1);
  });

  it('renders structural segments and jumps to segment when clicked', async () => {
    render(<TrackView />);

    const introElements = screen.getAllByText(/intro/i);
    expect(introElements.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/buildup/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/drop/i).length).toBeGreaterThan(0);

    // Click first intro element
    await act(async () => {
      fireEvent.click(introElements[0]);
    });

    expect(useTrackState.getState().playheadPositionMs).toBe(0);
    expect(mockPlaybackClient.getMockState().positionMs).toBe(0);
  });

  it('renders speed controls on PlaybackBar and changes speed on preset click', async () => {
    render(<TrackView />);

    expect(screen.getByTestId('playback-speed-controls')).toBeDefined();
    const btn15 = screen.getByTestId('playback-speed-1.5');
    expect(btn15).toBeDefined();

    await act(async () => {
      fireEvent.click(btn15);
    });

    expect(mockPlaybackClient.getMockState().speed).toBe(1.5);
  });

  it('steps playback speed up and down using bracket keys [ and ]', async () => {
    render(<TrackView />);

    // Initial speed 1.0 -> press ] -> steps to 1.25
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ']' }));
    });
    expect(mockPlaybackClient.getMockState().speed).toBe(1.25);

    // Press [ -> steps back down to 1.0
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '[' }));
    });
    expect(mockPlaybackClient.getMockState().speed).toBe(1.0);
  });

  it('toggles playback from quick transport button in waveform header', async () => {
    render(<TrackView />);

    const quickBtn = screen.getByTestId('waveform-quick-play-pause-btn');
    expect(quickBtn.textContent).toContain('PLAY');

    await act(async () => {
      fireEvent.click(quickBtn);
    });
    expect(mockPlaybackClient.getMockState().state).toBe('playing');
    expect(quickBtn.textContent).toContain('PAUSE');

    await act(async () => {
      fireEvent.click(quickBtn);
    });
    expect(mockPlaybackClient.getMockState().state).toBe('paused');
    expect(quickBtn.textContent).toContain('PLAY');
  });

  it('responds to number key 1 to jump to Cue A', async () => {
    render(<TrackView />);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    });

    const playheadMs = useTrackState.getState().playheadPositionMs;
    expect(playheadMs).toBe(120);
    expect(mockPlaybackClient.getMockState().positionMs).toBe(120);
  });

  it('displays Teenage Engineering hover tooltip and lingers on mouse leave', async () => {
    render(<TrackView />);

    const canvasContainer = screen.getByTestId('waveform-canvas-container');
    await act(async () => {
      fireEvent.mouseMove(canvasContainer, { clientX: 200, clientY: 50 });
    });

    const tooltip = screen.getByTestId('waveform-te-tooltip');
    expect(tooltip).toBeDefined();

    // Mouse leave: tooltip should still be present with HOLD 2S linger
    await act(async () => {
      fireEvent.mouseLeave(canvasContainer);
    });

    expect(screen.getByTestId('waveform-te-tooltip')).toBeDefined();
    expect(screen.getByText(/HOLD 2S/i)).toBeDefined();
  });

  it('stops playback when unmounting component', async () => {
    const { unmount } = render(<TrackView />);

    await act(async () => {
      await mockPlaybackClient.play();
    });
    expect(mockPlaybackClient.getMockState().state).toBe('playing');

    act(() => {
      unmount();
    });

    expect(mockPlaybackClient.getMockState().state).toBe('stopped');
  });

  it('allows in-app editing of track title and artist, saving overrides, and resetting', async () => {
    render(<TrackView />);

    const editBtn = screen.getByTestId('edit-track-metadata-btn');
    expect(editBtn).toBeDefined();

    // Click edit info
    await act(async () => {
      fireEvent.click(editBtn);
    });

    const titleInput = screen.getByTestId('edit-title-input') as HTMLInputElement;
    const artistInput = screen.getByTestId('edit-artist-input') as HTMLInputElement;
    expect(titleInput).toBeDefined();
    expect(artistInput).toBeDefined();

    // Edit title and artist
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Club Mix 2026' } });
      fireEvent.change(artistInput, { target: { value: 'Daft Punk & Friends' } });
    });

    // Save
    const saveBtn = screen.getByTestId('save-metadata-btn');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Verify updated title and custom badge
    expect(screen.getByText('Club Mix 2026')).toBeDefined();
    expect(screen.getByText('Custom Title')).toBeDefined();
    expect(screen.getByText('Daft Punk & Friends')).toBeDefined();
    expect(screen.getByText('Custom Artist')).toBeDefined();

    // Re-open and reset to default
    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-track-metadata-btn'));
    });

    const resetBtn = screen.getByRole('button', { name: /Reset to Default/i });
    await act(async () => {
      fireEvent.click(resetBtn);
    });

    // Verify original title restored
    expect(screen.getByText('One More Time')).toBeDefined();
    expect(screen.queryByText('Custom Title')).toBeNull();
  });
});
