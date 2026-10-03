import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OverridePanel } from './OverridePanel';
import { useAppStore } from '../../../store/useAppStore';
import { mockOverridesClient } from '../../../api/overrides';
import { mockBackend } from '../../../api';
import type { Track } from '../../../bindings/Track';

describe('OverridePanel Component', () => {
  let sampleTrack: Track;

  beforeEach(async () => {
    mockOverridesClient.reset();
    const tracks = await mockBackend.listTracks();
    sampleTrack = JSON.parse(JSON.stringify(tracks[0]));

    useAppStore.setState({
      tracks: [sampleTrack],
      selectedTrackId: sampleTrack.id,
      selectedTrack: sampleTrack,
      setlist: [
        {
          position: 1,
          track_id: sampleTrack.id,
          track: sampleTrack,
          transition: null,
          target_energy: 7,
        },
      ],
    });
  });

  it('renders panel with BPM, downbeat, and Camelot key sections', () => {
    render(<OverridePanel />);

    expect(screen.getByTestId('override-panel')).toBeDefined();
    expect(screen.getByTestId('override-bpm-section')).toBeDefined();
    expect(screen.getByTestId('override-downbeat-section')).toBeDefined();
    expect(screen.getByTestId('override-key-section')).toBeDefined();
  });

  it('halves BPM when ½ button is clicked and displays edited badge', async () => {
    render(<OverridePanel />);

    const originalBpm = sampleTrack.analysis!.rhythm.grid.bpm;
    const halfBtn = screen.getByTestId('bpm-half-btn');
    fireEvent.click(halfBtn);

    await waitFor(() => {
      const updatedTrack = useAppStore.getState().selectedTrack!;
      expect(updatedTrack.analysis!.rhythm.grid.bpm).toBeCloseTo(originalBpm / 2, 1);
      expect(screen.getByTestId('edited-badge-bpm')).toBeDefined();
    });
  });

  it('doubles BPM when 2× button is clicked', async () => {
    render(<OverridePanel />);

    const originalBpm = sampleTrack.analysis!.rhythm.grid.bpm;
    const doubleBtn = screen.getByTestId('bpm-double-btn');
    fireEvent.click(doubleBtn);

    await waitFor(() => {
      const updatedTrack = useAppStore.getState().selectedTrack!;
      expect(updatedTrack.analysis!.rhythm.grid.bpm).toBeCloseTo(originalBpm * 2, 1);
    });
  });

  it('nudges BPM by +0.1 and -0.1', async () => {
    render(<OverridePanel />);

    const originalBpm = sampleTrack.analysis!.rhythm.grid.bpm;
    const plusBtn = screen.getByTestId('bpm-plus-01-btn');
    fireEvent.click(plusBtn);

    await waitFor(() => {
      const updatedTrack = useAppStore.getState().selectedTrack!;
      expect(updatedTrack.analysis!.rhythm.grid.bpm).toBeCloseTo(originalBpm + 0.1, 1);
    });

    const minusBtn = screen.getByTestId('bpm-minus-01-btn');
    fireEvent.click(minusBtn);

    await waitFor(() => {
      const updatedTrack = useAppStore.getState().selectedTrack!;
      expect(updatedTrack.analysis!.rhythm.grid.bpm).toBeCloseTo(originalBpm, 1);
    });
  });

  it('nudges downbeat by -10 ms and +10 ms', async () => {
    render(<OverridePanel />);

    const originalDownbeat = sampleTrack.analysis!.rhythm.grid.first_downbeat_ms;
    const plusBtn = screen.getByTestId('downbeat-plus-10-btn');
    fireEvent.click(plusBtn);

    await waitFor(() => {
      const updatedTrack = useAppStore.getState().selectedTrack!;
      expect(updatedTrack.analysis!.rhythm.grid.first_downbeat_ms).toBeCloseTo(
        originalDownbeat + 10,
        1
      );
      expect(screen.getByTestId('edited-badge-first_downbeat_ms')).toBeDefined();
    });
  });

  it('shifts downbeat by one beat when Shift 1 Beat button is clicked', async () => {
    render(<OverridePanel />);

    const originalDownbeat = sampleTrack.analysis!.rhythm.grid.first_downbeat_ms;
    const bpm = sampleTrack.analysis!.rhythm.grid.bpm;
    const beatPeriod = 60000 / bpm;

    const shiftBtn = screen.getByTestId('downbeat-shift-beat-btn');
    fireEvent.click(shiftBtn);

    await waitFor(() => {
      const updatedTrack = useAppStore.getState().selectedTrack!;
      expect(updatedTrack.analysis!.rhythm.grid.first_downbeat_ms).toBeCloseTo(
        originalDownbeat + beatPeriod,
        0
      );
    });
  });

  it('sets Camelot key when key button is clicked and resets when Reset is clicked', async () => {
    render(<OverridePanel />);

    const keyBtn10B = screen.getByTestId('key-btn-10B');
    fireEvent.click(keyBtn10B);

    await waitFor(() => {
      const updatedTrack = useAppStore.getState().selectedTrack!;
      expect(updatedTrack.analysis!.key.camelot.number).toBe(10);
      expect(updatedTrack.analysis!.key.camelot.letter).toBe('B');
      expect(screen.getByTestId('edited-badge-key_camelot')).toBeDefined();
    });

    // Click Reset Key
    const resetKeyBtn = screen.getByTestId('key-reset-btn');
    fireEvent.click(resetKeyBtn);

    await waitFor(() => {
      const revertedTrack = useAppStore.getState().selectedTrack!;
      expect(revertedTrack.analysis!.key.camelot.number).toBe(
        sampleTrack.analysis!.key.camelot.number
      );
      expect(revertedTrack.analysis!.key.camelot.letter).toBe(
        sampleTrack.analysis!.key.camelot.letter
      );
    });
  });

  it('resets all fields when Reset All is clicked', async () => {
    render(<OverridePanel />);

    // Apply BPM and Key overrides
    fireEvent.click(screen.getByTestId('bpm-half-btn'));
    fireEvent.click(screen.getByTestId('key-btn-11B'));

    await waitFor(() => {
      expect(screen.getByTestId('reset-all-btn')).toBeDefined();
    });

    // Click Reset All
    fireEvent.click(screen.getByTestId('reset-all-btn'));

    await waitFor(() => {
      const track = useAppStore.getState().selectedTrack!;
      expect(track.analysis!.rhythm.grid.bpm).toBeCloseTo(
        sampleTrack.analysis!.rhythm.grid.bpm,
        1
      );
      expect(track.analysis!.key.camelot.number).toBe(sampleTrack.analysis!.key.camelot.number);
      expect(screen.queryByTestId('reset-all-btn')).toBeNull();
    });
  });
});
