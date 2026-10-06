import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useWakeLock } from './useWakeLock';
import { usePerformanceClock, formatDuration } from './usePerformanceClock';
import { useStageKeyboard } from './useStageKeyboard';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import { isFieldOverridden } from '../track/overrides';
import { resolveFourPointCues, FOUR_POINT_CUE_CONFIG, CUE_SLOTS, formatCueTime } from '../track/cues';
import { isWindowFullscreen, toggleWindowFullscreen } from '../../utils/windowFullscreen';
import {
  calculatePitchFader,
  getHarmonicIntervalName,
  calculatePhraseTelemetry,
  getTransitionSegmentFlow,
} from './stageTelemetry';
import {
  MetricCard,
  SetlistJumpDrawer,
  ExitConfirmModal,
  StageHeader,
  StageTransitionConsole,
  StageNextDeck,
  StageFooter,
} from './components';

export {
  calculatePitchFader,
  getHarmonicIntervalName,
  calculatePhraseTelemetry,
  getTransitionSegmentFlow,
};

export function StageMode() {
  const {
    setlist,
    setlistName,
    stageCurrentIndex,
    stageStartTime,
    isStageMode,
    exitStageMode,
    stageNext,
    stagePrev,
    stageRestart,
    auditionState,
    auditionPositionMs,
    auditionTrackId,
    toggleAudition,
    seekAudition,
    masterVolume,
    setMasterVolume,
  } = useAppStore(
    useShallow((s) => ({
      setlist: s.setlist, setlistName: s.setlistName,
      stageCurrentIndex: s.stageCurrentIndex, stageStartTime: s.stageStartTime,
      isStageMode: s.isStageMode, exitStageMode: s.exitStageMode,
      stageNext: s.stageNext, stagePrev: s.stagePrev, stageRestart: s.stageRestart,
      auditionState: s.auditionState, auditionPositionMs: s.auditionPositionMs,
      auditionTrackId: s.auditionTrackId, toggleAudition: s.toggleAudition,
      seekAudition: s.seekAudition, masterVolume: s.masterVolume, setMasterVolume: s.setMasterVolume,
    }))
  );

  const [showSetlist, setShowSetlist] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    void isWindowFullscreen().then(setIsFullscreen);
  }, []);

  const handleToggleFullscreen = async () => {
    const nextState = await toggleWindowFullscreen();
    setIsFullscreen(nextState);
  };

  const currentEntry: SetlistEntry | null = setlist[stageCurrentIndex] ?? null;
  const nextEntry: SetlistEntry | null = setlist[stageCurrentIndex + 1] ?? null;
  const prevEntry: SetlistEntry | null = stageCurrentIndex > 0 ? setlist[stageCurrentIndex - 1] ?? null : null;

  // Duration calculations
  const totalDurationMs = useMemo(() => {
    let total = 0;
    let allPresent = true;
    for (const entry of setlist) {
      if (entry.track?.duration_ms != null && entry.track.duration_ms > 0) {
        total += entry.track.duration_ms;
      } else {
        allPresent = false;
      }
    }
    return allPresent && setlist.length > 0 ? total : null;
  }, [setlist]);

  const elapsedSongsMs = useMemo(() => {
    let elapsed = 0;
    for (let i = 0; i < stageCurrentIndex; i++) {
      const dur = setlist[i]?.track?.duration_ms;
      if (dur != null && dur > 0) {
        elapsed += dur;
      }
    }
    return elapsed;
  }, [setlist, stageCurrentIndex]);

  const currentSongDurationMs = currentEntry?.track?.duration_ms ?? null;

  const currentCues = useMemo(() => {
    return resolveFourPointCues(currentEntry?.track);
  }, [currentEntry?.track]);

  const nextCues = useMemo(() => {
    return resolveFourPointCues(nextEntry?.track);
  }, [nextEntry?.track]);

  // Hooks
  const { isActive: wakeLockActive, isSupported: wakeLockSupported } =
    useWakeLock(isStageMode);

  const clock = usePerformanceClock(
    isStageMode,
    stageStartTime,
    totalDurationMs,
    currentSongDurationMs,
    elapsedSongsMs
  );

  // Current elapsed time in the active track (ms)
  const currentSongElapsedMs = useMemo(() => {
    if (auditionState === 'playing' && auditionPositionMs != null && auditionPositionMs > 0) {
      return auditionPositionMs;
    }
    const dur = currentEntry?.track?.duration_ms ?? 0;
    const rehearsalElapsed = Math.max(0, clock.elapsedMs - elapsedSongsMs);
    return dur > 0 ? Math.min(dur, rehearsalElapsed) : rehearsalElapsed;
  }, [
    auditionState,
    auditionPositionMs,
    clock.elapsedMs,
    elapsedSongsMs,
    currentEntry?.track?.duration_ms,
  ]);

  // Target mix-out timestamp for current track (ms)
  const targetMixOutMs = useMemo(() => {
    if (!currentEntry?.track?.duration_ms) return null;
    const dur = currentEntry.track.duration_ms;

    // 1. Cue D (Mix Out in 4-point cue deck)
    if (currentCues.D?.timeMs != null && currentCues.D.timeMs > 0) {
      return currentCues.D.timeMs;
    }

    // 2. Cue point labeled 'mix out' or 'outro'
    const cues = currentEntry.track.analysis?.cue_points ?? [];
    const mixCue = cues.find((c) => {
      const lbl = c.label.toLowerCase();
      return lbl.includes('mix out') || lbl.includes('outro');
    });
    if (mixCue != null && mixCue.time_ms > 0) {
      return mixCue.time_ms;
    }

    // 3. Segment labeled 'outro'
    const segments = currentEntry.track.analysis?.segments ?? [];
    const outroSeg = segments.find((s) => s.label.toLowerCase() === 'outro');
    if (outroSeg != null && outroSeg.start_ms > 0) {
      return outroSeg.start_ms;
    }

    return dur;
  }, [currentEntry, currentCues.D]);

  // Transition countdown (ms remaining until mix-out)
  const transitionCountdownMs = useMemo(() => {
    if (targetMixOutMs == null) return null;
    return Math.max(0, targetMixOutMs - currentSongElapsedMs);
  }, [targetMixOutMs, currentSongElapsedMs]);

  const transitionCountdownStr = useMemo(() => {
    if (transitionCountdownMs == null) return '--:--';
    return formatDuration(transitionCountdownMs);
  }, [transitionCountdownMs]);

  // Active Cue determination for current track
  const activeCueSlot = useMemo(() => {
    const slots: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    let active: 'A' | 'B' | 'C' | 'D' = 'A';
    for (const slot of slots) {
      const cue = currentCues[slot];
      if (cue && cue.timeMs <= currentSongElapsedMs) {
        active = slot;
      }
    }
    return active;
  }, [currentCues, currentSongElapsedMs]);

  // Next upcoming cue in current track
  const upcomingCue = useMemo(() => {
    const slots: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    for (const slot of slots) {
      const cue = currentCues[slot];
      if (cue && cue.timeMs > currentSongElapsedMs) {
        return { slot, cue, cfg: FOUR_POINT_CUE_CONFIG[slot] };
      }
    }
    return null;
  }, [currentCues, currentSongElapsedMs]);

  const transitionSegmentFlow = useMemo(() => {
    return getTransitionSegmentFlow(currentEntry, nextEntry);
  }, [currentEntry, nextEntry]);

  const handleExitRequest = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  const handleExitConfirm = useCallback(() => {
    setShowExitConfirm(false);
    exitStageMode();
  }, [exitStageMode]);

  const handleExitCancel = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  const handleToggleAudition = useCallback(() => {
    if (!currentEntry?.track?.id) return;
    void toggleAudition(currentEntry.track.id);
  }, [currentEntry?.track?.id, toggleAudition]);

  const handleCueJump = useCallback(
    (slot: 'A' | 'B' | 'C' | 'D') => {
      const cue = currentCues[slot];
      if (!cue || cue.timeMs == null || !currentEntry?.track?.id) return;
      const trackId = currentEntry.track.id;
      if (auditionTrackId === trackId && auditionState === 'playing') {
        void seekAudition(cue.timeMs);
      } else {
        void toggleAudition(trackId);
        void seekAudition(cue.timeMs);
      }
    },
    [currentCues, currentEntry?.track?.id, auditionTrackId, auditionState, seekAudition, toggleAudition]
  );

  useStageKeyboard({
    active: isStageMode && !showExitConfirm,
    onNext: () => {
      if (!showSetlist) stageNext();
    },
    onPrev: () => {
      if (!showSetlist) stagePrev();
    },
    onExit: () => {
      if (showSetlist) {
        setShowSetlist(false);
      } else {
        handleExitRequest();
      }
    },
    onToggleSetlist: () => setShowSetlist((prev) => !prev),
    onPlayPause: () => void handleToggleAudition(),
    onCue: handleCueJump,
  });

  // Empty setlist guard
  if (setlist.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full bg-black text-white"
        data-testid="stage-empty"
      >
        <div className="text-center space-y-4">
          <p className="text-2xl font-medium text-slate-400">No tracks in setlist</p>
          <button
            type="button"
            onClick={exitStageMode}
            className="px-6 py-3 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
            data-testid="stage-exit-empty"
          >
            Return to Setlist
          </button>
        </div>
      </div>
    );
  }

  const trackTitle = (entry: SetlistEntry | null): string =>
    entry?.track?.tags?.title ?? entry?.track_id ?? '—';
  const trackArtist = (entry: SetlistEntry | null): string =>
    entry?.track?.tags?.artist ?? '';
  const trackBpm = (entry: SetlistEntry | null): string => {
    const bpm = entry?.track?.analysis?.rhythm?.grid?.bpm;
    return bpm != null ? `${Math.round(bpm)}` : '—';
  };
  const trackKey = (entry: SetlistEntry | null): string => {
    const key = entry?.track?.analysis?.key;
    if (!key) return '—';
    return `${key.camelot.number}${key.camelot.letter}`;
  };
  const trackEnergy = (entry: SetlistEntry | null): string => {
    const e = entry?.track?.analysis?.energy_score;
    return e != null ? `${e}` : '—';
  };

  // Live Mixing Telemetry
  const phraseTelemetry = calculatePhraseTelemetry(
    currentEntry?.track?.analysis?.rhythm?.grid?.bpm,
    currentEntry?.track?.analysis?.rhythm?.grid?.first_downbeat_ms,
    currentSongElapsedMs,
    targetMixOutMs,
    nextEntry?.transition?.phrase_bars || 16
  );

  const pitchFader = calculatePitchFader(
    currentEntry?.track?.analysis?.rhythm?.grid?.bpm,
    nextEntry?.track?.analysis?.rhythm?.grid?.bpm
  );

  const harmonicIntervalLabel = getHarmonicIntervalName(
    trackKey(currentEntry),
    trackKey(nextEntry),
    nextEntry?.transition ?? null
  );

  // Transition advice for next track
  const nextTransition: TransitionAdvice | null = nextEntry?.transition ?? null;

  return (
    <div
      className="flex flex-col h-full bg-surface-deep text-content-primary select-none overflow-hidden font-sans"
      data-testid="stage-mode"
    >
      {/* Top Hardware Status Bar */}
      <StageHeader
        setlistName={setlistName}
        stageCurrentIndex={stageCurrentIndex}
        totalTracks={setlist.length}
        clock={clock}
        totalDurationMs={totalDurationMs}
        wakeLockActive={wakeLockActive}
        wakeLockSupported={wakeLockSupported}
        masterVolume={masterVolume}
        setMasterVolume={setMasterVolume}
        isFullscreen={isFullscreen}
        handleToggleFullscreen={handleToggleFullscreen}
      />

      {/* Main Console Workspace */}
      <main className="flex-1 min-h-0 px-4 lg:px-6 py-4 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 h-full">
          {/* ====== DECK A: CURRENT TRACK (PRIMARY FOCUS) ====== */}
          <section
            className={`flex flex-col justify-between p-5 lg:p-6 bg-surface-deep border border-border-base border-t-2 border-t-emerald-500 shadow-lg min-w-0 ${
              nextEntry ? 'lg:col-span-5' : 'lg:col-span-7'
            }`}
            data-testid="stage-current-track"
          >
            <div>
              {/* Header: Status & Previous Track */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/30" />
                  <span className="text-xs font-mono font-black uppercase tracking-widest text-emerald-400">
                    NOW PLAYING
                  </span>
                </div>

                {prevEntry && (
                  <div
                    className="flex items-center gap-2 px-3 py-1 bg-surface-panel border border-border-subtle text-xs font-mono max-w-[260px] truncate"
                    data-testid="stage-prev-track"
                  >
                    <span className="text-xs uppercase text-content-muted font-bold">PREVIOUS:</span>
                    <span className="text-content-muted truncate">{trackTitle(prevEntry)}</span>
                  </div>
                )}
              </div>

              {/* Huge Track Title (readable from across the room) */}
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight line-clamp-2 break-words mt-3">
                {trackTitle(currentEntry)}
              </h2>
              {trackArtist(currentEntry) && (
                <p className="text-lg sm:text-xl font-medium text-content-secondary mt-1 truncate">
                  {trackArtist(currentEntry)}
                </p>
              )}

              {/* Massive Hardware Telemetry Grid (KEY, BPM, ENERGY, LENGTH) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
                <MetricCard
                  label="KEY"
                  value={trackKey(currentEntry)}
                  accentColor="text-amber-400"
                  isOverridden={isFieldOverridden(currentEntry?.track, 'key_camelot')}
                  overrideField="key_camelot"
                />
                <MetricCard
                  label="BPM"
                  value={trackBpm(currentEntry)}
                  accentColor="text-white"
                  isOverridden={isFieldOverridden(currentEntry?.track, 'bpm')}
                  overrideField="bpm"
                />
                <MetricCard
                  label="ENERGY"
                  value={trackEnergy(currentEntry)}
                  accentColor="text-emerald-400"
                />
                {currentSongDurationMs != null && (
                  <MetricCard
                    label="LENGTH"
                    value={formatDuration(currentSongDurationMs)}
                    accentColor="text-content-secondary"
                  />
                )}
              </div>

              {/* Current Cue & Upcoming Cue Readout */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-surface-panel border border-border-subtle text-xs font-mono my-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/30" />
                  <span className="text-content-muted font-bold uppercase tracking-wider">
                    CURRENT CUE:
                  </span>
                  <span className="text-white font-bold">
                    [{activeCueSlot}] {currentCues[activeCueSlot] ? FOUR_POINT_CUE_CONFIG[activeCueSlot].role : 'INTRO'}
                  </span>
                  {currentCues[activeCueSlot] && (
                    <span className="text-emerald-400 tabular-nums font-semibold">
                      ({formatCueTime(currentCues[activeCueSlot]!.timeMs)})
                    </span>
                  )}
                </div>

                {upcomingCue ? (
                  <div className="flex items-center gap-1.5 text-xs text-content-muted">
                    <span className="uppercase text-content-muted font-medium">NEXT CUE:</span>
                    <span className="text-white font-semibold">
                      [{upcomingCue.slot}] {upcomingCue.cfg.role}
                    </span>
                    <span className="text-amber-400 font-mono tabular-nums">
                      ({formatCueTime(upcomingCue.cue.timeMs)})
                    </span>
                  </div>
                ) : (
                  <span className="text-content-muted text-xs font-mono uppercase">
                    FINAL CUE REACHED
                  </span>
                )}
              </div>

              {/* Hardware 4-Point Performance Cues HUD */}
              <div
                className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1"
                data-testid="stage-cues-hud"
                aria-label="Performance Cues HUD"
              >
                {CUE_SLOTS.map((slot) => {
                  const cue = currentCues[slot];
                  const cfg = FOUR_POINT_CUE_CONFIG[slot];
                  const timeStr = cue ? formatCueTime(cue.timeMs) : '—:——';
                  const isActive = activeCueSlot === slot;

                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => handleCueJump(slot)}
                      disabled={!cue || cue.timeMs == null}
                      data-testid={`stage-cue-pad-${slot}`}
                      className={`flex items-center gap-2 px-3 py-2 font-mono text-xs border rounded-none transition-all cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none ${
                        isActive
                          ? 'border-emerald-500 bg-surface-elevated text-white shadow-[0_0_12px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/50'
                          : cue?.isConfirmed
                          ? 'border-border-strong bg-surface-raised text-white shadow-sm hover:border-border-strong hover:bg-surface-raised'
                          : cue
                          ? 'border-border-base border-dashed bg-surface-deep text-content-secondary hover:border-border-strong'
                          : 'border-border-subtle bg-surface-deep/50 text-content-muted cursor-not-allowed opacity-50'
                      }`}
                      title={
                        cue
                          ? `Jump to Cue ${slot}: ${cfg.role} [${slot === 'A' ? '1' : slot === 'B' ? '2' : slot === 'C' ? '3' : '4'}]`
                          : `No Cue ${slot}`
                      }
                    >
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 text-xs font-black text-black rounded-[2px] shrink-0"
                        style={{ backgroundColor: cfg.colorHex }}
                      >
                        {slot}
                      </span>
                      <div className="flex flex-col text-left min-w-0 flex-1">
                        <span className="font-bold text-xs tracking-wider uppercase text-neutral-300 truncate">
                          {cfg.role}
                        </span>
                        <span className="text-[13px] font-semibold tabular-nums text-white">
                          {timeStr}
                        </span>
                      </div>
                      {cue && (
                        <span
                          className={`text-xs font-mono px-1 py-0.5 uppercase tracking-tight rounded-[2px] shrink-0 ${
                            cue.isConfirmed
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                              : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                          }`}
                        >
                          {cue.isConfirmed ? 'CONFIRMED' : 'SUGGESTED'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ====== CENTER CONSOLE: TRANSITION & COUNTDOWN ====== */}
          <StageTransitionConsole
            nextEntry={nextEntry}
            transitionSegmentFlow={transitionSegmentFlow}
            transitionCountdownStr={transitionCountdownStr}
            targetMixOutMs={targetMixOutMs}
            currentCueDTimeMs={currentCues.D?.timeMs}
            phraseTelemetry={phraseTelemetry}
            pitchFader={pitchFader}
            harmonicIntervalLabel={harmonicIntervalLabel}
            currentEntry={currentEntry}
            trackBpm={trackBpm}
            trackKey={trackKey}
            nextTransition={nextTransition}
          />

          {/* ====== DECK B: NEXT TRACK (UP NEXT) ====== */}
          {nextEntry && (
            <StageNextDeck
              nextEntry={nextEntry}
              stageCurrentIndex={stageCurrentIndex}
              totalTracks={setlist.length}
              trackTitle={trackTitle}
              trackArtist={trackArtist}
              trackBpm={trackBpm}
              trackKey={trackKey}
              trackEnergy={trackEnergy}
              nextCues={nextCues}
            />
          )}
        </div>
      </main>

      {/* Bottom Navigation Bar */}
      <StageFooter
        stagePrev={stagePrev}
        stageNext={stageNext}
        stageCurrentIndex={stageCurrentIndex}
        setlistLength={setlist.length}
        handleToggleAudition={async () => handleToggleAudition()}
        auditionState={auditionState}
        stageRestart={stageRestart}
        showSetlist={showSetlist}
        setShowSetlist={setShowSetlist}
        handleExitRequest={handleExitRequest}
      />

      {/* Setlist Jump Drawer Overlay */}
      <SetlistJumpDrawer
        isOpen={showSetlist}
        onClose={() => setShowSetlist(false)}
        setlist={setlist}
        stageCurrentIndex={stageCurrentIndex}
        onJumpToIndex={(idx) => {
          useAppStore.getState().stageGoTo(idx);
          setShowSetlist(false);
        }}
      />

      {/* Exit Confirmation Modal */}
      <ExitConfirmModal
        isOpen={showExitConfirm}
        onCancel={handleExitCancel}
        onConfirm={handleExitConfirm}
      />
    </div>
  );
}

export default StageMode;
