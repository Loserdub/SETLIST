import { useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';

export function LibraryRoute() {
  const {
    tracks,
    loadTracks,
    scanFolder,
    isLoadingTracks,
    tracksError,
    searchQuery,
    setSearchQuery,
    selectTrack,
    setRoute,
    addToSetlist,
    setlist,
  } = useAppStore();

  useEffect(() => {
    if (tracks.length === 0 && !isLoadingTracks && !tracksError) {
      void loadTracks();
    }
  }, [tracks.length, isLoadingTracks, tracksError, loadTracks]);

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.tags.title?.toLowerCase().includes(q) ||
        t.tags.artist?.toLowerCase().includes(q) ||
        t.tags.album?.toLowerCase().includes(q) ||
        t.analysis?.key.camelot.number.toString().includes(q) ||
        `${t.analysis?.key.camelot.number}${t.analysis?.key.camelot.letter}`.toLowerCase().includes(q)
    );
  }, [tracks, searchQuery]);

  const setlistTrackIds = useMemo(
    () => new Set(setlist.map((e) => e.track_id)),
    [setlist]
  );

  const formatDuration = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Action Bar */}
      <header className="p-6 border-b border-slate-800/80 flex items-center justify-between gap-4 bg-slate-900/40">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span>Music Library</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono font-normal">
              {filteredTracks.length} {filteredTracks.length === 1 ? 'track' : 'tracks'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Browse analyzed tracks, check Camelot keys, and queue into your setlist.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Search title, artist, key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3.5 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 w-64 transition-colors"
          />
          <button
            type="button"
            onClick={() => void scanFolder('C:/Music')}
            disabled={isLoadingTracks}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-2"
          >
            <span>{isLoadingTracks ? 'Scanning...' : 'Scan Folder'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {tracksError && (
          <div className="mb-4 p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {tracksError}
          </div>
        )}

        {filteredTracks.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
            <span className="text-4xl mb-3">📂</span>
            <h3 className="text-base font-semibold text-slate-300">
              {searchQuery ? 'No matching tracks found' : 'Your library is empty'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              {searchQuery
                ? 'Try a different search query or clear the filter.'
                : 'Click "Scan Folder" above to analyze your local audio library with the mock backend.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 text-xs text-emerald-400 hover:underline cursor-pointer"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : (
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 shadow-sm">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-900/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Track</th>
                  <th className="py-3 px-4">Key</th>
                  <th className="py-3 px-4">BPM</th>
                  <th className="py-3 px-4">Energy</th>
                  <th className="py-3 px-4">Length</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredTracks.map((track) => {
                  const camelot = track.analysis?.key.camelot;
                  const keyStr = camelot ? `${camelot.number}${camelot.letter}` : '—';
                  const bg = camelot ? camelotColor(camelot) : '#475569';
                  const fg = camelot ? camelotTextColor(camelot) : '#ffffff';
                  const energy = track.analysis?.energy_score ?? 5;
                  const inSetlist = setlistTrackIds.has(track.id);

                  return (
                    <tr
                      key={track.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => {
                        selectTrack(track.id);
                        setRoute('track');
                      }}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-white group-hover:text-emerald-400 transition-colors">
                          {track.tags.title ?? 'Unknown Title'}
                        </div>
                        <div className="text-xs text-slate-400">
                          {track.tags.artist ?? 'Unknown Artist'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-bold shadow-xs"
                          style={{ backgroundColor: bg, color: fg }}
                        >
                          {keyStr}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        {track.analysis ? `${track.analysis.rhythm.grid.bpm.toFixed(1)}` : '—'}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 10 }, (_, idx) => (
                            <span
                              key={idx}
                              className={`w-1.5 h-3 rounded-xs ${
                                idx < energy ? 'bg-amber-400' : 'bg-slate-800'
                              }`}
                            />
                          ))}
                          <span className="ml-1.5 text-xs font-mono text-slate-400">
                            {energy}/10
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-xs text-slate-400">
                        {formatDuration(track.duration_ms)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              selectTrack(track.id);
                              setRoute('track');
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            disabled={inSetlist}
                            onClick={() => void addToSetlist(track.id)}
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                              inSetlist
                                ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            }`}
                          >
                            {inSetlist ? 'In Set' : '+ Add'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
