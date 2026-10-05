import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { mockBackend } from '../../api';
import type { Track } from '../../bindings/Track';

describe('Setlist Undo / Redo Buffer (Stage 2 Workflow Optimization)', () => {
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
      setlistHistory: { past: [], future: [] },
      canUndoSetlist: false,
      canRedoSetlist: false,
      pins: { lockFirst: false, lockLast: false },
      tracks: [trackA, trackB, trackC, trackD],
      energyProfile: 'PeakPlateau',
      useMockBackend: true,
    });
  });

  it('starts with empty undo/redo stacks', () => {
    const state = useAppStore.getState();
    expect(state.canUndoSetlist).toBe(false);
    expect(state.canRedoSetlist).toBe(false);
    expect(state.setlistHistory.past).toHaveLength(0);
    expect(state.setlistHistory.future).toHaveLength(0);
  });

  it('records history on addToSetlist and allows undoing back to empty', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    expect(useAppStore.getState().setlist).toHaveLength(1);
    expect(useAppStore.getState().canUndoSetlist).toBe(true);
    expect(useAppStore.getState().canRedoSetlist).toBe(false);

    // Undo the addition
    useAppStore.getState().undoSetlist();
    expect(useAppStore.getState().setlist).toHaveLength(0);
    expect(useAppStore.getState().canUndoSetlist).toBe(false);
    expect(useAppStore.getState().canRedoSetlist).toBe(true);

    // Redo the addition
    useAppStore.getState().redoSetlist();
    expect(useAppStore.getState().setlist).toHaveLength(1);
    expect(useAppStore.getState().setlist[0].track_id).toBe(trackA.id);
    expect(useAppStore.getState().canUndoSetlist).toBe(true);
    expect(useAppStore.getState().canRedoSetlist).toBe(false);
  });

  it('handles multi-step history and clears future branch on new mutations', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    await useAppStore.getState().addToSetlist(trackC.id);

    expect(useAppStore.getState().setlist).toHaveLength(3);

    // Undo twice
    useAppStore.getState().undoSetlist();
    expect(useAppStore.getState().setlist).toHaveLength(2);
    useAppStore.getState().undoSetlist();
    expect(useAppStore.getState().setlist).toHaveLength(1);
    expect(useAppStore.getState().canRedoSetlist).toBe(true);

    // New mutation (branch divergence) clears the redo stack
    await useAppStore.getState().addToSetlist(trackD.id);
    expect(useAppStore.getState().setlist).toHaveLength(2);
    expect(useAppStore.getState().setlist[1].track_id).toBe(trackD.id);
    expect(useAppStore.getState().canRedoSetlist).toBe(false);
  });

  it('restores track pins along with setlist entries', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);

    // Set pins
    useAppStore.getState().setPins({ lockFirst: true, lockLast: true });
    expect(useAppStore.getState().pins).toEqual({ lockFirst: true, lockLast: true });

    // Undo pins change
    useAppStore.getState().undoSetlist();
    expect(useAppStore.getState().pins).toEqual({ lockFirst: false, lockLast: false });

    // Redo pins change
    useAppStore.getState().redoSetlist();
    expect(useAppStore.getState().pins).toEqual({ lockFirst: true, lockLast: true });
  });

  it('makes clearSetlist completely undoable', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    expect(useAppStore.getState().setlist).toHaveLength(2);

    useAppStore.getState().clearSetlist();
    expect(useAppStore.getState().setlist).toHaveLength(0);
    expect(useAppStore.getState().canUndoSetlist).toBe(true);

    useAppStore.getState().undoSetlist();
    expect(useAppStore.getState().setlist).toHaveLength(2);
    expect(useAppStore.getState().setlist[0].track_id).toBe(trackA.id);
    expect(useAppStore.getState().setlist[1].track_id).toBe(trackB.id);
  });

  it('records solver suggestOrder in history so DJs can 1-click revert', async () => {
    await useAppStore.getState().addToSetlist(trackA.id);
    await useAppStore.getState().addToSetlist(trackB.id);
    await useAppStore.getState().addToSetlist(trackC.id);

    const originalOrder = useAppStore.getState().setlist.map((e) => e.track_id);

    await useAppStore.getState().suggestOrder(mockBackend);

    // Verify undo restores original track sequence
    useAppStore.getState().undoSetlist();
    const restoredOrder = useAppStore.getState().setlist.map((e) => e.track_id);
    expect(restoredOrder).toEqual(originalOrder);
  });

  it('caps history stack to maximum 30 snapshots', async () => {
    // Perform 35 additions
    for (let i = 0; i < 35; i++) {
      const trackId = (i % 2 === 0 ? trackA : trackB).id;
      await useAppStore.getState().addToSetlist(trackId);
    }

    const { past } = useAppStore.getState().setlistHistory;
    expect(past.length).toBeLessThanOrEqual(30);
  });
});
