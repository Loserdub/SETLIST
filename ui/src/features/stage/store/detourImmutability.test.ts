import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../../store/useAppStore';
import { useStageControlsStore } from './useStageControlsStore';
import type { Track } from '../../../bindings/Track';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';

function createMockTrack(id: string, title: string, bpm: number, energy: number): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    hash: `hash-${id}`,
    duration_ms: 180000,
    analyzed_at: '2026-10-02T12:00:00Z',
    analysis_version: '1.0.0',
    tags: {
      title,
      artist: 'Test Artist',
      album: 'Test Album',
    },
    analysis: {
      loudness: {
        integrated_lufs: -10.0,
        loudness_range: 5.0,
        true_peak: -0.5,
      },
      rhythm: {
        grid: {
          bpm,
          first_downbeat_ms: 0,
          beats_ms: [0, 500, 1000, 1500],
          downbeat_flags: [true, false, false, false],
          steady: true,
        },
        bpm_alternates: [],
      },
      key: {
        pitch_class: 0,
        mode: 'Minor',
        camelot: {
          number: 8,
          letter: 'A',
        },
        tuning_cents: 0,
      },
      dynamics: {
        frame_rate: 10,
        rms_curve: [],
        low_ratio_curve: [],
        centroid_curve: [],
      },
      energy_score: energy,
      energy_curve: {
        per_bar: [],
      },
      segments: [],
      cue_points: [],
      waveform: {
        points_per_sec: 10,
        low: { peak: [], rms: [] },
        mid: { peak: [], rms: [] },
        high: { peak: [], rms: [] },
      },
    },
  };
}

describe('Setlist Immutability During Live Detour Injections', () => {
  let track1: Track;
  let track2: Track;
  let track3: Track;
  let detourLiftTrack: Track;
  let detourResetTrack: Track;
  let staticEntries: SetlistEntry[];

  beforeEach(() => {
    track1 = createMockTrack('track-1', 'Opening Groove', 124, 5);
    track2 = createMockTrack('track-2', 'Mid Building', 126, 7);
    track3 = createMockTrack('track-3', 'Peak Climax', 128, 9);
    detourLiftTrack = createMockTrack('detour-lift', 'High Voltage Pivot', 130, 10);
    detourResetTrack = createMockTrack('detour-reset', 'Ambient Breath', 120, 3);

    staticEntries = [
      { position: 1, track_id: track1.id, track: track1, transition: null, target_energy: 5 },
      { position: 2, track_id: track2.id, track: track2, transition: null, target_energy: 7 },
      { position: 3, track_id: track3.id, track: track3, transition: null, target_energy: 9 },
    ];

    useAppStore.setState({
      setlist: [...staticEntries],
      stageCurrentIndex: 0,
      isStageMode: true,
    });

    useStageControlsStore.setState({
      liveSetlist: [],
    });
    useStageControlsStore.getState().initLiveSetlist(staticEntries);
  });

  it('preserves static studio setlist when stageQueueTrackNext inserts a detour track', () => {
    // Initial snapshot of studio setlist
    const initialStaticSetlist = useAppStore.getState().setlist;
    expect(initialStaticSetlist).toHaveLength(3);
    expect(initialStaticSetlist[0].track_id).toBe('track-1');
    expect(initialStaticSetlist[1].track_id).toBe('track-2');
    expect(initialStaticSetlist[2].track_id).toBe('track-3');

    // Live stage action: insert detour track after current playing index (0)
    useAppStore.getState().stageQueueTrackNext(detourLiftTrack);

    // CRITICAL: Studio setlist in useAppStore must be 100% IMMUTABLE!
    const postActionStaticSetlist = useAppStore.getState().setlist;
    expect(postActionStaticSetlist).toHaveLength(3);
    expect(postActionStaticSetlist[0].track_id).toBe('track-1');
    expect(postActionStaticSetlist[1].track_id).toBe('track-2');
    expect(postActionStaticSetlist[2].track_id).toBe('track-3');
    expect(postActionStaticSetlist[1].position).toBe(2);

    // Verify live stage controls store received the inserted track
    const liveSetlist = useStageControlsStore.getState().liveSetlist;
    expect(liveSetlist).toHaveLength(4);
    expect(liveSetlist[0].track_id).toBe('track-1');
    expect(liveSetlist[1].track_id).toBe('detour-lift');
    expect(liveSetlist[2].track_id).toBe('track-2');
    expect(liveSetlist[3].track_id).toBe('track-3');
    expect(liveSetlist[1].position).toBe(2);
    expect(liveSetlist[2].position).toBe(3);
  });

  it('preserves static studio setlist when stageReplaceNextTrack swaps upcoming track', () => {
    const initialStaticSetlist = useAppStore.getState().setlist;
    expect(initialStaticSetlist).toHaveLength(3);
    expect(initialStaticSetlist[1].track_id).toBe('track-2');

    // Live stage action: swap upcoming track at position 2 with floor reset track
    useAppStore.getState().stageReplaceNextTrack(detourResetTrack);

    // CRITICAL: Studio setlist in useAppStore must be 100% IMMUTABLE!
    const postActionStaticSetlist = useAppStore.getState().setlist;
    expect(postActionStaticSetlist).toHaveLength(3);
    expect(postActionStaticSetlist[0].track_id).toBe('track-1');
    expect(postActionStaticSetlist[1].track_id).toBe('track-2');
    expect(postActionStaticSetlist[2].track_id).toBe('track-3');

    // Verify live stage controls store reflects the swapped upcoming track
    const liveSetlist = useStageControlsStore.getState().liveSetlist;
    expect(liveSetlist).toHaveLength(3);
    expect(liveSetlist[0].track_id).toBe('track-1');
    expect(liveSetlist[1].track_id).toBe('detour-reset');
    expect(liveSetlist[2].track_id).toBe('track-3');
  });

  it('handles multiple successive live detours without any mutation leakage to useAppStore', () => {
    // 1. Queue a lift detour
    useAppStore.getState().stageQueueTrackNext(detourLiftTrack);
    // 2. Advance stage current index to the newly playing track
    useAppStore.setState({ stageCurrentIndex: 1 });
    // 3. Queue a reset detour
    useAppStore.getState().stageQueueTrackNext(detourResetTrack);

    // Studio setlist must remain strictly untouched
    const staticSetlist = useAppStore.getState().setlist;
    expect(staticSetlist).toHaveLength(3);
    expect(staticSetlist.map((e) => e.track_id)).toEqual(['track-1', 'track-2', 'track-3']);

    // Live setlist accommodates all stage interventions
    const liveSetlist = useStageControlsStore.getState().liveSetlist;
    expect(liveSetlist).toHaveLength(5);
    expect(liveSetlist.map((e) => e.track_id)).toEqual([
      'track-1',
      'detour-lift',
      'detour-reset',
      'track-2',
      'track-3',
    ]);
  });
});
