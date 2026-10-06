import React, { useMemo } from 'react';
import type { ProgressEvent } from '../../api';
import { camelotColor, camelotTextColor } from '../../utils/camelotColor';

interface IngestionInstrumentDisplayProps {
  progress: ProgressEvent | null;
  onCancel?: () => void;
  onOpenReport?: () => void;
  skippedCount?: number;
  failedCount?: number;
}

export const IngestionInstrumentDisplay: React.FC<IngestionInstrumentDisplayProps> = ({
  progress,
  onCancel,
  onOpenReport,
  skippedCount = 0,
  failedCount = 0,
}) => {
  if (!progress) return null;

  const current = progress.current ?? 0;
  const total = progress.total ?? 1;
  const percentage = Math.min(100, Math.round((current / (total || 1)) * 100));

  // Build segmented ASCII bar for terminal-style instrument display (24 segments)
  const asciiBar = useMemo(() => {
    const totalSegments = 24;
    const filledSegments = Math.round((percentage / 100) * totalSegments);
    const filled = '█'.repeat(Math.max(0, filledSegments));
    const empty = '░'.repeat(Math.max(0, totalSegments - filledSegments));
    return `${filled}${empty}`;
  }, [percentage]);

  const rawStage = progress.stage?.toUpperCase() ?? 'ANALYZING';
  const stageDisplay =
    rawStage === 'SCANNING' ? 'DISCOVERING' : rawStage === 'DECODING' ? 'DECODING DSP' : 'ANALYZING';

  // Read telemetry values from progress if available or parse from message
  const progAny = progress as unknown as Record<string, unknown>;
  const bpm = typeof progAny.bpm === 'number' ? progAny.bpm : (progress.message?.match(/(\d+\.\d+|\d+) BPM/i)?.[1] ? parseFloat(progress.message.match(/(\d+\.\d+|\d+) BPM/i)![1]) : null);
  const keyName = typeof progAny.key === 'string' ? progAny.key : (progress.message?.match(/KEY:?\s*([A-Ga-g][#b]?\s*(?:minor|major|min|maj))/i)?.[1] ?? null);
  const camelotKey = typeof progAny.camelot === 'string' ? progAny.camelot : (progress.message?.match(/([1-9]|1[0-2])[AB]/)?.[0] ?? null);
  const energy = typeof progAny.energy === 'number' ? progAny.energy : null;
  const lufs = typeof progAny.lufs === 'number' ? progAny.lufs : null;

  const displayBpm = bpm !== null && bpm > 0 ? bpm.toFixed(1) : '—';
  const displayKey = keyName ? keyName.toUpperCase() : '—';
  const displayCamelot = camelotKey ?? '—';
  const displayEnergy = energy !== null && energy > 0 ? energy.toFixed(1) : '—';
  const displayLufs = lufs !== null && lufs > -90 ? `${lufs.toFixed(1)} dB` : '—';

  const camBg = camelotColor(displayCamelot);
  const camFg = camelotTextColor(displayCamelot);

  return (
    <div
      className="p-3 bg-surface-deep border border-border-base font-mono select-none"
      role="region"
      aria-label="Audio Ingestion Instrument Display"
      data-testid="ingestion-instrument-display"
    >
      {/* Top Instrument Header & Status Indicators */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border-base">
        <div className="flex items-center gap-2.5">
          {/* Hardware LED Status Beacon */}
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shadow-[0_0_6px_rgba(245,158,11,0.6)]" />

          <span className="text-xs font-bold tracking-widest text-amber-400 uppercase flex items-center gap-1.5">
            <span>[ INGESTION ENGINE ]</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-100">{stageDisplay}</span>
            <span className="text-zinc-500 text-xs font-normal">({progress.stage}...)</span>
          </span>

          <span className="text-xs px-2 py-0.5 bg-surface-raised border border-border-base text-zinc-300">
            PURE RUST DSP
          </span>
        </div>

        {/* Counter & Percentage Readout */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <span className="text-zinc-100 font-bold tabular-nums te-num">
              {current} / {total}
            </span>
            <span className="text-zinc-500 te-num">({percentage}%)</span>
          </div>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="hw-btn px-2 py-0.5 text-xs uppercase tracking-wider bg-surface-elevated hover:bg-surface-hover text-rose-300 border border-rose-900/60 transition-colors cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none active:translate-y-[1px]"
              title="Cancel audio scan"
            >
              Abort
            </button>
          )}
        </div>
      </div>

      {/* High-Precision Segmented ASCII / LED Progress Bar */}
      <div className="py-2.5 flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
          <span className="tracking-widest uppercase">PIPELINE GAUGES</span>
          <span className="tracking-tight text-amber-400 font-bold te-num">{asciiBar}</span>
        </div>
        <div className="w-full bg-surface-deep border border-border-base h-2 overflow-hidden">
          <div
            className="h-full bg-amber-400 transition-all duration-150"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* 4 Real-time Hardware Instrument Readout Cells */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
        {/* Cell 1: BPM / TEMPO */}
        <div className="p-2.5 bg-surface-panel border border-border-base flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-bold tracking-wider uppercase flex items-center justify-between">
            <span>BPM</span>
            <span className="text-zinc-300">TEMPO</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-lg font-bold text-zinc-100 tabular-nums te-num tracking-tight">
              {displayBpm}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
            <span>STEADY GRID</span>
          </div>
        </div>

        {/* Cell 2: MUSICAL KEY */}
        <div className="p-2.5 bg-surface-panel border border-border-base flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-bold tracking-wider uppercase flex items-center justify-between">
            <span>KEY</span>
            <span className="text-zinc-300">TONAL</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-bold text-zinc-100 tracking-tight truncate">
              {displayKey}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-400 truncate">
            440 Hz · 0¢ DEV
          </div>
        </div>

        {/* Cell 3: CAMELOT CODE */}
        <div className="p-2.5 bg-surface-panel border border-border-base flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-bold tracking-wider uppercase flex items-center justify-between">
            <span>CAM</span>
            <span className="text-zinc-300">WHEEL</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className="inline-flex items-center justify-center font-bold text-xs te-num px-2 py-0.5 rounded-[2px] tracking-tight"
              style={{ backgroundColor: camBg, color: camFg }}
            >
              {displayCamelot}
            </span>
            <span className="text-xs text-zinc-400">HARMONIC</span>
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            {displayCamelot.endsWith('A') ? 'MIN WHEEL' : 'MAJ WHEEL'}
          </div>
        </div>

        {/* Cell 4: ENERGY & LOUDNESS */}
        <div className="p-2.5 bg-surface-panel border border-border-subtle flex flex-col justify-between">
          <div className="text-xs text-content-muted font-bold tracking-wider uppercase flex items-center justify-between">
            <span>ENERGY / LUFS</span>
            <span className="text-accent-amber">DSP</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span className="text-base font-bold text-content-primary tabular-nums">
              {displayEnergy}
              <span className="text-xs font-normal text-content-muted ml-0.5">/ 10</span>
            </span>
            <span className="text-xs text-content-muted font-mono tabular-nums">
              {displayLufs}
            </span>
          </div>
          {/* Micro 10-step LED gauge */}
          <div className="mt-1 flex items-center gap-0.5 h-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((step) => {
              const active = step <= Math.round(parseFloat(displayEnergy) || 0);
              const color =
                step >= 8 ? 'bg-rose-500' : step >= 5 ? 'bg-amber-400' : 'bg-emerald-400';
              return (
                <div
                  key={step}
                  className={`flex-1 h-full rounded-none ${
                    active ? color : 'bg-surface-elevated'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* File Ingest Telemetry Stream Marquee & Ticker */}
      <div className="mt-2.5 pt-2 border-t border-border-base flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 font-mono">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
          <span className="text-amber-400 uppercase shrink-0 font-bold">SOURCE:</span>
          <span className="text-zinc-200 truncate font-mono">
            {progress.message ?? (typeof progAny.fileName === 'string' ? progAny.fileName : 'Reading audio stream container...')}
          </span>
        </div>

        {/* Ingest statistics / duplicate and error counters */}
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <span className="text-emerald-400">
            PROCESSED: <strong className="text-white te-num">{current}</strong>
          </span>

          {skippedCount > 0 && (
            <span
              className="text-amber-400 cursor-help"
              title="Already analyzed with identical BLAKE3 hash. Zero redundant compute."
            >
              DUPLICATES: <strong className="text-white te-num">{skippedCount}</strong>
            </span>
          )}

          {failedCount > 0 && (
            <span
              className="text-rose-400 font-bold cursor-pointer underline flex items-center gap-1"
              onClick={onOpenReport}
              title="Click to view failed file reasons"
            >
              FAILED: <strong className="te-num">{failedCount}</strong>
            </span>
          )}

          {onOpenReport && (skippedCount > 0 || failedCount > 0) && (
            <button
              type="button"
              onClick={onOpenReport}
              className="hw-btn px-2 py-0.5 border border-border-base bg-surface-raised hover:bg-surface-elevated text-zinc-300 hover:text-white uppercase transition-colors cursor-pointer rounded-none focus-visible:ring-1 focus-visible:ring-zinc-400 active:translate-y-[1px]"
            >
              View Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
