import { useState, useMemo } from 'react';
import type { Track } from '../../bindings/Track';
import { useAppStore } from '../../store/useAppStore';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import { formatDurationMs } from './roles';
import { IconClose, IconSearch, IconPlay, IconPause, IconCheck, IconPlus } from '../../components/icons';

interface TrackSelectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  targetDurationMinutes: number;
}

export function TrackSelectionDrawer({
  isOpen,
  onClose,
  targetDurationMinutes,
}: TrackSelectionDrawerProps) {
  const tracks = useAppStore((s) => s.tracks);
  const setlist = useAppStore((s) => s.setlist);
  const addToSetlist = useAppStore((s) => s.addToSetlist);
  const removeFromSetlist = useAppStore((s) => s.removeFromSetlist);
  const auditionTrackId = useAppStore((s) => s.auditionTrackId);
  const auditionState = useAppStore((s) => s.auditionState);
  const toggleAudition = useAppStore((s) => s.toggleAudition);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string>('all');
  const bpmMin = 0;
  const bpmMax = 200;
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);

  // Setlist track IDs set for fast lookup
  const setlistTrackIds = useMemo(() => {
    return new Set(setlist.map((e) => e.track_id));
  }, [setlist]);

  // Current setlist duration
  const totalSetlistDurationMs = useMemo(() => {
    return setlist.reduce((acc, entry) => acc + (entry.track?.duration_ms ?? 0), 0);
  }, [setlist]);

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tracks.filter((t) => {
      // Query filter
      if (q) {
        const title = (t.tags.title ?? '').toLowerCase();
        const artist = (t.tags.artist ?? '').toLowerCase();
        if (!title.includes(q) && !artist.includes(q)) return false;
      }

      // Key filter
      if (selectedKey !== 'all') {
        const camelot = t.analysis?.key.camelot
          ? `${t.analysis.key.camelot.number}${t.analysis.key.camelot.letter}`
          : null;
        if (camelot !== selectedKey) return false;
      }

      // BPM filter
      const bpm = t.analysis?.rhythm.grid.bpm ?? 0;
      if (bpmMin > 0 && bpm < bpmMin) return false;
      if (bpmMax < 200 && bpm > bpmMax) return false;

      return true;
    });
  }, [tracks, searchQuery, selectedKey, bpmMin, bpmMax]);

  if (!isOpen) return null;

  const targetDurationMs = targetDurationMinutes * 60 * 1000;
  const progressPercent = Math.min(
    100,
    targetDurationMs > 0 ? (totalSetlistDurationMs / targetDurationMs) * 100 : 0
  );

  const handleToggleTrack = async (track: Track) => {
    if (setlistTrackIds.has(track.id)) {
      const entry = setlist.find((e) => e.track_id === track.id);
      if (entry) {
        await removeFromSetlist(entry.position);
      }
    } else {
      setAddingTrackId(track.id);
      try {
        await addToSetlist(track.id);
      } finally {
        setAddingTrackId(null);
      }
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#0a0a0a] border-l border-[#222222] shadow-2xl flex flex-col animate-slide-left text-[#ededed]">
      {/* Drawer Header */}
      <div className="p-4 border-b border-[#1c1c1c] flex items-center justify-between bg-[#0e0e0e] shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[#38bdf8]">
              <IconPlus size={16} />
            </span>
            <h3 className="text-xs font-mono font-bold tracking-widest uppercase text-white">
              Select Tracks • Library Pool
            </h3>
          </div>
          <p className="text-xs font-mono text-[#a8a8a8] mt-0.5">
            Add tracks to the setlist and monitor target duration.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-[#a8a8a8] hover:text-white transition-colors cursor-pointer text-xs font-mono p-1.5 border border-transparent hover:border-[#2e2e2e] focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
          aria-label="Close track selection drawer"
        >
          <IconClose size={14} />
        </button>
      </div>

      {/* Target Duration Meter */}
      <div className="px-4 py-2.5 bg-[#111111] border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center justify-between text-xs font-mono mb-1.5">
          <span className="text-[#a8a8a8] uppercase">Set Duration Progress:</span>
          <span className="font-semibold text-white tabular-nums">
            {formatDurationMs(totalSetlistDurationMs)} / {targetDurationMinutes}:00
            <span className="text-xs text-[#a8a8a8] ml-1.5">
              ({progressPercent.toFixed(0)}%)
            </span>
          </span>
        </div>
        <div className="w-full bg-[#181818] h-1.5 overflow-hidden border border-[#242424]">
          <div
            className={`h-full transition-all duration-300 ${
              progressPercent >= 100
                ? 'bg-amber-400'
                : 'bg-linear-to-r from-sky-500 to-indigo-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Search & Filters */}
      <div className="p-3 bg-[#0c0c0c] border-b border-[#1c1c1c] space-y-2 shrink-0">
        {/* Search Input */}
        <div className="relative">
          <IconSearch
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#777777]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or artist..."
            className="w-full bg-[#141414] border border-[#262626] focus:border-[#38bdf8] text-xs font-mono text-white pl-8 pr-3 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#888888] hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="bg-[#141414] border border-[#262626] text-xs font-mono text-[#cccccc] px-2 py-1 focus:outline-none focus:border-[#38bdf8] cursor-pointer"
          >
            <option value="all">All Keys</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).flatMap((num) => [
              <option key={`${num}A`} value={`${num}A`}>{`${num}A`}</option>,
              <option key={`${num}B`} value={`${num}B`}>{`${num}B`}</option>,
            ])}
          </select>

          <span className="text-[#a8a8a8] text-xs">
            Showing {filteredTracks.length} of {tracks.length} tracks
          </span>
        </div>
      </div>

      {/* Tracks Scrollable List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredTracks.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-[#a8a8a8] border border-[#1c1c1c] bg-[#0c0c0c] my-8">
            No tracks found matching query.
          </div>
        ) : (
          filteredTracks.map((t) => {
            const isInSet = setlistTrackIds.has(t.id);
            const keyStr = t.analysis?.key.camelot
              ? `${t.analysis.key.camelot.number}${t.analysis.key.camelot.letter}`
              : '-';
            const bg = keyStr !== '-' ? camelotColor(keyStr) : '#22222a';
            const fg = keyStr !== '-' ? camelotTextColor(keyStr) : '#9898a4';
            const bpm = t.analysis?.rhythm.grid.bpm ? Math.round(t.analysis.rhythm.grid.bpm) : 0;
            const energy = t.analysis?.energy_score ?? 5;
            const isPlaying = auditionTrackId === t.id && auditionState === 'playing';

            return (
              <div
                key={t.id}
                className={`p-2.5 border transition-colors flex items-center justify-between gap-2.5 ${
                  isInSet
                    ? 'bg-[#121c16] border-emerald-500/40 text-white'
                    : 'bg-[#0e0e0e] hover:bg-[#141414] border-[#1e1e1e] text-[#ededed]'
                }`}
              >
                {/* Left: Play button, Camelot chip, Track details */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => void toggleAudition(t.id)}
                    className={`p-1 text-xs font-mono border transition-colors cursor-pointer rounded-none shrink-0 ${
                      isPlaying
                        ? 'border-[#38bdf8] bg-[#142332] text-[#38bdf8]'
                        : 'border-[#262626] bg-[#161616] text-[#cccccc] hover:text-white'
                    }`}
                    title={isPlaying ? 'Pause' : 'Audition'}
                  >
                    {isPlaying ? <IconPause size={11} /> : <IconPlay size={11} />}
                  </button>

                  <span
                    className="font-mono font-bold text-xs te-num px-1.5 py-0.5 rounded-[2px] tracking-tight shrink-0 text-center w-7 border border-black/30"
                    style={{ backgroundColor: bg, color: fg }}
                  >
                    {keyStr}
                  </span>

                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold block truncate">
                      {t.tags.title ?? 'Untitled Track'}
                    </span>
                    <span className="text-xs text-[#a8a8a8] block truncate">
                      {t.tags.artist ?? 'Unknown Artist'}
                    </span>
                  </div>
                </div>

                {/* Right: BPM, Energy, Duration & Add/Remove Button */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-xs text-[#ededed] te-num tabular-nums">
                    {bpm > 0 ? (
                      <>
                        <span className="font-medium">{bpm}</span>
                        <span className="te-unit text-[#71717a]">BPM</span>
                      </>
                    ) : (
                      <span className="text-[#646472]">-</span>
                    )}
                  </span>

                  <span
                    className="font-mono text-xs text-[#a8a8a8] te-num tabular-nums"
                    title={`Energy Score: ${energy}/10`}
                  >
                    E{energy}
                  </span>

                  <span className="font-mono text-xs text-[#9898a4] te-num tabular-nums w-10 text-right">
                    {formatDurationMs(t.duration_ms)}
                  </span>

                  <button
                    type="button"
                    onClick={() => void handleToggleTrack(t)}
                    disabled={addingTrackId === t.id}
                    className={`px-2 py-1 text-xs font-mono uppercase tracking-wider font-semibold border transition-colors cursor-pointer rounded-none ${
                      isInSet
                        ? 'border-emerald-500/60 bg-emerald-950/60 text-emerald-300 hover:bg-rose-950/60 hover:border-rose-500/60 hover:text-rose-300'
                        : 'border-[#2c2c2c] bg-[#181818] hover:bg-[#222222] text-[#38bdf8] hover:border-[#38bdf8]'
                    }`}
                    title={isInSet ? 'Remove from setlist' : 'Add to setlist'}
                  >
                    {addingTrackId === t.id ? (
                      '...'
                    ) : isInSet ? (
                      <span className="flex items-center gap-1">
                        <IconCheck size={11} /> In Set
                      </span>
                    ) : (
                      '+ Add'
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Drawer Footer */}
      <div className="p-3 border-t border-[#1c1c1c] bg-[#0c0c0c] flex items-center justify-between text-xs font-mono shrink-0">
        <span className="text-[#a8a8a8]">
          {setlist.length} track{setlist.length === 1 ? '' : 's'} in active set
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 bg-[#181818] hover:bg-[#222222] text-white border border-[#2b2b2b] uppercase tracking-wider cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export default TrackSelectionDrawer;
