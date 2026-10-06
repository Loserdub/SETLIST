import React from 'react';
import type { RelationshipFacet } from './types';
import type { CategorizedTopology } from './musicalTopology';

export interface TopologyFacetBarProps {
  activeFacet: RelationshipFacet;
  setActiveFacet: (facet: RelationshipFacet) => void;
  relationshipsCount: number;
  categorized: CategorizedTopology;
  viewStyle: 'canvas' | 'categorized';
  setViewStyle: (style: 'canvas' | 'categorized') => void;
}

export const TopologyFacetBar: React.FC<TopologyFacetBarProps> = ({
  activeFacet,
  setActiveFacet,
  relationshipsCount,
  categorized,
  viewStyle,
  setViewStyle,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs font-mono">
      <span className="text-xs text-zinc-400 uppercase font-bold mr-1">EXPOSE:</span>

      <button
        type="button"
        onClick={() => setActiveFacet('all')}
        className={`px-2 py-1 text-xs uppercase font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-sky-400 ${
          activeFacet === 'all'
            ? 'bg-surface-hover text-white border-zinc-500 font-bold'
            : 'bg-surface-raised text-zinc-400 border-border-base hover:text-zinc-200'
        }`}
      >
        All Connections ({relationshipsCount})
      </button>

      <button
        type="button"
        onClick={() => setActiveFacet('harmonic')}
        className={`px-2 py-1 text-xs uppercase font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-sky-400 ${
          activeFacet === 'harmonic'
            ? 'bg-status-success-dim text-emerald-300 border-emerald-600 font-bold'
            : 'bg-surface-raised text-zinc-400 border-border-base hover:text-zinc-200'
        }`}
        data-testid="facet-harmonic"
      >
        Harmonic Neighbors ({categorized.harmonicNeighbors.length})
      </button>

      <button
        type="button"
        onClick={() => setActiveFacet('tempo')}
        className={`px-2 py-1 text-xs uppercase font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-sky-400 ${
          activeFacet === 'tempo'
            ? 'bg-accent-blue-subtle text-sky-300 border-sky-600 font-bold'
            : 'bg-surface-raised text-zinc-400 border-border-base hover:text-zinc-200'
        }`}
        data-testid="facet-tempo"
      >
        Tempo-Compatible ({categorized.tempoCompatible.length})
      </button>

      <button
        type="button"
        onClick={() => setActiveFacet('energy')}
        className={`px-2 py-1 text-xs uppercase font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-sky-400 ${
          activeFacet === 'energy'
            ? 'bg-accent-amber-subtle text-amber-300 border-amber-600 font-bold'
            : 'bg-surface-raised text-zinc-400 border-border-base hover:text-zinc-200'
        }`}
        data-testid="facet-energy"
      >
        Energy Trajectory ({categorized.energyCompatible.length})
      </button>

      <button
        type="button"
        onClick={() => setActiveFacet('style')}
        className={`px-2 py-1 text-xs uppercase font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-sky-400 ${
          activeFacet === 'style'
            ? 'bg-surface-elevated text-purple-300 border-purple-600 font-bold'
            : 'bg-surface-raised text-zinc-400 border-border-base hover:text-zinc-200'
        }`}
        data-testid="facet-style"
      >
        Stylistic ({categorized.stylisticRelationships.length})
      </button>

      <div className="h-4 w-px bg-surface-hover mx-0.5" />

      <button
        type="button"
        onClick={() => setActiveFacet('openers')}
        className={`px-2 py-1 text-xs uppercase font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-sky-400 ${
          activeFacet === 'openers'
            ? 'bg-status-success-dim text-teal-300 border-teal-600 font-bold'
            : 'bg-surface-raised text-zinc-400 border-border-base hover:text-zinc-200'
        }`}
        data-testid="facet-openers"
      >
        Openers ({categorized.possibleOpeners.length})
      </button>

      <button
        type="button"
        onClick={() => setActiveFacet('peaks')}
        className={`px-2 py-1 text-xs uppercase font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-sky-400 ${
          activeFacet === 'peaks'
            ? 'bg-status-danger-dim text-rose-300 border-rose-600 font-bold'
            : 'bg-surface-raised text-zinc-400 border-border-base hover:text-zinc-200'
        }`}
        data-testid="facet-peaks"
      >
        Peak Tracks ({categorized.possiblePeaks.length})
      </button>

      <button
        type="button"
        onClick={() => setActiveFacet('bridges')}
        className={`px-2 py-1 text-xs uppercase font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-sky-400 ${
          activeFacet === 'bridges'
            ? 'bg-surface-elevated text-fuchsia-300 border-fuchsia-600 font-bold'
            : 'bg-surface-raised text-zinc-400 border-border-base hover:text-zinc-200'
        }`}
        data-testid="facet-bridges"
      >
        Bridges ({categorized.possibleBridges.length})
      </button>

      <button
        type="button"
        onClick={() => setActiveFacet('closers')}
        className={`px-2 py-1 text-xs uppercase font-medium transition-colors cursor-pointer border focus-visible:ring-2 focus-visible:ring-sky-400 ${
          activeFacet === 'closers'
            ? 'bg-surface-elevated text-indigo-300 border-indigo-600 font-bold'
            : 'bg-surface-raised text-zinc-400 border-border-base hover:text-zinc-200'
        }`}
        data-testid="facet-closers"
      >
        Closers ({categorized.possibleClosers.length})
      </button>

      {/* Toggle View Style */}
      <div className="ml-auto flex items-center gap-1 border border-border-base bg-surface-panel p-0.5">
        <button
          type="button"
          onClick={() => setViewStyle('canvas')}
          className={`px-2 py-0.5 text-xs font-mono uppercase cursor-pointer rounded-none ${
            viewStyle === 'canvas' ? 'bg-surface-hover text-white font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Constellation
        </button>
        <button
          type="button"
          onClick={() => setViewStyle('categorized')}
          className={`px-2 py-0.5 text-xs font-mono uppercase cursor-pointer rounded-none ${
            viewStyle === 'categorized' ? 'bg-surface-hover text-white font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Cards
        </button>
      </div>
    </div>
  );
};
