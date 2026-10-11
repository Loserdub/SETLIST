import { create } from 'zustand';

export interface CuePoint {
  id: string;
  name: string;
  positionMs: number;
  color: string;
}

export interface StageControlsState {
  // Transport
  isPlaying: boolean;
  isSlipMode: boolean;
  slipPositionMs: number | null; // Where the track would be if slip wasn't engaged
  
  // Cues
  mainStartCueMs: number;
  mixInCueMs: number | null;
  mixOutCueMs: number | null;
  hotCues: CuePoint[];

  // Actions
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  toggleSlipMode: () => void;
  setMainStartCue: (posMs: number) => void;
  setMixInCue: (posMs: number | null) => void;
  setMixOutCue: (posMs: number | null) => void;
  setHotCue: (id: string, posMs: number, name: string, color: string) => void;
  triggerHotCue: (id: string) => void;
  removeHotCue: (id: string) => void;
  beatJump: (beats: number, currentBpm: number) => void;
}

export const useStageControlsStore = create<StageControlsState>((set) => ({
  isPlaying: false,
  isSlipMode: false,
  slipPositionMs: null,
  
  mainStartCueMs: 0,
  mixInCueMs: null,
  mixOutCueMs: null,
  hotCues: [],

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (playing: boolean) => set({ isPlaying: playing }),
  
  toggleSlipMode: () => set((state) => ({ 
    isSlipMode: !state.isSlipMode, 
    // Clear slip position if turning off
    slipPositionMs: null 
  })),
  
  setMainStartCue: (posMs) => set({ mainStartCueMs: posMs }),
  setMixInCue: (posMs) => set({ mixInCueMs: posMs }),
  setMixOutCue: (posMs) => set({ mixOutCueMs: posMs }),
  
  setHotCue: (id, posMs, name, color) => set((state) => {
    const existing = state.hotCues.findIndex(c => c.id === id);
    if (existing >= 0) {
      const newCues = [...state.hotCues];
      newCues[existing] = { id, name, positionMs: posMs, color };
      return { hotCues: newCues };
    }
    return { hotCues: [...state.hotCues, { id, name, positionMs: posMs, color }] };
  }),
  
  triggerHotCue: (id) => {
    // In a full implementation, this triggers IPC to seek the audio engine.
    console.log(`Triggered hot cue: ${id}`);
  },

  removeHotCue: (id) => set((state) => ({
    hotCues: state.hotCues.filter(c => c.id !== id)
  })),
  
  beatJump: (beats, currentBpm) => {
    if (currentBpm <= 0) return;
    const msPerBeat = 60000 / currentBpm;
    const jumpMs = beats * msPerBeat;
    // In a full implementation, this triggers IPC to jump the audio engine.
    console.log(`Beat jump by ${beats} beats (${jumpMs.toFixed(2)} ms)`);
  }
}));
