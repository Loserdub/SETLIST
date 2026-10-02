import { useAppStore } from '../../store/useAppStore';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';

const SEGMENT_COLORS: Record<string, string> = {
  intro: '#0284c7', // blue
  verse: '#4f46e5', // indigo
  buildup: '#ea580c', // orange
  drop: '#dc2626', // red
  breakdown: '#7c3aed', // purple
  outro: '#059669', // emerald
};

export function TrackRoute() {
  const { selectedTrack, setRoute, addToSetlist, setlist } = useAppStore();

  if (!selectedTrack) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-100 p-8 text-center">
        <span className="text-5xl mb-4">🎚️</span>
        <h2 className="text-lg font-bold text-slate-200">No Track Selected</h2>
        <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
          Select a track from your library to inspect its beat grid, 3-band waveform, cue points, and structural segments.
        </p>
        <button
          type="button"
          onClick={() => setRoute('library')}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          Browse Library
        </button>
      </div>
    );
  }

  const analysis = selectedTrack.analysis;
  const camelot = analysis?.key.camelot;
  const keyStr = camelot ? `${camelot.number}${camelot.letter}` : '—';
  const bg = camelot ? camelotColor(camelot) : '#475569';
  const fg = camelot ? camelotTextColor(camelot) : '#ffffff';
  const inSetlist = setlist.some((e) => e.track_id === selectedTrack.id);

  const formatMs = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const millis = Math.floor((ms % 1000) / 100);
    return `${mins}:${String(secs).padStart(2, '0')}.${millis}`;
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-950 text-slate-100 p-8 space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <span
              className="px-2.5 py-1 rounded-md font-mono text-sm font-bold shadow-sm"
              style={{ backgroundColor: bg, color: fg }}
            >
              {keyStr}
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {selectedTrack.tags.title ?? 'Untitled Track'}
            </h2>
          </div>
          <p className="text-sm font-medium text-slate-400">
            {selectedTrack.tags.artist ?? 'Unknown Artist'} • {selectedTrack.tags.album ?? 'Single / Unassigned'}
          </p>
          <p className="text-xs font-mono text-slate-500 truncate max-w-xl">
            {selectedTrack.path}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={inSetlist}
            onClick={() => void addToSetlist(selectedTrack.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer ${
              inSetlist
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {inSetlist ? '✓ In Active Setlist' : '+ Add to Setlist'}
          </button>
          <button
            type="button"
            onClick={() => setRoute('library')}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            Back to Library
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Tempo (BPM)
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-1">
            {analysis?.rhythm.grid.bpm.toFixed(1) ?? '—'}
          </div>
          <div className="text-[11px] text-emerald-400 mt-0.5">
            {analysis?.rhythm.grid.steady ? 'Steady metronome' : 'Drift detected'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Energy Rating
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400 mt-1">
            {analysis?.energy_score ?? '—'}/10
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Dynamic profile
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Loudness
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-1">
            {analysis?.loudness.integrated_lufs.toFixed(1) ?? '—'} <span className="text-xs text-slate-400 font-sans font-normal">LUFS</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            LRA: {analysis?.loudness.loudness_range.toFixed(1)} LU
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Tuning & Mode
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {analysis?.key.mode ?? '—'}
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
            {analysis?.key.tuning_cents ? `${analysis.key.tuning_cents > 0 ? '+' : ''}${analysis.key.tuning_cents.toFixed(1)} cents` : '440.0 Hz std'}
          </div>
        </div>
      </div>

      {/* 3-Band Waveform Overview */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            3-Band Waveform Overview
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> Low (Bass)
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Mid (Leads)
            </span>
            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-2 h-2 rounded-full bg-cyan-500" /> High (Tops)
            </span>
          </div>
        </div>

        {/* Waveform Canvas Simulation */}
        <div className="h-28 bg-slate-950/80 rounded-xl border border-slate-800/80 p-3 flex items-center justify-between gap-1 overflow-hidden">
          {analysis?.waveform.low.peak.map((peak, idx) => {
            const lowH = Math.max(4, Math.round((peak / 255) * 50));
            const midH = Math.max(4, Math.round(((analysis.waveform.mid.peak[idx] ?? 0) / 255) * 40));
            const highH = Math.max(2, Math.round(((analysis.waveform.high.peak[idx] ?? 0) / 255) * 20));

            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full">
                <span className="w-full bg-cyan-400/80 rounded-xs" style={{ height: `${highH}%` }} />
                <span className="w-full bg-emerald-400/90 rounded-xs" style={{ height: `${midH}%` }} />
                <span className="w-full bg-rose-500 rounded-xs" style={{ height: `${lowH}%` }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Structural Segments Timeline */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
          Structural Segments
        </h3>

        {/* Timeline Bar */}
        <div className="w-full h-8 bg-slate-950 rounded-xl overflow-hidden flex border border-slate-800">
          {analysis?.segments.map((seg, idx) => {
            const segDuration = seg.end_ms - seg.start_ms;
            const pct = Math.max(1, (segDuration / selectedTrack.duration_ms) * 100);
            const color = SEGMENT_COLORS[seg.label] ?? '#64748b';

            return (
              <div
                key={idx}
                className="h-full flex items-center justify-center text-[10px] font-bold text-white uppercase tracking-wider overflow-hidden px-1 border-r border-slate-900/80 transition-opacity hover:opacity-90"
                style={{ width: `${pct}%`, backgroundColor: color }}
                title={`${seg.label}: ${formatMs(seg.start_ms)} - ${formatMs(seg.end_ms)} (Energy ${seg.energy})`}
              >
                <span className="truncate">{seg.label}</span>
              </div>
            );
          })}
        </div>

        {/* Segments Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {analysis?.segments.map((seg, idx) => (
            <div
              key={idx}
              className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 text-xs flex flex-col gap-0.5"
            >
              <div className="flex items-center gap-1.5 font-semibold text-slate-200 uppercase text-[10px]">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: SEGMENT_COLORS[seg.label] }}
                />
                {seg.label}
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                {formatMs(seg.start_ms)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cue Points Registers A-H */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
          Cue Points (Registers A – H)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {analysis?.cue_points.map((cue) => {
            const letter = String.fromCharCode(65 + cue.index); // A, B, C...
            return (
              <div
                key={cue.index}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 flex items-start gap-3"
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs text-white shrink-0"
                  style={{ backgroundColor: cue.color_hex }}
                >
                  {letter}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs text-white truncate">
                    {cue.label}
                  </div>
                  <div className="font-mono text-[11px] text-emerald-400 mt-0.5">
                    {formatMs(cue.time_ms)}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">
                    {cue.kind}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
