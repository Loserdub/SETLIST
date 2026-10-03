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
  const { useMockBackend, addToSetlist, addToast } = useAppStore();

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
        return { label: 'HARMONIC BRIDGE', bg: 'bg-[#20152a] text-[#d985ff] border-[#552066]' };
      case 'TempoBridge':
        return { label: 'TEMPO BRIDGE', bg: 'bg-[#2a2410] text-[#eedd77] border-[#665510]' };
      case 'EnergyBridge':
        return { label: 'ENERGY STAGING', bg: 'bg-[#102a24] text-[#77eedd] border-[#106655]' };
      case 'StyleBridge':
      default:
        return { label: 'TUNING/STYLE BRIDGE', bg: 'bg-[#2a101d] text-[#ee77b4] border-[#661042]' };
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
      data-testid="bridge-discovery-modal-overlay"
    >
      <div
        className="w-full max-w-4xl bg-[#0e0e0e] border border-[#262626] shadow-2xl flex flex-col max-h-[90vh] text-[#e2e2e2] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="bridge-discovery-modal"
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-[#222222] bg-[#121212] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono tracking-widest text-[#777777] uppercase">
              CATALOG BRIDGE DISCOVERY
            </span>
            <h2 className="text-base font-semibold text-[#f0f0f0] font-sans">
              What can get me from Track A to Track B?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bridge discovery modal"
            className="p-1.5 text-[#777777] hover:text-white hover:bg-[#222222] transition-colors rounded-none cursor-pointer"
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
        <div className="p-4 border-b border-[#1f1f1f] bg-[#0d0d0d] grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Song A (Source) */}
          <div className="space-y-1.5 bg-[#141414] p-3 border border-[#242424]">
            <label
              htmlFor="song-a-select"
              className="text-[10px] font-mono uppercase font-bold text-[#888888] tracking-wider block"
            >
              SOURCE TRACK (SONG A)
            </label>
            <select
              id="song-a-select"
              value={songAId}
              onChange={(e) => setSongAId(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#333333] text-xs font-mono p-2 text-white outline-none cursor-pointer"
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
              <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-[#888888]">
                {songA.camelot_code && (
                  <span
                    className="px-1.5 py-0.2 font-bold rounded-[2px] text-[10px]"
                    style={{
                      backgroundColor: camelotColor(songA.camelot_code),
                      color: camelotTextColor(songA.camelot_code),
                    }}
                  >
                    {songA.camelot_code}
                  </span>
                )}
                <span>{songA.bpm ? `${songA.bpm.toFixed(1)} BPM` : '—'}</span>
                <span>•</span>
                <span>Energy {songA.energy_rating ?? '—'}/10</span>
              </div>
            )}
          </div>

          {/* Song B (Destination) */}
          <div className="space-y-1.5 bg-[#141414] p-3 border border-[#242424]">
            <label
              htmlFor="song-b-select"
              className="text-[10px] font-mono uppercase font-bold text-[#888888] tracking-wider block"
            >
              DESTINATION TRACK (SONG B)
            </label>
            <select
              id="song-b-select"
              value={songBId}
              onChange={(e) => setSongBId(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#333333] text-xs font-mono p-2 text-white outline-none cursor-pointer"
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
              <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-[#888888]">
                {songB.camelot_code && (
                  <span
                    className="px-1.5 py-0.2 font-bold rounded-[2px] text-[10px]"
                    style={{
                      backgroundColor: camelotColor(songB.camelot_code),
                      color: camelotTextColor(songB.camelot_code),
                    }}
                  >
                    {songB.camelot_code}
                  </span>
                )}
                <span>{songB.bpm ? `${songB.bpm.toFixed(1)} BPM` : '—'}</span>
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
            <div className="py-12 text-center text-xs font-mono text-[#777777]">
              Please select two different songs to discover intermediate bridge tracks.
            </div>
          )}

          {isLoading && (
            <div className="py-12 text-center text-xs font-mono text-[#777777]">
              Evaluating catalog graph for optimal intermediate bridge paths...
            </div>
          )}

          {!isLoading && songAId !== songBId && candidates.length === 0 && (
            <div className="py-12 text-center text-xs font-mono text-[#777777]">
              No intermediate bridge songs found that improve upon direct transition.
            </div>
          )}

          {!isLoading &&
            candidates.map((cand, idx) => {
              const bridge = cand.bridge_song;

              return (
                <div
                  key={bridge.id}
                  className="bg-[#131313] border border-[#252525] hover:border-[#353535] p-3.5 space-y-3 transition-all"
                  data-testid={`bridge-card-${bridge.id}`}
                >
                  {/* Candidate Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[#888888] font-bold">
                          #{idx + 1} CANDIDATE
                        </span>
                        <h3 className="text-sm font-semibold text-white truncate">{bridge.title}</h3>
                        {bridge.camelot_code && (
                          <span
                            className="px-1.5 py-0.2 font-mono font-bold text-[10px] rounded-[2px]"
                            style={{
                              backgroundColor: camelotColor(bridge.camelot_code),
                              color: camelotTextColor(bridge.camelot_code),
                            }}
                          >
                            {bridge.camelot_code}
                          </span>
                        )}
                        {bridge.bpm && (
                          <span className="text-xs font-mono text-[#999999]">
                            {bridge.bpm.toFixed(1)} BPM
                          </span>
                        )}
                        {bridge.energy_rating && (
                          <span className="text-xs font-mono text-[#666666]">
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
                              className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase border ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="px-2.5 py-1 text-xs font-mono font-bold bg-[#1b2b1b] text-[#99ee99] border border-[#2d552d]">
                        {Math.round(cand.combined_score * 100)}% ROUTE SCORE
                      </span>
                    </div>
                  </div>

                  {/* Two-Leg Route Visual Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono bg-[#0a0a0a] p-2.5 border border-[#1c1c1c]">
                    {/* Leg 1: Song A -> Bridge */}
                    <div className="space-y-1 pr-2 border-r border-[#1c1c1c]">
                      <span className="text-[10px] text-[#777777] uppercase font-bold">
                        LEG 1: {songA?.title} → {bridge.title}
                      </span>
                      <div className="flex items-center gap-2 text-[#b0b0b0]">
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
                      <p className="text-[10px] text-[#777777] truncate">
                        {cand.from_a_relationship.explanation.summary}
                      </p>
                    </div>

                    {/* Leg 2: Bridge -> Song B */}
                    <div className="space-y-1 pl-2">
                      <span className="text-[10px] text-[#777777] uppercase font-bold">
                        LEG 2: {bridge.title} → {songB?.title}
                      </span>
                      <div className="flex items-center gap-2 text-[#b0b0b0]">
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
                      <p className="text-[10px] text-[#777777] truncate">
                        {cand.to_b_relationship.explanation.summary}
                      </p>
                    </div>
                  </div>

                  {/* Plain Language Reasoning */}
                  <p className="text-xs text-[#cccccc] font-normal leading-relaxed bg-[#111111] p-2 border border-[#202020]">
                    {cand.reason}
                  </p>

                  {/* Route Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#1e1e1e] text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => handleAddBridgeOnly(bridge.id)}
                      className="px-2.5 py-1 text-[11px] bg-[#1e1e1e] hover:bg-[#282828] text-[#cccccc] hover:text-white border border-[#333333] uppercase transition-colors cursor-pointer"
                    >
                      Add Bridge Track Only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddFullRoute(bridge.id)}
                      className="px-3 py-1 text-[11px] bg-[#1a2d1a] hover:bg-[#244224] text-[#88ee88] border border-[#2d5a2d] font-semibold uppercase transition-colors cursor-pointer"
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
