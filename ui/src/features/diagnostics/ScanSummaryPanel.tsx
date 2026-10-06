import { useState, useEffect } from 'react';
import {
  type ScanSummary,
  type FailedScanFile,
  getLatestScanSummary,
  subscribeScanSummary,
  copyFailedFilesList,
} from './scanSummary';

interface ScanSummaryPanelProps {
  summary?: ScanSummary | null;
  onDismiss?: () => void;
}

export function ScanSummaryPanel({ summary: propSummary, onDismiss }: ScanSummaryPanelProps) {
  const [activeSummary, setActiveSummary] = useState<ScanSummary | null>(
    propSummary ?? getLatestScanSummary()
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (propSummary !== undefined) {
      setActiveSummary(propSummary);
      return;
    }

    setActiveSummary(getLatestScanSummary());
    const unsubscribe = subscribeScanSummary((newSummary) => {
      setActiveSummary(newSummary);
    });
    return unsubscribe;
  }, [propSummary]);

  if (!activeSummary) {
    return (
      <div
        data-testid="scan-summary-empty"
        className="p-4 bg-surface-panel border border-border-subtle text-xs font-mono text-content-muted"
      >
        No scan has been run yet in this session.
      </div>
    );
  }

  const { analyzed, skipped, failed, failedFiles } = activeSummary;

  const handleCopyList = async () => {
    if (failedFiles.length === 0) return;
    const success = await copyFailedFilesList(failedFiles);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      role="region"
      aria-label="Scan Summary"
      data-testid="scan-summary-panel"
      className="p-5 bg-surface-panel border border-border-subtle space-y-4 font-mono text-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">
            Library Scan Summary
          </h3>
          <p className="text-xs text-content-muted mt-0.5">
            Results of the latest folder scan and analysis pass.
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss scan summary"
            className="px-2.5 py-1 text-xs text-content-muted hover:text-white bg-surface-panel hover:bg-surface-elevated border border-border-base transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Analyzed */}
        <div className="p-3 bg-surface-deep border border-border-subtle flex flex-col justify-between">
          <span className="text-content-muted text-xs">Analyzed</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-white" data-testid="count-analyzed">
              {analyzed}
            </span>
            <span className="text-xs text-status-success">new tracks</span>
          </div>
        </div>

        {/* Skipped */}
        <div className="p-3 bg-surface-deep border border-border-subtle flex flex-col justify-between">
          <span className="text-content-muted text-xs">Skipped</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-content-secondary" data-testid="count-skipped">
              {skipped}
            </span>
            <span className="text-xs text-content-muted">already in library</span>
          </div>
        </div>

        {/* Failed */}
        <div className="p-3 bg-surface-deep border border-border-subtle flex flex-col justify-between">
          <span className="text-content-muted text-xs">Failed</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-lg font-bold ${failed > 0 ? 'text-status-danger' : 'text-white'}`}
              data-testid="count-failed"
            >
              {failed}
            </span>
            <span className={`text-xs ${failed > 0 ? 'text-status-danger' : 'text-content-muted'}`}>
              {failed === 1 ? 'file failed' : 'files failed'}
            </span>
          </div>
        </div>
      </div>

      {/* Failed Files List */}
      {failed > 0 ? (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-status-danger uppercase tracking-wider">
              Failed Files ({failedFiles.length})
            </span>
            <button
              type="button"
              onClick={() => void handleCopyList()}
              className="px-3 py-1.5 bg-surface-raised hover:bg-surface-elevated text-white border border-border-base text-xs uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
              data-testid="copy-failed-list-btn"
            >
              {copied ? '✓ Copied' : 'Copy List'}
            </button>
          </div>

          <div
            className="max-h-60 overflow-y-auto border border-border-subtle bg-surface-deep divide-y divide-border-subtle"
            data-testid="failed-files-list"
          >
            {failedFiles.map((file: FailedScanFile, idx: number) => (
              <div key={`${file.fileName}-${idx}`} className="p-2.5 space-y-1">
                <div className="font-semibold text-white break-all">{file.fileName}</div>
                <div className="text-xs text-status-danger">{file.reason}</div>
                {file.rawError && file.rawError !== file.reason && (
                  <div className="text-xs text-content-muted break-all">{file.rawError}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 bg-surface-deep border border-border-base text-status-success text-xs">
          ✓ All scanned files were processed successfully without errors.
        </div>
      )}
    </div>
  );
}
