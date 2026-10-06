import { useState, useEffect, useMemo } from 'react';
import type { Song } from '../../bindings/Song';
import type { BridgeCandidateAnalysis } from '../../bindings/BridgeCandidateAnalysis';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { useAppStore } from '../../store/useAppStore';
import { getBackend } from '../../api';

interface BridgeDiscoveryModalProps {
  songs: Song[];
  initialSongAId?: string;
  initialSongBId?: string;
  onClose: () => void;
}

export function BridgeDiscoveryModal({
  songs,
  initialSongAId,
  initialSongBId,
  onClose,
}: BridgeDiscoveryModalProps) {
  const useMockBackend = useAppStore((s) => s.useMockBackend);
  const addToSetlist = useAppStore((s) => s.addToSetlist);
  const addToast = useAppStore((s) => s.addToast);

  const [songAId, setSongAId] = useState<string>(
    initialSongAId ?? (songs.length > 0 ? songs[0].id : '')
  );
  const [songBId, setSongBId] = useState<string>(
    initialSongBId ?? (songs.length > 1 ? songs[1].id : '')
  );

  const [candidates, setCandidates] = useState<BridgeCandidateAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const songA = useMemo(() => songs.find((s) => s.id === songAId) ?? null, [songs, songAId]);
  const songB = useMemo(() => songs.find((s) => s.id === songBId) ?? null, [songs, songBId]);

  useEffect(() => {
    if (!songAId || !songBId || songAId === songBId) {
      setCandidates([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    const backend = getBackend(useMockBackend);

    backend
      .getPotentialBridges(songAId, songBId, 6)
      .then((res) => {
        if (!isMounted) return;
        setCandidates(res);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setIsLoading(false);
        addToast({
          type: 'error',
          message: 'Failed to discover bridge tracks',
          details: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      isMounted = false;
    };
  }, [songAId, songBId, useMockBackend, addToast]);

  const handleAddFullRoute = async (bridgeSongId: string) => {
    try {
      await addToSetlist(songAId);
      await addToSetlist(bridgeSongId);
      await addToSetlist(songBId);
      addToast({
        type: 'success',
        message: '3-track bridge sequence added to setlist',
        details: `${songA?.title} → Bridge → ${songB?.title}`,
      });
      onClose();
    } catch {
      // ignore
    }
  };

  const handleAddBridgeOnly = async (bridgeSongId: string) => {
    try {
      await addToSetlist(bridgeSongId);
      addToast({
        type: 'success',
        message: 'Bridge track added to active setlist',
      });
    } catch {
      // ignore
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'HarmonicBridge':
        return { label: 'HARMONIC BRIDGE', bg: 'bg-surface-elevated text-accent-blue border-border-strong' };
      case 'TempoBridge':
        return { label: 'TEMPO BRIDGE', bg: 'bg-surface-hover text-content-secondary border-border-strong' };
      case 'EnergyBridge':
        return { label: 'ENERGY STAGING', bg: 'bg-status-success-dim text-accent-blue border-accent-blue-dim' };
      case 'StyleBridge':
      default:
        return { label: 'TUNING/STYLE BRIDGE', bg: 'bg-surface-elevated text-status-danger border-border-base' };
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
      data-testid="bridge-discovery-modal-overlay"
    >
      <div
        className="w-full max-w-4xl bg-surface-panel border border-border-base shadow-2xl flex flex-col max-h-[90vh] text-content-primary overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="bridge-discovery-modal"
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-border-base bg-surface-raised flex items-center justify-between">
          <div>
            <span className="text-xs font-mono tracking-wider text-content-muted uppercase">
              CATALOG BRIDGE DISCOVERY
            </span>
            <h2 className="text-base font-semibold text-content-primary font-sans">
              What can get me from Track A to Track B?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bridge discovery modal"
            className="p-1.5 text-content-muted hover:text-white hover:bg-surface-hover transition-colors rounded-none cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Source & Destination Track Selectors */}
        <div className="p-4 border-b border-border-subtle bg-surface-panel grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Song A (Source) */}
          <div className="space-y-1.5 bg-surface-raised p-3 border border-border-base">
            <label
              htmlFor="song-a-select"
              className="text-xs font-mono uppercase font-bold text-content-muted tracking-wider block"
            >
              SOURCE TRACK (SONG A)
            </label>
            <select
              id="song-a-select"
              value={songAId}
              onChange={(e) => setSongAId(e.target.value)}
              className="w-full bg-surface-panel border border-border-strong text-xs font-mono p-2 text-white outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue"
              data-testid="select-song-a"
            >
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.camelot_code ?? '?'}, {s.bpm ? `${s.bpm.toFixed(0)} BPM` : '?'}, E
                  {s.energy_rating ?? '?'})
                </option>
              ))}
            </select>

            {songA && (
              <div className="flex items-center gap-2 pt-1 text-xs font-mono text-content-muted">
                {songA.camelot_code && (
                  <span
                    className="px-1.5 py-0.2 font-bold rounded-[2px] text-xs"
                    style={{
                      backgroundColor: camelotColor(songA.camelot_code),
                      color: camelotTextColor(songA.camelot_code),
                    }}
                  >
                    {songA.camelot_code}
                  </span>
                )}
                <span className="text-content-secondary">{songA.bpm ? `${songA.bpm.toFixed(1)} BPM` : '—'}</span>
                <span>•</span>
                <span>Energy {songA.energy_rating ?? '—'}/10</span>
              </div>
            )}
          </div>

          {/* Song B (Destination) */}
          <div className="space-y-1.5 bg-surface-raised p-3 border border-border-base">
            <label
              htmlFor="song-b-select"
              className="text-xs font-mono uppercase font-bold text-content-muted tracking-wider block"
            >
              DESTINATION TRACK (SONG B)
            </label>
            <select
              id="song-b-select"
              value={songBId}
              onChange={(e) => setSongBId(e.target.value)}
              className="w-full bg-surface-panel border border-border-strong text-xs font-mono p-2 text-white outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue"
              data-testid="select-song-b"
            >
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.camelot_code ?? '?'}, {s.bpm ? `${s.bpm.toFixed(0)} BPM` : '?'}, E
                  {s.energy_rating ?? '?'})
                </option>
              ))}
            </select>

            {songB && (
              <div className="flex items-center gap-2 pt-1 text-xs font-mono text-content-muted">
                {songB.camelot_code && (
                  <span
                    className="px-1.5 py-0.2 font-bold rounded-[2px] text-xs"
                    style={{
                      backgroundColor: camelotColor(songB.camelot_code),
                      color: camelotTextColor(songB.camelot_code),
                    }}
                  >
                    {songB.camelot_code}
                  </span>
                )}
                <span className="text-content-secondary">{songB.bpm ? `${songB.bpm.toFixed(1)} BPM` : '—'}</span>
                <span>•</span>
                <span>Energy {songB.energy_rating ?? '—'}/10</span>
              </div>
            )}
          </div>
        </div>

        {/* Candidate Bridge Results */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3"
          data-testid="bridge-candidates-container"
        >
          {songAId === songBId && (
            <div className="py-12 text-center text-xs font-mono text-content-muted">
              Please select two different songs to discover intermediate bridge tracks.
            </div>
          )}

          {isLoading && (
            <div className="py-12 text-center text-xs font-mono text-content-muted">
              Evaluating catalog graph for optimal intermediate bridge paths...
            </div>
          )}

          {!isLoading && songAId !== songBId && candidates.length === 0 && (
            <div className="py-12 text-center text-xs font-mono text-content-muted">
              No intermediate bridge songs found that improve upon direct transition.
            </div>
          )}

          {!isLoading &&
            candidates.map((cand, idx) => {
              const bridge = cand.bridge_song;

              return (
                <div
                  key={bridge.id}
                  className="bg-surface-raised border border-border-base hover:border-border-strong p-3.5 space-y-3 transition-all"
                  data-testid={`bridge-card-${bridge.id}`}
                >
                  {/* Candidate Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-content-muted font-bold">
                          #{idx + 1} CANDIDATE
                        </span>
                        <h3 className="text-sm font-semibold text-white truncate">{bridge.title}</h3>
                        {bridge.camelot_code && (
                          <span
                            className="px-1.5 py-0.2 font-mono font-bold text-xs rounded-[2px]"
                            style={{
                              backgroundColor: camelotColor(bridge.camelot_code),
                              color: camelotTextColor(bridge.camelot_code),
                            }}
                          >
                            {bridge.camelot_code}
                          </span>
                        )}
                        {bridge.bpm && (
                          <span className="text-xs font-mono text-content-secondary">
                            {bridge.bpm.toFixed(1)} BPM
                          </span>
                        )}
                        {bridge.energy_rating && (
                          <span className="text-xs font-mono text-content-muted">
                            E{bridge.energy_rating}
                          </span>
                        )}
                      </div>

                      {/* Bridge Roles */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {cand.bridge_roles.map((role) => {
                          const badge = getRoleBadge(role);
                          return (
                            <span
                              key={role}
                              className={`px-2 py-0.5 text-xs font-mono font-bold uppercase border ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="px-2.5 py-1 text-xs font-mono font-bold bg-status-success-dim text-status-success border border-status-success">
                        {Math.round(cand.combined_score * 100)}% ROUTE SCORE
                      </span>
                    </div>
                  </div>

                  {/* Two-Leg Route Visual Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono bg-surface-panel p-2.5 border border-border-subtle">
                    {/* Leg 1: Song A -> Bridge */}
                    <div className="space-y-1 pr-2 border-r border-border-subtle">
                      <span className="text-xs text-content-muted uppercase font-bold">
                        LEG 1: {songA?.title} → {bridge.title}
                      </span>
                      <div className="flex items-center gap-2 text-content-secondary">
                        <span>
                          {cand.from_a_relationship.explanation.bpm.delta !== null
                            ? `${cand.from_a_relationship.explanation.bpm.delta >= 0 ? '+' : ''}${cand.from_a_relationship.explanation.bpm.delta.toFixed(1)} BPM`
                            : '—'}
                        </span>
                        <span>•</span>
                        <span>{cand.from_a_relationship.explanation.harmony.relation}</span>
                        <span>•</span>
                        <span>{cand.from_a_relationship.primary_classification}</span>
                      </div>
                      <p className="text-xs text-content-muted truncate">
                        {cand.from_a_relationship.explanation.summary}
                      </p>
                    </div>

                    {/* Leg 2: Bridge -> Song B */}
                    <div className="space-y-1 pl-2">
                      <span className="text-xs text-content-muted uppercase font-bold">
                        LEG 2: {bridge.title} → {songB?.title}
                      </span>
                      <div className="flex items-center gap-2 text-content-secondary">
                        <span>
                          {cand.to_b_relationship.explanation.bpm.delta !== null
                            ? `${cand.to_b_relationship.explanation.bpm.delta >= 0 ? '+' : ''}${cand.to_b_relationship.explanation.bpm.delta.toFixed(1)} BPM`
                            : '—'}
                        </span>
                        <span>•</span>
                        <span>{cand.to_b_relationship.explanation.harmony.relation}</span>
                        <span>•</span>
                        <span>{cand.to_b_relationship.primary_classification}</span>
                      </div>
                      <p className="text-xs text-content-muted truncate">
                        {cand.to_b_relationship.explanation.summary}
                      </p>
                    </div>
                  </div>

                  {/* Plain Language Reasoning */}
                  <p className="text-xs text-content-secondary font-normal leading-relaxed bg-surface-raised p-2 border border-border-base">
                    {cand.reason}
                  </p>

                  {/* Route Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-border-subtle text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => handleAddBridgeOnly(bridge.id)}
                      className="px-2.5 py-1 text-xs bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-white border border-border-strong uppercase transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
                    >
                      Add Bridge Track Only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddFullRoute(bridge.id)}
                      className="px-3 py-1 text-xs bg-surface-hover hover:bg-status-success-dim text-status-success border border-status-success font-semibold uppercase transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:outline-none"
                    >
                      Add 3-Track Sequence to Setlist
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
