import { useState, useRef, useMemo } from 'react';
import type { Song } from '../../bindings/Song';
import type { RenderedTopologyNode } from './musicalTopology';
import type { RelationshipFacet, SongMusicalRole } from './types';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';

interface MusicalTopologyCanvasProps {
  anchorSong: Song;
  anchorRole: SongMusicalRole;
  nodes: RenderedTopologyNode[];
  selectedNode: RenderedTopologyNode | null;
  activeFacet: RelationshipFacet;
  onSelectNode: (node: RenderedTopologyNode) => void;
  onHopToAnchor: (songId: string) => void;
}

export function MusicalTopologyCanvas({
  anchorSong,
  anchorRole,
  nodes,
  selectedNode,
  activeFacet,
  onSelectNode,
  onHopToAnchor,
}: MusicalTopologyCanvasProps) {
  const [hoveredNode, setHoveredNode] = useState<RenderedTopologyNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const canvasRef = useRef<SVGSVGElement | null>(null);

  const viewBoxWidth = 800;
  const viewBoxHeight = 650;
  const cx = viewBoxWidth / 2;
  const cy = viewBoxHeight / 2;

  // Filter nodes based on activeFacet
  const visibleNodes = useMemo(() => {
    return nodes.map((node) => {
      const isFacetMatch = activeFacet === 'all' || node.facets.has(activeFacet);
      return {
        ...node,
        isFacetMatch,
      };
    });
  }, [nodes, activeFacet]);

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.max(0.7, Math.min(1.8, Math.round((prev + delta) * 10) / 10)));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
  };

  const anchorKey = anchorSong.camelot_code ?? anchorSong.musical_key ?? '—';

  return (
    <div
      className="relative flex-1 flex flex-col h-full bg-[#070707] overflow-hidden select-none border border-[#1a1a1a]"
      data-testid="musical-topology-canvas"
    >
      {/* Top Topology Canvas Bar / Controls */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#0d0d0d]/90 backdrop-blur-md px-3 py-1.5 border border-[#242424] text-xs font-mono">
        <span className="text-zinc-400 uppercase tracking-widest text-xs font-bold">
          TOPOLOGY ORBITS:
        </span>
        <span className="text-emerald-400">Inner: Consonance</span>
        <span className="text-zinc-600">•</span>
        <span className="text-amber-400">Mid: Lifts</span>
        <span className="text-zinc-600">•</span>
        <span className="text-rose-400">Outer: Contrasts</span>
      </div>

      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-[#0d0d0d]/90 backdrop-blur-md p-1 border border-[#242424] text-xs font-mono">
        <button
          type="button"
          onClick={() => handleZoom(-0.15)}
          className="w-7 h-7 flex items-center justify-center bg-[#161616] hover:bg-[#222222] text-zinc-300 hover:text-white border border-[#2e2e2e] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-sky-400"
          title="Zoom out topology"
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          className="px-2 h-7 flex items-center justify-center bg-[#161616] hover:bg-[#222222] text-zinc-300 hover:text-white border border-[#2e2e2e] transition-colors cursor-pointer text-xs focus-visible:ring-2 focus-visible:ring-sky-400"
          title="Reset zoom"
        >
          {Math.round(zoomLevel * 100)}%
        </button>
        <button
          type="button"
          onClick={() => handleZoom(0.15)}
          className="w-7 h-7 flex items-center justify-center bg-[#161616] hover:bg-[#222222] text-zinc-300 hover:text-white border border-[#2e2e2e] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-sky-400"
          title="Zoom in topology"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      {/* SVG Canvas Rendering */}
      <svg
        ref={canvasRef}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="w-full h-full flex-1 touch-none"
        style={{
          transform: `scale(${zoomLevel})`,
          transformOrigin: 'center center',
          transition: 'transform 0.15s ease-out',
        }}
      >
        <defs>
          {/* Subtle Radial Glows */}
          <radialGradient id="centerAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
            <stop offset="60%" stopColor="#0284c7" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <filter id="nodeGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Harmonic Orbit Rings */}
        <g className="orbit-rings" opacity={0.6}>
          {/* Inner Consonance Orbit */}
          <circle
            cx={cx}
            cy={cy}
            r={135}
            fill="none"
            stroke="#162e24"
            strokeWidth={1.2}
            strokeDasharray="4 4"
          />
          <text
            x={cx}
            y={cy - 140}
            textAnchor="middle"
            fill="#10b981"
            opacity={0.5}
            fontSize="9"
            fontFamily="monospace"
            letterSpacing="0.05em"
          >
            INNER ORBIT: HIGH CONSONANCE (SAME KEY / FIFTHS)
          </text>

          {/* Middle Modulation Orbit */}
          <circle
            cx={cx}
            cy={cy}
            r={210}
            fill="none"
            stroke="#262214"
            strokeWidth={1.2}
            strokeDasharray="5 5"
          />
          <text
            x={cx}
            y={cy - 215}
            textAnchor="middle"
            fill="#f59e0b"
            opacity={0.4}
            fontSize="9"
            fontFamily="monospace"
            letterSpacing="0.05em"
          >
            MIDDLE ORBIT: HARMONIC LIFTS &amp; ENERGY RAMPS
          </text>

          {/* Outer Creative Orbit */}
          <circle
            cx={cx}
            cy={cy}
            r={285}
            fill="none"
            stroke="#261622"
            strokeWidth={1.2}
            strokeDasharray="6 6"
          />
          <text
            x={cx}
            y={cy - 290}
            textAnchor="middle"
            fill="#f43f5e"
            opacity={0.35}
            fontSize="9"
            fontFamily="monospace"
            letterSpacing="0.05em"
          >
            OUTER ORBIT: BRIDGES, CLOSERS &amp; CREATIVE CONTRASTS
          </text>

          {/* Compass Axis Crosshairs */}
          <line
            x1={cx}
            y1={cy - 305}
            x2={cx}
            y2={cy + 305}
            stroke="#1a1a1a"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
          <line
            x1={cx - 305}
            y1={cy}
            x2={cx + 305}
            y2={cy}
            stroke="#1a1a1a"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        </g>

        {/* Relationship Lines / Vectors */}
        <g className="relationship-lines">
          {visibleNodes.map((node) => {
            const isSelected = selectedNode?.songId === node.songId;
            const isHovered = hoveredNode?.songId === node.songId;
            const opacity = isSelected
              ? 1.0
              : isHovered
              ? 0.95
              : node.isFacetMatch
              ? 0.65
              : 0.15;
            const strokeWidth = isSelected
              ? 3.2
              : isHovered
              ? 2.4
              : node.isFacetMatch
              ? node.lineWidth
              : 0.8;

            return (
              <line
                key={`line-${node.songId}`}
                x1={cx}
                y1={cy}
                x2={node.x}
                y2={node.y}
                stroke={node.lineColor}
                strokeWidth={strokeWidth}
                strokeDasharray={node.isDashed ? '4 4' : undefined}
                strokeOpacity={opacity}
                className="transition-all duration-150 pointer-events-none"
              />
            );
          })}
        </g>

        {/* Central Focal Anchor Track Node */}
        <g className="anchor-node" transform={`translate(${cx}, ${cy})`}>
          {/* Subtle Ambient Radar Glow */}
          <circle cx={0} cy={0} r={56} fill="url(#centerAura)" className="animate-pulse" />
          <circle
            cx={0}
            cy={0}
            r={44}
            fill="#0a0a0a"
            stroke="#38bdf8"
            strokeWidth={2.4}
            className="shadow-xl"
          />
          <circle cx={0} cy={0} r={48} fill="none" stroke="#38bdf8" strokeWidth={0.8} strokeOpacity={0.4} />

          {/* Anchor Camelot Badge */}
          <rect
            x={-20}
            y={-28}
            width={40}
            height={19}
            rx={2}
            fill={camelotColor(anchorKey)}
          />
          <text
            x={0}
            y={-14}
            textAnchor="middle"
            fill={camelotTextColor(anchorKey)}
            fontSize="11"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {anchorKey}
          </text>

          {/* Anchor BPM & Energy */}
          <text
            x={0}
            y={-1}
            textAnchor="middle"
            fill="#e2e8f0"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {anchorSong.bpm ? `${anchorSong.bpm.toFixed(1)}` : '—'}
          </text>
          <text
            x={0}
            y={12}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="8.5"
            fontFamily="monospace"
          >
            {anchorSong.energy_rating ? `E${anchorSong.energy_rating}` : 'BPM'}
          </text>

          {/* Anchor Role Indicator Tag */}
          <rect
            x={-34}
            y={22}
            width={68}
            height={14}
            rx={2}
            fill="#1e293b"
            stroke="#38bdf8"
            strokeWidth={0.7}
          />
          <text
            x={0}
            y={32}
            textAnchor="middle"
            fill="#38bdf8"
            fontSize="8"
            fontFamily="monospace"
            fontWeight="bold"
            letterSpacing="0.05em"
          >
            FOCAL • {anchorRole}
          </text>
        </g>

        {/* Candidate Topological Nodes */}
        <g className="candidate-nodes">
          {visibleNodes.map((node) => {
            const isSelected = selectedNode?.songId === node.songId;
            const isHovered = hoveredNode?.songId === node.songId;
            const nodeOpacity = node.isFacetMatch ? 1.0 : 0.25;
            const camCode = node.camelotKey ?? '—';

            return (
              <g
                key={`node-${node.songId}`}
                transform={`translate(${node.x}, ${node.y})`}
                opacity={nodeOpacity}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onSelectNode(node)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectNode(node);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Select candidate ${node.title} by ${node.artist}, Key ${camCode}, ${node.bpm ? node.bpm.toFixed(1) : ''} BPM`}
                className="cursor-pointer focus:outline-none group"
                data-testid={`topology-node-${node.songId}`}
              >
                {/* Selection Highlight Ring */}
                {isSelected && (
                  <circle
                    cx={0}
                    cy={0}
                    r={29}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    className="animate-pulse"
                  />
                )}
                {isHovered && !isSelected && (
                  <circle
                    cx={0}
                    cy={0}
                    r={26}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                )}

                {/* Main Node Disc */}
                <circle
                  cx={0}
                  cy={0}
                  r={22}
                  fill="#111111"
                  stroke={isSelected ? '#38bdf8' : isHovered ? '#cbd5e1' : node.lineColor}
                  strokeWidth={isSelected ? 2.2 : 1.4}
                  className="transition-all duration-100"
                />

                {/* Key Badge in Node */}
                <rect
                  x={-14}
                  y={-17}
                  width={28}
                  height={13}
                  rx={2}
                  fill={camelotColor(camCode)}
                />
                <text
                  x={0}
                  y={-7}
                  textAnchor="middle"
                  fill={camelotTextColor(camCode)}
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {camCode}
                </text>

                {/* BPM Delta or BPM */}
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fill="#f1f5f9"
                  fontSize="8"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {node.bpmDelta !== null ? `${node.bpmDelta >= 0 ? '+' : ''}${node.bpmDelta.toFixed(1)}` : '—'}
                </text>

                {/* Energy Rating or Score Badge */}
                <text
                  x={0}
                  y={13}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="7.5"
                  fontFamily="monospace"
                >
                  {node.energy ? `E${node.energy}` : `${Math.round(node.compatibilityScore * 100)}%`}
                </text>

                {/* Role Pill Above Node */}
                <rect
                  x={-18}
                  y={-28}
                  width={36}
                  height={10}
                  rx={2}
                  fill="#0f172a"
                  stroke={node.role === 'PEAK' ? '#f43f5e' : node.role === 'BRIDGE' ? '#c084fc' : node.role === 'OPENER' ? '#10b981' : '#64748b'}
                  strokeWidth={0.6}
                />
                <text
                  x={0}
                  y={-20}
                  textAnchor="middle"
                  fill={node.role === 'PEAK' ? '#f43f5e' : node.role === 'BRIDGE' ? '#c084fc' : node.role === 'OPENER' ? '#34d399' : '#cbd5e1'}
                  fontSize="6.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {node.role}
                </text>

                {/* Track Title Label Below Node */}
                <text
                  x={0}
                  y={32}
                  textAnchor="middle"
                  fill={isSelected ? '#38bdf8' : isHovered ? '#ffffff' : '#94a3b8'}
                  fontSize="9"
                  fontFamily="sans-serif"
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  className="pointer-events-none drop-shadow-sm select-none"
                >
                  {node.title.length > 15 ? `${node.title.slice(0, 14)}…` : node.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Hover Information Card */}
      {hoveredNode && (
        <div
          className="absolute bottom-3 left-3 z-20 bg-[#0f0f0f]/95 border border-[#2d2d2d] p-3 text-xs font-mono shadow-2xl backdrop-blur-md max-w-sm pointer-events-none animate-in fade-in duration-75"
          data-testid="topology-hover-card"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#222222] pb-1.5 mb-1.5">
            <span className="font-bold text-white truncate">{hoveredNode.title}</span>
            <span
              className="px-1.5 py-0.5 font-bold rounded-none text-xs"
              style={{
                backgroundColor: camelotColor(hoveredNode.camelotKey ?? ''),
                color: camelotTextColor(hoveredNode.camelotKey ?? ''),
              }}
            >
              {hoveredNode.camelotKey}
            </span>
          </div>
          <div className="text-xs text-zinc-400 truncate mb-1">{hoveredNode.artist}</div>
          <div className="grid grid-cols-3 gap-2 text-xs text-zinc-300 py-1 bg-[#141414] px-2 mb-1.5">
            <div>
              <span className="text-zinc-500 block">KEY SHIFT</span>
              <span className="text-emerald-400 font-bold">
                {anchorKey} → {hoveredNode.camelotKey}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">TEMPO Δ</span>
              <span className="text-sky-300 font-bold">
                {hoveredNode.bpmDelta !== null ? `${hoveredNode.bpmDelta >= 0 ? '+' : ''}${hoveredNode.bpmDelta.toFixed(1)}` : '—'} BPM
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">ROLE</span>
              <span className="text-amber-300 font-bold">{hoveredNode.role}</span>
            </div>
          </div>
          <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
            {hoveredNode.relationship.explanation.summary}
          </p>
        </div>
      )}

      {/* Center Track Navigation Helper HUD */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 bg-[#0d0d0d]/90 backdrop-blur-md px-3 py-1.5 border border-[#242424] text-xs font-mono">
        <span className="text-zinc-400">Anchor:</span>
        <span className="text-sky-300 font-semibold truncate max-w-[150px]">{anchorSong.title}</span>
        <button
          type="button"
          onClick={() => onHopToAnchor(anchorSong.id)}
          className="text-zinc-400 hover:text-white underline cursor-pointer text-xs"
        >
          Reset to Center
        </button>
      </div>
    </div>
  );
}
