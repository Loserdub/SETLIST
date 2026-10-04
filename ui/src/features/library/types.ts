export type SortField = 'title' | 'artist' | 'bpm' | 'key' | 'energy' | 'lufs' | 'duration';
export type SortDirection = 'asc' | 'desc';

export interface LibrarySort {
  field: SortField;
  direction: SortDirection;
}

export interface LibraryFilters {
  searchQuery: string;
  minBpm: number | null;
  maxBpm: number | null;
  selectedKey: string | null; // e.g. "8A", "11B", or null for all
  includeCompatibleKeys: boolean;
  minEnergy: number | null; // 1 - 10
  maxEnergy: number | null; // 1 - 10
  needsReviewOnly?: boolean;
}

export const DEFAULT_FILTERS: LibraryFilters = {
  searchQuery: '',
  minBpm: null,
  maxBpm: null,
  selectedKey: null,
  includeCompatibleKeys: true,
  minEnergy: null,
  maxEnergy: null,
  needsReviewOnly: false,
};
