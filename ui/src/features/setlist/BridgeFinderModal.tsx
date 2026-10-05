import { useState, useEffect, useMemo } from 'react';
import type { Track } from '../../bindings/Track';
import { useAppStore } from '../../store/useAppStore';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { computeTransitionCost } from './costModel';
import { formatDurationMs } from './roles';
import { IconClose, IconPlay, IconPause, IconSparkles } from '../../components/icons';

interface BridgeFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackA: Track | null;
  trackB: Track | null;
  onInsertBridge: (bridgeTrack: Track) => Promise<void> | void;
}

interface BridgeEvaluation {
  track: Track;
  costAToBridge: number;
  costBridgeToB: number;
  totalCost: number;
  bridgeRole: 'Harmonic Bridge' | 'Tempo Bridge' | 'Energy Bridge' | 'Multi-Role Bridge';
  keyStr: string;
  bpm: number;
  energy: number;
}

export function BridgeFinderModal({
  isOpen,
  onClose,
  trackA,
  trackB,
  onInsertBridge,
}: BridgeFinderModalProps) {
  const tracks = useAppStore((s) => s.tracks);
  const costWeights = useAppStore((s) => s.costWeights);
  const energyProfile = useAppStore((s) => s.energyProfile);
  const setlist = useAppStore((s) => s.setlist);
  const auditionTrackId = useAppStore((s) => s.auditionTrackId);
  const auditionState = useAppStore((s) => s.auditionState);
  const toggleAudition = useAppStore((s) => s.toggleAudition);

  const [isInserting, setIsInserting] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Compute top 3-5 bridge candidates using cost model
  const candidates: BridgeEvaluation[] = useMemo(() => {
    if (!trackA?.analysis || !trackB?.analysis || tracks.length === 0) return [];

    const existingIds = new Set(setlist.map((e) => e.track_id));
    const bpmA = trackA.analysis.rhythm.grid.bpm;
    const bpmB = trackB.analysis.rhythm.grid.bpm;
    const keyA = trackA.analysis.key.camelot;
    const keyB = trackB.analysis.key.camelot;

    const evaluated: BridgeEvaluation[] = [];

    for (const cand of tracks) {
      if (cand.id === trackA.id || cand.id === trackB.id || !cand.analysis) continue;
      // Prefer tracks not already in the set, but allow any candidate if needed
      const alreadyInSet = existingIds.has(cand.id);

      const costA = computeTransitionCost(trackA, cand, null, 0, costWeights, energyProfile);
      const costB = computeTransitionCost(cand, trackB, null, 0, costWeights, energyProfile);

      if (!costA.isAvailable || !costB.isAvailable) continue;

      let total = costA.total + costB.total;
      if (alreadyInSet) total += 0.2; // Slight penalty for duplicate set tracks

      const candBpm = cand.analysis.rhythm.grid.bpm;
      const candKey = cand.analysis.key.camelot;

      // Determine primary bridge role
      let bridgeRole: BridgeEvaluation['bridgeRole'] = 'Multi-Role Bridge';
      const isTempoBetween = (candBpm >= Math.min(bpmA, bpmB) - 1) && (candBpm <= Math.max(bpmA, bpmB) + 1);
      const isHarmonicStep = candKey && keyA && keyB && (costA.keyDistance <= 1 && costB.keyDistance <= 1);

      if (isHarmonicStep && isTempoBetween) {
        bridgeRole = 'Multi-Role Bridge';
      } else if (isHarmonicStep) {
        bridgeRole = 'Harmonic Bridge';
      } else if (isTempoBetween) {
        bridgeRole = 'Tempo Bridge';
      } else {
        bridgeRole = 'Energy Bridge';
      }

      const keyStr = candKey ? `${candKey.number}${candKey.letter}` : '-';
      const bpm = Math.round(candBpm);
      const energy = cand.analysis.energy_score ?? 5;

      evaluated.push({
        track: cand,
        costAToBridge: costA.total,
        costBridgeToB: costB.total,
        totalCost: total,
        bridgeRole,
        keyStr,
        bpm,
        energy,
      });
    }

    evaluated.sort((a, b) => a.totalCost - b.totalCost);
    return evaluated.slice(0, 4);
  }, [trackA, trackB, tracks, setlist, costWeights, energyProfile]);

  if (!isOpen || !trackA || !trackB) return null;

  const handleSelect = async (candidate: BridgeEvaluation) => {
    setIsInserting(candidate.track.id);
    try {
      await onInsertBridge(candidate.track);
      onClose();
    } finally {
      setIsInserting(null);
    }
  };

  const keyAStr = trackA.analysis?.key.camelot
    ? `${trackA.analysis.key.camelot.number}${trackA.analysis.key.camelot.letter}`
    : '-';
  const keyBStr = trackB.analysis?.key.camelot
    ? `${trackB.analysis.key.camelot.number}${trackB.analysis.key.camelot.letter}`
    : '-';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
      <div
        className="bg-[#0b0b0b] border border-[#2a2a2a] max-w-2xl w-full p-5 space-y-4 rounded-none shadow-2xl text-[#ededed]"
        role="dialog"
        aria-modal="true"
        aria-label="Bridge Track Discovery"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">
              <IconSparkles size={16} />
            </span>
            <h3 className="text-xs font-mono font-bold tracking-widest uppercase text-white">
              Bridge Discovery • Intermediate Transitions
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#a8a8a8] hover:text-white transition-colors cursor-pointer text-xs font-mono p-1 focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
            aria-label="Close bridge discovery modal"
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Transition Overview */}
        <div className="p-3 bg-[#111111] border border-[#1f1f1f] flex items-center justify-between gap-3 text-xs font-mono">
          <div className="min-w-0 flex-1">
            <span className="text-[#a8a8a8] text-xs uppercase block">Source Track:</span>
            <span className="font-semibold text-white truncate block">
              {trackA.tags.title ?? 'Track A'}
            </span>
            <span className="text-xs text-[#a8a8a8]">
              {keyAStr} • {Math.round(trackA.analysis?.rhythm.grid.bpm ?? 0)} BPM
            </span>
          </div>

          <div className="flex flex-col items-center justify-center px-3 border-x border-[#222222] shrink-0 text-[#f59e0b]">
            <span className="text-xs font-bold uppercase">GAP TO BRIDGE</span>
            <span className="text-xs">→ [Bridge] →</span>
          </div>

          <div className="min-w-0 flex-1 text-right">
            <span className="text-[#a8a8a8] text-xs uppercase block">Destination Track:</span>
            <span className="font-semibold text-white truncate block">
              {trackB.tags.title ?? 'Track B'}
            </span>
            <span className="text-xs text-[#a8a8a8]">
              {keyBStr} • {Math.round(trackB.analysis?.rhythm.grid.bpm ?? 0)} BPM
            </span>
          </div>
        </div>

        {/* Candidates List */}
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          <span className="text-xs font-mono text-[#a8a8a8] uppercase tracking-wider block">
            Recommended Intermediate Tracks ({candidates.length} options):
          </span>

          {candidates.length === 0 ? (
            <div className="p-6 text-center border border-[#1e1e1e] bg-[#0e0e0e] text-xs font-mono text-[#a8a8a8]">
              No intermediate bridge tracks discovered in library with lower combined friction.
            </div>
          ) : (
            candidates.map((cand) => {
              const bg = cand.keyStr !== '-' ? camelotColor(cand.keyStr) : '#22222a';
              const fg = cand.keyStr !== '-' ? camelotTextColor(cand.keyStr) : '#9898a4';
              const isPlaying = auditionTrackId === cand.track.id && auditionState === 'playing';

              return (
                <div
                  key={cand.track.id}
                  className="p-3 bg-[#0e0e0e] hover:bg-[#141414] border border-[#222222] hover:border-[#383838] transition-colors flex items-center justify-between gap-3 group"
                >
                  {/* Left: Role, Key, BPM, Title */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Audition Play */}
                    <button
                      type="button"
                      onClick={() => void toggleAudition(cand.track.id)}
                      className={`p-1.5 text-xs font-mono border transition-colors cursor-pointer rounded-none shrink-0 ${
                        isPlaying
                          ? 'border-[#38bdf8] bg-[#142332] text-[#38bdf8]'
                          : 'border-[#2a2a2a] bg-[#181818] text-[#cccccc] hover:text-white'
                      }`}
                      title={isPlaying ? 'Pause' : 'Audition track'}
                    >
                      {isPlaying ? <IconPause size={12} /> : <IconPlay size={12} />}
                    </button>

                    {/* Camelot Key Badge */}
                    <span
                      className="font-mono font-bold text-xs px-2 py-0.5 rounded-[2px] tracking-tight shrink-0 text-center w-8"
                      style={{ backgroundColor: bg, color: fg }}
                    >
                      {cand.keyStr}
                    </span>

                    {/* Title & Artist */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {cand.track.tags.title ?? 'Untitled Track'}
                        </span>
                        <span className="text-xs font-mono px-1.5 py-0.2 border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 uppercase tracking-wider shrink-0">
                          {cand.bridgeRole}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-[#a8a8a8] flex items-center gap-2 mt-0.5">
                        <span className="truncate">{cand.track.tags.artist ?? 'Unknown Artist'}</span>
                        <span>•</span>
                        <span>{cand.bpm} BPM</span>
                        <span>•</span>
                        <span>{formatDurationMs(cand.track.duration_ms)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Step Transition Friction & Insert Button */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono text-xs text-[#a8a8a8]">
                      <div>
                        Step 1: <span className="text-white">{cand.costAToBridge.toFixed(2)}</span>
                      </div>
                      <div>
                        Step 2: <span className="text-white">{cand.costBridgeToB.toFixed(2)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSelect(cand)}
                      disabled={isInserting === cand.track.id}
                      className="px-3 py-1.5 bg-[#181818] hover:bg-[#222222] text-[#38bdf8] border border-[#38bdf8]/60 text-xs font-mono uppercase tracking-wider font-semibold transition-colors cursor-pointer disabled:opacity-40 rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
                    >
                      {isInserting === cand.track.id ? 'Inserting...' : '+ Insert Bridge'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#1c1c1c] pt-3 text-xs font-mono text-[#a8a8a8]">
          <span>Inserting a bridge creates two smooth, phrase-aligned transitions.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs font-mono text-[#cccccc] hover:text-white transition-colors cursor-pointer border border-[#262626] bg-[#141414]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default BridgeFinderModal;
