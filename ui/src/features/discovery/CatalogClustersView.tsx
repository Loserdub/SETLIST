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
  const useMockBackend = useAppStore((s) => s.useMockBackend);
  const addToast = useAppStore((s) => s.addToast);
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
        <div className="py-12 text-center text-xs font-mono text-content-muted">
          Analyzing catalog cluster structure and outlier songs...
        </div>
      )}

      {/* Section 1: Natural Song Clusters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white font-sans">Natural Song Clusters</h3>
            <p className="text-xs font-mono text-content-muted">
              Groups of songs with mutual high harmonic, tempo, and energy cohesion.
            </p>
          </div>
          <span className="text-xs font-mono text-content-muted">
            {clusters.length} Cluster{clusters.length === 1 ? '' : 's'} Identified
          </span>
        </div>

        {clusters.length === 0 && !isLoading && (
          <div className="p-6 bg-surface-raised border border-border-base text-center text-xs font-mono text-content-muted">
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
                className="bg-surface-raised border border-border-base hover:border-border-strong p-3.5 space-y-3 transition-all"
                data-testid={`cluster-card-${cluster.id}`}
              >
                {/* Cluster Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-white truncate">{cluster.label}</h4>
                    <p className="text-xs font-mono text-content-muted pt-0.5">
                      {cluster.description}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-status-success-dim text-status-success border border-status-success shrink-0">
                    {Math.round(cluster.cohesion_score * 100)}% Cohesion
                  </span>
                </div>

                {/* Cluster Key & Tempo Badges */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                  {cluster.center_bpm && (
                    <span className="px-2 py-0.5 bg-surface-elevated border border-border-base text-content-secondary">
                      ~{cluster.center_bpm.toFixed(1)} BPM
                    </span>
                  )}
                  {cluster.average_energy && (
                    <span className="px-2 py-0.5 bg-surface-elevated border border-border-base text-content-muted">
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
                <div className="space-y-1 pt-1 border-t border-border-subtle">
                  <span className="text-xs font-mono text-content-muted uppercase font-bold block">
                    MEMBER TRACKS ({memberSongs.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {memberSongs.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSelectSong(s)}
                        className="px-2 py-1 bg-surface-elevated hover:bg-surface-hover border border-border-base hover:border-border-strong text-xs font-mono text-content-secondary hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
                      >
                        <span>{s.title}</span>
                        {s.camelot_code && (
                          <span className="text-xs text-content-muted">({s.camelot_code})</span>
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
                      className="text-xs font-mono text-content-muted hover:text-white uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
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
      <div className="space-y-3 pt-4 border-t border-border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white font-sans">
              Low-Connection Songs / Catalog Outliers
            </h3>
            <p className="text-xs font-mono text-content-muted">
              Songs with few strong connections in the catalog. Framed as creative contrast
              opportunities.
            </p>
          </div>
          <span className="text-xs font-mono text-content-muted">
            {outliers.length} Outlier{outliers.length === 1 ? '' : 's'}
          </span>
        </div>

        {outliers.length === 0 && !isLoading && (
          <div className="p-6 bg-surface-raised border border-border-base text-center text-xs font-mono text-status-success">
            ✓ All catalog songs have healthy connections across the library.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {outliers.map((outlier) => {
            const fullSong = songs.find((s) => s.id === outlier.song_id);

            return (
              <div
                key={outlier.song_id}
                className="bg-surface-raised border border-border-base hover:border-border-strong p-3.5 space-y-2.5 transition-all"
                data-testid={`outlier-card-${outlier.song_id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-white">{outlier.title}</h4>
                    <p className="text-xs text-content-muted">{outlier.artist}</p>
                  </div>

                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-status-danger-dim text-status-danger border border-border-base">
                    Max Match: {Math.round(outlier.max_compatibility_score * 100)}%
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-content-muted">
                  {outlier.camelot_code && (
                    <span
                      className="px-1.5 py-0.2 text-xs font-bold rounded-[2px]"
                      style={{
                        backgroundColor: camelotColor(outlier.camelot_code),
                        color: camelotTextColor(outlier.camelot_code),
                      }}
                    >
                      {outlier.camelot_code}
                    </span>
                  )}
                  {outlier.bpm && <span className="text-content-secondary">{outlier.bpm.toFixed(1)} BPM</span>}
                  {outlier.energy_rating && <span>Energy {outlier.energy_rating}/10</span>}
                  <span>•</span>
                  <span>{outlier.strong_connection_count} strong connections</span>
                </div>

                {/* Reasons List */}
                <div className="bg-surface-panel p-2 border border-border-subtle space-y-1">
                  <span className="text-xs font-mono text-content-muted uppercase font-bold block">
                    OUTLIER DIAGNOSTICS &amp; REASONING:
                  </span>
                  <ul className="text-xs font-mono text-content-secondary space-y-0.5 list-disc list-inside">
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
                      className="px-2.5 py-1 text-xs font-mono bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-white border border-border-strong uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
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
