import type { StateCreator } from 'zustand';
import type { AppState, PlaybackSlice } from '../types';
import { getPlaybackClient } from '../../api/playback';
import { isTauriEnvironment } from '../../api';

export const createPlaybackSlice: StateCreator<
  AppState,
  [],
  [],
  PlaybackSlice
> = (set, get) => ({
  auditionTrackId: null,
  auditionState: 'stopped',
  auditionPositionMs: 0,
  auditionDurationMs: 0,
  auditionSpeed: 1.0,
  masterVolume: 1.0,

  setMasterVolume: async (volume: number) => {
    const clamped = Math.max(0.0, Math.min(2.0, volume));
    set({ masterVolume: clamped });
    const client = getPlaybackClient();
    await client.setVolume(clamped);
  },

  toggleAudition: async (trackId) => {
    const { auditionTrackId, auditionState, tracks, addToast } = get();
    const targetId = trackId ?? auditionTrackId;
    if (!targetId) return;

    if (isTauriEnvironment() && !get().useMockBackend && targetId.startsWith('mock-')) {
      addToast({
        type: 'info',
        message: 'Benchmark tracks are synthetic and cannot be auditioned from local audio.',
      });
      return;
    }

    const client = getPlaybackClient();
    try {
      if (auditionTrackId === targetId && auditionState === 'playing') {
        set({ auditionState: 'paused' });
        await client.pause();
      } else if (auditionTrackId === targetId && auditionState === 'paused') {
        set({ auditionState: 'playing' });
        await client.play();
      } else {
        const foundTrack = tracks.find((t) => t.id === targetId);
        const dur = foundTrack?.duration_ms || 180000;
        set({
          auditionTrackId: targetId,
          auditionState: 'playing',
          auditionDurationMs: dur,
          auditionPositionMs: 0,
        });
        const loadRes = await client.load(targetId);
        if (loadRes?.duration_ms) {
          set({ auditionDurationMs: loadRes.duration_ms });
        }
        await client.play();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Audio audition error:', errMsg);
      set({
        auditionState: 'stopped',
        auditionTrackId: null,
        auditionPositionMs: 0,
      });
      addToast({
        type: 'error',
        message: 'Audio playback failed',
        details: errMsg,
      });
    }
  },

  seekAudition: async (positionMs) => {
    const client = getPlaybackClient();
    await client.seek(positionMs);
    set({ auditionPositionMs: positionMs });
  },

  setAuditionSpeed: async (speed) => {
    const client = getPlaybackClient();
    await client.setSpeed(speed);
    set({ auditionSpeed: speed });
  },

  stopAudition: async () => {
    set({
      auditionTrackId: null,
      auditionState: 'stopped',
      auditionPositionMs: 0,
    });
    const client = getPlaybackClient();
    await client.stop();
  },

  syncAuditionPosition: (payload) => {
    const isFinished =
      payload.state === 'stopped' &&
      payload.duration_ms > 0 &&
      payload.position_ms >= payload.duration_ms;
    set({
      auditionState: payload.state,
      auditionPositionMs: payload.position_ms,
      auditionDurationMs: payload.duration_ms,
      auditionSpeed: payload.speed && payload.speed > 0 ? payload.speed : get().auditionSpeed,
      ...(isFinished ? { auditionTrackId: null } : {}),
    });
  },
});
