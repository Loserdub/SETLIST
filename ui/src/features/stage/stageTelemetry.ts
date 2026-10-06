import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { TransitionAdvice } from '../../bindings/TransitionAdvice';

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
