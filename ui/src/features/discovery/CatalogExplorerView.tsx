import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import type { Song } from '../../bindings/Song';
import type { SongRelationship } from '../../bindings/SongRelationship';
import type { CatalogSummaryStats } from '../../bindings/CatalogSummaryStats';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { getEnergyColor } from '../../utils/energyColor';
import { useAppStore } from '../../store/useAppStore';
import { getBackend, trackToSong } from '../../api';
import { MusicalTopologyView } from './MusicalTopologyView';
import { SongRelationshipDrawer } from './SongRelationshipDrawer';
import { BridgeDiscoveryModal } from './BridgeDiscoveryModal';
import { PathExplorerModal } from './PathExplorerModal';
import { DurationSetDiscoveryModal } from './DurationSetDiscoveryModal';
import { CatalogClustersView } from './CatalogClustersView';
import { CatalogMatrixView } from './CatalogMatrixView';
import { DEFAULT_CATALOG_FILTERS, type CatalogFilterState, type DiscoveryTab } from './types';
import { IconSearch } from '../../components/icons';

export function CatalogExplorerView() {
  const tracks = useAppStore((s) => s.tracks);
  const useMockBackend = useAppStore((s) => s.useMockBackend);
  const addToSetlist = useAppStore((s) => s.addToSetlist);
  const addToast = useAppStore((s) => s.addToast);
  const hasLoadedTracks = useAppStore((s) => s.hasLoadedTracks);
  const loadTracks = useAppStore((s) => s.loadTracks);

  const [activeTab, setActiveTab] = useState<DiscoveryTab>('catalog');
  const [filters, setFilters] = useState<CatalogFilterState>(DEFAULT_CATALOG_FILTERS);

  // Conversion of tracks to Song models
  const songs: Song[] = useMemo(() => {
    return tracks.map(trackToSong);
  }, [tracks]);

  // Catalog Summary Health Stats
  const [stats, setStats] = useState<CatalogSummaryStats | null>(null);

  // Active Modals & Drawers State
  const [inspectedSong, setInspectedSong] = useState<Song | null>(null);
  const [bridgeModalOpen, setBridgeModalOpen] = useState(false);
  const [bridgeSourceSongId, setBridgeSourceSongId] = useState<string | undefined>(undefined);
  const [bridgeTargetSongId, setBridgeTargetSongId] = useState<string | undefined>(undefined);
  const [pathModalOpen, setPathModalOpen] = useState(false);
  const [pathStartSongId, setPathStartSongId] = useState<string | undefined>(undefined);
  const [durationModalOpen, setDurationModalOpen] = useState(false);

  // Auto-load tracks if needed
  useEffect(() => {
    if (!hasLoadedTracks) {
      void loadTracks();
    }
  }, [hasLoadedTracks, loadTracks]);

  // Load summary metrics from backend
  useEffect(() => {
    if (songs.length === 0) return;

    let isMounted = true;
    const backend = getBackend(useMockBackend);

    backend
      .getCatalogSummaryStats()
      .then((res) => {
        if (!isMounted) return;
        setStats(res);
      })
      .catch(() => {
        // fail silently in mock test environments
      });

    return () => {
      isMounted = false;
    };
  }, [songs.length, useMockBackend]);

  // Filtered & Sorted Songs List
  const deferredSearchQuery = useDeferredValue(filters.searchQuery);

  const filteredSongs = useMemo(() => {
    return songs.filter((song) => {
      if (deferredSearchQuery.trim()) {
        const q = deferredSearchQuery.toLowerCase();
        const matchesTitle = song.title.toLowerCase().includes(q);
        const matchesArtist = song.artist.toLowerCase().includes(q);
        const matchesTags = song.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesArtist && !matchesTags) return false;
      }

      if (filters.selectedKey) {
        const key = song.camelot_code ?? song.musical_key;
        if (key !== filters.selectedKey) return false;
      }

      if (filters.minBpm !== null && song.bpm && song.bpm < filters.minBpm) return false;
      if (filters.maxBpm !== null && song.bpm && song.bpm > filters.maxBpm) return false;

      if (filters.minEnergy !== null && song.energy_rating && song.energy_rating < filters.minEnergy)
        return false;
      if (filters.maxEnergy !== null && song.energy_rating && song.energy_rating > filters.maxEnergy)
        return false;

      return true;
    });
  }, [songs, filters, deferredSearchQuery]);

  const handleOpenSongDrawer = (song: Song) => {
    setInspectedSong(song);
  };

  const handleOpenBridge = (sourceId?: string, targetId?: string) => {
    setBridgeSourceSongId(sourceId);
    setBridgeTargetSongId(targetId);
    setBridgeModalOpen(true);
  };

  const handleOpenPath = (startId?: string) => {
    setPathStartSongId(startId);
    setPathModalOpen(true);
  };

  const handleInspectRelationshipFromMatrix = (rel: SongRelationship) => {
    const fromSong = songs.find((s) => s.id === rel.from_song_id);
    if (fromSong) {
      setInspectedSong(fromSong);
    }
  };

  const handleAddToSetlist = async (songId: string) => {
    await addToSetlist(songId);
    addToast({
      type: 'success',
      message: 'Added track to active setlist',
    });
  };

  const formatDuration = (secs: number): string => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      className="flex-1 flex flex-col h-full bg-surface-deep text-content-primary overflow-hidden select-none"
      data-testid="catalog-explorer-view"
    >
      {/* Top Header & Health Metrics Banner */}
      <div className="p-4 border-b border-border-subtle bg-surface-panel space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-mono font-bold tracking-wider text-white uppercase">
                CATALOG EXPLORER &amp; SET DISCOVERY
              </h1>
              <span className="px-1.5 py-0.5 text-xs font-mono bg-surface-elevated text-content-muted border border-border-base uppercase">
                Relational Intelligence Layer
              </span>
            </div>
            <p className="text-xs text-content-muted font-normal pt-0.5">
              Discover which songs naturally connect, bridge disparate genres, or build cohesive
              sets.
            </p>
          </div>

          {/* Quick Discovery Actions */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <button
              type="button"
              onClick={() => handleOpenBridge()}
              className="px-3 py-1.5 bg-surface-raised hover:bg-surface-elevated text-content-secondary hover:text-white border border-border-base uppercase transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none hw-btn"
              data-testid="btn-find-bridges"
            >
              [Find Bridges]
            </button>
            <button
              type="button"
              onClick={() => handleOpenPath()}
              className="px-3 py-1.5 bg-surface-raised hover:bg-surface-elevated text-content-secondary hover:text-white border border-border-base uppercase transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none hw-btn"
              data-testid="btn-build-path"
            >
              [Build Path]
            </button>
            <button
              type="button"
              onClick={() => setDurationModalOpen(true)}
              className="px-3 py-1.5 bg-surface-raised hover:bg-surface-elevated text-content-secondary hover:text-white border border-border-base uppercase transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none hw-btn"
              data-testid="btn-duration-sets"
            >
              [Discover Sets by Duration]
            </button>
          </div>
        </div>

        {/* Catalog Health Statistics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs font-mono">
          <div className="bg-surface-raised p-2 border border-border-subtle">
            <span className="text-xs text-content-muted uppercase block">TOTAL CATALOG</span>
            <span className="text-sm font-bold text-content-primary">{songs.length} Tracks</span>
          </div>
          <div className="bg-surface-raised p-2 border border-border-subtle">
            <span className="text-xs text-content-muted uppercase block">STRONG CONNECTIONS</span>
            <span className="text-sm font-bold text-emerald-400">
              {stats ? `${stats.strong_transitions_count}` : '—'} Pairings
            </span>
          </div>
          <div className="bg-surface-raised p-2 border border-border-subtle">
            <span className="text-xs text-content-muted uppercase block">NATURAL CLUSTERS</span>
            <span className="text-sm font-bold text-teal-300">
              {stats ? `${stats.cluster_count} Groups` : '—'}
            </span>
          </div>
          <div className="bg-surface-raised p-2 border border-border-subtle">
            <span className="text-xs text-content-muted uppercase block">AVG COMPATIBILITY</span>
            <span className="text-sm font-bold text-amber-300">
              {stats ? `${Math.round(stats.average_compatibility * 100)}%` : '—'}
            </span>
          </div>
          <div className="bg-surface-raised p-2 border border-border-subtle">
            <span className="text-xs text-content-muted uppercase block">CATALOG OUTLIERS</span>
            <span className="text-sm font-bold text-status-danger">
              {stats ? `${stats.outlier_count} Tracks` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Discovery Navigation Tabs */}
      <div className="flex border-b border-border-subtle bg-surface-panel px-4 gap-2 text-xs font-mono">
        <button
          type="button"
          onClick={() => setActiveTab('topology')}
          className={`py-2 px-3 border-b-2 font-medium tracking-wide uppercase transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
            activeTab === 'topology'
              ? 'border-accent-blue text-white font-semibold'
              : 'border-transparent text-content-muted hover:text-content-secondary'
          }`}
          data-testid="tab-topology"
        >
          Musical Topology
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`py-2 px-3 border-b-2 font-medium tracking-wide uppercase transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
            activeTab === 'catalog'
              ? 'border-accent-blue text-white font-semibold'
              : 'border-transparent text-content-muted hover:text-content-secondary'
          }`}
          data-testid="tab-catalog-songs"
        >
          Catalog Tracks ({filteredSongs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('clusters')}
          className={`py-2 px-3 border-b-2 font-medium tracking-wide uppercase transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
            activeTab === 'clusters'
              ? 'border-accent-blue text-white font-semibold'
              : 'border-transparent text-content-muted hover:text-content-secondary'
          }`}
          data-testid="tab-clusters"
        >
          Clusters &amp; Outliers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          className={`py-2 px-3 border-b-2 font-medium tracking-wide uppercase transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
            activeTab === 'matrix'
              ? 'border-accent-blue text-white font-semibold'
              : 'border-transparent text-content-muted hover:text-content-secondary'
          }`}
          data-testid="tab-matrix"
        >
          Relational Matrix
        </button>
      </div>

      {/* Main Tab Views & Side-by-Side Split Rail */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {activeTab === 'topology' && (
          <MusicalTopologyView
            songs={songs}
            initialAnchorSongId={inspectedSong?.id}
            onOpenBridgeModal={(sourceId, targetId) => handleOpenBridge(sourceId, targetId)}
            onOpenPathModal={(startId) => handleOpenPath(startId)}
          />
        )}

        {activeTab !== 'topology' && (
          <div className="flex-1 overflow-y-auto p-4 min-w-0">
          {activeTab === 'catalog' && (
          <div className="space-y-4">
            {/* Search & Filter Bar */}
            <div className="p-3 bg-surface-raised border border-border-base flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 flex-1 min-w-[240px] bg-surface-panel border border-border-base px-2 py-1.5 focus-within:ring-1 focus-within:ring-accent-blue focus-within:border-accent-blue">
                <IconSearch size={14} className="text-content-muted shrink-0" />
                <input
                  type="text"
                  placeholder="Search catalog by title, artist, tags..."
                  value={filters.searchQuery}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
                  }
                  className="w-full bg-transparent text-xs text-white outline-none"
                  data-testid="catalog-search-input"
                />
              </div>

              {/* Camelot Key Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-content-muted uppercase">KEY:</span>
                <select
                  aria-label="Filter catalog by Camelot key"
                  value={filters.selectedKey ?? ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      selectedKey: e.target.value || null,
                    }))
                  }
                  className="bg-surface-panel border border-border-base p-1.5 text-xs text-content-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:border-accent-blue cursor-pointer"
                >
                  <option value="">(All Keys)</option>
                  {[
                    '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B', '5A', '5B', '6A', '6B',
                    '7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B',
                  ].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>

                {(filters.searchQuery || filters.selectedKey) && (
                  <button
                    type="button"
                    onClick={() => setFilters(DEFAULT_CATALOG_FILTERS)}
                    className="text-xs text-content-secondary hover:text-white uppercase cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                  >
                    [Reset Filters]
                  </button>
                )}
              </div>
            </div>

            {/* Catalog Songs Table */}
            {filteredSongs.length === 0 ? (
              <div className="py-16 text-center text-xs font-mono text-content-muted">
                No songs match the current discovery filters.
              </div>
            ) : (
              <div className="border border-border-subtle bg-surface-panel overflow-x-auto">
                <table className="w-full border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border-base bg-surface-raised text-xs text-content-muted uppercase text-left">
                      <th className="p-2.5 min-w-[200px]">TITLE / ARTIST</th>
                      <th className="p-2.5 w-20">KEY</th>
                      <th className="p-2.5 w-24">BPM</th>
                      <th className="p-2.5 w-28">ENERGY</th>
                      <th className="p-2.5 w-20">DURATION</th>
                      <th className="p-2.5 min-w-[140px]">TUNING / STYLE</th>
                      <th className="p-2.5 text-right min-w-[180px]">ACTIONS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredSongs.map((song) => {
                      return (
                        <tr
                          key={song.id}
                          role="row"
                          tabIndex={0}
                          className="border-b border-border-subtle hover:bg-surface-raised transition-colors focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
                          data-testid={`catalog-row-${song.id}`}
                        >
                          {/* Title & Artist */}
                          <td className="p-2.5 font-sans">
                            <div className="font-semibold text-content-primary text-xs truncate max-w-xs">
                              {song.title}
                            </div>
                            <div className="text-xs text-content-muted truncate">{song.artist}</div>
                          </td>

                          {/* Camelot Key */}
                          <td className="p-2.5">
                            {song.camelot_code ? (
                              <span
                                className="px-1.5 py-0.5 font-mono font-bold text-xs rounded-[2px]"
                                style={{
                                  backgroundColor: camelotColor(song.camelot_code),
                                  color: camelotTextColor(song.camelot_code),
                                }}
                              >
                                {song.camelot_code}
                              </span>
                            ) : (
                              <span className="text-content-muted">—</span>
                            )}
                          </td>

                          {/* BPM */}
                          <td className="p-2.5 font-mono text-content-secondary tabular-nums">
                            {song.bpm ? `${song.bpm.toFixed(1)}` : '—'}
                          </td>

                          {/* Energy */}
                          <td className="p-2.5">
                            {song.energy_rating ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-content-muted w-3">
                                  {song.energy_rating}
                                </span>
                                <div className="w-12 bg-surface-elevated h-1 overflow-hidden">
                                  <div
                                    className="h-full"
                                    style={{
                                      width: `${song.energy_rating * 10}%`,
                                      backgroundColor: getEnergyColor(song.energy_rating),
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-content-muted">—</span>
                            )}
                          </td>

                          {/* Duration */}
                          <td className="p-2.5 text-content-muted tabular-nums">
                            {formatDuration(song.duration_seconds)}
                          </td>

                          {/* Tuning & Tags */}
                          <td className="p-2.5 text-xs text-content-muted truncate max-w-xs">
                            {song.tuning ?? 'Standard'}
                            {song.tags.length > 0 && ` • ${song.tags.slice(0, 2).join(', ')}`}
                          </td>

                          {/* Actions */}
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenSongDrawer(song)}
                                className="px-2 py-1 text-xs bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-white border border-border-base uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
                                data-testid={`inspect-rel-btn-${song.id}`}
                              >
                                Relationships
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenBridge(song.id)}
                                className="px-2 py-1 text-xs bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-white border border-border-base uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
                                title="Set as Source Song A for Bridge Discovery"
                              >
                                Bridge
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddToSetlist(song.id)}
                                className="px-2 py-1 text-xs bg-status-success-dim hover:bg-status-success-dim text-status-success border border-status-success uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
                                data-testid={`add-to-setlist-${song.id}`}
                              >
                                + Set
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'clusters' && (
          <CatalogClustersView
            songs={songs}
            onSelectSong={handleOpenSongDrawer}
            onFilterByCluster={(clusterId) => {
              setFilters((prev) => ({ ...prev, selectedClusterId: clusterId }));
              setActiveTab('catalog');
            }}
          />
        )}

        {activeTab === 'matrix' && (
          <CatalogMatrixView
            songs={songs}
            onSelectSong={handleOpenSongDrawer}
            onInspectRelationship={handleInspectRelationshipFromMatrix}
          />
        )}
        </div>
        )}
        {activeTab !== 'topology' && inspectedSong && (
          <aside
            className="w-[440px] xl:w-[500px] border-l border-border-base bg-surface-panel flex flex-col shrink-0 h-full overflow-hidden shadow-2xl transition-all"
            aria-label="Song Relationship Inspector Rail"
          >
            <SongRelationshipDrawer
              song={inspectedSong}
              isDockedRail={true}
              onClose={() => setInspectedSong(null)}
              onSelectBridgeTarget={(targetId) => {
                setInspectedSong(null);
                handleOpenBridge(inspectedSong.id, targetId);
              }}
              onStartPathFromSong={(startId) => {
                setInspectedSong(null);
                handleOpenPath(startId);
              }}
            />
          </aside>
        )}
      </div>

      {bridgeModalOpen && (
        <BridgeDiscoveryModal
          songs={songs}
          initialSongAId={bridgeSourceSongId}
          initialSongBId={bridgeTargetSongId}
          onClose={() => setBridgeModalOpen(false)}
        />
      )}

      {pathModalOpen && (
        <PathExplorerModal
          songs={songs}
          initialStartSongId={pathStartSongId}
          onClose={() => setPathModalOpen(false)}
        />
      )}

      {durationModalOpen && (
        <DurationSetDiscoveryModal songs={songs} onClose={() => setDurationModalOpen(false)} />
      )}
    </div>
  );
}
