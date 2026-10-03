import { useState, useEffect, useMemo } from 'react';
import type { Song } from '../../bindings/Song';
import type { SongRelationship } from '../../bindings/SongRelationship';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { useAppStore } from '../../store/useAppStore';
import { getBackend } from '../../api';

interface PathExplorerModalProps {
  songs: Song[];
  initialStartSongId?: string;
  onClose: () => void;
}

export function PathExplorerModal({
  songs,
  initialStartSongId,
  onClose,
}: PathExplorerModalProps) {
  const { useMockBackend, addToSetlist, loadSetlist, addToast, tracks } = useAppStore();

  const [pathSongIds, setPathSongIds] = useState<string[]>(
    initialStartSongId ? [initialStartSongId] : songs.length > 0 ? [songs[0].id] : []
  );

  const [candidateTransitions, setCandidateTransitions] = useState<SongRelationship[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);

  const pathSongs = useMemo(() => {
    return pathSongIds.map((id) => songs.find((s) => s.id === id)!).filter(Boolean);
  }, [pathSongIds, songs]);

  const currentHeadId = pathSongIds[pathSongIds.length - 1] ?? null;

  useEffect(() => {
    if (!currentHeadId) {
      setCandidateTransitions([]);
      return;
    }

    let isMounted = true;
    setIsLoadingCandidates(true);
    const backend = getBackend(useMockBackend);

    backend
      .getSongRelationships(currentHeadId)
      .then((res) => {
        if (!isMounted) return;
        // Filter out songs already visited in current path
        const available = res.outgoing.filter((r) => !pathSongIds.includes(r.to_song_id));
        setCandidateTransitions(available.slice(0, 6));
        setIsLoadingCandidates(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoadingCandidates(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentHeadId, pathSongIds, useMockBackend]);

  const totalDurationSecs = useMemo(() => {
    return pathSongs.reduce((acc, s) => acc + s.duration_seconds, 0);
  }, [pathSongs]);

  const formatDuration = (secs: number): string => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${String(s).padStart(2, '0')}`;
  };

  const handleAdvancePath = (nextSongId: string) => {
    setPathSongIds((prev) => [...prev, nextSongId]);
  };

  const handleStepBack = () => {
    setPathSongIds((prev) => (prev.length > 1 ? prev.slice(0, prev.length - 1) : prev));
  };

  const handleReset = (newStartId: string) => {
    setPathSongIds([newStartId]);
  };

  const handleLoadToSetlist = async () => {
    if (pathSongs.length === 0) return;

    // Convert pathSongs to SetlistEntry items
    const entries = pathSongs.map((song, i) => {
      const track = tracks.find((t) => t.id === song.id);
      return {
        position: i + 1,
        track_id: song.id,
        track: track ?? null,
        transition: null,
        target_energy: null,
      };
    });

    loadSetlist(entries);
    addToast({
      type: 'success',
      message: 'Explored path loaded into setlist',
      details: `${pathSongs.length} tracks sequenced into active set.`,
    });
    onClose();
  };

  const handleAppendToSetlist = async () => {
    for (const song of pathSongs) {
      await addToSetlist(song.id);
    }
    addToast({
      type: 'success',
      message: 'Path appended to active setlist',
      details: `Added ${pathSongs.length} tracks.`,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
      data-testid="path-explorer-modal-overlay"
    >
      <div
        className="w-full max-w-4xl bg-[#0e0e0e] border border-[#262626] shadow-2xl flex flex-col max-h-[90vh] text-[#e2e2e2] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="path-explorer-modal"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#222222] bg-[#121212] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono tracking-widest text-[#777777] uppercase">
              INTERACTIVE PATH BUILDER
            </span>
            <h2 className="text-base font-semibold text-[#f0f0f0] font-sans">
              Explore Musical Paths Step-by-Step
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close path explorer"
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

        {/* Current Path Trail Summary Bar */}
        <div className="p-4 border-b border-[#202020] bg-[#111111] flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-[#888888] uppercase tracking-wider block">
              CURRENT PATH TRAIL ({pathSongs.length} TRACKS • ~{formatDuration(totalDurationSecs)})
            </span>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {pathSongs.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className="px-2 py-1 bg-[#1a1a1a] border border-[#2d2d2d] text-xs font-mono text-[#e0e0e0] flex items-center gap-1.5">
                    <span className="text-[#666666]">{idx + 1}.</span>
                    <span className="font-semibold">{s.title}</span>
                    {s.camelot_code && (
                      <span
                        className="px-1 py-0.2 font-bold text-[9px] rounded-[1px]"
                        style={{
                          backgroundColor: camelotColor(s.camelot_code),
                          color: camelotTextColor(s.camelot_code),
                        }}
                      >
                        {s.camelot_code}
                      </span>
                    )}
                    {s.bpm && <span className="text-[10px] text-[#888888]">{s.bpm.toFixed(0)}</span>}
                  </span>
                  {idx < pathSongs.length - 1 && <span className="text-[#666666] font-mono">→</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            {pathSongs.length > 1 && (
              <button
                type="button"
                onClick={handleStepBack}
                className="px-2.5 py-1.5 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-[#cccccc] border border-[#333333] cursor-pointer"
              >
                [← Step Back]
              </button>
            )}
            <select
              aria-label="Change starting track for path exploration"
              value={pathSongIds[0] ?? ''}
              onChange={(e) => handleReset(e.target.value)}
              className="bg-[#181818] border border-[#333333] p-1.5 text-xs text-[#b0b0b0] outline-none cursor-pointer"
            >
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  Start: {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Next Step Candidate Transitions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#999999] font-bold">
              WHAT CAN FOLLOW &quot;{pathSongs[pathSongs.length - 1]?.title}&quot;?
            </h3>
            <span className="text-[10px] font-mono text-[#666666]">
              Click a candidate to advance your path trail
            </span>
          </div>

          {isLoadingCandidates && (
            <div className="py-12 text-center text-xs font-mono text-[#666666]">
              Finding best follow-up transitions...
            </div>
          )}

          {!isLoadingCandidates && candidateTransitions.length === 0 && (
            <div className="py-12 text-center text-xs font-mono text-[#666666]">
              All available catalog songs have been sequenced in this trail.
            </div>
          )}

          {!isLoadingCandidates &&
            candidateTransitions.map((rel) => {
              return (
                <div
                  key={rel.to_song_id}
                  className="bg-[#121212] border border-[#222222] hover:border-[#3a3a3a] p-3 space-y-2 cursor-pointer transition-all"
                  onClick={() => handleAdvancePath(rel.to_song_id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {rel.to_title}
                        </span>
                        {rel.to_key && (
                          <span
                            className="px-1.5 py-0.2 font-mono font-bold text-[10px] rounded-[2px]"
                            style={{
                              backgroundColor: camelotColor(rel.to_key),
                              color: camelotTextColor(rel.to_key),
                            }}
                          >
                            {rel.to_key}
                          </span>
                        )}
                        {rel.to_bpm && (
                          <span className="text-xs font-mono text-[#888888]">
                            {rel.to_bpm.toFixed(1)} BPM
                          </span>
                        )}
                        {rel.to_energy && (
                          <span className="text-xs font-mono text-[#666666]">E{rel.to_energy}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono text-[#aaaaaa]">
                        <span>
                          {rel.explanation.bpm.delta !== null
                            ? `${rel.explanation.bpm.delta >= 0 ? '+' : ''}${rel.explanation.bpm.delta.toFixed(1)} BPM`
                            : '—'}
                        </span>
                        <span>•</span>
                        <span>{rel.explanation.harmony.relation}</span>
                        <span>•</span>
                        <span>{rel.primary_classification}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 text-xs font-mono font-bold bg-[#1a281a] text-[#88ee88] border border-[#2a4d2a]">
                        {Math.round(rel.overall_score * 100)}%
                      </span>
                      <button
                        type="button"
                        className="px-2.5 py-1 text-[10px] font-mono uppercase bg-[#1e1e1e] hover:bg-[#282828] text-white border border-[#333333]"
                      >
                        [+ Chain Step]
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#888888] truncate">{rel.explanation.summary}</p>
                </div>
              );
            })}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-[#222222] bg-[#111111] flex items-center justify-between text-xs font-mono">
          <span className="text-[10px] text-[#666666]">
            Total path: {pathSongs.length} track{pathSongs.length === 1 ? '' : 's'} (~
            {formatDuration(totalDurationSecs)})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAppendToSetlist}
              className="px-3 py-1.5 bg-[#1b1b1b] hover:bg-[#252525] text-[#d0d0d0] border border-[#333333] uppercase cursor-pointer"
            >
              Append Path to Setlist
            </button>
            <button
              type="button"
              onClick={handleLoadToSetlist}
              className="px-3.5 py-1.5 bg-[#1a2d1a] hover:bg-[#244224] text-[#88ee88] border border-[#2d5a2d] font-semibold uppercase cursor-pointer"
            >
              Load as Active Setlist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
