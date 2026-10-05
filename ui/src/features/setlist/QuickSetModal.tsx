import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getBackend, type Backend } from '../../api';
import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { Track } from '../../bindings/Track';
import { EnergyChart } from './EnergyChart';
import { computeEnergyTrajectory, getTargetEnergy } from './energyCurve';
import { computeTransitionCost } from './costModel';
import { getTrackDisplayTitle, getTrackDisplayArtist } from '../../utils/trackDisplay';
import { IconSparkles } from '../../components/icons';

export interface QuickSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrackIds?: string[];
  customBackend?: Backend;
}

export interface ProfileChoice {
  id: EnergyProfile;
  title: string;
  subtitle: string;
  description: string;
}

export const PROFILE_CHOICES: ProfileChoice[] = [
  {
    id: 'LinearRamp',
    title: 'Build up',
    subtitle: '(linear ramp)',
    description: 'Energy rises steadily across the set, driving toward a high-energy finish.',
  },
  {
    id: 'Wave',
    title: 'Peaks and breaks',
    subtitle: '(wave)',
    description: 'Alternates between driving peaks and breathing breakdowns to reset energy.',
  },
  {
    id: 'PeakPlateau',
    title: 'Hit hard early',
    subtitle: '(plateau)',
    description: 'Ramps up quickly to peak energy early and sustains it throughout the set.',
  },
];

export interface WeakTransitionInfo {
  index: number;
  fromTrack: Track | null;
  toTrack: Track | null;
  cost: number;
  reason?: string;
}

export function QuickSetModal({
  isOpen,
  onClose,
  selectedTrackIds,
  customBackend,
}: QuickSetModalProps) {
  const tracks = useAppStore((s) => s.tracks);
  const selectedTrackId = useAppStore((s) => s.selectedTrackId);
  const costWeights = useAppStore((s) => s.costWeights);
  const loadSetlist = useAppStore((s) => s.loadSetlist);
  const persistActiveSetlist = useAppStore((s) => s.persistActiveSetlist);
  const setRoute = useAppStore((s) => s.setRoute);
  const addToast = useAppStore((s) => s.addToast);
  const useMockBackend = useAppStore((s) => s.useMockBackend);

  const backend = customBackend ?? getBackend(useMockBackend);

  const [selectedProfile, setSelectedProfile] = useState<EnergyProfile>('LinearRamp');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedEntries, setGeneratedEntries] = useState<SetlistEntry[] | null>(null);

  // Input tracks: selected tracks, or all tracks if none selected (cap at 40)
  const inputTracks = useMemo(() => {
    if (selectedTrackIds && selectedTrackIds.length >= 2) {
      const idSet = new Set(selectedTrackIds);
      return tracks.filter((t) => idSet.has(t.id));
    }
    if (selectedTrackId) {
      const single = tracks.find((t) => t.id === selectedTrackId);
      if (single && tracks.length >= 2) {
        const others = tracks.filter((t) => t.id !== selectedTrackId).slice(0, 39);
        return [single, ...others];
      }
    }
    return tracks.slice(0, 40);
  }, [tracks, selectedTrackIds, selectedTrackId]);

  // Weak transitions (cost > 0.6)
  const weakTransitions: WeakTransitionInfo[] = useMemo(() => {
    if (!generatedEntries || generatedEntries.length < 2) return [];

    const list: WeakTransitionInfo[] = [];
    for (let i = 1; i < generatedEntries.length; i++) {
      const prev = generatedEntries[i - 1];
      const curr = generatedEntries[i];
      const breakdown = computeTransitionCost(prev.track, curr.track, curr.transition);
      const rawCost = curr.transition?.total_cost ?? (curr.transition as { cost?: number } | null)?.cost;
      const cost =
        rawCost !== null && rawCost !== undefined
          ? rawCost
          : breakdown.isAvailable
          ? breakdown.total
          : 0;

      if (cost > 0.6) {
        list.push({
          index: i,
          fromTrack: prev.track,
          toTrack: curr.track,
          cost,
          reason: curr.transition?.notes?.[0] ?? (curr.transition ? `ΔBPM ${curr.transition.bpm_delta.toFixed(1)}, Key dist ${curr.transition.key_distance}` : undefined),
        });
      }
    }
    return list;
  }, [generatedEntries]);

  // Trajectory points for energy curve
  const energyPoints = useMemo(() => {
    if (!generatedEntries || generatedEntries.length === 0) return [];
    return computeEnergyTrajectory(generatedEntries, selectedProfile);
  }, [generatedEntries, selectedProfile]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (inputTracks.length < 2) {
      setErrorMessage('Need at least 2 tracks to generate a quick set.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const trackIds = inputTracks.map((t) => t.id);
      const solverResult = await backend.suggestOrder(
        trackIds,
        selectedProfile,
        costWeights
      );

      const trackMap = new Map<string, Track>(tracks.map((t) => [t.id, t]));
      const fullEntries: SetlistEntry[] = [];

      for (let i = 0; i < solverResult.length; i++) {
        const entry = solverResult[i];
        const track = entry.track ?? trackMap.get(entry.track_id) ?? null;
        let transition = entry.transition ?? null;

        if (i > 0 && !transition) {
          const prevEntry = fullEntries[i - 1];
          if (prevEntry.track && track) {
            try {
              const de =
                getTargetEnergy(selectedProfile, i, solverResult.length) -
                getTargetEnergy(selectedProfile, i - 1, solverResult.length);
              transition = await backend.getAdvice(
                prevEntry.track_id,
                entry.track_id,
                selectedProfile,
                costWeights,
                de
              );
            } catch {
              // ignore advice error
            }
          }
        }

        fullEntries.push({
          ...entry,
          position: i + 1,
          track,
          transition,
        });
      }

      // Save the set to active setlist
      loadSetlist(fullEntries, selectedProfile);
      await persistActiveSetlist(backend);

      setGeneratedEntries(fullEntries);
      addToast({
        type: 'success',
        message: 'Quick set created',
        details: `Arranged ${fullEntries.length} tracks with ${selectedProfile} energy curve.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      addToast({
        type: 'error',
        message: 'Quick set generation failed',
        details: msg,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleViewSet = () => {
    setRoute('setlist');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-set-title"
      data-testid="quick-set-modal"
    >
      <div className="bg-[#0e0e0e] border border-[#27272a] max-w-2xl w-full p-5 space-y-4 select-none max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1c1c1c] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#38bdf8]" />
            <h3
              id="quick-set-title"
              className="text-sm font-mono font-bold tracking-wider uppercase text-white"
            >
              Quick Set
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Quick Set"
            data-testid="quick-set-close-btn"
            className="text-[#a8a8a8] hover:text-white text-xs font-mono cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
          >
            ✕
          </button>
        </div>

        {/* Input Tracks Info */}
        <div className="p-2.5 bg-[#0a0a0a] border border-[#1c1c1c] text-xs font-mono flex items-center justify-between">
          <span className="text-[#a8a8a8]">
            Input tracks:{' '}
            <strong className="text-white">
              {inputTracks.length} {inputTracks.length === 1 ? 'track' : 'tracks'}
            </strong>{' '}
            {selectedTrackIds && selectedTrackIds.length >= 2
              ? '(selected tracks)'
              : selectedTrackId
              ? '(selected track + library)'
              : '(all tracks, capped at 40)'}
          </span>
          {inputTracks.length < 2 && (
            <span className="text-amber-400 font-semibold">Need at least 2 tracks</span>
          )}
        </div>

        {/* Energy Arc Choices */}
        <div className="space-y-2">
          <label className="block text-xs font-mono font-semibold uppercase tracking-wider text-[#a8a8a8]">
            Select energy progression
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {PROFILE_CHOICES.map((choice) => {
              const isSelected = selectedProfile === choice.id;
              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => setSelectedProfile(choice.id)}
                  data-testid={`quick-set-choice-${
                    choice.id === 'LinearRamp'
                      ? 'buildup'
                      : choice.id === 'Wave'
                      ? 'peaks'
                      : 'hithard'
                  }`}
                  className={`p-3 text-left border transition-all cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] ${
                    isSelected
                      ? 'bg-[#142332] border-[#38bdf8] text-white shadow-sm'
                      : 'bg-[#0d0d0d] border-[#222222] text-[#cfcfcf] hover:border-[#333333] hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      {choice.title}
                    </span>
                    {isSelected && (
                      <span className="text-xs text-[#38bdf8] font-bold">●</span>
                    )}
                  </div>
                  <span className="block text-xs font-mono text-[#38bdf8] mb-1">
                    {choice.subtitle}
                  </span>
                  <p className="text-xs font-mono text-[#a8a8a8] leading-relaxed">
                    {choice.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Trigger Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={inputTracks.length < 2 || isGenerating}
            data-testid="quick-set-generate-btn"
            className="flex-1 py-2 px-4 bg-[#1a1a1a] hover:bg-[#252525] disabled:opacity-40 text-white text-xs font-mono font-bold uppercase tracking-wider border border-[#333333] transition-colors cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
          >
            <IconSparkles size={13} className={isGenerating ? 'animate-spin' : ''} />
            <span>{isGenerating ? 'Building Quick Set...' : 'Generate Quick Set'}</span>
          </button>
        </div>

        {/* Error Notice */}
        {errorMessage && (
          <div className="p-2.5 bg-[#1a0808] border border-[#501515] text-xs font-mono text-[#f87171]">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Generated Set Details: Energy Curve & Weak Transitions */}
        {generatedEntries && (
          <div className="space-y-4 pt-2 border-t border-[#1c1c1c] animate-fade-in">
            {/* Energy Curve */}
            <div data-testid="quick-set-energy-chart" className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  Energy Progression Curve
                </span>
                <span className="text-xs font-mono text-[#a8a8a8]">
                  Target (dashed) vs Actual Energy (solid)
                </span>
              </div>
              <EnergyChart points={energyPoints} profile={selectedProfile} />
            </div>

            {/* Weak Transitions */}
            <div data-testid="quick-set-weak-transitions" className="space-y-2">
              {weakTransitions.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                      Check these {weakTransitions.length} transitions
                    </h4>
                    <span className="text-xs font-mono text-[#a8a8a8]">
                      Transition cost &gt; 0.60
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {weakTransitions.map((w) => {
                      const fromTitle = w.fromTrack
                        ? getTrackDisplayTitle(w.fromTrack)
                        : `Track ${w.index}`;
                      const toTitle = w.toTrack
                        ? getTrackDisplayTitle(w.toTrack)
                        : `Track ${w.index + 1}`;
                      const fromArtist = w.fromTrack
                        ? getTrackDisplayArtist(w.fromTrack)
                        : '';
                      const toArtist = w.toTrack
                        ? getTrackDisplayArtist(w.toTrack)
                        : '';

                      return (
                        <div
                          key={w.index}
                          className="p-2.5 bg-[#140e06] border border-[#3d2a0d] text-xs font-mono flex items-center justify-between gap-3"
                          data-testid={`weak-transition-item-${w.index}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-amber-400 font-bold shrink-0">
                                #{w.index} → #{w.index + 1}
                              </span>
                              <span className="text-white font-medium truncate">
                                {fromTitle} {fromArtist ? `(${fromArtist})` : ''} → {toTitle} {toArtist ? `(${toArtist})` : ''}
                              </span>
                            </div>
                            {w.reason && (
                              <p className="text-[#a8a8a8] text-xs truncate mt-0.5">
                                {w.reason}
                              </p>
                            )}
                          </div>
                          <span className="px-2 py-0.5 text-xs font-mono font-bold bg-[#261806] text-amber-300 border border-[#52350f] shrink-0">
                            Cost: {w.cost.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="p-3 bg-[#0d1712] border border-[#1c3829] text-xs font-mono text-emerald-400 flex items-center justify-between">
                  <span>✓ All transitions are harmonic and smooth (no transition cost above 0.60).</span>
                  <span className="text-xs text-[#a8a8a8]">Ready to perform</span>
                </div>
              )}
            </div>

            {/* Bottom Footer Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c1c1c]">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-mono text-[#a8a8a8] hover:text-white transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleViewSet}
                data-testid="quick-set-view-set-btn"
                className="px-4 py-1.5 bg-[#142332] hover:bg-[#1b3147] text-[#38bdf8] border border-[#38bdf8]/60 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
              >
                Open in My Set →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default QuickSetModal;
