import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LibraryView } from './LibraryView';
import { openLibraryWithReviewFilter } from './navigation';
import { useAppStore } from '../../store/useAppStore';
import { generateMockTracks } from './mock5000';
import { mockPlaybackClient } from '../../api/playback';

describe('LibraryView Component', () => {
  beforeEach(() => {
    mockPlaybackClient.reset();
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

  afterEach(() => {
    mockPlaybackClient.reset();
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
    expect(screen.getAllByText(/scanning\.\.\./i)[0]).toBeDefined();
    expect(screen.getByText(/15 \/ 50/i)).toBeDefined();
    expect(screen.getByText('Analyzing audio files...')).toBeDefined();
  });

  it('navigates table rows with ArrowDown and ArrowUp keys', () => {
    render(<LibraryView />);

    const container = screen.getByTestId('virtual-table-container');
    const rows = screen.getAllByRole('row');
    // rows[0] is the thead row. rows[1] is track index 0, rows[2] is track index 1
    const firstTrackRow = rows[1];
    const secondTrackRow = rows[2];

    expect(firstTrackRow.getAttribute('aria-selected')).toBe('false');

    // Press ArrowDown to focus first track
    act(() => {
      fireEvent.keyDown(container, { key: 'ArrowDown' });
    });
    expect(firstTrackRow.getAttribute('aria-selected')).toBe('true');
    expect(secondTrackRow.getAttribute('aria-selected')).toBe('false');

    // Press ArrowDown again to focus second track
    act(() => {
      fireEvent.keyDown(container, { key: 'ArrowDown' });
    });
    expect(firstTrackRow.getAttribute('aria-selected')).toBe('false');
    expect(secondTrackRow.getAttribute('aria-selected')).toBe('true');

    // Press ArrowUp to return to first track
    act(() => {
      fireEvent.keyDown(container, { key: 'ArrowUp' });
    });
    expect(firstTrackRow.getAttribute('aria-selected')).toBe('true');
    expect(secondTrackRow.getAttribute('aria-selected')).toBe('false');
  });

  it('triggers track audition on Space key and adds to setlist on Enter key', async () => {
    render(<LibraryView />);

    const container = screen.getByTestId('virtual-table-container');

    // Focus first track (mock-track-1)
    act(() => {
      fireEvent.keyDown(container, { key: 'ArrowDown' });
    });

    // Press Space to toggle audition
    await act(async () => {
      fireEvent.keyDown(container, { key: ' ', code: 'Space' });
    });

    // Audition bar should now be visible or the audition button should indicate active state
    expect(screen.getByText(/Auditioning/i)).toBeDefined();

    // Move to second track (mock-track-2)
    act(() => {
      fireEvent.keyDown(container, { key: 'ArrowDown' });
    });

    // Press Enter to add mock-track-2 to setlist
    await act(async () => {
      fireEvent.keyDown(container, { key: 'Enter' });
    });

    const setlist = useAppStore.getState().setlist;
    expect(setlist.some((item) => item.track_id === 'mock-track-2')).toBe(true);
    act(() => {
      mockPlaybackClient.reset();
    });
  });

  it('does not trigger table keyboard shortcuts when typing in search input', () => {
    render(<LibraryView />);

    const searchInput = screen.getByPlaceholderText(/search title, artist/i);
    const rows = screen.getAllByRole('row');
    const firstTrackRow = rows[1];

    // Dispatch ArrowDown or Space directly on search input
    act(() => {
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      fireEvent.keyDown(searchInput, { key: ' ', code: 'Space' });
    });

    // No row should be selected
    expect(firstTrackRow.getAttribute('aria-selected')).toBe('false');
  });

  it('renders count line above table: "N tracks, M in your set"', () => {
    render(<LibraryView />);

    const countLine = screen.getByTestId('library-count-line');
    expect(countLine).toBeDefined();
    expect(countLine.textContent).toContain('20 tracks, 0 in your set');

    // Add a track to setlist
    act(() => {
      useAppStore.setState({
        setlist: [
          {
            position: 1,
            track_id: 'mock-track-1',
            track: null,
            transition: null,
            target_energy: 5,
          },
        ],
      });
    });

    expect(countLine.textContent).toContain('20 tracks, 1 in your set');
  });

  it('opens and closes the metadata legend popover explaining BPM, Key, Energy, and LUFS', () => {
    render(<LibraryView />);

    // Legend should be closed initially
    expect(screen.queryByTestId('legend-popover')).toBeNull();

    const legendBtn = screen.getByTestId('legend-button');
    expect(legendBtn).toBeDefined();

    // Click to open legend
    act(() => {
      fireEvent.click(legendBtn);
    });

    const popover = screen.getByTestId('legend-popover');
    expect(popover).toBeDefined();
    expect(popover.textContent).toContain('BPM:');
    expect(popover.textContent).toContain('Key (Camelot):');
    expect(popover.textContent).toContain('Energy (1 to 10):');
    expect(popover.textContent).toContain('LUFS:');

    // Press Escape to close
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByTestId('legend-popover')).toBeNull();
  });

  it('renders the redesigned empty state with 3 short lines, large Choose Folder button, and SETLIST branding', () => {
    useAppStore.setState({
      tracks: [],
      hasLoadedTracks: true,
      isLoadingTracks: false,
    });

    render(<LibraryView />);

    expect(screen.getByText('Your library is empty')).toBeDefined();
    expect(screen.getByText('SETLIST is your local-first DJ set preparation co-pilot.')).toBeDefined();
    expect(screen.getByText('Your audio files are strictly read-only and never modified.')).toBeDefined();
    expect(screen.getByText('Scan a music folder to analyze tempo, Camelot keys, and energy.')).toBeDefined();
    expect(screen.queryByText(/DJ Set Assistant/i)).toBeNull();

    // Large Choose Folder button
    const largeChooseBtn = screen.getByTestId('empty-choose-folder-btn');
    expect(largeChooseBtn).toBeDefined();
    expect(largeChooseBtn.textContent).toContain('Choose Folder');
  });

  it('provides row actions for Preview, Open detail, and Add to set', async () => {
    render(<LibraryView />);

    const firstTrackId = 'mock-track-1';
    const previewBtn = screen.getByTestId(`preview-btn-${firstTrackId}`);
    const detailBtn = screen.getByTestId(`detail-btn-${firstTrackId}`);
    const addBtn = screen.getByTestId(`add-to-set-btn-${firstTrackId}`);

    expect(previewBtn).toBeDefined();
    expect(detailBtn).toBeDefined();
    expect(addBtn).toBeDefined();

    // Click detail button -> navigates to track route
    act(() => {
      fireEvent.click(detailBtn);
    });
    expect(useAppStore.getState().currentRoute).toBe('track');
    expect(useAppStore.getState().selectedTrackId).toBe(firstTrackId);

    // Click add to set button -> adds track to setlist
    await act(async () => {
      fireEvent.click(addBtn);
    });
    const setlist = useAppStore.getState().setlist;
    expect(setlist.some((item) => item.track_id === firstTrackId)).toBe(true);
  });

  it('toggles Needs review chip and displays Edited badge on user-edited tracks', () => {
    const mockTracks = generateMockTracks(5);
    // Track 0: healthy
    // Track 1: needs review (missing bpm)
    mockTracks[1].analysis!.rhythm.grid.bpm = 0;
    // Track 2: user edited (title override)

    useAppStore.setState({
      tracks: mockTracks,
      trackTitleOverrides: { [mockTracks[2].id]: 'Custom Super Title' },
    });

    render(<LibraryView />);

    // Chip toggle displays correct count
    const reviewToggle = screen.getByTestId('needs-review-toggle');
    expect(reviewToggle.textContent).toContain('Needs review (1)');

    // Edited badge is displayed on track 2
    const editedBadges = screen.getAllByText('EDITED');
    expect(editedBadges.length).toBeGreaterThan(0);

    // Toggle Needs review filter
    act(() => {
      fireEvent.click(reviewToggle);
    });

    expect(reviewToggle.getAttribute('aria-pressed')).toBe('true');
    // Only track 1 should be visible now
    const rows = screen.getAllByRole('row');
    // Row 0 is header, Row 1 is data
    expect(rows.length).toBe(2);
  });

  it('openLibraryWithReviewFilter activates review filter and navigates to library', () => {
    useAppStore.setState({
      currentRoute: 'discovery',
      tracks: generateMockTracks(5),
    });

    act(() => {
      openLibraryWithReviewFilter();
    });

    expect(useAppStore.getState().currentRoute).toBe('library');

    render(<LibraryView />);
    const reviewToggle = screen.getByTestId('needs-review-toggle');
    expect(reviewToggle.getAttribute('aria-pressed')).toBe('true');
  });
});

