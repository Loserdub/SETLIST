import { useState, useEffect } from 'react';
import type { Song } from '../../bindings/Song';
import type { SongRelationship } from '../../bindings/SongRelationship';
import type { SongRelationshipsResponse } from '../../bindings/SongRelationshipsResponse';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { useAppStore } from '../../store/useAppStore';
import { getBackend } from '../../api';

interface SongRelationshipDrawerProps {
  song: Song | null;
  onClose: () => void;
  onSelectBridgeTarget?: (targetSongId: string) => void;
  onStartPathFromSong?: (songId: string) => void;
  isDockedRail?: boolean;
}

export function SongRelationshipDrawer({
  song,
  onClose,
  onSelectBridgeTarget,
  onStartPathFromSong,
  isDockedRail = false,
}: SongRelationshipDrawerProps) {
  const { useMockBackend, addToSetlist, addToast, tracks } = useAppStore();
  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming' | 'unusual'>('outgoing');
  const [relationships, setRelationships] = useState<SongRelationshipsResponse | null>(null);
  const [unusualTransitions, setUnusualTransitions] = useState<SongRelationship[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedRelId, setExpandedRelId] = useState<string | null>(null);

  useEffect(() => {
    if (!song) return;

    let isMounted = true;
    setIsLoading(true);
    const backend = getBackend(useMockBackend);

    Promise.all([
      backend.getSongRelationships(song.id),
      backend.getUnusualTransitions(song.id, 8),
    ])
      .then(([relRes, unusualRes]) => {
        if (!isMounted) return;
        setRelationships(relRes);
        setUnusualTransitions(unusualRes);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setIsLoading(false);
        addToast({
          type: 'error',
          message: 'Failed to load song relationships',
          details: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      isMounted = false;
    };
  }, [song, useMockBackend, addToast]);

  if (!song) return null;

  const currentList: SongRelationship[] =
    activeTab === 'outgoing'
      ? relationships?.outgoing ?? []
      : activeTab === 'incoming'
      ? relationships?.incoming ?? []
      : unusualTransitions;

  const handleAddTrack = async (targetSongId: string) => {
    // Find matching track in store if possible
    const track = tracks.find((t) => t.id === targetSongId);
    if (track) {
      await addToSetlist(track.id);
      addToast({
        type: 'success',
        message: 'Added to active setlist',
        details: track.tags.title ?? 'Track added',
      });
    } else {
      await addToSetlist(targetSongId);
      addToast({
        type: 'success',
        message: 'Added to active setlist',
      });
    }
  };

  const formatDuration = (secs: number): string => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${String(s).padStart(2, '0')}`;
  };

  const getCompatibilityBadge = (comp: string) => {
    switch (comp) {
      case 'Excellent':
        return 'bg-emerald-950/70 text-emerald-400 border-emerald-800/80';
      case 'Good':
        return 'bg-teal-950/70 text-teal-300 border-teal-800/80';
      case 'Viable':
        return 'bg-amber-950/70 text-amber-300 border-amber-800/80';
      case 'Challenging':
        return 'bg-orange-950/70 text-orange-400 border-orange-800/80';
      case 'Clashing':
      default:
        return 'bg-rose-950/70 text-rose-400 border-rose-800/80';
    }
  };

  const getClassificationBadge = (cls: string) => {
    switch (cls) {
      case 'Smooth':
        return 'bg-[#182818] text-[#85e085] border-[#2d5a2d]';
      case 'Rising':
        return 'bg-[#2a1810] text-[#ffaa77] border-[#663311]';
      case 'Falling':
        return 'bg-[#101c2a] text-[#77bbee] border-[#113866]';
      case 'HarmonicTransition':
        return 'bg-[#26152a] text-[#e085ff] border-[#592666]';
      case 'RhythmicTempoTransition':
        return 'bg-[#2a2610] text-[#eedd77] border-[#665c11]';
      case 'EnergyReset':
        return 'bg-[#102a28] text-[#77eedd] border-[#11665c]';
      case 'IntentionalContrast':
        return 'bg-[#2a101f] text-[#ee77b4] border-[#661142]';
      case 'HardCut':
        return 'bg-[#242424] text-[#d0d0d0] border-[#444444]';
      case 'PoorFit':
      default:
        return 'bg-[#2a1212] text-[#ee7777] border-[#662020]';
    }
  };

  const drawerContent = (
    <div
      className={`w-full bg-[#0d0d0d] ${
        isDockedRail ? 'h-full border-none' : 'max-w-2xl border-l border-[#222222] h-full shadow-2xl'
      } flex flex-col text-[#e2e2e2] overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
      data-testid="song-relationship-drawer"
    >
        {/* Drawer Header */}
        <div className="p-4 border-b border-[#222222] bg-[#111111] flex items-start justify-between">
          <div className="space-y-1 min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#a8a8a8] uppercase">
                SONG RELATIONSHIP PROFILE
              </span>
              {song.energy_rating && (
                <span className="px-1.5 py-0.5 text-xs font-mono border border-[#333333] bg-[#1a1a1a] text-[#cfcfcf]">
                  Energy {song.energy_rating}/10
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-[#f0f0f0] truncate">{song.title}</h2>
            <p className="text-xs text-[#a8a8a8] font-normal truncate">{song.artist}</p>

            {/* Metadata Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1.5 text-xs font-mono">
              {song.camelot_code && (
                <span
                  className="px-2 py-0.5 font-bold rounded-[2px] text-xs"
                  style={{
                    backgroundColor: camelotColor(song.camelot_code),
                    color: camelotTextColor(song.camelot_code),
                  }}
                >
                  {song.camelot_code}
                </span>
              )}
              {song.bpm && (
                <span className="px-2 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#cfcfcf] text-xs">
                  {song.bpm.toFixed(1)} BPM
                </span>
              )}
              {song.duration_seconds > 0 && (
                <span className="px-2 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#a8a8a8] text-xs">
                  {formatDuration(song.duration_seconds)}
                </span>
              )}
              {song.tuning && (
                <span className="px-2 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#a8a8a8] text-xs">
                  {song.tuning}
                  {song.capo !== undefined && song.capo !== null && song.capo > 0
                    ? ` (Capo ${song.capo})`
                    : ''}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close relationship drawer"
            className="p-1.5 text-[#a8a8a8] hover:text-white hover:bg-[#222222] transition-colors rounded-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Directional Tabs */}
        <div className="flex border-b border-[#222222] bg-[#0d0d0d] px-4 pt-2 gap-2 text-xs font-mono select-none">
          <button
            type="button"
            onClick={() => setActiveTab('outgoing')}
            className={`pb-2 px-3 border-b-2 font-medium tracking-wide transition-colors cursor-pointer uppercase focus:outline-none focus:ring-1 focus:ring-sky-400 ${
              activeTab === 'outgoing'
                ? 'border-[#e0e0e0] text-white font-semibold'
                : 'border-transparent text-[#a8a8a8] hover:text-[#cccccc]'
            }`}
            data-testid="tab-outgoing"
          >
            Can Follow This Song ({relationships?.outgoing.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('incoming')}
            className={`pb-2 px-3 border-b-2 font-medium tracking-wide transition-colors cursor-pointer uppercase focus:outline-none focus:ring-1 focus:ring-sky-400 ${
              activeTab === 'incoming'
                ? 'border-[#e0e0e0] text-white font-semibold'
                : 'border-transparent text-[#a8a8a8] hover:text-[#cccccc]'
            }`}
            data-testid="tab-incoming"
          >
            Can Precede This Song ({relationships?.incoming.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('unusual')}
            className={`pb-2 px-3 border-b-2 font-medium tracking-wide transition-colors cursor-pointer uppercase focus:outline-none focus:ring-1 focus:ring-sky-400 ${
              activeTab === 'unusual'
                ? 'border-[#e0e0e0] text-white font-semibold'
                : 'border-transparent text-[#a8a8a8] hover:text-[#cccccc]'
            }`}
            data-testid="tab-unusual"
          >
            Creative Contrasts ({unusualTransitions.length})
          </button>
        </div>

        {/* Tab Subtitle / Purpose Explanation */}
        <div className="px-4 py-2 bg-[#121212] border-b border-[#1f1f1f] text-xs font-mono text-[#a8a8a8] flex items-center justify-between">
          <span>
            {activeTab === 'outgoing' &&
              `Outgoing transitions from "${song.title}" → Target Song in sequence.`}
            {activeTab === 'incoming' &&
              `Incoming transitions from Preceding Song → "${song.title}".`}
            {activeTab === 'unusual' &&
              'Creative opportunities: energy resets, half/double time, and harmonic lifts.'}
          </span>
          <span className="text-xs text-[#a8a8a8] uppercase">
            {currentList.length} candidate{currentList.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Relationships List */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3"
          data-testid="relationship-cards-container"
        >
          {isLoading && (
            <div className="py-12 text-center text-xs font-mono text-[#a8a8a8]">
              Computing multidimensional catalog relationships...
            </div>
          )}

          {!isLoading && currentList.length === 0 && (
            <div className="py-12 text-center text-xs font-mono text-[#a8a8a8]">
              No relationships found in this category.
            </div>
          )}

          {!isLoading &&
            currentList.map((rel) => {
              const isOutgoing = activeTab === 'outgoing' || activeTab === 'unusual';
              const partnerId = isOutgoing ? rel.to_song_id : rel.from_song_id;
              const partnerTitle = isOutgoing ? rel.to_title : rel.from_title;
              const partnerKey = isOutgoing ? rel.to_key : rel.from_key;
              const partnerBpm = isOutgoing ? rel.to_bpm : rel.from_bpm;
              const partnerEnergy = isOutgoing ? rel.to_energy : rel.from_energy;

              const isExpanded = expandedRelId === partnerId;

              return (
                <div
                  key={`${rel.from_song_id}-${rel.to_song_id}`}
                  className="bg-[#121212] border border-[#222222] hover:border-[#333333] transition-all p-3 space-y-2.5"
                  data-testid={`relationship-card-${partnerId}`}
                >
                  {/* Card Header Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[#f0f0f0] truncate">
                          {partnerTitle}
                        </span>
                        {partnerKey && (
                          <span
                            className="px-1.5 py-0.5 font-mono font-bold text-xs rounded-[2px]"
                            style={{
                              backgroundColor: camelotColor(partnerKey),
                              color: camelotTextColor(partnerKey),
                            }}
                          >
                            {partnerKey}
                          </span>
                        )}
                        {partnerBpm && (
                          <span className="text-xs font-mono text-[#a8a8a8]">
                            {partnerBpm.toFixed(1)} BPM
                          </span>
                        )}
                        {partnerEnergy && (
                          <span className="text-xs font-mono text-[#a8a8a8]">
                            E{partnerEnergy}
                          </span>
                        )}
                      </div>

                      {/* Musical Delta Metrics */}
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono pt-1 text-[#a8a8a8]">
                        {rel.explanation.bpm.delta !== null && (
                          <span
                            className={
                              Math.abs(rel.explanation.bpm.delta) <= 2
                                ? 'text-emerald-400'
                                : Math.abs(rel.explanation.bpm.delta) <= 6
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }
                          >
                            {rel.explanation.bpm.delta >= 0 ? '+' : ''}
                            {rel.explanation.bpm.delta.toFixed(1)} BPM
                          </span>
                        )}
                        <span className="text-[#666666]">•</span>
                        <span>{rel.explanation.harmony.relation}</span>
                        {rel.explanation.energy.delta !== null && (
                          <>
                            <span className="text-[#666666]">•</span>
                            <span
                              className={
                                rel.explanation.energy.movement === 'Rise'
                                  ? 'text-orange-400'
                                  : rel.explanation.energy.movement === 'Fall'
                                  ? 'text-cyan-400'
                                  : 'text-[#a8a8a8]'
                              }
                            >
                              Energy {rel.explanation.energy.delta >= 0 ? '+' : ''}
                              {rel.explanation.energy.delta} ({rel.explanation.energy.movement})
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Compatibility & Classification Badges */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`px-2 py-0.5 text-xs font-mono font-semibold uppercase border ${getCompatibilityBadge(
                          rel.compatibility
                        )}`}
                      >
                        {rel.compatibility} ({Math.round(rel.overall_score * 100)}%)
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-xs font-mono uppercase border ${getClassificationBadge(
                          rel.primary_classification
                        )}`}
                      >
                        {rel.primary_classification}
                      </span>
                    </div>
                  </div>

                  {/* Plain Language Summary */}
                  <p className="text-xs text-[#cfcfcf] font-normal leading-relaxed bg-[#0a0a0a] p-2 border border-[#1a1a1a]">
                    {rel.explanation.summary}
                  </p>

                  {/* Detailed Dimensional Breakdown Accordion */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-[#1e1e1e] space-y-2 text-xs font-mono animate-in fade-in duration-100">
                      <div className="grid grid-cols-2 gap-2">
                        {/* BPM Dimension */}
                        <div className="bg-[#0e0e0e] p-2 border border-[#1a1a1a] space-y-1">
                          <span className="text-xs text-[#a8a8a8] uppercase font-bold">
                            BPM Dimension
                          </span>
                          <p className="text-[#cfcfcf] text-xs leading-tight">
                            {rel.explanation.bpm.explanation}
                          </p>
                          <span className="text-xs text-[#a8a8a8]">
                            Friction: {Math.round(rel.explanation.bpm.friction * 100)}%
                          </span>
                        </div>

                        {/* Harmonic Dimension */}
                        <div className="bg-[#0e0e0e] p-2 border border-[#1a1a1a] space-y-1">
                          <span className="text-xs text-[#a8a8a8] uppercase font-bold">
                            Harmonic Dimension
                          </span>
                          <p className="text-[#cfcfcf] text-xs leading-tight">
                            {rel.explanation.harmony.explanation}
                          </p>
                          <span className="text-xs text-[#a8a8a8]">
                            Friction: {Math.round(rel.explanation.harmony.friction * 100)}%
                          </span>
                        </div>

                        {/* Energy Dimension */}
                        <div className="bg-[#0e0e0e] p-2 border border-[#1a1a1a] space-y-1">
                          <span className="text-xs text-[#a8a8a8] uppercase font-bold">
                            Energy Trajectory
                          </span>
                          <p className="text-[#cfcfcf] text-xs leading-tight">
                            {rel.explanation.energy.explanation}
                          </p>
                          {rel.explanation.energy.is_reset && (
                            <span className="text-xs text-cyan-400 font-bold block">
                              [ENERGY RESET]
                            </span>
                          )}
                          {rel.explanation.energy.is_contrast && (
                            <span className="text-xs text-pink-400 font-bold block">
                              [INTENTIONAL CONTRAST]
                            </span>
                          )}
                        </div>

                        {/* Tuning & Style Dimension */}
                        <div className="bg-[#0e0e0e] p-2 border border-[#1a1a1a] space-y-1">
                          <span className="text-xs text-[#a8a8a8] uppercase font-bold">
                            Tuning & Style
                          </span>
                          <p className="text-[#cfcfcf] text-xs leading-tight">
                            {rel.explanation.tuning.explanation} {rel.explanation.style.explanation}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a] text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setExpandedRelId(isExpanded ? null : partnerId)}
                      className="text-xs text-[#a8a8a8] hover:text-[#e0e0e0] cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
                    >
                      {isExpanded ? '[-] Hide Reasoning' : '[+] Inspect Breakdown'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      {onSelectBridgeTarget && (
                        <button
                          type="button"
                          onClick={() => onSelectBridgeTarget(partnerId)}
                          className="px-2 py-1 text-xs bg-[#1a1a1a] hover:bg-[#252525] text-[#cfcfcf] hover:text-white border border-[#2e2e2e] uppercase transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
                        >
                          Find Bridge
                        </button>
                      )}

                      {onStartPathFromSong && (
                        <button
                          type="button"
                          onClick={() => onStartPathFromSong(partnerId)}
                          className="px-2 py-1 text-xs bg-[#1a1a1a] hover:bg-[#252525] text-[#cfcfcf] hover:text-white border border-[#2e2e2e] uppercase transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
                        >
                          Path from here
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAddTrack(partnerId)}
                        className="px-2.5 py-1 text-xs bg-[#1e2a1e] hover:bg-[#283828] text-[#99e099] border border-[#335533] font-semibold uppercase transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
                        data-testid={`add-to-setlist-${partnerId}`}
                      >
                        Add to Setlist
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Drawer Footer Quick Action */}
        <div className="p-3 border-t border-[#222222] bg-[#0f0f0f] flex items-center justify-between text-xs font-mono">
          <span className="text-xs text-[#a8a8a8]">
            Artist maintains full sequencing authority.
          </span>
          <div className="flex gap-2">
            {onStartPathFromSong && (
              <button
                type="button"
                onClick={() => onStartPathFromSong(song.id)}
                className="px-3 py-1.5 text-xs bg-[#1a1a1a] hover:bg-[#222222] text-[#e0e0e0] border border-[#333333] uppercase font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
              >
                Explore Paths From &quot;{song.title}&quot;
              </button>
            )}
            <button
              type="button"
              onClick={() => handleAddTrack(song.id)}
              className="px-3 py-1.5 text-xs bg-[#1a2e1a] hover:bg-[#244224] text-[#88ee88] border border-[#2d5a2d] uppercase font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
            >
              Add Current Song to Setlist
            </button>
          </div>
        </div>
      </div>
  );

  if (isDockedRail) {
    return drawerContent;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
      data-testid="song-relationship-drawer-overlay"
    >
      {drawerContent}
    </div>
  );
}
