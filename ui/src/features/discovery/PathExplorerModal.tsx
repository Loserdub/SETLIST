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
  const useMockBackend = useAppStore((s) => s.useMockBackend);
  const addToSetlist = useAppStore((s) => s.addToSetlist);
  const loadSetlist = useAppStore((s) => s.loadSetlist);
  const addToast = useAppStore((s) => s.addToast);
  const tracks = useAppStore((s) => s.tracks);

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
        className="w-full max-w-4xl bg-surface-panel border border-border-base shadow-2xl flex flex-col max-h-[90vh] text-content-primary overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="path-explorer-modal"
      >
        {/* Header */}
        <div className="p-4 border-b border-border-base bg-surface-raised flex items-center justify-between">
          <div>
            <span className="text-xs font-mono text-content-muted uppercase">
              INTERACTIVE PATH BUILDER
            </span>
            <h2 className="text-base font-semibold text-content-primary font-sans">
              Explore Musical Paths Step-by-Step
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close path explorer"
            className="p-1.5 text-content-muted hover:text-white hover:bg-surface-hover transition-colors rounded-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
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
        <div className="p-4 border-b border-border-base bg-surface-raised flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-mono text-content-muted uppercase block">
              CURRENT PATH TRAIL ({pathSongs.length} TRACKS • ~{formatDuration(totalDurationSecs)})
            </span>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {pathSongs.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className="px-2 py-1 bg-surface-elevated border border-border-base text-xs font-mono text-content-primary flex items-center gap-1.5">
                    <span className="text-content-muted">{idx + 1}.</span>
                    <span className="font-semibold">{s.title}</span>
                    {s.camelot_code && (
                      <span
                        className="px-1.5 py-0.5 font-bold text-xs rounded-[1px]"
                        style={{
                          backgroundColor: camelotColor(s.camelot_code),
                          color: camelotTextColor(s.camelot_code),
                        }}
                      >
                        {s.camelot_code}
                      </span>
                    )}
                    {s.bpm && <span className="text-xs text-content-muted">{s.bpm.toFixed(0)}</span>}
                  </span>
                  {idx < pathSongs.length - 1 && <span className="text-content-muted font-mono">→</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            {pathSongs.length > 1 && (
              <button
                type="button"
                onClick={handleStepBack}
                className="px-2.5 py-1.5 bg-surface-elevated hover:bg-surface-hover text-content-secondary border border-border-strong cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
              >
                [← Step Back]
              </button>
            )}
            <select
              aria-label="Change starting track for path exploration"
              value={pathSongIds[0] ?? ''}
              onChange={(e) => handleReset(e.target.value)}
              className="bg-surface-elevated border border-border-strong p-1.5 text-xs text-content-secondary outline-none focus:ring-1 focus:ring-sky-400 cursor-pointer"
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
            <h3 className="text-xs font-mono text-content-secondary font-bold">
              WHAT CAN FOLLOW &quot;{pathSongs[pathSongs.length - 1]?.title}&quot;?
            </h3>
            <span className="text-xs font-mono text-content-muted">
              Click a candidate to advance your path trail
            </span>
          </div>

          {isLoadingCandidates && (
            <div className="py-12 text-center text-xs font-mono text-content-muted">
              Finding best follow-up transitions...
            </div>
          )}

          {!isLoadingCandidates && candidateTransitions.length === 0 && (
            <div className="py-12 text-center text-xs font-mono text-content-muted">
              All available catalog songs have been sequenced in this trail.
            </div>
          )}

          {!isLoadingCandidates &&
            candidateTransitions.map((rel) => {
              return (
                <div
                  key={rel.to_song_id}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleAdvancePath(rel.to_song_id);
                    }
                  }}
                  className="bg-surface-raised border border-border-base hover:border-border-strong p-3 space-y-2 cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-sky-400"
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
                            className="px-1.5 py-0.5 font-mono font-bold text-xs rounded-[2px]"
                            style={{
                              backgroundColor: camelotColor(rel.to_key),
                              color: camelotTextColor(rel.to_key),
                            }}
                          >
                            {rel.to_key}
                          </span>
                        )}
                        {rel.to_bpm && (
                          <span className="text-xs font-mono text-content-muted">
                            {rel.to_bpm.toFixed(1)} BPM
                          </span>
                        )}
                        {rel.to_energy && (
                          <span className="text-xs font-mono text-content-muted">E{rel.to_energy}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono text-content-muted">
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
                      <span className="px-2 py-0.5 text-xs font-mono font-bold bg-status-success-dim text-status-success border border-status-success">
                        {Math.round(rel.overall_score * 100)}%
                      </span>
                      <button
                        type="button"
                        className="px-2.5 py-1 text-xs font-mono uppercase bg-surface-elevated hover:bg-surface-hover text-white border border-border-strong focus:outline-none focus:ring-1 focus:ring-sky-400"
                      >
                        [+ Chain Step]
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-content-muted truncate">{rel.explanation.summary}</p>
                </div>
              );
            })}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-border-base bg-surface-raised flex items-center justify-between text-xs font-mono">
          <span className="text-xs text-content-muted">
            Total path: {pathSongs.length} track{pathSongs.length === 1 ? '' : 's'} (~
            {formatDuration(totalDurationSecs)})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAppendToSetlist}
              className="px-3 py-1.5 bg-surface-elevated hover:bg-surface-hover text-content-secondary border border-border-strong uppercase cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
            >
              Append Path to Setlist
            </button>
            <button
              type="button"
              onClick={handleLoadToSetlist}
              className="px-3.5 py-1.5 bg-surface-hover hover:bg-status-success-dim text-status-success border border-status-success font-semibold uppercase cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400"
            >
              Load as Active Setlist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
