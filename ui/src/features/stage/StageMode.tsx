import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useWakeLock } from './useWakeLock';
import { usePerformanceClock, formatDuration, formatDurationCompact } from './usePerformanceClock';
import { useStageKeyboard } from './useStageKeyboard';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';

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
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#999999]">
            {setlistName}
          </span>
          <span className="text-[10px] font-mono text-[#666666] bg-[#0c0c0c] border border-[#1f1f1f] px-2 py-0.5">
            {stageCurrentIndex + 1} / {setlist.length}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-[#777777]">
          {/* Elapsed clock */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#555555] uppercase">ELAPSED:</span>
            <span className="font-mono text-sm text-[#ededed]" data-testid="stage-elapsed">
              {formatDuration(clock.elapsedMs)}
            </span>
          </div>

          {/* Remaining */}
          {clock.remainingMs !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#555555] uppercase">REMAINING:</span>
              <span className="font-mono text-sm text-[#a1a1aa]" data-testid="stage-remaining">
                −{formatDurationCompact(clock.remainingMs)}
              </span>
            </div>
          )}

          {/* Total set duration */}
          {totalDurationMs !== null && (
            <span className="text-[#555555] font-mono text-xs" data-testid="stage-total">
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
      <div className="flex-1 flex flex-col justify-center items-center px-8 gap-6 min-h-0">
        {/* Previous track (subtle) */}
        {prevEntry && (
          <div className="w-full max-w-3xl opacity-35 text-center" data-testid="stage-prev-track">
            <p className="text-[10px] font-mono uppercase tracking-widest text-[#666666] mb-0.5">PREVIOUS</p>
            <p className="text-sm text-[#888888] font-mono truncate">{trackTitle(prevEntry)}</p>
          </div>
        )}

        {/* ====== CURRENT TRACK — PRIMARY FOCUS ====== */}
        <div className="w-full max-w-4xl text-center space-y-2.5" data-testid="stage-current-track">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[#71717a] font-semibold">
            NOW PLAYING
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight truncate">
            {trackTitle(currentEntry)}
          </h2>
          {trackArtist(currentEntry) && (
            <p className="text-lg text-[#999999]">{trackArtist(currentEntry)}</p>
          )}

          {/* Track metadata technical blocks */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <MetadataPill label="BPM" value={trackBpm(currentEntry)} />
            <MetadataPill label="KEY" value={trackKey(currentEntry)} />
            <MetadataPill label="ENERGY" value={trackEnergy(currentEntry)} />
            {currentSongDurationMs != null && (
              <MetadataPill label="LENGTH" value={formatDuration(currentSongDurationMs)} />
            )}
          </div>
        </div>

        {/* Transition info → next track */}
        {nextEntry && (
          <div className="w-full max-w-3xl space-y-3">
            {/* Transition advice strip */}
            {nextTransition && (
              <div
                className={`flex items-center justify-center gap-3 py-1.5 px-3 border rounded-none font-mono ${
                  nextTransition.intervention_required
                    ? 'border-[#501515] bg-[#1a0808]'
                    : 'border-[#1f1f1f] bg-[#0c0c0c]'
                }`}
                data-testid="stage-transition-info"
              >
                <span
                  className={`text-[10px] uppercase tracking-wider ${
                    nextTransition.intervention_required ? 'text-[#f87171] font-bold' : 'text-[#888888]'
                  }`}
                >
                  {nextTransition.transition_type.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className="text-[#333333]">|</span>
                <span className="text-[11px] text-[#cccccc]">
                  Δ{Math.abs(nextTransition.bpm_delta).toFixed(1)} BPM
                </span>
                <span className="text-[#333333]">|</span>
                <span className="text-[11px] text-[#cccccc]">
                  Key dist {nextTransition.key_distance}
                </span>
                {nextTransition.phrase_bars > 0 && (
                  <>
                    <span className="text-[#333333]">|</span>
                    <span className="text-[11px] text-[#888888]">
                      {nextTransition.phrase_bars} bars
                    </span>
                  </>
                )}
                {nextTransition.intervention_required && (
                  <>
                    <span className="text-[#333333]">|</span>
                    <span className="text-[11px] text-[#f87171] font-semibold">⚠ Intervention</span>
                  </>
                )}
              </div>
            )}

            {/* Transition notes */}
            {nextTransition?.notes && nextTransition.notes.length > 0 && (
              <div className="text-center space-y-0.5" data-testid="stage-transition-notes">
                {nextTransition.notes.slice(0, 2).map((note, i) => (
                  <p key={i} className="text-[11px] text-[#666666] font-mono">
                    {note}
                  </p>
                ))}
              </div>
            )}

            {/* Next track */}
            <div className="text-center" data-testid="stage-next-track">
              <p className="text-[10px] font-mono uppercase tracking-widest text-[#555555] mb-1">
                UP NEXT
              </p>
              <p className="text-2xl md:text-3xl font-medium text-[#cccccc] truncate">
                {trackTitle(nextEntry)}
              </p>
              {trackArtist(nextEntry) && (
                <p className="text-sm text-[#777777] mt-0.5">{trackArtist(nextEntry)}</p>
              )}
              <div className="flex items-center justify-center gap-2 mt-1.5 text-xs font-mono text-[#666666]">
                <span>{trackBpm(nextEntry)} BPM</span>
                <span>•</span>
                <span>{trackKey(nextEntry)}</span>
                <span>•</span>
                <span>E{trackEnergy(nextEntry)}</span>
              </div>
            </div>
          </div>
        )}

        {/* End of set indicator */}
        {!nextEntry && (
          <div className="text-center" data-testid="stage-end-of-set">
            <p className="text-[10px] font-mono uppercase tracking-widest text-[#f59e0b] mb-1">
              LAST TRACK
            </p>
            <p className="text-sm font-mono text-[#666666]">Final song in performance setlist.</p>
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <footer className="flex items-center justify-between px-6 py-3 bg-[#000000] border-t border-[#1c1c1c] shrink-0 font-mono">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={stagePrev}
            disabled={stageCurrentIndex <= 0}
            className="px-3.5 py-1.5 border border-[#222222] bg-[#0f0f0f] text-[#a1a1aa] hover:bg-[#1a1a1a] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer"
            data-testid="stage-prev-btn"
          >
            [ PREV ]
          </button>

          <button
            type="button"
            onClick={stageNext}
            disabled={stageCurrentIndex >= setlist.length - 1}
            className="px-5 py-1.5 border border-[#333333] bg-[#1a1a1a] text-white hover:bg-[#252525] disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs font-semibold uppercase tracking-wider rounded-none cursor-pointer"
            data-testid="stage-next-btn"
          >
            [ NEXT ]
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Jump-to setlist overlay trigger */}
          <button
            type="button"
            onClick={() => setShowSetlist(!showSetlist)}
            className="px-3 py-1.5 border border-[#222222] bg-[#0f0f0f] text-[#888888] hover:text-[#ededed] hover:bg-[#181818] transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer"
            data-testid="stage-setlist-toggle"
          >
            [ SETLIST ]
          </button>

          <button
            type="button"
            onClick={handleExitRequest}
            className="px-3 py-1.5 border border-[#222222] bg-[#0f0f0f] text-[#888888] hover:text-rose-400 hover:border-rose-900/60 transition-colors text-xs uppercase tracking-wider rounded-none cursor-pointer"
            data-testid="stage-exit-btn"
          >
            [ EXIT STAGE ]
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
              className="px-2.5 py-1 border border-[#222222] bg-[#111111] text-[#888888] hover:text-white transition-colors text-xs cursor-pointer rounded-none"
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
            <p className="text-[#888888] text-xs leading-relaxed font-sans">
              You will return to the setlist editor. Performance timer will be reset.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleExitCancel}
                className="px-4 py-1.5 border border-[#222222] bg-[#141414] text-[#888888] hover:text-white transition-colors text-xs uppercase cursor-pointer rounded-none"
                data-testid="stage-exit-cancel"
              >
                [ STAY ]
              </button>
              <button
                type="button"
                onClick={handleExitConfirm}
                className="px-4 py-1.5 border border-[#6b1515] bg-[#220a0a] text-[#f87171] hover:bg-[#331111] transition-colors text-xs font-semibold uppercase cursor-pointer rounded-none"
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

function MetadataPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0c0c0c] border border-[#1f1f1f] rounded-none">
      <span className="text-[9px] uppercase tracking-wider text-[#555555] font-mono font-semibold">
        {label}
      </span>
      <span className="text-xs font-mono text-[#ededed] font-medium">{value}</span>
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
      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors border rounded-none cursor-pointer ${
        isCurrent
          ? 'bg-[#141414] border-l-2 border-l-[#ededed] border-[#262626] text-white'
          : 'bg-[#0a0a0a] border-[#161616] text-[#888888] hover:text-[#cccccc] hover:bg-[#101010]'
      }`}
      data-testid={`stage-jump-${index}`}
    >
      <span
        className={`text-xs font-mono w-6 text-center tabular-nums ${
          isCurrent ? 'text-white font-bold' : 'text-[#555555]'
        }`}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{title}</p>
        {artist && <p className="text-[10px] text-[#555555] truncate">{artist}</p>}
      </div>
      <div className="flex items-center gap-2 text-xs text-[#666666] font-mono shrink-0">
        {bpm != null && <span>{Math.round(bpm)} BPM</span>}
        {keyStr && <span>{keyStr}</span>}
      </div>
      {isCurrent && (
        <span className="text-[#ededed] text-[10px] font-mono uppercase tracking-wider font-semibold">▶ NOW</span>
      )}
    </button>
  );
}
