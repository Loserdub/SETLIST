import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useWakeLock } from './useWakeLock';
import { usePerformanceClock, formatDuration, formatDurationCompact } from './usePerformanceClock';
import { useStageKeyboard } from './useStageKeyboard';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';
import { EditedBadge, isFieldOverridden } from '../track/overrides';
import { IconPrev, IconNext, IconAlertTriangle } from '../../components/icons';
import { PerformanceControls } from './components/PerformanceControls';
import { TimelineVisualizer } from './components/TimelineVisualizer';

/**
 * Stage Mode — a dedicated, read-only live performance view.
 *
 * Priorities:
 * - Current song displayed prominently (readable from distance)
 * - Next song clearly visible
 * - Set position and runtime shown
 * - Transition advice between current → next
 * - No editing, no deletion, no reorder
 * - Keyboard navigable (including foot pedal support)
 * - Wake lock active while in stage mode
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
  } = useAppStore();

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSetlist, setShowSetlist] = useState(false);

  // Derived data
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

  useStageKeyboard({
    active: isStageMode && !showExitConfirm && !showSetlist,
    onNext: stageNext,
    onPrev: stagePrev,
    onExit: handleExitRequest,
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
            className="px-6 py-3 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
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

  // Transition info for next track
  const nextTransition: TransitionAdvice | null = nextEntry?.transition ?? null;

  return (
    <div
      className="flex flex-col h-full bg-[#050505] text-[#ededed] select-none overflow-hidden"
      data-testid="stage-mode"
    >
      {/* Top Bar — Set name, position, clock */}
      <header className="flex items-center justify-between px-6 py-2.5 bg-[#000000] border-b border-[#1c1c1c] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#cfcfcf]">
            {setlistName}
          </span>
          <span className="text-xs font-mono text-[#a8a8a8] bg-[#0c0c0c] border border-[#1f1f1f] px-2 py-0.5">
            {stageCurrentIndex + 1} / {setlist.length}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-[#a8a8a8]">
          {/* Elapsed clock */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#a8a8a8] uppercase">ELAPSED:</span>
            <span className="font-mono text-sm text-[#ededed]" data-testid="stage-elapsed">
              {formatDuration(clock.elapsedMs)}
            </span>
          </div>

          {/* Remaining */}
          {clock.remainingMs !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#a8a8a8] uppercase">REMAINING:</span>
              <span className="font-mono text-sm text-[#cfcfcf]" data-testid="stage-remaining">
                −{formatDurationCompact(clock.remainingMs)}
              </span>
            </div>
          )}

          {/* Total set duration */}
          {totalDurationMs !== null && (
            <span className="text-[#a8a8a8] font-mono text-xs" data-testid="stage-total">
              [{formatDurationCompact(totalDurationMs)} TOTAL]
            </span>
          )}

          {/* Wake lock indicator */}
          <span
            className={`w-1.5 h-1.5 ${
              wakeLockActive ? 'bg-emerald-500' : wakeLockSupported ? 'bg-amber-500' : 'bg-[#333333]'
            }`}
            title={
              wakeLockActive
                ? 'Screen wake lock active'
                : wakeLockSupported
                  ? 'Screen wake lock released'
                  : 'Screen wake lock not supported'
            }
          />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_360px] gap-6 p-6 min-h-0 overflow-y-auto">
        {/* Left Column: Track Info & Waveform */}
        <div className="flex flex-col gap-6 min-h-0 w-full max-w-5xl mx-auto">
          {/* Waveform Visualizer */}
          <div className="h-40 bg-[#0c0c0c] border border-[#1f1f1f] shrink-0 rounded-sm overflow-hidden">
            <TimelineVisualizer durationMs={currentSongDurationMs} positionMs={clock.elapsedMs} />
          </div>

          {/* Current Track & Transition */}
          <div className="flex-1 flex flex-col items-center justify-center bg-[#0c0c0c] border border-[#1f1f1f] rounded-sm p-8 text-center min-h-0 relative">
            {/* Previous track (subtle) */}
            {prevEntry && (
              <div className="absolute top-6 left-6 opacity-35 text-left max-w-xs hidden xl:block" data-testid="stage-prev-track">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[#a8a8a8] mb-0.5">PREVIOUS</p>
                <p className="text-xs text-[#cfcfcf] font-mono truncate">{trackTitle(prevEntry)}</p>
              </div>
            )}

            {/* ====== CURRENT TRACK — PRIMARY FOCUS ====== */}
            <div className="w-full text-center space-y-2.5" data-testid="stage-current-track">
              <p className="text-xs font-mono uppercase tracking-wider text-[#a8a8a8] font-semibold">
                NOW PLAYING
              </p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight line-clamp-2 max-w-4xl break-words mx-auto">
                {trackTitle(currentEntry)}
              </h2>
              {trackArtist(currentEntry) && (
                <p className="text-lg text-[#cfcfcf]">{trackArtist(currentEntry)}</p>
              )}

              {/* Track metadata technical blocks */}
              <div className="flex items-center justify-center gap-2 pt-2">
                <MetadataPill
                  label="BPM"
                  value={trackBpm(currentEntry)}
                  isOverridden={isFieldOverridden(currentEntry?.track, 'bpm')}
                />
                <MetadataPill
                  label="KEY"
                  value={trackKey(currentEntry)}
                  isOverridden={isFieldOverridden(currentEntry?.track, 'key_camelot')}
                />
                <MetadataPill label="ENERGY" value={trackEnergy(currentEntry)} />
                {currentSongDurationMs != null && (
                  <MetadataPill label="LENGTH" value={formatDuration(currentSongDurationMs)} />
                )}
              </div>
            </div>

            {/* Transition info → next track */}
            {nextEntry && (
              <div className="w-full max-w-3xl space-y-3 mt-8">
                {/* Transition advice strip */}
                {nextTransition && (
                  <div
                    className={`flex items-center justify-center gap-3 py-2 px-4 border rounded-sm font-mono transition-all ${
                      nextTransition.intervention_required
                        ? 'border-amber-500/80 bg-amber-950/40 text-amber-300 ring-1 ring-amber-500/30'
                        : 'border-[#1f1f1f] bg-[#0f0f0f]'
                    }`}
                    data-testid="stage-transition-info"
                  >
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        nextTransition.intervention_required ? 'text-amber-300 font-bold' : 'text-[#a8a8a8]'
                      }`}
                    >
                      {nextTransition.transition_type.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="text-[#333333]">|</span>
                    <span className="text-[10px] text-[#cfcfcf]">
                      Δ{Math.abs(nextTransition.bpm_delta).toFixed(1)} BPM
                    </span>
                    <span className="text-[#333333]">|</span>
                    <span className="text-[10px] text-[#cfcfcf]">
                      Key dist {nextTransition.key_distance}
                    </span>
                    {nextTransition.phrase_bars > 0 && (
                      <>
                        <span className="text-[#333333]">|</span>
                        <span className="text-[10px] text-[#a8a8a8]">
                          {nextTransition.phrase_bars} bars
                        </span>
                      </>
                    )}
                    {nextTransition.intervention_required && (
                      <>
                        <span className="text-[#333333]">|</span>
                        <span className="text-[10px] text-amber-300 font-bold flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <IconAlertTriangle size={12} className="text-amber-400 shrink-0" />
                          ⚠ Intervention
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Transition notes */}
                {nextTransition?.notes && nextTransition.notes.length > 0 && (
                  <div className="text-center space-y-0.5" data-testid="stage-transition-notes">
                    {nextTransition.notes.slice(0, 2).map((note, i) => (
                      <p key={i} className="text-[10px] text-[#a8a8a8] font-mono">
                        {note}
                      </p>
                    ))}
                  </div>
                )}

                {/* Next track */}
                <div className="text-center pt-2" data-testid="stage-next-track">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[#a8a8a8] mb-1">
                    UP NEXT
                  </p>
                  <p className="text-lg font-medium text-[#ededed] line-clamp-1 break-words">
                    {trackTitle(nextEntry)}
                  </p>
                  {trackArtist(nextEntry) && (
                    <p className="text-xs text-[#a8a8a8] mt-0.5 truncate">{trackArtist(nextEntry)}</p>
                  )}
                </div>
              </div>
            )}

            {/* End of set indicator */}
            {!nextEntry && (
              <div className="text-center mt-8" data-testid="stage-end-of-set">
                <p className="text-xs font-mono uppercase tracking-wider text-[#f59e0b] mb-1">
                  LAST TRACK
                </p>
                <p className="text-sm font-mono text-[#a8a8a8]">Final song in performance setlist.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Performance Controls */}
        <div className="flex justify-center shrink-0 w-full">
          <PerformanceControls currentBpm={currentEntry?.track?.analysis?.rhythm?.grid?.bpm} />
        </div>
      </div>

      {/* Bottom Navigation Bar — Wide Separation & 56px+ Touch Targets */}
      <footer className="flex items-center justify-between px-6 py-3 bg-[#050505] border-t border-[#1c1c1c] shrink-0 font-mono gap-4">
        {/* Left: Previous Song (Prominent, safe corner) */}
        <div>
          <button
            type="button"
            onClick={stagePrev}
            disabled={stageCurrentIndex <= 0}
            className="min-h-[56px] px-6 py-2 border border-[#262626] bg-[#0f0f0f] text-[#cfcfcf] hover:bg-[#1a1a1a] hover:text-white hover:border-[#38bdf8]/40 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-xs font-semibold uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
            data-testid="stage-prev-btn"
            title="Jump to previous track [ArrowLeft / PageUp]"
          >
            <IconPrev className="w-4 h-4 shrink-0" />
            <span>[ PREV ]</span>
          </button>
        </div>

        {/* Center: Utility Stage Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSetlist(!showSetlist)}
            className="h-10 px-4 border border-[#222222] bg-[#0f0f0f] text-[#cfcfcf] hover:text-white hover:bg-[#181818] transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
            data-testid="stage-setlist-toggle"
            title="Toggle full setlist overview drawer"
          >
            <span>[ SETLIST ]</span>
          </button>

          <button
            type="button"
            onClick={handleExitRequest}
            className="h-10 px-4 border border-[#262626] bg-[#0f0f0f] text-[#a8a8a8] hover:text-rose-400 hover:border-rose-900/60 transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
            data-testid="stage-exit-btn"
            title="Exit stage performance mode [Escape]"
          >
            <span>[ EXIT STAGE ]</span>
          </button>
        </div>

        {/* Right: Next Song (Far right corner, bold forward target) */}
        <div>
          <button
            type="button"
            onClick={stageNext}
            disabled={stageCurrentIndex >= setlist.length - 1}
            className="min-h-[56px] px-8 py-2 border border-[#38bdf8] bg-[#12283e] hover:bg-[#1a3857] text-[#38bdf8] hover:text-white disabled:opacity-20 disabled:border-[#262626] disabled:bg-[#141414] disabled:text-[#666666] disabled:cursor-not-allowed transition-all text-sm font-bold uppercase tracking-wider rounded-none cursor-pointer flex items-center gap-3 shadow-[0_0_15px_rgba(56,189,248,0.15)] focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
            data-testid="stage-next-btn"
            title="Advance to next track [Space / ArrowRight / PageDown]"
          >
            <span>[ NEXT ]</span>
            <IconNext className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </footer>

      {/* Jump-to Setlist Overlay */}
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
              className="px-2.5 py-1 border border-[#222222] bg-[#111111] text-[#a8a8a8] hover:text-white transition-colors text-xs cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
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
                className="px-4 py-1.5 border border-[#222222] bg-[#141414] text-[#a8a8a8] hover:text-white transition-colors text-xs uppercase cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
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

function MetadataPill({
  label,
  value,
  isOverridden,
}: {
  label: string;
  value: string;
  isOverridden?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0c0c0c] border border-[#1f1f1f] rounded-none">
      <span className="text-xs uppercase tracking-wider text-[#a8a8a8] font-mono font-semibold">
        {label}
      </span>
      <span className="text-xs font-mono text-[#ededed] font-medium inline-flex items-center gap-1">
        <span>{value}</span>
        {isOverridden && (
          <EditedBadge
            field={label === 'BPM' ? 'bpm' : 'key_camelot'}
            title={`${label} analysis overridden`}
          />
        )}
      </span>
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
      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors border rounded-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none ${
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
        <span className="text-[#ededed] text-xs font-mono uppercase tracking-wider font-semibold">▶ NOW</span>
      )}
    </button>
  );
}
