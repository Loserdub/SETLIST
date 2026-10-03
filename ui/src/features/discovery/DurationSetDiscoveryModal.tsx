import { useState, useEffect } from 'react';
import type { Song } from '../../bindings/Song';
import type { DiscoveryCandidatePath } from '../../bindings/DiscoveryCandidatePath';
import type { DiscoveryConstraints } from '../../bindings/DiscoveryConstraints';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { useAppStore } from '../../store/useAppStore';
import { getBackend } from '../../api';

interface DurationSetDiscoveryModalProps {
  songs: Song[];
  onClose: () => void;
}

export function DurationSetDiscoveryModal({
  songs,
  onClose,
}: DurationSetDiscoveryModalProps) {
  const { useMockBackend, loadSetlist, addToast, tracks } = useAppStore();

  const [targetDurationMin, setTargetDurationMin] = useState<number>(45);
  const [startSongId, setStartSongId] = useState<string>('');
  const [endSongId, setEndSongId] = useState<string>('');
  const [mustIncludeIds, setMustIncludeIds] = useState<string[]>([]);

  const [candidatePaths, setCandidatePaths] = useState<DiscoveryCandidatePath[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number>(0);

  const handleRunDiscovery = () => {
    setIsLoading(true);
    const backend = getBackend(useMockBackend);

    const constraints: DiscoveryConstraints = {
      start_song_id: startSongId || null,
      end_song_id: endSongId || null,
      must_include_ids: mustIncludeIds,
      target_duration_minutes: targetDurationMin > 0 ? targetDurationMin : null,
      duration_tolerance_minutes: 5.0,
      limit: 5,
    };

    backend
      .exploreCandidatePaths(constraints)
      .then((paths) => {
        setCandidatePaths(paths);
        setSelectedPathIndex(0);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        setIsLoading(false);
        addToast({
          type: 'error',
          message: 'Path discovery failed',
          details: err instanceof Error ? err.message : String(err),
        });
      });
  };

  useEffect(() => {
    handleRunDiscovery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMustInclude = (id: string) => {
    setMustIncludeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleApplyPathToSetlist = (path: DiscoveryCandidatePath) => {
    const entries = path.songs.map((song, i) => {
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
      message: 'Candidate set loaded into active setlist',
      details: `${path.songs.length} tracks sequenced (~${Math.round(
        path.total_duration_seconds / 60
      )} min).`,
    });
    onClose();
  };

  const activePath = candidatePaths[selectedPathIndex] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
      data-testid="duration-discovery-modal-overlay"
    >
      <div
        className="w-full max-w-5xl bg-[#0e0e0e] border border-[#262626] shadow-2xl flex flex-col max-h-[90vh] text-[#e2e2e2] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="duration-discovery-modal"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#222222] bg-[#121212] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono tracking-widest text-[#777777] uppercase">
              DURATION-AWARE SET DISCOVERY
            </span>
            <h2 className="text-base font-semibold text-[#f0f0f0] font-sans">
              Discover Full Candidate Sequences By Duration &amp; Constraints
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close duration discovery modal"
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

        {/* Constraint Controls Bar */}
        <div className="p-4 border-b border-[#202020] bg-[#101010] grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
          {/* Duration Selector */}
          <div className="space-y-1 bg-[#141414] p-2.5 border border-[#242424]">
            <span className="text-[10px] text-[#777777] uppercase font-bold block">
              TARGET DURATION
            </span>
            <div className="flex gap-1">
              {[30, 45, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTargetDurationMin(d)}
                  className={`flex-1 py-1 text-center font-bold text-xs border cursor-pointer ${
                    targetDurationMin === d
                      ? 'bg-[#222222] text-white border-[#555555]'
                      : 'bg-[#0a0a0a] text-[#777777] border-[#222222] hover:text-[#cccccc]'
                  }`}
                >
                  {d}m
                </button>
              ))}
            </div>
          </div>

          {/* Anchor Start Song */}
          <div className="space-y-1 bg-[#141414] p-2.5 border border-[#242424]">
            <span className="text-[10px] text-[#777777] uppercase font-bold block">
              START WITH (OPENER)
            </span>
            <select
              aria-label="Select opener track to anchor set discovery"
              value={startSongId}
              onChange={(e) => setStartSongId(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] p-1.5 text-xs text-[#b0b0b0] outline-none cursor-pointer truncate"
            >
              <option value="">(Any Natural Opener)</option>
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>

          {/* Anchor Closer Song */}
          <div className="space-y-1 bg-[#141414] p-2.5 border border-[#242424]">
            <span className="text-[10px] text-[#777777] uppercase font-bold block">
              END WITH (CLOSER)
            </span>
            <select
              aria-label="Select closer track to anchor set discovery"
              value={endSongId}
              onChange={(e) => setEndSongId(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] p-1.5 text-xs text-[#b0b0b0] outline-none cursor-pointer truncate"
            >
              <option value="">(Any Natural Closer)</option>
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>

          {/* Generate Button */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRunDiscovery}
              disabled={isLoading}
              className="w-full py-2.5 bg-[#1a2e1a] hover:bg-[#244224] text-[#88ee88] border border-[#2d5a2d] font-semibold uppercase transition-colors cursor-pointer text-center"
            >
              {isLoading ? 'Computing Paths...' : 'Discover Candidate Sets'}
            </button>
          </div>
        </div>

        {/* Must Include Songs Filter Drawer */}
        <div className="px-4 py-2 bg-[#0c0c0c] border-b border-[#1a1a1a] flex items-center gap-2 text-[11px] font-mono overflow-x-auto">
          <span className="text-[#666666] shrink-0 font-bold uppercase">MUST INCLUDE:</span>
          {songs.slice(0, 10).map((s) => {
            const isIncluded = mustIncludeIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleMustInclude(s.id)}
                className={`px-2 py-0.5 border text-[10px] shrink-0 cursor-pointer ${
                  isIncluded
                    ? 'bg-[#1b2b1b] border-[#335533] text-[#88ee88]'
                    : 'bg-[#121212] border-[#222222] text-[#777777] hover:text-[#bbbbbb]'
                }`}
              >
                {isIncluded ? '✓ ' : '+ '}
                {s.title}
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Candidate Paths List (Left Sidebar) */}
          <div className="w-full md:w-80 border-r border-[#202020] bg-[#0b0b0b] overflow-y-auto p-3 space-y-2">
            <span className="text-[10px] font-mono text-[#666666] uppercase font-bold block pb-1">
              DISCOVERED CANDIDATE SETS ({candidatePaths.length})
            </span>

            {isLoading && (
              <div className="py-8 text-center text-xs font-mono text-[#666666]">
                Searching graph paths...
              </div>
            )}

            {!isLoading && candidatePaths.length === 0 && (
              <div className="py-8 text-center text-xs font-mono text-[#666666]">
                No paths found matching constraints. Try adjusting target duration or anchors.
              </div>
            )}

            {!isLoading &&
              candidatePaths.map((path, idx) => {
                const isSelected = selectedPathIndex === idx;
                const mins = Math.round(path.total_duration_seconds / 60);

                return (
                  <div
                    key={path.song_ids.join('-')}
                    onClick={() => setSelectedPathIndex(idx)}
                    className={`p-3 border cursor-pointer transition-all space-y-1.5 ${
                      isSelected
                        ? 'bg-[#151515] border-[#444444] text-white'
                        : 'bg-[#0f0f0f] border-[#202020] text-[#888888] hover:text-[#cccccc] hover:bg-[#121212]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-[#e0e0e0]">Option #{idx + 1}</span>
                      <span className="text-emerald-400 font-bold">
                        {Math.round(path.average_score * 100)}% Match
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-[#777777] flex items-center justify-between">
                      <span>
                        {path.songs.length} tracks • ~{mins} min
                      </span>
                      <span>Min: {Math.round(path.min_score * 100)}%</span>
                    </div>

                    <div className="text-[10px] font-mono text-[#666666] truncate">
                      {path.songs[0]?.title} → {path.songs[path.songs.length - 1]?.title}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Path Details & Explainable Transitions (Right View) */}
          <div className="flex-1 bg-[#0d0d0d] overflow-y-auto p-4 space-y-4">
            {activePath ? (
              <div className="space-y-4">
                {/* Summary Banner */}
                <div className="p-3.5 bg-[#121212] border border-[#242424] space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-[#777777] uppercase font-bold">
                        CANDIDATE SEQUENCE DETAILS
                      </span>
                      <h3 className="text-sm font-semibold text-white font-sans">
                        {activePath.summary}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyPathToSetlist(activePath)}
                      className="px-3.5 py-1.5 text-xs font-mono bg-[#1a2d1a] hover:bg-[#244224] text-[#88ee88] border border-[#2d5a2d] font-semibold uppercase cursor-pointer"
                    >
                      Load This Set into Setlist
                    </button>
                  </div>

                  {/* Energy Progression Map */}
                  <div className="pt-2 border-t border-[#1c1c1c] flex items-center gap-2 text-xs font-mono">
                    <span className="text-[10px] text-[#666666] uppercase font-bold">
                      ENERGY CURVE:
                    </span>
                    <div className="flex items-center gap-1.5">
                      {activePath.energy_progression.map((e, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <span
                            className="px-1.5 py-0.2 text-[10px] font-bold text-black rounded-[1px]"
                            style={{
                              backgroundColor:
                                e >= 8 ? '#e11d48' : e >= 5 ? '#d97706' : '#059669',
                            }}
                          >
                            E{e}
                          </span>
                          {i < activePath.energy_progression.length - 1 && (
                            <span className="text-[#444444]">→</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Step-by-Step Transition Journey Cards */}
                <div className="space-y-3">
                  <span className="text-[10px] font-mono text-[#777777] uppercase font-bold tracking-wider block">
                    STEP-BY-STEP TRANSITION BREAKDOWN ({activePath.transitions.length} TRANSITIONS)
                  </span>

                  {activePath.songs.map((song, i) => {
                    const nextSong = activePath.songs[i + 1] ?? null;
                    const transition = activePath.transitions[i] ?? null;

                    return (
                      <div key={song.id} className="space-y-2">
                        {/* Song Card */}
                        <div className="p-3 bg-[#131313] border border-[#222222] flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-[#1e1e1e] text-[#888888] font-mono text-xs flex items-center justify-center font-bold">
                              {i + 1}
                            </span>
                            <div>
                              <h4 className="text-xs font-semibold text-white">{song.title}</h4>
                              <p className="text-[10px] text-[#777777]">{song.artist}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 font-mono text-xs">
                            {song.camelot_code && (
                              <span
                                className="px-1.5 py-0.2 font-bold text-[10px] rounded-[2px]"
                                style={{
                                  backgroundColor: camelotColor(song.camelot_code),
                                  color: camelotTextColor(song.camelot_code),
                                }}
                              >
                                {song.camelot_code}
                              </span>
                            )}
                            {song.bpm && (
                              <span className="text-[11px] text-[#999999]">
                                {song.bpm.toFixed(0)} BPM
                              </span>
                            )}
                            {song.energy_rating && (
                              <span className="text-[11px] text-[#666666]">
                                E{song.energy_rating}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Transition Connector Card */}
                        {nextSong && transition && (
                          <div className="mx-6 p-2.5 bg-[#0a0a0a] border-l-2 border-emerald-500/80 pl-3 space-y-1 text-xs font-mono">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-[#a0a0a0] font-medium">
                                Transition into #{i + 2} ({nextSong.title})
                              </span>
                              <span className="text-emerald-400 font-bold">
                                {transition.primary_classification} •{' '}
                                {Math.round(transition.overall_score * 100)}%
                              </span>
                            </div>
                            <p className="text-[10px] text-[#777777]">
                              {transition.explanation.summary}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs font-mono text-[#666666]">
                Select a candidate sequence from the left to inspect its detailed transitions.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
