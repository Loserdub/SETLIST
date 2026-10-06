import { useState, useMemo } from 'react';
import type { Song } from '../../bindings/Song';
import type { SongRelationship } from '../../bindings/SongRelationship';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { evaluateMockSongRelationship } from '../../api';

interface CatalogMatrixViewProps {
  songs: Song[];
  onSelectSong: (song: Song) => void;
  onInspectRelationship: (rel: SongRelationship) => void;
}

export function CatalogMatrixView({
  songs,
  onSelectSong,
  onInspectRelationship,
}: CatalogMatrixViewProps) {
  const [hoveredPair, setHoveredPair] = useState<{
    from: Song;
    to: Song;
    rel: SongRelationship;
  } | null>(null);

  // Limit matrix to 20 tracks for responsive UI rendering if library is large
  const displaySongs = useMemo(() => songs.slice(0, 20), [songs]);

  // Compute pairwise matrix
  const matrix = useMemo(() => {
    const grid: Record<string, Record<string, SongRelationship>> = {};
    for (const from of displaySongs) {
      grid[from.id] = {};
      for (const to of displaySongs) {
        if (from.id === to.id) continue;
        grid[from.id][to.id] = evaluateMockSongRelationship(from, to);
      }
    }
    return grid;
  }, [displaySongs]);

  const getCellColor = (score: number) => {
    if (score >= 0.85) return 'bg-emerald-500/90 text-black font-bold';
    if (score >= 0.7) return 'bg-teal-600/80 text-white';
    if (score >= 0.5) return 'bg-amber-600/70 text-white';
    if (score >= 0.3) return 'bg-orange-700/60 text-white';
    return 'bg-rose-900/60 text-status-danger';
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150" data-testid="catalog-matrix-view">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white font-sans">
            Catalog Relationship Matrix
          </h3>
          <p className="text-xs font-mono text-content-muted">
            Row (Outgoing / From) → Column (Incoming / To). Hover or click any cell for transition
            intelligence.
          </p>
        </div>
        {songs.length > 20 && (
          <span className="text-xs font-mono text-content-muted">
            Showing first 20 tracks of {songs.length}
          </span>
        )}
      </div>

      {/* Hovered Relationship Preview Bar */}
      {hoveredPair ? (
        <div className="p-3 bg-surface-raised border border-border-base text-xs font-mono flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-100">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">
                {hoveredPair.from.title} → {hoveredPair.to.title}
              </span>
              <span className="px-1.5 py-0.5 text-xs border border-border-strong uppercase text-content-secondary">
                {hoveredPair.rel.primary_classification}
              </span>
              <span className="font-bold text-white">
                {Math.round(hoveredPair.rel.overall_score * 100)}% Match
              </span>
            </div>
            <p className="text-xs text-content-muted truncate">
              {hoveredPair.rel.explanation.summary}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onInspectRelationship(hoveredPair.rel)}
            className="px-3 py-1 bg-surface-elevated hover:bg-surface-hover text-white border border-border-strong text-xs uppercase cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
          >
            Inspect Full Breakdown →
          </button>
        </div>
      ) : (
        <div className="p-3 bg-surface-panel border border-border-subtle text-xs font-mono text-content-muted">
          Hover over any grid cell to preview transition characteristics.
        </div>
      )}

      {/* Matrix Table */}
      <div className="overflow-x-auto border border-border-base bg-surface-deep">
        <table className="w-full border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-border-base bg-surface-raised">
              <th className="p-2 text-left text-xs text-content-muted font-normal min-w-[120px] sticky left-0 bg-surface-raised z-10">
                FROM \ TO
              </th>
              {displaySongs.map((colSong) => (
                <th
                  key={colSong.id}
                  className="p-1.5 text-center text-xs text-content-muted font-normal border-l border-border-subtle min-w-[50px] max-w-[80px]"
                >
                  <div
                    className="truncate cursor-pointer hover:text-white"
                    onClick={() => onSelectSong(colSong)}
                    title={colSong.title}
                  >
                    {colSong.title}
                  </div>
                  {colSong.camelot_code && (
                    <span
                      className="inline-block mt-0.5 px-1 py-0.5 text-xs font-bold rounded-[1px]"
                      style={{
                        backgroundColor: camelotColor(colSong.camelot_code),
                        color: camelotTextColor(colSong.camelot_code),
                      }}
                    >
                      {colSong.camelot_code}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {displaySongs.map((rowSong) => (
              <tr key={rowSong.id} className="border-b border-border-subtle hover:bg-surface-raised">
                {/* Row Header */}
                <td
                  className="p-2 text-left text-xs font-medium text-content-secondary sticky left-0 bg-surface-panel border-r border-border-subtle z-10 truncate max-w-[140px] cursor-pointer hover:text-white"
                  onClick={() => onSelectSong(rowSong)}
                  title={rowSong.title}
                >
                  <div className="truncate">{rowSong.title}</div>
                  <div className="flex items-center gap-1 text-xs text-content-muted">
                    {rowSong.camelot_code && <span>{rowSong.camelot_code}</span>}
                    {rowSong.bpm && <span>• {rowSong.bpm.toFixed(0)}</span>}
                  </div>
                </td>

                {/* Compatibility Cells */}
                {displaySongs.map((colSong) => {
                  if (rowSong.id === colSong.id) {
                    return (
                      <td
                        key={colSong.id}
                        className="p-1 text-center bg-surface-deep text-content-dim border-l border-border-subtle text-xs"
                      >
                        —
                      </td>
                    );
                  }

                  const rel = matrix[rowSong.id]?.[colSong.id];
                  if (!rel) {
                    return (
                      <td
                        key={colSong.id}
                        className="p-1 text-center text-content-muted border-l border-border-subtle text-xs"
                      >
                        ?
                      </td>
                    );
                  }

                  const scorePct = Math.round(rel.overall_score * 100);

                  return (
                    <td
                      key={colSong.id}
                      onMouseEnter={() =>
                        setHoveredPair({ from: rowSong, to: colSong, rel })
                      }
                      onClick={() => onInspectRelationship(rel)}
                      className={`p-1 text-center border-l border-border-subtle cursor-pointer transition-transform hover:scale-105 select-none focus:outline-none focus:ring-1 focus:ring-sky-400 ${getCellColor(
                        rel.overall_score
                      )}`}
                      title={`${rowSong.title} → ${colSong.title}: ${scorePct}% (${rel.primary_classification})`}
                    >
                      <span className="text-xs tabular-nums font-medium">{scorePct}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
