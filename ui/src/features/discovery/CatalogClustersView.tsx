import { useState, useEffect } from 'react';
import type { Song } from '../../bindings/Song';
import type { CatalogCluster } from '../../bindings/CatalogCluster';
import type { CatalogOutlier } from '../../bindings/CatalogOutlier';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { useAppStore } from '../../store/useAppStore';
import { getBackend } from '../../api';

interface CatalogClustersViewProps {
  songs: Song[];
  onSelectSong: (song: Song) => void;
  onFilterByCluster?: (clusterId: string) => void;
}

export function CatalogClustersView({
  songs,
  onSelectSong,
  onFilterByCluster,
}: CatalogClustersViewProps) {
  const { useMockBackend, addToast } = useAppStore();
  const [clusters, setClusters] = useState<CatalogCluster[]>([]);
  const [outliers, setOutliers] = useState<CatalogOutlier[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    const backend = getBackend(useMockBackend);

    Promise.all([backend.getCatalogClusters(), backend.getCatalogOutliers()])
      .then(([clusterRes, outlierRes]) => {
        if (!isMounted) return;
        setClusters(clusterRes);
        setOutliers(outlierRes);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setIsLoading(false);
        addToast({
          type: 'error',
          message: 'Failed to load catalog clusters and outliers',
          details: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      isMounted = false;
    };
  }, [useMockBackend, addToast]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150" data-testid="catalog-clusters-view">
      {isLoading && (
        <div className="py-12 text-center text-xs font-mono text-[#a8a8a8]">
          Analyzing catalog cluster structure and outlier songs...
        </div>
      )}

      {/* Section 1: Natural Song Clusters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white font-sans">Natural Song Clusters</h3>
            <p className="text-xs font-mono text-[#a8a8a8]">
              Groups of songs with mutual high harmonic, tempo, and energy cohesion.
            </p>
          </div>
          <span className="text-xs font-mono text-[#a8a8a8]">
            {clusters.length} Cluster{clusters.length === 1 ? '' : 's'} Identified
          </span>
        </div>

        {clusters.length === 0 && !isLoading && (
          <div className="p-6 bg-[#111111] border border-[#222222] text-center text-xs font-mono text-[#a8a8a8]">
            No cohesive clusters found in the current catalog. Add more analyzed tracks.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {clusters.map((cluster) => {
            const memberSongs = cluster.song_ids
              .map((id) => songs.find((s) => s.id === id))
              .filter(Boolean) as Song[];

            return (
              <div
                key={cluster.id}
                className="bg-[#121212] border border-[#242424] hover:border-[#3a3a3a] p-3.5 space-y-3 transition-all"
                data-testid={`cluster-card-${cluster.id}`}
              >
                {/* Cluster Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-white truncate">{cluster.label}</h4>
                    <p className="text-xs font-mono text-[#a8a8a8] pt-0.5">
                      {cluster.description}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-[#1a281a] text-[#88ee88] border border-[#2b4d2b] shrink-0">
                    {Math.round(cluster.cohesion_score * 100)}% Cohesion
                  </span>
                </div>

                {/* Cluster Key & Tempo Badges */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                  {cluster.center_bpm && (
                    <span className="px-2 py-0.5 bg-[#181818] border border-[#2a2a2a] text-[#cfcfcf]">
                      ~{cluster.center_bpm.toFixed(1)} BPM
                    </span>
                  )}
                  {cluster.average_energy && (
                    <span className="px-2 py-0.5 bg-[#181818] border border-[#2a2a2a] text-[#a8a8a8]">
                      Avg Energy {cluster.average_energy.toFixed(1)}
                    </span>
                  )}
                  {cluster.camelot_keys.map((key) => (
                    <span
                      key={key}
                      className="px-1.5 py-0.2 text-xs font-bold rounded-[2px]"
                      style={{
                        backgroundColor: camelotColor(key),
                        color: camelotTextColor(key),
                      }}
                    >
                      {key}
                    </span>
                  ))}
                </div>

                {/* Member Songs Chips */}
                <div className="space-y-1 pt-1 border-t border-[#1c1c1c]">
                  <span className="text-xs font-mono text-[#a8a8a8] uppercase font-bold block">
                    MEMBER TRACKS ({memberSongs.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {memberSongs.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSelectSong(s)}
                        className="px-2 py-1 bg-[#181818] hover:bg-[#242424] border border-[#2a2a2a] hover:border-[#444444] text-xs font-mono text-[#cfcfcf] hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                      >
                        <span>{s.title}</span>
                        {s.camelot_code && (
                          <span className="text-xs text-[#a8a8a8]">({s.camelot_code})</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter Link */}
                {onFilterByCluster && (
                  <div className="pt-1 text-right">
                    <button
                      type="button"
                      onClick={() => onFilterByCluster(cluster.id)}
                      className="text-xs font-mono text-[#a8a8a8] hover:text-white uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                    >
                      [Filter Catalog to this Cluster →]
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Catalog Outliers / Low-Connection Songs */}
      <div className="space-y-3 pt-4 border-t border-[#1f1f1f]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white font-sans">
              Low-Connection Songs / Catalog Outliers
            </h3>
            <p className="text-xs font-mono text-[#a8a8a8]">
              Songs with few strong connections in the catalog. Framed as creative contrast
              opportunities.
            </p>
          </div>
          <span className="text-xs font-mono text-[#a8a8a8]">
            {outliers.length} Outlier{outliers.length === 1 ? '' : 's'}
          </span>
        </div>

        {outliers.length === 0 && !isLoading && (
          <div className="p-6 bg-[#111111] border border-[#222222] text-center text-xs font-mono text-[#88ee88]">
            ✓ All catalog songs have healthy connections across the library.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {outliers.map((outlier) => {
            const fullSong = songs.find((s) => s.id === outlier.song_id);
            const displayTitle =
              (fullSong?.title && fullSong.title !== 'Unknown Title' ? fullSong.title : outlier.title) ||
              'Unknown Title';
            const displayArtist =
              (fullSong?.artist && fullSong.artist !== 'Unknown Artist' ? fullSong.artist : outlier.artist) ||
              'Unknown Artist';
            const displayCamelot = outlier.camelot_code || fullSong?.camelot_code || fullSong?.musical_key;
            const displayBpm = outlier.bpm ?? fullSong?.bpm;
            const displayEnergy = outlier.energy_rating ?? fullSong?.energy_rating;

            return (
              <div
                key={outlier.song_id}
                className="bg-[#121212] border border-[#242424] hover:border-[#3a3a3a] p-3.5 space-y-2.5 transition-all"
                data-testid={`outlier-card-${outlier.song_id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-white">{displayTitle}</h4>
                    <p className="text-xs text-[#a8a8a8]">{displayArtist}</p>
                  </div>

                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-[#261515] text-[#ee8888] border border-[#4d2626]">
                    Max Match: {Math.round(outlier.max_compatibility_score * 100)}%
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-[#a8a8a8]">
                  {displayCamelot && (
                    <span
                      className="px-1.5 py-0.2 text-xs font-bold rounded-[2px]"
                      style={{
                        backgroundColor: camelotColor(displayCamelot),
                        color: camelotTextColor(displayCamelot),
                      }}
                    >
                      {displayCamelot}
                    </span>
                  )}
                  {displayBpm && <span className="text-[#cfcfcf]">{displayBpm.toFixed(1)} BPM</span>}
                  {displayEnergy && <span>Energy {displayEnergy}/10</span>}
                  <span>•</span>
                  <span>{outlier.strong_connection_count} strong connections</span>
                </div>

                {/* Reasons List */}
                <div className="bg-[#0b0b0b] p-2 border border-[#1a1a1a] space-y-1">
                  <span className="text-xs font-mono text-[#a8a8a8] uppercase font-bold block">
                    OUTLIER DIAGNOSTICS &amp; REASONING:
                  </span>
                  <ul className="text-xs font-mono text-[#cfcfcf] space-y-0.5 list-disc list-inside">
                    {outlier.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                {fullSong && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onSelectSong(fullSong)}
                      className="px-2.5 py-1 text-xs font-mono bg-[#1a1a1a] hover:bg-[#252525] text-[#cfcfcf] hover:text-white border border-[#333333] uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
                    >
                      Inspect Relationships →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
