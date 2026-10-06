import React from 'react';
import type { TrackAnalysis } from '../../bindings/TrackAnalysis';

export interface TrackTelemetryStripProps {
  analysis?: TrackAnalysis | null;
  keyStr: string;
}

export const TrackTelemetryStrip: React.FC<TrackTelemetryStripProps> = ({
  analysis,
  keyStr,
}) => {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 bg-surface-panel border border-border-subtle divide-y sm:divide-y-0 sm:divide-x divide-border-subtle select-none"
      data-testid="track-metrics-row"
    >
      {/* BPM / Tempo */}
      <div className="p-3.5">
        <div className="te-silkscreen">
          Tempo (BPM)
        </div>
        <div className="text-2xl font-mono font-bold text-white te-num tabular-nums mt-1 flex items-baseline gap-1">
          <span data-testid="track-bpm-value">{analysis?.rhythm.grid.bpm.toFixed(1) ?? '-'}</span>
          <span className="te-unit text-content-muted">BPM</span>
        </div>
        <div className="text-xs font-mono text-content-muted mt-1">
          {analysis?.rhythm.grid.steady ? 'Steady grid' : 'Variable tempo'}
        </div>
      </div>

      {/* Camelot Key & Tuning */}
      <div className="p-3.5">
        <div className="te-silkscreen">
          Key & Mode
        </div>
        <div className="text-2xl font-mono font-bold text-white te-num mt-1 flex items-center gap-2">
          <span>{keyStr}</span>
          <span className="text-xs font-normal text-content-muted">({analysis?.key.mode ?? '-'})</span>
        </div>
        <div className="text-xs font-mono text-content-muted mt-1 te-num">
          {analysis?.key.tuning_cents !== undefined
            ? `${analysis.key.tuning_cents > 0 ? '+' : ''}${analysis.key.tuning_cents.toFixed(1)} cents`
            : '440.0 Hz'}
        </div>
      </div>

      {/* Energy Rating */}
      <div className="p-3.5">
        <div className="te-silkscreen">
          Energy Rating
        </div>
        <div className="text-2xl font-mono font-bold text-content-primary te-num mt-1" data-testid="track-energy-value">
          {analysis?.energy_score ?? '-'}<span className="text-xs text-content-muted font-mono ml-0.5">/10</span>
        </div>
        <div className="w-full bg-surface-raised h-1.5 mt-2.5 flex items-center gap-[2px]">
          {Array.from({ length: 10 }).map((_, i) => {
            const active = i < (analysis?.energy_score ?? 5);
            return (
              <div
                key={i}
                className={`flex-1 h-full rounded-[1px] transition-colors ${
                  active
                    ? (analysis?.energy_score ?? 5) >= 8
                      ? 'bg-rose-500'
                      : (analysis?.energy_score ?? 5) >= 5
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                    : 'bg-surface-hover'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Integrated Loudness */}
      <div className="p-3.5">
        <div className="te-silkscreen">
          Loudness
        </div>
        <div className="text-2xl font-mono font-bold text-white te-num tabular-nums mt-1">
          {analysis?.loudness.integrated_lufs.toFixed(1) ?? '-'}{' '}
          <span className="te-unit text-content-muted">LUFS</span>
        </div>
        <div className="text-xs font-mono text-content-muted mt-1 te-num">
          LRA: {analysis?.loudness.loudness_range.toFixed(1) ?? '-'} LU · Peak: {analysis?.loudness.true_peak.toFixed(1) ?? '-'} dBTP
        </div>
      </div>
    </div>
  );
};
