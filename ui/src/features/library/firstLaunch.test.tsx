import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LibraryView } from './LibraryView';
import { useAppStore } from '../../store/useAppStore';

describe('LibraryView First Launch and Loading States', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentRoute: 'library',
      tracks: [],
      selectedTrackId: null,
      selectedTrack: null,
      setlist: [],
      isLoadingTracks: false,
      hasLoadedTracks: true,
      tracksError: null,
      progress: null,
      toasts: [],
      useMockBackend: false,
    });
  });

  it('renders rich first-launch onboarding empty state', () => {
    render(<LibraryView />);

    expect(screen.getByText('Your library is empty')).toBeDefined();
    expect(screen.getByRole('button', { name: /scan folder/i })).toBeDefined();
    expect(screen.getByLabelText('Music folder path')).toBeDefined();
    expect(screen.getByText('Load Demo Library (40 Tracks)')).toBeDefined();
    expect(screen.getByText('Local & Read-Only')).toBeDefined();
    expect(screen.getByText('Pure Rust DSP')).toBeDefined();
    expect(screen.getByText('Hardware Ready')).toBeDefined();
  });

  it('renders loading state when isLoadingTracks is true on empty library', () => {
    useAppStore.setState({
      isLoadingTracks: true,
      tracks: [],
      progress: {
        stage: 'scanning',
        current: 5,
        total: 20,
        message: 'Reading metadata...',
      },
    });

    render(<LibraryView />);

    expect(screen.getByTestId('library-loading')).toBeDefined();
    expect(screen.getByText(/SCANNING: Reading metadata\.\.\./i)).toBeDefined();
    expect(screen.getByText(/Connecting to local SQLite database/i)).toBeDefined();
  });

  it('triggers scanFolder when clicking Scan Folder button', async () => {
    const scanFolderMock = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      scanFolder: scanFolderMock,
    });

    render(<LibraryView />);

    const folderInput = screen.getByLabelText('Music folder path');
    act(() => {
      fireEvent.change(folderInput, { target: { value: 'D:/DJ_Music' } });
    });

    const scanBtn = screen.getByRole('button', { name: /scan folder/i });
    await act(async () => {
      fireEvent.click(scanBtn);
    });

    expect(scanFolderMock).toHaveBeenCalledWith('D:/DJ_Music');
  });

  it('triggers demo library mode when clicking Load Demo Library button', async () => {
    const loadTracksMock = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      loadTracks: loadTracksMock,
      useMockBackend: false,
    });

    render(<LibraryView />);

    const demoBtn = screen.getByText('Load Demo Library (40 Tracks)');
    await act(async () => {
      fireEvent.click(demoBtn);
    });

    expect(useAppStore.getState().useMockBackend).toBe(true);
    expect(loadTracksMock).toHaveBeenCalled();
  });
});
