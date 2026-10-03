import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TrackView } from './TrackView';
import { useAppStore } from '../../store/useAppStore';
import { useTrackState } from './useTrackState';
import { mockBackend } from '../../api';

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
    expect(screen.getByText(new RegExp(track.tags.artist!, 'i'))).toBeDefined();

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

  it('clicking a cue card jumps playhead and scrolls waveform to cue time', () => {
    render(<TrackView />);

    const cueA = screen.getByTestId('cue-card-A');
    fireEvent.click(cueA);

    const playheadMs = useTrackState.getState().playheadPositionMs;
    expect(playheadMs).toBe(120); // First downbeat in mock track is 120ms
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

  it('renders structural segments and jumps to segment when clicked', () => {
    render(<TrackView />);

    const introElements = screen.getAllByText(/intro/i);
    expect(introElements.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/buildup/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/drop/i).length).toBeGreaterThan(0);

    // Click first intro element
    fireEvent.click(introElements[0]);

    expect(useTrackState.getState().playheadPositionMs).toBe(0);
  });
});
