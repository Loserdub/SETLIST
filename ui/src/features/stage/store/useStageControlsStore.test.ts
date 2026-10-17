import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useStageControlsStore } from './useStageControlsStore';
import { useAppStore, scheduleActiveSetlistPersistence } from '../../../store/useAppStore';
import { mockPlaybackClient } from '../../../api/playback';
import * as api from '../../../api';
import type { Track } from '../../../bindings/Track';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

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
      cue_points: [
        { index: 0, time_ms: 15000, label: 'Drop 1', color_hex: '#00ffff', kind: 'HotCue', loop_end_ms: null },
        { index: 1, time_ms: 45000, label: 'Drop 2', color_hex: '#ffaa00', kind: 'HotCue', loop_end_ms: null },
      ],
      waveform: {
        points_per_sec: 10,
        low: { peak: [], rms: [] },
        mid: { peak: [], rms: [] },
        high: { peak: [], rms: [] },
      },
    },
  };
}

describe('useStageControlsStore - Volatile Queue & IPC Audio Transport Bridge', () => {
  let track1: Track;
  let track2: Track;
  let detourTrack: Track;
  let staticEntries: SetlistEntry[];
  const mockedInvoke = vi.mocked(invoke);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlaybackClient.reset();
    useStageControlsStore.getState().reset();

    track1 = createMockTrack('track-1', 'Starlight', 124, 6);
    track2 = createMockTrack('track-2', 'Midnight', 126, 7);
    detourTrack = createMockTrack('detour-1', 'Hyperdrive', 130, 9);

    staticEntries = [
      { position: 1, track_id: track1.id, track: track1, transition: null, target_energy: 6 },
      { position: 2, track_id: track2.id, track: track2, transition: null, target_energy: 7 },
    ];

    useAppStore.setState({
      setlist: [...staticEntries],
      stageCurrentIndex: 0,
      isStageMode: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hard-forks volatile stage queue from permanent studio setlist', () => {
    // Enter stage mode
    useAppStore.getState().enterStageMode();
    expect(useAppStore.getState().isStageMode).toBe(true);

    const liveSetlist = useStageControlsStore.getState().liveSetlist;
    expect(liveSetlist).toHaveLength(2);
    expect(liveSetlist[0].track_id).toBe('track-1');
    expect(liveSetlist[1].track_id).toBe('track-2');

    // Mutate via Detour Copilot: stageReplaceNextTrack
    useAppStore.getState().stageReplaceNextTrack(detourTrack);

    // Volatile queue must be updated
    const updatedLive = useStageControlsStore.getState().liveSetlist;
    expect(updatedLive).toHaveLength(2);
    expect(updatedLive[1].track_id).toBe('detour-1');

    // Permanent studio setlist must be completely untouched
    const permanentStudio = useAppStore.getState().setlist;
    expect(permanentStudio).toHaveLength(2);
    expect(permanentStudio[0].track_id).toBe('track-1');
    expect(permanentStudio[1].track_id).toBe('track-2');

    // Exit stage mode clears live volatile queue
    useAppStore.getState().exitStageMode();
    expect(useAppStore.getState().isStageMode).toBe(false);
    expect(useStageControlsStore.getState().liveSetlist).toHaveLength(0);
  });

  it('scheduleActiveSetlistPersistence strictly skips writes during Stage Mode', async () => {
    const saveActiveSetlistMock = vi.fn().mockResolvedValue(undefined);
    const mockBackend = {
      saveActiveSetlist: saveActiveSetlistMock,
    } as unknown as api.Backend;

    useAppStore.setState({ isStageMode: true });

    scheduleActiveSetlistPersistence(useAppStore.getState, mockBackend);

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(saveActiveSetlistMock).not.toHaveBeenCalled();
  });

  it('routes togglePlay to invoke("stage_toggle_play") in Tauri environment', async () => {
    vi.spyOn(api, 'isTauriEnvironment').mockReturnValue(true);
    mockedInvoke.mockResolvedValueOnce({
      is_playing: true,
      is_slip_mode: false,
      position_ms: 12500,
      duration_ms: 180000,
      context: 'live_stage',
    });

    await useStageControlsStore.getState().togglePlay();

    expect(mockedInvoke).toHaveBeenCalledWith('stage_toggle_play');
    expect(useStageControlsStore.getState().isPlaying).toBe(true);
    expect(useStageControlsStore.getState().positionMs).toBe(12500);
  });

  it('routes beatJump to invoke("stage_beat_jump") in Tauri environment', async () => {
    vi.spyOn(api, 'isTauriEnvironment').mockReturnValue(true);
    mockedInvoke.mockResolvedValueOnce({
      is_playing: true,
      is_slip_mode: false,
      position_ms: 14500,
      duration_ms: 180000,
      context: 'live_stage',
    });

    await useStageControlsStore.getState().beatJump(4, 126);

    expect(mockedInvoke).toHaveBeenCalledWith('stage_beat_jump', {
      beats: 4,
      bpm: 126,
    });
    expect(useStageControlsStore.getState().positionMs).toBe(14500);
  });

  it('routes triggerHotCue to invoke("stage_trigger_hot_cue") in Tauri environment', async () => {
    vi.spyOn(api, 'isTauriEnvironment').mockReturnValue(true);
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'playback_load') {
        return { duration_ms: 180000 };
      }
      if (cmd === 'stage_trigger_hot_cue') {
        return {
          is_playing: true,
          is_slip_mode: false,
          position_ms: 15000,
          duration_ms: 180000,
          context: 'live_stage',
        };
      }
      return {};
    });

    // Load track with cues
    await useStageControlsStore.getState().loadTrack(track1);
    expect(useStageControlsStore.getState().hotCues).toHaveLength(2);

    await useStageControlsStore.getState().triggerHotCue('A');

    expect(mockedInvoke).toHaveBeenCalledWith('stage_trigger_hot_cue', {
      positionMs: 15000,
      position_ms: 15000,
      cueId: 'A',
      cue_id: 'A',
    });
    expect(useStageControlsStore.getState().positionMs).toBe(15000);
  });

  it('routes toggleSlipMode to invoke("stage_toggle_slip_mode") in Tauri environment', async () => {
    vi.spyOn(api, 'isTauriEnvironment').mockReturnValue(true);
    mockedInvoke.mockResolvedValueOnce({
      is_playing: true,
      is_slip_mode: true,
      position_ms: 8000,
      duration_ms: 180000,
      context: 'live_stage',
    });

    await useStageControlsStore.getState().toggleSlipMode();

    expect(mockedInvoke).toHaveBeenCalledWith('stage_toggle_slip_mode');
    expect(useStageControlsStore.getState().isSlipMode).toBe(true);
  });
});
