import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LibraryView } from './LibraryView';
import { useAppStore } from '../../store/useAppStore';
import { generateMockTracks } from './mock5000';

describe('LibraryView Component', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentRoute: 'library',
      tracks: generateMockTracks(20),
      selectedTrackId: null,
      selectedTrack: null,
      setlist: [],
      isLoadingTracks: false,
      tracksError: null,
      progress: null,
    });
  });

  it('renders table headers and column metadata', () => {
    render(<LibraryView />);

    expect(screen.getByText('Music Library')).toBeDefined();
    expect(screen.getByText('Title')).toBeDefined();
    expect(screen.getByText('Artist')).toBeDefined();
    expect(screen.getByText('BPM')).toBeDefined();
    expect(screen.getByText('Key')).toBeDefined();
    expect(screen.getByText('Energy')).toBeDefined();
    expect(screen.getByText('LUFS')).toBeDefined();
    expect(screen.getByText('Duration')).toBeDefined();
  });

  it('clicks a row to select track and open Track route', () => {
    render(<LibraryView />);

    const rows = screen.getAllByRole('row');
    // First row is the header, second row is the first data track
    const firstDataRow = rows[1];
    expect(firstDataRow).toBeDefined();

    act(() => {
      fireEvent.click(firstDataRow);
    });

    const state = useAppStore.getState();
    expect(state.currentRoute).toBe('track');
    expect(state.selectedTrackId).toBe('mock-track-1');
  });

  it('multi-selects tracks and adds them in batch to the active setlist', async () => {
    render(<LibraryView />);

    const checkboxes = screen.getAllByRole('checkbox');
    // Index 0 is the "select all" checkbox
    // Index 1 is track 1, Index 2 is track 2
    act(() => {
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
    });

    expect(screen.getByText('2 selected')).toBeDefined();
    const batchButton = screen.getByText('Add to Setlist');
    expect(batchButton).toBeDefined();

    await act(async () => {
      fireEvent.click(batchButton);
    });

    const setlist = useAppStore.getState().setlist;
    expect(setlist).toHaveLength(2);
    expect(setlist[0].track_id).toBe('mock-track-1');
    expect(setlist[1].track_id).toBe('mock-track-2');
  });

  it('filters tracks by search query', () => {
    render(<LibraryView />);

    const searchInput = screen.getByPlaceholderText(/search title, artist/i);
    act(() => {
      fireEvent.change(searchInput, { target: { value: '#1' } });
    });

    // Reset filters button should appear when filter is active
    expect(screen.getByText('Reset Filters')).toBeDefined();
  });

  it('toggles 5,000 mock tracks benchmark mode smoothly', () => {
    render(<LibraryView />);

    const benchmarkBtn = screen.getByText('Load 5K Mock Tracks');
    act(() => {
      fireEvent.click(benchmarkBtn);
    });

    expect(screen.getByText(/5,000 Tracks Benchmark/i)).toBeDefined();
    expect(screen.getByText('Exit 5K Benchmark')).toBeDefined();

    // Toggle off
    act(() => {
      fireEvent.click(screen.getByText('Exit 5K Benchmark'));
    });
    expect(screen.getByText('Load 5K Mock Tracks')).toBeDefined();
  });

  it('renders progress bar when backend background task is active', () => {
    useAppStore.setState({
      progress: {
        stage: 'scanning',
        current: 15,
        total: 50,
        message: 'Analyzing audio files...',
      },
    });

    render(<LibraryView />);
    expect(screen.getByText(/scanning\.\.\./i)).toBeDefined();
    expect(screen.getByText(/15 \/ 50/i)).toBeDefined();
    expect(screen.getByText('Analyzing audio files...')).toBeDefined();
  });
});
