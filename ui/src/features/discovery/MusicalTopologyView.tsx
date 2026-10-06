import { useState, useEffect, useMemo } from 'react';
import type { Song } from '../../bindings/Song';
import type { SongRelationship } from '../../bindings/SongRelationship';
import type { SongRelationshipsResponse } from '../../bindings/SongRelationshipsResponse';
import type { OpenerCandidate } from '../../bindings/OpenerCandidate';
import type { CloserCandidate } from '../../bindings/CloserCandidate';
import type { BridgeCandidateAnalysis } from '../../bindings/BridgeCandidateAnalysis';
import type { RelationshipFacet, SongMusicalRole } from './types';
import {
  determineSongRole,
  categorizeRelationships,
  computeTopologyPositions,
  type CategorizedTopology,
  type RenderedTopologyNode,
} from './musicalTopology';
import { MusicalTopologyCanvas } from './MusicalTopologyCanvas';
import { MusicalRelationshipInspector } from './MusicalRelationshipInspector';
import { TopologyFacetBar } from './TopologyFacetBar';
import { CategorizedTopologyCards } from './CategorizedTopologyCards';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { useAppStore } from '../../store/useAppStore';
import { getBackend, evaluateMockSongRelationship } from '../../api';
import { IconSearch } from '../../components/icons';

interface MusicalTopologyViewProps {
  songs: Song[];
  initialAnchorSongId?: string;
  onOpenBridgeModal: (songAId?: string, songBId?: string) => void;
  onOpenPathModal: (startSongId?: string) => void;
}

export function MusicalTopologyView({
  songs,
  initialAnchorSongId,
  onOpenBridgeModal,
  onOpenPathModal,
}: MusicalTopologyViewProps) {
  const useMockBackend = useAppStore((s) => s.useMockBackend);
  const addToast = useAppStore((s) => s.addToast);
  const addToSetlist = useAppStore((s) => s.addToSetlist);
  const selectedTrackId = useAppStore((s) => s.selectedTrackId);
  const selectTrack = useAppStore((s) => s.selectTrack);

  // Active Focal / Anchor Track State
  const [anchorId, setAnchorId] = useState<string>(() => {
    if (initialAnchorSongId && songs.some((s) => s.id === initialAnchorSongId)) {
      return initialAnchorSongId;
    }
    if (selectedTrackId && songs.some((s) => s.id === selectedTrackId)) {
      return selectedTrackId;
    }
    return songs[0]?.id ?? '';
  });

  // Track search query for changing the anchor track
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

  // Active Musical Facet Filter
  const [activeFacet, setActiveFacet] = useState<RelationshipFacet>('all');

  // View presentation mode for topology (Canvas vs Categorized Cards)
  const [viewStyle, setViewStyle] = useState<'canvas' | 'categorized'>('canvas');

  // Backend relationship queries
  const [relationships, setRelationships] = useState<SongRelationship[]>([]);
  const [openers, setOpeners] = useState<OpenerCandidate[]>([]);
  const [closers, setClosers] = useState<CloserCandidate[]>([]);
  const [bridges, setBridges] = useState<BridgeCandidateAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Active selected candidate node in inspector
  const [selectedNode, setSelectedNode] = useState<RenderedTopologyNode | null>(null);

  // Keep anchorId valid if songs change
  useEffect(() => {
    if (!anchorId && songs.length > 0) {
      setAnchorId(songs[0].id);
    }
  }, [anchorId, songs]);

  const anchorSong = useMemo(() => {
    return songs.find((s) => s.id === anchorId) ?? songs[0] ?? null;
  }, [songs, anchorId]);

  // Load Openers and Closers once for catalog context
  useEffect(() => {
    if (songs.length === 0) return;
    let isMounted = true;
    const backend = getBackend(useMockBackend);

    backend
      .getCatalogOpenersAndClosers()
      .then((res) => {
        if (!isMounted) return;
        setOpeners(res.openers);
        setClosers(res.closers);
      })
      .catch(() => {
        // Fallback gracefully
      });

    return () => {
      isMounted = false;
    };
  }, [songs.length, useMockBackend]);

  // Load relationships for the current anchor track
  useEffect(() => {
    if (!anchorSong) return;

    let isMounted = true;
    setIsLoading(true);
    const backend = getBackend(useMockBackend);

    Promise.all([
      backend.getSongRelationships(anchorSong.id),
      backend.getPotentialBridges(anchorSong.id, songs.find((s) => s.id !== anchorSong.id)?.id ?? '', 4).catch(() => []),
    ])
      .then(([relRes, bridgeRes]: [SongRelationshipsResponse, BridgeCandidateAnalysis[]]) => {
        if (!isMounted) return;
        let outgoing = relRes.outgoing;
        if (outgoing.length === 0 && songs.length > 1) {
          outgoing = songs
            .filter((s) => s.id !== anchorSong.id)
            .map((s) => evaluateMockSongRelationship(anchorSong, s))
            .sort((a, b) => b.overall_score - a.overall_score);
        }
        setRelationships(outgoing);
        setBridges(bridgeRes);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setIsLoading(false);
        addToast({
          type: 'error',
          message: 'Failed to load musical relationships',
          details: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      isMounted = false;
    };
  }, [anchorSong, useMockBackend, addToast, songs]);

  // Context IDs for roles
  const contextIds = useMemo(() => {
    return {
      openerIds: new Set(openers.map((o) => o.song_id)),
      closerIds: new Set(closers.map((c) => c.song_id)),
      bridgeIds: new Set(bridges.map((b) => b.bridge_song.id)),
    };
  }, [openers, closers, bridges]);

  // Anchor role
  const anchorRole: SongMusicalRole = useMemo(() => {
    if (!anchorSong) return 'GROOVE';
    return determineSongRole(anchorSong, contextIds);
  }, [anchorSong, contextIds]);

  // Categorize outgoing transitions into the 8 required facets
  const categorized: CategorizedTopology = useMemo(() => {
    if (!anchorSong) {
      return {
        harmonicNeighbors: [],
        tempoCompatible: [],
        energyCompatible: [],
        stylisticRelationships: [],
        possibleOpeners: [],
        possiblePeaks: [],
        possibleBridges: [],
        possibleClosers: [],
      };
    }
    return categorizeRelationships(anchorSong, relationships, songs, openers, closers, bridges);
  }, [anchorSong, relationships, songs, openers, closers, bridges]);

  // Layout rendered topology nodes
  const renderedNodes: RenderedTopologyNode[] = useMemo(() => {
    if (!anchorSong) return [];
    return computeTopologyPositions(anchorSong, relationships, songs, categorized, contextIds);
  }, [anchorSong, relationships, songs, categorized, contextIds]);

  // Keep selectedNode in sync when anchor changes
  useEffect(() => {
    if (renderedNodes.length > 0 && selectedNode) {
      const match = renderedNodes.find((n) => n.songId === selectedNode.songId);
      setSelectedNode(match ?? null);
    } else {
      setSelectedNode(null);
    }
  }, [anchorSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered catalog songs for the Anchor search picker
  const filteredAnchorCandidates = useMemo(() => {
    if (!searchQuery.trim()) return songs.slice(0, 10);
    const q = searchQuery.toLowerCase();
    return songs
      .filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
      .slice(0, 15);
  }, [songs, searchQuery]);

  const handleHopToAnchor = (targetSongId: string) => {
    setAnchorId(targetSongId);
    selectTrack(targetSongId);
    setSelectedNode(null);
    setIsSearchDropdownOpen(false);
    setSearchQuery('');
  };

  const handleStepAnchor = (direction: 'prev' | 'next') => {
    const currentIndex = songs.findIndex((s) => s.id === anchorId);
    if (currentIndex === -1) return;
    const nextIndex =
      direction === 'next'
        ? (currentIndex + 1) % songs.length
        : (currentIndex - 1 + songs.length) % songs.length;
    handleHopToAnchor(songs[nextIndex].id);
  };

  if (!anchorSong) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 font-mono text-xs">
        No catalog tracks available for topology exploration.
      </div>
    );
  }

  const anchorKey = anchorSong.camelot_code ?? anchorSong.musical_key ?? '—';

  return (
    <div
      className="flex-1 flex flex-col h-full bg-surface-deep text-zinc-200 overflow-hidden select-none"
      data-testid="musical-topology-view"
    >
      {/* Top Banner: Core Question & Anchor Track Selection Bar */}
      <div className="p-3 border-b border-border-subtle bg-surface-panel shrink-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Core Inquiry Header */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-accent-blue-subtle text-sky-400 border border-sky-800/80 uppercase">
              TOPOLOGY CO-PILOT
            </span>
            <h1 className="text-sm font-mono font-bold tracking-wider text-white uppercase">
              WHERE CAN THIS TRACK GO?
            </h1>
          </div>

          {/* Quick Track Switcher Controls */}
          <div className="flex items-center gap-2 relative">
            <div className="flex items-center bg-surface-raised border border-border-base px-2 py-1 gap-1.5 focus-within:ring-1 focus-within:ring-sky-400">
              <IconSearch size={13} className="text-zinc-500 shrink-0" />
              <input
                type="text"
                placeholder="Change focal track..."
                value={searchQuery}
                onFocus={() => setIsSearchDropdownOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchDropdownOpen(true);
                }}
                className="w-48 bg-transparent text-xs text-white outline-none font-mono"
                data-testid="catalog-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-zinc-500 hover:text-white text-xs cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>

            {/* Previous / Next Track Steppers */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleStepAnchor('prev')}
                className="px-2 py-1 bg-surface-raised hover:bg-surface-hover text-zinc-300 border border-border-base text-xs font-mono uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-sky-400"
                title="Previous catalog track"
              >
                ◀ Prev
              </button>
              <button
                type="button"
                onClick={() => handleStepAnchor('next')}
                className="px-2 py-1 bg-surface-raised hover:bg-surface-hover text-zinc-300 border border-border-base text-xs font-mono uppercase cursor-pointer focus-visible:ring-2 focus-visible:ring-sky-400"
                title="Next catalog track"
              >
                Next ▶
              </button>
            </div>

            {/* Search Dropdown Popover */}
            {isSearchDropdownOpen && (
              <div
                className="absolute right-0 top-9 z-50 w-72 bg-surface-panel border border-border-strong shadow-2xl max-h-64 overflow-y-auto font-mono text-xs"
                onMouseLeave={() => setIsSearchDropdownOpen(false)}
              >
                <div className="p-2 border-b border-border-base text-xs text-zinc-400 uppercase font-bold">
                  SELECT FOCAL ANCHOR TRACK
                </div>
                {filteredAnchorCandidates.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleHopToAnchor(s.id)}
                    className="w-full text-left p-2 hover:bg-surface-elevated border-b border-border-subtle flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  >
                    <div className="truncate">
                      <div className="text-zinc-200 font-semibold truncate text-xs">{s.title}</div>
                      <div className="text-zinc-400 text-xs truncate">{s.artist}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.camelot_code && (
                        <span
                          className="px-1.5 py-0.5 text-xs font-bold rounded-none"
                          style={{
                            backgroundColor: camelotColor(s.camelot_code),
                            color: camelotTextColor(s.camelot_code),
                          }}
                        >
                          {s.camelot_code}
                        </span>
                      )}
                      {s.bpm && <span className="text-xs text-zinc-400">{s.bpm.toFixed(0)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Focal Anchor Track Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-surface-raised border border-border-base font-mono">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-zinc-400 uppercase font-bold">FOCAL ANCHOR:</span>
            <span
              className="px-2 py-0.5 font-mono font-bold text-xs rounded-none"
              style={{
                backgroundColor: camelotColor(anchorKey),
                color: camelotTextColor(anchorKey),
              }}
            >
              {anchorKey}
            </span>
            <div className="truncate">
              <span className="text-xs font-bold text-white font-sans truncate">{anchorSong.title}</span>
              <span className="text-zinc-400 text-xs ml-2 font-normal truncate">— {anchorSong.artist}</span>
            </div>
            {anchorSong.bpm && (
              <span className="text-xs text-sky-300 font-semibold">{anchorSong.bpm.toFixed(1)} BPM</span>
            )}
            {anchorSong.energy_rating && (
              <span className="text-xs text-amber-300">Energy {anchorSong.energy_rating}/10</span>
            )}
            <span className="px-1.5 py-0.5 text-xs bg-surface-hover text-sky-300 border border-sky-800/80 font-bold uppercase rounded-none">
              {anchorRole}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => onOpenPathModal(anchorSong.id)}
              className="px-2 py-1 bg-surface-raised hover:bg-surface-hover text-zinc-300 hover:text-white border border-border-base uppercase text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-sky-400 hw-btn"
            >
              Path from here
            </button>
            <button
              type="button"
              onClick={() => {
                void addToSetlist(anchorSong.id);
                addToast({ type: 'success', message: 'Added focal track to active setlist', details: anchorSong.title });
              }}
              className="px-2 py-1 bg-surface-hover hover:bg-status-success-dim text-emerald-300 border border-status-success uppercase text-xs font-semibold cursor-pointer focus-visible:ring-2 focus-visible:ring-sky-400 hw-btn"
              data-testid={`inspect-rel-btn-${anchorSong.id}`}
            >
              + Set
            </button>
          </div>
        </div>

        {/* 8 Relationship Facets Bar */}
        <TopologyFacetBar
          activeFacet={activeFacet}
          setActiveFacet={setActiveFacet}
          relationshipsCount={relationships.length}
          categorized={categorized}
          viewStyle={viewStyle}
          setViewStyle={setViewStyle}
        />
      </div>

      {/* Main Relational Topology Area & Split Inspector Rail */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left/Center Topology Visualization View */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {isLoading && (
            <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 font-mono text-xs">
              Calculating multidimensional topology for &quot;{anchorSong.title}&quot;...
            </div>
          )}

          {!isLoading && relationships.length === 0 && (
            <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 font-mono text-xs">
              No outgoing relationships available for this song.
            </div>
          )}

          {!isLoading && relationships.length > 0 && viewStyle === 'canvas' && (
            <MusicalTopologyCanvas
              anchorSong={anchorSong}
              anchorRole={anchorRole}
              nodes={renderedNodes}
              selectedNode={selectedNode}
              activeFacet={activeFacet}
              onSelectNode={(node) => setSelectedNode(node)}
              onHopToAnchor={(songId) => handleHopToAnchor(songId)}
            />
          )}

          {!isLoading && relationships.length > 0 && viewStyle === 'categorized' && (
            <CategorizedTopologyCards
              nodes={renderedNodes}
              activeFacet={activeFacet}
              selectedNode={selectedNode}
              onSelectNode={(node) => setSelectedNode(node)}
            />
          )}
        </div>

        {/* Right Rail: Deep Relationship Inspector */}
        <aside
          className="w-[380px] xl:w-[420px] bg-surface-panel border-l border-border-base flex flex-col shrink-0 h-full overflow-hidden shadow-2xl transition-all"
          aria-label="Musical Relationship Inspector"
        >
          <MusicalRelationshipInspector
            anchorSong={anchorSong}
            anchorRole={anchorRole}
            selectedNode={selectedNode}
            onClose={() => setSelectedNode(null)}
            onHopToAnchor={(songId) => handleHopToAnchor(songId)}
            onOpenBridgeModal={(songA, songB) => onOpenBridgeModal(songA, songB)}
          />
        </aside>
      </div>
    </div>
  );
}
