import { useState } from 'react';
import type { Song } from '../../bindings/Song';
import type { RenderedTopologyNode } from './musicalTopology';
import type { SongMusicalRole } from './types';
import { getRoleShiftExplanation } from './musicalTopology';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { useAppStore } from '../../store/useAppStore';

interface MusicalRelationshipInspectorProps {
  anchorSong: Song;
  anchorRole: SongMusicalRole;
  selectedNode: RenderedTopologyNode | null;
  onClose: () => void;
  onHopToAnchor: (songId: string) => void;
  onOpenBridgeModal: (songAId: string, songBId: string) => void;
}

export function MusicalRelationshipInspector({
  anchorSong,
  anchorRole,
  selectedNode,
  onClose,
  onHopToAnchor,
  onOpenBridgeModal,
}: MusicalRelationshipInspectorProps) {
  const addToSetlist = useAppStore((s) => s.addToSetlist);
  const addToast = useAppStore((s) => s.addToast);
  const [showTechnicalBreakdown, setShowTechnicalBreakdown] = useState(false);

  const anchorKey = anchorSong.camelot_code ?? anchorSong.musical_key ?? '—';

  const handleAddTrack = async (songId: string, title: string) => {
    await addToSetlist(songId);
    addToast({
      type: 'success',
      message: 'Added track to active setlist',
      details: title,
    });
  };

  if (!selectedNode) {
    return (
      <div
        className="w-full h-full flex flex-col justify-between p-4 bg-surface-panel text-zinc-300 font-mono text-xs select-none"
        data-testid="relationship-inspector-empty"
      >
        <div className="space-y-4">
          <div className="border-b border-border-base pb-3">
            <span className="text-zinc-400 uppercase tracking-widest text-xs font-bold block mb-1">
              FOCAL TRACK PROFILE
            </span>
            <h3 className="text-sm font-bold text-white font-sans truncate">{anchorSong.title}</h3>
            <p className="text-zinc-400 text-xs truncate">{anchorSong.artist}</p>
          </div>

          <div className="bg-surface-raised p-3 border border-border-base space-y-2">
            <span className="text-xs text-zinc-400 uppercase font-bold block">
              ACOUSTIC ATTRIBUTES
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-zinc-400 block text-xs">KEY</span>
                <span
                  className="px-1.5 py-0.5 font-bold rounded-none text-xs inline-block"
                  style={{
                    backgroundColor: camelotColor(anchorKey),
                    color: camelotTextColor(anchorKey),
                  }}
                >
                  {anchorKey}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block text-xs">TEMPO</span>
                <span className="text-zinc-200 font-bold">
                  {anchorSong.bpm ? `${anchorSong.bpm.toFixed(1)} BPM` : '—'}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block text-xs">ENERGY</span>
                <span className="text-amber-400 font-bold">
                  {anchorSong.energy_rating ? `${anchorSong.energy_rating}/10` : '—'}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block text-xs">ROLE</span>
                <span className="text-sky-400 font-bold">{anchorRole}</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-surface-raised border border-border-subtle space-y-1.5 text-zinc-400 text-xs">
            <span className="text-white font-semibold block text-xs">
              Where can this track go?
            </span>
            <p className="text-xs leading-relaxed text-zinc-400">
              Select any candidate node in the musical topology or from the relationship categories
              to inspect exact harmonic shifts, tempo compatibility, and transition reasoning.
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-border-subtle text-xs text-zinc-400 text-center font-mono">
          Artist retains absolute sequencing authority.
        </div>
      </div>
    );
  }

  const rel = selectedNode.relationship;
  const candidateKey = selectedNode.camelotKey ?? '—';
  const roleShiftExplanation = getRoleShiftExplanation(anchorRole, selectedNode.role);

  // Format tempo strings
  const fromBpmStr = anchorSong.bpm ? anchorSong.bpm.toFixed(1) : '—';
  const toBpmStr = selectedNode.bpm ? selectedNode.bpm.toFixed(1) : '—';
  const bpmDeltaStr =
    selectedNode.bpmDelta !== null
      ? `${selectedNode.bpmDelta >= 0 ? '+' : ''}${selectedNode.bpmDelta.toFixed(1)} BPM`
      : '0.0 BPM';

  // Format energy strings
  const fromEnergyStr = anchorSong.energy_rating ? String(anchorSong.energy_rating) : '—';
  const toEnergyStr = selectedNode.energy ? String(selectedNode.energy) : '—';
  const energyDeltaStr =
    selectedNode.energyDelta !== null
      ? `${selectedNode.energyDelta >= 0 ? '+' : ''}${selectedNode.energyDelta}`
      : '0';

  const getCompBadgeColor = (comp: string) => {
    switch (comp) {
      case 'Excellent':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-700';
      case 'Good':
        return 'bg-teal-950/80 text-teal-300 border-teal-700';
      case 'Viable':
        return 'bg-amber-950/80 text-amber-300 border-amber-700';
      case 'Challenging':
        return 'bg-orange-950/80 text-orange-400 border-orange-700';
      default:
        return 'bg-rose-950/80 text-rose-400 border-rose-700';
    }
  };

  return (
    <div
      className="w-full h-full flex flex-col bg-surface-panel text-zinc-300 font-mono text-xs overflow-hidden select-none border-l border-border-base"
      data-testid="musical-relationship-inspector"
    >
      {/* Inspector Header */}
      <div className="p-4 border-b border-border-base bg-surface-raised space-y-2 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-zinc-400 uppercase tracking-widest font-bold">
                TRANSITION CANDIDATE
              </span>
              <span
                className={`px-1.5 py-0.5 text-xs font-mono uppercase font-bold border ${getCompBadgeColor(
                  rel.compatibility
                )}`}
              >
                {rel.compatibility} ({Math.round(rel.overall_score * 100)}%)
              </span>
            </div>
            <h2 className="text-sm font-bold text-white font-sans truncate">{selectedNode.title}</h2>
            <p className="text-xs text-zinc-400 truncate">{selectedNode.artist}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close relationship inspector"
            className="p-1 text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Primary Classification Strip */}
        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-border-subtle">
          <span className="text-zinc-400 uppercase">CLASSIFICATION:</span>
          <span className="text-sky-300 font-semibold">{rel.primary_classification}</span>
        </div>
      </div>

      {/* Main Comparative Dimensional HUD */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-0">
        {/* The 4 Core Metric Comparison Cards */}
        <div className="space-y-2" data-testid="dimensional-comparison-hud">
          {/* KEY COMPARISON */}
          <div className="p-2.5 bg-surface-raised border border-border-base space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 uppercase font-bold tracking-wider">
                KEY
              </span>
              <span className="text-xs text-emerald-400 font-semibold">
                {rel.explanation.harmony.relation}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <span
                className="px-2 py-0.5 rounded-none font-mono"
                style={{
                  backgroundColor: camelotColor(anchorKey),
                  color: camelotTextColor(anchorKey),
                }}
              >
                {anchorKey}
              </span>
              <span className="text-zinc-500 font-mono">→</span>
              <span
                className="px-2 py-0.5 rounded-none font-mono"
                style={{
                  backgroundColor: camelotColor(candidateKey),
                  color: camelotTextColor(candidateKey),
                }}
              >
                {candidateKey}
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-snug pt-0.5 font-mono">
              {rel.explanation.harmony.explanation}
            </p>
          </div>

          {/* TEMPO COMPARISON */}
          <div className="p-2.5 bg-surface-raised border border-border-base space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 uppercase font-bold tracking-wider">
                TEMPO
              </span>
              <span className="text-xs text-sky-400 font-semibold">{bpmDeltaStr}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
              <span>{fromBpmStr}</span>
              <span className="text-zinc-500 font-mono">→</span>
              <span>{toBpmStr}</span>
              <span className="text-xs text-zinc-400 font-normal">BPM</span>
            </div>
            <p className="text-xs text-zinc-400 leading-snug pt-0.5 font-mono">
              {rel.explanation.bpm.explanation}
            </p>
          </div>

          {/* ENERGY COMPARISON */}
          <div className="p-2.5 bg-surface-raised border border-border-base space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 uppercase font-bold tracking-wider">
                ENERGY
              </span>
              <span
                className={`text-xs font-semibold ${
                  rel.explanation.energy.movement === 'Rise'
                    ? 'text-amber-400'
                    : rel.explanation.energy.movement === 'Fall'
                    ? 'text-cyan-400'
                    : 'text-zinc-400'
                }`}
              >
                {rel.explanation.energy.movement} ({energyDeltaStr})
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
              <span>{fromEnergyStr}</span>
              <span className="text-zinc-500 font-mono">→</span>
              <span>{toEnergyStr}</span>
              <span className="text-xs text-zinc-400 font-normal">/ 10</span>
            </div>
            <p className="text-xs text-zinc-400 leading-snug pt-0.5 font-mono">
              {rel.explanation.energy.explanation}
            </p>
          </div>

          {/* ROLE COMPARISON */}
          <div className="p-2.5 bg-surface-raised border border-border-base space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 uppercase font-bold tracking-wider">
                ROLE
              </span>
              <span className="text-xs text-purple-400 font-semibold">
                Structural Function
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
              <span className="text-sky-300">{anchorRole}</span>
              <span className="text-zinc-500 font-mono">→</span>
              <span className="text-amber-300">{selectedNode.role}</span>
            </div>
            <p className="text-xs text-zinc-400 leading-snug pt-0.5 font-mono">
              {roleShiftExplanation}
            </p>
          </div>
        </div>

        {/* Engine Verbatim Summary */}
        <div className="p-3 bg-surface-raised border border-border-base space-y-1">
          <span className="text-xs text-sky-400 uppercase font-bold tracking-wider block">
            MUSICAL SYNTHESIS
          </span>
          <p className="text-xs text-zinc-300 leading-relaxed font-sans font-normal">
            {rel.explanation.summary}
          </p>
        </div>

        {/* Expandable Technical Friction Breakdown */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowTechnicalBreakdown(!showTechnicalBreakdown)}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
          >
            <span>{showTechnicalBreakdown ? '▼' : '▶'}</span>
            <span>{showTechnicalBreakdown ? 'Hide Detailed Friction Breakdown' : 'Show Detailed Friction Breakdown'}</span>
          </button>

          {showTechnicalBreakdown && (
            <div className="mt-2 p-2.5 bg-surface-panel border border-border-base space-y-2 text-xs font-mono">
              <div className="grid grid-cols-2 gap-2 text-zinc-400">
                <div>
                  <span className="text-zinc-400 block text-xs">HARMONIC FRICTION</span>
                  <span className="text-zinc-200">{Math.round(rel.explanation.harmony.friction * 100)}%</span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-xs">TEMPO FRICTION</span>
                  <span className="text-zinc-200">{Math.round(rel.explanation.bpm.friction * 100)}%</span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-xs">ENERGY FRICTION</span>
                  <span className="text-zinc-200">{Math.round(rel.explanation.energy.friction * 100)}%</span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-xs">TUNING SETUP</span>
                  <span className="text-zinc-200">{rel.explanation.tuning.compatibility}</span>
                </div>
              </div>

              {rel.explanation.style.shared_tags.length > 0 && (
                <div className="pt-1 border-t border-border-subtle">
                  <span className="text-zinc-400 block text-xs mb-0.5">SHARED STYLISTIC TAGS</span>
                  <div className="flex flex-wrap gap-1">
                    {rel.explanation.style.shared_tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-surface-elevated border border-border-base text-zinc-300 text-xs font-mono rounded-none"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Tray */}
      <div className="p-3 border-t border-border-base bg-surface-panel space-y-2 shrink-0">
        {/* Core Exploration Flow: Navigate Musical Topology */}
        <button
          type="button"
          onClick={() => onHopToAnchor(selectedNode.songId)}
          className="w-full py-2 px-3 bg-sky-950/80 hover:bg-sky-900 text-sky-200 border border-sky-700/80 font-semibold uppercase tracking-wider transition-colors cursor-pointer text-xs focus-visible:ring-2 focus-visible:ring-sky-400 rounded-none"
          data-testid="btn-explore-from-candidate"
        >
          Explore Where THIS Track Can Go →
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenBridgeModal(anchorSong.id, selectedNode.songId)}
            className="flex-1 py-1.5 px-2 bg-surface-raised hover:bg-surface-hover text-zinc-300 hover:text-white border border-border-base uppercase transition-colors cursor-pointer text-xs font-mono focus-visible:ring-2 focus-visible:ring-sky-400 rounded-none"
            title="Discover intermediate bridge track between these two"
          >
            Find Bridge
          </button>
          <button
            type="button"
            onClick={() => handleAddTrack(selectedNode.songId, selectedNode.title)}
            className="flex-1 py-1.5 px-2 bg-status-success-dim hover:bg-status-success-dim text-emerald-300 border border-status-success font-semibold uppercase transition-colors cursor-pointer text-xs font-mono focus-visible:ring-2 focus-visible:ring-sky-400 rounded-none"
            data-testid={`add-to-setlist-${selectedNode.songId}`}
          >
            + Add to Setlist
          </button>
        </div>
      </div>
    </div>
  );
}
