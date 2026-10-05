import React, { useState, useCallback } from 'react';
import type { Track } from '../../../bindings/Track';
import {
  FOUR_POINT_CUE_CONFIG,
  CUE_SLOTS,
  resolveFourPointCues,
  formatCueTime,
  calculateBarNumber,
  nudgeCueTime,
  snapTimeToGrid,
  serializeFourPointCues,
  regenerateCanonicalFourPointCues,
  type PerformanceCueSlot,
  type PerformanceCue,
} from './fourPointCues';
import {
  setTrackOverride,
  clearTrackOverride,
  getTrackWithOverrides,
} from '../../../api/overrides';
import { useAppStore } from '../../../store/useAppStore';

export interface FourPointCueDeckProps {
  track: Track | null;
  playheadPositionMs: number | null;
  isPlaying?: boolean;
  onJumpToCue: (timeMs: number, autoPlay?: boolean) => void;
  className?: string;
}

export const FourPointCueDeck: React.FC<FourPointCueDeckProps> = ({
  track,
  playheadPositionMs,
  isPlaying: _isPlaying = false,
  onJumpToCue,
  className = '',
}) => {
  const { addToast, refreshTrackInSetlist } = useAppStore();
  const [isSaving, setIsSaving] = useState(false);

  const cuesRecord = resolveFourPointCues(track);
  const grid = track?.analysis?.rhythm.grid;
  const beatsMs = grid?.beats_ms ?? [];
  const durationMs = track?.duration_ms ?? 0;

  // Persists a full set of cues to track overrides
  const handlePersistCues = useCallback(
    async (updatedCuesRecord: Record<PerformanceCueSlot, PerformanceCue | null>, toastMsg?: string) => {
      if (!track) return;
      setIsSaving(true);
      try {
        const serialized = serializeFourPointCues(updatedCuesRecord);
        await setTrackOverride(track.id, { cues: serialized });
        const freshTrack = await getTrackWithOverrides(track.id);
        if (freshTrack) {
          await refreshTrackInSetlist(freshTrack);
        }
        if (toastMsg) {
          addToast({ type: 'success', message: toastMsg });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast({ type: 'error', message: 'Failed to update cue point', details: msg });
      } finally {
        setIsSaving(false);
      }
    },
    [track, addToast, refreshTrackInSetlist]
  );

  // Set cue at current playhead
  const handleSetCueAtPlayhead = useCallback(
    (slot: PerformanceCueSlot) => {
      if (!track) return;
      const targetTime = playheadPositionMs != null && playheadPositionMs >= 0 ? playheadPositionMs : 0;
      const snappedTime = snapTimeToGrid(targetTime, beatsMs);
      const cfg = FOUR_POINT_CUE_CONFIG[slot];

      const updatedRecord = { ...cuesRecord };
      updatedRecord[slot] = {
        slot,
        index: cfg.index,
        role: cfg.role,
        label: cfg.defaultLabel,
        timeMs: snappedTime,
        colorHex: cfg.colorHex,
        isSuggested: false,
        isConfirmed: true,
        kind: 'HotCue',
      };

      void handlePersistCues(
        updatedRecord,
        `Cue ${slot} (${cfg.role}) set at ${formatCueTime(snappedTime)}`
      );
    },
    [track, playheadPositionMs, beatsMs, cuesRecord, handlePersistCues]
  );

  // Nudge cue time by delta milliseconds
  const handleNudgeCue = useCallback(
    (slot: PerformanceCueSlot, deltaMs: number) => {
      const cue = cuesRecord[slot];
      if (!cue) return;
      const newTime = nudgeCueTime(cue.timeMs, deltaMs, durationMs);
      const updatedRecord = { ...cuesRecord };
      updatedRecord[slot] = {
        ...cue,
        timeMs: newTime,
        isSuggested: false,
        isConfirmed: true,
      };

      void handlePersistCues(
        updatedRecord,
        `Cue ${slot} shifted to ${formatCueTime(newTime)}`
      );
    },
    [cuesRecord, durationMs, handlePersistCues]
  );

  // Nudge by 1 beat
  const handleNudgeBeat = useCallback(
    (slot: PerformanceCueSlot, direction: 1 | -1) => {
      const cue = cuesRecord[slot];
      if (!cue) return;
      const beatMs = grid?.bpm && grid.bpm > 0 ? 60000.0 / grid.bpm : 500;
      handleNudgeCue(slot, direction * beatMs);
    },
    [cuesRecord, grid, handleNudgeCue]
  );

  // Confirm a suggested cue into user-locked state
  const handleConfirmCue = useCallback(
    (slot: PerformanceCueSlot) => {
      const cue = cuesRecord[slot];
      if (!cue) return;
      const updatedRecord = { ...cuesRecord };
      updatedRecord[slot] = {
        ...cue,
        isSuggested: false,
        isConfirmed: true,
      };
      void handlePersistCues(
        updatedRecord,
        `Cue ${slot} (${cue.role}) confirmed and locked`
      );
    },
    [cuesRecord, handlePersistCues]
  );

  // Delete a cue
  const handleDeleteCue = useCallback(
    (slot: PerformanceCueSlot) => {
      const updatedRecord = { ...cuesRecord };
      updatedRecord[slot] = null;
      void handlePersistCues(updatedRecord, `Cue ${slot} deleted`);
    },
    [cuesRecord, handlePersistCues]
  );

  // Regenerate all 4 canonical cues from analysis
  const handleRegenerateAll = useCallback(() => {
    if (!track?.analysis) return;
    const freshCues = regenerateCanonicalFourPointCues(
      track.analysis.segments,
      track.analysis.rhythm.grid,
      track.duration_ms
    );
    const updatedRecord: Record<PerformanceCueSlot, PerformanceCue | null> = {
      A: null,
      B: null,
      C: null,
      D: null,
    };
    for (const c of freshCues) {
      const slot = CUE_SLOTS[c.index];
      if (slot) {
        const cfg = FOUR_POINT_CUE_CONFIG[slot];
        updatedRecord[slot] = {
          slot,
          index: cfg.index,
          role: cfg.role,
          label: cfg.defaultLabel,
          timeMs: c.time_ms,
          colorHex: cfg.colorHex,
          isSuggested: true,
          isConfirmed: false,
          kind: c.kind,
        };
      }
    }
    void handlePersistCues(updatedRecord, 'Regenerated all 4 canonical cues from analysis');
  }, [track, handlePersistCues]);

  // Revert all cues to analysis (clear database overrides)
  const handleRevertAll = useCallback(async () => {
    if (!track) return;
    setIsSaving(true);
    try {
      await clearTrackOverride(track.id, ['cues']);
      const freshTrack = await getTrackWithOverrides(track.id);
      if (freshTrack) {
        await refreshTrackInSetlist(freshTrack);
      }
      addToast({ type: 'info', message: 'Reverted cues to automatic analysis suggestions' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: 'error', message: 'Failed to reset cues', details: msg });
    } finally {
      setIsSaving(false);
    }
  }, [track, addToast, refreshTrackInSetlist]);

  // Confirm all current cues
  const handleConfirmAll = useCallback(() => {
    const updatedRecord = { ...cuesRecord };
    let count = 0;
    for (const slot of CUE_SLOTS) {
      if (updatedRecord[slot]) {
        updatedRecord[slot] = {
          ...updatedRecord[slot]!,
          isSuggested: false,
          isConfirmed: true,
        };
        count++;
      }
    }
    if (count > 0) {
      void handlePersistCues(updatedRecord, `Confirmed all ${count} performance cues`);
    }
  }, [cuesRecord, handlePersistCues]);

  if (!track) return null;

  const totalCuesPresent = CUE_SLOTS.filter((s) => cuesRecord[s] !== null).length;
  const confirmedCount = CUE_SLOTS.filter((s) => cuesRecord[s]?.isConfirmed).length;
  const suggestedCount = CUE_SLOTS.filter((s) => cuesRecord[s]?.isSuggested).length;

  return (
    <div
      className={`bg-[#080808] border border-[#1c1c1c] p-4 font-mono select-none ${className}`}
      data-testid="four-point-cue-deck"
      role="region"
      aria-label="Hardware Performance Cue Deck"
    >
      {/* ── Deck Header & Global Management ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-[#181818]">
        <div>
          <div className="flex items-center gap-2">
            <span className="hw-led hw-led-cyan w-2 h-2 rounded-full shrink-0" />
            <h3 className="text-xs font-bold tracking-wider uppercase text-white">
              PERFORMANCE CUES (A – D)
            </h3>
            <span className="text-xs text-[#64748b]">|</span>
            <span className="text-xs text-[#94a3b8] font-semibold">
              {totalCuesPresent}/4 ACTIVE
              {confirmedCount > 0 && ` • ${confirmedCount} CONFIRMED`}
              {suggestedCount > 0 && ` • ${suggestedCount} SUGGESTED`}
            </span>
          </div>
          <p className="text-xs text-[#71717a] mt-0.5">
            Standard four-point hardware framework: A (Intro) • B (Breakdown) • C (Drop) • D (Mix Out)
          </p>
        </div>

        {/* Global Deck Actions */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {suggestedCount > 0 && (
            <button
              type="button"
              onClick={handleConfirmAll}
              disabled={isSaving}
              className="hw-btn px-2.5 py-1 text-xs font-bold uppercase tracking-wider bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/50 text-emerald-300 transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-50 active:translate-y-[1px]"
              title="Confirm and lock all current cue suggestions"
              data-testid="btn-confirm-all-cues"
            >
              ✓ Confirm All
            </button>
          )}

          <button
            type="button"
            onClick={handleRegenerateAll}
            disabled={isSaving}
            className="hw-btn px-2.5 py-1 text-xs font-bold uppercase tracking-wider bg-[#121212] hover:bg-[#1c1c1c] border border-[#2b2b2b] text-[#cfcfcf] hover:text-white transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none disabled:opacity-50 active:translate-y-[1px]"
            title="Recalculate all 4 canonical cues from underlying DSP audio segments"
            data-testid="btn-regenerate-all-cues"
          >
            ↻ Regenerate
          </button>

          {confirmedCount > 0 && (
            <button
              type="button"
              onClick={() => void handleRevertAll()}
              disabled={isSaving}
              className="hw-btn px-2 py-1 text-xs font-medium uppercase tracking-wider bg-[#141414] hover:bg-[#1e1e1e] border border-[#282828] text-[#888888] hover:text-[#cfcfcf] transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none disabled:opacity-50 active:translate-y-[1px]"
              title="Revert user overrides and restore pure analysis suggestions"
              data-testid="btn-revert-cues"
            >
              Revert
            </button>
          )}
        </div>
      </div>

      {/* ── 4-Slot Hardware Performance Pad Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3.5" data-testid="cues-list">
        {CUE_SLOTS.map((slot) => {
          const cfg = FOUR_POINT_CUE_CONFIG[slot];
          const cue = cuesRecord[slot];
          const isPresent = cue !== null;

          // Check if playhead is near this cue (within 800ms)
          const isNearPlayhead =
            isPresent &&
            playheadPositionMs != null &&
            Math.abs(playheadPositionMs - cue.timeMs) < 800;

          return (
            <div
              key={slot}
              onClick={() => {
                if (cue) onJumpToCue(cue.timeMs, false);
              }}
              className={`relative flex flex-col justify-between p-3 border transition-all duration-150 cursor-pointer select-none ${
                isPresent
                  ? isNearPlayhead
                    ? 'border-white bg-[#141414] ring-2 ring-white/40 shadow-lg'
                    : cue.isConfirmed
                    ? 'border-[#2c323c] bg-[#0c1015] hover:border-[#3d4554]'
                    : 'border-[#1e2025] bg-[#0a0c0e] hover:border-[#2b2f38]'
                  : 'border-[#181818] bg-[#070707] opacity-75 hover:opacity-100 hover:border-[#242424]'
              }`}
              style={{
                borderTopWidth: isPresent ? '3px' : '1px',
                borderTopColor: isPresent ? cfg.colorHex : undefined,
              }}
              data-testid={`cue-card-${slot}`}
            >
              {/* Pad Top Info Bar */}
              <div className="flex items-start justify-between gap-1.5" data-testid={`cue-pad-${slot}`}>
                <div className="flex items-center gap-2">
                  {/* Large tactile Pad Button with Shortcut */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (cue) {
                        onJumpToCue(cue.timeMs, true);
                      } else {
                        handleSetCueAtPlayhead(slot);
                      }
                    }}
                    className="hw-pad w-8 h-8 rounded-none border flex items-center justify-center font-bold text-xs shadow-md cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                    style={{
                      backgroundColor: isPresent ? cfg.colorHex : '#181818',
                      borderColor: isPresent ? cfg.badgeBorder : '#2b2b2b',
                      color: isPresent ? '#ffffff' : '#666666',
                    }}
                    title={
                      isPresent
                        ? `Trigger Cue ${slot} (${cfg.role}) [Key ${cfg.shortcutKey}]`
                        : `Set Cue ${slot} at playhead [Key ${cfg.shortcutKey}]`
                    }
                    data-testid={`pad-trigger-${slot}`}
                  >
                    {slot}
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white tracking-wider">
                        {cfg.role}
                      </span>
                      <span className="text-xs text-[#666666]">[{cfg.shortcutKey}]</span>
                    </div>
                    <div className="text-xs text-[#888888] truncate">
                      {cfg.description}
                    </div>
                  </div>
                </div>

                {/* Status Badges: SUGGESTED vs CONFIRMED */}
                {isPresent && (
                  <div>
                    {cue.isConfirmed ? (
                      <span
                        className="px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 select-none"
                        title="User-confirmed cue position (locked in overrides)"
                        data-testid={`badge-confirmed-${slot}`}
                      >
                        CONFIRMED
                      </span>
                    ) : (
                      <span
                        className="px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider bg-[#141414] text-cyan-300/80 border border-dashed border-cyan-500/40 select-none"
                        title="Automatically suggested by audio DSP analysis"
                        data-testid={`badge-suggested-${slot}`}
                      >
                        SUGGESTED
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Pad Center: Timestamp & Location Display */}
              <div className="my-2.5 py-1.5 px-2 bg-[#060606] border border-[#161616]">
                {isPresent ? (
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-sm font-bold text-white tabular-nums tracking-wide">
                      {formatCueTime(cue.timeMs)}
                    </span>
                    <span className="text-xs text-[#888888] font-mono">
                      {calculateBarNumber(cue.timeMs, grid)
                        ? `Bar ${calculateBarNumber(cue.timeMs, grid)}`
                        : `${cue.kind}`}
                    </span>
                  </div>
                ) : (
                  <div className="text-center py-0.5 text-xs text-[#555555] italic">
                    Slot Empty
                  </div>
                )}
              </div>

              {/* Pad Action Controls Footer */}
              <div className="pt-2 border-t border-[#141414] flex items-center justify-between gap-1 text-xs">
                {isPresent ? (
                  <>
                    {/* Audition & Nudge */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onJumpToCue(cue.timeMs, true)}
                        className="hw-btn px-2 py-0.5 bg-[#141414] hover:bg-[#202020] text-emerald-400 border border-[#262626] font-bold text-xs transition-colors cursor-pointer rounded-none focus-visible:ring-1 focus-visible:ring-emerald-400 focus-visible:outline-none active:translate-y-[1px]"
                        title="Audition / Rehearse: Jump and Play"
                        data-testid={`btn-audition-${slot}`}
                      >
                        ▶ PLAY
                      </button>

                      {/* -1 Beat */}
                      <button
                        type="button"
                        onClick={() => handleNudgeBeat(slot, -1)}
                        className="hw-btn px-1.5 py-0.5 bg-[#121212] hover:bg-[#1a1a1a] text-[#888888] hover:text-white border border-[#222222] text-xs cursor-pointer rounded-none active:translate-y-[1px]"
                        title="Nudge -1 Beat"
                        data-testid={`btn-nudge-prev-${slot}`}
                      >
                        ◂
                      </button>

                      {/* +1 Beat */}
                      <button
                        type="button"
                        onClick={() => handleNudgeBeat(slot, 1)}
                        className="hw-btn px-1.5 py-0.5 bg-[#121212] hover:bg-[#1a1a1a] text-[#888888] hover:text-white border border-[#222222] text-xs cursor-pointer rounded-none active:translate-y-[1px]"
                        title="Nudge +1 Beat"
                        data-testid={`btn-nudge-next-${slot}`}
                      >
                        ▸
                      </button>
                    </div>

                    {/* Lock / Confirm / Delete */}
                    <div className="flex items-center gap-1">
                      {cue.isSuggested && (
                        <button
                          type="button"
                          onClick={() => handleConfirmCue(slot)}
                          className="hw-btn px-1.5 py-0.5 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-500/30 text-xs font-bold cursor-pointer rounded-none active:translate-y-[1px]"
                          title="Confirm and lock this cue position"
                          data-testid={`btn-confirm-${slot}`}
                        >
                          ✓
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSetCueAtPlayhead(slot)}
                        className="hw-btn px-1.5 py-0.5 bg-[#141414] hover:bg-[#222222] text-cyan-400 border border-[#242424] text-xs cursor-pointer rounded-none active:translate-y-[1px]"
                        title="Snap to current playhead position"
                        data-testid={`btn-set-playhead-${slot}`}
                      >
                        ⊕
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCue(slot)}
                        className="hw-btn px-1.5 py-0.5 bg-[#141414] hover:bg-rose-950/40 text-[#666666] hover:text-rose-400 border border-[#222222] hover:border-rose-500/30 text-xs cursor-pointer rounded-none active:translate-y-[1px]"
                        title="Delete cue"
                        data-testid={`btn-delete-${slot}`}
                      >
                        ✕
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetCueAtPlayhead(slot)}
                    className="hw-btn w-full py-1 text-xs font-bold uppercase tracking-wider bg-[#101010] hover:bg-[#181818] border border-[#222222] hover:border-[#38bdf8] text-[#888888] hover:text-white transition-colors cursor-pointer rounded-none flex items-center justify-center gap-1.5 active:translate-y-[1px]"
                    data-testid={`btn-set-empty-${slot}`}
                  >
                    <span>⊕</span>
                    <span>Set At Playhead</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Extended Cue Registers (E – H) if present on track ── */}
      {track.analysis?.cue_points &&
        track.analysis.cue_points.filter((c) => c.index >= 4).length > 0 && (
          <div className="mt-3.5 pt-3 border-t border-[#181818]" data-testid="extended-cues-list">
            <div className="text-xs text-[#64748b] font-bold uppercase tracking-wider mb-2">
              EXTENDED REGISTERS (E – H)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {track.analysis.cue_points
                .filter((c) => c.index >= 4)
                .map((c) => {
                  const letter = String.fromCharCode(65 + c.index);
                  return (
                    <div
                      key={c.index}
                      onClick={() => onJumpToCue(c.time_ms, false)}
                      className="p-2 border border-[#1c1c1c] bg-[#0c0c0c] hover:bg-[#141414] flex items-center justify-between cursor-pointer select-none transition-colors"
                      data-testid={`cue-card-${letter}`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-5 h-5 flex items-center justify-center font-mono font-bold text-xs text-white shrink-0"
                          style={{ backgroundColor: c.color_hex }}
                        >
                          {letter}
                        </span>
                        <span className="text-xs text-[#cfcfcf] truncate font-mono">
                          {c.label}
                        </span>
                      </div>
                      <span className="text-xs text-emerald-400 font-mono shrink-0 ml-1 tabular-nums">
                        {formatCueTime(c.time_ms)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
    </div>
  );
};
