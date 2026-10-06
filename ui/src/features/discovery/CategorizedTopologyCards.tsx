import React from 'react';
import type { RenderedTopologyNode } from './musicalTopology';
import type { RelationshipFacet } from './types';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';

export interface CategorizedTopologyCardsProps {
  nodes: RenderedTopologyNode[];
  activeFacet: RelationshipFacet;
  selectedNode: RenderedTopologyNode | null;
  onSelectNode: (node: RenderedTopologyNode) => void;
}

export const CategorizedTopologyCards: React.FC<CategorizedTopologyCardsProps> = ({
  nodes,
  activeFacet,
  selectedNode,
  onSelectNode,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {nodes
          .filter((n) => activeFacet === 'all' || n.facets.has(activeFacet))
          .map((node) => {
            const isSelected = selectedNode?.songId === node.songId;
            const camCode = node.camelotKey ?? '—';
            return (
              <div
                key={node.songId}
                onClick={() => onSelectNode(node)}
                className={`p-3 bg-surface-raised border transition-all cursor-pointer space-y-2 ${
                  isSelected
                    ? 'border-sky-500 bg-accent-blue-subtle'
                    : 'border-border-base hover:border-border-strong'
                }`}
                data-testid={`topology-node-${node.songId}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-sans font-bold text-white text-xs truncate">
                      {node.title}
                    </h3>
                    <p className="text-zinc-400 text-xs truncate">{node.artist}</p>
                  </div>
                  <span
                    className="px-1.5 py-0.5 font-bold rounded-none text-xs"
                    style={{
                      backgroundColor: camelotColor(camCode),
                      color: camelotTextColor(camCode),
                    }}
                  >
                    {camCode}
                  </span>
                </div>

                {/* Metric summary */}
                <div className="flex items-center gap-3 text-xs text-zinc-400 pt-1 border-t border-border-subtle">
                  <span>{node.bpm ? `${node.bpm.toFixed(1)} BPM` : '—'}</span>
                  <span>•</span>
                  <span>{node.energy ? `E${node.energy}` : '—'}</span>
                  <span>•</span>
                  <span className="text-sky-400">{node.role}</span>
                  <span className="ml-auto text-emerald-400 font-semibold">
                    {Math.round(node.compatibilityScore * 100)}%
                  </span>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                  {node.relationship.explanation.summary}
                </p>
              </div>
            );
          })}
      </div>
    </div>
  );
};
