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
          className="relative z-10 flex items-center gap-2 px-2.5 py-0.5 border border-[#222222] bg-[#0c0c0c] hover:border-[#333333] hover:bg-[#141414] transition-colors cursor-pointer text-xs font-mono rounded-none text-[#a8a8a8] focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
          title={`Inspect transition between ${fromTitle} and ${toTitle}`}
        >
          <span className="text-xs uppercase tracking-wider text-[#a8a8a8]">Transition</span>
          <span className="text-xs text-[#cfcfcf] border border-[#282828] bg-[#141414] px-1.5 py-0.5 tracking-wider">
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
        className="relative z-10 flex flex-wrap items-center gap-2.5 px-3 py-1 border border-[#222222] bg-[#0b0b0b] hover:border-[#383838] hover:bg-[#121212] transition-colors cursor-pointer rounded-none text-xs font-mono focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
        title={`Click for transition details between ${fromTitle} and ${toTitle}`}
      >
        {/* Transition Category */}
        <span className="text-xs uppercase font-semibold tracking-wider text-[#cfcfcf]">
          {typeLabel}
        </span>

        <span className="text-[#333333]">|</span>

        {/* Cost breakdown components: Total, Tempo, Key, Energy */}
        {breakdown.isAvailable ? (
          <div className="flex items-center gap-2 text-xs text-[#a8a8a8] tabular-nums">
            <span title={`Overall Weighted Cost: ${breakdown.total.toFixed(2)}`}>
              Cost: <span className="font-semibold text-[#e0e0e0]">{breakdown.total.toFixed(2)}</span>
            </span>
            <span className="text-[#333333]">•</span>
            <span title={`ΔBPM: ${breakdown.bpmDelta > 0 ? `+${breakdown.bpmDelta}` : breakdown.bpmDelta}`}>
              ΔBPM: <span className="text-[#cfcfcf]">{breakdown.bpmDelta > 0 ? `+${breakdown.bpmDelta}` : breakdown.bpmDelta}</span>
            </span>
            <span className="text-[#333333]">•</span>
            <span title={`Key distance: d=${breakdown.keyDistance}${breakdown.modeFlip ? ' (mode flip)' : ''}`}>
              Key: <span className="text-[#cfcfcf]">d={breakdown.keyDistance}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-[#a8a8a8]">
            <span>Cost: Pending Analysis</span>
          </div>
        )}

        {/* Advice Action Tag (retains 💡 Advice for test expectations) */}
        <span className="text-xs uppercase tracking-wider text-[#cfcfcf] border border-[#262626] bg-[#141414] px-1.5 py-0.5">
          💡 Advice →
        </span>
      </button>
    </div>
  );
}

export default TransitionCostBadge;
