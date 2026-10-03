import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { camelotColor, camelotTextColor } from '../../../utils/camelotColor';
import {
  setTrackOverride,
  clearTrackOverride,
  getTrackWithOverrides,
  type TrackOverridePatch,
} from '../../../api/overrides';
import {
  halfBpm,
  doubleBpm,
  nudgeBpm,
  clampBpm,
  nudgeDownbeat,
  shiftBeat,
  ALL_CAMELOT_KEYS_24,
  normalizeCamelot,
} from './overrideMath';
import { EditedBadge, isFieldOverridden } from './EditedBadge';

export interface OverridePanelProps {
  className?: string;
  defaultExpanded?: boolean;
}

export const OverridePanel: React.FC<OverridePanelProps> = ({
  className = '',
  defaultExpanded = true,
}) => {
  const { selectedTrack, addToast } = useAppStore();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isSaving, setIsSaving] = useState(false);

  // Local draft states for inputs
  const currentBpm = selectedTrack?.analysis?.rhythm.grid.bpm ?? 120.0;
  const currentDownbeat = selectedTrack?.analysis?.rhythm.grid.first_downbeat_ms ?? 0.0;
  const currentKey = selectedTrack?.analysis?.key.camelot
    ? `${selectedTrack.analysis.key.camelot.number}${selectedTrack.analysis.key.camelot.letter}`
    : '8A';

  const [bpmInput, setBpmInput] = useState(currentBpm.toFixed(1));
  const [downbeatInput, setDownbeatInput] = useState(currentDownbeat.toFixed(1));

  // Sync inputs when selectedTrack changes
  useEffect(() => {
    setBpmInput(currentBpm.toFixed(1));
    setDownbeatInput(currentDownbeat.toFixed(1));
  }, [currentBpm, currentDownbeat, selectedTrack?.id]);

  // Override status flags
  const isBpmOverridden = useMemo(
    () => isFieldOverridden(selectedTrack, 'bpm'),
    [selectedTrack]
  );
  const isDownbeatOverridden = useMemo(
    () => isFieldOverridden(selectedTrack, 'first_downbeat_ms'),
    [selectedTrack]
  );
  const isKeyOverridden = useMemo(
    () => isFieldOverridden(selectedTrack, 'key_camelot'),
    [selectedTrack]
  );

  /**
   * Applies an override patch, saves to database, and refreshes app store.
   */
  const handleSavePatch = useCallback(
    async (patch: TrackOverridePatch, message?: string) => {
      if (!selectedTrack) return;
      setIsSaving(true);
      try {
        await setTrackOverride(selectedTrack.id, patch);
        const freshTrack = await getTrackWithOverrides(selectedTrack.id);
        if (freshTrack) {
          useAppStore.setState((state) => ({
            tracks: state.tracks.map((t) => (t.id === freshTrack.id ? freshTrack : t)),
            selectedTrack:
              state.selectedTrackId === freshTrack.id ? freshTrack : state.selectedTrack,
            setlist: state.setlist.map((e) =>
              e.track_id === freshTrack.id ? { ...e, track: freshTrack } : e
            ),
          }));
        }
        if (message) {
          addToast({ type: 'success', message });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast({
          type: 'error',
          message: 'Failed to save analysis override',
          details: msg,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [selectedTrack, addToast]
  );

  /**
   * Clears specific override fields and reverts to analyzed values.
   */
  const handleClearField = useCallback(
    async (fields: string[], message?: string) => {
      if (!selectedTrack) return;
      setIsSaving(true);
      try {
        await clearTrackOverride(selectedTrack.id, fields);
        const freshTrack = await getTrackWithOverrides(selectedTrack.id);
        if (freshTrack) {
          useAppStore.setState((state) => ({
            tracks: state.tracks.map((t) => (t.id === freshTrack.id ? freshTrack : t)),
            selectedTrack:
              state.selectedTrackId === freshTrack.id ? freshTrack : state.selectedTrack,
            setlist: state.setlist.map((e) =>
              e.track_id === freshTrack.id ? { ...e, track: freshTrack } : e
            ),
          }));
        }
        if (message) {
          addToast({ type: 'info', message });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast({
          type: 'error',
          message: 'Failed to reset override',
          details: msg,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [selectedTrack, addToast]
  );

  // BPM Action Handlers
  const handleHalfBpm = () => {
    const next = halfBpm(currentBpm);
    setBpmInput(next.toFixed(1));
    void handleSavePatch({ bpm: next }, `Tempo halved to ${next.toFixed(1)} BPM`);
  };

  const handleDoubleBpm = () => {
    const next = doubleBpm(currentBpm);
    setBpmInput(next.toFixed(1));
    void handleSavePatch({ bpm: next }, `Tempo doubled to ${next.toFixed(1)} BPM`);
  };

  const handleNudgeBpm = (delta: number) => {
    const next = nudgeBpm(currentBpm, delta);
    setBpmInput(next.toFixed(1));
    void handleSavePatch({ bpm: next });
  };

  const handleCommitBpmInput = () => {
    const parsed = parseFloat(bpmInput);
    if (!Number.isNaN(parsed)) {
      const clamped = clampBpm(parsed);
      setBpmInput(clamped.toFixed(1));
      if (clamped !== currentBpm) {
        void handleSavePatch({ bpm: clamped }, `Tempo overridden to ${clamped.toFixed(1)} BPM`);
      }
    } else {
      setBpmInput(currentBpm.toFixed(1));
    }
  };

  // Downbeat Action Handlers
  const handleNudgeDownbeat = (deltaMs: number) => {
    const next = nudgeDownbeat(currentDownbeat, deltaMs, selectedTrack?.duration_ms);
    setDownbeatInput(next.toFixed(1));
    void handleSavePatch({ first_downbeat_ms: next });
  };

  const handleShiftBeat = (direction: 1 | -1) => {
    const next = shiftBeat(currentDownbeat, currentBpm, direction, selectedTrack?.duration_ms);
    setDownbeatInput(next.toFixed(1));
    void handleSavePatch(
      { first_downbeat_ms: next },
      `Beat grid shifted ${direction > 0 ? '+1' : '-1'} beat (${next.toFixed(1)} ms)`
    );
  };

  const handleCommitDownbeatInput = () => {
    const parsed = parseFloat(downbeatInput);
    if (!Number.isNaN(parsed)) {
      const clamped = nudgeDownbeat(parsed, 0, selectedTrack?.duration_ms);
      setDownbeatInput(clamped.toFixed(1));
      if (clamped !== currentDownbeat) {
        void handleSavePatch(
          { first_downbeat_ms: clamped },
          `Downbeat set to ${clamped.toFixed(1)} ms`
        );
      }
    } else {
      setDownbeatInput(currentDownbeat.toFixed(1));
    }
  };

  // Camelot Key Action Handlers
  const handleSelectKey = (keyStr: string) => {
    const normalized = normalizeCamelot(keyStr);
    if (normalized && normalized !== currentKey) {
      void handleSavePatch({ key_camelot: normalized }, `Musical key changed to ${normalized}`);
    }
  };

  if (!selectedTrack) {
    return null;
  }

  return (
    <section
      className={`border-t border-[#1c1c1c] bg-[#0a0a0a] text-[#ededed] font-mono transition-all z-20 shrink-0 ${className}`}
      data-testid="override-panel"
      aria-label="Track analysis corrections"
    >
      {/* Panel Header & Toggle */}
      <div className="px-5 py-2.5 bg-[#0e0e0e] border-b border-[#181818] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#cccccc] hover:text-white transition-colors cursor-pointer select-none"
            aria-expanded={isExpanded}
          >
            <span className="text-[10px] text-[#666666]">{isExpanded ? '▼' : '►'}</span>
            <span>Analysis Overrides</span>
          </button>
          {(isBpmOverridden || isDownbeatOverridden || isKeyOverridden) && (
            <EditedBadge title="Track has active user corrections" />
          )}
          {isSaving && (
            <span className="text-[10px] text-[#888888] animate-pulse">Saving...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {(isBpmOverridden || isDownbeatOverridden || isKeyOverridden) && (
            <button
              type="button"
              onClick={() => void handleClearField(['all'], 'All overrides reset to analyzed values')}
              disabled={isSaving}
              className="px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase border border-[#333333] bg-[#141414] hover:bg-[#222222] text-[#aaaaaa] hover:text-white transition-colors cursor-pointer"
              data-testid="reset-all-btn"
              title="Reset all fields back to initial DSP analysis"
            >
              Reset All
            </button>
          )}
        </div>
      </div>

      {/* Expanded Controls Body */}
      {isExpanded && (
        <div className="p-4 space-y-4 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ── BPM Field Controls ── */}
            <div
              className="p-3 bg-[#0d0d0d] border border-[#1c1c1c] space-y-2.5 rounded-none"
              data-testid="override-bpm-section"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#999999]">
                    Tempo (BPM)
                  </span>
                  {isBpmOverridden && <EditedBadge field="bpm" title="BPM is overridden" />}
                </div>
                <button
                  type="button"
                  onClick={() => void handleClearField(['bpm'], 'BPM reset to analyzed value')}
                  disabled={!isBpmOverridden || isSaving}
                  className={`px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase border transition-colors cursor-pointer ${
                    isBpmOverridden
                      ? 'border-[#444444] bg-[#161616] hover:bg-[#242424] text-[#cccccc]'
                      : 'border-[#1f1f1f] bg-[#090909] text-[#444444] cursor-not-allowed opacity-50'
                  }`}
                  data-testid="bpm-reset-btn"
                  title="Reset BPM back to initial analyzed value"
                >
                  ↺ Reset
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="300"
                  value={bpmInput}
                  onChange={(e) => setBpmInput(e.target.value)}
                  onBlur={handleCommitBpmInput}
                  onKeyDown={(e) => e.key === 'Enter' && handleCommitBpmInput()}
                  disabled={isSaving}
                  className="w-24 px-2.5 py-1 bg-[#141414] border border-[#262626] text-white font-mono text-sm focus:outline-none focus:border-[#444444] tabular-nums"
                  data-testid="bpm-input"
                  aria-label="Override BPM value"
                />

                {/* Quick BPM Modifier Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleHalfBpm}
                    disabled={isSaving}
                    className="px-2 py-1 bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] text-xs font-mono text-[#d0d0d0] hover:text-white transition-colors cursor-pointer"
                    data-testid="bpm-half-btn"
                    title="Halve BPM (/ 2)"
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    onClick={handleDoubleBpm}
                    disabled={isSaving}
                    className="px-2 py-1 bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] text-xs font-mono text-[#d0d0d0] hover:text-white transition-colors cursor-pointer"
                    data-testid="bpm-double-btn"
                    title="Double BPM (× 2)"
                  >
                    2×
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeBpm(-0.1)}
                    disabled={isSaving}
                    className="px-2 py-1 bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] text-xs font-mono text-[#d0d0d0] hover:text-white transition-colors cursor-pointer"
                    data-testid="bpm-minus-01-btn"
                    title="Nudge -0.1 BPM"
                  >
                    -0.1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeBpm(0.1)}
                    disabled={isSaving}
                    className="px-2 py-1 bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] text-xs font-mono text-[#d0d0d0] hover:text-white transition-colors cursor-pointer"
                    data-testid="bpm-plus-01-btn"
                    title="Nudge +0.1 BPM"
                  >
                    +0.1
                  </button>
                </div>
              </div>
            </div>

            {/* ── First Downbeat Controls ── */}
            <div
              className="p-3 bg-[#0d0d0d] border border-[#1c1c1c] space-y-2.5 rounded-none"
              data-testid="override-downbeat-section"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#999999]">
                    First Downbeat
                  </span>
                  {isDownbeatOverridden && (
                    <EditedBadge field="first_downbeat_ms" title="First downbeat is overridden" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void handleClearField(['first_downbeat_ms'], 'Downbeat reset to analyzed value')
                  }
                  disabled={!isDownbeatOverridden || isSaving}
                  className={`px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase border transition-colors cursor-pointer ${
                    isDownbeatOverridden
                      ? 'border-[#444444] bg-[#161616] hover:bg-[#242424] text-[#cccccc]'
                      : 'border-[#1f1f1f] bg-[#090909] text-[#444444] cursor-not-allowed opacity-50'
                  }`}
                  data-testid="downbeat-reset-btn"
                  title="Reset downbeat back to initial analyzed value"
                >
                  ↺ Reset
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-[#141414] border border-[#262626] px-2 py-1">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={downbeatInput}
                    onChange={(e) => setDownbeatInput(e.target.value)}
                    onBlur={handleCommitDownbeatInput}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommitDownbeatInput()}
                    disabled={isSaving}
                    className="w-20 bg-transparent text-white font-mono text-sm focus:outline-none tabular-nums"
                    data-testid="downbeat-input"
                    aria-label="Override first downbeat in milliseconds"
                  />
                  <span className="text-[10px] text-[#666666]">ms</span>
                </div>

                {/* Downbeat Nudge Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleNudgeDownbeat(-10)}
                    disabled={isSaving}
                    className="px-2 py-1 bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] text-xs font-mono text-[#d0d0d0] hover:text-white transition-colors cursor-pointer"
                    data-testid="downbeat-minus-10-btn"
                    title="Nudge grid -10 ms"
                  >
                    -10 ms
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeDownbeat(10)}
                    disabled={isSaving}
                    className="px-2 py-1 bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] text-xs font-mono text-[#d0d0d0] hover:text-white transition-colors cursor-pointer"
                    data-testid="downbeat-plus-10-btn"
                    title="Nudge grid +10 ms"
                  >
                    +10 ms
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShiftBeat(1)}
                    disabled={isSaving}
                    className="px-2.5 py-1 bg-[#161616] hover:bg-[#222222] border border-[#2a2a2a] text-xs font-mono text-[#d0d0d0] hover:text-white transition-colors cursor-pointer"
                    data-testid="downbeat-shift-beat-btn"
                    title="Shift grid forward by 1 beat"
                  >
                    Shift 1 Beat
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Camelot 24-Key Picker ── */}
          <div
            className="p-3 bg-[#0d0d0d] border border-[#1c1c1c] space-y-2.5 rounded-none"
            data-testid="override-key-section"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#999999]">
                  Musical Key (Camelot 24-Wheel)
                </span>
                {isKeyOverridden && <EditedBadge field="key_camelot" title="Key is overridden" />}
                <span className="text-xs font-semibold text-white ml-2">
                  Active: {currentKey}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleClearField(['key_camelot'], 'Key reset to analyzed value')}
                disabled={!isKeyOverridden || isSaving}
                className={`px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase border transition-colors cursor-pointer ${
                  isKeyOverridden
                    ? 'border-[#444444] bg-[#161616] hover:bg-[#242424] text-[#cccccc]'
                    : 'border-[#1f1f1f] bg-[#090909] text-[#444444] cursor-not-allowed opacity-50'
                }`}
                data-testid="key-reset-btn"
                title="Reset Key back to initial analyzed value"
              >
                ↺ Reset
              </button>
            </div>

            {/* 24 Keys Matrix: Minor (A) and Major (B) rows */}
            <div className="space-y-1.5" data-testid="key-picker-grid">
              {/* Minor Keys: 1A - 12A */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                <span className="text-[10px] text-[#666666] w-12 font-bold shrink-0 uppercase">
                  Minor (A)
                </span>
                <div className="flex items-center gap-1">
                  {ALL_CAMELOT_KEYS_24.filter((k) => k.endsWith('A')).map((k) => {
                    const isSelected = k === currentKey;
                    const bg = camelotColor(k);
                    const fg = camelotTextColor(k);

                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => handleSelectKey(k)}
                        disabled={isSaving}
                        className={`w-9 h-7 flex items-center justify-center font-mono font-bold text-xs transition-all cursor-pointer rounded-[2px] ${
                          isSelected
                            ? 'ring-2 ring-white scale-105 shadow-md font-extrabold z-10'
                            : 'opacity-80 hover:opacity-100 hover:scale-102 border border-black/40'
                        }`}
                        style={{ backgroundColor: bg, color: fg }}
                        data-testid={`key-btn-${k}`}
                        title={`Set Key to ${k} (${isSelected ? 'Active' : 'Click to override'})`}
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Major Keys: 1B - 12B */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                <span className="text-[10px] text-[#666666] w-12 font-bold shrink-0 uppercase">
                  Major (B)
                </span>
                <div className="flex items-center gap-1">
                  {ALL_CAMELOT_KEYS_24.filter((k) => k.endsWith('B')).map((k) => {
                    const isSelected = k === currentKey;
                    const bg = camelotColor(k);
                    const fg = camelotTextColor(k);

                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => handleSelectKey(k)}
                        disabled={isSaving}
                        className={`w-9 h-7 flex items-center justify-center font-mono font-bold text-xs transition-all cursor-pointer rounded-[2px] ${
                          isSelected
                            ? 'ring-2 ring-white scale-105 shadow-md font-extrabold z-10'
                            : 'opacity-80 hover:opacity-100 hover:scale-102 border border-black/40'
                        }`}
                        style={{ backgroundColor: bg, color: fg }}
                        data-testid={`key-btn-${k}`}
                        title={`Set Key to ${k} (${isSelected ? 'Active' : 'Click to override'})`}
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
