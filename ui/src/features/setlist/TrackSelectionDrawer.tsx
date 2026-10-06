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
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-surface-panel border-l border-border-base shadow-2xl flex flex-col animate-slide-left text-content-primary">
      {/* Drawer Header */}
      <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface-panel shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-accent-blue">
              <IconPlus size={16} />
            </span>
            <h3 className="text-xs font-mono font-bold tracking-widest uppercase text-white">
              Select Tracks • Library Pool
            </h3>
          </div>
          <p className="text-xs font-mono text-content-muted mt-0.5">
            Add tracks to the setlist and monitor target duration.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-content-muted hover:text-white transition-colors cursor-pointer text-xs font-mono p-1.5 border border-transparent hover:border-border-base focus-visible:ring-1 focus-visible:ring-accent-blue"
          aria-label="Close track selection drawer"
        >
          <IconClose size={14} />
        </button>
      </div>

      {/* Target Duration Meter */}
      <div className="px-4 py-2.5 bg-surface-raised border-b border-border-subtle shrink-0">
        <div className="flex items-center justify-between text-xs font-mono mb-1.5">
          <span className="text-content-muted uppercase">Set Duration Progress:</span>
          <span className="font-semibold text-white tabular-nums">
            {formatDurationMs(totalSetlistDurationMs)} / {targetDurationMinutes}:00
            <span className="text-xs text-content-muted ml-1.5">
              ({progressPercent.toFixed(0)}%)
            </span>
          </span>
        </div>
        <div className="w-full bg-surface-elevated h-1.5 overflow-hidden border border-border-base">
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
      <div className="p-3 bg-surface-panel border-b border-border-subtle space-y-2 shrink-0">
        {/* Search Input */}
        <div className="relative">
          <IconSearch
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or artist..."
            className="w-full bg-surface-raised border border-border-base focus:border-accent-blue text-xs font-mono text-white pl-8 pr-3 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-white text-xs cursor-pointer"
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
            className="bg-surface-raised border border-border-base text-xs font-mono text-content-secondary px-2 py-1 focus:outline-none focus:border-accent-blue cursor-pointer"
          >
            <option value="all">All Keys</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).flatMap((num) => [
              <option key={`${num}A`} value={`${num}A`}>{`${num}A`}</option>,
              <option key={`${num}B`} value={`${num}B`}>{`${num}B`}</option>,
            ])}
          </select>

          <span className="text-content-muted text-xs">
            Showing {filteredTracks.length} of {tracks.length} tracks
          </span>
        </div>
      </div>

      {/* Tracks Scrollable List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredTracks.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-content-muted border border-border-subtle bg-surface-panel my-8">
            No tracks found matching query.
          </div>
        ) : (
          filteredTracks.map((t) => {
            const isInSet = setlistTrackIds.has(t.id);
            const keyStr = t.analysis?.key.camelot
              ? `${t.analysis.key.camelot.number}${t.analysis.key.camelot.letter}`
              : '-';
            const bg = keyStr !== '-' ? camelotColor(keyStr) : 'var(--color-surface-hover)';
            const fg = keyStr !== '-' ? camelotTextColor(keyStr) : 'var(--color-content-muted)';
            const bpm = t.analysis?.rhythm.grid.bpm ? Math.round(t.analysis.rhythm.grid.bpm) : 0;
            const energy = t.analysis?.energy_score ?? 5;
            const isPlaying = auditionTrackId === t.id && auditionState === 'playing';

            return (
              <div
                key={t.id}
                className={`p-2.5 border transition-colors flex items-center justify-between gap-2.5 ${
                  isInSet
                    ? 'bg-surface-raised border-emerald-500/40 text-white'
                    : 'bg-surface-panel hover:bg-surface-raised border-border-subtle text-content-primary'
                }`}
              >
                {/* Left: Play button, Camelot chip, Track details */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => void toggleAudition(t.id)}
                    className={`p-1 text-xs font-mono border transition-colors cursor-pointer rounded-none shrink-0 ${
                      isPlaying
                        ? 'border-accent-blue bg-accent-blue-subtle text-accent-blue'
                        : 'border-border-base bg-surface-raised text-content-secondary hover:text-white'
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
                    <span className="text-xs text-content-muted block truncate">
                      {t.tags.artist ?? 'Unknown Artist'}
                    </span>
                  </div>
                </div>

                {/* Right: BPM, Energy, Duration & Add/Remove Button */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-xs text-content-primary te-num tabular-nums">
                    {bpm > 0 ? (
                      <>
                        <span className="font-medium">{bpm}</span>
                        <span className="te-unit text-content-muted">BPM</span>
                      </>
                    ) : (
                      <span className="text-content-dim">-</span>
                    )}
                  </span>

                  <span
                    className="font-mono text-xs text-content-muted te-num tabular-nums"
                    title={`Energy Score: ${energy}/10`}
                  >
                    E{energy}
                  </span>

                  <span className="font-mono text-xs text-content-muted te-num tabular-nums w-10 text-right">
                    {formatDurationMs(t.duration_ms)}
                  </span>

                  <button
                    type="button"
                    onClick={() => void handleToggleTrack(t)}
                    disabled={addingTrackId === t.id}
                    className={`px-2 py-1 text-xs font-mono uppercase tracking-wider font-semibold border transition-colors cursor-pointer rounded-none ${
                      isInSet
                        ? 'border-emerald-500/60 bg-emerald-950/60 text-emerald-300 hover:bg-rose-950/60 hover:border-rose-500/60 hover:text-rose-300'
                        : 'border-border-base bg-surface-elevated hover:bg-surface-hover text-accent-blue hover:border-accent-blue'
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
      <div className="p-3 border-t border-border-subtle bg-surface-panel flex items-center justify-between text-xs font-mono shrink-0">
        <span className="text-content-muted">
          {setlist.length} track{setlist.length === 1 ? '' : 's'} in active set
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 bg-surface-elevated hover:bg-surface-hover text-white border border-border-base uppercase tracking-wider cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export default TrackSelectionDrawer;
