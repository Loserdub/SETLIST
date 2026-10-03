import { useEffect, useState } from 'react';
import { useAppStore, DEFAULT_APP_SETTINGS } from '../../store/useAppStore';
import type { AppSettings } from '../../bindings/AppSettings';

const KEY_RELATION_DESCRIPTIONS: Record<number, { same: string; flip: string }> = {
  0: { same: 'Exact match (perfect consonance)', flip: 'Relative switch (high consonance)' },
  1: { same: 'Fifth / Dominant (+1 / -1)', flip: 'Adjacent sector (+1 / -1 with flip)' },
  2: { same: 'Whole-step lift (+2 semitones)', flip: 'Whole-step with mode flip' },
  3: { same: 'Minor third distance (+3)', flip: 'Minor third with mode flip' },
  4: { same: 'Major third distance (+4)', flip: 'Major third with mode flip' },
  5: { same: 'Fourth / Subdominant (+5)', flip: 'Fourth with mode flip' },
  6: { same: 'Tritone (maximum dissonance)', flip: 'Tritone with mode flip' },
};

export function SettingsRoute() {
  const {
    appSettings,
    loadSettings,
    saveSettings,
    updateSettings,
    isLoadingSettings,
    settingsError,
    useMockBackend,
    setUseMockBackend,
    fetchPing,
    pingResult,
    isLoading,
    error,
  } = useAppStore();

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleResetDefaults = () => {
    updateSettings(DEFAULT_APP_SETTINGS);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await saveSettings(appSettings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // error handled in store toast
    } finally {
      setIsSaving(false);
    }
  };

  const updateCostWeight = (key: keyof AppSettings['cost_weights'], val: number) => {
    updateSettings({
      cost_weights: {
        ...appSettings.cost_weights,
        [key]: val,
      },
    });
  };

  const updateKeyPenalty = (distance: number, field: 'same_mode' | 'mode_flip', val: number) => {
    const updated = appSettings.key_penalties.map((row) => {
      if (row.distance === distance) {
        return { ...row, [field]: val };
      }
      return row;
    });
    updateSettings({ key_penalties: updated });
  };

  const updateEnergyModel = (field: keyof AppSettings['energy_model'], val: number) => {
    updateSettings({
      energy_model: {
        ...appSettings.energy_model,
        [field]: val,
      },
    });
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-[#080808] text-[#ededed] p-6 space-y-6 max-w-5xl">
      {/* Header & Global Save Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1c1c1c] pb-5">
        <div>
          <h2 className="text-xs font-mono font-bold tracking-wider text-white uppercase">
            Application Settings
          </h2>
          <p className="text-xs text-[#71717a] mt-0.5">
            Tune sequencing cost weights, Camelot penalty matrices, energy trajectory parameters, and worker threads. Persisted to SQLite.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isLoadingSettings || isSaving}
            className="px-3.5 py-1.5 bg-[#101010] hover:bg-[#181818] border border-[#242424] text-[#a1a1aa] hover:text-white text-xs font-mono uppercase tracking-wider rounded-none transition-colors cursor-pointer disabled:opacity-40"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isLoadingSettings || isSaving}
            className="px-4 py-1.5 bg-[#ededed] hover:bg-white disabled:opacity-40 text-black text-xs font-mono font-bold uppercase tracking-wider rounded-none flex items-center gap-2 transition-colors cursor-pointer"
          >
            {isSaving ? (
              <span>Saving...</span>
            ) : saveSuccess ? (
              <span>✓ Saved</span>
            ) : (
              <span>Save Settings</span>
            )}
          </button>
        </div>
      </div>

      {settingsError && (
        <div className="p-3 rounded-none bg-[#1c0808] border border-[#7f1d1d] text-[#fca5a5] text-xs font-mono">
          Failed to load/save settings: {settingsError}
        </div>
      )}

      {/* 1. Transition Cost Model Weights */}
      <div className="p-5 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none space-y-5">
        <div className="border-b border-[#161616] pb-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#a1a1aa]">
            Transition Cost Model Weights
          </h3>
          <p className="text-[11px] text-[#71717a] mt-0.5 font-mono">
            Objective weights in C_ij = w_tempo·Φ_tempo + w_key·Φ_key + w_energy·Φ_energy + w_timbre·Φ_timbre
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tempo Weight */}
          <div className="p-3 bg-[#050505] border border-[#1c1c1c] rounded-none space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#a1a1aa]">Tempo Discrepancy (w_tempo)</span>
              <span className="text-white font-bold">{appSettings.cost_weights.tempo.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={appSettings.cost_weights.tempo}
              onChange={(e) => updateCostWeight('tempo', parseFloat(e.target.value))}
              className="w-full accent-white cursor-pointer"
            />
            <p className="text-[10px] font-mono text-[#555555]">Normalizes tempo step |BPM_i - BPM_j| / 6 with octave detection.</p>
          </div>

          {/* Key Distance Weight */}
          <div className="p-3 bg-[#050505] border border-[#1c1c1c] rounded-none space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#a1a1aa]">Key Distance (w_key)</span>
              <span className="text-white font-bold">{appSettings.cost_weights.key.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={appSettings.cost_weights.key}
              onChange={(e) => updateCostWeight('key', parseFloat(e.target.value))}
              className="w-full accent-white cursor-pointer"
            />
            <p className="text-[10px] font-mono text-[#555555]">Penalizes harmonic dissonance using the Camelot penalty matrix.</p>
          </div>

          {/* Energy Weight */}
          <div className="p-3 bg-[#050505] border border-[#1c1c1c] rounded-none space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#a1a1aa]">Energy Trajectory (w_energy)</span>
              <span className="text-white font-bold">{appSettings.cost_weights.energy.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={appSettings.cost_weights.energy}
              onChange={(e) => updateCostWeight('energy', parseFloat(e.target.value))}
              className="w-full accent-white cursor-pointer"
            />
            <p className="text-[10px] font-mono text-[#555555]">Aligns track transitions with selected energy profile (Linear, Wave, Plateau).</p>
          </div>

          {/* Timbre Weight (v2) */}
          <div className="p-3 bg-[#050505] border border-[#181818] rounded-none opacity-50 space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#71717a]">Timbre Embeddings (w_timbre) — v2 Phase</span>
              <span className="text-[#555555] font-bold">0.00</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={0}
              disabled
              className="w-full accent-neutral-600 cursor-not-allowed"
            />
            <p className="text-[10px] font-mono text-[#555555]">Reserved for deep neural timbre embeddings in v2.</p>
          </div>
        </div>
      </div>

      {/* 2. Camelot Key Penalty Matrix Table */}
      <div className="p-5 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none space-y-4">
        <div className="border-b border-[#161616] pb-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#a1a1aa]">
            Camelot Key Distance Penalty Table (Φ_key)
          </h3>
          <p className="text-[11px] text-[#71717a] mt-0.5 font-mono">
            Lookup penalties for circular Camelot wheel distance d ∈ [0..6] and mode switches per AGENTS.md 6.3.
          </p>
        </div>

        <div className="overflow-x-auto border border-[#1c1c1c] bg-[#050505]">
          <table className="w-full text-left text-xs text-[#cccccc]">
            <thead className="bg-[#0a0a0a] text-[#71717a] font-mono font-semibold border-b border-[#1c1c1c] uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Distance (d)</th>
                <th className="py-2.5 px-3">Harmonic Move</th>
                <th className="py-2.5 px-3">Same Mode Penalty</th>
                <th className="py-2.5 px-3">Mode Flip Penalty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#161616] font-mono text-[11px]">
              {appSettings.key_penalties.map((row) => (
                <tr key={row.distance} className="hover:bg-[#0c0c0c] transition-colors">
                  <td className="py-2.5 px-3 font-bold text-white">
                    d = {row.distance}
                  </td>
                  <td className="py-2.5 px-3 text-[#888888]">
                    <div>{KEY_RELATION_DESCRIPTIONS[row.distance]?.same ?? 'Harmonic step'}</div>
                    <div className="text-[10px] text-[#555555]">{KEY_RELATION_DESCRIPTIONS[row.distance]?.flip}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={row.same_mode}
                        onChange={(e) => updateKeyPenalty(row.distance, 'same_mode', parseFloat(e.target.value))}
                        className="w-20 accent-white cursor-pointer"
                      />
                      <span className="w-8 text-right text-white tabular-nums">{row.same_mode.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={row.mode_flip}
                        onChange={(e) => updateKeyPenalty(row.distance, 'mode_flip', parseFloat(e.target.value))}
                        className="w-20 accent-[#fbbf24] cursor-pointer"
                      />
                      <span className="w-8 text-right text-[#fbbf24] tabular-nums">{row.mode_flip.toFixed(2)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Energy Model & Worker Threads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Energy Model Weights */}
        <div className="p-5 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none space-y-4">
          <div className="border-b border-[#161616] pb-2">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#a1a1aa]">
              Energy Trajectory Model
            </h3>
            <p className="text-[11px] text-[#71717a] mt-0.5 font-mono">
              Penalty: min(((E_j - E_i) - dE_target)² / divisor, 1)
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-[#a1a1aa]">Quadratic Divisor</span>
                <span className="text-white font-bold">{appSettings.energy_model.divisor.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="4"
                max="32"
                step="1"
                value={appSettings.energy_model.divisor}
                onChange={(e) => updateEnergyModel('divisor', parseFloat(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
              <p className="text-[10px] font-mono text-[#555555] mt-1">Default 16.0 per AGENTS.md 6.3 normalization.</p>
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-[#a1a1aa]">Linear Ramp Target Step (dE)</span>
                <span className="text-white font-bold">+{appSettings.energy_model.target_step.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={appSettings.energy_model.target_step}
                onChange={(e) => updateEnergyModel('target_step', parseFloat(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
              <p className="text-[10px] font-mono text-[#555555] mt-1">Target energy gain between consecutive tracks in a ramp profile.</p>
            </div>
          </div>
        </div>

        {/* Worker Threads & Concurrency */}
        <div className="p-5 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none space-y-4">
          <div className="border-b border-[#161616] pb-2">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#a1a1aa]">
              Worker Threads & Concurrency
            </h3>
            <p className="text-[11px] text-[#71717a] mt-0.5 font-mono">
              Concurrent threads for audio library scanning and DSP analysis.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-[#a1a1aa]">Background Worker Count</span>
                <span className="text-white font-bold">{appSettings.worker_count} Threads</span>
              </div>
              <input
                type="range"
                min="1"
                max="16"
                step="1"
                value={appSettings.worker_count}
                onChange={(e) => updateSettings({ worker_count: parseInt(e.target.value, 10) })}
                className="w-full accent-white cursor-pointer"
              />
              <p className="text-[10px] font-mono text-[#555555] mt-1">Parallelism used by Rayon and the folder scanner worker pool.</p>
            </div>

            <div className="p-2.5 bg-[#050505] border border-[#1c1c1c] text-[10px] font-mono text-[#71717a] space-y-0.5">
              <div className="font-semibold text-[#a1a1aa]">Structured Logging:</div>
              <div>File: <span className="text-white">app_data/setlist.log</span></div>
              <div>Captures background analysis jobs, sequencing runs, and database migrations.</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Backend Selection & Ping Verification */}
      <div className="p-5 bg-[#0a0a0a] border border-[#1c1c1c] rounded-none space-y-4">
        <div className="border-b border-[#161616] pb-2">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#a1a1aa]">
            Backend Provider & Tauri IPC Diagnostics
          </h3>
          <p className="text-[11px] text-[#71717a] mt-0.5 font-mono">
            Switch between in-memory mock data (40 demo tracks) and native Tauri IPC backend.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            onClick={() => setUseMockBackend(true)}
            className={`p-3.5 border cursor-pointer transition-colors rounded-none ${
              useMockBackend
                ? 'bg-[#141414] border-[#ededed] text-white'
                : 'bg-[#050505] border-[#1c1c1c] text-[#71717a] hover:border-[#2a2a2a]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-xs uppercase text-white">Mock In-Memory Backend</span>
              {useMockBackend && <span className="text-[10px] font-mono text-[#4ade80]">● ACTIVE</span>}
            </div>
            <p className="text-[11px] text-[#71717a] mt-1">
              40 generated tracks with complete beat grids, 3-band waveforms, cue points, and simulated progress.
            </p>
          </div>

          <div
            onClick={() => setUseMockBackend(false)}
            className={`p-3.5 border cursor-pointer transition-colors rounded-none ${
              !useMockBackend
                ? 'bg-[#141414] border-[#ededed] text-white'
                : 'bg-[#050505] border-[#1c1c1c] text-[#71717a] hover:border-[#2a2a2a]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-xs uppercase text-white">Tauri Native Backend</span>
              {!useMockBackend && <span className="text-[10px] font-mono text-[#4ade80]">● ACTIVE</span>}
            </div>
            <p className="text-[11px] text-[#71717a] mt-1">
              Calls native Rust backend via Tauri IPC (`invoke`) with SQLite persistence, DSP pipeline analysis, and background progress events.
            </p>
          </div>
        </div>

        {/* Backend Ping Verification Section */}
        <div className="pt-3 border-t border-[#181818] space-y-2">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#666666]">
            Tauri IPC Ping Verification
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void fetchPing()}
              disabled={isLoading}
              className="px-3 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#27272a] disabled:opacity-40 text-white text-xs font-mono uppercase tracking-wider rounded-none transition-colors cursor-pointer"
            >
              {isLoading ? 'Pinging...' : 'Send Ping'}
            </button>
            <div className="text-xs font-mono">
              Status:{' '}
              {error ? (
                <span className="text-[#f87171]">{error}</span>
              ) : (
                <span className="text-[#4ade80]" data-testid="ping-result">
                  {pingResult ?? 'Ready'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Safety & Local-First Policy */}
      <div className="p-4 bg-[#0a0a0a] border border-[#1c1c1c] text-xs font-mono text-[#71717a] space-y-2 rounded-none">
        <h4 className="font-semibold text-[#a1a1aa] uppercase tracking-wider text-[10px]">
          Locked Decisions (AGENTS.md)
        </h4>
        <ul className="list-disc list-inside space-y-1 text-[#71717a] text-[11px]">
          <li>Local only: Audio files and analysis never leave your machine. No telemetry or cloud sync.</li>
          <li>Source audio is strictly read-only: Files are never modified, retagged, or renamed.</li>
          <li>Deterministic DSP: All Camelot key detection, beat tracking, and sequencing is pure Rust CPU-driven.</li>
        </ul>
      </div>

      {/* Intellectual Property & Licensing */}
      <div className="p-4 bg-[#0a0a0a] border border-[#1c1c1c] text-xs font-mono space-y-2 rounded-none">
        <div className="flex items-center justify-between border-b border-[#181818] pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#555555]" />
            <h4 className="font-bold text-[#e0e0e0] uppercase tracking-widest text-[11px]">
              TRUSTNODELOGIC
            </h4>
          </div>
          <span className="text-[10px] text-[#666666] tracking-wider uppercase border border-[#222222] px-1.5 py-0.5 bg-[#111111]">
            Proprietary IP
          </span>
        </div>
        <p className="text-[#888888] text-[11px] leading-relaxed">
          All system architecture, harmonic compatibility models, transition heuristics, audio analysis pipelines, and user interface implementations are the proprietary intellectual property of <strong className="text-[#cccccc]">TRUSTNODELOGIC</strong>.
        </p>
        <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-[#555555] tracking-wide gap-1">
          <span>© 2026 TRUSTNODELOGIC. All Rights Reserved.</span>
          <span>Unauthorized copying, reverse engineering, or distribution strictly prohibited.</span>
        </div>
      </div>
    </div>
  );
}
