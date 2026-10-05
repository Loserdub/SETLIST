import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore';
import * as playbackModule from '../api/playback';

describe('useAppStore Audio Audition and Volume', () => {
  beforeEach(() => {
    useAppStore.setState({
      auditionTrackId: null,
      auditionState: 'stopped',
      auditionPositionMs: 0,
      auditionDurationMs: 0,
      masterVolume: 1.0,
      toasts: [],
    });
    vi.restoreAllMocks();
  });

  it('updates master volume and clamps value between 0 and 2', async () => {
    const setVolumeSpy = vi.spyOn(playbackModule.mockPlaybackClient, 'setVolume');

    await useAppStore.getState().setMasterVolume(0.75);
    expect(useAppStore.getState().masterVolume).toBe(0.75);
    expect(setVolumeSpy).toHaveBeenCalledWith(0.75);

    // Negative clamp
    await useAppStore.getState().setMasterVolume(-0.5);
    expect(useAppStore.getState().masterVolume).toBe(0);

    // Max clamp
    await useAppStore.getState().setMasterVolume(3.0);
    expect(useAppStore.getState().masterVolume).toBe(2);
  });

  it('handles audition failure safely and displays an error toast', async () => {
    vi.spyOn(playbackModule.mockPlaybackClient, 'load').mockRejectedValue(
      new Error('Audio file corrupted')
    );

    await useAppStore.getState().toggleAudition('test-track-fail');

    const state = useAppStore.getState();
    expect(state.auditionState).toBe('stopped');
    expect(state.auditionTrackId).toBeNull();
    expect(state.toasts.length).toBeGreaterThan(0);
    expect(state.toasts[0].type).toBe('error');
    expect(state.toasts[0].message).toBe('Audio playback failed');
    expect(state.toasts[0].details).toContain('Audio file corrupted');
  });

  it('clears audition track when playback-position event reports stopped at end', () => {
    useAppStore.setState({
      auditionTrackId: 'track-123',
      auditionState: 'playing',
      auditionDurationMs: 180000,
    });

    useAppStore.getState().syncAuditionPosition({
      position_ms: 180000,
      duration_ms: 180000,
      state: 'stopped',
      volume: 1.0,
      speed: 1.0,
    });

    const state = useAppStore.getState();
    expect(state.auditionState).toBe('stopped');
    expect(state.auditionTrackId).toBeNull();
  });
});
