import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransitionLabModal } from './TransitionLabModal';
import { useAppStore } from '../../store/useAppStore';
import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import * as overridesApi from '../../api/overrides';

const mockTrackA = {
  id: 'track-03',
  path: 'C:/music/track_03.mp3',
  duration_ms: 240000,
  tags: {
    title: 'Solar Energy',
    artist: 'Solaris',
    bpm: 126,
    initial_key: '8A',
  },
  analysis: {
    rhythm: {
      grid: {
        bpm: 126.0,
        first_downbeat_ms: 200.0,
        beats_ms: [200, 676, 1152],
        downbeat_flags: [true, false, false],
        steady: true,
      },
    },
    key: {
      pitch_class: 0,
      mode: 'Minor',
      camelot: { number: 8, letter: 'A' },
      tuning_cents: 0,
    },
    segments: [
      { label: 'intro', start_ms: 0, end_ms: 30000, energy: 3 },
      { label: 'verse', start_ms: 30000, end_ms: 90000, energy: 6 },
      { label: 'outro', start_ms: 210000, end_ms: 240000, energy: 4 },
    ],
    cue_points: [
      { index: 0, label: 'First Downbeat', time_ms: 200, kind: 'HotCue', color_hex: '#38bdf8', loop_end_ms: null },
      { index: 6, label: 'Mix-Out Point', time_ms: 210000, kind: 'HotCue', color_hex: '#10b981', loop_end_ms: null },
    ],
    energy_score: 6,
  },
} as unknown as Track;

const mockTrackB = {
  id: 'track-04',
  path: 'C:/music/track_04.mp3',
  duration_ms: 300000,
  tags: {
    title: 'Lunar Gravity',
    artist: 'Lunaria',
    bpm: 127,
    initial_key: '9A',
  },
  analysis: {
    rhythm: {
      grid: {
        bpm: 127.0,
        first_downbeat_ms: 150.0,
        beats_ms: [150, 622, 1094],
        downbeat_flags: [true, false, false],
        steady: true,
      },
    },
    key: {
      pitch_class: 7,
      mode: 'Minor',
      camelot: { number: 9, letter: 'A' },
      tuning_cents: 0,
    },
    segments: [
      { label: 'intro', start_ms: 0, end_ms: 30000, energy: 4 },
      { label: 'breakdown', start_ms: 30000, end_ms: 75000, energy: 3 },
      { label: 'drop', start_ms: 75000, end_ms: 150000, energy: 9 },
    ],
    cue_points: [
      { index: 0, label: 'First Downbeat', time_ms: 150, kind: 'HotCue', color_hex: '#38bdf8', loop_end_ms: null },
      { index: 1, label: 'Intro Bass', time_ms: 15000, kind: 'HotCue', color_hex: '#6366f1', loop_end_ms: null },
      { index: 2, label: 'Breakdown', time_ms: 30000, kind: 'HotCue', color_hex: '#8b5cf6', loop_end_ms: null },
      { index: 3, label: 'Main Drop', time_ms: 75000, kind: 'HotCue', color_hex: '#ef4444', loop_end_ms: null },
    ],
    energy_score: 8,
  },
} as unknown as Track;

const mockAdvice: TransitionAdvice = {
  transition_type: 'Fifth',
  bpm_delta: 1.0,
  key_distance: 1,
  mode_flip: false,
  intervention_required: false,
  loop_extension_recommended: false,
  phrase_bars: 16,
  notes: [
    'Energy lift: prepare audience for peak tempo',
    'Consonant harmonic blend with fifth key movement',
  ],
  total_cost: 0.15,
  tempo_cost: 0.16,
  key_cost: 0.10,
  energy_cost: 0.20,
  timbre_cost: 0.0,
  de_target: 1.0,
  weights: null,
  profile: null,
};

describe('TransitionLabModal Component', () => {
  beforeEach(() => {
    useAppStore.setState({
      toasts: [],
      useMockBackend: true,
      tracks: [mockTrackA, mockTrackB],
    });
  });

  it('renders transition workspace with header, relationship badges, and copilot titles', () => {
    render(
      <TransitionLabModal
        isOpen={true}
        onClose={vi.fn()}
        trackA={mockTrackA}
        trackB={mockTrackB}
        posA={3}
        posB={4}
        advice={mockAdvice}
      />
    );

    // Required by tests and prompt:
    expect(screen.getByText('Transition Copilot Advice')).toBeDefined();
    expect(screen.getAllByText('TRANSITION 03 → 04').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Solar Energy')).toBeDefined();
    expect(screen.getByText('Lunar Gravity')).toBeDefined();

    // Harmonic and BPM metrics:
    expect(screen.getAllByText('8A').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('9A').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('126').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('127').length).toBeGreaterThanOrEqual(1);
  });

  it('renders structural markers on dual-deck waveforms', () => {
    render(
      <TransitionLabModal
        isOpen={true}
        onClose={vi.fn()}
        trackA={mockTrackA}
        trackB={mockTrackB}
        posA={3}
        posB={4}
        advice={mockAdvice}
      />
    );

    // Deck labels
    expect(screen.getByText(/DECK A · OUTGOING/)).toBeDefined();
    expect(screen.getByText(/DECK B · INCOMING/)).toBeDefined();
    expect(screen.getByText('MIX-OUT ZONE')).toBeDefined();
    expect(screen.getByText('MIX-IN ENTRY ZONE')).toBeDefined();
  });

  it('renders performance execution cards: ENTER, LOW END, RELEASE, and DJ notes', () => {
    render(
      <TransitionLabModal
        isOpen={true}
        onClose={vi.fn()}
        trackA={mockTrackA}
        trackB={mockTrackB}
        posA={3}
        posB={4}
        advice={mockAdvice}
      />
    );

    // Performance plan triad
    expect(screen.getByText('ENTER')).toBeDefined();
    expect(screen.getByText('LOW END')).toBeDefined();
    expect(screen.getByText('RELEASE')).toBeDefined();

    expect(screen.getByText(/Track 04 at BREAKDOWN/)).toBeDefined();
    expect(screen.getByText(/Keep incoming bass reduced/)).toBeDefined();
    expect(screen.getByText(/Open incoming low-end at DROP/)).toBeDefined();

    // DJ Performance Notes
    expect(screen.getByText('DJ Performance Notes:')).toBeDefined();
    expect(screen.getByText(/Energy lift: prepare audience for peak tempo/)).toBeDefined();
  });

  it('allows adding custom transition notes', () => {
    const handleSaveCustomNotes = vi.fn();
    render(
      <TransitionLabModal
        isOpen={true}
        onClose={vi.fn()}
        trackA={mockTrackA}
        trackB={mockTrackB}
        posA={3}
        posB={4}
        advice={mockAdvice}
        onSaveCustomNotes={handleSaveCustomNotes}
      />
    );

    const input = screen.getByPlaceholderText(/Add stage note/i);
    fireEvent.change(input, { target: { value: 'Cut outgoing low-end 1 bar early' } });

    const addBtn = screen.getByRole('button', { name: /\+ Add Note/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('Cut outgoing low-end 1 bar early')).toBeDefined();
    expect(handleSaveCustomNotes).toHaveBeenCalledWith(
      expect.arrayContaining(['Cut outgoing low-end 1 bar early'])
    );
  });

  it('switches to Overrides & Corrections tab and displays non-destructive controls', async () => {
    const setOverrideSpy = vi.spyOn(overridesApi, 'setTrackOverride').mockResolvedValue();

    render(
      <TransitionLabModal
        isOpen={true}
        onClose={vi.fn()}
        trackA={mockTrackA}
        trackB={mockTrackB}
        posA={3}
        posB={4}
        advice={mockAdvice}
      />
    );

    const correctionsTab = screen.getByRole('button', { name: /Overrides & Corrections/i });
    fireEvent.click(correctionsTab);

    expect(screen.getByText(/Non-Destructive Corrections & Overrides/i)).toBeDefined();
    expect(screen.getByText(/Source audio files are strictly read-only/i)).toBeDefined();
    expect(screen.getByText('BPM Override & Multipliers')).toBeDefined();
    expect(screen.getByText('Beat-Grid Downbeat Alignment')).toBeDefined();
    expect(screen.getByText('Camelot Harmonic Key')).toBeDefined();
    expect(screen.getByText('Cue Adjustment')).toBeDefined();

    // Click nudge BPM
    const nudgeBtn = screen.getByRole('button', { name: '+0.5' });
    fireEvent.click(nudgeBtn);

    await waitFor(() => {
      expect(setOverrideSpy).toHaveBeenCalledWith('track-04', expect.objectContaining({ bpm: 127.5 }));
    });

    setOverrideSpy.mockRestore();
  });

  it('closes on Close Advice button click or Escape key press', () => {
    const handleClose = vi.fn();
    render(
      <TransitionLabModal
        isOpen={true}
        onClose={handleClose}
        trackA={mockTrackA}
        trackB={mockTrackB}
        posA={3}
        posB={4}
        advice={mockAdvice}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /Close Advice/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
