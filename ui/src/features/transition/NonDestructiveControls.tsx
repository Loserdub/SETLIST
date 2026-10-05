import React, { useState, useMemo } from 'react';
import type { Track } from '../../bindings/Track';
import type { CuePoint } from '../../bindings/CuePoint';
import {
  setTrackOverride,
  clearTrackOverride,
  getTrackWithOverrides,
  type TrackOverridePatch,
} from '../../api/overrides';
import { useAppStore } from '../../store/useAppStore';
import {
  halfBpm,
  doubleBpm,
  nudgeBpm,
  nudgeDownbeat,
  shiftBeat,
  ALL_CAMELOT_KEYS_24,
  normalizeCamelot,
} from '../track/overrides/overrideMath';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { formatTime } from './transitionPlan';

interface NonDestructiveControlsProps {
  trackA: Track | null;
  trackB: Track | null;
  posA?: number;
  posB?: number;
  onOverrideSaved?: () => Promise<void>;
  className?: string;
}

export const NonDestructiveControls: React.FC<NonDestructiveControlsProps> = ({
  trackA,
  trackB,
  posA,
  posB,
  onOverrideSaved,
  className = '',
}) => {
  const { addToast, refreshTrackInSetlist } = useAppStore();
  const [activeDeck, setActiveDeck] = useState<'A' | 'B'>('B'); // Default to incoming track B
  const [isSaving, setIsSaving] = useState(false);

  const selectedTrack = activeDeck === 'A' ? trackA : trackB;

  // Active track properties
  const currentBpm = selectedTrack?.analysis?.rhythm.grid.bpm ?? 120.0;
  const currentDownbeat = selectedTrack?.analysis?.rhythm.grid.first_downbeat_ms ?? 0.0;
  const currentKey = selectedTrack?.analysis?.key.camelot
    ? `${selectedTrack.analysis.key.camelot.number}${selectedTrack.analysis.key.camelot.letter}`
    : '8A';

  const [bpmInput, setBpmInput] = useState(currentBpm.toFixed(1));
  const [selectedCueIndex, setSelectedCueIndex] = useState<number>(0);

  // Sync draft BPM input when deck changes
  React.useEffect(() => {
    setBpmInput(currentBpm.toFixed(1));
  }, [currentBpm, selectedTrack?.id]);

  const cues: CuePoint[] = useMemo(() => {
    return selectedTrack?.analysis?.cue_points ?? [];
  }, [selectedTrack?.analysis?.cue_points]);

  const activeCue = cues[selectedCueIndex] ?? cues[0] ?? null;

  // Apply a non-destructive patch to the selected track
  const applyPatch = async (patch: TrackOverridePatch, message: string) => {
    if (!selectedTrack) return;
    setIsSaving(true);
    try {
      await setTrackOverride(selectedTrack.id, patch);
      const freshTrack = await getTrackWithOverrides(selectedTrack.id);
      if (freshTrack) {
        await refreshTrackInSetlist(freshTrack);
      }
      if (onOverrideSaved) {
        await onOverrideSaved();
      }
      addToast({ type: 'success', message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        type: 'error',
        message: 'Failed to apply non-destructive override',
        details: msg,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset overrides on the selected track
  const handleResetOverrides = async () => {
    if (!selectedTrack) return;
    setIsSaving(true);
    try {
      await clearTrackOverride(selectedTrack.id, ['all']);
      const freshTrack = await getTrackWithOverrides(selectedTrack.id);
      if (freshTrack) {
        await refreshTrackInSetlist(freshTrack);
      }
      if (onOverrideSaved) {
        await onOverrideSaved();
      }
      addToast({ type: 'info', message: `Reset all overrides for ${selectedTrack.tags.title ?? 'track'}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: 'error', message: 'Failed to reset overrides', details: msg });
    } finally {
      setIsSaving(false);
    }
  };

  // 1. BPM Override handlers
  const handleBpmCommit = () => {
    const val = parseFloat(bpmInput);
    if (isNaN(val) || val <= 0) return;
    void applyPatch({ bpm: val }, `BPM overridden to ${val.toFixed(1)}`);
  };

  const handleNudgeBpm = (delta: number) => {
    const nextBpm = nudgeBpm(currentBpm, delta);
    setBpmInput(nextBpm.toFixed(1));
    void applyPatch({ bpm: nextBpm }, `BPM nudged to ${nextBpm.toFixed(1)}`);
  };

  const handleHalfBpm = () => {
    const nextBpm = halfBpm(currentBpm);
    setBpmInput(nextBpm.toFixed(1));
    void applyPatch({ bpm: nextBpm }, `BPM halved to ${nextBpm.toFixed(1)}`);
  };

  const handleDoubleBpm = () => {
    const nextBpm = doubleBpm(currentBpm);
    setBpmInput(nextBpm.toFixed(1));
    void applyPatch({ bpm: nextBpm }, `BPM doubled to ${nextBpm.toFixed(1)}`);
  };

  // 2. Key Override handler
  const handleKeySelect = (keyStr: string) => {
    const normalized = normalizeCamelot(keyStr);
    if (!normalized) return;
    void applyPatch({ key_camelot: normalized }, `Key overridden to ${normalized}`);
  };

  // 3. Beat-grid Correction handlers
  const handleNudgeDownbeat = (deltaMs: number) => {
    const nextDb = nudgeDownbeat(currentDownbeat, deltaMs, selectedTrack?.duration_ms);
    void applyPatch({ first_downbeat_ms: nextDb }, `Downbeat adjusted by ${deltaMs > 0 ? `+${deltaMs}` : deltaMs}ms`);
  };

  const handleShiftBeat = (direction: 1 | -1) => {
    const nextDb = shiftBeat(currentDownbeat, currentBpm, direction, selectedTrack?.duration_ms);
    void applyPatch({ first_downbeat_ms: nextDb }, `Downbeat shifted 1 beat ${direction > 0 ? 'forward' : 'backward'}`);
  };

  // 4. Cue Adjustment handlers
  const handleNudgeCue = (deltaMs: number) => {
    if (!activeCue || cues.length === 0) return;
    const updatedCues = cues.map((c) => {
      if (c.index === activeCue.index) {
        const nextTime = Math.max(0, Math.min(selectedTrack?.duration_ms ?? 0, c.time_ms + deltaMs));
        return { ...c, time_ms: Math.round(nextTime) };
      }
      return c;
    });
    const letter = String.fromCharCode(65 + (activeCue.index % 8));
    void applyPatch({ cues: updatedCues }, `Cue ${letter} adjusted by ${deltaMs > 0 ? `+${deltaMs}` : deltaMs}ms`);
  };

  return (
    <div className={`bg-[#0a0a0a] border border-[#1f1f1f] p-4 space-y-4 ${className}`}>
      {/* Header and Deck Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c1c1c] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold tracking-wider text-[#ededed] uppercase">
            Non-Destructive Corrections & Overrides
          </span>
          <span className="text-xs font-mono text-[#a8a8a8]">
            (Affects planning models only)
          </span>
        </div>

        {/* Deck Select Tabs */}
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveDeck('A')}
            disabled={!trackA}
            className={`px-2.5 py-1 border transition-colors cursor-pointer ${
              activeDeck === 'A'
                ? 'bg-[#1e3a5f] border-[#38bdf8] text-[#38bdf8] font-bold'
                : 'bg-[#121212] border-[#242424] text-[#a8a8a8] hover:text-[#ededed]'
            }`}
          >
            DECK A {posA ? `(#${String(posA).padStart(2, '0')})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveDeck('B')}
            disabled={!trackB}
            className={`px-2.5 py-1 border transition-colors cursor-pointer ${
              activeDeck === 'B'
                ? 'bg-[#1e3a5f] border-[#38bdf8] text-[#38bdf8] font-bold'
                : 'bg-[#121212] border-[#242424] text-[#a8a8a8] hover:text-[#ededed]'
            }`}
          >
            DECK B {posB ? `(#${String(posB).padStart(2, '0')})` : ''}
          </button>

          <button
            type="button"
            onClick={() => void handleResetOverrides()}
            disabled={isSaving || !selectedTrack}
            className="ml-2 px-2 py-1 bg-[#1a1212] hover:bg-[#281515] border border-[#522020] text-[#f87171] text-xs cursor-pointer transition-colors"
            title="Clear all active overrides on this track"
          >
            Reset Overrides
          </button>
        </div>
      </div>

      {/* Non-Destructive Banner */}
      <div className="px-3 py-1.5 bg-[#0e1726]/60 border border-[#1e3a5f] text-[#38bdf8] text-xs font-mono flex items-center gap-2">
        <span>🛡️</span>
        <span>
          NON-DESTRUCTIVE: All adjustments modify metadata & analysis models. Source audio files are strictly read-only.
        </span>
      </div>

      {/* Control Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs font-mono">
        {/* Panel 1: BPM & Tempo Correction */}
        <div className="p-3 bg-[#0d0d0d] border border-[#202020] space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-1.5">
            <span className="font-bold text-[#cfcfcf] uppercase">BPM Override & Multipliers</span>
            <span className="text-[#38bdf8] font-bold">{currentBpm.toFixed(1)} BPM</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={bpmInput}
              onChange={(e) => setBpmInput(e.target.value)}
              onBlur={handleBpmCommit}
              onKeyDown={(e) => e.key === 'Enter' && handleBpmCommit()}
              className="w-20 px-2 py-1 bg-[#141414] border border-[#2c2c2c] text-white text-xs font-mono focus:border-[#38bdf8] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleBpmCommit}
              disabled={isSaving}
              className="px-2 py-1 bg-[#181818] hover:bg-[#252525] border border-[#333333] text-[#ededed] cursor-pointer"
            >
              Set
            </button>
            <div className="h-4 w-[1px] bg-[#242424] mx-1" />
            <button
              type="button"
              onClick={handleHalfBpm}
              className="px-2 py-1 bg-[#141414] hover:bg-[#202020] border border-[#27272a] text-[#a8a8a8] hover:text-white cursor-pointer"
              title="Halve tempo (x0.5)"
            >
              ÷2 (x0.5)
            </button>
            <button
              type="button"
              onClick={handleDoubleBpm}
              className="px-2 py-1 bg-[#141414] hover:bg-[#202020] border border-[#27272a] text-[#a8a8a8] hover:text-white cursor-pointer"
              title="Double tempo (x2.0)"
            >
              ×2 (x2.0)
            </button>
          </div>

          <div className="flex items-center gap-1 text-xs font-mono">
            <span className="text-[#a8a8a8] mr-1">Nudge:</span>
            {[-1.0, -0.5, -0.1, +0.1, +0.5, +1.0].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleNudgeBpm(d)}
                className="px-1.5 py-0.5 bg-[#141414] hover:bg-[#222222] border border-[#27272a] text-[#cfcfcf] cursor-pointer"
              >
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
        </div>

        {/* Panel 2: Beat-Grid Alignment */}
        <div className="p-3 bg-[#0d0d0d] border border-[#202020] space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-1.5">
            <span className="font-bold text-[#cfcfcf] uppercase">Beat-Grid Downbeat Alignment</span>
            <span className="text-[#a8a8a8]">{currentDownbeat.toFixed(1)} ms</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-[#a8a8a8] mr-1">Nudge Downbeat:</span>
            {[-20, -5, +5, +20].map((ms) => (
              <button
                key={ms}
                type="button"
                onClick={() => handleNudgeDownbeat(ms)}
                className="px-2 py-1 bg-[#141414] hover:bg-[#222222] border border-[#27272a] text-[#cfcfcf] cursor-pointer"
              >
                {ms > 0 ? `+${ms}ms` : `${ms}ms`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleShiftBeat(-1)}
              className="flex-1 px-2 py-1 bg-[#141414] hover:bg-[#202020] border border-[#27272a] text-[#cfcfcf] cursor-pointer text-center"
            >
              ◀ Shift 1 Beat Back
            </button>
            <button
              type="button"
              onClick={() => handleShiftBeat(1)}
              className="flex-1 px-2 py-1 bg-[#141414] hover:bg-[#202020] border border-[#27272a] text-[#cfcfcf] cursor-pointer text-center"
            >
              Shift 1 Beat Forward ▶
            </button>
          </div>
        </div>

        {/* Panel 3: Key & Camelot Override */}
        <div className="p-3 bg-[#0d0d0d] border border-[#202020] space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-1.5">
            <span className="font-bold text-[#cfcfcf] uppercase">Camelot Harmonic Key</span>
            <span
              className="px-2 py-0.5 rounded-none font-bold text-xs border border-black/30"
              style={{
                backgroundColor: camelotColor(currentKey),
                color: camelotTextColor(currentKey),
              }}
            >
              {currentKey}
            </span>
          </div>

          {/* 24-key matrix compact selector */}
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-1 text-xs text-center font-mono">
              {ALL_CAMELOT_KEYS_24.slice(0, 12).map((k) => {
                const isSelected = k.toUpperCase() === currentKey.toUpperCase();
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleKeySelect(k)}
                    className={`py-1 rounded-none font-bold border cursor-pointer ${
                      isSelected
                        ? 'border-white scale-110 shadow-sm z-10'
                        : 'border-transparent hover:border-white/50 opacity-80'
                    }`}
                    style={{
                      backgroundColor: camelotColor(k),
                      color: camelotTextColor(k),
                    }}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-12 gap-1 text-xs text-center font-mono">
              {ALL_CAMELOT_KEYS_24.slice(12, 24).map((k) => {
                const isSelected = k.toUpperCase() === currentKey.toUpperCase();
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleKeySelect(k)}
                    className={`py-1 rounded-none font-bold border cursor-pointer ${
                      isSelected
                        ? 'border-white scale-110 shadow-sm z-10'
                        : 'border-transparent hover:border-white/50 opacity-80'
                    }`}
                    style={{
                      backgroundColor: camelotColor(k),
                      color: camelotTextColor(k),
                    }}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panel 4: Cue Point Adjustment */}
        <div className="p-3 bg-[#0d0d0d] border border-[#202020] space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-1.5">
            <span className="font-bold text-[#cfcfcf] uppercase">Cue Adjustment</span>
            <span className="text-[#a8a8a8]">
              {activeCue ? `${formatTime(activeCue.time_ms)} (${activeCue.time_ms.toFixed(0)}ms)` : 'None'}
            </span>
          </div>

          {cues.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {cues.map((cue, idx) => {
                  const letter = String.fromCharCode(65 + (cue.index % 8));
                  return (
                    <button
                      key={`${letter}-${cue.index}`}
                      type="button"
                      onClick={() => setSelectedCueIndex(idx)}
                      className={`px-1.5 py-0.5 border text-xs font-mono cursor-pointer rounded-none ${
                        idx === selectedCueIndex
                          ? 'bg-[#1e3a5f] border-[#38bdf8] text-[#38bdf8] font-bold'
                          : 'bg-[#141414] border-[#262626] text-[#a8a8a8] hover:text-white'
                      }`}
                    >
                      Cue {letter}
                    </button>
                  );
                })}
              </div>

              {activeCue && (
                <div className="flex items-center justify-between pt-1 text-xs font-mono">
                  <span className="text-[#a8a8a8] truncate max-w-[120px]">
                    {activeCue.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {[-100, -25, +25, +100].map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        onClick={() => handleNudgeCue(ms)}
                        className="px-1.5 py-0.5 bg-[#141414] hover:bg-[#202020] border border-[#27272a] text-[#cfcfcf] cursor-pointer"
                      >
                        {ms > 0 ? `+${ms}ms` : `${ms}ms`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-2 text-[#a8a8a8] text-xs">No cue points analyzed on this track.</div>
          )}
        </div>
      </div>
    </div>
  );
};
