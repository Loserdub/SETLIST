import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useWakeLock } from './useWakeLock';
import { usePerformanceClock, formatDuration, formatDurationCompact } from './usePerformanceClock';
import { useStageKeyboard } from './useStageKeyboard';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import { EditedBadge, isFieldOverridden } from '../track/overrides';
import { IconPrev, IconNext, IconAlertTriangle, IconPlay, IconPause } from '../../components/icons';
import { resolveFourPointCues, FOUR_POINT_CUE_CONFIG, CUE_SLOTS, formatCueTime } from '../track/cues';
import { isWindowFullscreen, toggleWindowFullscreen } from '../../utils/windowFullscreen';

/**
 * Calculates pitch fader offset percentage between current track and incoming track.
 */
export function calculatePitchFader(
  currentBpm: number | null | undefined,
  nextBpm: number | null | undefined
): { pct: number; label: string } | null {
  if (currentBpm == null || nextBpm == null || currentBpm <= 0 || nextBpm <= 0) return null;
  const pct = ((nextBpm - currentBpm) / currentBpm) * 100;
  const sign = pct > 0 ? '+' : '';
  return {
    pct,
    label: `${sign}${pct.toFixed(1)}%`,
  };
}

/**
 * Formats harmonic interval relationship name from Camelot keys and transition advice.
 */
export function getHarmonicIntervalName(
  currentKeyStr: string,
  nextKeyStr: string,
  advice: TransitionAdvice | null
): string {
  if (!currentKeyStr || !nextKeyStr || currentKeyStr === '—' || nextKeyStr === '—') return '—';
  if (currentKeyStr === nextKeyStr) return 'Exact Consonance';
  if (advice?.transition_type) {
    const type = advice.transition_type;
    if (type === 'Fifth') return '+1 Fifth (High Consonance)';
    if (type === 'RelativeSwitch') return 'Relative Mode Switch';
    if (type === 'WholeStepLift') return '+2 Whole Step Lift';
    if (type === 'HalfStepLift') return '+7 Half Step Lift';
    if (type === 'Tritone') return '+6 Tritone Shift';
    return type.replace(/([A-Z])/g, ' $1').trim();
  }
  return 'Harmonic Shift';
}

/**
 * Calculates phrase progression telemetry (current bar/beat in phrase, bars remaining until mix-out)
 */
export function calculatePhraseTelemetry(
  bpm: number | null | undefined,
  firstDownbeatMs: number | null | undefined,
  currentElapsedMs: number,
  targetMixOutMs: number | null,
  phraseBars: number = 16
) {
  const safeBpm = bpm != null && bpm > 0 ? bpm : 120;
  const beatMs = 60000 / safeBpm;
  const barMs = beatMs * 4;
  const safePhraseBars = phraseBars > 0 ? phraseBars : 16;
  const safeDownbeat = firstDownbeatMs ?? 0;

  const elapsedSinceDownbeat = Math.max(0, currentElapsedMs - safeDownbeat);
  const totalBarsElapsed = Math.floor(elapsedSinceDownbeat / barMs);
  const totalBeatsElapsed = Math.floor(elapsedSinceDownbeat / beatMs);

  const currentBeatInBar = (totalBeatsElapsed % 4) + 1; // 1 to 4
  const currentBarInPhrase = (totalBarsElapsed % safePhraseBars) + 1; // 1 to safePhraseBars

  let barsRemaining: number | null = null;
  let beatsRemaining: number | null = null;

  if (targetMixOutMs != null) {
    const msRemaining = Math.max(0, targetMixOutMs - currentElapsedMs);
    barsRemaining = Math.ceil(msRemaining / barMs);
    beatsRemaining = Math.floor((msRemaining % barMs) / beatMs);
  }

  return {
    beatMs,
    barMs,
    currentBeatInBar,
    currentBarInPhrase,
    phraseBars: safePhraseBars,
    barsRemaining,
    beatsRemaining,
  };
}

/**
 * Resolves the musical transition flow between current and next tracks.
 * Prefers analyzed segments (e.g. BREAKDOWN → DROP), specific transition technique,
 * or standard DJ phrase handoff notation.
 */
export function getTransitionSegmentFlow(
  currentEntry: SetlistEntry | null,
  nextEntry: SetlistEntry | null
): string {
  if (!currentEntry || !nextEntry) return 'END OF SET';

  const advice = nextEntry.transition;
  const currentSegments = currentEntry.track?.analysis?.segments ?? [];
  const nextSegments = nextEntry.track?.analysis?.segments ?? [];

  // Drop-swap technique is specifically Breakdown/Buildup into Drop
  if (
    (advice?.transition_type as string) === 'DropSwap' ||
    advice?.notes?.some((n) => n.toLowerCase().includes('drop swap') || n.toLowerCase().includes('drop-swap'))
  ) {
    return 'BREAKDOWN → DROP';
  }

  // Check outgoing segment at end of current track
  let outSegmentLabel = '';
  if (currentSegments.length > 0) {
    const lastSeg = currentSegments[currentSegments.length - 1];
    const prevSeg = currentSegments.length > 1 ? currentSegments[currentSegments.length - 2] : null;
    outSegmentLabel =
      lastSeg?.label?.toLowerCase() === 'outro' && prevSeg?.label
        ? prevSeg.label
        : (lastSeg?.label ?? 'breakdown');
  } else {
    outSegmentLabel = advice?.loop_extension_recommended ? 'loop outro' : 'breakdown';
  }

  // Check incoming segment at start of next track
  let inSegmentLabel = '';
  if (nextSegments.length > 0) {
    const firstSeg = nextSegments[0];
    const secondSeg = nextSegments.length > 1 ? nextSegments[1] : null;
    inSegmentLabel =
      firstSeg?.label?.toLowerCase() === 'intro' && secondSeg?.label
        ? secondSeg.label
        : (firstSeg?.label ?? 'drop');
  } else {
    inSegmentLabel = 'drop';
  }

  return `${outSegmentLabel.toUpperCase()} → ${inSegmentLabel.toUpperCase()}`;
}

/**
 * Stage Mode — dedicated live performance and rehearsal mode.
 *
 * Professional performance hardware interface:
 * - Huge readable information (readable from several feet away)
 * - Deck A (Current Track) with prominent Camelot Key, BPM, Energy, and Cues
 * - Transition Console with phase flow and live countdown to mix-out
 * - Deck B (Next Track) with incoming Camelot Key, BPM, Energy, and Entry Cue
 * - Set position, elapsed set time, remaining set time, and total runtime
 * - Full keyboard & Bluetooth foot pedal support
 * - Screen Wake Lock active while in stage mode
 */
export function StageMode() {
  const {
    setlist,
    setlistName,
    isStageMode,
    stageCurrentIndex,
    stageStartTime,
    stageNext,
    stagePrev,
    exitStageMode,
    auditionState,
    auditionPositionMs,
    auditionTrackId,
    toggleAudition,
    seekAudition,
    masterVolume,
    setMasterVolume,
  } = useAppStore();

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSetlist, setShowSetlist] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    void isWindowFullscreen().then(setIsFullscreen);
    const handleResize = () => {
      void isWindowFullscreen().then(setIsFullscreen);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const next = await toggleWindowFullscreen();
    setIsFullscreen(next);
  }, []);

  // Derived track data
  const currentEntry: SetlistEntry | null = setlist[stageCurrentIndex] ?? null;
  const nextEntry: SetlistEntry | null = setlist[stageCurrentIndex + 1] ?? null;
  const prevEntry: SetlistEntry | null =
    stageCurrentIndex > 0 ? (setlist[stageCurrentIndex - 1] ?? null) : null;

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
    toggleAudition(currentEntry.track.id);
  }, [currentEntry?.track?.id, toggleAudition]);

  const handleCueJump = useCallback(
    (slot: 'A' | 'B' | 'C' | 'D') => {
      const cue = currentCues[slot];
      if (!cue || cue.timeMs == null || !currentEntry?.track?.id) return;
      const trackId = currentEntry.track.id;
      if (auditionTrackId === trackId && auditionState === 'playing') {
        seekAudition(cue.timeMs);
      } else {
        toggleAudition(trackId);
        seekAudition(cue.timeMs);
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
    onPlayPause: handleToggleAudition,
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
  const phraseTelemetry = useMemo(() => {
    const bpm = currentEntry?.track?.analysis?.rhythm?.grid?.bpm;
    const downbeat = currentEntry?.track?.analysis?.rhythm?.grid?.first_downbeat_ms;
    const phraseBars = nextEntry?.transition?.phrase_bars || 16;
    return calculatePhraseTelemetry(
      bpm,
      downbeat,
      currentSongElapsedMs,
      targetMixOutMs,
      phraseBars
    );
  }, [
    currentEntry?.track?.analysis?.rhythm?.grid,
    nextEntry?.transition?.phrase_bars,
    currentSongElapsedMs,
    targetMixOutMs,
  ]);

  const pitchFader = useMemo(() => {
    const curBpm = currentEntry?.track?.analysis?.rhythm?.grid?.bpm;
    const nxtBpm = nextEntry?.track?.analysis?.rhythm?.grid?.bpm;
    return calculatePitchFader(curBpm, nxtBpm);
  }, [currentEntry, nextEntry]);

  const harmonicIntervalLabel = useMemo(() => {
    const curKey = trackKey(currentEntry);
    const nxtKey = trackKey(nextEntry);
    return getHarmonicIntervalName(curKey, nxtKey, nextEntry?.transition ?? null);
  }, [currentEntry, nextEntry]);

  // Transition advice for next track
  const nextTransition: TransitionAdvice | null = nextEntry?.transition ?? null;

  return (
    <div
      className="flex flex-col h-full bg-[#030304] text-[#ededed] select-none overflow-hidden font-sans"
      data-testid="stage-mode"
    >
      {/* Top Hardware Status Bar — Set Name, Position, Clocks, Wake Lock */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#000000] border-b border-[#1f1f23] shrink-0 font-mono">
        <div className="flex items-center gap-3">
          <span className="text-sm font-black uppercase tracking-wider text-white">
            {setlistName}
          </span>
          <span className="text-xs text-white bg-[#141418] border border-[#27272a] px-2.5 py-1 font-bold">
            {stageCurrentIndex + 1} / {setlist.length}
          </span>
        </div>

        <div className="flex items-center gap-6 text-xs text-[#a8a8a8]">
          {/* Elapsed Set Time */}
          <div className="flex items-center gap-2">
            <span className="text-[#888888] uppercase tracking-wider font-semibold">ELAPSED:</span>
            <span
              className="text-base font-bold text-white tabular-nums tracking-tight"
              data-testid="stage-elapsed"
            >
              {formatDuration(clock.elapsedMs)}
            </span>
          </div>

          {/* Remaining Set Time */}
          {clock.remainingMs !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[#888888] uppercase tracking-wider font-semibold">REMAINING:</span>
              <span
                className="text-base font-bold text-amber-400 tabular-nums tracking-tight"
                data-testid="stage-remaining"
              >
                −{formatDurationCompact(clock.remainingMs)}
              </span>
            </div>
          )}

          {/* Total Duration */}
          {totalDurationMs !== null && (
            <span className="text-[#888888] font-bold text-xs" data-testid="stage-total">
              [{formatDurationCompact(totalDurationMs)} TOTAL]
            </span>
          )}

          {/* Wake Lock Active Indicator */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                wakeLockActive
                  ? 'bg-emerald-400 ring-2 ring-emerald-500/30'
                  : wakeLockSupported
                  ? 'bg-amber-400'
                  : 'bg-[#333333]'
              }`}
              title={
                wakeLockActive
                  ? 'Screen wake lock active'
                  : wakeLockSupported
                  ? 'Screen wake lock released'
                  : 'Screen wake lock not supported'
              }
            />
            <span className="text-xs uppercase tracking-wider text-[#71717a]">
              {wakeLockActive ? 'WAKE LOCK' : 'NO LOCK'}
            </span>
          </div>

          {/* Master Volume Controller */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#141418] border border-[#27272a] text-xs">
            <button
              type="button"
              onClick={() => void setMasterVolume(masterVolume > 0 ? 0 : 1.0)}
              className="hover:text-white cursor-pointer text-[#a8a8a8]"
              title={masterVolume === 0 ? 'Unmute' : 'Mute'}
              data-testid="stage-mute-btn"
            >
              {masterVolume === 0 ? '🔇' : masterVolume < 0.5 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={masterVolume}
              onChange={(e) => void setMasterVolume(parseFloat(e.target.value))}
              className="w-16 h-1 bg-[#27272a] accent-emerald-400 cursor-pointer"
              title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
              data-testid="stage-volume-slider"
            />
            <span className="tabular-nums text-white w-7 text-right">
              {Math.round(masterVolume * 100)}%
            </span>
          </div>

          {/* Fullscreen Toggle Button */}
          <button
            type="button"
            onClick={() => void handleToggleFullscreen()}
            className={`hw-btn flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer border rounded-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none ${
              isFullscreen
                ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-bold'
                : 'border-[#27272a] bg-[#141418] hover:bg-[#202026] text-[#ededed]'
            }`}
            title="Toggle fullscreen window [F11]"
            data-testid="stage-fullscreen-btn"
          >
            <span>{isFullscreen ? '⤢ EXIT FULL' : '⤢ FULLSCREEN'}</span>
          </button>
        </div>
      </header>

      {/* Main Console Workspace */}
      <main className="flex-1 min-h-0 px-4 lg:px-6 py-4 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 h-full">
          {/* ====== DECK A: CURRENT TRACK (PRIMARY FOCUS) ====== */}
          <section
            className={`flex flex-col justify-between p-5 lg:p-6 bg-[#09090b] border border-[#27272a] border-t-2 border-t-emerald-500 shadow-lg min-w-0 ${
              nextEntry ? 'lg:col-span-5' : 'lg:col-span-7'
            }`}
            data-testid="stage-current-track"
          >
            <div>
              {/* Header: Status & Previous Track */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#1f1f23]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/30" />
                  <span className="text-xs font-mono font-black uppercase tracking-widest text-emerald-400">
                    NOW PLAYING
                  </span>
                </div>

                {prevEntry && (
                  <div
                    className="flex items-center gap-2 px-3 py-1 bg-[#0c0c10] border border-[#1f1f23] text-xs font-mono max-w-[260px] truncate"
                    data-testid="stage-prev-track"
                  >
                    <span className="text-xs uppercase text-[#a8a8a8] font-bold">PREVIOUS:</span>
                    <span className="text-[#a1a1aa] truncate">{trackTitle(prevEntry)}</span>
                  </div>
                )}
              </div>

              {/* Huge Track Title (readable from across the room) */}
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight line-clamp-2 break-words mt-3">
                {trackTitle(currentEntry)}
              </h2>
              {trackArtist(currentEntry) && (
                <p className="text-lg sm:text-xl font-medium text-[#cfcfcf] mt-1 truncate">
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
                    accentColor="text-[#cfcfcf]"
                  />
                )}
              </div>

              {/* Current Cue & Upcoming Cue Readout */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[#0c0c10] border border-[#1f1f23] text-xs font-mono my-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/30" />
                  <span className="text-[#a1a1aa] font-bold uppercase tracking-wider">
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
                  <div className="flex items-center gap-1.5 text-xs text-[#a1a1aa]">
                    <span className="uppercase text-[#71717a] font-medium">NEXT CUE:</span>
                    <span className="text-white font-semibold">
                      [{upcomingCue.slot}] {upcomingCue.cfg.role}
                    </span>
                    <span className="text-amber-400 font-mono tabular-nums">
                      ({formatCueTime(upcomingCue.cue.timeMs)})
                    </span>
                  </div>
                ) : (
                  <span className="text-[#a8a8a8] text-xs font-mono uppercase">
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
                      className={`flex items-center gap-2 px-3 py-2 font-mono text-xs border rounded-none transition-all cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-[#a1a1aa] focus-visible:outline-none ${
                        isActive
                          ? 'border-emerald-500 bg-[#0f2317] text-white shadow-[0_0_12px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/50'
                          : cue?.isConfirmed
                          ? 'border-[#3f3f46] bg-[#121214] text-white shadow-sm hover:border-[#52525b] hover:bg-[#18181c]'
                          : cue
                          ? 'border-[#27272a] border-dashed bg-[#09090b] text-[#d4d4d8] hover:border-[#3f3f46]'
                          : 'border-[#1f1f23] bg-[#09090b]/50 text-[#71717a] cursor-not-allowed opacity-50'
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
          {nextEntry ? (
            <section className="lg:col-span-3 flex flex-col justify-between p-5 lg:p-6 bg-[#09090b] border border-[#27272a] border-t-2 border-t-amber-500 shadow-lg min-w-0">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1f1f23]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-500/30" />
                    <span className="text-xs font-mono font-black uppercase tracking-widest text-[#cfcfcf]">
                      TRANSITION
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#a1a1aa] uppercase font-bold tracking-wider">
                    LIVE ADVISOR
                  </span>
                </div>

                {/* Phase Movement Flow: e.g. BREAKDOWN → DROP */}
                <div className="text-center my-3 py-2.5 px-4 bg-[#0e0e12] border border-[#222228]">
                  <p className="text-xs font-mono uppercase tracking-widest text-[#71717a] font-bold mb-0.5">
                    PHASE FLOW
                  </p>
                  <p className="text-xl sm:text-2xl font-mono font-black text-white tracking-tight">
                    {transitionSegmentFlow}
                  </p>
                </div>

                {/* Huge Transition Countdown Clock */}
                <div className="flex flex-col items-center justify-center py-4 px-4 bg-[#060608] border border-[#27272a] shadow-inner text-center">
                  <span className="text-xs font-mono uppercase tracking-widest text-[#888888] font-bold">
                    TRANSITION COUNTDOWN
                  </span>
                  <span
                    className="text-5xl sm:text-6xl font-mono font-black text-white tabular-nums tracking-tight my-1.5 drop-shadow-[0_0_15px_rgba(255,255,255,0.25)]"
                    data-testid="stage-transition-countdown"
                  >
                    {transitionCountdownStr}
                  </span>
                  <span className="text-xs font-mono text-[#a1a1aa] uppercase tracking-wider font-semibold">
                    {targetMixOutMs != null && currentCues.D?.timeMs === targetMixOutMs
                      ? 'COUNTDOWN TO CUE D (MIX OUT)'
                      : 'COUNTDOWN TO OUTRO'}
                  </span>
                </div>

                {/* Hardware Step LED Phrase Meter */}
                <div className="flex flex-col gap-2 p-3 bg-[#08080a] border border-[#222228] my-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-[#888888] font-bold uppercase tracking-wider">PHRASE METER:</span>
                      <span className="text-white font-bold tabular-nums">
                        BAR {phraseTelemetry.currentBarInPhrase} / {phraseTelemetry.phraseBars}
                      </span>
                      <span className="text-[#71717a]">•</span>
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
                                  : 'bg-[#121216] border-[#222228]'
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
                  <div className="flex flex-col p-2.5 bg-[#0a0a0d] border border-[#27272a] text-left">
                    <span className="text-[#888888] font-bold uppercase tracking-wider text-[11px]">
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
                      <span className="text-[#71717a] text-[11px] truncate">
                        [{trackBpm(currentEntry)}→{trackBpm(nextEntry)}]
                      </span>
                    </div>
                  </div>

                  {/* Camelot Interval Badge */}
                  <div className="flex flex-col p-2.5 bg-[#0a0a0d] border border-[#27272a] text-left">
                    <span className="text-[#888888] font-bold uppercase tracking-wider text-[11px]">
                      HARMONIC INTERVAL
                    </span>
                    <div className="flex items-center gap-1.5 mt-1 truncate">
                      <span className="text-xs sm:text-sm font-black text-amber-400">
                        {trackKey(currentEntry)} → {trackKey(nextEntry)}
                      </span>
                      <span className="text-[#a1a1aa] text-[10px] truncate" title={harmonicIntervalLabel}>
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
                        : 'border-[#1f1f1f] bg-[#0c0c0c]'
                    }`}
                    data-testid="stage-transition-info"
                  >
                    <span
                      className={`uppercase tracking-wider ${
                        nextTransition.intervention_required ? 'text-amber-300 font-bold' : 'text-[#a8a8a8]'
                      }`}
                    >
                      {nextTransition.transition_type.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="text-[#333333]">|</span>
                    <span className="text-[#cfcfcf]">
                      Δ{Math.abs(nextTransition.bpm_delta).toFixed(1)} BPM
                    </span>
                    <span className="text-[#333333]">|</span>
                    <span className="text-[#cfcfcf]">
                      Key dist {nextTransition.key_distance}
                    </span>
                    {nextTransition.phrase_bars > 0 && (
                      <>
                        <span className="text-[#333333]">|</span>
                        <span className="text-[#a8a8a8]">
                          {nextTransition.phrase_bars} bars
                        </span>
                      </>
                    )}
                    {nextTransition.intervention_required && (
                      <>
                        <span className="text-[#333333]">|</span>
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
                      <p key={i} className="text-xs text-[#a1a1aa] font-mono leading-relaxed">
                        {note}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section
              className="lg:col-span-5 flex flex-col items-center justify-center p-8 bg-[#09090b] border border-[#27272a] border-t-2 border-t-amber-500 text-center space-y-3"
              data-testid="stage-end-of-set"
            >
              <div className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
              <p className="text-2xl sm:text-3xl font-mono font-black uppercase tracking-wider text-[#f59e0b]">
                LAST TRACK
              </p>
              <p className="text-sm font-mono text-[#a8a8a8] max-w-xs">
                Final song in performance setlist.
              </p>
            </section>
          )}

          {/* ====== DECK B: NEXT TRACK (UP NEXT) ====== */}
          {nextEntry && (
            <section
              className="lg:col-span-4 flex flex-col justify-between p-5 lg:p-6 bg-[#09090b] border border-[#27272a] border-t-2 border-t-zinc-600 shadow-lg min-w-0"
              data-testid="stage-next-track"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1f1f23]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-400 ring-2 ring-zinc-500/30" />
                    <span className="text-xs font-mono font-black uppercase tracking-widest text-[#cfcfcf]">
                      UP NEXT
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#a1a1aa]">
                    TRACK {stageCurrentIndex + 2} / {setlist.length}
                  </span>
                </div>

                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#ededed] tracking-tight leading-tight line-clamp-2 break-words mt-3">
                  {trackTitle(nextEntry)}
                </h3>
                {trackArtist(nextEntry) && (
                  <p className="text-base sm:text-lg font-medium text-[#a8a8a8] mt-1 truncate">
                    {trackArtist(nextEntry)}
                  </p>
                )}

                {/* Next Track Big Hardware Telemetry Grid */}
                <div className="grid grid-cols-3 gap-2.5 mt-5">
                  <MetricCard
                    label="KEY"
                    value={trackKey(nextEntry)}
                    accentColor="text-amber-400/95"
                    isOverridden={isFieldOverridden(nextEntry?.track, 'key_camelot')}
                    overrideField="key_camelot"
                  />
                  <MetricCard
                    label="BPM"
                    value={trackBpm(nextEntry)}
                    accentColor="text-white/95"
                    isOverridden={isFieldOverridden(nextEntry?.track, 'bpm')}
                    overrideField="bpm"
                  />
                  <MetricCard
                    label="ENERGY"
                    value={trackEnergy(nextEntry)}
                    accentColor="text-emerald-400/95"
                  />
                </div>

                {/* Next Cue Entry Point Banner */}
                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#121216] border border-[#27272a] font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[#e4e4e7] font-bold uppercase tracking-wider">
                        NEXT CUE:
                      </span>
                      {nextCues.A ? (
                        <span className="text-emerald-400 font-semibold tracking-wide">
                          IN: CUE A ({formatCueTime(nextCues.A.timeMs)})
                        </span>
                      ) : (
                        <span className="text-[#ededed] font-semibold">IN: CUE A (00:00)</span>
                      )}
                    </div>
                    <span className="text-[#a1a1aa] text-xs uppercase tracking-wider">
                      {FOUR_POINT_CUE_CONFIG.A.role}
                    </span>
                  </div>

                  {/* Next Track Compact Cue Pads */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {CUE_SLOTS.map((slot) => {
                      const cue = nextCues[slot];
                      const cfg = FOUR_POINT_CUE_CONFIG[slot];
                      const timeStr = cue ? formatCueTime(cue.timeMs) : '—:——';

                      return (
                        <div
                          key={slot}
                          className="flex flex-col items-center justify-center p-2 bg-[#0c0c10] border border-[#1f1f23] text-center font-mono"
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span
                              className="w-4 h-4 text-xs font-bold text-black flex items-center justify-center rounded-none"
                              style={{ backgroundColor: cfg.colorHex }}
                            >
                              {slot}
                            </span>
                            <span className="text-xs text-[#888888] uppercase truncate">
                              {cfg.role}
                            </span>
                          </div>
                          <span className="text-xs text-white tabular-nums font-semibold">
                            {timeStr}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Bottom Navigation Bar — Hardware Hitboxes (56px+ Touch Targets) */}
      <footer className="flex items-center justify-between px-6 py-3 bg-[#000000] border-t border-[#1f1f23] shrink-0 font-mono gap-4">
        {/* Left: Previous Song Button */}
        <div>
          <button
            type="button"
            onClick={stagePrev}
            disabled={stageCurrentIndex <= 0}
            className="hw-btn min-h-[56px] px-6 py-2 border border-[#27272a] bg-[#111114] text-[#cfcfcf] hover:bg-[#1c1c20] hover:text-white hover:border-[#3f3f46] disabled:opacity-20 disabled:cursor-not-allowed transition-all text-xs font-bold uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-[#a1a1aa] focus-visible:outline-none active:translate-y-[1px]"
            data-testid="stage-prev-btn"
            title="Jump to previous track [ArrowLeft / PageUp]"
          >
            <IconPrev className="w-4 h-4 shrink-0" />
            <span>[ PREV ]</span>
          </button>
        </div>

        {/* Center: Rehearsal Transport, Keyboard Guide & Stage Utilities */}
        <div className="flex items-center gap-4">
          {/* Rehearse / Audition Play-Pause Button */}
          <button
            type="button"
            onClick={handleToggleAudition}
            className="hw-btn min-h-[56px] px-6 py-2 border border-[#3f3f46] bg-[#141418] hover:bg-[#1f1f24] text-white transition-all text-xs font-bold uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-[#a1a1aa] focus-visible:outline-none active:translate-y-[1px]"
            data-testid="stage-audition-btn"
            title="Play or pause audio audition [Space]"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                auditionState === 'playing'
                  ? 'bg-emerald-400 ring-2 ring-emerald-500/40 animate-pulse'
                  : 'bg-amber-400/80'
              }`}
            />
            {auditionState === 'playing' ? (
              <IconPause size={14} className="shrink-0 text-white" />
            ) : (
              <IconPlay size={14} className="shrink-0 text-white" />
            )}
            <span>{auditionState === 'playing' ? '[ PAUSE ]' : '[ PLAY ]'}</span>
          </button>

          <div className="hidden lg:flex items-center gap-2.5 text-xs text-[#71717a] font-mono">
            <span>[SPACE] PLAY/PAUSE</span>
            <span>•</span>
            <span>[ENTER / →] NEXT</span>
            <span>•</span>
            <span>[←] PREV</span>
            <span>•</span>
            <span>[1-4] CUES</span>
            <span>•</span>
            <span>[S] SETLIST</span>
            <span>•</span>
            <span>[ESC] EXIT</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSetlist(!showSetlist)}
            className="hw-btn h-10 px-4 border border-[#27272a] bg-[#111114] text-[#cfcfcf] hover:text-white hover:bg-[#1a1a1e] transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#a1a1aa] focus-visible:outline-none active:translate-y-[1px]"
            data-testid="stage-setlist-toggle"
            title="Toggle full setlist overview drawer [S]"
          >
            <span>[ SETLIST ]</span>
          </button>

          <button
            type="button"
            onClick={handleExitRequest}
            className="hw-btn h-10 px-4 border border-[#27272a] bg-[#111114] text-[#a8a8a8] hover:text-rose-400 hover:border-rose-900/60 transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none active:translate-y-[1px]"
            data-testid="stage-exit-btn"
            title="Exit stage performance mode [Escape]"
          >
            <span>[ EXIT STAGE ]</span>
          </button>
        </div>

        {/* Right: Next Song Button (Prominent Action Target) */}
        <div>
          <button
            type="button"
            onClick={stageNext}
            disabled={stageCurrentIndex >= setlist.length - 1}
            className="hw-btn min-h-[56px] px-8 py-2 border border-[#3f3f46] bg-[#18181d] hover:bg-[#23232a] text-[#f4f4f5] hover:text-white border-r-2 border-r-amber-500/80 shadow-[0_0_12px_rgba(0,0,0,0.5)] disabled:opacity-20 disabled:border-[#262626] disabled:bg-[#141414] disabled:text-[#666666] disabled:cursor-not-allowed transition-all text-sm font-black uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-3 focus-visible:ring-2 focus-visible:ring-[#a1a1aa] focus-visible:outline-none active:translate-y-[1px]"
            data-testid="stage-next-btn"
            title="Advance to next track [Enter / ArrowRight / PageDown]"
          >
            <span>[ NEXT ]</span>
            <IconNext className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </footer>

      {/* Setlist Jump Drawer Overlay */}
      {showSetlist && (
        <div
          className="absolute inset-0 z-40 bg-black/90 flex flex-col font-mono"
          data-testid="stage-setlist-overlay"
        >
          <div className="flex items-center justify-between px-6 py-3 border-b border-[#1c1c1c] bg-[#0a0a0a]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#ededed]">Set Order</h3>
            <button
              type="button"
              onClick={() => setShowSetlist(false)}
              className="px-2.5 py-1 border border-[#222222] bg-[#111111] text-[#a8a8a8] hover:text-white transition-colors text-xs cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-[#a1a1aa] focus-visible:outline-none"
              data-testid="stage-setlist-close"
            >
              [ CLOSE ]
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
            {setlist.map((entry, idx) => (
              <SetlistJumpItem
                key={entry.track_id}
                entry={entry}
                index={idx}
                isCurrent={idx === stageCurrentIndex}
                onJump={() => {
                  useAppStore.getState().stageGoTo(idx);
                  setShowSetlist(false);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div
          className="absolute inset-0 z-50 bg-black/85 flex items-center justify-center font-mono"
          data-testid="stage-exit-confirm"
        >
          <div className="bg-[#0e0e0e] border border-[#27272a] p-6 max-w-sm text-center space-y-4 rounded-none">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white">Exit Stage Mode?</h3>
            <p className="text-[#a8a8a8] text-xs leading-relaxed font-sans">
              You will return to the setlist editor. Performance timer will be reset.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleExitCancel}
                className="px-4 py-1.5 border border-[#222222] bg-[#141414] text-[#a8a8a8] hover:text-white transition-colors text-xs uppercase cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-[#a1a1aa] focus-visible:outline-none"
                data-testid="stage-exit-cancel"
              >
                [ STAY ]
              </button>
              <button
                type="button"
                onClick={handleExitConfirm}
                className="px-4 py-1.5 border border-[#6b1515] bg-[#220a0a] text-[#f87171] hover:bg-[#331111] transition-colors text-xs font-semibold uppercase cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                data-testid="stage-exit-confirm-btn"
              >
                [ EXIT STAGE ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── Helper Components ───── */

function MetricCard({
  label,
  value,
  accentColor = 'text-white',
  isOverridden,
  overrideField,
}: {
  label: string;
  value: string;
  accentColor?: string;
  isOverridden?: boolean;
  overrideField?: 'bpm' | 'key_camelot';
}) {
  return (
    <div className="flex flex-col items-center justify-center p-3 bg-[#0a0a0d] border border-[#191922] flex-1 min-w-[75px]">
      <span className="te-silkscreen mb-1">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <span
          className={`text-3xl sm:text-4xl lg:text-5xl font-mono font-black te-num tabular-nums tracking-tight ${accentColor}`}
        >
          {value}
        </span>
        {isOverridden && overrideField && (
          <EditedBadge
            field={overrideField}
            title={`${label} analysis overridden`}
          />
        )}
      </div>
    </div>
  );
}

function SetlistJumpItem({
  entry,
  index,
  isCurrent,
  onJump,
}: {
  entry: SetlistEntry;
  index: number;
  isCurrent: boolean;
  onJump: () => void;
}) {
  const title = entry.track?.tags?.title ?? entry.track_id;
  const artist = entry.track?.tags?.artist ?? '';
  const bpm = entry.track?.analysis?.rhythm?.grid?.bpm;
  const key = entry.track?.analysis?.key;
  const keyStr = key ? `${key.camelot.number}${key.camelot.letter}` : '';

  return (
    <button
      type="button"
      onClick={onJump}
      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors border rounded-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#a1a1aa] focus-visible:outline-none ${
        isCurrent
          ? 'bg-[#141414] border-l-2 border-l-[#ededed] border-[#262626] text-white'
          : 'bg-[#0a0a0a] border-[#161616] text-[#a8a8a8] hover:text-[#ededed] hover:bg-[#101010]'
      }`}
      data-testid={`stage-jump-${index}`}
    >
      <span
        className={`text-xs font-mono w-6 text-center tabular-nums ${
          isCurrent ? 'text-white font-bold' : 'text-[#a8a8a8]'
        }`}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{title}</p>
        {artist && <p className="text-xs text-[#a8a8a8] truncate">{artist}</p>}
      </div>
      <div className="flex items-center gap-2 text-xs text-[#a8a8a8] font-mono shrink-0">
        {bpm != null && (
          <span className="inline-flex items-center gap-1">
            <span>{Math.round(bpm)} BPM</span>
            {isFieldOverridden(entry.track, 'bpm') && (
              <EditedBadge field="bpm" title="BPM analysis overridden" />
            )}
          </span>
        )}
        {keyStr && (
          <span className="inline-flex items-center gap-1">
            <span>{keyStr}</span>
            {isFieldOverridden(entry.track, 'key_camelot') && (
              <EditedBadge field="key_camelot" title="Key analysis overridden" />
            )}
          </span>
        )}
      </div>
      {isCurrent && (
        <span className="text-[#ededed] text-xs font-mono uppercase tracking-wider font-semibold">
          ▶ NOW
        </span>
      )}
    </button>
  );
}
