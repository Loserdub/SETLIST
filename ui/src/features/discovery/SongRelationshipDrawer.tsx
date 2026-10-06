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
  const useMockBackend = useAppStore((s) => s.useMockBackend);
  const addToSetlist = useAppStore((s) => s.addToSetlist);
  const addToast = useAppStore((s) => s.addToast);
  const tracks = useAppStore((s) => s.tracks);
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
        return 'bg-status-success-dim text-status-success border-status-success';
      case 'Rising':
        return 'bg-surface-elevated text-status-danger border-status-danger';
      case 'Falling':
        return 'bg-accent-blue-subtle text-accent-blue border-accent-blue-subtle';
      case 'HarmonicTransition':
        return 'bg-surface-elevated text-accent-blue border-border-strong';
      case 'RhythmicTempoTransition':
        return 'bg-surface-hover text-content-secondary border-border-strong';
      case 'EnergyReset':
        return 'bg-status-success-dim text-accent-blue border-accent-blue-dim';
      case 'IntentionalContrast':
        return 'bg-surface-elevated text-status-danger border-border-base';
      case 'HardCut':
        return 'bg-surface-hover text-content-secondary border-border-strong';
      case 'PoorFit':
      default:
        return 'bg-status-danger-dim text-status-danger border-status-danger-dim';
    }
  };

  const drawerContent = (
    <div
      className={`w-full bg-surface-panel ${
        isDockedRail ? 'h-full border-none' : 'max-w-2xl border-l border-border-base h-full shadow-2xl'
      } flex flex-col text-content-primary overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
      data-testid="song-relationship-drawer"
    >
        {/* Drawer Header */}
        <div className="p-4 border-b border-border-base bg-surface-raised flex items-start justify-between">
          <div className="space-y-1 min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-content-muted uppercase">
                SONG RELATIONSHIP PROFILE
              </span>
              {song.energy_rating && (
                <span className="px-1.5 py-0.5 text-xs font-mono border border-border-strong bg-surface-elevated text-content-secondary">
                  Energy {song.energy_rating}/10
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-content-primary truncate">{song.title}</h2>
            <p className="text-xs text-content-muted font-normal truncate">{song.artist}</p>

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
                <span className="px-2 py-0.5 bg-surface-elevated border border-border-base text-content-secondary text-xs">
                  {song.bpm.toFixed(1)} BPM
                </span>
              )}
              {song.duration_seconds > 0 && (
                <span className="px-2 py-0.5 bg-surface-elevated border border-border-base text-content-muted text-xs">
                  {formatDuration(song.duration_seconds)}
                </span>
              )}
              {song.tuning && (
                <span className="px-2 py-0.5 bg-surface-elevated border border-border-base text-content-muted text-xs">
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
            className="p-1.5 text-content-muted hover:text-white hover:bg-surface-hover transition-colors rounded-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
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
        <div className="flex border-b border-border-base bg-surface-panel px-4 pt-2 gap-2 text-xs font-mono select-none">
          <button
            type="button"
            onClick={() => setActiveTab('outgoing')}
            className={`pb-2 px-3 border-b-2 font-medium tracking-wide transition-colors cursor-pointer uppercase focus:outline-none focus:ring-1 focus:ring-sky-400 ${
              activeTab === 'outgoing'
                ? 'border-content-primary text-white font-semibold'
                : 'border-transparent text-content-muted hover:text-content-secondary'
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
                ? 'border-content-primary text-white font-semibold'
                : 'border-transparent text-content-muted hover:text-content-secondary'
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
                ? 'border-content-primary text-white font-semibold'
                : 'border-transparent text-content-muted hover:text-content-secondary'
            }`}
            data-testid="tab-unusual"
          >
            Creative Contrasts ({unusualTransitions.length})
          </button>
        </div>

        {/* Tab Subtitle / Purpose Explanation */}
        <div className="px-4 py-2 bg-surface-raised border-b border-border-subtle text-xs font-mono text-content-muted flex items-center justify-between">
          <span>
            {activeTab === 'outgoing' &&
              `Outgoing transitions from "${song.title}" → Target Song in sequence.`}
            {activeTab === 'incoming' &&
              `Incoming transitions from Preceding Song → "${song.title}".`}
            {activeTab === 'unusual' &&
              'Creative opportunities: energy resets, half/double time, and harmonic lifts.'}
          </span>
          <span className="text-xs text-content-muted uppercase">
            {currentList.length} candidate{currentList.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Relationships List */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3"
          data-testid="relationship-cards-container"
        >
          {isLoading && (
            <div className="py-12 text-center text-xs font-mono text-content-muted">
              Computing multidimensional catalog relationships...
            </div>
          )}

          {!isLoading && currentList.length === 0 && (
            <div className="py-12 text-center text-xs font-mono text-content-muted">
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
                  className="bg-surface-raised border border-border-base hover:border-border-strong transition-all p-3 space-y-2.5"
                  data-testid={`relationship-card-${partnerId}`}
                >
                  {/* Card Header Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-content-primary truncate">
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
                          <span className="text-xs font-mono text-content-muted">
                            {partnerBpm.toFixed(1)} BPM
                          </span>
                        )}
                        {partnerEnergy && (
                          <span className="text-xs font-mono text-content-muted">
                            E{partnerEnergy}
                          </span>
                        )}
                      </div>

                      {/* Musical Delta Metrics */}
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono pt-1 text-content-muted">
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
                        <span className="text-content-dim">•</span>
                        <span>{rel.explanation.harmony.relation}</span>
                        {rel.explanation.energy.delta !== null && (
                          <>
                            <span className="text-content-dim">•</span>
                            <span
                              className={
                                rel.explanation.energy.movement === 'Rise'
                                  ? 'text-orange-400'
                                  : rel.explanation.energy.movement === 'Fall'
                                  ? 'text-cyan-400'
                                  : 'text-content-muted'
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
                  <p className="text-xs text-content-secondary font-normal leading-relaxed bg-surface-panel p-2 border border-border-subtle">
                    {rel.explanation.summary}
                  </p>

                  {/* Detailed Dimensional Breakdown Accordion */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-border-subtle space-y-2 text-xs font-mono animate-in fade-in duration-100">
                      <div className="grid grid-cols-2 gap-2">
                        {/* BPM Dimension */}
                        <div className="bg-surface-panel p-2 border border-border-subtle space-y-1">
                          <span className="text-xs text-content-muted uppercase font-bold">
                            BPM Dimension
                          </span>
                          <p className="text-content-secondary text-xs leading-tight">
                            {rel.explanation.bpm.explanation}
                          </p>
                          <span className="text-xs text-content-muted">
                            Friction: {Math.round(rel.explanation.bpm.friction * 100)}%
                          </span>
                        </div>

                        {/* Harmonic Dimension */}
                        <div className="bg-surface-panel p-2 border border-border-subtle space-y-1">
                          <span className="text-xs text-content-muted uppercase font-bold">
                            Harmonic Dimension
                          </span>
                          <p className="text-content-secondary text-xs leading-tight">
                            {rel.explanation.harmony.explanation}
                          </p>
                          <span className="text-xs text-content-muted">
                            Friction: {Math.round(rel.explanation.harmony.friction * 100)}%
                          </span>
                        </div>

                        {/* Energy Dimension */}
                        <div className="bg-surface-panel p-2 border border-border-subtle space-y-1">
                          <span className="text-xs text-content-muted uppercase font-bold">
                            Energy Trajectory
                          </span>
                          <p className="text-content-secondary text-xs leading-tight">
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
                        <div className="bg-surface-panel p-2 border border-border-subtle space-y-1">
                          <span className="text-xs text-content-muted uppercase font-bold">
                            Tuning & Style
                          </span>
                          <p className="text-content-secondary text-xs leading-tight">
                            {rel.explanation.tuning.explanation} {rel.explanation.style.explanation}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-1 border-t border-border-subtle text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setExpandedRelId(isExpanded ? null : partnerId)}
                      className="text-xs text-content-muted hover:text-content-primary cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
                    >
                      {isExpanded ? '[-] Hide Reasoning' : '[+] Inspect Breakdown'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      {onSelectBridgeTarget && (
                        <button
                          type="button"
                          onClick={() => onSelectBridgeTarget(partnerId)}
                          className="px-2 py-1 text-xs bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-white border border-border-base uppercase transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
                        >
                          Find Bridge
                        </button>
                      )}

                      {onStartPathFromSong && (
                        <button
                          type="button"
                          onClick={() => onStartPathFromSong(partnerId)}
                          className="px-2 py-1 text-xs bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-white border border-border-base uppercase transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
                        >
                          Path from here
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAddTrack(partnerId)}
                        className="px-2.5 py-1 text-xs bg-status-success-dim hover:bg-status-success-dim text-status-success border border-status-success font-semibold uppercase transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
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
        <div className="p-3 border-t border-border-base bg-surface-panel flex items-center justify-between text-xs font-mono">
          <span className="text-xs text-content-muted">
            Artist maintains full sequencing authority.
          </span>
          <div className="flex gap-2">
            {onStartPathFromSong && (
              <button
                type="button"
                onClick={() => onStartPathFromSong(song.id)}
                className="px-3 py-1.5 text-xs bg-surface-elevated hover:bg-surface-hover text-content-primary border border-border-strong uppercase font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
              >
                Explore Paths From &quot;{song.title}&quot;
              </button>
            )}
            <button
              type="button"
              onClick={() => handleAddTrack(song.id)}
              className="px-3 py-1.5 text-xs bg-status-success-dim hover:bg-status-success-dim text-status-success border border-status-success uppercase font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
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
