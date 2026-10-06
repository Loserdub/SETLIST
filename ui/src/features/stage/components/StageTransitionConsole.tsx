import React from 'react';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../../bindings/TransitionAdvice';
import { IconAlertTriangle } from '../../../components/icons';
import type { calculatePhraseTelemetry } from '../stageTelemetry';

export interface StageTransitionConsoleProps {
  nextEntry: SetlistEntry | null;
  transitionSegmentFlow: string;
  transitionCountdownStr: string;
  targetMixOutMs: number | null;
  currentCueDTimeMs?: number | null;
  phraseTelemetry: ReturnType<typeof calculatePhraseTelemetry>;
  pitchFader: { pct: number; label: string } | null;
  harmonicIntervalLabel: string;
  currentEntry: SetlistEntry | null;
  trackBpm: (entry: SetlistEntry | null) => string;
  trackKey: (entry: SetlistEntry | null) => string;
  nextTransition: TransitionAdvice | null;
}

export const StageTransitionConsole: React.FC<StageTransitionConsoleProps> = ({
  nextEntry,
  transitionSegmentFlow,
  transitionCountdownStr,
  targetMixOutMs,
  currentCueDTimeMs,
  phraseTelemetry,
  pitchFader,
  harmonicIntervalLabel,
  currentEntry,
  trackBpm,
  trackKey,
  nextTransition,
}) => {
  if (!nextEntry) {
    return (
      <section
        className="lg:col-span-5 flex flex-col items-center justify-center p-8 bg-surface-deep border border-border-base border-t-2 border-t-amber-500 text-center space-y-3"
        data-testid="stage-end-of-set"
      >
        <div className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
        <p className="text-2xl sm:text-3xl font-mono font-black uppercase tracking-wider text-accent-amber">
          LAST TRACK
        </p>
        <p className="text-sm font-mono text-content-muted max-w-xs">
          Final song in performance setlist.
        </p>
      </section>
    );
  }

  return (
    <section className="lg:col-span-3 flex flex-col justify-between p-5 lg:p-6 bg-surface-deep border border-border-base border-t-2 border-t-amber-500 shadow-lg min-w-0">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-500/30" />
            <span className="text-xs font-mono font-black uppercase tracking-widest text-content-secondary">
              TRANSITION
            </span>
          </div>
          <span className="text-xs font-mono text-content-muted uppercase font-bold tracking-wider">
            LIVE ADVISOR
          </span>
        </div>

        {/* Phase Movement Flow: e.g. BREAKDOWN → DROP */}
        <div className="text-center my-3 py-2.5 px-4 bg-surface-panel border border-border-base">
          <p className="text-xs font-mono uppercase tracking-widest text-content-muted font-bold mb-0.5">
            PHASE FLOW
          </p>
          <p className="text-xl sm:text-2xl font-mono font-black text-white tracking-tight">
            {transitionSegmentFlow}
          </p>
        </div>

        {/* Huge Transition Countdown Clock */}
        <div className="flex flex-col items-center justify-center py-4 px-4 bg-surface-deep border border-border-base shadow-inner text-center">
          <span className="text-xs font-mono uppercase tracking-widest text-content-muted font-bold">
            TRANSITION COUNTDOWN
          </span>
          <span
            className="text-5xl sm:text-6xl font-mono font-black text-white tabular-nums tracking-tight my-1.5 drop-shadow-[0_0_15px_rgba(255,255,255,0.25)]"
            data-testid="stage-transition-countdown"
          >
            {transitionCountdownStr}
          </span>
          <span className="text-xs font-mono text-content-muted uppercase tracking-wider font-semibold">
            {targetMixOutMs != null && currentCueDTimeMs === targetMixOutMs
              ? 'COUNTDOWN TO CUE D (MIX OUT)'
              : 'COUNTDOWN TO OUTRO'}
          </span>
        </div>

        {/* Hardware Step LED Phrase Meter */}
        <div className="flex flex-col gap-2 p-3 bg-surface-deep border border-border-base my-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-content-muted font-bold uppercase tracking-wider">PHRASE METER:</span>
              <span className="text-white font-bold tabular-nums">
                BAR {phraseTelemetry.currentBarInPhrase} / {phraseTelemetry.phraseBars}
              </span>
              <span className="text-content-muted">•</span>
              <span className="text-amber-400 font-bold tabular-nums">
                BEAT {phraseTelemetry.currentBeatInBar} / 4
              </span>
            </div>
            {phraseTelemetry.barsRemaining !== null && (
              <span className="text-emerald-400 font-bold tabular-nums tracking-tight">
                {phraseTelemetry.barsRemaining} BARS REMAINING
              </span>
            )}
          </div>

          {/* 16-Step LED Blocks (divided into 4 groups of 4 bars) */}
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((groupIndex) => (
              <div key={groupIndex} className="grid grid-cols-4 gap-1">
                {[0, 1, 2, 3].map((stepIndex) => {
                  const stepNumber = groupIndex * 4 + stepIndex + 1;
                  const isPassed = stepNumber <= phraseTelemetry.currentBarInPhrase;
                  const isCurrent = stepNumber === phraseTelemetry.currentBarInPhrase;

                  return (
                    <div
                      key={stepIndex}
                      className={`h-2.5 rounded-none border transition-all ${
                        isCurrent
                          ? nextTransition?.intervention_required
                            ? 'bg-amber-400 border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                            : 'bg-emerald-400 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                          : isPassed
                          ? nextTransition?.intervention_required
                            ? 'bg-amber-900/60 border-amber-700/80'
                            : 'bg-emerald-950/80 border-emerald-800/80'
                          : 'bg-surface-raised border-border-base'
                      }`}
                      title={`Bar ${stepNumber}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Dedicated Hardware Telemetry Strip: Pitch Fader & Harmonic Interval */}
        <div className="grid grid-cols-2 gap-2 my-2 font-mono text-xs">
          {/* Pitch Fader Offset Badge */}
          <div className="flex flex-col p-2.5 bg-surface-panel border border-border-base text-left">
            <span className="text-content-muted font-bold uppercase tracking-wider text-xs">
              PITCH FADER
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`text-sm sm:text-base font-black tabular-nums ${
                  pitchFader && Math.abs(pitchFader.pct) > 6 ? 'text-amber-400' : 'text-white'
                }`}
              >
                {pitchFader ? pitchFader.label : '0.0%'}
              </span>
              <span className="text-content-muted text-xs truncate">
                [{trackBpm(currentEntry)}→{trackBpm(nextEntry)}]
              </span>
            </div>
          </div>

          {/* Camelot Interval Badge */}
          <div className="flex flex-col p-2.5 bg-surface-panel border border-border-base text-left">
            <span className="text-content-muted font-bold uppercase tracking-wider text-xs">
              HARMONIC INTERVAL
            </span>
            <div className="flex items-center gap-1.5 mt-1 truncate">
              <span className="text-xs sm:text-sm font-black text-amber-400">
                {trackKey(currentEntry)} → {trackKey(nextEntry)}
              </span>
              <span className="text-content-muted text-xs truncate" title={harmonicIntervalLabel}>
                ({harmonicIntervalLabel})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Transition Advice Strip & Specs */}
      <div className="space-y-3 pt-3">
        {nextTransition && (
          <div
            className={`flex flex-wrap items-center justify-center gap-3 py-2.5 px-4 border rounded-none font-mono transition-all text-xs ${
              nextTransition.intervention_required
                ? 'border-amber-500/80 bg-amber-950/40 text-amber-300 ring-1 ring-amber-500/30'
                : 'border-border-subtle bg-surface-panel'
            }`}
            data-testid="stage-transition-info"
          >
            <span
              className={`uppercase tracking-wider ${
                nextTransition.intervention_required ? 'text-amber-300 font-bold' : 'text-content-muted'
              }`}
            >
              {nextTransition.transition_type.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            <span className="text-content-dim">|</span>
            <span className="text-content-secondary">
              Δ{Math.abs(nextTransition.bpm_delta).toFixed(1)} BPM
            </span>
            <span className="text-content-dim">|</span>
            <span className="text-content-secondary">
              Key dist {nextTransition.key_distance}
            </span>
            {nextTransition.phrase_bars > 0 && (
              <>
                <span className="text-content-dim">|</span>
                <span className="text-content-muted">
                  {nextTransition.phrase_bars} bars
                </span>
              </>
            )}
            {nextTransition.intervention_required && (
              <>
                <span className="text-content-dim">|</span>
                <span className="text-amber-300 font-bold flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <IconAlertTriangle size={13} className="text-amber-400 shrink-0" />
                  ⚠ Intervention
                </span>
              </>
            )}
          </div>
        )}

        {/* Transition Notes */}
        {nextTransition?.notes && nextTransition.notes.length > 0 && (
          <div className="text-center space-y-1" data-testid="stage-transition-notes">
            {nextTransition.notes.slice(0, 2).map((note, i) => (
              <p key={i} className="text-xs text-content-muted font-mono leading-relaxed">
                {note}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
