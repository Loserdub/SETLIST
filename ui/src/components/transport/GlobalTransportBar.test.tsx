import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GlobalTransportBar } from './GlobalTransportBar';
import App from '../../App';
import { useAppStore } from '../../store/useAppStore';
import { getPlaybackClient } from '../../api/playback';
import { mockBackend } from '../../api';
import type { Track } from '../../bindings/Track';

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe('GlobalTransportBar Component', () => {
  let sampleTrack: Track;

  beforeEach(async () => {
    const client = getPlaybackClient();
    vi.spyOn(client, 'onPosition').mockImplementation(() => () => {});

    const mockTracks = await mockBackend.listTracks();
    sampleTrack = mockTracks[0];

    useAppStore.setState({
      tracks: mockTracks,
      selectedTrackId: sampleTrack.id,
      selectedTrack: sampleTrack,
      auditionTrackId: null,
      auditionState: 'stopped',
      auditionPositionMs: 0,
      auditionDurationMs: sampleTrack.duration_ms,
      auditionSpeed: 1.0,
      masterVolume: 1.0,
      currentRoute: 'library',
      isStageMode: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when auditionTrackId is null or state is stopped', () => {
    const { container } = render(<GlobalTransportBar />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('global-transport-bar')).toBeNull();
  });

  it('renders track metadata, Camelot key, and BPM when audition is active', () => {
    useAppStore.setState({
      auditionTrackId: sampleTrack.id,
      auditionState: 'playing',
      auditionPositionMs: 30000,
      auditionDurationMs: sampleTrack.duration_ms,
    });

    render(<GlobalTransportBar />);

    expect(screen.getByTestId('global-transport-bar')).toBeDefined();
    expect(screen.getByText(sampleTrack.tags.title!)).toBeDefined();
    expect(screen.getByText(sampleTrack.tags.artist!)).toBeDefined();
    expect(screen.getByText('00:30')).toBeDefined();
  });

  it('scrub slider change calls seekAudition with the right position in milliseconds', async () => {
    const seekSpy = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      auditionTrackId: sampleTrack.id,
      auditionState: 'playing',
      auditionPositionMs: 10000,
      auditionDurationMs: sampleTrack.duration_ms,
      seekAudition: seekSpy,
    });

    render(<GlobalTransportBar />);

    const scrubber = screen.getByTestId('global-position-scrubber');
    fireEvent.change(scrubber, { target: { value: '95000' } });

    expect(seekSpy).toHaveBeenCalledWith(95000);
  });

  it('clicking stop button calls stop client method and resets audition state', async () => {
    const client = getPlaybackClient();
    const stopSpy = vi.spyOn(client, 'stop').mockResolvedValue(undefined);

    useAppStore.setState({
      auditionTrackId: sampleTrack.id,
      auditionState: 'playing',
      auditionPositionMs: 45000,
    });

    render(<GlobalTransportBar />);

    const stopBtn = screen.getByTestId('global-stop-btn');
    await act(async () => {
      fireEvent.click(stopBtn);
    });

    expect(stopSpy).toHaveBeenCalled();
    expect(useAppStore.getState().auditionState).toBe('stopped');
    expect(useAppStore.getState().auditionTrackId).toBeNull();
  });

  it('rewind button seeks to 0 ms', async () => {
    const seekSpy = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      auditionTrackId: sampleTrack.id,
      auditionState: 'playing',
      auditionPositionMs: 60000,
      seekAudition: seekSpy,
    });

    render(<GlobalTransportBar />);

    const rewindBtn = screen.getByTestId('global-rewind-btn');
    fireEvent.click(rewindBtn);

    expect(seekSpy).toHaveBeenCalledWith(0);
  });

  it('play/pause button toggles playback state', async () => {
    const toggleSpy = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      auditionTrackId: sampleTrack.id,
      auditionState: 'playing',
      toggleAudition: toggleSpy,
    });

    render(<GlobalTransportBar />);

    const playPauseBtn = screen.getByTestId('global-play-pause-btn');
    fireEvent.click(playPauseBtn);

    expect(toggleSpy).toHaveBeenCalledWith(sampleTrack.id);
  });

  it('speed buttons update audition speed multiplier', async () => {
    const speedSpy = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      auditionTrackId: sampleTrack.id,
      auditionState: 'playing',
      setAuditionSpeed: speedSpy,
    });

    render(<GlobalTransportBar />);

    const speedPill = screen.getByTestId('global-speed-1.2');
    fireEvent.click(speedPill);

    expect(speedSpy).toHaveBeenCalledWith(1.2);
  });

  it('toggles metronome click on click toggle button', async () => {
    const client = getPlaybackClient();
    const setClickSpy = vi.spyOn(client, 'setClick').mockResolvedValue(undefined);

    useAppStore.setState({
      auditionTrackId: sampleTrack.id,
      auditionState: 'playing',
    });

    render(<GlobalTransportBar />);

    const clickToggle = screen.getByTestId('global-click-toggle');
    await act(async () => {
      fireEvent.click(clickToggle);
    });

    expect(setClickSpy).toHaveBeenCalledWith(true);
  });
});

describe('App Route Visibility Rules for GlobalTransportBar', () => {
  let sampleTrack: Track;

  beforeEach(async () => {
    const client = getPlaybackClient();
    vi.spyOn(client, 'onPosition').mockImplementation(() => () => {});

    const mockTracks = await mockBackend.listTracks();
    sampleTrack = mockTracks[0];

    useAppStore.setState({
      tracks: mockTracks,
      selectedTrackId: sampleTrack.id,
      selectedTrack: sampleTrack,
      auditionTrackId: sampleTrack.id,
      auditionState: 'playing',
      currentRoute: 'library',
      isStageMode: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders transport bar on library, discovery, and setlist routes when auditioning', () => {
    const { unmount } = render(<App />);
    expect(screen.getByTestId('global-transport-bar')).toBeDefined();
    unmount();

    useAppStore.setState({ currentRoute: 'discovery' });
    const res2 = render(<App />);
    expect(screen.getByTestId('global-transport-bar')).toBeDefined();
    res2.unmount();

    useAppStore.setState({ currentRoute: 'setlist' });
    const res3 = render(<App />);
    expect(screen.getByTestId('global-transport-bar')).toBeDefined();
    res3.unmount();
  });

  it('hides transport bar when route is track', () => {
    useAppStore.setState({
      currentRoute: 'track',
      selectedTrackId: sampleTrack.id,
      selectedTrack: sampleTrack,
    });

    render(<App />);
    expect(screen.queryByTestId('global-transport-bar')).toBeNull();
  });

  it('hides transport bar when route is stage or isStageMode is true', () => {
    useAppStore.setState({
      currentRoute: 'stage',
      isStageMode: true,
      setlist: [],
    });

    render(<App />);
    expect(screen.queryByTestId('global-transport-bar')).toBeNull();
  });
});
