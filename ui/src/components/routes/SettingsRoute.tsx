import { useAppStore } from '../../store/useAppStore';

export function SettingsRoute() {
  const {
    costWeights,
    setCostWeights,
    useMockBackend,
    setUseMockBackend,
    fetchPing,
    pingResult,
    isLoading,
    error,
  } = useAppStore();

  const handleResetWeights = () => {
    setCostWeights({
      tempo: 0.3,
      key: 0.35,
      energy: 0.35,
      timbre: 0.0,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-950 text-slate-100 p-8 space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <span>⚙️</span>
          <span>Application Settings</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Tune the transition cost model, select backend providers, and verify Tauri desktop integration.
        </p>
      </div>

      {/* Backend Selection & Ping Verification */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-6">
        <div>
          <h3 className="text-base font-bold text-white">Backend Provider</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Switch between in-memory mock data (40 analyzed tracks) and native Tauri IPC backend.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => setUseMockBackend(true)}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              useMockBackend
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 shadow-xs'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-white">Mock In-Memory Backend</span>
              {useMockBackend && <span className="text-xs text-emerald-400">● Active</span>}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              40 generated tracks with complete beat grids, 3-band waveforms, cue points, and simulated progress.
            </p>
          </div>

          <div
            onClick={() => setUseMockBackend(false)}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              !useMockBackend
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 shadow-xs'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-white">Tauri Native Backend</span>
              {!useMockBackend && <span className="text-xs text-emerald-400">● Active</span>}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Calls native Rust backend via Tauri IPC (`invoke`). Throws "not wired" for pending v1 integrations.
            </p>
          </div>
        </div>

        {/* Backend Ping Verification Section */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Tauri IPC Ping Verification
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void fetchPing()}
              disabled={isLoading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {isLoading ? 'Pinging...' : 'Send Ping'}
            </button>
            <div className="text-xs font-mono">
              Status:{' '}
              {error ? (
                <span className="text-rose-400">{error}</span>
              ) : (
                <span className="text-emerald-400" data-testid="ping-result">
                  {pingResult ?? 'Ready'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transition Cost Model Weights */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Transition Cost Model Weights</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tune the objective weights used during automated setlist sequencing per AGENTS.md section 6.3.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetWeights}
            className="text-xs text-emerald-400 hover:underline cursor-pointer"
          >
            Reset Defaults
          </button>
        </div>

        <div className="space-y-4">
          {/* Tempo Weight */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-300">Tempo Weight (w_tempo)</span>
              <span className="font-mono text-emerald-400">{costWeights.tempo.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={costWeights.tempo}
              onChange={(e) => setCostWeights({ tempo: parseFloat(e.target.value) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Key Weight */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-300">Key Distance Weight (w_key)</span>
              <span className="font-mono text-emerald-400">{costWeights.key.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={costWeights.key}
              onChange={(e) => setCostWeights({ key: parseFloat(e.target.value) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Energy Weight */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-300">Energy Step Weight (w_energy)</span>
              <span className="font-mono text-emerald-400">{costWeights.energy.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={costWeights.energy}
              onChange={(e) => setCostWeights({ energy: parseFloat(e.target.value) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Timbre Weight (Locked 0.0 in v1) */}
          <div className="space-y-1 opacity-60">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-400">Timbre Embedding Weight (w_timbre) — v2 Phase</span>
              <span className="font-mono text-slate-400">0.00</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={0}
              disabled
              className="w-full accent-slate-600 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Safety & Local-First Policy */}
      <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400 space-y-2">
        <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
          Locked Decisions (AGENTS.md)
        </h4>
        <ul className="list-disc list-inside space-y-1 text-slate-400">
          <li>Local only: Audio files and analysis never leave your machine. No telemetry or cloud sync.</li>
          <li>Source audio is strictly read-only: Files are never modified, retagged, or renamed.</li>
          <li>Deterministic DSP: All Camelot key detection, beat tracking, and sequencing is pure Rust CPU-driven.</li>
        </ul>
      </div>
    </div>
  );
}
