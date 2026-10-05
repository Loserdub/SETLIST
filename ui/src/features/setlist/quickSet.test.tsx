import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickSetModal } from './QuickSetModal';
import { useAppStore } from '../../store/useAppStore';
import { mockBackend, type Backend } from '../../api';
import type { Track } from '../../bindings/Track';
import type { SetlistEntry } from '../../bindings/SetlistEntry';

describe('Quick Set Flow with Mock Backend', () => {
  let sampleTracks: Track[];

  beforeEach(async () => {
    sampleTracks = await mockBackend.listTracks();
    useAppStore.setState({
      tracks: sampleTracks.slice(0, 3),
      selectedTrackId: null,
      selectedTrack: null,
      setlist: [],
      currentRoute: 'library',
      toasts: [],
    });
  });

  it('renders three plain-word energy profile choices and input track count', () => {
    render(<QuickSetModal isOpen={true} onClose={vi.fn()} customBackend={mockBackend} />);

    expect(screen.getByText('Quick Set')).toBeDefined();
    expect(screen.getByText(/3 tracks/i)).toBeDefined();

    // Three choices in plain words
    expect(screen.getByText('Build up')).toBeDefined();
    expect(screen.getByText('(linear ramp)')).toBeDefined();

    expect(screen.getByText('Peaks and breaks')).toBeDefined();
    expect(screen.getByText('(wave)')).toBeDefined();

    expect(screen.getByText('Hit hard early')).toBeDefined();
    expect(screen.getByText('(plateau)')).toBeDefined();
  });

  it('caps at 40 tracks if none are selected and more than 40 exist', () => {
    const manyTracks: Track[] = Array.from({ length: 55 }, (_, i) => ({
      ...sampleTracks[0],
      id: `t${i}`,
      path: `/music/track_${i}.mp3`,
      tags: { ...sampleTracks[0].tags, title: `Track ${i}` },
    }));
    useAppStore.setState({ tracks: manyTracks });

    render(<QuickSetModal isOpen={true} onClose={vi.fn()} customBackend={mockBackend} />);
    expect(screen.getByText(/40 tracks/i)).toBeDefined();
    expect(screen.getByText(/capped at 40/i)).toBeDefined();
  });

  it('switches energy trajectory profile when clicking choices', () => {
    render(<QuickSetModal isOpen={true} onClose={vi.fn()} customBackend={mockBackend} />);

    const peaksBtn = screen.getByTestId('quick-set-choice-peaks');
    fireEvent.click(peaksBtn);
    expect(screen.getByText('Peaks and breaks')).toBeDefined();

    const plateauBtn = screen.getByTestId('quick-set-choice-hithard');
    fireEvent.click(plateauBtn);
    expect(screen.getByText('Hit hard early')).toBeDefined();
  });

  it('solves order, saves set, displays energy curve, and lists weak transitions', async () => {
    const track1 = sampleTracks[0];
    const track2 = sampleTracks[1];
    const track3 = sampleTracks[2];

    const orderedEntries: SetlistEntry[] = [
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
        transition: {
          transition_type: 'ExactMatch',
          bpm_delta: 2,
          key_distance: 1,
          mode_flip: false,
          intervention_required: false,
          loop_extension_recommended: false,
          phrase_bars: 16,
          notes: ['Harmonic match'],
          total_cost: 0.25,
          tempo_cost: 0.1,
          key_cost: 0.1,
          energy_cost: 0.05,
          timbre_cost: 0.0,
          de_target: 0,
          weights: null,
          profile: 'LinearRamp',
        },
        target_energy: 6,
      },
      {
        position: 3,
        track_id: track3.id,
        track: track3,
        transition: {
          transition_type: 'Tritone',
          bpm_delta: 18,
          key_distance: 5,
          mode_flip: false,
          intervention_required: true,
          loop_extension_recommended: false,
          phrase_bars: 16,
          notes: ['Significant tempo and key jump'],
          total_cost: 0.78, // Cost > 0.6 should be flagged as weak transition
          tempo_cost: 0.8,
          key_cost: 0.7,
          energy_cost: 0.8,
          timbre_cost: 0.0,
          de_target: 2,
          weights: null,
          profile: 'LinearRamp',
        },
        target_energy: 8,
      },
    ];

    const suggestOrderMock = vi.fn().mockResolvedValue(orderedEntries);
    const saveActiveSetlistMock = vi.fn().mockResolvedValue(undefined);

    const testBackend: Partial<Backend> = {
      ...mockBackend,
      suggestOrder: suggestOrderMock,
      saveActiveSetlist: saveActiveSetlistMock,
    };

    const onClose = vi.fn();
    render(<QuickSetModal isOpen={true} onClose={onClose} customBackend={testBackend as Backend} />);

    // Click "Generate Quick Set"
    const generateBtn = screen.getByTestId('quick-set-generate-btn');
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(suggestOrderMock).toHaveBeenCalled();
      expect(saveActiveSetlistMock).toHaveBeenCalled();
    });

    // Check that energy progression curve and weak transitions are displayed
    await waitFor(() => {
      expect(screen.getByTestId('quick-set-energy-chart')).toBeDefined();
    });

    // Lists weak transitions with cost above 0.6 as "Check these N transitions"
    expect(screen.getByText(/Check these 1 transitions/i)).toBeDefined();
    expect(screen.getAllByText(new RegExp(track2.tags.title || 'track', 'i')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(new RegExp(track3.tags.title || 'track', 'i')).length).toBeGreaterThanOrEqual(1);

    // Verify success toast was queued
    expect(useAppStore.getState().toasts.some((t) => t.message === 'Quick set created')).toBe(true);

    // Click "Open in My Set →"
    const viewSetBtn = screen.getByTestId('quick-set-view-set-btn');
    fireEvent.click(viewSetBtn);
    expect(onClose).toHaveBeenCalled();
    expect(useAppStore.getState().currentRoute).toBe('setlist');
  });
});
