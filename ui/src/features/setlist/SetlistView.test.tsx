import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SetlistView } from './SetlistView';
import { useAppStore } from '../../store/useAppStore';
import { mockBackend } from '../../api';

describe('SetlistView Component Integration Flow', () => {
  beforeEach(() => {
    useAppStore.setState({
      setlist: [],
      tracks: [],
      setlistName: 'Festival Main Stage',
      energyProfile: 'LinearRamp',
      selectedTrackId: null,
      useMockBackend: true,
    });
  });

  it('renders the empty state and loads sample tracks into the setlist', async () => {
    render(<SetlistView customBackend={mockBackend} />);

    expect(screen.getByText('Your Setlist is Empty')).toBeDefined();
    const loadSampleBtn = screen.getByRole('button', { name: /load sample tracks/i });
    expect(loadSampleBtn).toBeDefined();

    fireEvent.click(loadSampleBtn);

    // Wait for the tracks to be populated into the store and rendered
    await waitFor(() => {
      expect(screen.queryByText('Your Setlist is Empty')).toBeNull();
    });

    const currentSetlist = useAppStore.getState().setlist;
    expect(currentSetlist.length).toBeGreaterThanOrEqual(1);
  });

  it('renders track cards, energy chart, and transition badges', async () => {
    // Populate store with 3 mock tracks
    const allTracks = await mockBackend.listTracks();
    const track1 = allTracks[0];
    const track2 = allTracks[1];
    const track3 = allTracks[2];

    const transition1 = await mockBackend.getAdvice(track1.id, track2.id);
    const transition2 = await mockBackend.getAdvice(track2.id, track3.id);

    useAppStore.setState({
      tracks: allTracks,
      setlist: [
        {
          position: 1,
          track_id: track1.id,
          track: track1,
          transition: null,
          target_energy: 4,
        },
        {
          position: 2,
          track_id: track2.id,
          track: track2,
          transition: transition1,
          target_energy: 6,
        },
        {
          position: 3,
          track_id: track3.id,
          track: track3,
          transition: transition2,
          target_energy: 8,
        },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    // Verify track titles are displayed
    expect(screen.getByText(track1.tags.title!)).toBeDefined();
    expect(screen.getByText(track2.tags.title!)).toBeDefined();
    expect(screen.getByText(track3.tags.title!)).toBeDefined();

    // Verify Energy Trajectory chart is displayed
    expect(screen.getByText('Energy Trajectory')).toBeDefined();

    // Verify transition cost badges are rendered
    const adviceBadges = screen.getAllByText(/💡 Advice/);
    expect(adviceBadges.length).toBe(2);
  });

  it('opens and closes transition advice modal upon clicking a transition badge', async () => {
    const allTracks = await mockBackend.listTracks();
    const track1 = allTracks[0];
    const track2 = allTracks[1];
    const transition = await mockBackend.getAdvice(track1.id, track2.id);

    useAppStore.setState({
      tracks: allTracks,
      setlist: [
        {
          position: 1,
          track_id: track1.id,
          track: track1,
          transition: null,
          target_energy: 5,
        },
        {
          position: 2,
          track_id: track2.id,
          track: track2,
          transition,
          target_energy: 7,
        },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    const adviceButtons = screen.getAllByRole('button', {
      name: new RegExp(`transition advice between ${track1.tags.title!}`, 'i'),
    });
    expect(adviceButtons.length).toBeGreaterThan(0);

    fireEvent.click(adviceButtons[0]);

    // Modal should now be open
    await waitFor(() => {
      expect(screen.getByText('Transition Copilot Advice')).toBeDefined();
      expect(screen.getByText('DJ Performance Notes:')).toBeDefined();
    });

    // Close the advice modal
    const closeBtn = screen.getByRole('button', { name: /close advice/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Transition Copilot Advice')).toBeNull();
    });
  });

  it('switches energy profiles between Linear Ramp, Wave, and Plateau', async () => {
    render(<SetlistView customBackend={mockBackend} />);

    const waveBtn = screen.getByRole('button', { name: /^wave$/i });
    fireEvent.click(waveBtn);
    expect(useAppStore.getState().energyProfile).toBe('Wave');

    const plateauBtn = screen.getByRole('button', { name: /^plateau$/i });
    fireEvent.click(plateauBtn);
    expect(useAppStore.getState().energyProfile).toBe('PeakPlateau');

    const rampBtn = screen.getByRole('button', { name: /^linear ramp$/i });
    fireEvent.click(rampBtn);
    expect(useAppStore.getState().energyProfile).toBe('LinearRamp');
  });

  it('toggles lock opener and lock closer pins', async () => {
    const allTracks = await mockBackend.listTracks();
    useAppStore.setState({
      setlist: [
        { position: 1, track_id: allTracks[0].id, track: allTracks[0], transition: null, target_energy: 4 },
        { position: 2, track_id: allTracks[1].id, track: allTracks[1], transition: null, target_energy: 5 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    const lockOpenerBtn = screen.getByTitle('Lock opening track in first position');
    fireEvent.click(lockOpenerBtn);
    expect(screen.getByText('Lock Opener')).toBeDefined();

    const lockCloserBtn = screen.getByTitle('Lock closing track in last position');
    fireEvent.click(lockCloserBtn);
    expect(screen.getByText('Lock Closer')).toBeDefined();
  });

  it('triggers suggest order solver and updates the setlist sequence', async () => {
    const allTracks = await mockBackend.listTracks();
    const track1 = allTracks[0];
    const track2 = allTracks[1];
    const track3 = allTracks[2];

    useAppStore.setState({
      tracks: allTracks,
      setlist: [
        { position: 1, track_id: track1.id, track: track1, transition: null, target_energy: 3 },
        { position: 2, track_id: track2.id, track: track2, transition: null, target_energy: 7 },
        { position: 3, track_id: track3.id, track: track3, transition: null, target_energy: 9 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    const suggestBtn = screen.getByRole('button', { name: /suggest order/i });
    fireEvent.click(suggestBtn);

    await waitFor(() => {
      const updated = useAppStore.getState().setlist;
      expect(updated.length).toBe(3);
    });
  });

  it('preserves unanalyzed tracks in the setlist when suggest order is invoked', async () => {
    const allTracks = await mockBackend.listTracks();
    const track1 = allTracks[0];
    const track2 = allTracks[1];
    const unanalyzedTrack = {
      id: 'track-unanalyzed',
      path: '/path/to/unanalyzed.mp3',
      hash: 'hash-un',
      tags: { title: 'Unanalyzed Track', artist: 'Artist', album: null },
      duration_ms: 180000,
      analysis: null as any,
      analyzed_at: null,
      analysis_version: null,
    };
    const track3 = allTracks[2];

    useAppStore.setState({
      tracks: [...allTracks, unanalyzedTrack],
      setlist: [
        { position: 1, track_id: track1.id, track: track1, transition: null, target_energy: 4 },
        { position: 2, track_id: track2.id, track: track2, transition: null, target_energy: 6 },
        { position: 3, track_id: unanalyzedTrack.id, track: unanalyzedTrack, transition: null, target_energy: 7 },
        { position: 4, track_id: track3.id, track: track3, transition: null, target_energy: 9 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    const suggestBtn = screen.getByRole('button', { name: /suggest order/i });
    fireEvent.click(suggestBtn);

    await waitFor(() => {
      const updated = useAppStore.getState().setlist;
      expect(updated.length).toBe(4);
      const ids = updated.map((e) => e.track_id);
      expect(ids).toContain('track-unanalyzed');
      expect(ids).toContain(track1.id);
      expect(ids).toContain(track2.id);
      expect(ids).toContain(track3.id);
      expect(updated.map((e) => e.position)).toEqual([1, 2, 3, 4]);
    });
  });

  it('exports setlist to selected target format and displays confirmation message', async () => {
    const allTracks = await mockBackend.listTracks();
    useAppStore.setState({
      setlist: [
        { position: 1, track_id: allTracks[0].id, track: allTracks[0], transition: null, target_energy: 4 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    const exportSelect = screen.getByLabelText('Export format');
    fireEvent.change(exportSelect, { target: { value: 'M3u8' } });

    const exportBtn = screen.getByRole('button', { name: /^export$/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText(/✓ Exported 1 tracks to M3u8/)).toBeDefined();
    });
  });

  it('displays target duration cockpit, allows changing target duration, and updates time remaining readout', async () => {
    const allTracks = await mockBackend.listTracks();
    useAppStore.setState({
      setlist: [
        { position: 1, track_id: allTracks[0].id, track: allTracks[0], transition: null, target_energy: 4 },
        { position: 2, track_id: allTracks[1].id, track: allTracks[1], transition: null, target_energy: 6 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    // Target duration dropdown is present and defaults to 60
    const targetSelect = screen.getByLabelText('Target Duration');
    expect(targetSelect).toBeDefined();

    // Change target duration to 90 min
    fireEvent.change(targetSelect, { target: { value: '90' } });
    expect(screen.getByText(/90:00/)).toBeDefined();
  });

  it('opens track selection drawer, searches tracks, and adds tracks directly into the setlist', async () => {
    const allTracks = await mockBackend.listTracks();
    useAppStore.setState({
      tracks: allTracks,
      setlist: [
        { position: 1, track_id: allTracks[0].id, track: allTracks[0], transition: null, target_energy: 4 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    // Open track selection drawer
    const selectTracksBtn = screen.getByRole('button', { name: /select tracks/i });
    fireEvent.click(selectTracksBtn);

    // Drawer header should be visible
    expect(screen.getByText('Select Tracks • Library Pool')).toBeDefined();

    // Search for track 2 by title
    const searchInput = screen.getByPlaceholderText('Search by title or artist...');
    fireEvent.change(searchInput, { target: { value: allTracks[1].tags.title! } });

    // Click "+ Add" on the search result
    const addBtn = screen.getByRole('button', { name: /\+ add/i });
    fireEvent.click(addBtn);

    // Store setlist should now have 2 tracks
    await waitFor(() => {
      expect(useAppStore.getState().setlist.length).toBe(2);
    });
  });

  it('displays visible between-track relationship with key, bpm, energy, and musical verdict', async () => {
    const allTracks = await mockBackend.listTracks();
    const track1 = allTracks[0];
    const track2 = allTracks[1];
    const transition = await mockBackend.getAdvice(track1.id, track2.id);

    useAppStore.setState({
      tracks: allTracks,
      setlist: [
        { position: 1, track_id: track1.id, track: track1, transition: null, target_energy: 4 },
        { position: 2, track_id: track2.id, track: track2, transition, target_energy: 7 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    // Key shift, BPM shift, and energy shift are visible in between-track rail
    const keyA = track1.analysis?.key.camelot ? `${track1.analysis.key.camelot.number}${track1.analysis.key.camelot.letter}` : '-';
    const keyB = track2.analysis?.key.camelot ? `${track2.analysis.key.camelot.number}${track2.analysis.key.camelot.letter}` : '-';

    expect(screen.getAllByText(keyA).length).toBeGreaterThan(0);
    expect(screen.getAllByText(keyB).length).toBeGreaterThan(0);

    // Musical verdict label is displayed (e.g. LOW COST or MODERATE SHIFT)
    const verdict = screen.getByText(/LOW COST|MODERATE SHIFT|HIGH COST/);
    expect(verdict).toBeDefined();
  });

  it('displays musical ROLE badges for tracks in sequence (OPENER, BUILD, CLOSER)', async () => {
    const allTracks = await mockBackend.listTracks();
    useAppStore.setState({
      tracks: allTracks,
      setlist: [
        { position: 1, track_id: allTracks[0].id, track: allTracks[0], transition: null, target_energy: 4 },
        { position: 2, track_id: allTracks[1].id, track: allTracks[1], transition: null, target_energy: 6 },
        { position: 3, track_id: allTracks[2].id, track: allTracks[2], transition: null, target_energy: 8 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    // Verify OPENER badge on first track
    expect(screen.getByText('OPENER')).toBeDefined();

    // Verify CLOSER badge on last track
    expect(screen.getByText('CLOSER')).toBeDefined();

    // Verify BUILD badge on middle track
    expect(screen.getByText('BUILD')).toBeDefined();
  });

  it('opens bridge finder modal, displays intermediate candidates, and inserts bridge track into setlist', async () => {
    const allTracks = await mockBackend.listTracks();
    const track1 = allTracks[0];
    const track2 = allTracks[1];
    const transition = await mockBackend.getAdvice(track1.id, track2.id);

    useAppStore.setState({
      tracks: allTracks,
      setlist: [
        { position: 1, track_id: track1.id, track: track1, transition: null, target_energy: 4 },
        { position: 2, track_id: track2.id, track: track2, transition, target_energy: 8 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    // Click "Find Bridge" button on the transition rail
    const findBridgeBtn = screen.getByRole('button', { name: /find bridge/i });
    expect(findBridgeBtn).toBeDefined();
    fireEvent.click(findBridgeBtn);

    // Bridge Discovery modal opens
    await waitFor(() => {
      expect(screen.getByText(/Bridge Discovery • Intermediate Transitions/i)).toBeDefined();
    });

    // Check for intermediate candidates and insert one
    const insertBridgeBtns = screen.getAllByRole('button', { name: /\+ insert bridge/i });
    expect(insertBridgeBtns.length).toBeGreaterThan(0);
    fireEvent.click(insertBridgeBtns[0]);

    // Setlist now has 3 tracks (Track 1 -> Bridge -> Track 2)
    await waitFor(() => {
      expect(useAppStore.getState().setlist.length).toBe(3);
    });
  });

  it('re-sequences unlocked tracks selectively while preserving pinned opener and closer', async () => {
    const allTracks = await mockBackend.listTracks();
    const track1 = allTracks[0];
    const track2 = allTracks[1];
    const track3 = allTracks[2];
    const track4 = allTracks[3];

    useAppStore.setState({
      tracks: allTracks,
      pins: { lockFirst: true, lockLast: true },
      setlist: [
        { position: 1, track_id: track1.id, track: track1, transition: null, target_energy: 3 },
        { position: 2, track_id: track2.id, track: track2, transition: null, target_energy: 5 },
        { position: 3, track_id: track3.id, track: track3, transition: null, target_energy: 7 },
        { position: 4, track_id: track4.id, track: track4, transition: null, target_energy: 9 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    const regenBtn = screen.getByRole('button', { name: /regen unlocked/i });
    expect(regenBtn).toBeDefined();
    fireEvent.click(regenBtn);

    await waitFor(() => {
      const updated = useAppStore.getState().setlist;
      expect(updated.length).toBe(4);
      // Pinned opener & closer must remain at first and last positions
      expect(updated[0].track_id).toBe(track1.id);
      expect(updated[3].track_id).toBe(track4.id);
    });
  });

  it('opens READY FOR PERFORMANCE finalization modal, exposing telemetry HUD, hardware export pads, and verification checklist', async () => {
    const allTracks = await mockBackend.listTracks();
    const track1 = allTracks[0];
    const track2 = allTracks[1];

    useAppStore.setState({
      tracks: allTracks,
      setlistName: 'HEADLINER SHOWCASE',
      setlist: [
        { position: 1, track_id: track1.id, track: track1, transition: null, target_energy: 7 },
        { position: 2, track_id: track2.id, track: track2, transition: null, target_energy: 8 },
      ],
    });

    render(<SetlistView customBackend={mockBackend} />);

    // Click READY FOR PERFORMANCE button
    const readyBtn = screen.getByTestId('ready-for-performance-btn');
    expect(readyBtn).toBeDefined();
    fireEvent.click(readyBtn);

    // Modal opens with hardware telemetry
    expect(screen.getByTestId('final-delivery-modal')).toBeDefined();
    expect(screen.getByTestId('delivery-ready-badge').textContent).toContain('READY FOR PERFORMANCE');
    expect(screen.getByTestId('delivery-set-title').textContent).toContain('HEADLINER SHOWCASE');

    // Telemetry HUD strip is populated
    const hud = screen.getByTestId('delivery-telemetry-hud');
    expect(hud).toBeDefined();
    expect(hud.textContent).toContain('2 TRACKS');
    expect(hud.textContent).toContain('1 TRANSITIONS');

    // Hardware export pads are present
    expect(screen.getByTestId('export-rekordbox-btn').textContent).toContain('[EXPORT REKORDBOX]');
    expect(screen.getByTestId('export-playlist-btn').textContent).toContain('[EXPORT PLAYLIST]');
    expect(screen.getByTestId('export-stage-sheet-btn').textContent).toContain('[EXPORT STAGE SHEET]');

    // Verification checklist is present
    expect(screen.getByTestId('delivery-verification-checklist')).toBeDefined();
    expect(screen.getByTestId('check-tracks_available')).toBeDefined();
    expect(screen.getByTestId('check-metadata_complete')).toBeDefined();
    expect(screen.getByTestId('check-sequence_valid')).toBeDefined();

    // Close modal
    fireEvent.click(screen.getByLabelText('Close export modal'));
    expect(screen.queryByTestId('final-delivery-modal')).toBeNull();
  });
});

