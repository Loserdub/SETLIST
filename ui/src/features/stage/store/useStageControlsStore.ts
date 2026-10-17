import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { getPlaybackClient } from '../../../api/playback';
import { isTauriEnvironment } from '../../../api';
import type { Track } from '../../../bindings/Track';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';

export interface StageTransportStatePayload {
  is_playing: boolean;
  is_slip_mode: boolean;
  position_ms: number;
  duration_ms: number;
  context: 'studio_preview' | 'live_stage';
  slip_anchor_pos_ms?: number | null;
}

export interface CuePoint {
  id: string;
  name: string;
  positionMs: number;
  color: string;
}

export interface StageTrackAnalysis {
  cue_points?: Array<{
    index: number;
    time_ms: number;
    label: string;
    color_hex?: string;
  }>;
  [key: string]: unknown;
}

export interface StageTrackLike {
  id: string;
  duration_ms?: number | null;
  analysis?: StageTrackAnalysis | null;
}

export interface StageControlsState {
  // Transport
  isPlaying: boolean;
  isSlipMode: boolean;
  slipPositionMs: number | null; // Where the track would be if slip wasn't engaged
  slipAnchorTime: number | null;
  positionMs: number;
  durationMs: number;
  currentTrackId: string | null;

  // Cues
  mainStartCueMs: number;
  mixInCueMs: number | null;
  mixOutCueMs: number | null;
  hotCues: CuePoint[];

  // Flight Deck Auto-Advance / Manual Mode
  playMode: 'auto_advance' | 'manual_takeover';
  setPlayMode: (mode: 'auto_advance' | 'manual_takeover') => void;
  togglePlayMode: () => void;

  // Live Sequence & Detour Management (Quarantined from Studio Setlist)
  liveSetlist: SetlistEntry[];
  initLiveSetlist: (entries: SetlistEntry[]) => void;
  stageQueueTrackNext: (track: Track, currentStageIndex?: number) => void;
  stageReplaceNextTrack: (track: Track, currentStageIndex?: number) => void;

  // Actions
  loadTrack: (track: StageTrackLike | null) => Promise<void>;
  togglePlay: () => Promise<void>;
  setPlaying: (playing: boolean) => void;
  setPositionMs: (positionMs: number) => void;
  toggleSlipMode: () => Promise<void>;
  setMainStartCue: (posMs: number) => void;
  setMixInCue: (posMs: number | null) => void;
  setMixOutCue: (posMs: number | null) => void;
  setHotCue: (id: string, posMs: number, name: string, color: string) => void;
  triggerHotCue: (id: string) => Promise<void>;
  removeHotCue: (id: string) => void;
  beatJump: (beats: number, currentBpm?: number) => Promise<void>;
  reset: () => Promise<void>;
}

export const useStageControlsStore = create<StageControlsState>((set, get) => ({
  isPlaying: false,
  isSlipMode: false,
  slipPositionMs: null,
  slipAnchorTime: null,
  positionMs: 0,
  durationMs: 0,
  currentTrackId: null,

  playMode: 'manual_takeover',
  setPlayMode: (mode: 'auto_advance' | 'manual_takeover') => set({ playMode: mode }),
  togglePlayMode: () =>
    set((state) => ({
      playMode: state.playMode === 'auto_advance' ? 'manual_takeover' : 'auto_advance',
    })),

  // Live Sequence & Detour Management
  liveSetlist: [],
  initLiveSetlist: (entries: SetlistEntry[]) => {
    // Deep clone to ensure total isolation and zero mutation bleed into studio setlist
    set({ liveSetlist: JSON.parse(JSON.stringify(entries)) });
  },

  stageQueueTrackNext: (track: Track, currentStageIndex: number = 0) => {
    set((state) => {
      const nextIdx = currentStageIndex + 1;
      const newEntry: SetlistEntry = {
        position: nextIdx + 1,
        track_id: track.id,
        track,
        transition: null,
        target_energy: track.analysis?.energy_score ?? null,
      };
      const updated = [...state.liveSetlist];
      updated.splice(nextIdx, 0, newEntry);
      const reindexed = updated.map((e, idx) => ({ ...e, position: idx + 1 }));
      return { liveSetlist: reindexed };
    });
  },

  stageReplaceNextTrack: (track: Track, currentStageIndex: number = 0) => {
    set((state) => {
      const nextIdx = currentStageIndex + 1;
      const newEntry: SetlistEntry = {
        position: nextIdx + 1,
        track_id: track.id,
        track,
        transition: null,
        target_energy: track.analysis?.energy_score ?? null,
      };
      const updated = [...state.liveSetlist];
      if (nextIdx < updated.length) {
        updated[nextIdx] = newEntry;
      } else {
        updated.push(newEntry);
      }
      const reindexed = updated.map((e, idx) => ({ ...e, position: idx + 1 }));
      return { liveSetlist: reindexed };
    });
  },

  mainStartCueMs: 0,
  mixInCueMs: null,
  mixOutCueMs: null,
  hotCues: [],

  loadTrack: async (track: StageTrackLike | null) => {
    if (!track) {
      set({
        currentTrackId: null,
        positionMs: 0,
        durationMs: 0,
        isPlaying: false,
        isSlipMode: false,
        slipPositionMs: null,
        slipAnchorTime: null,
        hotCues: [],
      });
      return;
    }

    const client = getPlaybackClient();
    const trackDuration = track.duration_ms ?? 0;

    const cueLetters = ['A', 'B', 'C', 'D'];
    const colorClasses = ['bg-cyan-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500'];
    const loadedCues: CuePoint[] = [];

    if (track.analysis?.cue_points && Array.isArray(track.analysis.cue_points)) {
      for (const cp of track.analysis.cue_points) {
        if (cp.index >= 0 && cp.index < 4) {
          loadedCues.push({
            id: cueLetters[cp.index],
            name: cp.label || `Cue ${cueLetters[cp.index]}`,
            positionMs: cp.time_ms,
            color: colorClasses[cp.index],
          });
        }
      }
    }

    set({
      currentTrackId: track.id,
      positionMs: 0,
      durationMs: trackDuration,
      isPlaying: false,
      isSlipMode: false,
      slipPositionMs: null,
      slipAnchorTime: null,
      hotCues: loadedCues,
    });

    try {
      await client.load(track.id);
    } catch (err) {
      console.error('Failed to load track into playback client:', err);
    }
  },

  togglePlay: async () => {
    if (isTauriEnvironment()) {
      try {
        const res = await invoke<StageTransportStatePayload>('stage_toggle_play');
        set({
          isPlaying: res.is_playing,
          isSlipMode: res.is_slip_mode,
          positionMs: res.position_ms,
        });
        return;
      } catch (err) {
        console.error('Failed to toggle play via Tauri IPC:', err);
      }
    }

    const { isPlaying } = get();
    const client = getPlaybackClient();

    if (isPlaying) {
      try {
        await client.pause();
        set({ isPlaying: false });
      } catch (err) {
        console.error('Failed to pause audio:', err);
      }
    } else {
      try {
        await client.play();
        set({ isPlaying: true });
      } catch (err) {
        console.error('Failed to play audio:', err);
      }
    }
  },

  setPlaying: (playing: boolean) => set({ isPlaying: playing }),
  setPositionMs: (positionMs: number) => set({ positionMs }),

  toggleSlipMode: async () => {
    if (isTauriEnvironment()) {
      try {
        const res = await invoke<StageTransportStatePayload>('stage_toggle_slip_mode');
        set({
          isSlipMode: res.is_slip_mode,
          positionMs: res.position_ms,
        });
        return;
      } catch (err) {
        console.error('Failed to toggle slip mode via Tauri IPC:', err);
      }
    }

    const { isSlipMode, slipPositionMs, slipAnchorTime, isPlaying, durationMs } = get();
    const client = getPlaybackClient();

    if (isSlipMode) {
      // Slip Mode turned OFF -> snap back to virtual playhead if active
      if (slipPositionMs !== null && slipAnchorTime !== null && isPlaying) {
        const elapsed = performance.now() - slipAnchorTime;
        const maxDur = durationMs > 0 ? durationMs : 300000;
        const virtualPos = Math.min(maxDur, slipPositionMs + elapsed);
        set({
          isSlipMode: false,
          slipPositionMs: null,
          slipAnchorTime: null,
          positionMs: virtualPos,
        });
        try {
          await client.seek(virtualPos);
        } catch (err) {
          console.error('Failed to restore slip playback position:', err);
        }
      } else {
        set({
          isSlipMode: false,
          slipPositionMs: null,
          slipAnchorTime: null,
        });
      }
    } else {
      // Slip Mode turned ON
      set({
        isSlipMode: true,
        slipPositionMs: isPlaying ? get().positionMs : null,
        slipAnchorTime: isPlaying ? performance.now() : null,
      });
    }
  },

  setMainStartCue: (posMs) => set({ mainStartCueMs: posMs }),
  setMixInCue: (posMs) => set({ mixInCueMs: posMs }),
  setMixOutCue: (posMs) => set({ mixOutCueMs: posMs }),

  setHotCue: (id, posMs, name, color) =>
    set((state) => {
      const existing = state.hotCues.findIndex((c) => c.id === id);
      if (existing >= 0) {
        const newCues = [...state.hotCues];
        newCues[existing] = { id, name, positionMs: posMs, color };
        return { hotCues: newCues };
      }
      return { hotCues: [...state.hotCues, { id, name, positionMs: posMs, color }] };
    }),

  triggerHotCue: async (id: string) => {
    const cue = get().hotCues.find((c) => c.id === id);
    if (!cue) return;

    if (isTauriEnvironment()) {
      try {
        const res = await invoke<StageTransportStatePayload>('stage_trigger_hot_cue', {
          positionMs: cue.positionMs,
          position_ms: cue.positionMs,
          cueId: id,
          cue_id: id,
        });
        set({ positionMs: res.position_ms });
        return;
      } catch (err) {
        console.error(`Failed to trigger hot cue ${id} via Tauri IPC:`, err);
      }
    }

    const client = getPlaybackClient();
    const { isSlipMode, slipPositionMs, isPlaying } = get();

    if (isSlipMode && slipPositionMs === null && isPlaying) {
      set({
        slipPositionMs: get().positionMs,
        slipAnchorTime: performance.now(),
      });
    }

    set({ positionMs: cue.positionMs });
    try {
      await client.seek(cue.positionMs);
    } catch (err) {
      console.error(`Failed to trigger hot cue ${id}:`, err);
    }
  },

  removeHotCue: (id) =>
    set((state) => ({
      hotCues: state.hotCues.filter((c) => c.id !== id),
    })),

  beatJump: async (beats: number, currentBpm: number = 120) => {
    const bpm = currentBpm > 0 ? currentBpm : 120;

    if (isTauriEnvironment()) {
      try {
        const res = await invoke<StageTransportStatePayload>('stage_beat_jump', {
          beats,
          bpm,
        });
        set({ positionMs: res.position_ms });
        return;
      } catch (err) {
        console.error(`Failed to execute beat jump via Tauri IPC:`, err);
      }
    }

    const msPerBeat = 60000 / bpm;
    const jumpMs = beats * msPerBeat;

    const { positionMs, durationMs, isSlipMode, slipPositionMs, isPlaying } = get();
    const maxDur = durationMs > 0 ? durationMs : 300000;
    const targetMs = Math.max(0, Math.min(maxDur, positionMs + jumpMs));

    if (isSlipMode && slipPositionMs === null && isPlaying) {
      set({
        slipPositionMs: positionMs,
        slipAnchorTime: performance.now(),
      });
    }

    set({ positionMs: targetMs });
    const client = getPlaybackClient();
    try {
      await client.seek(targetMs);
    } catch (err) {
      console.error(`Failed to execute beat jump of ${beats} beats:`, err);
    }
  },

  reset: async () => {
    const client = getPlaybackClient();
    try {
      await client.stop();
    } catch {}
    set({
      isPlaying: false,
      isSlipMode: false,
      slipPositionMs: null,
      slipAnchorTime: null,
      positionMs: 0,
      durationMs: 0,
      currentTrackId: null,
      mainStartCueMs: 0,
      mixInCueMs: null,
      mixOutCueMs: null,
      hotCues: [],
      liveSetlist: [],
    });
  },
}));
