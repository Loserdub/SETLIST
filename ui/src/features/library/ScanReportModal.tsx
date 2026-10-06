import React, { useState } from 'react';
import type { ScanSummary, FailedScanFile } from '../diagnostics/scanSummary';

interface ScanReportModalProps {
  summary: ScanSummary;
  isOpen: boolean;
  onClose: () => void;
  onClearErrors?: () => void;
}

export const ScanReportModal: React.FC<ScanReportModalProps> = ({
  summary,
  isOpen,
  onClose,
  onClearErrors,
}) => {
  const [activeTab, setActiveTab] = useState<'failed' | 'duplicates' | 'summary'>('failed');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyErrors = () => {
    const text = summary.failedFiles
      .map((f: FailedScanFile) => `File: ${f.path}\nError: ${f.rawError ?? f.reason}\n`)
      .join('\n---\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-text font-mono"
    >
      <div className="w-full max-w-2xl bg-surface-panel border border-border-base shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border-base flex items-center justify-between bg-surface-deep">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
            <h3 id="scan-report-title" className="text-xs font-bold uppercase tracking-wider text-zinc-100">
              Ingestion & Diagnostics Report
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white border border-border-base bg-surface-raised hover:bg-surface-elevated transition-colors cursor-pointer text-xs focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
            aria-label="Close report"
          >
            ✕
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-border-base bg-surface-deep text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('failed')}
            className={`px-4 py-2 border-b-2 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              activeTab === 'failed'
                ? 'border-rose-500 text-rose-400 bg-rose-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Failed Files ({summary.failedFiles.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('duplicates')}
            className={`px-4 py-2 border-b-2 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              activeTab === 'duplicates'
                ? 'border-amber-400 text-amber-300 bg-amber-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Duplicates Skipped ({summary.skipped})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 border-b-2 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              activeTab === 'summary'
                ? 'border-zinc-300 text-zinc-100 bg-surface-elevated'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Summary Metrics
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs">
          {activeTab === 'failed' && (
            <div>
              {summary.failedFiles.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">
                  <p className="text-emerald-400 font-bold">Zero file ingestion failures.</p>
                  <p className="text-zinc-400 text-xs font-mono mt-1">
                    All discovered candidate audio files parsed and indexed with 100% integrity.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="p-2.5 bg-rose-950/20 border border-rose-900/40 text-rose-300 text-xs font-mono leading-relaxed">
                    <strong>Ingestion Warning:</strong> The following {summary.failedFiles.length} file
                    {summary.failedFiles.length === 1 ? '' : 's'} could not be decoded. Audio was either
                    unsupported, corrupted, or missing a valid container header.
                  </div>

                  {summary.failedFiles.map((f: FailedScanFile, idx: number) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-surface-deep border border-border-base space-y-1"
                    >
                      <div className="flex items-center justify-between text-zinc-100 font-bold">
                        <span className="truncate">{f.fileName}</span>
                        <span className="text-rose-400 text-xs font-mono uppercase border border-rose-500/30 px-1.5 py-0.5 bg-rose-500/10">
                          Decode Failed
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 font-mono truncate" title={f.path}>
                        {f.path}
                      </div>
                      <div className="text-xs text-amber-300/90 pt-1 font-mono">
                        Reason: {f.rawError ?? f.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'duplicates' && (
            <div className="space-y-3">
              <div className="p-2.5 bg-amber-950/20 border border-amber-900/40 text-amber-300 text-xs font-mono leading-relaxed">
                <strong>Intelligent Duplicate Prevention:</strong> SETLIST computes a BLAKE3 content hash over
                every discovered audio file. If a file has already been analyzed at pipeline version v1, it is
                automatically skipped. Zero redundant CPU compute is wasted, and existing cue points or overrides are preserved.
              </div>

              <div className="grid grid-cols-2 gap-2 text-center pt-2">
                <div className="p-3 bg-surface-deep border border-border-base">
                  <div className="text-xs font-mono text-zinc-400 uppercase">Skipped Duplicates</div>
                  <div className="text-xl font-bold text-amber-400 mt-1 te-num">{summary.skipped}</div>
                </div>
                <div className="p-3 bg-surface-deep border border-border-base">
                  <div className="text-xs font-mono text-zinc-400 uppercase">Newly Analyzed</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1 te-num">{summary.analyzed}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'summary' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 bg-surface-deep border border-border-base">
                  <span className="text-xs font-mono text-zinc-400 uppercase">Total Found</span>
                  <div className="text-base font-bold text-zinc-100 mt-0.5 te-num">{summary.totalFound}</div>
                </div>
                <div className="p-2.5 bg-surface-deep border border-border-base">
                  <span className="text-xs font-mono text-zinc-400 uppercase">Analyzed</span>
                  <div className="text-base font-bold text-emerald-400 mt-0.5 te-num">{summary.analyzed}</div>
                </div>
                <div className="p-2.5 bg-surface-deep border border-border-base">
                  <span className="text-xs font-mono text-zinc-400 uppercase">Duplicates</span>
                  <div className="text-base font-bold text-amber-400 mt-0.5 te-num">{summary.skipped}</div>
                </div>
                <div className="p-2.5 bg-surface-deep border border-border-base">
                  <span className="text-xs font-mono text-zinc-400 uppercase">Failed</span>
                  <div className="text-base font-bold text-rose-400 mt-0.5 te-num">{summary.failed}</div>
                </div>
              </div>

              <div className="p-3 bg-surface-deep border border-border-base space-y-1 text-xs font-mono text-zinc-400">
                <div>• Pipeline Engine: Deterministic classical DSP (Rust)</div>
                <div>• Content Hashing: BLAKE3 (file size + first/last 1 MB chunks)</div>
                <div>• Storage Target: Local SQLite (WAL mode, zero telemetry)</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-border-subtle bg-surface-panel flex items-center justify-between text-xs">
          <div>
            {activeTab === 'failed' && summary.failedFiles.length > 0 && (
              <button
                type="button"
                onClick={handleCopyErrors}
                className="px-2.5 py-1 border border-accent-blue-subtle bg-accent-blue-subtle hover:bg-surface-hover text-content-secondary hover:text-white uppercase transition-colors cursor-pointer"
              >
                {copied ? '✓ Copied to Clipboard' : 'Copy Error Details'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onClearErrors && summary.failedFiles.length > 0 && (
              <button
                type="button"
                onClick={onClearErrors}
                className="px-2.5 py-1 text-content-muted hover:text-status-danger uppercase cursor-pointer"
              >
                Dismiss Errors
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1 bg-surface-hover hover:bg-surface-hover text-white uppercase font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
