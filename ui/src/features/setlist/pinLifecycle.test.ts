import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { mockBackend } from '../../api';
import type { Track } from '../../bindings/Track';
import { isMovePermitted, applyPinsToOrderedIds } from './reorder';

describe('Pin Lifecycle and Constraint Uniformity (Task 4)', () => {
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
      pins: { lockFirst: false, lockLast: false },
      tracks: [trackA, trackB, trackC, trackD],
      energyProfile: 'PeakPlateau',
      useMockBackend: true,
    });
  });

  it('clearSetlist resets active pins so old pins do not apply to newly created setlist', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    await useAppStore.getState().addToSetlist(trackC.id);

    // Lock first and last tracks
    useAppStore.getState().setPins({ lockFirst: true, lockLast: true });
    expect(useAppStore.getState().pins).toEqual({ lockFirst: true, lockLast: true });

    // User clears the setlist
    useAppStore.getState().clearSetlist();
    expect(useAppStore.getState().setlist).toEqual([]);
    expect(useAppStore.getState().pins).toEqual({ lockFirst: false, lockLast: false });

    // Adding new tracks to fresh setlist starts with no silent pins
    await useAppStore.getState().addToSetlist(trackD.id);
    expect(useAppStore.getState().pins).toEqual({ lockFirst: false, lockLast: false });
  });

  it('loadSetlist resets active pins when loading or replacing a setlist', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    useAppStore.getState().setPins({ lockFirst: true, lockLast: false });
    expect(useAppStore.getState().pins.lockFirst).toBe(true);

    // Load an entirely new setlist
    useAppStore.getState().loadSetlist([
      { position: 1, track_id: trackC.id, track: trackC, transition: null, target_energy: 4 },
      { position: 2, track_id: trackD.id, track: trackD, transition: null, target_energy: 7 },
    ]);

    expect(useAppStore.getState().pins).toEqual({ lockFirst: false, lockLast: false });
  });

  it('removing the pinned opener track resets lockFirst', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    await useAppStore.getState().addToSetlist(trackC.id);

    useAppStore.getState().setPins({ lockFirst: true, lockLast: true });

    // Remove track at position 1 (trackA, the pinned opener)
    await useAppStore.getState().removeFromSetlist(1);

    const remaining = useAppStore.getState().setlist;
    expect(remaining.map((e) => e.track_id)).toEqual([trackB.id, trackC.id]);
    // lockFirst should be cleared because trackA was deleted; lockLast is still trackC
    expect(useAppStore.getState().pins).toEqual({ lockFirst: false, lockLast: true });
  });

  it('removing the pinned closer track resets lockLast', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    await useAppStore.getState().addToSetlist(trackC.id);

    useAppStore.getState().setPins({ lockFirst: true, lockLast: true });

    // Remove track at position 3 (trackC, the pinned closer)
    await useAppStore.getState().removeFromSetlist(3);

    const remaining = useAppStore.getState().setlist;
    expect(remaining.map((e) => e.track_id)).toEqual([trackA.id, trackB.id]);
    // lockLast should be cleared because trackC was deleted; lockFirst is still trackA
    expect(useAppStore.getState().pins).toEqual({ lockFirst: true, lockLast: false });
  });

  it('shrinking setlist to one track or zero tracks resets all pins', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    useAppStore.getState().setPins({ lockFirst: true, lockLast: true });

    // Remove track 2 -> setlist now has 1 track
    await useAppStore.getState().removeFromSetlist(2);
    expect(useAppStore.getState().setlist.length).toBe(1);
    expect(useAppStore.getState().pins).toEqual({ lockFirst: false, lockLast: false });

    // Remove the remaining track -> setlist now has 0 tracks
    await useAppStore.getState().removeFromSetlist(1);
    expect(useAppStore.getState().setlist.length).toBe(0);
    expect(useAppStore.getState().pins).toEqual({ lockFirst: false, lockLast: false });
  });

  it('centralized pin validation prevents setting pins on setlists with <= 1 tracks', () => {
    // 0 tracks
    useAppStore.getState().setPins({ lockFirst: true, lockLast: true });
    expect(useAppStore.getState().pins).toEqual({ lockFirst: false, lockLast: false });

    // 1 track
    useAppStore.setState({
      setlist: [{ position: 1, track_id: trackA.id, track: trackA, transition: null, target_energy: 5 }],
    });
    useAppStore.getState().setPins({ lockFirst: true, lockLast: true });
    expect(useAppStore.getState().pins).toEqual({ lockFirst: false, lockLast: false });
  });

  it('drag reorder, suggest order, and manual moves obey identical pin constraint rules', () => {
    const pins = { lockFirst: true, lockLast: false };

    // 1. Move check: cannot move track 0 or into track 0
    expect(isMovePermitted(0, 1, 3, pins)).toBe(false);
    expect(isMovePermitted(1, 0, 3, pins)).toBe(false);
    expect(isMovePermitted(1, 2, 3, pins)).toBe(true);

    // 2. Suggest order check: original first track remains at position 0
    const original = ['A', 'B', 'C'];
    const solver = ['C', 'A', 'B'];
    const constrained = applyPinsToOrderedIds(original, solver, pins);
    expect(constrained[0]).toBe('A');

    // 3. Both pins active: position 0 and position N-1 fixed
    const bothPins = { lockFirst: true, lockLast: true };
    expect(isMovePermitted(2, 1, 3, bothPins)).toBe(false); // index 2 is closer (totalCount - 1)
    const bothConstrained = applyPinsToOrderedIds(original, solver, bothPins);
    expect(bothConstrained[0]).toBe('A');
    expect(bothConstrained[2]).toBe('C');
  });
});
