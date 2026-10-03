import type { CuePoint } from '../../bindings/CuePoint';
import type { Segment } from '../../bindings/Segment';

export interface TrackViewState {
  zoomLevel: number;
  scrollOffsetMs: number;
  playheadPositionMs: number | null;
}

export interface CueItemProps {
  cue: CuePoint;
  isActive: boolean;
  onSelect: (timeMs: number) => void;
}

export interface SegmentItemProps {
  segment: Segment;
  totalDurationMs: number;
}
