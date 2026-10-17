import type { Track } from '../../../bindings/Track';
import type { TransitionAdvice } from '../../../bindings/TransitionAdvice';
import { formatDuration } from '../usePerformanceClock';

export interface TransitionRadarProps {
  currentTrack: Track | null;
  nextTrack: Track | null;
  positionMs: number;
  transition: TransitionAdvice | null;
  onSnapNextPhrase?: (targetMs: number) => void;
}

/**
 * TransitionRadar — Phrase-Locked Mix Radar & Transition Countdown HUD.
 *
 * Real-time performance co-pilot providing:
 * - Active phrase & bar progress (e.g. Phrase 3 • Bar 12/16 • Beat 2)
 * - 4-beat bar rhythm indicator with downbeat pulse
 * - Color-coded mix countdown (green boundary, amber imminent alert)
 * - Mix-out cue proximity detection (Register G / Outro)
 * - Frequency & Transition advisory alerts
 * - One-tap phrase snap navigation
 */
export function TransitionRadar({
  currentTrack,
  nextTrack,
  positionMs,
  transition,
  onSnapNextPhrase,
}: TransitionRadarProps) {
  if (!currentTrack) {
    return null;
  }

  // 1. Grid & Phrase calculations
  const bpm = currentTrack.analysis?.rhythm?.grid?.bpm ?? 120;
  const firstDownbeatMs = currentTrack.analysis?.rhythm?.grid?.first_downbeat_ms ?? 0;
  const msPerBeat = 60000 / (bpm > 0 ? bpm : 120);
  const msPerBar = msPerBeat * 4;
  const phraseBars = transition?.phrase_bars && transition.phrase_bars > 0 ? transition.phrase_bars : 16;
  const msPerPhrase = msPerBar * phraseBars;

  // Timeline progress
  const elapsedSinceGrid = Math.max(0, positionMs - firstDownbeatMs);
  const totalBeats = Math.floor(elapsedSinceGrid / msPerBeat);
  const totalBars = Math.floor(totalBeats / 4) + 1;
  const currentBeatInBar = (totalBeats % 4) + 1;

  // Phrase arithmetic (1-indexed)
  const currentPhraseNum = Math.floor((totalBars - 1) / phraseBars) + 1;
  const barInPhrase = ((totalBars - 1) % phraseBars) + 1;
  const barsRemaining = phraseBars - barInPhrase;

  // Timestamp of the start of the next phrase
  const nextPhraseTargetMs = firstDownbeatMs + currentPhraseNum * msPerPhrase;

  // 2. Mix-Out (Outro / Register G) proximity
  const mixOutCue = currentTrack.analysis?.cue_points?.find(
    (c) =>
      c.index === 6 ||
      c.label.toLowerCase().includes('outro') ||
      c.label.toLowerCase().includes('mix-out')
  );

  let barsToOutro: number | null = null;
  if (mixOutCue && mixOutCue.time_ms > positionMs) {
    barsToOutro = Math.max(0, Math.round((mixOutCue.time_ms - positionMs) / msPerBar));
  }

  // 3. Status urgency
  const isOnPhraseStart = barInPhrase === 1;
  const isImminent = barsRemaining <= 2; // within 2 bars of next phrase

  return (
    <div
      className="bg-[#090909] border border-[#1e1e1e] rounded-sm p-3.5 flex flex-col gap-2.5 font-mono shadow-sm"
      data-testid="stage-transition-radar"
    >
      {/* Top Header: Title & Actions */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse" />
          <span className="font-bold uppercase tracking-wider text-[#cfcfcf]">
            TRANSITION RADAR
          </span>
          <span className="text-[#666]">|</span>
          <span className="text-[#a8a8a8]">
            {Math.round(bpm)} BPM • {phraseBars}-BAR PHRASES
          </span>
        </div>

        {onSnapNextPhrase && (
          <button
            type="button"
            onClick={() => onSnapNextPhrase(nextPhraseTargetMs)}
            className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider border border-[#2a2a2a] bg-[#121212] hover:bg-[#1c1c1c] hover:border-[#38bdf8] text-[#cfcfcf] hover:text-white rounded-none transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
            data-testid="radar-snap-next-phrase"
            title="Snap playhead forward to next phrase start"
          >
            Snap Next Phrase ↷
          </button>
        )}
      </div>

      {/* Center Section: Phrase Progress Counter & Beat Pulse */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-1.5 px-3 bg-[#050505] border border-[#161616] rounded-sm">
        {/* Left: Phrase & Bar Counter */}
        <div className="flex items-center gap-3" data-testid="radar-phrase-counter">
          <div className="flex flex-col">
            <span className="text-[10px] text-[#888] uppercase tracking-wider font-semibold">
              CURRENT POSITION
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-bold text-white tabular-nums">
                PHRASE {currentPhraseNum}
              </span>
              <span className="text-sm font-semibold text-[#38bdf8] tabular-nums">
                BAR {barInPhrase} / {phraseBars}
              </span>
            </div>
          </div>
        </div>

        {/* Center: 4-Beat Meter in Current Bar */}
        <div className="flex flex-col items-center gap-1" data-testid="radar-beat-indicators">
          <span className="text-[10px] text-[#888] uppercase tracking-wider">
            BEAT {currentBeatInBar}/4
          </span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((beat) => {
              const isCurrent = beat === currentBeatInBar;
              const isDownbeat = beat === 1;
              return (
                <div
                  key={beat}
                  className={`transition-all rounded-sm ${
                    isCurrent
                      ? isDownbeat
                        ? 'w-4 h-4 bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                        : 'w-3.5 h-3.5 bg-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.7)]'
                      : isDownbeat
                        ? 'w-4 h-4 bg-[#1f2937] border border-[#374151]'
                        : 'w-3.5 h-3.5 bg-[#141414] border border-[#222]'
                  }`}
                  title={isDownbeat ? 'Beat 1 (Downbeat)' : `Beat ${beat}`}
                />
              );
            })}
          </div>
        </div>

        {/* Right: Mix Status Badge */}
        <div data-testid="radar-countdown-badge">
          {isOnPhraseStart ? (
            <div className="px-3 py-1.5 bg-cyan-950/60 border border-[#00b4d8] text-[#38bdf8] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
              <span>◆</span>
              <span>PHRASE BOUNDARY (BAR 1)</span>
            </div>
          ) : isImminent ? (
            <div className="px-3 py-1.5 bg-amber-950/60 border border-amber-500/80 text-amber-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
              <span>⚠</span>
              <span>DROP IN {barsRemaining + 1} BARS</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 bg-[#101010] border border-[#262626] text-[#a8a8a8] text-xs font-medium uppercase tracking-wider">
              <span>{barsRemaining} BARS TO BOUNDARY</span>
            </div>
          )}
        </div>
      </div>

      {/* Phrase Progress Bar Indicator (mini blocks for all bars in phrase) */}
      <div className="flex gap-1 w-full pt-0.5">
        {Array.from({ length: phraseBars }, (_, i) => i + 1).map((barNum) => {
          const isPast = barNum < barInPhrase;
          const isCurrent = barNum === barInPhrase;
          return (
            <div
              key={barNum}
              className={`h-2 flex-1 rounded-[1px] transition-all ${
                isCurrent
                  ? 'bg-[#38bdf8] shadow-[0_0_6px_rgba(56,189,248,0.8)]'
                  : isPast
                    ? 'bg-[#1e3a5f]'
                    : 'bg-[#151515]'
              }`}
              title={`Bar ${barNum} of ${phraseBars}`}
            />
          );
        })}
      </div>

      {/* Bottom Advisory & Outro Proximity Strip */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[#a8a8a8] border-t border-[#181818]"
        data-testid="radar-advice-notes"
      >
        {/* Outro mix-out indicator */}
        {barsToOutro !== null ? (
          <div className="flex items-center gap-1 text-[#cfcfcf]">
            <span className="text-amber-400">⏳</span>
            <span>
              Outro Cue ({formatDuration(mixOutCue!.time_ms)}):{' '}
              <strong className="text-white">{barsToOutro} bars remaining</strong>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[#888]">
            <span>Mix Point: Continuous Phrase Alignment</span>
          </div>
        )}

        {/* Next transition notes / advice */}
        {nextTrack && transition && (
          <div className="flex items-center gap-2 max-w-md truncate">
            {transition.intervention_required && (
              <span className="text-amber-400 font-bold uppercase text-[11px] shrink-0">
                ⚠ Intervention Recommended:
              </span>
            )}
            <span className="truncate text-[#cfcfcf]" title={transition.notes?.[0] ?? ''}>
              {transition.notes?.[0] ?? `${transition.transition_type} transition`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
