import { create } from 'zustand';

export interface TrackStateStore {
  zoomLevel: number;
  scrollOffsetMs: number;
  playheadPositionMs: number | null;
  setZoomLevel: (zoom: number) => void;
  setScrollOffsetMs: (offset: number) => void;
  setPlayheadPositionMs: (pos: number | null) => void;
  jumpToTime: (timeMs: number, totalDurationMs: number, centerInView?: boolean) => void;
  resetView: () => void;
}

export const useTrackState = create<TrackStateStore>((set, get) => ({
  zoomLevel: 1.0,
  scrollOffsetMs: 0,
  playheadPositionMs: 0,

  setZoomLevel: (zoomLevel: number) =>
    set({ zoomLevel: Math.max(1.0, Math.min(64.0, zoomLevel)) }),

  setScrollOffsetMs: (scrollOffsetMs: number) =>
    set({ scrollOffsetMs: Math.max(0, scrollOffsetMs) }),

  setPlayheadPositionMs: (playheadPositionMs: number | null) =>
    set({ playheadPositionMs }),

  jumpToTime: (timeMs: number, totalDurationMs: number, centerInView: boolean = true) => {
    const { zoomLevel } = get();
    const visibleDuration = totalDurationMs / zoomLevel;
    let newStart = 0;
    if (centerInView) {
      newStart = Math.max(0, Math.min(totalDurationMs - visibleDuration, timeMs - visibleDuration / 2));
    } else {
      newStart = Math.max(0, Math.min(totalDurationMs - visibleDuration, timeMs));
    }
    set({
      playheadPositionMs: timeMs,
      scrollOffsetMs: newStart,
    });
  },

  resetView: () =>
    set({
      zoomLevel: 1.0,
      scrollOffsetMs: 0,
      playheadPositionMs: 0,
    }),
}));
