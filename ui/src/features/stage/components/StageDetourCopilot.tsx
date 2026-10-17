import { useState, useMemo } from 'react';
import type { Track } from '../../../bindings/Track';
import { getCamelotDistance } from '../../library/harmonic';
import { camelotColor, camelotTextColor } from '../../../utils/camelotColor';

export interface StageDetourCopilotProps {
  currentTrack: Track | null;
  allTracks: Track[];
  onQueueNext: (track: Track) => void;
  onSwapNext: (track: Track) => void;
}

interface DetourRecommendation {
  type: 'lift' | 'reset' | 'vip';
  badgeTitle: string;
  badgeColor: string;
  track: Track;
  bpmDelta: number;
  keyDistance: number;
  energyDelta: number;
  harmonicRelation: string;
}

/**
 * Strips common version suffixes to find the base title for VIP/version matching.
 */
function getBaseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[\(\[](vip|dub|edit|remix|instrumental|acapella|radio edit|club mix|extended mix|live)[\)\]]/gi, '')
    .trim();
}

/**
 * Detects if a track title or artist indicates a version / VIP / edit.
 */
function isVersionVariant(titleA: string, titleB: string): boolean {
  const baseA = getBaseTitle(titleA);
  const baseB = getBaseTitle(titleB);
  if (!baseA || !baseB) return false;

  // Base titles match but full strings differ (e.g. "Starlight" vs "Starlight (VIP)")
  if (baseA === baseB && titleA.toLowerCase() !== titleB.toLowerCase()) {
    return true;
  }

  // One title contains the other plus a variant keyword
  const variantKeywords = ['vip', 'dub', 'edit', 'remix', 'instrumental', 'club', 'live'];
  const hasKeyword = variantKeywords.some(
    (kw) => titleB.toLowerCase().includes(kw) || titleA.toLowerCase().includes(kw)
  );

  return hasKeyword && (baseA.includes(baseB) || baseB.includes(baseA));
}

/**
 * StageDetourCopilot — Live Performance Detour & Version Copilot.
 *
 * Provides 1-tap live harmonic pivots:
 * 1. ⚡ Energy Lift (+ΔE / Camelot Lift)
 * 2. 🌊 Floor Reset (Cooldown / Groove Breath)
 * 3. 🎛 VIP / Producer Version Swap (or Harmonic Twin)
 */
export function StageDetourCopilot({
  currentTrack,
  allTracks,
  onQueueNext,
  onSwapNext,
}: StageDetourCopilotProps) {
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const currentBpm = currentTrack?.analysis?.rhythm?.grid?.bpm ?? 120;
  const currentKey = currentTrack?.analysis?.key;
  const currentKeyStr = currentKey
    ? `${currentKey.camelot.number}${currentKey.camelot.letter}`
    : '8A';
  const currentEnergy = currentTrack?.analysis?.energy_score ?? 5;
  const currentTitle = currentTrack?.tags?.title ?? '';

  // Calculate live detour candidates
  const recommendations = useMemo<DetourRecommendation[]>(() => {
    if (!currentTrack || allTracks.length <= 1) return [];

    const candidates = allTracks.filter(
      (t) => t.id !== currentTrack.id && t.analysis?.key && t.analysis?.rhythm?.grid?.bpm
    );

    if (candidates.length === 0) return [];

    // Helper: evaluate candidate relative to current track
    const evaluateCandidate = (cand: Track) => {
      const candBpm = cand.analysis?.rhythm?.grid?.bpm ?? 120;
      const candKey = cand.analysis?.key;
      const candKeyStr = candKey ? `${candKey.camelot.number}${candKey.camelot.letter}` : '8A';
      const candEnergy = cand.analysis?.energy_score ?? 5;

      const bpmDelta = candBpm - currentBpm;
      const keyDistance = getCamelotDistance(currentKeyStr, candKeyStr) ?? 3;
      const energyDelta = candEnergy - currentEnergy;

      let harmonicRelation = 'Harmonic Match';
      if (keyDistance === 0) {
        harmonicRelation = currentKey?.camelot.letter === candKey?.camelot.letter ? 'Exact Key' : 'Relative Switch';
      } else if (keyDistance === 1) {
        harmonicRelation = '+1 Fifth (High Consonance)';
      } else if (keyDistance === 2) {
        harmonicRelation = '+2 Whole Step Lift';
      } else {
        harmonicRelation = `Key Distance ${keyDistance}`;
      }

      return { cand, candBpm, candKeyStr, candEnergy, bpmDelta, keyDistance, energyDelta, harmonicRelation };
    };

    const evaluated = candidates.map(evaluateCandidate);

    // 1. Energy Lift: candEnergy > currentEnergy, keyDist <= 2, |bpmDelta| <= 8
    const liftPool = evaluated
      .filter((e) => e.energyDelta > 0 && e.keyDistance <= 2 && Math.abs(e.bpmDelta) <= 8)
      .sort((a, b) => b.energyDelta - a.energyDelta || a.keyDistance - b.keyDistance);

    const bestLift = liftPool[0] ?? null;

    // 2. Floor Reset: candEnergy < currentEnergy, keyDist <= 1, |bpmDelta| <= 8
    const resetPool = evaluated
      .filter((e) => (e.energyDelta < 0 || e.candEnergy <= 5) && e.keyDistance <= 1 && Math.abs(e.bpmDelta) <= 8)
      .sort((a, b) => a.energyDelta - b.energyDelta || a.keyDistance - b.keyDistance);

    const bestReset = resetPool[0] ?? null;

    // 3. VIP / Producer Edit / Variant
    const vipPool = evaluated.filter((e) =>
      isVersionVariant(currentTitle, e.cand.tags?.title ?? '')
    );

    let bestVip = vipPool[0] ?? null;
    let isExplicitVip = !!bestVip;

    // Fallback: Harmonic Twin (keyDist === 0, |bpmDelta| <= 3)
    if (!bestVip) {
      const twinPool = evaluated
        .filter((e) => e.keyDistance === 0 && Math.abs(e.bpmDelta) <= 3)
        .sort((a, b) => Math.abs(a.bpmDelta) - Math.abs(b.bpmDelta));
      bestVip = twinPool[0] ?? evaluated[0] ?? null;
      isExplicitVip = false;
    }

    const recs: DetourRecommendation[] = [];

    if (bestLift) {
      recs.push({
        type: 'lift',
        badgeTitle: '⚡ ENERGY LIFT',
        badgeColor: 'border-amber-500/70 bg-amber-950/40 text-amber-300',
        track: bestLift.cand,
        bpmDelta: bestLift.bpmDelta,
        keyDistance: bestLift.keyDistance,
        energyDelta: bestLift.energyDelta,
        harmonicRelation: bestLift.harmonicRelation,
      });
    }

    if (bestReset) {
      recs.push({
        type: 'reset',
        badgeTitle: '🌊 FLOOR RESET',
        badgeColor: 'border-cyan-500/70 bg-cyan-950/40 text-cyan-300',
        track: bestReset.cand,
        bpmDelta: bestReset.bpmDelta,
        keyDistance: bestReset.keyDistance,
        energyDelta: bestReset.energyDelta,
        harmonicRelation: bestReset.harmonicRelation,
      });
    }

    if (bestVip) {
      recs.push({
        type: 'vip',
        badgeTitle: isExplicitVip ? '🎛 VIP / PRODUCER EDIT' : '🎯 HARMONIC TWIN',
        badgeColor: isExplicitVip
          ? 'border-purple-500/70 bg-purple-950/40 text-purple-300'
          : 'border-[#00b4d8]/70 bg-[#072438] text-[#38bdf8]',
        track: bestVip.cand,
        bpmDelta: bestVip.bpmDelta,
        keyDistance: bestVip.keyDistance,
        energyDelta: bestVip.energyDelta,
        harmonicRelation: bestVip.harmonicRelation,
      });
    }

    return recs;
  }, [currentTrack, allTracks, currentBpm, currentKeyStr, currentEnergy, currentTitle]);

  const handleAction = (track: Track, actionType: 'swap' | 'queue') => {
    if (actionType === 'swap') {
      onSwapNext(track);
      setFeedbackMsg(`✓ Set "${track.tags?.title ?? track.id}" as Next Track!`);
    } else {
      onQueueNext(track);
      setFeedbackMsg(`✓ Queued "${track.tags?.title ?? track.id}" after current!`);
    }

    setTimeout(() => {
      setFeedbackMsg(null);
    }, 2600);
  };

  if (!currentTrack || recommendations.length === 0) {
    return null;
  }

  return (
    <div
      className="bg-[#090909] border border-[#1e1e1e] rounded-sm p-3.5 flex flex-col gap-3 font-mono shadow-sm"
      data-testid="stage-detour-copilot"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-sm">🔀</span>
          <span className="font-bold uppercase tracking-wider text-[#cfcfcf]">
            STAGE DETOUR COPILOT
          </span>
          <span className="text-[#666]">|</span>
          <span className="text-[#a8a8a8] text-[11px] hidden sm:inline">
            Dynamic Harmonic & Energy Pivots
          </span>
        </div>

        {feedbackMsg && (
          <div
            className="text-xs font-semibold text-[#38bdf8] bg-[#072438] border border-[#00b4d8]/60 px-2.5 py-0.5 rounded-sm animate-fade-in"
            data-testid="detour-feedback-toast"
          >
            {feedbackMsg}
          </div>
        )}
      </div>

      {/* 3 Detour Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {recommendations.map((rec) => {
          const track = rec.track;
          const title = track.tags?.title ?? track.id;
          const artist = track.tags?.artist ?? 'Unknown Artist';
          const candBpm = track.analysis?.rhythm?.grid?.bpm;
          const candKey = track.analysis?.key;
          const candKeyStr = candKey ? `${candKey.camelot.number}${candKey.camelot.letter}` : '—';
          const candEnergy = track.analysis?.energy_score ?? '—';

          return (
            <div
              key={rec.type}
              className="flex flex-col justify-between p-3 bg-[#0d0d0d] border border-[#222222] hover:border-[#38bdf8]/40 transition-colors rounded-sm gap-2.5"
              data-testid={`detour-card-${rec.type}`}
            >
              {/* Card Badge & Metric */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-none ${rec.badgeColor}`}
                >
                  {rec.badgeTitle}
                </span>
                <span className="text-[10px] text-[#888] font-mono">
                  {rec.harmonicRelation}
                </span>
              </div>

              {/* Title & Artist */}
              <div className="min-w-0">
                <h4
                  className="text-sm font-semibold text-white truncate"
                  title={title}
                >
                  {title}
                </h4>
                <p className="text-xs text-[#a8a8a8] truncate" title={artist}>
                  {artist}
                </p>
              </div>

              {/* Technical Stats Pills */}
              <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
                {/* BPM pill */}
                {candBpm != null && (
                  <span className="px-2 py-0.5 bg-[#141414] border border-[#262626] text-[#cfcfcf]">
                    {Math.round(candBpm)} BPM{' '}
                    <span
                      className={
                        rec.bpmDelta > 0
                          ? 'text-amber-400'
                          : rec.bpmDelta < 0
                            ? 'text-cyan-400'
                            : 'text-[#888]'
                      }
                    >
                      ({rec.bpmDelta >= 0 ? `+${rec.bpmDelta.toFixed(1)}` : rec.bpmDelta.toFixed(1)})
                    </span>
                  </span>
                )}

                {/* Key pill */}
                {candKeyStr !== '—' && (
                  <span
                    className="px-2 py-0.5 border font-bold"
                    style={{
                      backgroundColor: camelotColor(candKeyStr),
                      color: camelotTextColor(candKeyStr),
                      borderColor: 'transparent',
                    }}
                  >
                    {candKeyStr}
                  </span>
                )}

                {/* Energy pill */}
                <span className="px-2 py-0.5 bg-[#141414] border border-[#262626] text-[#cfcfcf]">
                  E:{candEnergy}{' '}
                  {rec.energyDelta !== 0 && (
                    <span
                      className={rec.energyDelta > 0 ? 'text-amber-400' : 'text-cyan-400'}
                    >
                      ({rec.energyDelta > 0 ? `+${rec.energyDelta}` : rec.energyDelta})
                    </span>
                  )}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1 border-t border-[#1a1a1a]">
                <button
                  type="button"
                  onClick={() => handleAction(track, 'swap')}
                  className="flex-1 py-1.5 px-2 bg-[#161616] hover:bg-[#222222] border border-[#2c2c2c] hover:border-[#38bdf8] text-[#cfcfcf] hover:text-white text-xs font-semibold uppercase tracking-wider rounded-none transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                  data-testid={`detour-swap-${rec.type}`}
                  title="Replace upcoming track with this track"
                >
                  [ SWAP NEXT ]
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(track, 'queue')}
                  className="flex-1 py-1.5 px-2 bg-[#161616] hover:bg-[#222222] border border-[#2c2c2c] hover:border-[#10b981] text-[#cfcfcf] hover:text-white text-xs font-semibold uppercase tracking-wider rounded-none transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#10b981] focus-visible:outline-none"
                  data-testid={`detour-queue-${rec.type}`}
                  title="Queue this track immediately after current track"
                >
                  [ INSERT NEXT ]
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
