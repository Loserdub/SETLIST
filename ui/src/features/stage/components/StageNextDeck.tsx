import React from 'react';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';
import { isFieldOverridden } from '../../track/overrides';
import { FOUR_POINT_CUE_CONFIG, CUE_SLOTS, formatCueTime } from '../../track/cues';
import { MetricCard } from './MetricCard';

export interface StageNextDeckProps {
  nextEntry: SetlistEntry;
  stageCurrentIndex: number;
  totalTracks: number;
  trackTitle: (entry: SetlistEntry | null) => string;
  trackArtist: (entry: SetlistEntry | null) => string;
  trackBpm: (entry: SetlistEntry | null) => string;
  trackKey: (entry: SetlistEntry | null) => string;
  trackEnergy: (entry: SetlistEntry | null) => string;
  nextCues: Record<string, { timeMs: number } | null | undefined>;
}

export const StageNextDeck: React.FC<StageNextDeckProps> = ({
  nextEntry,
  stageCurrentIndex,
  totalTracks,
  trackTitle,
  trackArtist,
  trackBpm,
  trackKey,
  trackEnergy,
  nextCues,
}) => {
  return (
    <section
      className="lg:col-span-4 flex flex-col justify-between p-5 lg:p-6 bg-surface-deep border border-border-base border-t-2 border-t-zinc-600 shadow-lg min-w-0"
      data-testid="stage-next-track"
    >
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-400 ring-2 ring-zinc-500/30" />
            <span className="text-xs font-mono font-black uppercase tracking-widest text-content-secondary">
              UP NEXT
            </span>
          </div>
          <span className="text-xs font-mono text-content-muted">
            TRACK {stageCurrentIndex + 2} / {totalTracks}
          </span>
        </div>

        <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-content-primary tracking-tight leading-tight line-clamp-2 break-words mt-3">
          {trackTitle(nextEntry)}
        </h3>
        {trackArtist(nextEntry) && (
          <p className="text-base sm:text-lg font-medium text-content-muted mt-1 truncate">
            {trackArtist(nextEntry)}
          </p>
        )}

        {/* Next Track Big Hardware Telemetry Grid */}
        <div className="grid grid-cols-3 gap-2.5 mt-5">
          <MetricCard
            label="KEY"
            value={trackKey(nextEntry)}
            accentColor="text-amber-400/95"
            isOverridden={isFieldOverridden(nextEntry?.track, 'key_camelot')}
            overrideField="key_camelot"
          />
          <MetricCard
            label="BPM"
            value={trackBpm(nextEntry)}
            accentColor="text-white/95"
            isOverridden={isFieldOverridden(nextEntry?.track, 'bpm')}
            overrideField="bpm"
          />
          <MetricCard
            label="ENERGY"
            value={trackEnergy(nextEntry)}
            accentColor="text-emerald-400/95"
          />
        </div>

        {/* Next Cue Entry Point Banner */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface-raised border border-border-base font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-content-primary font-bold uppercase tracking-wider">
                NEXT CUE:
              </span>
              {nextCues.A ? (
                <span className="text-emerald-400 font-semibold tracking-wide">
                  IN: CUE A ({formatCueTime(nextCues.A.timeMs)})
                </span>
              ) : (
                <span className="text-content-primary font-semibold">IN: CUE A (00:00)</span>
              )}
            </div>
            <span className="text-content-muted text-xs uppercase tracking-wider">
              {FOUR_POINT_CUE_CONFIG.A.role}
            </span>
          </div>

          {/* Next Track Compact Cue Pads */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {CUE_SLOTS.map((slot) => {
              const cue = nextCues[slot];
              const cfg = FOUR_POINT_CUE_CONFIG[slot];
              const timeStr = cue ? formatCueTime(cue.timeMs) : '—:——';

              return (
                <div
                  key={slot}
                  className="flex flex-col items-center justify-center p-2 bg-surface-panel border border-border-subtle text-center font-mono"
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <span
                      className="w-4 h-4 text-xs font-bold text-black flex items-center justify-center rounded-none"
                      style={{ backgroundColor: cfg.colorHex }}
                    >
                      {slot}
                    </span>
                    <span className="text-xs text-content-muted uppercase truncate">
                      {cfg.role}
                    </span>
                  </div>
                  <span className="text-xs text-white tabular-nums font-semibold">
                    {timeStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
