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
    <div className={`bg-[#0a0a0a] border border-[#1f1f1f] p-4 space-y-4 ${className}`}>
      {/* Title Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c1c1c] pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold tracking-widest text-[#38bdf8] uppercase bg-[#0c1f2e] border border-[#1e496a] px-2 py-0.5">
            TRANSITION {posAStr} → {posBStr}
          </span>
          <span className="text-xs font-mono text-[#a8a8a8]">Performance Execution Protocol</span>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2 py-0.5 bg-[#141414] border border-[#2b2b2b] text-[#cfcfcf]">
            {plan.phraseBars} BARS · {plan.transitionDurationSec}s WINDOW
          </span>
          {advice?.transition_type && (
            <span className="px-2 py-0.5 bg-[#141414] border border-[#2b2b2b] text-[#a8a8a8] uppercase">
              {advice.transition_type}
            </span>
          )}
        </div>
      </div>

      {/* Triad Performance Cards: ENTER, LOW END, RELEASE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. ENTER */}
        <div className="p-3 bg-[#0d0d0d] border border-[#222222] space-y-1.5 hover:border-[#38bdf8]/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#38bdf8]">
              ENTER
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-[#142332] text-[#38bdf8] border border-[#1e496a]">
              IN-POINT
            </span>
          </div>
          <div className="text-xs font-medium text-[#ededed] leading-relaxed">
            {plan.enter}
          </div>
          <div className="text-xs font-mono text-[#a8a8a8] pt-1 border-t border-[#1a1a1a]">
            Target: {plan.inPoint.label}
          </div>
        </div>

        {/* 2. LOW END */}
        <div className="p-3 bg-[#0d0d0d] border border-[#222222] space-y-1.5 hover:border-[#f59e0b]/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f59e0b]">
              LOW END
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-[#261c0a] text-[#f59e0b] border border-[#593d0d]">
              FILTER / EQ
            </span>
          </div>
          <div className="text-xs font-medium text-[#ededed] leading-relaxed">
            {plan.lowEnd}
          </div>
          <div className="text-xs font-mono text-[#a8a8a8] pt-1 border-t border-[#1a1a1a]">
            Strategy: Sub-bass isolation & cross-blend
          </div>
        </div>

        {/* 3. RELEASE */}
        <div className="p-3 bg-[#0d0d0d] border border-[#222222] space-y-1.5 hover:border-[#10b981]/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#10b981]">
              RELEASE
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-[#0c2419] text-[#10b981] border border-[#165136]">
              DROP / OUT-POINT
            </span>
          </div>
          <div className="text-xs font-medium text-[#ededed] leading-relaxed">
            {plan.release}
          </div>
          <div className="text-xs font-mono text-[#a8a8a8] pt-1 border-t border-[#1a1a1a]">
            Source: {plan.outPoint.label}
          </div>
        </div>
      </div>

      {/* Advisory Warnings / Interventions */}
      {(advice?.intervention_required || advice?.loop_extension_recommended) && (
        <div className="flex flex-wrap gap-2 pt-1 font-mono text-xs">
          {advice.intervention_required && (
            <div className="px-2.5 py-1 bg-[#1c0808] border border-[#6b1515] text-[#f87171] uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <span>⚠</span>
              <span>Intervention Needed (ΔBPM &gt; 8 or key distance d &gt; 3)</span>
            </div>
          )}
          {advice.loop_extension_recommended && (
            <div className="px-2.5 py-1 bg-[#1c1408] border border-[#78350f] text-[#f59e0b] uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <span>🔁</span>
              <span>Loop Extension Recommended (&lt; 16 bar outro)</span>
            </div>
          )}
        </div>
      )}

      {/* DJ Performance Notes Section (Required by tests and prompt!) */}
      <div className="space-y-2 pt-2 border-t border-[#1c1c1c]">
        <div className="flex items-center justify-between">
          <div className="font-mono text-xs uppercase font-bold tracking-wider text-[#a8a8a8]">
            DJ Performance Notes:
          </div>
          <span className="text-xs font-mono text-[#a8a8a8]">
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
                    ? 'bg-[#09120e] border-[#165136] text-[#6ee7b7] line-through opacity-70'
                    : 'bg-[#0d0d0d] border-[#1e1e1e] hover:border-[#2e2e2e] text-[#cfcfcf]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCheck(idx)}
                  className="mt-0.5 rounded-none border-[#333333] bg-[#1a1a1a] text-[#10b981] focus:ring-0 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-[#a8a8a8] font-mono text-xs select-none">
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
              className="flex-1 px-2.5 py-1 text-xs font-sans bg-[#121212] border border-[#262626] text-[#ededed] placeholder-[#666666] focus:border-[#38bdf8] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newNoteText.trim()}
              className="px-3 py-1 bg-[#1a1a1a] hover:bg-[#252525] disabled:opacity-40 text-xs font-mono uppercase tracking-wider text-[#ededed] border border-[#333333] cursor-pointer"
            >
              + Add Note
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
