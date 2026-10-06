import React, { useState, useEffect, useMemo } from 'react';
import type { TransitionLabModalProps } from './types';
import { generatePerformancePlan } from './transitionPlan';
import { DualDeckWaveform } from './DualDeckWaveform';
import { PerformancePlanCard } from './PerformancePlanCard';
import { NonDestructiveControls } from './NonDestructiveControls';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { computeTransitionCost } from '../setlist/costModel';
import { classifyTransitionCost } from '../setlist/roles';
import { getPlaybackClient } from '../../api/playback';

export const TransitionLabModal: React.FC<TransitionLabModalProps> = ({
  isOpen,
  onClose,
  trackA,
  trackB,
  posA,
  posB,
  advice,
  isLoading = false,
  error = null,
  onOverrideSaved,
  initialCustomNotes = [],
  onSaveCustomNotes,
}) => {
  const [auditionTrackId, setAuditionTrackId] = useState<string | null>(null);
  const [auditionState, setAuditionState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const [auditionSpeed, setAuditionSpeed] = useState(1.0);
  const [customNotes, setCustomNotes] = useState<string[]>(initialCustomNotes);
  const [activeTab, setActiveTab] = useState<'plan' | 'corrections'>('plan');

  const handleClose = async () => {
    if (auditionTrackId) {
      try {
        await getPlaybackClient().stop();
      } catch (e) {
        console.error(e);
      }
      setAuditionTrackId(null);
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const client = getPlaybackClient();
    const unsub = client.onPosition((payload) => {
      setAuditionState(payload.state);
      if (payload.speed && payload.speed > 0) {
        setAuditionSpeed(payload.speed);
      }
    });
    return () => {
      unsub();
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void handleClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggleAudition = async (trackId: string) => {
    const client = getPlaybackClient();
    if (auditionTrackId === trackId && auditionState === 'playing') {
      await client.pause();
    } else if (auditionTrackId === trackId && auditionState === 'paused') {
      await client.play();
    } else {
      setAuditionTrackId(trackId);
      await client.load(trackId);
      await client.play();
    }
  };

  const handleSetSpeed = async (newSpeed: number) => {
    setAuditionSpeed(newSpeed);
    await getPlaybackClient().setSpeed(newSpeed);
  };

  const handleAddCustomNote = (newNote: string) => {
    const updated = [...customNotes, newNote];
    setCustomNotes(updated);
    if (onSaveCustomNotes) {
      onSaveCustomNotes(updated);
    }
  };

  // Performance plan & relationship calculations
  const plan = useMemo(() => {
    return generatePerformancePlan(trackA, trackB, advice, posA, posB);
  }, [trackA, trackB, advice, posA, posB]);

  const cost = useMemo(() => {
    return computeTransitionCost(trackA, trackB, advice);
  }, [trackA, trackB, advice]);

  const verdict = useMemo(() => {
    return classifyTransitionCost(cost);
  }, [cost]);

  if (!isOpen) return null;

  const keyAStr = trackA?.analysis?.key.camelot
    ? `${trackA.analysis.key.camelot.number}${trackA.analysis.key.camelot.letter}`
    : '-';
  const keyBStr = trackB?.analysis?.key.camelot
    ? `${trackB.analysis.key.camelot.number}${trackB.analysis.key.camelot.letter}`
    : '-';

  const bpmA = trackA?.analysis?.rhythm.grid.bpm ? Math.round(trackA.analysis.rhythm.grid.bpm) : 0;
  const bpmB = trackB?.analysis?.rhythm.grid.bpm ? Math.round(trackB.analysis.rhythm.grid.bpm) : 0;
  const energyA = trackA?.analysis?.energy_score ?? 0;
  const energyB = trackB?.analysis?.energy_score ?? 0;

  const posAStr = posA ? String(posA).padStart(2, '0') : '01';
  const posBStr = posB ? String(posB).padStart(2, '0') : '02';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transition Advice"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-[2px] select-none"
    >
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={() => void handleClose()} aria-hidden="true" />

      {/* Main Transition Lab Card */}
      <div className="relative z-10 w-full max-w-5xl bg-surface-panel border border-border-base shadow-2xl flex flex-col max-h-[92vh] rounded-none overflow-hidden text-content-primary">
        {/* Top Header Bar */}
        <div className="px-5 py-3 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3 bg-surface-deep">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold tracking-widest text-accent-blue bg-accent-blue-subtle border border-accent-blue-dim px-2 py-0.5">
              TRANSITION {posAStr} → {posBStr}
            </span>
            <div>
              <h3 className="text-xs font-mono font-bold tracking-wider uppercase text-content-primary leading-tight">
                Transition Copilot Advice
              </h3>
              <p className="text-xs font-mono text-content-muted">
                Precision performance planning, structural alignment & non-destructive correction
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Tabs */}
            <div className="flex items-center border border-border-base bg-surface-raised p-0.5 font-mono text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('plan')}
                className={`px-3 py-1 cursor-pointer transition-colors ${
                  activeTab === 'plan'
                    ? 'bg-accent-blue-dim text-accent-blue font-bold border border-accent-blue/40'
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                Mixing Plan
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('corrections')}
                className={`px-3 py-1 cursor-pointer transition-colors ${
                  activeTab === 'corrections'
                    ? 'bg-accent-blue-dim text-accent-blue font-bold border border-accent-blue/40'
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                Overrides & Corrections
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => void handleClose()}
              className="w-7 h-7 border border-border-base bg-surface-raised text-content-muted hover:text-white hover:border-accent-blue transition-colors flex items-center justify-center text-xs font-mono cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
              aria-label="Close dialog"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Between-Track Obvious Relationship Ribbon */}
        <div className="px-5 py-2.5 bg-surface-panel border-b border-border-subtle flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
          {/* Key Shift */}
          <div className="flex items-center gap-2">
            <span className="text-content-muted uppercase te-silkscreen">Key:</span>
            <span
              className="px-1.5 py-0.5 rounded-none font-bold text-xs te-num border border-black/30"
              style={{ backgroundColor: camelotColor(keyAStr), color: camelotTextColor(keyAStr) }}
            >
              {keyAStr}
            </span>
            <span className="text-content-dim">→</span>
            <span
              className="px-1.5 py-0.5 rounded-none font-bold text-xs te-num border border-black/30"
              style={{ backgroundColor: camelotColor(keyBStr), color: camelotTextColor(keyBStr) }}
            >
              {keyBStr}
            </span>
            <span className="text-accent-blue text-xs">
              {advice?.transition_type ? `(${advice.transition_type})` : ''}
            </span>
          </div>

          {/* BPM Discrepancy */}
          <div className="flex items-center gap-2">
            <span className="text-content-muted uppercase te-silkscreen">BPM:</span>
            <span className="text-white font-bold te-num tabular-nums">{bpmA}</span>
            <span className="text-content-dim">→</span>
            <span className="text-white font-bold te-num tabular-nums">{bpmB}</span>
            <span className="text-content-muted text-xs te-num">
              (Δ{bpmB >= bpmA ? `+${bpmB - bpmA}` : bpmB - bpmA})
            </span>
          </div>

          {/* Energy Trajectory */}
          <div className="flex items-center gap-2">
            <span className="text-content-muted uppercase te-silkscreen">Energy:</span>
            <span className="text-white font-bold te-num">E{energyA}</span>
            <span className="text-content-dim">→</span>
            <span className="text-white font-bold te-num">E{energyB}</span>
            <span className="text-content-muted text-xs te-num">
              (Δ{energyB >= energyA ? `+${energyB - energyA}` : energyB - energyA})
            </span>
          </div>

          {/* Cost Model Verdict */}
          <div className="flex items-center gap-2">
            <span className="text-content-muted uppercase">Cost:</span>
            <span
              className={`px-2 py-0.5 font-bold uppercase text-xs border ${verdict.badgeBgClass} ${verdict.badgeBorderClass} ${verdict.textColorClass}`}
            >
              {verdict.verdict} ({verdict.subLabel})
            </span>
          </div>
        </div>

        {/* Scrollable Workspace Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-content-muted font-mono text-xs">
              <span className="animate-pulse">[ ANALYZING TRANSITION PARAMETERS... ]</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-surface-raised border border-status-danger-dim text-status-danger font-mono text-xs">
              Failed to evaluate transition: {error}
            </div>
          ) : (
            <>
              {/* Dual-Deck Waveform Alignment */}
              <DualDeckWaveform
                trackA={trackA}
                trackB={trackB}
                posA={posA}
                posB={posB}
                auditionTrackId={auditionTrackId}
                auditionState={auditionState}
                auditionSpeed={auditionSpeed}
                onToggleAudition={handleToggleAudition}
                onSetSpeed={handleSetSpeed}
              />

              {/* Tab 1: Mixing Plan (ENTER, LOW END, RELEASE + Notes) */}
              {activeTab === 'plan' && (
                <PerformancePlanCard
                  plan={plan}
                  advice={advice}
                  posA={posA}
                  posB={posB}
                  customNotes={customNotes}
                  onAddCustomNote={handleAddCustomNote}
                />
              )}

              {/* Tab 2: Non-Destructive Corrections & Overrides */}
              {activeTab === 'corrections' && (
                <NonDestructiveControls
                  trackA={trackA}
                  trackB={trackB}
                  posA={posA}
                  posB={posB}
                  onOverrideSaved={onOverrideSaved}
                />
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between bg-surface-deep">
          <div className="text-xs font-mono text-content-muted">
            Press <kbd className="px-1 py-0.5 bg-surface-raised border border-border-base text-content-muted">ESC</kbd> to close
          </div>

          <button
            type="button"
            onClick={() => void handleClose()}
            className="px-4 py-1.5 bg-surface-elevated hover:bg-surface-hover text-content-primary text-xs font-mono uppercase tracking-wider border border-border-base transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
          >
            Close Advice
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransitionLabModal;
