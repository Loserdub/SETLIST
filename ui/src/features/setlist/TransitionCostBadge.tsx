import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import type { TransitionType } from '../../bindings/TransitionType';
import { computeTransitionCost } from './costModel';

interface TransitionCostBadgeProps {
  fromTrack?: Track | null;
  toTrack?: Track | null;
  transition: TransitionAdvice | null;
  fromTitle: string;
  toTitle: string;
  onOpenAdvice: () => void;
}

const TRANSITION_TYPE_LABELS: Record<TransitionType, string> = {
  ExactMatch: 'Exact Match (0)',
  RelativeSwitch: 'Relative Switch',
  Fifth: 'Harmonic 5th (±1)',
  WholeStepLift: 'Whole-Step (+2)',
  HalfStepLift: 'Half-Step (+1)',
  Tritone: 'Tritone Shift (+6)',
  Other: 'Modulation',
};

export function TransitionCostBadge({
  fromTrack = null,
  toTrack = null,
  transition,
  fromTitle,
  toTitle,
  onOpenAdvice,
}: TransitionCostBadgeProps) {
  if (!transition) {
    return (
      <div className="relative flex items-center justify-center my-1 group">
        <div className="absolute inset-x-0 h-px bg-[#181818] -z-0" />
        <button
          type="button"
          onClick={onOpenAdvice}
          aria-label={`Transition advice between ${fromTitle} and ${toTitle}`}
          className="relative z-10 flex items-center gap-2 px-2.5 py-0.5 border border-[#222222] bg-[#0c0c0c] hover:border-[#333333] hover:bg-[#141414] transition-colors cursor-pointer text-xs font-mono rounded-none text-[#777777]"
          title={`Inspect transition between ${fromTitle} and ${toTitle}`}
        >
          <span className="text-[10px] uppercase tracking-wider text-[#666666]">Transition</span>
          <span className="text-[10px] text-[#aaaaaa] border border-[#282828] bg-[#141414] px-1 py-0.2 tracking-wider">
            💡 Advice →
          </span>
        </button>
      </div>
    );
  }

  const breakdown = computeTransitionCost(fromTrack, toTrack, transition);
  const typeLabel = TRANSITION_TYPE_LABELS[transition.transition_type] ?? 'Modulation';

  return (
    <div className="relative flex items-center justify-center my-1 group">
      {/* 1px Connector line */}
      <div className="absolute inset-x-0 h-px bg-[#181818] -z-0" />

      {/* Interactive DAW Transition Readout */}
      <button
        type="button"
        onClick={onOpenAdvice}
        aria-label={`Transition advice between ${fromTitle} and ${toTitle}`}
        className="relative z-10 flex flex-wrap items-center gap-2.5 px-3 py-1 border border-[#222222] bg-[#0b0b0b] hover:border-[#383838] hover:bg-[#121212] transition-colors cursor-pointer rounded-none text-xs font-mono"
        title={`Click for transition details between ${fromTitle} and ${toTitle}`}
      >
        {/* Transition Category */}
        <span className="text-[10px] uppercase font-semibold tracking-wider text-[#cccccc]">
          {typeLabel}
        </span>

        <span className="text-[#333333]">|</span>

        {/* Cost breakdown components: Total, Tempo, Key, Energy */}
        {breakdown.isAvailable ? (
          <div className="flex items-center gap-2 text-[10px] text-[#777777] tabular-nums">
            <span title={`Overall Weighted Cost: ${breakdown.total.toFixed(2)}`}>
              Cost: <span className="font-semibold text-[#e0e0e0]">{breakdown.total.toFixed(2)}</span>
            </span>
            <span className="text-[#333333]">•</span>
            <span title={`ΔBPM: ${breakdown.bpmDelta > 0 ? `+${breakdown.bpmDelta}` : breakdown.bpmDelta}`}>
              ΔBPM: <span className="text-[#b0b0b0]">{breakdown.bpmDelta > 0 ? `+${breakdown.bpmDelta}` : breakdown.bpmDelta}</span>
            </span>
            <span className="text-[#333333]">•</span>
            <span title={`Key distance: d=${breakdown.keyDistance}${breakdown.modeFlip ? ' (mode flip)' : ''}`}>
              Key: <span className="text-[#b0b0b0]">d={breakdown.keyDistance}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[10px] text-[#888888]">
            <span>Cost: Pending Analysis</span>
          </div>
        )}

        {/* Advice Action Tag (retains 💡 Advice for test expectations) */}
        <span className="text-[9px] uppercase tracking-wider text-[#a0a0a0] border border-[#262626] bg-[#141414] px-1.5 py-0.5">
          💡 Advice →
        </span>
      </button>
    </div>
  );
}

export default TransitionCostBadge;
