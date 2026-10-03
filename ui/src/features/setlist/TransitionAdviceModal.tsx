import { useState, useEffect } from 'react';
import type { Track } from '../../bindings/Track';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { computeTransitionCost } from './costModel';
import { getPlaybackClient } from '../../api/playback';
import { SPEED_OPTIONS } from '../track/PlaybackBar';

interface TransitionAdviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackA: Track | null;
  trackB: Track | null;
  advice: TransitionAdvice | null;
  isLoading?: boolean;
  error?: string | null;
}

export function TransitionAdviceModal({
  isOpen,
  onClose,
  trackA,
  trackB,
  advice,
  isLoading = false,
  error = null,
}: TransitionAdviceModalProps) {
  const [auditionTrackId, setAuditionTrackId] = useState<string | null>(null);
  const [auditionState, setAuditionState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const [auditionSpeed, setAuditionSpeed] = useState(1.0);

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

  if (!isOpen) return null;

  const keyAStr = trackA?.analysis?.key.camelot
    ? `${trackA.analysis.key.camelot.number}${trackA.analysis.key.camelot.letter}`
    : '—';
  const keyBStr = trackB?.analysis?.key.camelot
    ? `${trackB.analysis.key.camelot.number}${trackB.analysis.key.camelot.letter}`
    : '—';

  const bgA = keyAStr !== '—' ? camelotColor(keyAStr) : '#475569';
  const fgA = keyAStr !== '—' ? camelotTextColor(keyAStr) : '#ffffff';
  const bgB = keyBStr !== '—' ? camelotColor(keyBStr) : '#475569';
  const fgB = keyBStr !== '—' ? camelotTextColor(keyBStr) : '#ffffff';

  const bpmA = trackA?.analysis?.rhythm.grid.bpm ? Math.round(trackA.analysis.rhythm.grid.bpm) : 0;
  const bpmB = trackB?.analysis?.rhythm.grid.bpm ? Math.round(trackB.analysis.rhythm.grid.bpm) : 0;

  const cost = computeTransitionCost(trackA, trackB, advice);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transition Advice"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 select-none"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative z-10 w-full max-w-2xl bg-[#0e0e0e] border border-[#27272a] overflow-hidden flex flex-col max-h-[90vh] rounded-none">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#1c1c1c] flex items-center justify-between bg-[#0a0a0a]">
          <div>
            <h3 className="text-xs font-mono font-bold tracking-wider uppercase text-[#ededed] leading-tight">
              Transition Copilot Advice
            </h3>
            <p className="text-[10px] font-mono text-[#666666] mt-0.5">
              Harmonic alignment, cue point blending, and pacing recommendations
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="w-6 h-6 border border-[#222222] bg-[#111111] text-[#666666] hover:text-[#ededed] hover:border-[#333333] transition-colors flex items-center justify-center text-xs font-mono cursor-pointer"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-[#a1a1aa]">
          {isLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-[#71717a] font-mono text-xs">
              <span className="animate-pulse">[ ANALYZING COMPATIBILITY... ]</span>
            </div>
          ) : error ? (
            <div className="p-3 bg-[#180808] border border-[#501515] text-[#f87171] font-mono text-xs">
              Failed to calculate advice: {error}
            </div>
          ) : advice ? (
            <>
              {/* Tracks Comparison Pair */}
              <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  {/* Outgoing Track A */}
                  <div className="space-y-1 border-r border-[#1c1c1c] pr-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[9px] uppercase font-mono font-bold tracking-wider text-[#555555]">
                        OUTGOING TRACK (A)
                      </div>
                      {trackA && (
                        <button
                          type="button"
                          onClick={() => void handleToggleAudition(trackA.id)}
                          className={`px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider border rounded-none flex items-center gap-1 transition-colors cursor-pointer ${
                            auditionTrackId === trackA.id && auditionState === 'playing'
                              ? 'border-[#38bdf8] bg-[#142332] text-[#38bdf8] font-bold'
                              : 'border-[#27272a] bg-[#141414] hover:bg-[#202020] text-[#a1a1aa]'
                          }`}
                        >
                          <span>{auditionTrackId === trackA.id && auditionState === 'playing' ? '⏸' : '▶'}</span>
                          <span>{auditionTrackId === trackA.id && auditionState === 'playing' ? 'PAUSE' : 'AUDITION'}</span>
                        </button>
                      )}
                    </div>
                    <div className="font-medium text-xs text-[#ededed] truncate">
                      {trackA?.tags.title ?? 'Unknown Track'}
                    </div>
                    <div className="text-[11px] text-[#71717a] truncate">
                      {trackA?.tags.artist ?? 'Unknown Artist'}
                    </div>
                    <div className="flex items-center gap-2 pt-1 font-mono text-[11px]">
                      <span
                        className="px-1.5 py-0.5 rounded-[2px] font-mono font-bold text-[10px] border border-black/30"
                        style={{ backgroundColor: bgA, color: fgA }}
                      >
                        {keyAStr}
                      </span>
                      <span className="text-[#a1a1aa]">{bpmA} BPM</span>
                      <span className="text-[#71717a]">
                        E{trackA?.analysis?.energy_score ?? '—'}
                      </span>
                    </div>
                  </div>

                  {/* Incoming Track B */}
                  <div className="space-y-1 pl-1">
                    <div className="flex items-center justify-between">
                      <div className="text-[9px] uppercase font-mono font-bold tracking-wider text-[#555555]">
                        INCOMING TRACK (B)
                      </div>
                      {trackB && (
                        <button
                          type="button"
                          onClick={() => void handleToggleAudition(trackB.id)}
                          className={`px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider border rounded-none flex items-center gap-1 transition-colors cursor-pointer ${
                            auditionTrackId === trackB.id && auditionState === 'playing'
                              ? 'border-[#38bdf8] bg-[#142332] text-[#38bdf8] font-bold'
                              : 'border-[#27272a] bg-[#141414] hover:bg-[#202020] text-[#a1a1aa]'
                          }`}
                        >
                          <span>{auditionTrackId === trackB.id && auditionState === 'playing' ? '⏸' : '▶'}</span>
                          <span>{auditionTrackId === trackB.id && auditionState === 'playing' ? 'PAUSE' : 'AUDITION'}</span>
                        </button>
                      )}
                    </div>
                    <div className="font-medium text-xs text-[#ededed] truncate">
                      {trackB?.tags.title ?? 'Unknown Track'}
                    </div>
                    <div className="text-[11px] text-[#71717a] truncate">
                      {trackB?.tags.artist ?? 'Unknown Artist'}
                    </div>
                    <div className="flex items-center gap-2 pt-1 font-mono text-[11px]">
                      <span
                        className="px-1.5 py-0.5 rounded-[2px] font-mono font-bold text-[10px] border border-black/30"
                        style={{ backgroundColor: bgB, color: fgB }}
                      >
                        {keyBStr}
                      </span>
                      <span className="text-[#a1a1aa]">{bpmB} BPM</span>
                      <span className="text-[#71717a]">
                        E{trackB?.analysis?.energy_score ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Audition Speed Control Bar */}
                {auditionTrackId && (
                  <div className="pt-2 border-t border-[#1c1c1c] flex items-center justify-between text-[10px] font-mono">
                    <span className="text-[#888888]">
                      AUDITIONING: {auditionTrackId === trackA?.id ? 'Track A' : 'Track B'}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[#666666]">Speed:</span>
                      {SPEED_OPTIONS.map((rate) => {
                        const isActive = Math.abs(auditionSpeed - rate) < 0.01;
                        return (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => void handleSetSpeed(rate)}
                            className={`px-1.5 py-0.5 text-[9px] cursor-pointer border rounded-none ${
                              isActive
                                ? 'bg-[#1e3a5f] text-[#38bdf8] border-[#38bdf8] font-bold'
                                : 'bg-[#121212] hover:bg-[#1a1a1a] text-[#888888] border-transparent'
                            }`}
                          >
                            {rate}x
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Status Badges: Interventions & Recommendations */}
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                <span className="px-2 py-0.5 bg-[#121212] border border-[#2b2b2b] text-[#cccccc] uppercase tracking-wider">
                  Type: {advice.transition_type}
                </span>

                <span className="px-2 py-0.5 bg-[#121212] border border-[#222222] text-[#888888] uppercase tracking-wider">
                  Phrase Length: {advice.phrase_bars} Bars
                </span>

                {advice.intervention_required && (
                  <span className="px-2 py-0.5 bg-[#1c0808] border border-[#6b1515] text-[#f87171] uppercase tracking-wider font-semibold">
                    ⚠ Intervention Needed (ΔBPM &gt; 8 or d &gt; 3)
                  </span>
                )}

                {advice.loop_extension_recommended && (
                  <span className="px-2 py-0.5 bg-[#1c1408] border border-[#78350f] text-[#f59e0b] uppercase tracking-wider font-semibold">
                    Loop Extension Recommended (&lt; 16 bar outro)
                  </span>
                )}
              </div>

              {/* Cost Model Term Breakdown */}
              {cost.isAvailable ? (
                <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] space-y-2.5">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="font-semibold text-[#888888] uppercase tracking-wider text-[10px]">Cost Model Terms (AGENTS.md 6.3)</span>
                    <span className="text-[#cccccc] font-mono text-[11px]">
                      Total C_ij: <span className="font-bold text-white">{cost.total.toFixed(2)}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 font-mono text-[10px]">
                    <div className="p-2 bg-[#111111] border border-[#1f1f1f]">
                      <div className="text-[#666666] uppercase">Tempo (Φ_tempo)</div>
                      <div className="text-sm font-bold text-[#ededed] my-0.5">{cost.phiTempo.toFixed(2)}</div>
                      <div className="text-[#555555]">ΔBPM: {cost.bpmDelta > 0 ? `+${cost.bpmDelta}` : cost.bpmDelta}</div>
                    </div>

                    <div className="p-2 bg-[#111111] border border-[#1f1f1f]">
                      <div className="text-[#666666] uppercase">Key (Φ_key)</div>
                      <div className="text-sm font-bold text-[#ededed] my-0.5">{cost.phiKey.toFixed(2)}</div>
                      <div className="text-[#555555]">d = {cost.keyDistance} {cost.modeFlip ? '(flip)' : ''}</div>
                    </div>

                    <div className="p-2 bg-[#111111] border border-[#1f1f1f]">
                      <div className="text-[#666666] uppercase">Energy (Φ_energy)</div>
                      <div className="text-sm font-bold text-[#ededed] my-0.5">{cost.phiEnergy.toFixed(2)}</div>
                      <div className="text-[#555555]">
                        Dev: {(
                          (trackB?.analysis?.energy_score ?? 0) -
                          (trackA?.analysis?.energy_score ?? 0) -
                          cost.dETarget
                        ).toFixed(1)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-[#0a0a0a] border border-[#2b2b2b] space-y-1 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#888888] uppercase text-[10px]">Cost Model Terms (AGENTS.md 6.3)</span>
                    <span className="text-amber-500/80">Analysis Unavailable</span>
                  </div>
                  <p className="text-[11px] text-[#666666]">
                    Transition cost cannot be evaluated because one or both tracks lack complete audio analysis.
                  </p>
                </div>
              )}

              {/* Actionable Notes & Tips */}
              <div className="space-y-1.5">
                <div className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#888888]">DJ Performance Notes:</div>
                <div className="space-y-1.5">
                  {(advice.notes ?? []).map((note, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[#0a0a0a] border border-[#1c1c1c] text-[#cccccc] text-xs leading-relaxed flex items-start gap-2 font-sans"
                    >
                      <span className="text-[#71717a] font-mono text-xs">0{idx + 1}</span>
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cue Alignment Recommendations */}
              <div className="p-3 bg-[#0a0a0a] border border-[#1c1c1c] space-y-2">
                <div className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#888888]">Recommended Cue Strategy:</div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-[#888888]">
                  <span className="px-2 py-0.5 bg-[#121212] border border-[#242424] text-[#d4d4d8]">
                    Mix-Out: Cue G (Outro Start)
                  </span>
                  <span>→</span>
                  <span className="px-2 py-0.5 bg-[#121212] border border-[#242424] text-[#d4d4d8]">
                    Mix-In: Cue B (Intro End / Bass)
                  </span>
                  <span>or</span>
                  <span className="px-2 py-0.5 bg-[#121212] border border-[#242424] text-[#d4d4d8]">
                    Cue A (Downbeat)
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-[#555555] font-mono text-xs">
              No transition data available.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1c1c1c] flex justify-end bg-[#0a0a0a]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-[#181818] hover:bg-[#222222] text-[#ededed] text-xs font-mono uppercase tracking-wider border border-[#2b2b2b] transition-colors cursor-pointer rounded-none"
          >
            Close Advice
          </button>
        </div>
      </div>
    </div>
  );
}

export default TransitionAdviceModal;
