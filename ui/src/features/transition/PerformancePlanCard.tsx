import React, { useState } from 'react';
import type { PerformancePlan } from './types';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';

interface PerformancePlanCardProps {
  plan: PerformancePlan;
  advice: TransitionAdvice | null;
  posA?: number;
  posB?: number;
  customNotes?: string[];
  onAddCustomNote?: (note: string) => void;
  className?: string;
}

export const PerformancePlanCard: React.FC<PerformancePlanCardProps> = ({
  plan,
  advice,
  posA,
  posB,
  customNotes = [],
  onAddCustomNote,
  className = '',
}) => {
  const [newNoteText, setNewNoteText] = useState('');
  const [checkedNotes, setCheckedNotes] = useState<Record<number, boolean>>({});

  const posAStr = posA ? String(posA).padStart(2, '0') : '01';
  const posBStr = posB ? String(posB).padStart(2, '0') : '02';

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !onAddCustomNote) return;
    onAddCustomNote(newNoteText.trim());
    setNewNoteText('');
  };

  const toggleCheck = (idx: number) => {
    setCheckedNotes((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const allNotes = [...plan.guidanceNotes, ...customNotes];

  return (
    <div className={`bg-surface-panel border border-border-subtle p-4 space-y-4 ${className}`}>
      {/* Title Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold tracking-widest text-accent-blue uppercase bg-accent-blue-subtle border border-accent-blue-dim px-2 py-0.5">
            TRANSITION {posAStr} → {posBStr}
          </span>
          <span className="text-xs font-mono text-content-muted">Performance Execution Protocol</span>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2 py-0.5 bg-surface-raised border border-border-base text-content-secondary">
            {plan.phraseBars} BARS · {plan.transitionDurationSec}s WINDOW
          </span>
          {advice?.transition_type && (
            <span className="px-2 py-0.5 bg-surface-raised border border-border-base text-content-muted uppercase">
              {advice.transition_type}
            </span>
          )}
        </div>
      </div>

      {/* Triad Performance Cards: ENTER, LOW END, RELEASE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. ENTER */}
        <div className="p-3 bg-surface-panel border border-border-base space-y-1.5 hover:border-accent-blue/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-blue">
              ENTER
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-accent-blue-subtle text-accent-blue border border-accent-blue-dim">
              IN-POINT
            </span>
          </div>
          <div className="text-xs font-medium text-content-primary leading-relaxed">
            {plan.enter}
          </div>
          <div className="text-xs font-mono text-content-muted pt-1 border-t border-border-subtle">
            Target: {plan.inPoint.label}
          </div>
        </div>

        {/* 2. LOW END */}
        <div className="p-3 bg-surface-panel border border-border-base space-y-1.5 hover:border-accent-amber/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-amber">
              LOW END
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-accent-amber-subtle text-accent-amber border border-border-strong">
              FILTER / EQ
            </span>
          </div>
          <div className="text-xs font-medium text-content-primary leading-relaxed">
            {plan.lowEnd}
          </div>
          <div className="text-xs font-mono text-content-muted pt-1 border-t border-border-subtle">
            Strategy: Sub-bass isolation & cross-blend
          </div>
        </div>

        {/* 3. RELEASE */}
        <div className="p-3 bg-surface-panel border border-border-base space-y-1.5 hover:border-status-success/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-status-success">
              RELEASE
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-status-success-dim text-status-success border border-status-success">
              DROP / OUT-POINT
            </span>
          </div>
          <div className="text-xs font-medium text-content-primary leading-relaxed">
            {plan.release}
          </div>
          <div className="text-xs font-mono text-content-muted pt-1 border-t border-border-subtle">
            Source: {plan.outPoint.label}
          </div>
        </div>
      </div>

      {/* Advisory Warnings / Interventions */}
      {(advice?.intervention_required || advice?.loop_extension_recommended) && (
        <div className="flex flex-wrap gap-2 pt-1 font-mono text-xs">
          {advice.intervention_required && (
            <div className="px-2.5 py-1 bg-status-danger-dim border border-status-danger-dim text-status-danger uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <span>⚠</span>
              <span>Intervention Needed (ΔBPM &gt; 8 or key distance d &gt; 3)</span>
            </div>
          )}
          {advice.loop_extension_recommended && (
            <div className="px-2.5 py-1 bg-accent-amber-subtle border border-status-danger text-accent-amber uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <span>🔁</span>
              <span>Loop Extension Recommended (&lt; 16 bar outro)</span>
            </div>
          )}
        </div>
      )}

      {/* DJ Performance Notes Section (Required by tests and prompt!) */}
      <div className="space-y-2 pt-2 border-t border-border-subtle">
        <div className="flex items-center justify-between">
          <div className="font-mono text-xs uppercase font-bold tracking-wider text-content-muted">
            DJ Performance Notes:
          </div>
          <span className="text-xs font-mono text-content-muted">
            {allNotes.length} {allNotes.length === 1 ? 'direction' : 'directions'}
          </span>
        </div>

        <div className="space-y-1.5">
          {allNotes.map((note, idx) => {
            const isChecked = Boolean(checkedNotes[idx]);
            return (
              <div
                key={idx}
                onClick={() => toggleCheck(idx)}
                className={`p-2.5 border text-xs leading-relaxed flex items-start gap-2.5 transition-colors cursor-pointer ${
                  isChecked
                    ? 'bg-status-success-dim border-status-success text-status-success line-through opacity-70'
                    : 'bg-surface-panel border-border-subtle hover:border-border-base text-content-secondary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCheck(idx)}
                  className="mt-0.5 rounded-none border-border-strong bg-surface-elevated text-status-success focus:ring-0 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-content-muted font-mono text-xs select-none">
                  0{idx + 1}
                </span>
                <span className="flex-1 font-sans">{note}</span>
              </div>
            );
          })}
        </div>

        {/* Add Custom Note Input */}
        {onAddCustomNote && (
          <form onSubmit={handleAddNote} className="flex gap-2 pt-1">
            <input
              type="text"
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Add stage note (e.g. Cut delay on beat 4, hard swap on bar 16)..."
              className="flex-1 px-2.5 py-1 text-xs font-sans bg-surface-raised border border-border-base text-content-primary placeholder-content-dim focus:border-accent-blue focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newNoteText.trim()}
              className="px-3 py-1 bg-surface-elevated hover:bg-surface-hover disabled:opacity-40 text-xs font-mono uppercase tracking-wider text-content-primary border border-border-strong cursor-pointer"
            >
              + Add Note
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
