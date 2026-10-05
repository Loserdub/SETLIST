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
});
