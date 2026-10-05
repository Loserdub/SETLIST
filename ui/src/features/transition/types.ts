import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';

/**
 * Performance plan cards describing the transition execution strategy.
 */
export interface PerformancePlan {
  /**
   * ENTER directive: when and where the incoming track enters.
   * Example: "Track 04 at BREAKDOWN (01:14)"
   */
  enter: string;
  /**
   * LOW END directive: bass and filter management strategy.
   * Example: "Keep incoming bass reduced until bar 16"
   */
  lowEnd: string;
  /**
   * RELEASE directive: moment the incoming track is fully released into the mix.
   * Example: "Open incoming low-end at DROP (01:45)"
   */
  release: string;
  /**
   * Recommended phrase length in bars (8, 16, or 32).
   */
  phraseBars: number;
  /**
   * Estimated duration of the transition in seconds based on BPM.
   */
  transitionDurationSec: number;
  /**
   * Recommended mix-out point on outgoing track.
   */
  outPoint: {
    label: string;
    timeMs: number;
    barNumber?: number;
  };
  /**
   * Recommended mix-in point on incoming track.
   */
  inPoint: {
    label: string;
    timeMs: number;
    barNumber?: number;
  };
  /**
   * Actionable musical notes and tips for the DJ.
   */
  guidanceNotes: string[];
}

/**
 * Props for the Transition Lab modal / workspace.
 */
export interface TransitionLabModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackA: Track | null;
  trackB: Track | null;
  posA?: number;
  posB?: number;
  advice: TransitionAdvice | null;
  isLoading?: boolean;
  error?: string | null;
  /**
   * Optional callback when an override is saved to refresh setlist state.
   */
  onOverrideSaved?: () => Promise<void>;
  /**
   * Optional custom transition notes passed from active setlist item.
   */
  initialCustomNotes?: string[];
  /**
   * Optional callback when custom transition notes are updated.
   */
  onSaveCustomNotes?: (notes: string[]) => void;
}

/**
 * Filtered structural marker for waveform overlay.
 */
export interface StructuralMarker {
  id: string;
  label: string;
  type: 'cue' | 'segment';
  timeMs: number;
  endMs?: number;
  colorHex: string;
  barNumber?: number;
}
