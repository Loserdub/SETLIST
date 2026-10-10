import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useWakeLock } from './useWakeLock';
import { usePerformanceClock, formatDuration } from './usePerformanceClock';
import { useStageKeyboard } from './useStageKeyboard';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import { resolveFourPointCues, FOUR_POINT_CUE_CONFIG, CUE_SLOTS } from '../track/cues';
import { isWindowFullscreen, toggleWindowFullscreen } from '../../utils/windowFullscreen';
import {
  calculatePitchFader,
  getHarmonicIntervalName,
  calculatePhraseTelemetry,
  getTransitionSegmentFlow,
} from './stageTelemetry';
import {
  SetlistJumpDrawer,
  ExitConfirmModal,
  StageHeader,
  LiveWaveformCanvas,
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
      stageNext: s.stageNext, stagePrev: s.stagePrev,
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

    if (currentCues.D?.timeMs != null && currentCues.D.timeMs > 0) {
      return currentCues.D.timeMs;
    }

    const cues = currentEntry.track.analysis?.cue_points ?? [];
    const mixCue = cues.find((c) => {
      const lbl = c.label.toLowerCase();
      return lbl.includes('mix out') || lbl.includes('outro');
    });
    if (mixCue != null && mixCue.time_ms > 0) {
      return mixCue.time_ms;
    }

    const segments = currentEntry.track.analysis?.segments ?? [];
    const outroSeg = segments.find((s) => s.label.toLowerCase() === 'outro');
    if (outroSeg != null && outroSeg.start_ms > 0) {
      return outroSeg.start_ms;
    }

    return dur;
  }, [currentEntry, currentCues.D]);

  const transitionCountdownMs = useMemo(() => {
    if (targetMixOutMs == null) return null;
    return Math.max(0, targetMixOutMs - currentSongElapsedMs);
  }, [targetMixOutMs, currentSongElapsedMs]);

  const transitionCountdownStr = useMemo(() => {
    if (transitionCountdownMs == null) return '--:--';
    return formatDuration(transitionCountdownMs);
  }, [transitionCountdownMs]);

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

  if (setlist.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-surface-deep text-white">
        <div className="text-center space-y-4">
          <p className="text-2xl font-mono text-neutral-500">No tracks in setlist</p>
          <button onClick={exitStageMode} className="px-6 py-3 bg-surface-panel border border-border-base font-mono text-neutral-400 hover:text-white hover:border-border-strong transition-colors">
            Return to Setlist
          </button>
        </div>
      </div>
    );
  }

  const trackTitle = (entry: SetlistEntry | null) => entry?.track?.tags?.title ?? entry?.track_id ?? '—';
  const trackArtist = (entry: SetlistEntry | null) => entry?.track?.tags?.artist ?? '';
  const trackBpm = (entry: SetlistEntry | null) => {
    const bpm = entry?.track?.analysis?.rhythm?.grid?.bpm;
    return bpm != null ? bpm.toFixed(1) : '—';
  };
  const trackKey = (entry: SetlistEntry | null) => {
    const key = entry?.track?.analysis?.key;
    if (!key) return '—';
    return `${key.camelot.number}${key.camelot.letter}`;
  };

  const pitchFader = calculatePitchFader(
    currentEntry?.track?.analysis?.rhythm?.grid?.bpm,
    nextEntry?.track?.analysis?.rhythm?.grid?.bpm
  );

  const harmonicIntervalLabel = getHarmonicIntervalName(
    trackKey(currentEntry),
    trackKey(nextEntry),
    nextEntry?.transition ?? null
  );

  return (
    <div className="flex flex-col h-full bg-surface-deep text-neutral-200 select-none overflow-hidden font-sans">
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

      <main className="flex-1 flex flex-col min-h-0 p-2 lg:p-4 gap-2 lg:gap-4">
        {/* WAVEFORMS SECTION (STACKED) */}
        <section className="flex flex-col flex-none h-[280px] lg:h-[340px] bg-surface-panel border border-border-base rounded-lg overflow-hidden relative">
           {/* Deck A Waveform */}
           <div className="flex-1 relative border-b border-neutral-900 shadow-[inset_0_-10px_20px_rgba(0,0,0,0.5)]">
             <div className="absolute top-2 left-2 z-10 px-2.5 py-1 bg-black/80 rounded border border-cyan-900/50 text-cyan-400 font-mono text-[10px] font-black tracking-widest uppercase shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                DECK A
             </div>
             <LiveWaveformCanvas 
               waveform={currentEntry?.track?.analysis?.waveform ?? null}
               positionMs={currentSongElapsedMs}
               durationMs={currentSongDurationMs ?? 0}
               beatGrid={currentEntry?.track?.analysis?.rhythm?.grid ?? null}
               cues={CUE_SLOTS.map(s => ({ timeMs: currentCues[s]?.timeMs, label: s, color: 'rgb(34, 211, 238)' })).filter(c => c.timeMs != null) as any}
               mixZoneStartMs={targetMixOutMs}
               accentColor="rgb(34, 211, 238)" // Cyan
             />
           </div>
           
           {/* Phase Meter (Center Line) */}
           <div className="absolute top-1/2 left-0 w-full h-px bg-white/10 z-20" />
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-1 z-20">
             <div className="w-4 h-4 rounded-full border-2 border-cyan-500 bg-surface-deep shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-neutral-700"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-neutral-700"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-neutral-700"></div>
           </div>

           {/* Deck B Waveform */}
           <div className="flex-1 relative shadow-[inset_0_10px_20px_rgba(0,0,0,0.5)] opacity-80">
             <div className="absolute bottom-2 left-2 z-10 px-2.5 py-1 bg-black/80 rounded border border-amber-900/50 text-amber-500 font-mono text-[10px] font-black tracking-widest uppercase shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                DECK B
             </div>
             <LiveWaveformCanvas 
               waveform={nextEntry?.track?.analysis?.waveform ?? null}
               positionMs={0}
               durationMs={nextEntry?.track?.duration_ms ?? 0}
               beatGrid={nextEntry?.track?.analysis?.rhythm?.grid ?? null}
               cues={CUE_SLOTS.map(s => ({ timeMs: nextCues[s]?.timeMs, label: s, color: 'rgb(245, 158, 11)' })).filter(c => c.timeMs != null) as any}
               mixZoneStartMs={null}
               accentColor="rgb(245, 158, 11)" // Amber
             />
           </div>
        </section>

        {/* DECKS & MIXER SECTION */}
        <section className="flex flex-1 min-h-0 gap-2 lg:gap-4">
          
          {/* ====== DECK A (CURRENT) ====== */}
          <div className="flex-1 bg-surface-panel border border-cyan-900/40 rounded-lg p-5 flex flex-col justify-between shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-start">
              <div className="min-w-0 pr-4">
                <h2 className="text-3xl lg:text-4xl font-black text-white tracking-tighter truncate leading-none mb-1">
                  {trackTitle(currentEntry)}
                </h2>
                <h3 className="text-cyan-600 font-bold uppercase tracking-widest truncate text-sm">
                  {trackArtist(currentEntry) || 'Unknown Artist'}
                </h3>
              </div>
              <div className="shrink-0 w-16 h-16 rounded-full border-4 border-cyan-500/20 flex items-center justify-center relative shadow-[inset_0_0_15px_rgba(34,211,238,0.1)]">
                 <div className={`w-3 h-3 rounded-full ${auditionState === 'playing' ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)] animate-pulse' : 'bg-neutral-800'}`} />
              </div>
            </div>
            
            <div className="flex justify-between items-end my-4">
              <div className="flex gap-6">
                <div className="flex flex-col">
                  <span className="text-[10px] text-cyan-600 font-bold tracking-widest uppercase mb-1">BPM</span>
                  <span className="text-4xl lg:text-5xl font-mono text-cyan-50 font-light tracking-tighter">{trackBpm(currentEntry)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-cyan-600 font-bold tracking-widest uppercase mb-1">KEY</span>
                  <span className="text-4xl lg:text-5xl font-mono text-cyan-400 font-bold tracking-tighter">{trackKey(currentEntry)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-cyan-600 font-bold tracking-widest uppercase mb-1">TIME</span>
                <span className="text-5xl lg:text-6xl font-mono text-white tracking-tighter font-light">{formatDuration(currentSongElapsedMs)}</span>
              </div>
            </div>

            {/* Deck A Cues */}
            <div className="grid grid-cols-4 gap-2 lg:gap-3">
              {CUE_SLOTS.map(slot => {
                const cue = currentCues[slot];
                const isActive = activeCueSlot === slot;
                const isSet = cue && cue.timeMs != null;
                return (
                  <button
                    key={slot}
                    onClick={() => handleCueJump(slot)}
                    disabled={!isSet}
                    className={`flex flex-col items-center justify-center h-16 lg:h-20 rounded-md font-mono border-2 transition-all focus:outline-none ${
                      isActive 
                        ? 'border-cyan-400 bg-cyan-400/20 text-cyan-50 shadow-[0_0_15px_rgba(34,211,238,0.4)]' 
                        : isSet 
                        ? 'border-cyan-900 bg-cyan-950/30 text-cyan-300 hover:border-cyan-500' 
                        : 'border-neutral-900 bg-neutral-950 text-neutral-800 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-xl font-black">{slot}</span>
                    <span className="text-[10px] font-bold tracking-widest uppercase opacity-70">
                      {FOUR_POINT_CUE_CONFIG[slot].role.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
            
            {/* Play/Pause Large Transport */}
            <div className="mt-4 flex gap-3">
               <button
                  onClick={() => void handleToggleAudition()}
                  className={`flex-1 h-14 rounded-md font-mono font-black tracking-widest text-lg transition-colors border-b-4 focus:outline-none ${
                    auditionState === 'playing' 
                      ? 'bg-cyan-500 text-black border-cyan-700 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
                      : 'bg-neutral-800 text-neutral-400 border-neutral-950 hover:bg-neutral-700 hover:text-white'
                  }`}
               >
                 {auditionState === 'playing' ? 'PAUSE' : 'PLAY'}
               </button>
               <button className="flex-1 h-14 rounded-md font-mono font-bold tracking-widest text-lg bg-neutral-900 text-neutral-500 border-b-4 border-neutral-950 cursor-not-allowed">
                 SYNC
               </button>
            </div>
          </div>
          
          {/* ====== MIXER CONSOLE (CENTER) ====== */}
          <div className="w-56 lg:w-72 bg-surface-panel border border-border-base rounded-lg p-5 flex flex-col items-center justify-center relative shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
             <div className="absolute top-4 w-full flex justify-center">
                <span className="text-[10px] text-neutral-600 font-bold tracking-widest uppercase">Transition</span>
             </div>

             <div className="flex flex-col items-center space-y-8 w-full">
                {/* Countdown */}
                <div className="flex flex-col items-center">
                  <span className="text-7xl lg:text-8xl font-mono font-black tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    {transitionCountdownStr}
                  </span>
                  <span className={`text-xs font-mono font-bold tracking-widest uppercase mt-2 ${transitionCountdownMs != null && transitionCountdownMs < 15000 ? 'text-red-500 animate-pulse' : 'text-neutral-500'}`}>
                    Time to Mix Out
                  </span>
                </div>
                
                {/* Harmonic Data */}
                <div className="w-full bg-neutral-950/80 border border-neutral-900 rounded-lg p-4 flex flex-col items-center gap-1">
                   <span className="text-[10px] text-neutral-500 font-bold tracking-widest uppercase">Pitch Fader</span>
                   <span className={`text-2xl font-mono font-bold ${pitchFader && (pitchFader.pct < -5 || pitchFader.pct > 5) ? 'text-red-400' : 'text-green-400'}`}>
                      {pitchFader ? pitchFader.label : '0.0%'}
                   </span>
                   <span className="text-xs text-neutral-400 font-medium mt-2 text-center">
                      {harmonicIntervalLabel}
                   </span>
                </div>
             </div>

             <div className="absolute bottom-4 flex justify-between w-full px-8">
                <button onClick={stagePrev} className="text-neutral-600 hover:text-white transition-colors focus:outline-none">
                   &larr; PREV
                </button>
                <button onClick={stageNext} className="text-neutral-600 hover:text-white transition-colors focus:outline-none">
                   NEXT &rarr;
                </button>
             </div>
          </div>

          {/* ====== DECK B (UP NEXT) ====== */}
          <div className="flex-1 bg-surface-panel border border-amber-900/40 rounded-lg p-5 flex flex-col justify-between opacity-80 hover:opacity-100 transition-opacity shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            {nextEntry ? (
              <>
                <div className="flex justify-between items-start">
                  <div className="min-w-0 pr-4">
                    <h2 className="text-3xl lg:text-4xl font-black text-neutral-300 tracking-tighter truncate leading-none mb-1">
                      {trackTitle(nextEntry)}
                    </h2>
                    <h3 className="text-amber-600 font-bold uppercase tracking-widest truncate text-sm">
                      {trackArtist(nextEntry) || 'Unknown Artist'}
                    </h3>
                  </div>
                  <div className="shrink-0 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-500 text-xs font-mono font-bold tracking-widest uppercase">
                    UP NEXT
                  </div>
                </div>
                
                <div className="flex justify-between items-end my-4">
                  <div className="flex gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-amber-700 font-bold tracking-widest uppercase mb-1">BPM</span>
                      <span className="text-4xl lg:text-5xl font-mono text-neutral-400 font-light tracking-tighter">{trackBpm(nextEntry)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-amber-700 font-bold tracking-widest uppercase mb-1">KEY</span>
                      <span className="text-4xl lg:text-5xl font-mono text-amber-500 font-bold tracking-tighter">{trackKey(nextEntry)}</span>
                    </div>
                  </div>
                </div>

                {/* Deck B Cues */}
                <div className="grid grid-cols-4 gap-2 lg:gap-3">
                  {CUE_SLOTS.map(slot => {
                    const cue = nextCues[slot];
                    const isSet = cue && cue.timeMs != null;
                    return (
                      <div
                        key={slot}
                        className={`flex flex-col items-center justify-center h-16 lg:h-20 rounded-md font-mono border-2 transition-all ${
                           isSet 
                            ? 'border-amber-900/50 bg-amber-950/20 text-amber-500/80' 
                            : 'border-neutral-900 bg-neutral-950 text-neutral-800'
                        }`}
                      >
                        <span className="text-xl font-black">{slot}</span>
                        <span className="text-[10px] font-bold tracking-widest uppercase opacity-70">
                          {FOUR_POINT_CUE_CONFIG[slot].role.split(' ')[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
                
                {/* Inactive Transport */}
                <div className="mt-4 flex gap-3">
                   <button disabled className="flex-1 h-14 rounded-md font-mono font-black tracking-widest text-lg bg-neutral-900 text-neutral-700 border-b-4 border-neutral-950 cursor-not-allowed">
                     PLAY
                   </button>
                   <button disabled className="flex-1 h-14 rounded-md font-mono font-bold tracking-widest text-lg bg-neutral-900 text-neutral-700 border-b-4 border-neutral-950 cursor-not-allowed">
                     SYNC
                   </button>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-neutral-600 font-mono font-bold tracking-widest uppercase">
                <span className="text-3xl mb-2">END OF SET</span>
                <span>No more tracks</span>
              </div>
            )}
          </div>
        </section>
      </main>

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

      <ExitConfirmModal
        isOpen={showExitConfirm}
        onCancel={handleExitCancel}
        onConfirm={handleExitConfirm}
      />
    </div>
  );
}

export default StageMode;
