import { useMemo, useState } from 'react';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { Song } from '../../bindings/Song';
import { trackToSong } from '../../api';
import { getCamelotDistance } from '../library/harmonic';

export interface MacroSetlistAnalyzerProps {
  entries: SetlistEntry[];
  songs?: Song[];
  onSelectTrack?: (trackId: string) => void;
  className?: string;
}

export interface MacroTransitionStep {
  index: number;
  fromSong: Song;
  toSong: Song;
  fromTitle: string;
  toTitle: string;
  bpmDelta: number;
  keyDistance: number | null;
  modeFlip: boolean;
  isHarmonicClash: boolean;
  isTempoClash: boolean;
  isClash: boolean;
  clashReason: string | null;
}

export interface MacroSequenceMetrics {
  totalTracks: number;
  totalPlaytimeSeconds: number;
  formattedPlaytime: string;
  averageBpm: number | null;
  minBpm: number | null;
  maxBpm: number | null;
  bpmSpan: number | null;
  averageEnergy: number | null;
  smoothCount: number;
  clashCount: number;
  transitions: MacroTransitionStep[];
  points: Array<{
    x: number;
    y: number;
    song: Song;
    position: number;
    energy: number;
  }>;
}

/**
 * Formats total seconds into human-readable aggregate playtime (e.g. "1h 14m 20s" or "42m 18s").
 */
export function formatAggregatePlaytime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0m 00s';
  const totalSecs = Math.round(totalSeconds);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

/**
 * Pure function to calculate macro-level metrics across a sequenced tracklist.
 */
export function computeMacroSequenceMetrics(
  entries: SetlistEntry[],
  catalogSongs?: Song[]
): MacroSequenceMetrics {
  const songs: Song[] = entries.map((entry) => {
    if (entry.track) {
      return trackToSong(entry.track);
    }
    const found = catalogSongs?.find((s) => s.id === entry.track_id);
    if (found) return found;

    return {
      id: entry.track_id,
      title: `Track #${entry.position}`,
      artist: 'Unknown Artist',
      duration_seconds: 0,
      bpm: null,
      musical_key: null,
      mode: null,
      camelot_code: null,
      tuning: 'Standard',
      capo: 0,
      energy_rating: entry.target_energy ?? 5,
      lead_performer: null,
      tags: [],
      notes: null,
    };
  });

  const totalTracks = songs.length;
  const totalPlaytimeSeconds = songs.reduce((acc, s) => acc + s.duration_seconds, 0);
  const formattedPlaytime = formatAggregatePlaytime(totalPlaytimeSeconds);

  // BPM statistics
  const bpmValues = songs.map((s) => s.bpm).filter((b): b is number => b !== null && b > 0);
  const averageBpm =
    bpmValues.length > 0
      ? Math.round((bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) * 10) / 10
      : null;
  const minBpm = bpmValues.length > 0 ? Math.min(...bpmValues) : null;
  const maxBpm = bpmValues.length > 0 ? Math.max(...bpmValues) : null;
  const bpmSpan = minBpm !== null && maxBpm !== null ? Math.round((maxBpm - minBpm) * 10) / 10 : null;

  // Energy statistics
  const energyValues = songs.map((s) => s.energy_rating ?? 5);
  const averageEnergy =
    energyValues.length > 0
      ? Math.round((energyValues.reduce((a, b) => a + b, 0) / energyValues.length) * 10) / 10
      : null;

  // Static Transition Step Evaluation ($d \le 2$ and $\Delta\text{BPM} \le 8$)
  const transitions: MacroTransitionStep[] = [];
  let smoothCount = 0;
  let clashCount = 0;

  for (let i = 0; i < songs.length - 1; i++) {
    const fromSong = songs[i];
    const toSong = songs[i + 1];

    const bpmDelta =
      fromSong.bpm !== null && toSong.bpm !== null
        ? Math.round(Math.abs(toSong.bpm - fromSong.bpm) * 10) / 10
        : 0;

    const fromKey = fromSong.camelot_code ?? fromSong.musical_key;
    const toKey = toSong.camelot_code ?? toSong.musical_key;
    const keyDistance = fromKey && toKey ? getCamelotDistance(fromKey, toKey) : null;

    const fromMode = fromSong.mode ?? (fromKey ? (fromKey.endsWith('A') ? 'Minor' : 'Major') : null);
    const toMode = toSong.mode ?? (toKey ? (toKey.endsWith('A') ? 'Minor' : 'Major') : null);
    const modeFlip = fromMode !== null && toMode !== null && fromMode !== toMode;

    const isHarmonicClash = keyDistance !== null && keyDistance > 2;
    const isTempoClash = bpmDelta > 8;
    const isClash = isHarmonicClash || isTempoClash;

    let clashReason: string | null = null;
    if (isHarmonicClash && isTempoClash) {
      clashReason = `Harmonic clash (d=${keyDistance} > 2) & Tempo gap (ΔBPM=${bpmDelta} > 8)`;
    } else if (isHarmonicClash) {
      clashReason = `Harmonic clash (Camelot distance d=${keyDistance} > 2)`;
    } else if (isTempoClash) {
      clashReason = `Tempo shift exceeds tolerance (ΔBPM=${bpmDelta} > 8)`;
    }

    if (isClash) {
      clashCount++;
    } else {
      smoothCount++;
    }

    transitions.push({
      index: i + 1,
      fromSong,
      toSong,
      fromTitle: fromSong.title,
      toTitle: toSong.title,
      bpmDelta,
      keyDistance,
      modeFlip,
      isHarmonicClash,
      isTempoClash,
      isClash,
      clashReason,
    });
  }

  // Energy Curve Coordinate Generation (for SVG graph: viewBox 0 0 760 140)
  const svgWidth = 760;
  const svgHeight = 140;
  const paddingX = 40;
  const paddingY = 24;
  const usableWidth = svgWidth - paddingX * 2;
  const usableHeight = svgHeight - paddingY * 2;

  const points = songs.map((song, idx) => {
    const energy = song.energy_rating ?? 5;
    const x =
      songs.length === 1
        ? svgWidth / 2
        : paddingX + (idx / (songs.length - 1)) * usableWidth;
    // Map energy 1..10 to Y coordinate (invert so 10 is at top)
    const normalizedEnergy = Math.max(1, Math.min(10, energy));
    const y = paddingY + usableHeight - ((normalizedEnergy - 1) / 9) * usableHeight;

    return {
      x,
      y,
      song,
      position: idx + 1,
      energy,
    };
  });

  return {
    totalTracks,
    totalPlaytimeSeconds,
    formattedPlaytime,
    averageBpm,
    minBpm,
    maxBpm,
    bpmSpan,
    averageEnergy,
    smoothCount,
    clashCount,
    transitions,
    points,
  };
}

/**
 * MacroSetlistAnalyzer — Studio Mode Static Sequence Analysis & Energy Curve HUD.
 *
 * Provides macro-level album/setlist sequence evaluation:
 * - Aggregate total playtime
 * - Static energy curve graph across fullSong domain scores
 * - Static harmonic clash ($d \le 2$) and tempo clash ($\Delta\text{BPM} \le 8$) detection
 *
 * Neutral, analytical aesthetic: Zero neon CDJ hardware styling, zero audio transport coupling.
 */
export function MacroSetlistAnalyzer({
  entries,
  songs: catalogSongs,
  onSelectTrack,
  className = '',
}: MacroSetlistAnalyzerProps) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [filterClashesOnly, setFilterClashesOnly] = useState(false);

  const metrics = useMemo(
    () => computeMacroSequenceMetrics(entries, catalogSongs),
    [entries, catalogSongs]
  );

  if (entries.length === 0) {
    return null;
  }

  // Build SVG polyline points string
  const polylinePoints = metrics.points.map((p) => `${p.x},${p.y}`).join(' ');

  // Build area fill path
  const areaPath =
    metrics.points.length > 0
      ? `M ${metrics.points[0].x},${140 - 24} ` +
        metrics.points.map((p) => `L ${p.x},${p.y}`).join(' ') +
        ` L ${metrics.points[metrics.points.length - 1].x},${140 - 24} Z`
      : '';

  const displayedTransitions = filterClashesOnly
    ? metrics.transitions.filter((t) => t.isClash)
    : metrics.transitions;

  return (
    <div
      className={`bg-[#0d0d0d] border border-[#222222] rounded-none p-4 font-mono select-none space-y-4 shadow-sm ${className}`}
      data-testid="macro-setlist-analyzer"
    >
      {/* 1. Header & Sequence Telemetry Readouts */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#1c1c1c] pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              MACRO SEQUENCE ANALYSIS
            </span>
            <span className="text-xs text-[#666666]">|</span>
            <span className="text-xs text-[#a8a8a8]">Static Setlist Co-Pilot</span>
          </div>
          <p className="text-xs text-[#71717a]">
            Pre-flight transition compatibility and structural energy arc analysis.
          </p>
        </div>

        {/* Telemetry Chips (Neutral & Analytical) */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Total Playtime Chip */}
          <div
            className="px-2.5 py-1 bg-[#141414] border border-[#27272a] text-[#ededed] flex items-center gap-1.5"
            data-testid="macro-total-playtime"
            title={`Aggregate runtime across all ${metrics.totalTracks} sequenced tracks`}
          >
            <span className="text-[#a1a1aa] font-semibold">PLAYTIME:</span>
            <span className="font-bold">{metrics.formattedPlaytime}</span>
          </div>

          {/* Average Tempo Chip */}
          {metrics.averageBpm !== null && (
            <div
              className="px-2.5 py-1 bg-[#141414] border border-[#27272a] text-[#ededed] flex items-center gap-1.5"
              data-testid="macro-tempo-overview"
              title={`Average BPM: ${metrics.averageBpm} (Span: ${metrics.minBpm} - ${metrics.maxBpm} BPM)`}
            >
              <span className="text-[#a1a1aa] font-semibold">BPM:</span>
              <span>{metrics.averageBpm}</span>
              {metrics.bpmSpan !== null && metrics.bpmSpan > 0 && (
                <span className="text-xs text-[#71717a]">({metrics.minBpm}–{metrics.maxBpm})</span>
              )}
            </div>
          )}

          {/* Average Energy Chip */}
          {metrics.averageEnergy !== null && (
            <div
              className="px-2.5 py-1 bg-[#141414] border border-[#27272a] text-[#ededed] flex items-center gap-1.5"
              data-testid="macro-energy-overview"
              title="Average track energy score on a 1-10 scale"
            >
              <span className="text-[#a1a1aa] font-semibold">AVG ENERGY:</span>
              <span>{metrics.averageEnergy}/10</span>
            </div>
          )}

          {/* Sequence Health Chip */}
          <div
            className={`px-2.5 py-1 border flex items-center gap-1.5 ${
              metrics.clashCount > 0
                ? 'bg-[#181111] border-[#451e1e] text-[#fca5a5]'
                : 'bg-[#0f1713] border-[#1e3a2b] text-[#86efac]'
            }`}
            data-testid="macro-sequence-health"
          >
            <span className="font-semibold">
              {metrics.clashCount === 0
                ? '✓ 100% COMPATIBLE'
                : `⚠ ${metrics.clashCount} CLASH${metrics.clashCount === 1 ? '' : 'ES'}`}
            </span>
            <span className="text-xs text-[#a1a1aa]">({metrics.smoothCount} clean)</span>
          </div>
        </div>
      </div>

      {/* 2. Static Energy Curve Graph (SVG) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-[#a8a8a8]">
          <span className="uppercase font-semibold tracking-wider text-[#cfcfcf]">
            ENERGY ARC TRAJECTORY (1–10)
          </span>
          <span className="text-xs text-[#71717a]">
            Hover node to inspect track metadata
          </span>
        </div>

        <div className="relative bg-[#080808] border border-[#1f1f1f] p-2 overflow-hidden">
          <svg
            viewBox="0 0 760 140"
            className="w-full h-32 overflow-visible"
            role="img"
            aria-label="Setlist Energy Curve"
          >
            <defs>
              <linearGradient id="macroEnergyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines (Energy levels 2, 4, 6, 8, 10) */}
            {[2, 4, 6, 8, 10].map((level) => {
              const y = 24 + (140 - 48) - ((level - 1) / 9) * (140 - 48);
              return (
                <g key={level}>
                  <line
                    x1="40"
                    y1={y}
                    x2="720"
                    y2={y}
                    stroke="#1c1c1c"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x="24"
                    y={y + 3}
                    fill="#666666"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    E{level}
                  </text>
                </g>
              );
            })}

            {/* Area under curve */}
            {areaPath && <path d={areaPath} fill="url(#macroEnergyFill)" />}

            {/* Connecting Stroke */}
            {metrics.points.length > 1 && (
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylinePoints}
              />
            )}

            {/* Track Data Nodes */}
            {metrics.points.map((pt) => {
              const isHovered = hoveredPoint === pt.position;
              return (
                <g
                  key={pt.position}
                  className="cursor-pointer transition-transform"
                  onMouseEnter={() => setHoveredPoint(pt.position)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onClick={() => onSelectTrack?.(pt.song.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Track ${pt.position}: ${pt.song.title}, Energy ${pt.energy}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectTrack?.(pt.song.id);
                    }
                  }}
                >
                  {/* Subtle pulsing halo when hovered */}
                  {isHovered && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="9"
                      fill="#38bdf8"
                      fillOpacity="0.25"
                    />
                  )}

                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 5.5 : 4}
                    fill={isHovered ? '#ffffff' : '#38bdf8'}
                    stroke="#0a0a0a"
                    strokeWidth="2"
                  />

                  {/* Position number pill below coordinate */}
                  <text
                    x={pt.x}
                    y={134}
                    fill={isHovered ? '#ffffff' : '#888888'}
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                    fontWeight={isHovered ? 'bold' : 'normal'}
                  >
                    #{pt.position}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Hover Tooltip Overlay */}
          {hoveredPoint !== null && (
            <div
              className="absolute top-2 right-2 px-3 py-1.5 bg-[#121212] border border-[#2b2b2b] text-xs shadow-md z-10 space-y-0.5"
              data-testid="energy-point-tooltip"
            >
              {(() => {
                const pt = metrics.points.find((p) => p.position === hoveredPoint);
                if (!pt) return null;
                const key = pt.song.camelot_code || pt.song.musical_key || '—';
                return (
                  <>
                    <p className="font-semibold text-white truncate max-w-xs">
                      #{pt.position}. {pt.song.title}
                    </p>
                    <div className="flex items-center gap-2 text-[#a8a8a8] text-xs">
                      <span>Energy: <strong className="text-white">{pt.energy}/10</strong></span>
                      <span>•</span>
                      <span>{pt.song.bpm ? `${pt.song.bpm} BPM` : 'BPM pending'}</span>
                      <span>•</span>
                      <span>Key: {key}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* 3. Static Transition Clash Matrix & Diagnostic Feed */}
      {metrics.transitions.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#1c1c1c]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white">
                TRANSITION CLASH AUDIT
              </span>
              <span className="text-xs text-[#a8a8a8]">
                (Criteria: Harmonic Distance d ≤ 2 &amp; ΔBPM ≤ 8)
              </span>
            </div>

            {metrics.clashCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterClashesOnly(!filterClashesOnly)}
                className="px-2 py-0.5 text-xs text-[#cfcfcf] hover:text-white bg-[#141414] hover:bg-[#1a1a1a] border border-[#2b2b2b] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
                data-testid="filter-clashes-btn"
              >
                {filterClashesOnly ? 'Show All Transitions' : `Show Only Clashes (${metrics.clashCount})`}
              </button>
            )}
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1"
            data-testid="macro-transitions-list"
          >
            {displayedTransitions.map((step) => {
              const fromKey = step.fromSong.camelot_code || step.fromSong.musical_key || '—';
              const toKey = step.toSong.camelot_code || step.toSong.musical_key || '—';

              return (
                <div
                  key={step.index}
                  className={`p-2.5 border text-xs flex flex-col justify-between gap-1.5 transition-colors ${
                    step.isClash
                      ? 'bg-[#150d0d] border-[#4a1c1c] text-[#fca5a5]'
                      : 'bg-[#0f0f0f] border-[#222222] text-[#cfcfcf]'
                  }`}
                  data-testid={`macro-transition-step-${step.index}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">
                        #{step.index} → #{step.index + 1}
                      </p>
                      <p className="text-xs text-[#a8a8a8] truncate">
                        {step.fromTitle} ➔ {step.toTitle}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider shrink-0 border ${
                        step.isClash
                          ? 'bg-[#2b1111] text-[#f87171] border-[#572222]'
                          : 'bg-[#111c15] text-[#4ade80] border-[#1b3d28]'
                      }`}
                      data-testid={`transition-status-badge-${step.index}`}
                    >
                      {step.isClash ? '⚠ CLASH' : '✓ SMOOTH'}
                    </span>
                  </div>

                  {/* Technical Metrics Pill Grid */}
                  <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-[#1a1a1a]">
                    {/* Tempo Delta */}
                    <span
                      className={`px-1.5 py-0.5 border ${
                        step.isTempoClash
                          ? 'border-[#7f1d1d] text-[#fca5a5] bg-[#221010]'
                          : 'border-[#27272a] text-[#a1a1aa] bg-[#141414]'
                      }`}
                    >
                      ΔBPM: {step.bpmDelta.toFixed(1)} {step.isTempoClash && '(> 8)'}
                    </span>

                    {/* Key Distance */}
                    <span
                      className={`px-1.5 py-0.5 border ${
                        step.isHarmonicClash
                          ? 'border-[#7f1d1d] text-[#fca5a5] bg-[#221010]'
                          : 'border-[#27272a] text-[#a1a1aa] bg-[#141414]'
                      }`}
                    >
                      Key: {fromKey} ➔ {toKey}{' '}
                      {step.keyDistance !== null && `(d=${step.keyDistance}${step.modeFlip ? ', flip' : ''})`}
                    </span>

                    {/* Direct Reason if clashing */}
                    {step.clashReason && (
                      <span className="text-xs text-[#f87171] w-full truncate">
                        {step.clashReason}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default MacroSetlistAnalyzer;
