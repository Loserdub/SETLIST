import type { SetlistEntry } from '../../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../../bindings/TransitionAdvice';

export interface StageActionPrompterProps {
  currentEntry: SetlistEntry | null;
  nextEntry: SetlistEntry | null;
  transition: TransitionAdvice | null;
  barsToOutro?: number | null;
}

/**
 * StageActionPrompter — Tactical Heads-Up Prompter for Physical Stage Actions.
 *
 * Alerts the performer in advance to upcoming physical tasks:
 * - Instrument retuning & capo positions (Pioneer Amber)
 * - Spoken banter & mic cues (Serato Red)
 * - Transition intervention directives & mix techniques
 * - Mix-out window arrivals
 */
export function StageActionPrompter({
  currentEntry,
  nextEntry,
  transition,
  barsToOutro,
}: StageActionPrompterProps) {
  if (!currentEntry && !nextEntry) {
    return null;
  }

  // Detect tuning change on next entry
  const isNextTuning = nextEntry?.track_id.startsWith('tuning:');
  const tuningDetails = isNextTuning ? nextEntry?.track_id.replace('tuning:', '') : null;

  // Detect banter on next entry
  const isNextBanter = nextEntry?.track_id.startsWith('banter:');
  const banterTopic = isNextBanter ? nextEntry?.track_id.replace('banter:', '') : null;

  // Detect intervention or transition notes
  const interventionRequired = transition?.intervention_required ?? false;
  const transitionType = transition?.transition_type
    ? transition.transition_type.replace(/([A-Z])/g, ' $1').trim()
    : null;
  const primaryNote = transition?.notes && transition.notes.length > 0 ? transition.notes[0] : null;

  // Detect active mix-out window
  const isMixOutWindow = barsToOutro !== null && barsToOutro !== undefined && barsToOutro <= 8;

  return (
    <div
      className="w-full bg-[#0d0e12] border border-[#22242c] rounded-sm p-3 flex flex-col gap-2 font-mono shadow-sm"
      data-testid="stage-action-prompter"
    >
      <div className="flex items-center justify-between text-[11px] text-[#94a3b8]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
          <span className="font-bold uppercase tracking-wider text-[#cbd5e1]">
            STAGE ACTION PROMPTER
          </span>
        </div>
        <span className="text-[10px] text-[#64748b]">TELEMETRY & DIRECTIVES</span>
      </div>

      <div className="flex flex-col gap-2">
        {/* 1. Instrument Retuning Alert */}
        {isNextTuning && (
          <div
            className="p-2.5 bg-[#2b180d] border border-[#f59e0b] rounded-sm flex items-center justify-between gap-3 text-xs"
            data-testid="prompter-tuning-alert"
          >
            <div className="flex items-center gap-2 text-[#fbbf24]">
              <span className="text-sm">🎸</span>
              <span className="font-bold uppercase tracking-wider">
                PREPARE INSTRUMENT: {tuningDetails || 'Target Tuning Adjustment'}
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-[#451a03] text-[#fde68a] font-bold uppercase rounded-sm">
              UPCOMING NEXT
            </span>
          </div>
        )}

        {/* 2. Spoken Banter / Mic Alert */}
        {isNextBanter && (
          <div
            className="p-2.5 bg-[#2d0f12] border border-[#ef4444] rounded-sm flex items-center justify-between gap-3 text-xs"
            data-testid="prompter-mic-alert"
          >
            <div className="flex items-center gap-2 text-[#fca5a5]">
              <span className="text-sm">🎙</span>
              <span className="font-bold uppercase tracking-wider">
                LIVE MIC CUE: {banterTopic || 'Stage Announcement'}
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-[#450a0a] text-[#fecaca] font-bold uppercase rounded-sm">
              SPOKEN WORD
            </span>
          </div>
        )}

        {/* 3. Transition Technique Directive */}
        {transition && (
          <div
            className={`p-2.5 rounded-sm flex flex-wrap items-center justify-between gap-2 text-xs border ${
              interventionRequired
                ? 'bg-[#291804] border-[#f59e0b] text-[#fcd34d]'
                : 'bg-[#12141c] border-[#22242f] text-[#cbd5e1]'
            }`}
            data-testid="prompter-transition-directive"
          >
            <div className="flex items-center gap-2">
              <span className={interventionRequired ? 'text-amber-400 font-bold' : 'text-[#38bdf8]'}>
                ⚡ {transitionType}
              </span>
              <span className="text-[#475569]">|</span>
              <span className="text-[11px] text-[#94a3b8]">
                Δ{Math.abs(transition.bpm_delta).toFixed(1)} BPM • Key dist {transition.key_distance}
              </span>
            </div>

            {primaryNote && (
              <span className="text-[11px] font-medium text-[#e2e8f0]">
                Directive: {primaryNote}
              </span>
            )}
          </div>
        )}

        {/* 4. Mix-Out Proximity Warning */}
        {isMixOutWindow && (
          <div
            className="p-2 bg-[#092233] border border-[#00b4d8] text-[#38bdf8] text-xs font-bold rounded-sm flex items-center justify-between"
            data-testid="prompter-mixout-window"
          >
            <span>⏳ MIX-OUT WINDOW ACTIVE: {barsToOutro} bars remaining to Outro mix point</span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-[#00b4d8] text-[#050b14] rounded-sm font-bold">
              OPEN CROSSFADER
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
