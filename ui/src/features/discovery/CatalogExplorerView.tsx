import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import type { Song } from '../../bindings/Song';
import type { SongRelationship } from '../../bindings/SongRelationship';
import type { CatalogSummaryStats } from '../../bindings/CatalogSummaryStats';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { useAppStore } from '../../store/useAppStore';
import { getBackend, trackToSong } from '../../api';
import { SongRelationshipDrawer } from './SongRelationshipDrawer';
import { BridgeDiscoveryModal } from './BridgeDiscoveryModal';
import { PathExplorerModal } from './PathExplorerModal';
import { DurationSetDiscoveryModal } from './DurationSetDiscoveryModal';
import { CatalogClustersView } from './CatalogClustersView';
import { CatalogMatrixView } from './CatalogMatrixView';
import { DEFAULT_CATALOG_FILTERS, type CatalogFilterState, type DiscoveryTab } from './types';
import { IconSearch } from '../../components/icons';

export function CatalogExplorerView() {
  const { tracks, useMockBackend, addToSetlist, addToast, hasLoadedTracks, loadTracks } =
    useAppStore();

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
      className="flex-1 flex flex-col h-full bg-[#080808] text-[#e2e2e2] overflow-hidden select-none"
      data-testid="catalog-explorer-view"
    >
      {/* Top Header & Health Metrics Banner */}
      <div className="p-4 border-b border-[#1c1c1c] bg-[#0c0c0c] space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-mono font-bold tracking-wider text-white uppercase">
                CATALOG EXPLORER &amp; SET DISCOVERY
              </h1>
              <span className="px-1.5 py-0.5 text-xs font-mono bg-[#1a1a1a] text-[#a8a8a8] border border-[#2a2a2a] uppercase">
                Relational Intelligence Layer
              </span>
            </div>
            <p className="text-xs text-[#a8a8a8] font-normal pt-0.5">
              Discover which songs naturally connect, bridge disparate genres, or build cohesive
              sets.
            </p>
          </div>

          {/* Quick Discovery Actions */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <button
              type="button"
              onClick={() => handleOpenBridge()}
              className="px-3 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] text-[#cfcfcf] hover:text-white border border-[#2c2c2c] uppercase transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
              data-testid="btn-find-bridges"
            >
              [Find Bridges]
            </button>
            <button
              type="button"
              onClick={() => handleOpenPath()}
              className="px-3 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] text-[#cfcfcf] hover:text-white border border-[#2c2c2c] uppercase transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
              data-testid="btn-build-path"
            >
              [Build Path]
            </button>
            <button
              type="button"
              onClick={() => setDurationModalOpen(true)}
              className="px-3 py-1.5 bg-[#1a2d1a] hover:bg-[#244224] text-[#88ee88] border border-[#2d5a2d] font-semibold uppercase transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
              data-testid="btn-duration-sets"
            >
              [Discover Sets by Duration]
            </button>
          </div>
        </div>

        {/* Catalog Health Statistics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs font-mono">
          <div className="bg-[#121212] p-2 border border-[#1e1e1e]">
            <span className="text-xs text-[#a8a8a8] uppercase block">TOTAL CATALOG</span>
            <span className="text-sm font-bold text-[#e0e0e0]">{songs.length} Tracks</span>
          </div>
          <div className="bg-[#121212] p-2 border border-[#1e1e1e]">
            <span className="text-xs text-[#a8a8a8] uppercase block">STRONG CONNECTIONS</span>
            <span className="text-sm font-bold text-emerald-400">
              {stats ? `${stats.strong_transitions_count}` : '—'} Pairings
            </span>
          </div>
          <div className="bg-[#121212] p-2 border border-[#1e1e1e]">
            <span className="text-xs text-[#a8a8a8] uppercase block">NATURAL CLUSTERS</span>
            <span className="text-sm font-bold text-teal-300">
              {stats ? `${stats.cluster_count} Groups` : '—'}
            </span>
          </div>
          <div className="bg-[#121212] p-2 border border-[#1e1e1e]">
            <span className="text-xs text-[#a8a8a8] uppercase block">AVG COMPATIBILITY</span>
            <span className="text-sm font-bold text-amber-300">
              {stats ? `${Math.round(stats.average_compatibility * 100)}%` : '—'}
            </span>
          </div>
          <div className="bg-[#121212] p-2 border border-[#1e1e1e]">
            <span className="text-xs text-[#a8a8a8] uppercase block">CATALOG OUTLIERS</span>
            <span className="text-sm font-bold text-[#e09999]">
              {stats ? `${stats.outlier_count} Tracks` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Discovery Navigation Tabs */}
      <div className="flex border-b border-[#1c1c1c] bg-[#0c0c0c] px-4 gap-2 text-xs font-mono">
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`py-2 px-3 border-b-2 font-medium tracking-wide uppercase transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400 ${
            activeTab === 'catalog'
              ? 'border-[#e0e0e0] text-white font-semibold'
              : 'border-transparent text-[#a8a8a8] hover:text-[#cccccc]'
          }`}
          data-testid="tab-catalog-songs"
        >
          Catalog Tracks ({filteredSongs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('clusters')}
          className={`py-2 px-3 border-b-2 font-medium tracking-wide uppercase transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400 ${
            activeTab === 'clusters'
              ? 'border-[#e0e0e0] text-white font-semibold'
              : 'border-transparent text-[#a8a8a8] hover:text-[#cccccc]'
          }`}
          data-testid="tab-clusters"
        >
          Clusters &amp; Outliers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          className={`py-2 px-3 border-b-2 font-medium tracking-wide uppercase transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400 ${
            activeTab === 'matrix'
              ? 'border-[#e0e0e0] text-white font-semibold'
              : 'border-transparent text-[#a8a8a8] hover:text-[#cccccc]'
          }`}
          data-testid="tab-matrix"
        >
          Relational Matrix
        </button>
      </div>

      {/* Main Tab Views & Side-by-Side Split Rail */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-4 min-w-0">
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            {/* Search & Filter Bar */}
            <div className="p-3 bg-[#111111] border border-[#222222] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 flex-1 min-w-[240px] bg-[#0a0a0a] border border-[#2a2a2a] px-2 py-1.5 focus-within:ring-1 focus-within:ring-[#38bdf8] focus-within:border-[#38bdf8]">
                <IconSearch size={14} className="text-[#71717a] shrink-0" />
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
                <span className="text-xs text-[#a8a8a8] uppercase">KEY:</span>
                <select
                  aria-label="Filter catalog by Camelot key"
                  value={filters.selectedKey ?? ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      selectedKey: e.target.value || null,
                    }))
                  }
                  className="bg-[#0a0a0a] border border-[#2a2a2a] p-1.5 text-xs text-[#cfcfcf] outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:border-[#38bdf8] cursor-pointer"
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
                    className="text-xs text-[#cfcfcf] hover:text-white uppercase cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
                  >
                    [Reset Filters]
                  </button>
                )}
              </div>
            </div>

            {/* Catalog Songs Table */}
            {filteredSongs.length === 0 ? (
              <div className="py-16 text-center text-xs font-mono text-[#a8a8a8]">
                No songs match the current discovery filters.
              </div>
            ) : (
              <div className="border border-[#1f1f1f] bg-[#0a0a0a] overflow-x-auto">
                <table className="w-full border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#222222] bg-[#111111] text-xs text-[#a8a8a8] uppercase text-left">
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
                          className="border-b border-[#141414] hover:bg-[#121212] transition-colors focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                          data-testid={`catalog-row-${song.id}`}
                        >
                          {/* Title & Artist */}
                          <td className="p-2.5 font-sans">
                            <div className="font-semibold text-[#f0f0f0] text-xs truncate max-w-xs">
                              {song.title}
                            </div>
                            <div className="text-xs text-[#a8a8a8] truncate">{song.artist}</div>
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
                              <span className="text-[#a8a8a8]">—</span>
                            )}
                          </td>

                          {/* BPM */}
                          <td className="p-2.5 font-mono text-[#cfcfcf] tabular-nums">
                            {song.bpm ? `${song.bpm.toFixed(1)}` : '—'}
                          </td>

                          {/* Energy */}
                          <td className="p-2.5">
                            {song.energy_rating ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-[#a8a8a8] w-3">
                                  {song.energy_rating}
                                </span>
                                <div className="w-12 bg-[#1c1c1c] h-1 overflow-hidden">
                                  <div
                                    className="h-full"
                                    style={{
                                      width: `${song.energy_rating * 10}%`,
                                      backgroundColor:
                                        song.energy_rating >= 8
                                          ? '#e11d48'
                                          : song.energy_rating >= 5
                                          ? '#d97706'
                                          : '#059669',
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-[#a8a8a8]">—</span>
                            )}
                          </td>

                          {/* Duration */}
                          <td className="p-2.5 text-[#a8a8a8] tabular-nums">
                            {formatDuration(song.duration_seconds)}
                          </td>

                          {/* Tuning & Tags */}
                          <td className="p-2.5 text-xs text-[#a8a8a8] truncate max-w-xs">
                            {song.tuning ?? 'Standard'}
                            {song.tags.length > 0 && ` • ${song.tags.slice(0, 2).join(', ')}`}
                          </td>

                          {/* Actions */}
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenSongDrawer(song)}
                                className="px-2 py-1 text-xs bg-[#1a1a1a] hover:bg-[#262626] text-[#cfcfcf] hover:text-white border border-[#2e2e2e] uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                                data-testid={`inspect-rel-btn-${song.id}`}
                              >
                                Relationships
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenBridge(song.id)}
                                className="px-2 py-1 text-xs bg-[#1a1a1a] hover:bg-[#262626] text-[#cfcfcf] hover:text-white border border-[#2e2e2e] uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                                title="Set as Source Song A for Bridge Discovery"
                              >
                                Bridge
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddToSetlist(song.id)}
                                className="px-2 py-1 text-xs bg-[#1e2a1e] hover:bg-[#263826] text-[#88ee88] border border-[#2d552d] uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
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
        {inspectedSong && (
          <aside
            className="w-[440px] xl:w-[500px] border-l border-[#242424] bg-[#0c0c0c] flex flex-col shrink-0 h-full overflow-hidden shadow-2xl transition-all"
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
