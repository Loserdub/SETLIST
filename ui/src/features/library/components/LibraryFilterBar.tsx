import React from 'react';
import { ALL_CAMELOT_KEYS } from '../../../utils/camelotColor';
import type { LibraryFilters } from '../types';

export interface LibraryFilterBarProps {
  filters: LibraryFilters;
  setFilters: React.Dispatch<React.SetStateAction<LibraryFilters>>;
  needsReviewCount: number;
  resetFilters: () => void;
  selectedTrackIds: string[];
  isAddingBatch: boolean;
  handleAddSelectedToSetlist: () => void;
}

export const LibraryFilterBar: React.FC<LibraryFilterBarProps> = ({
  filters,
  setFilters,
  needsReviewCount,
  resetFilters,
  selectedTrackIds,
  isAddingBatch,
  handleAddSelectedToSetlist,
}) => {
  const hasActiveFilters = Boolean(
    filters.searchQuery ||
      filters.minBpm !== null ||
      filters.maxBpm !== null ||
      filters.selectedKey !== null ||
      filters.minEnergy !== null ||
      filters.maxEnergy !== null ||
      filters.needsReviewOnly
  );

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
      {/* Text Search */}
      <div className="min-w-[200px] flex-1 sm:max-w-xs">
        <input
          type="search"
          value={filters.searchQuery}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
          }
          placeholder="Search title, artist, album, key..."
          className="w-full px-2.5 py-1 bg-surface-deep border border-border-base text-zinc-200 placeholder-zinc-600 text-xs font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
        />
      </div>

      {/* BPM Filter */}
      <div className="flex items-center gap-1 bg-surface-deep border border-border-base px-2 py-1">
        <span className="text-zinc-400 uppercase text-xs">BPM:</span>
        <input
          type="number"
          placeholder="Min"
          value={filters.minBpm ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              minBpm: e.target.value ? parseFloat(e.target.value) : null,
            }))
          }
          className="w-12 bg-surface-raised border border-border-base text-center font-mono text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
        />
        <span className="text-zinc-600">-</span>
        <input
          type="number"
          placeholder="Max"
          value={filters.maxBpm ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              maxBpm: e.target.value ? parseFloat(e.target.value) : null,
            }))
          }
          className="w-12 bg-surface-raised border border-border-base text-center font-mono text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
        />
      </div>

      {/* Camelot Key Filter */}
      <div className="flex items-center gap-1.5 bg-surface-deep border border-border-base px-2 py-1">
        <span className="text-zinc-400 uppercase text-xs">Key:</span>
        <select
          value={filters.selectedKey ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              selectedKey: e.target.value || null,
            }))
          }
          aria-label="Filter by Camelot Key"
          className="bg-surface-raised border border-border-base text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400 font-mono cursor-pointer"
        >
          <option value="">All Keys</option>
          {ALL_CAMELOT_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        {filters.selectedKey && (
          <label className="flex items-center gap-1 cursor-pointer select-none text-zinc-400 ml-1">
            <input
              type="checkbox"
              checked={filters.includeCompatibleKeys}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  includeCompatibleKeys: e.target.checked,
                }))
              }
              className="rounded-none border-border-strong bg-surface-raised accent-amber-500 cursor-pointer w-3 h-3 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
            />
            <span className="text-xs text-zinc-400">
              Harmonic (±1)
            </span>
          </label>
        )}
      </div>

      {/* Energy Filter */}
      <div className="flex items-center gap-1 bg-surface-deep border border-border-base px-2 py-1">
        <span className="text-zinc-400 uppercase text-xs">Energy:</span>
        <input
          type="number"
          min="1"
          max="10"
          placeholder="1"
          value={filters.minEnergy ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              minEnergy: e.target.value ? parseInt(e.target.value, 10) : null,
            }))
          }
          className="w-8 bg-surface-raised border border-border-base text-center font-mono text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
        />
        <span className="text-zinc-600">-</span>
        <input
          type="number"
          min="1"
          max="10"
          placeholder="10"
          value={filters.maxEnergy ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              maxEnergy: e.target.value ? parseInt(e.target.value, 10) : null,
            }))
          }
          className="w-8 bg-surface-raised border border-border-base text-center font-mono text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-zinc-400"
        />
      </div>

      {/* Needs Review Filter Chip */}
      <button
        type="button"
        onClick={() =>
          setFilters((prev) => ({
            ...prev,
            needsReviewOnly: !prev.needsReviewOnly,
          }))
        }
        aria-pressed={Boolean(filters.needsReviewOnly)}
        data-testid="needs-review-toggle"
        className={`hw-btn px-2.5 py-1 text-xs font-mono tracking-wider border transition-colors cursor-pointer rounded-none flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px] ${
          filters.needsReviewOnly
            ? 'border-amber-500/80 bg-amber-950/40 text-amber-300 font-bold'
            : 'border-border-base bg-surface-deep hover:bg-surface-raised text-zinc-400 hover:text-zinc-200'
        }`}
        title={
          filters.needsReviewOnly
            ? 'Showing tracks that need review'
            : 'Filter to tracks needing review'
        }
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            needsReviewCount > 0 ? 'bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.6)]' : 'bg-zinc-600'
          }`}
        />
        <span>Needs review ({needsReviewCount})</span>
      </button>

      {/* Reset Filters Button */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetFilters}
          className="text-xs font-mono text-zinc-400 hover:text-white underline transition-colors cursor-pointer px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          Reset Filters
        </button>
      )}

      {/* Multi-Select Batch Add Action */}
      {selectedTrackIds.length > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-300 font-mono te-num">
            {selectedTrackIds.length} selected
          </span>
          <button
            type="button"
            onClick={handleAddSelectedToSetlist}
            disabled={isAddingBatch}
            className="hw-btn px-2.5 py-1 bg-surface-elevated hover:bg-surface-hover disabled:opacity-50 text-zinc-100 font-mono text-xs uppercase border border-border-strong transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none active:translate-y-[1px]"
          >
            Add to Setlist
          </button>
        </div>
      )}
    </div>
  );
};
