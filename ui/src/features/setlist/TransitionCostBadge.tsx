import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import type { TransitionType } from '../../bindings/TransitionType';
import { computeTransitionCost } from './costModel';
import { classifyTransitionCost } from './roles';
import { IconSparkles } from '../../components/icons';

interface TransitionCostBadgeProps {
  fromTrack?: Track | null;
  toTrack?: Track | null;
  transition: TransitionAdvice | null;
  fromTitle: string;
  toTitle: string;
  onOpenAdvice: () => void;
  onFindBridge?: () => void;
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
  onFindBridge,
}: TransitionCostBadgeProps) {
  const breakdown = computeTransitionCost(fromTrack, toTrack, transition);
  const verdictInfo = classifyTransitionCost(breakdown);

  // Formatted keys
  const keyAStr = fromTrack?.analysis?.key.camelot
    ? `${fromTrack.analysis.key.camelot.number}${fromTrack.analysis.key.camelot.letter}`
    : '-';
  const keyBStr = toTrack?.analysis?.key.camelot
    ? `${toTrack.analysis.key.camelot.number}${toTrack.analysis.key.camelot.letter}`
    : '-';

  // Formatted BPMs
  const bpmA = fromTrack?.analysis?.rhythm.grid.bpm
    ? Math.round(fromTrack.analysis.rhythm.grid.bpm)
    : 0;
  const bpmB = toTrack?.analysis?.rhythm.grid.bpm
    ? Math.round(toTrack.analysis.rhythm.grid.bpm)
    : 0;

  // Formatted Energy ratings (1-10)
  const energyA = fromTrack?.analysis?.energy_score ?? 5;
  const energyB = toTrack?.analysis?.energy_score ?? 5;
  const energyDiff = energyB - energyA;

  const typeLabel = transition
    ? TRANSITION_TYPE_LABELS[transition.transition_type] ?? 'Modulation'
    : 'Harmonic Alignment';

  const isHighCost = breakdown.isAvailable && breakdown.total >= 0.55;

  return (
    <div className="relative flex items-center justify-center my-1.5 px-4 group">
      {/* Physical sequence bus rail line */}
      <div className="absolute inset-x-8 h-px bg-linear-to-r from-transparent via-[#262626] to-transparent -z-0" />

      {/* Musical Transition Link Container */}
      <div
        className={`hw-coupler relative z-10 flex flex-wrap items-center justify-between gap-3 px-3.5 py-1.5 border transition-all shadow-md ${verdictInfo.badgeBgClass} ${verdictInfo.badgeBorderClass} rounded-none max-w-2xl w-full`}
      >
        {/* Left: Visible between-track relationships via typography, alignment, and subtle rules */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          {/* Key Shift: 08A → 09A */}
          <div
            className="flex items-center gap-1.5"
            title={`Harmonic shift: ${typeLabel}`}
          >
            <span className="font-bold text-white te-num">{keyAStr}</span>
            <span className="text-[#646472]">→</span>
            <span className="font-bold text-white te-num">{keyBStr}</span>
            <span className="text-xs text-[#9898a4] hidden sm:inline-block ml-0.5">
              ({typeLabel})
            </span>
          </div>

          {/* Subtle Divider Rule */}
          <span className="text-[#2b2b38]" aria-hidden="true">|</span>

          {/* BPM Shift: 126 → 127 */}
          <div
            className="flex items-center gap-1.5"
            title={
              breakdown.isAvailable
                ? `Tempo delta: ${breakdown.bpmDelta > 0 ? `+${breakdown.bpmDelta}` : breakdown.bpmDelta} BPM`
                : 'Tempo shift'
            }
          >
            <span className="text-white te-num font-medium">{bpmA > 0 ? bpmA : '-'}</span>
            <span className="text-[#646472]">→</span>
            <span className="text-white te-num font-medium">{bpmB > 0 ? bpmB : '-'}</span>
            {bpmA > 0 && bpmB > 0 && (
              <span className="text-xs text-[#9898a4] te-num ml-0.5">
                ({bpmB - bpmA >= 0 ? `+${bpmB - bpmA}` : `${bpmB - bpmA}`})
              </span>
            )}
          </div>

          {/* Subtle Divider Rule */}
          <span className="text-[#2b2b38]" aria-hidden="true">|</span>

          {/* Energy Shift: 6.8 → 7.9 */}
          <div
            className="flex items-center gap-1.5"
            title={`Energy trajectory shift: ${energyDiff >= 0 ? `+${energyDiff}` : energyDiff}`}
          >
            <span className="text-white te-num font-medium">E{energyA}</span>
            <span className="text-[#646472]">→</span>
            <span className="text-white te-num font-medium">E{energyB}</span>
            <span className="text-xs text-[#9898a4] te-num ml-0.5">
              ({energyDiff >= 0 ? `+${energyDiff}` : `${energyDiff}`})
            </span>
          </div>

          {/* Subtle Divider Rule */}
          <span className="text-[#2b2b38]" aria-hidden="true">|</span>

          {/* Musical Verdict in strong typography */}
          <div className="flex items-center gap-1.5 font-bold tracking-wider">
            <span className={`uppercase ${verdictInfo.textColorClass}`}>
              {verdictInfo.verdict}
            </span>
            <span className="text-[#444455]">·</span>
            <span className="text-xs font-normal text-[#9898a4] hidden md:inline-block">
              {verdictInfo.subLabel}
            </span>
          </div>
        </div>

        {/* Right: Actions (Advice inspector button & Bridge discovery trigger) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Find Bridge Button (Highly visible on high cost or rough jumps) */}
          {onFindBridge && (
            <button
              type="button"
              onClick={onFindBridge}
              className={`hw-btn px-2 py-0.5 text-xs font-mono uppercase tracking-wider font-semibold border transition-colors cursor-pointer flex items-center gap-1 rounded-none active:translate-y-[1px] focus-visible:ring-1 focus-visible:ring-[#38bdf8] focus-visible:outline-none ${
                isHighCost
                  ? 'border-amber-500/70 bg-amber-950/60 text-amber-300 hover:bg-amber-900/60'
                  : 'border-[#262626] bg-[#121212] text-[#cfcfcf] hover:text-white hover:border-[#38bdf8]'
              }`}
              title={`Discover intermediate bridge tracks connecting ${fromTitle} and ${toTitle}`}
            >
              <IconSparkles size={11} />
              <span>Find Bridge</span>
            </button>
          )}

          {/* Advice Button (Retaining exact aria-label and text for test assertions) */}
          <button
            type="button"
            onClick={onOpenAdvice}
            aria-label={`transition advice between ${fromTitle} and ${toTitle}`}
            className="hw-btn px-2.5 py-0.5 border border-[#2b2b2b] bg-[#141414] hover:bg-[#1f1f1f] text-[#ededed] hover:text-white transition-colors cursor-pointer text-xs font-mono rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none flex items-center gap-1 active:translate-y-[1px]"
            title={`Inspect DJ mixing technique and phrase advice between ${fromTitle} and ${toTitle}`}
          >
            <span>💡 Advice →</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default TransitionCostBadge;
