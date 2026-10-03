import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../store/useAppStore';
import { SetlistView } from './SetlistView';
import { mockBackend } from '../../api';
import type { Backend } from '../../api';
import type { Track } from '../../bindings/Track';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';

function createMockAdvice(
  fromId: string,
  toId: string,
  noteText = 'Smooth transition'
): TransitionAdvice {
  return {
    transition_type: 'ExactMatch',
    bpm_delta: 0,
    key_distance: 0,
    mode_flip: false,
    intervention_required: false,
    loop_extension_recommended: false,
    phrase_bars: 16,
    notes: [`${noteText}: ${fromId} -> ${toId}`],
    total_cost: 0.1,
    tempo_cost: 0.05,
    key_cost: 0.05,
    energy_cost: 0.0,
    timbre_cost: 0.0,
    de_target: 0.0,
    weights: { tempo: 0.3, key: 0.35, energy: 0.35, timbre: 0.0 },
    profile: 'PeakPlateau',
  };
}

describe('Asynchronous Setlist Operations Race-Safety (Task 3)', () => {
  let trackA: Track;
  let trackB: Track;
  let trackC: Track;
  let trackD: Track;

  beforeEach(async () => {
    const all = await mockBackend.listTracks();
    trackA = all[0];
    trackB = all[1];
    trackC = all[2];
    trackD = all[3];

    useAppStore.setState({
      setlist: [],
      setlistVersion: 0,
      tracks: [trackA, trackB, trackC, trackD],
      setlistName: 'Race Condition Test Set',
      energyProfile: 'PeakPlateau',
      selectedTrackId: null,
      useMockBackend: true,
      isSuggestingOrder: false,
      setlistError: null,
    });
  });

  it('Requirement 3: Suggest Order is discarded if setlist changed while optimization was running', async () => {
    // Populate store with initial setlist [A, B, C]
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    await useAppStore.getState().addToSetlist(trackC.id);
    expect(useAppStore.getState().setlist.map((e) => e.track_id)).toEqual([
      trackA.id,
      trackB.id,
      trackC.id,
    ]);

    // Create a delayed backend whose suggestOrder takes to resolve with reverse order [C, B, A]
    let resolveSuggest: (entries: SetlistEntry[]) => void = () => {};
    const suggestPromise = new Promise<SetlistEntry[]>((resolve) => {
      resolveSuggest = resolve;
    });

    const delayedBackend: Partial<Backend> = {
      suggestOrder: vi.fn(async () => {
        return suggestPromise;
      }),
      getAdvice: vi.fn(async (fromId, toId) => createMockAdvice(fromId, toId)),
      getSettings: vi.fn(async () => useAppStore.getState().appSettings),
      listTracks: vi.fn(async () => [trackA, trackB, trackC, trackD]),
    };

    // Trigger suggestOrder asynchronously
    const suggestOp = useAppStore.getState().suggestOrder(delayedBackend as Backend);
    expect(useAppStore.getState().isSuggestingOrder).toBe(true);

    // While suggestOrder is in flight, user mutates the setlist (e.g. removes track B)
    await useAppStore.getState().removeFromSetlist(2); // removes track B
    expect(useAppStore.getState().setlist.map((e) => e.track_id)).toEqual([trackA.id, trackC.id]);

    // Now let the delayed solver resolve with [C, B, A]
    resolveSuggest([
      { position: 1, track_id: trackC.id, track: trackC, transition: null, target_energy: null },
      { position: 2, track_id: trackB.id, track: trackB, transition: null, target_energy: null },
      { position: 3, track_id: trackA.id, track: trackA, transition: null, target_energy: null },
    ]);
    await suggestOp;

    // The stale solver result MUST be discarded because setlistVersion incremented!
    const current = useAppStore.getState().setlist;
    expect(current.map((e) => e.track_id)).toEqual([trackA.id, trackC.id]);
    expect(useAppStore.getState().isSuggestingOrder).toBe(false);
  });

  it('Requirement 2: Dragging followed immediately by another mutation does not resurrect old tracks', async () => {
    // Start with [A, B, C]
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    await useAppStore.getState().addToSetlist(trackC.id);

    let resolveSlowAdvice: (adv: TransitionAdvice) => void = () => {};
    const slowAdvicePromise = new Promise<TransitionAdvice>((resolve) => {
      resolveSlowAdvice = resolve;
    });

    const delayedBackend: Partial<Backend> = {
      getAdvice: vi.fn(async (_fromId, _toId) => {
        // Slow advice for reordering
        return slowAdvicePromise;
      }),
    };

    // User drags track A to position 2 (reorder: [B, A, C])
    const reorderOp = useAppStore.getState().reorderSetlist(0, 1, { lockFirst: false, lockLast: false }, delayedBackend as Backend);

    // Synchronously, the order updated to [B, A, C]
    expect(useAppStore.getState().setlist.map((e) => e.track_id)).toEqual([trackB.id, trackA.id, trackC.id]);

    // Immediately before the delayed advice resolves, user removes track A (position 2)
    await useAppStore.getState().removeFromSetlist(2);
    expect(useAppStore.getState().setlist.map((e) => e.track_id)).toEqual([trackB.id, trackC.id]);

    // Now let the delayed reorder advice resolve
    resolveSlowAdvice(createMockAdvice(trackB.id, trackA.id));
    await reorderOp;

    // Track A must NOT be resurrected!
    const finalSetlist = useAppStore.getState().setlist;
    expect(finalSetlist.map((e) => e.track_id)).toEqual([trackB.id, trackC.id]);
    expect(finalSetlist.map((e) => e.position)).toEqual([1, 2]);
  });

  it('Requirement 1 & 5: Rapid concurrent addToSetlist calls add all tracks without dropping any and update synchronously', async () => {
    let resolveAdvice: (adv: TransitionAdvice) => void = () => {};
    const advicePromise = new Promise<TransitionAdvice>((resolve) => {
      resolveAdvice = resolve;
    });

    const delayedBackend: Partial<Backend> = {
      getAdvice: vi.fn(async (_from, _to) => advicePromise),
    };

    // Concurrently trigger adding 3 tracks
    const p1 = useAppStore.getState().addToSetlist(trackA.id, delayedBackend as Backend);
    const p2 = useAppStore.getState().addToSetlist(trackB.id, delayedBackend as Backend);
    const p3 = useAppStore.getState().addToSetlist(trackC.id, delayedBackend as Backend);

    // Immediately, all 3 tracks should be present synchronously in the store
    const immediate = useAppStore.getState().setlist;
    expect(immediate.map((e) => e.track_id)).toEqual([trackA.id, trackB.id, trackC.id]);
    expect(immediate.map((e) => e.position)).toEqual([1, 2, 3]);

    // Resolve advice
    resolveAdvice(createMockAdvice('A', 'B'));
    await Promise.all([p1, p2, p3]);

    // After promises resolve, all tracks remain present and correctly indexed
    const final = useAppStore.getState().setlist;
    expect(final.map((e) => e.track_id)).toEqual([trackA.id, trackB.id, trackC.id]);
    expect(final.map((e) => e.position)).toEqual([1, 2, 3]);
  });

  it('Requirement 4: Stale transition advice does not replace advice for a newer adjacent pair in modal', async () => {
    // Set up setlist [A, B, C, D]
    useAppStore.setState({
      setlist: [
        { position: 1, track_id: trackA.id, track: trackA, transition: null, target_energy: 4 },
        { position: 2, track_id: trackB.id, track: trackB, transition: null, target_energy: 6 },
        { position: 3, track_id: trackC.id, track: trackC, transition: null, target_energy: 8 },
        { position: 4, track_id: trackD.id, track: trackD, transition: null, target_energy: 9 },
      ],
    });

    let resolveSlowAB: (adv: TransitionAdvice) => void = () => {};
    const slowPromiseAB = new Promise<TransitionAdvice>((resolve) => {
      resolveSlowAB = resolve;
    });

    const fastAdviceCD = createMockAdvice(trackC.id, trackD.id, 'Fast transition for C->D');

    const delayedBackend: Partial<Backend> = {
      getAdvice: vi.fn(async (fromId, toId) => {
        if (fromId === trackA.id && toId === trackB.id) {
          return slowPromiseAB;
        }
        return fastAdviceCD;
      }),
      listTracks: vi.fn(async () => [trackA, trackB, trackC, trackD]),
    };

    render(<SetlistView customBackend={delayedBackend as Backend} />);

    // Click on advice for A -> B
    const adviceButtons = screen.getAllByRole('button', {
      name: /transition advice between/i,
    });
    // First badge is A -> B
    fireEvent.click(adviceButtons[0]);

    // While A -> B is loading, user immediately clicks advice for C -> D (third badge)
    fireEvent.click(adviceButtons[2]);

    // C -> D resolves quickly and displays its notes
    await waitFor(() => {
      expect(screen.getByText(/Fast transition for C->D/)).toBeDefined();
    });

    // Now let the slow A -> B advice resolve
    resolveSlowAB(createMockAdvice(trackA.id, trackB.id, 'Slow transition for A->B'));

    // Wait a tick and verify: Modal MUST STILL display C -> D advice, NOT overridden by A -> B!
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText(/Fast transition for C->D/)).toBeDefined();
    expect(screen.queryByText(/Slow transition for A->B/)).toBeNull();
  });
});
