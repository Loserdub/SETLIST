import { useAppStore } from '../../store/useAppStore';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';
import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { ExportTarget } from '../../bindings/ExportTarget';

const TRANSITION_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ExactMatch: { bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', text: 'text-emerald-400', label: 'Exact Match' },
  RelativeSwitch: { bg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400', text: 'text-cyan-400', label: 'Relative Major/Minor' },
  Fifth: { bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400', text: 'text-blue-400', label: 'Harmonic 5th' },
  WholeStepLift: { bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400', text: 'text-amber-400', label: 'Whole Step Lift (+2)' },
  HalfStepLift: { bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400', text: 'text-rose-400', label: 'Half Step Modulation' },
  Tritone: { bg: 'bg-purple-500/10 border-purple-500/30 text-purple-400', text: 'text-purple-400', label: 'Tritone Shift (+6)' },
  Other: { bg: 'bg-slate-800 border-slate-700 text-slate-400', text: 'text-slate-400', label: 'Chromatic Shift' },
};

export function SetlistRoute() {
  const {
    setlist,
    setlistName,
    setSetlistName,
    energyProfile,
    setEnergyProfile,
    suggestOrder,
    isSuggestingOrder,
    removeFromSetlist,
    clearSetlist,
    exportSetlist,
    exportStatus,
    setRoute,
    tracks,
    addToSetlist,
  } = useAppStore();

  const handlePopulateSample = async () => {
    clearSetlist();
    const sample = tracks.slice(0, 6);
    for (const t of sample) {
      await addToSetlist(t.id);
    }
  };

  const handleExport = (target: ExportTarget) => {
    void exportSetlist(target);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Setlist Top Header */}
      <header className="p-6 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40">
        <div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={setlistName}
              onChange={(e) => setSetlistName(e.target.value)}
              className="text-xl font-bold tracking-tight text-white bg-transparent border-b border-transparent hover:border-slate-700 focus:border-emerald-500 focus:outline-none transition-colors"
            />
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono font-normal">
              {setlist.length} {setlist.length === 1 ? 'track' : 'tracks'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Build cohesive sets with automated harmonic transitions, energy arc shaping, and Rekordbox export.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Energy Profile Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase px-2">Profile:</span>
            {(['PeakPlateau', 'LinearRamp', 'Wave'] as EnergyProfile[]).map((prof) => (
              <button
                key={prof}
                type="button"
                onClick={() => setEnergyProfile(prof)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  energyProfile === prof
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {prof === 'PeakPlateau' ? 'Peak Club' : prof === 'LinearRamp' ? 'Linear Ramp' : 'Wave Arc'}
              </button>
            ))}
          </div>

          {/* Suggest Order */}
          <button
            type="button"
            onClick={() => void suggestOrder()}
            disabled={setlist.length < 2 || isSuggestingOrder}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-2"
          >
            <span>✨</span>
            <span>{isSuggestingOrder ? 'Optimizing...' : 'Suggest Order'}</span>
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase px-2">Export:</span>
            <button
              type="button"
              disabled={setlist.length === 0}
              onClick={() => handleExport('RekordboxXml')}
              className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 rounded transition-colors cursor-pointer"
            >
              XML
            </button>
            <button
              type="button"
              disabled={setlist.length === 0}
              onClick={() => handleExport('M3u8')}
              className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 rounded transition-colors cursor-pointer"
            >
              M3U8
            </button>
            <button
              type="button"
              disabled={setlist.length === 0}
              onClick={() => handleExport('SetSheetMarkdown')}
              className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 rounded transition-colors cursor-pointer"
            >
              Sheet (MD)
            </button>
          </div>

          {setlist.length > 0 && (
            <button
              type="button"
              onClick={clearSetlist}
              className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {exportStatus && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
            <span className="font-medium">✓ {exportStatus}</span>
          </div>
        )}

        {setlist.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
            <span className="text-5xl mb-3">📋</span>
            <h3 className="text-base font-bold text-slate-200">Your Setlist is Empty</h3>
            <p className="text-xs text-slate-400 max-w-md mt-1 mb-5">
              Add tracks from your library to start arranging your set. The assistant will calculate harmonic shifts, BPM alignment, and transition advice.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRoute('library')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Browse Library
              </button>
              {tracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handlePopulateSample()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Load 6 Sample Tracks
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {setlist.map((entry, idx) => {
              const track = entry.track;
              const camelot = track?.analysis?.key.camelot;
              const keyStr = camelot ? `${camelot.number}${camelot.letter}` : '—';
              const bg = camelot ? camelotColor(camelot) : '#475569';
              const fg = camelot ? camelotTextColor(camelot) : '#ffffff';
              const transition = entry.transition;
              const style = transition ? TRANSITION_TYPE_STYLES[transition.transition_type] ?? TRANSITION_TYPE_STYLES.Other : null;

              return (
                <div key={`${entry.track_id}-${entry.position}`} className="space-y-2">
                  {/* Transition Card between Tracks */}
                  {transition && style && (
                    <div className="ml-8 pl-6 border-l-2 border-dashed border-slate-700/60 py-2">
                      <div className={`p-3 rounded-xl border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs ${style.bg}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-bold uppercase tracking-wider text-[11px]">
                            ⚡ {style.label}
                          </span>
                          <span className="text-slate-400 font-mono">
                            ΔBPM: {transition.bpm_delta > 0 ? `+${transition.bpm_delta}` : transition.bpm_delta}
                          </span>
                          <span className="text-slate-400 font-mono">
                            Distance: {transition.key_distance} {transition.mode_flip ? '(flip)' : ''}
                          </span>
                          {transition.intervention_required && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold uppercase tracking-wide border border-rose-500/40">
                              Intervention Needed
                            </span>
                          )}
                        </div>

                        {transition.notes.length > 0 && (
                          <div className="text-[11px] text-slate-300 truncate max-w-md">
                            {transition.notes[0]}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Track Card */}
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex items-center justify-between gap-4 hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-4">
                      {/* Position Number */}
                      <span className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-mono font-bold text-sm text-slate-300 shrink-0">
                        {idx + 1}
                      </span>

                      {/* Camelot Badge */}
                      <span
                        className="px-2.5 py-1 rounded-md font-mono text-xs font-bold shadow-xs shrink-0"
                        style={{ backgroundColor: bg, color: fg }}
                      >
                        {keyStr}
                      </span>

                      {/* Track Details */}
                      <div>
                        <div className="font-semibold text-white text-sm">
                          {track?.tags.title ?? 'Untitled'}
                        </div>
                        <div className="text-xs text-slate-400">
                          {track?.tags.artist ?? 'Unknown Artist'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold text-slate-200">
                          {track?.analysis?.rhythm.grid.bpm.toFixed(1) ?? '—'} <span className="text-[10px] text-slate-500">BPM</span>
                        </div>
                        <div className="text-[11px] font-mono text-amber-400">
                          Energy: {track?.analysis?.energy_score ?? '—'}/10
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void removeFromSetlist(entry.position)}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 flex items-center justify-center text-xs transition-colors cursor-pointer"
                        title="Remove track from setlist"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
