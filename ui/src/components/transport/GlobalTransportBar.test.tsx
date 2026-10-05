import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalTransportBar } from './GlobalTransportBar';
import { useAppStore } from '../../store/useAppStore';
import { mockBackend } from '../../api';
import type { Track } from '../../bindings/Track';

describe('GlobalTransportBar Component (Persistent Audition Transport)', () => {
  let mockTrack: Track;

  beforeEach(async () => {
    const tracks = await mockBackend.listTracks();
    mockTrack = tracks[0];

    await useAppStore.getState().stopAudition();

    useAppStore.setState({
      tracks: [mockTrack],
      auditionTrackId: null,
      auditionState: 'stopped',
      auditionPositionMs: 0,
      auditionDurationMs: 180000,
      auditionSpeed: 1.0,
      currentRoute: 'library',
      selectedTrackId: null,
    });
  });

  it('renders nothing when no track is currently auditioning', () => {
    const { container } = render(<GlobalTransportBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders metadata and controls when auditionTrackId is active', async () => {
    await useAppStore.getState().toggleAudition(mockTrack.id);

    render(<GlobalTransportBar />);

    expect(screen.getByTestId('global-transport-bar')).toBeDefined();
    expect(screen.getByText(mockTrack.tags.title ?? '')).toBeDefined();
    expect(screen.getByText(mockTrack.tags.artist ?? '')).toBeDefined();
    expect(screen.getByTitle(/Pause audition/i)).toBeDefined();
  });

  it('toggles audition playback when clicking play/pause button', async () => {
    await useAppStore.getState().toggleAudition(mockTrack.id);

    render(<GlobalTransportBar />);

    const playPauseBtn = screen.getByTestId('global-play-pause-btn');
    fireEvent.click(playPauseBtn);

    await waitFor(() => {
      expect(useAppStore.getState().auditionState).toBe('paused');
    });

    fireEvent.click(playPauseBtn);
    await waitFor(() => {
      expect(useAppStore.getState().auditionState).toBe('playing');
    });
  });

  it('changes playback speed when clicking speed buttons', async () => {
    await useAppStore.getState().toggleAudition(mockTrack.id);

    render(<GlobalTransportBar />);

    const speed125Btn = screen.getByRole('button', { name: '1.25x' });
    fireEvent.click(speed125Btn);

    await waitFor(() => {
      expect(useAppStore.getState().auditionSpeed).toBe(1.25);
    });
  });

  it('navigates to track view when clicking Inspect Track button', async () => {
    await useAppStore.getState().toggleAudition(mockTrack.id);

    render(<GlobalTransportBar />);

    const inspectBtn = screen.getByTestId('global-inspect-btn');
    fireEvent.click(inspectBtn);

    expect(useAppStore.getState().currentRoute).toBe('track');
    expect(useAppStore.getState().selectedTrackId).toBe(mockTrack.id);
  });

  it('stops audition and closes transport bar when clicking Stop button', async () => {
    await useAppStore.getState().toggleAudition(mockTrack.id);

    const { rerender } = render(<GlobalTransportBar />);
    expect(screen.getByTestId('global-transport-bar')).toBeDefined();

    const stopBtn = screen.getByTestId('global-stop-btn');
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(useAppStore.getState().auditionTrackId).toBeNull();
      expect(useAppStore.getState().auditionState).toBe('stopped');
    });

    rerender(<GlobalTransportBar />);
    expect(screen.queryByTestId('global-transport-bar')).toBeNull();
  });
});
