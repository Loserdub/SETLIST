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
    return 'bg-rose-900/60 text-[#ee8888]';
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150" data-testid="catalog-matrix-view">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white font-sans">
            Catalog Relationship Matrix
          </h3>
          <p className="text-[11px] font-mono text-[#888888]">
            Row (Outgoing / From) → Column (Incoming / To). Hover or click any cell for transition
            intelligence.
          </p>
        </div>
        {songs.length > 20 && (
          <span className="text-[10px] font-mono text-[#777777]">
            Showing first 20 tracks of {songs.length}
          </span>
        )}
      </div>

      {/* Hovered Relationship Preview Bar */}
      {hoveredPair ? (
        <div className="p-3 bg-[#131313] border border-[#2b2b2b] text-xs font-mono flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-100">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">
                {hoveredPair.from.title} → {hoveredPair.to.title}
              </span>
              <span className="px-1.5 py-0.2 text-[10px] border border-[#333333] uppercase">
                {hoveredPair.rel.primary_classification}
              </span>
              <span className="font-bold text-white">
                {Math.round(hoveredPair.rel.overall_score * 100)}% Match
              </span>
            </div>
            <p className="text-[11px] text-[#999999] truncate">
              {hoveredPair.rel.explanation.summary}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onInspectRelationship(hoveredPair.rel)}
            className="px-3 py-1 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white border border-[#3a3a3a] text-xs uppercase cursor-pointer"
          >
            Inspect Full Breakdown →
          </button>
        </div>
      ) : (
        <div className="p-3 bg-[#0d0d0d] border border-[#1a1a1a] text-xs font-mono text-[#666666]">
          Hover over any grid cell to preview transition characteristics.
        </div>
      )}

      {/* Matrix Table */}
      <div className="overflow-x-auto border border-[#222222] bg-[#090909]">
        <table className="w-full border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-[#222222] bg-[#111111]">
              <th className="p-2 text-left text-[10px] text-[#666666] font-normal min-w-[120px] sticky left-0 bg-[#111111] z-10">
                FROM \ TO
              </th>
              {displaySongs.map((colSong) => (
                <th
                  key={colSong.id}
                  className="p-1.5 text-center text-[10px] text-[#888888] font-normal border-l border-[#1a1a1a] min-w-[50px] max-w-[80px]"
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
                      className="inline-block mt-0.5 px-1 py-0.2 text-[8px] font-bold rounded-[1px]"
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
              <tr key={rowSong.id} className="border-b border-[#141414] hover:bg-[#111111]">
                {/* Row Header */}
                <td
                  className="p-2 text-left text-xs font-medium text-[#cccccc] sticky left-0 bg-[#0c0c0c] border-r border-[#1a1a1a] z-10 truncate max-w-[140px] cursor-pointer hover:text-white"
                  onClick={() => onSelectSong(rowSong)}
                  title={rowSong.title}
                >
                  <div className="truncate">{rowSong.title}</div>
                  <div className="flex items-center gap-1 text-[10px] text-[#666666]">
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
                        className="p-1 text-center bg-[#070707] text-[#333333] border-l border-[#141414] text-[10px]"
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
                        className="p-1 text-center text-[#444444] border-l border-[#141414]"
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
                      className={`p-1 text-center border-l border-[#141414] cursor-pointer transition-transform hover:scale-105 select-none ${getCellColor(
                        rel.overall_score
                      )}`}
                      title={`${rowSong.title} → ${colSong.title}: ${scorePct}% (${rel.primary_classification})`}
                    >
                      <span className="text-[10px] tabular-nums">{scorePct}</span>
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
