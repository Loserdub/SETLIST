import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { CostWeights } from '../../bindings/CostWeights';
import type { SetlistPins, PreferredTransitionPreset } from './types';
import { formatDurationMs } from './roles';
import {
  IconSparkles,
  IconLock,
  IconClock,
  IconPlus,
} from '../../components/icons';

interface ConstraintCockpitProps {
  totalDurationMs: number;
  targetDurationMinutes: number;
  onSetTargetDurationMinutes: (minutes: number) => void;
  energyProfile: EnergyProfile;
  onSetEnergyProfile: (profile: EnergyProfile) => void;
  pins: SetlistPins;
  onToggleLockFirst: () => void;
  onToggleLockLast: () => void;
  costWeights: CostWeights;
  onSelectWeightsPreset: (preset: PreferredTransitionPreset) => void;
  isSuggesting: boolean;
  onSuggestOrder: () => void;
  onCancelSuggest?: () => void;
  onRegenerateUnlocked?: () => void;
  onOpenTrackSelector: () => void;
  trackCount: number;
  excludedCount?: number;
}

export function ConstraintCockpit({
  totalDurationMs,
  targetDurationMinutes,
  onSetTargetDurationMinutes,
  energyProfile,
  onSetEnergyProfile,
  pins,
  onToggleLockFirst,
  onToggleLockLast,
  costWeights,
  onSelectWeightsPreset,
  isSuggesting,
  onSuggestOrder,
  onCancelSuggest,
  onRegenerateUnlocked,
  onOpenTrackSelector,
  trackCount,
  excludedCount = 0,
}: ConstraintCockpitProps) {
  const targetMs = targetDurationMinutes * 60 * 1000;
  const timeDiffMs = targetMs - totalDurationMs;
  const progressPercent = Math.min(100, targetMs > 0 ? (totalDurationMs / targetMs) * 100 : 0);

  // Active weights preset detection
  const activePreset: PreferredTransitionPreset =
    costWeights.key >= 0.55
      ? 'Harmonic'
      : costWeights.energy >= 0.55
      ? 'Energy'
      : costWeights.tempo >= 0.55
      ? 'Tempo'
      : 'Balanced';

  return (
    <div className="bg-surface-panel border-b border-border-subtle p-3.5 space-y-3 shrink-0">
      {/* Upper Bar: Duration Gauge & Primary Suggest Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Duration Gauge with Visual Progress Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-amber-400">
              <IconClock size={13} />
            </span>
            <span className="text-content-muted uppercase font-semibold">TARGET DURATION:</span>
            <select
              aria-label="Target Duration"
              value={targetDurationMinutes}
              onChange={(e) => onSetTargetDurationMinutes(Number(e.target.value))}
              className="bg-surface-raised border border-border-base text-white text-xs font-mono px-2 py-0.5 focus:outline-none focus:border-accent-blue cursor-pointer"
            >
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min (Standard Set)</option>
              <option value={75}>75 min</option>
              <option value={90}>90 min (Extended Set)</option>
              <option value={120}>120 min (Marathon)</option>
            </select>
          </div>

          {/* Time Progress Readout */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-white font-bold te-num tabular-nums">
              {formatDurationMs(totalDurationMs)}
            </span>
            <span className="text-content-dim">/</span>
            <span className="text-content-muted te-num tabular-nums">
              {targetDurationMinutes}:00
            </span>
            <span className="text-content-dim">|</span>
            <span
              className={`te-num tabular-nums text-xs font-medium ${
                timeDiffMs > 0 ? 'text-accent-blue' : 'text-amber-400'
              }`}
            >
              {timeDiffMs > 0
                ? `-${formatDurationMs(timeDiffMs)} needed`
                : `+${formatDurationMs(Math.abs(timeDiffMs))} over`}
            </span>
          </div>

          {/* Mini Progress Bar */}
          <div className="w-24 bg-surface-elevated h-1.5 overflow-hidden border border-border-base hidden sm:block">
            <div
              className={`h-full transition-all duration-300 ${
                progressPercent >= 100
                  ? 'bg-amber-400'
                  : 'bg-linear-to-r from-sky-400 to-indigo-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Right: Actions - Select Tracks & Suggest Order */}
        <div className="flex items-center gap-2">
          {/* Select Tracks Button */}
          <button
            type="button"
            onClick={onOpenTrackSelector}
            className="px-2.5 py-1 bg-surface-raised hover:bg-surface-elevated text-accent-blue border border-border-base hover:border-accent-blue text-xs font-mono uppercase tracking-wider font-semibold transition-colors cursor-pointer flex items-center gap-1.5 rounded-none hw-btn"
            title="Browse library and add tracks to set"
          >
            <IconPlus size={12} />
            <span>Select Tracks</span>
            <span className="px-1.5 py-0.5 bg-surface-elevated text-white text-xs rounded-none border border-border-base">
              {trackCount}
            </span>
          </button>

          {/* Regenerate Unlocked Tracks */}
          {onRegenerateUnlocked && trackCount >= 3 && (pins.lockFirst || pins.lockLast || pins.pinnedIds?.length) && (
            <button
              type="button"
              onClick={onRegenerateUnlocked}
              disabled={isSuggesting}
              className="px-2.5 py-1 bg-surface-raised hover:bg-surface-hover text-content-primary border border-border-base text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer rounded-none disabled:opacity-40"
              title="Re-order unpinned tracks while keeping all pinned tracks locked at exact positions"
            >
              <span>Regen Unlocked</span>
            </button>
          )}

          {/* Primary Suggest Order Button */}
          <button
            type="button"
            onClick={onSuggestOrder}
            disabled={trackCount < 2 || isSuggesting}
            className="px-3.5 py-1 bg-surface-hover hover:bg-accent-blue-dim text-accent-blue hover:text-white border border-accent-blue/60 text-xs font-mono uppercase tracking-wider font-bold transition-colors cursor-pointer flex items-center gap-1.5 rounded-none disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
            title="Auto-optimize setlist sequence respecting locked pins and energy curve"
          >
            <IconSparkles size={12} className={isSuggesting ? 'animate-spin' : ''} />
            <span>{isSuggesting ? 'Optimizing Flow...' : 'Suggest Order'}</span>
          </button>

          {isSuggesting && onCancelSuggest && (
            <button
              type="button"
              onClick={onCancelSuggest}
              className="px-2.5 py-1 bg-surface-raised hover:bg-surface-elevated text-status-danger border border-status-danger/40 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer rounded-none"
              title="Cancel optimization"
            >
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Lower Bar: Architectural Constraints Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border-subtle">
        {/* Left Constraints: Pins, Energy Profile, Preferred Transitions in Unified Hardware Ribbon */}
        <div className="flex flex-wrap items-center bg-surface-panel border border-border-subtle divide-x divide-border-subtle">
          {/* Lock Pins Controls (Opener / Closer) */}
          <div className="flex items-center gap-1 px-2.5 py-1">
            <span className="text-xs font-mono font-semibold text-content-muted uppercase pr-1 flex items-center gap-1">
              <IconLock size={10} />
              <span>PINS:</span>
            </span>
            <button
              type="button"
              onClick={onToggleLockFirst}
              disabled={trackCount <= 1}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
                pins.lockFirst
                  ? 'bg-accent-amber-subtle text-accent-amber border-status-danger'
                  : 'bg-transparent text-content-muted hover:text-content-primary border-transparent'
              }`}
              title="Lock opening track in first position"
            >
              <span>Lock Opener</span>
            </button>

            <button
              type="button"
              onClick={onToggleLockLast}
              disabled={trackCount <= 1}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
                pins.lockLast
                  ? 'bg-accent-amber-subtle text-accent-amber border-status-danger'
                  : 'bg-transparent text-content-muted hover:text-content-primary border-transparent'
              }`}
              title="Lock closing track in last position"
            >
              <span>Lock Closer</span>
            </button>
          </div>

          {/* Energy Profile Selector (Strictly retaining exact names for existing tests) */}
          <div className="flex items-center gap-0.5 px-2.5 py-1">
            <span className="text-xs font-mono font-semibold text-content-muted uppercase pr-1">ARC:</span>
            <button
              type="button"
              onClick={() => onSetEnergyProfile('LinearRamp')}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
                energyProfile === 'LinearRamp'
                  ? 'bg-surface-elevated text-white border-border-strong'
                  : 'bg-transparent text-content-muted hover:text-content-primary border-transparent'
              }`}
              title="Linear Ramp: steady gradual energy build"
            >
              Linear Ramp
            </button>
            <button
              type="button"
              onClick={() => onSetEnergyProfile('Wave')}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
                energyProfile === 'Wave'
                  ? 'bg-surface-elevated text-white border-border-strong'
                  : 'bg-transparent text-content-muted hover:text-content-primary border-transparent'
              }`}
              title="Wave: alternating peaks and breathers"
            >
              Wave
            </button>
            <button
              type="button"
              onClick={() => onSetEnergyProfile('PeakPlateau')}
              className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
                energyProfile === 'PeakPlateau'
                  ? 'bg-surface-elevated text-white border-border-strong'
                  : 'bg-transparent text-content-muted hover:text-content-primary border-transparent'
              }`}
              title="Plateau: rapid ramp to sustained high peak groove"
            >
              Plateau
            </button>
          </div>

          {/* Preferred Transitions / Weight Tuning Presets */}
          <div className="flex items-center gap-0.5 px-2.5 py-1">
            <span className="text-xs font-mono font-semibold text-content-muted uppercase pr-1">
              PREFERENCE:
            </span>
            {(['Balanced', 'Harmonic', 'Energy', 'Tempo'] as PreferredTransitionPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onSelectWeightsPreset(p)}
                className={`px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer border rounded-none ${
                  activePreset === p
                    ? 'bg-surface-elevated text-accent-blue border-border-strong font-semibold'
                    : 'bg-transparent text-content-muted hover:text-white border-transparent'
                }`}
                title={`Prioritize ${p} matching in transition cost model`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Right Info: Track Exclusions Indicator */}
        {excludedCount > 0 && (
          <div className="text-xs font-mono text-neutral-400 bg-neutral-900/60 px-2.5 py-1 border border-neutral-800">
            <span>{excludedCount} track{excludedCount === 1 ? '' : 's'} excluded from solver</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConstraintCockpit;
