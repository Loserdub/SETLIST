import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StageActionPrompter } from './StageActionPrompter';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../../bindings/TransitionAdvice';

afterEach(() => {
  cleanup();
});

const mockSongEntry: SetlistEntry = {
  position: 1,
  track_id: 'track-1',
  track: null,
  transition: null,
  target_energy: null,
};

const mockTransition: TransitionAdvice = {
  transition_type: 'Fifth',
  bpm_delta: 3.5,
  key_distance: 1,
  mode_flip: false,
  intervention_required: true,
  loop_extension_recommended: false,
  phrase_bars: 16,
  notes: ['Cut low frequencies on downbeat', 'Apply 1/2 beat echo freeze'],
  total_cost: 0.2,
  tempo_cost: 0.1,
  key_cost: 0.1,
  energy_cost: 0.0,
  timbre_cost: 0.0,
  de_target: null,
  weights: null,
  profile: null,
};

describe('StageActionPrompter', () => {
  it('returns null when both currentEntry and nextEntry are null', () => {
    const { container } = render(
      <StageActionPrompter currentEntry={null} nextEntry={null} transition={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders instrument retuning alert when next entry is a tuning waypoint', () => {
    const nextEntry: SetlistEntry = {
      position: 2,
      track_id: 'tuning:Drop D Tuning (Capo 3)',
      track: null,
      transition: null,
      target_energy: null,
    };

    render(
      <StageActionPrompter currentEntry={mockSongEntry} nextEntry={nextEntry} transition={null} />
    );

    const alert = screen.getByTestId('prompter-tuning-alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain('PREPARE INSTRUMENT: Drop D Tuning (Capo 3)');
  });

  it('renders live mic alert when next entry is a banter waypoint', () => {
    const nextEntry: SetlistEntry = {
      position: 2,
      track_id: 'banter:Band Introduction',
      track: null,
      transition: null,
      target_energy: null,
    };

    render(
      <StageActionPrompter currentEntry={mockSongEntry} nextEntry={nextEntry} transition={null} />
    );

    const alert = screen.getByTestId('prompter-mic-alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain('LIVE MIC CUE: Band Introduction');
  });

  it('renders transition technique directive when transition advice is present', () => {
    render(
      <StageActionPrompter
        currentEntry={mockSongEntry}
        nextEntry={mockSongEntry}
        transition={mockTransition}
      />
    );

    const directive = screen.getByTestId('prompter-transition-directive');
    expect(directive).toBeDefined();
    expect(directive.textContent).toContain('Fifth');
    expect(directive.textContent).toContain('Δ3.5 BPM');
    expect(directive.textContent).toContain('Cut low frequencies on downbeat');
  });

  it('renders mix-out proximity alert when barsToOutro <= 8', () => {
    render(
      <StageActionPrompter
        currentEntry={mockSongEntry}
        nextEntry={mockSongEntry}
        transition={null}
        barsToOutro={4}
      />
    );

    const mixout = screen.getByTestId('prompter-mixout-window');
    expect(mixout).toBeDefined();
    expect(mixout.textContent).toContain('4 bars remaining to Outro mix point');
  });
});
