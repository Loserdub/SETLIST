import type { Song } from '../../bindings/Song';
import type { SongRelationship } from '../../bindings/SongRelationship';
import type { BridgeCandidateAnalysis } from '../../bindings/BridgeCandidateAnalysis';
import type { CatalogCluster } from '../../bindings/CatalogCluster';
import type { CatalogOutlier } from '../../bindings/CatalogOutlier';
import type { CatalogSummaryStats } from '../../bindings/CatalogSummaryStats';
import type { DiscoveryCandidatePath } from '../../bindings/DiscoveryCandidatePath';
import type { DiscoveryConstraints } from '../../bindings/DiscoveryConstraints';
import type { OpenerCandidate } from '../../bindings/OpenerCandidate';
import type { CloserCandidate } from '../../bindings/CloserCandidate';

export type DiscoveryTab =
  | 'topology'
  | 'catalog'
  | 'clusters'
  | 'outliers'
  | 'bridges'
  | 'paths'
  | 'duration_sets'
  | 'matrix';

export type RelationshipFacet =
  | 'all'
  | 'harmonic'
  | 'tempo'
  | 'energy'
  | 'style'
  | 'openers'
  | 'peaks'
  | 'bridges'
  | 'closers';

export type SongMusicalRole = 'OPENER' | 'PEAK' | 'BRIDGE' | 'CLOSER' | 'GROOVE';

export interface CatalogFilterState {
  searchQuery: string;
  selectedKey: string | null;
  minBpm: number | null;
  maxBpm: number | null;
  minEnergy: number | null;
  maxEnergy: number | null;
  selectedClusterId: string | null;
  showOutliersOnly: boolean;
  showOpenersOnly: boolean;
  showClosersOnly: boolean;
  sortBy: 'title' | 'artist' | 'bpm' | 'key' | 'energy' | 'duration' | 'connections';
  sortOrder: 'asc' | 'desc';
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilterState = {
  searchQuery: '',
  selectedKey: null,
  minBpm: null,
  maxBpm: null,
  minEnergy: null,
  maxEnergy: null,
  selectedClusterId: null,
  showOutliersOnly: false,
  showOpenersOnly: false,
  showClosersOnly: false,
  sortBy: 'title',
  sortOrder: 'asc',
};

export type {
  Song,
  SongRelationship,
  BridgeCandidateAnalysis,
  CatalogCluster,
  CatalogOutlier,
  CatalogSummaryStats,
  DiscoveryCandidatePath,
  DiscoveryConstraints,
  OpenerCandidate,
  CloserCandidate,
};
